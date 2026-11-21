import { parseAiMarkup, splitAtPartialToolTag } from "../ai-markup.ts";
import { decodeBrickJson, resolveBrickPayload } from "./brick-json.ts";

/** Everything an assistant reply can show as content (tool chips, plans and thinking are NOT content). */
export type AssistantBlock =
  | { type: "markdown"; key: string; text: string }
  | { type: "brick"; key: string; kind: string; title?: string; content: Record<string, unknown> }
  | { type: "brick-fallback"; key: string; title?: string; text: string }
  | { type: "image"; key: string; src: string; title?: string; height?: string }
  | { type: "file"; key: string; fileType: "pdf" | "document"; src: string; title?: string }
  | {
      type: "portal";
      key: string;
      portalType: "iframe" | "document" | "mesh" | "kanban" | "script";
      src: string;
      title?: string;
      height?: string;
      screenshot?: string;
    }
  | { type: "other-asset"; key: string };

export type AssetAttributes = Record<string, string | undefined>;
export type AssetClass = "brick" | "portal" | "image" | "file" | "other";

const PORTAL_TYPES = ["iframe", "document", "mesh", "kanban", "script"];

/** Same routing the chat panel always used: uploads are files, entities/iframes are portals. */
export function classifyAsset(attrs: AssetAttributes | undefined): AssetClass {
  const type = attrs?.type || "";
  const src = attrs?.src || "";
  if (type === "brick") return "brick";
  const isUpload = src.startsWith("/uploads/");
  if (!isUpload && PORTAL_TYPES.includes(type)) return "portal";
  if (type === "img" && src) return "image";
  if ((type === "pdf" || type === "document") && src) return "file";
  return "other";
}

const MAX_FALLBACK_CHARS = 4000;

/** Build the block for one parsed `<asset>` tag. Never throws. */
export function assetToBlock(key: string, attrs: AssetAttributes | undefined, body: string | undefined): AssistantBlock {
  const klass = classifyAsset(attrs);
  const title = attrs?.title || undefined;
  const src = attrs?.src || "";

  if (klass === "brick") {
    const data = decodeBrickJson(body);
    const payload = data ? resolveBrickPayload(attrs?.kind, data) : null;
    if (payload) return { type: "brick", key, kind: payload.kind, title, content: payload.content };
    // Parsed but empty (`{}`) is not worth showing; unparseable text is shown as plain text.
    const text = data ? "" : String(body ?? "").trim().slice(0, MAX_FALLBACK_CHARS);
    return { type: "brick-fallback", key, title, text };
  }
  if (klass === "portal") {
    return {
      type: "portal",
      key,
      portalType: attrs!.type as "iframe" | "document" | "mesh" | "kanban" | "script",
      src,
      title,
      height: attrs?.height || undefined,
      screenshot: attrs?.screenshot || undefined,
    };
  }
  if (klass === "image") return { type: "image", key, src, title, height: attrs?.height || undefined };
  if (klass === "file") return { type: "file", key, fileType: attrs!.type as "pdf" | "document", src, title };
  return { type: "other-asset", key };
}

// ── streaming: never flash a half-written tag ────────────────────────────────

/** Tags whose raw text must never reach the screen (opened but not closed yet). */
const HIDDEN_OPEN_TAGS = [
  "asset", "tool_status", "tool_output", "tool_result", "tool_results", "tool_plan",
  "pre_think", "reasoning", "reflection", "poll", "edit", "contact",
];
/** Every tag name a trailing `<xx` could still become. */
const PREFIX_TAGS = [...HIDDEN_OPEN_TAGS, "invoke", "async_invoke", "tool_call", "batch_invoke", "batch_tool", "think", "thinking"];

const OPEN_TAG_SOURCE = `<(?:${HIDDEN_OPEN_TAGS.join("|")})\\b`;

function codeRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /(`{1,3})[\s\S]*?\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function findOpenTag(source: string): number {
  const ranges = codeRanges(source);
  const re = new RegExp(OPEN_TAG_SOURCE, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const at = m.index;
    if (!ranges.some(([s, e]) => at >= s && at < e)) return at;
  }
  return -1;
}

/**
 * Remove tags that are still being written (or were left unclosed) from a text segment.
 * A complete `<asset ...>...</asset>` is parsed into its own block upstream, so any
 * `<asset` still in a text segment is unfinished or malformed.
 *  - no closing `>` yet: cut from the tag to the end (it is the tail of the stream)
 *  - open tag finished but never closed: while streaming cut to the end (the body is
 *    still arriving); when the message is final drop just the tag and keep the prose
 *  - while streaming, a trailing `<`, `<as`, `<inv`... that can still become a tag is held back
 */
export function stripPartialAssistantTags(content: string, streaming: boolean): { clean: string; partial: boolean } {
  let text = content;
  let partial = false;

  for (let guard = 0; guard < 20; guard++) {
    const at = findOpenTag(text);
    if (at === -1) break;
    const closeAt = text.indexOf(">", at);
    if (closeAt === -1 || streaming) {
      text = text.slice(0, at).trimEnd();
      partial = true;
      break;
    }
    text = text.slice(0, at) + text.slice(closeAt + 1);
    partial = true;
  }

  if (streaming) {
    const tail = text.match(/<([a-z_]*)$/i);
    if (tail && (tail[1] === "" || PREFIX_TAGS.some((tag) => tag.startsWith(tail[1]!.toLowerCase())))) {
      text = text.slice(0, tail.index).trimEnd();
      partial = true;
    }
  }
  return { clean: text, partial };
}

/**
 * A model sometimes MENTIONS the tag in prose ("usando <asset type="brick">:") before the real
 * one. The lazy tag matcher would then pair that prose opener with the real closing tag and
 * swallow everything in between into one undecodable body. Drop an opening tag when another
 * opening tag follows it before any closing `</asset>` (assets never nest).
 */
export function dropOrphanAssetOpenTags(source: string | null | undefined): string {
  let text = String(source ?? "");
  const open = /<asset\b[^>]*>/gi;
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    open.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = open.exec(text)) !== null) {
      if (m[0].endsWith("/>")) continue; // self-closing: complete on its own
      const after = m.index + m[0].length;
      const closeAt = text.slice(after).search(/<\/asset\s*>/i);
      const nextOpen = text.slice(after).search(/<asset\b/i);
      if (nextOpen !== -1 && (closeAt === -1 || nextOpen < closeAt)) {
        text = text.slice(0, m.index) + text.slice(after);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return text;
}

export type AssistantRender = {
  blocks: AssistantBlock[];
  /** Plain text of all markdown blocks (for emptiness checks, copy, aria labels). */
  text: string;
  /** Something visible exists: prose, a brick or any asset. */
  hasContent: boolean;
  /** A tool call is still being written (show a "building" hint, never the raw tag). */
  partialTool: boolean;
  /** An asset (or other hidden) tag is still being written. */
  partialAsset: boolean;
};

/**
 * text -> renderable blocks. Tool call/status/output/plan/thinking tags are consumed by
 * parseAiMarkup and never become content blocks; half-written tags never reach the screen.
 */
export function buildAssistantRender(source: string | null | undefined, opts: { streaming?: boolean } = {}): AssistantRender {
  const streaming = Boolean(opts.streaming);
  const parsed = parseAiMarkup(dropOrphanAssetOpenTags(source));
  const blocks: AssistantBlock[] = [];
  let partialTool = false;
  let partialAsset = false;
  const lastIndex = parsed.blocks.length - 1;

  parsed.blocks.forEach((block, index) => {
    const key = `${block.tag}-${index}`;
    if (block.tag === "text") {
      const tool = splitAtPartialToolTag(block.content ?? "");
      if (tool.hasPartial) partialTool = true;
      // Only the tail of the message can still be arriving.
      const stripped = stripPartialAssistantTags(tool.clean, streaming && index === lastIndex);
      if (stripped.partial) partialAsset = true;
      const text = stripped.clean.trim();
      if (text) blocks.push({ type: "markdown", key, text });
      return;
    }
    if (block.tag === "asset") {
      blocks.push(assetToBlock(key, block.attributes, block.content));
    }
  });

  const visible = blocks.filter((b) => b.type !== "other-asset" && !(b.type === "brick-fallback" && !b.text));
  return {
    blocks: visible,
    text: visible
      .filter((b): b is Extract<AssistantBlock, { type: "markdown" }> => b.type === "markdown")
      .map((b) => b.text)
      .join("\n\n"),
    hasContent: visible.length > 0,
    partialTool,
    partialAsset,
  };
}
