/**
 * Rich content of bot messages (`metadata.rich = { version: 1, blocks }`): block types, the backend's limits as editor validation,
 * helpers for the structured editor and the tolerant reader the message renderer uses. Pure, tested in rich.test.ts.
 * Contract: Killio-Backend/src/modules/bots/bot-rich.ts (sanitizeBlocks, RICH_LIMITS).
 *
 * In a script node the strings may hold templates (`{field}` / `{{ expr }}`); the backend renders them BEFORE validating, so a string
 * with a template is only checked for what it can never render to (it is not measured). The renderer reads what the server stored,
 * which is already sanitised; it still ignores anything it does not know.
 */

export const RICH_LIMITS = {
  maxBlocks: 20,
  maxTextLength: 2000,
  maxTitleLength: 256,
  maxListItems: 25,
  maxTableColumns: 8,
  maxTableRows: 25,
  maxCellLength: 200,
  maxEmbedFields: 10,
  maxCodeLength: 4000,
  maxTotalBytes: 16 * 1024,
  maxUrlLength: 2048,
  maxFieldValueLength: 1000,
} as const;

export const BLOCK_TYPES = ["text", "heading", "list", "checklist", "table", "image", "link", "code", "quote", "divider", "embed"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
/** Blocks that need room.embed_links in the room and bots.send_embeds on the bot. */
export const EMBED_BLOCK_TYPES: readonly BlockType[] = ["image", "link", "embed"];

export type RichBlock = { type: BlockType } & Record<string, any>;

export const hasTemplate = (s: unknown): boolean => typeof s === "string" && /\{[^{}]*\}/.test(s);

export type BlockIssueCode =
  | "not_list" | "empty" | "too_many" | "too_large"
  | "type_unknown" | "text_required" | "text_long" | "heading_level" | "items_empty" | "items_many" | "item_required" | "item_long"
  | "columns_range" | "rows_many" | "row_wide" | "cell_long" | "url_required" | "url_https" | "color_format" | "embed_empty"
  | "fields_many" | "field_name" | "field_value" | "timestamp" | "title_long" | "alt_long" | "code_long";

export interface BlockIssue {
  /** `[]` = the whole list, `[2]` = third block, `[2, 1]` = second item / row / field of it. */
  at: number[];
  code: BlockIssueCode;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

function textIssue(out: BlockIssue[], at: number[], value: unknown, max: number, required: boolean, longCode: BlockIssueCode = "text_long"): void {
  const s = str(value).trim();
  if (required && !s) return void out.push({ at, code: "text_required" });
  if (s && !hasTemplate(s) && s.length > max) out.push({ at, code: longCode });
}

function urlIssue(out: BlockIssue[], at: number[], value: unknown, required: boolean): void {
  const s = str(value).trim();
  if (!s) return void (required && out.push({ at, code: "url_required" }));
  if (hasTemplate(s)) return;
  if (s.length > RICH_LIMITS.maxUrlLength || !/^https:\/\/[^\s<>"']+$/i.test(s)) out.push({ at, code: "url_https" });
}

function checkBlock(b: any, i: number, out: BlockIssue[]): void {
  const at = [i];
  if (!b || typeof b !== "object" || Array.isArray(b)) return void out.push({ at, code: "type_unknown" });
  const type = String(b.type ?? "").trim().toLowerCase();
  if (!(BLOCK_TYPES as readonly string[]).includes(type)) return void out.push({ at, code: "type_unknown" });
  switch (type as BlockType) {
    case "text":
    case "quote":
      return textIssue(out, at, b.text, RICH_LIMITS.maxTextLength, true);
    case "heading":
      if (b.level !== undefined && ![1, 2, 3].includes(Number(b.level))) out.push({ at, code: "heading_level" });
      return textIssue(out, at, b.text, RICH_LIMITS.maxTitleLength, true);
    case "list":
    case "checklist": {
      const items = Array.isArray(b.items) ? b.items : [];
      if (items.length === 0) return void out.push({ at, code: "items_empty" });
      if (items.length > RICH_LIMITS.maxListItems) out.push({ at, code: "items_many" });
      items.forEach((it: any, k: number) => {
        const t = type === "checklist" && it && typeof it === "object" ? it.text : it;
        const s = str(t).trim();
        if (!s) out.push({ at: [i, k], code: "item_required" });
        else if (!hasTemplate(s) && s.length > RICH_LIMITS.maxCellLength) out.push({ at: [i, k], code: "item_long" });
      });
      return;
    }
    case "table": {
      const cols = Array.isArray(b.columns) ? b.columns : [];
      if (cols.length < 1 || cols.length > RICH_LIMITS.maxTableColumns) out.push({ at, code: "columns_range" });
      cols.forEach((c: unknown, k: number) => {
        const s = str(c).trim();
        if (!s) out.push({ at: [i, k], code: "item_required" });
        else if (!hasTemplate(s) && s.length > RICH_LIMITS.maxCellLength) out.push({ at: [i, k], code: "cell_long" });
      });
      const rows = Array.isArray(b.rows) ? b.rows : [];
      if (rows.length > RICH_LIMITS.maxTableRows) out.push({ at, code: "rows_many" });
      rows.forEach((r: unknown, k: number) => {
        const cells = Array.isArray(r) ? r : [];
        if (cells.length > cols.length || cells.length > RICH_LIMITS.maxTableColumns) out.push({ at: [i, k], code: "row_wide" });
        if (cells.some((c) => !hasTemplate(c) && str(c).length > RICH_LIMITS.maxCellLength)) out.push({ at: [i, k], code: "cell_long" });
      });
      return;
    }
    case "image":
      urlIssue(out, at, b.url, true);
      if (!hasTemplate(b.alt) && str(b.alt).length > 200) out.push({ at, code: "alt_long" });
      if (!hasTemplate(b.caption) && str(b.caption).length > 300) out.push({ at, code: "alt_long" });
      return;
    case "link":
      urlIssue(out, at, b.url, true);
      if (!hasTemplate(b.title) && str(b.title).length > RICH_LIMITS.maxTitleLength) out.push({ at, code: "title_long" });
      if (!hasTemplate(b.description) && str(b.description).length > 500) out.push({ at, code: "text_long" });
      return;
    case "code":
      return textIssue(out, at, b.code, RICH_LIMITS.maxCodeLength, true, "code_long");
    case "divider":
      return;
    case "embed": {
      const color = b.color === undefined || b.color === null || b.color === "" ? "" : String(b.color);
      if (color && !hasTemplate(color) && !/^#[0-9a-f]{6}$/i.test(color)) out.push({ at, code: "color_format" });
      const fields = Array.isArray(b.fields) ? b.fields : [];
      if (fields.length > RICH_LIMITS.maxEmbedFields) out.push({ at, code: "fields_many" });
      fields.forEach((f: any, k: number) => {
        if (!str(f?.name).trim()) out.push({ at: [i, k], code: "field_name" });
        if (!str(f?.value).trim()) out.push({ at: [i, k], code: "field_value" });
      });
      if (!str(b.title).trim() && !str(b.description).trim() && fields.length === 0) out.push({ at, code: "embed_empty" });
      if (!hasTemplate(b.title) && str(b.title).length > RICH_LIMITS.maxTitleLength) out.push({ at, code: "title_long" });
      if (!hasTemplate(b.description) && str(b.description).length > RICH_LIMITS.maxTextLength) out.push({ at, code: "text_long" });
      urlIssue(out, at, b.url, false);
      urlIssue(out, at, b.imageUrl, false);
      urlIssue(out, at, b.thumbnailUrl, false);
      if (str(b.timestamp).trim() && !hasTemplate(b.timestamp) && Number.isNaN(new Date(str(b.timestamp)).getTime())) out.push({ at, code: "timestamp" });
      return;
    }
  }
}

/** Size the backend measures: the JSON of the (sanitised) blocks in UTF-8. */
export const blocksBytes = (blocks: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(blocks)).length;
  } catch {
    return 0;
  }
};

/** Every problem of a block list (empty = the backend accepts it; `[]` is "no rich content", accepted). */
export function validateBlocks(blocks: unknown): BlockIssue[] {
  if (blocks === undefined || blocks === null) return [];
  if (!Array.isArray(blocks)) return [{ at: [], code: "not_list" }];
  const out: BlockIssue[] = [];
  if (blocks.length > RICH_LIMITS.maxBlocks) out.push({ at: [], code: "too_many" });
  blocks.forEach((b, i) => checkBlock(b, i, out));
  if (blocksBytes(blocks) > RICH_LIMITS.maxTotalBytes) out.push({ at: [], code: "too_large" });
  return out;
}

export const blockIssuesAt = (issues: readonly BlockIssue[], i: number): BlockIssue[] => issues.filter((x) => x.at[0] === i);

/** A new block of a type with the fields the backend requires already present. */
export function blankBlock(type: BlockType): RichBlock {
  switch (type) {
    case "text": case "quote": return { type, text: "" };
    case "heading": return { type, level: 2, text: "" };
    case "list": return { type, ordered: false, items: [""] };
    case "checklist": return { type, items: [{ text: "", checked: false }] };
    case "table": return { type, columns: ["", ""], rows: [] };
    case "image": return { type, url: "", alt: "", caption: "" };
    case "link": return { type, url: "", title: "", description: "" };
    case "code": return { type, language: "", code: "" };
    case "divider": return { type };
    case "embed": return { type, title: "", description: "", color: "", fields: [] };
  }
}

/** Plain-text rendition (what the backend stores in `content` when the script gives no text); used by the preview and the sr-only label. */
export function blocksToPlainText(blocks: readonly RichBlock[], max = 1000): string {
  const lines: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "text": case "quote": case "heading": lines.push(str(b.text)); break;
      case "list": lines.push(...(Array.isArray(b.items) ? b.items : []).map((t: unknown, i: number) => `${b.ordered ? `${i + 1}.` : "-"} ${str(t)}`)); break;
      case "checklist": lines.push(...(Array.isArray(b.items) ? b.items : []).map((t: any) => `[${t?.checked ? "x" : " "}] ${str(t?.text)}`)); break;
      case "table": lines.push((Array.isArray(b.columns) ? b.columns : []).map(str).join(" | "), ...(Array.isArray(b.rows) ? b.rows : []).map((r: unknown) => (Array.isArray(r) ? r : []).map(str).join(" | "))); break;
      case "image": lines.push(str(b.caption) || str(b.alt) || str(b.url)); break;
      case "link": lines.push(b.title ? `${str(b.title)} ${str(b.url)}` : str(b.url)); break;
      case "code": lines.push(str(b.code)); break;
      case "embed": lines.push([str(b.title), str(b.description)].filter(Boolean).join(": ") || (b.fields?.[0] ? `${str(b.fields[0].name)}: ${str(b.fields[0].value)}` : "")); break;
      default: break;
    }
  }
  return lines.filter(Boolean).join("\n").slice(0, max);
}

/** The backend stores the plain-text rendition of the blocks as `content` when the script gives no text: showing both would repeat everything. */
export function isFallbackContent(content: string, blocks: readonly RichBlock[]): boolean {
  if (blocks.length === 0) return false;
  const norm = (s: string) => s.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  const c = norm(content);
  if (!c) return true;
  const f = norm(blocksToPlainText(blocks, 1000));
  return c === f;
}

/* ── helpers of the structured editor ── */

/** `a\nb\n\nc` -> ["a", "b", "c"] (blank lines dropped). */
export const linesToList = (text: string): string[] => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

/** Checklist lines: `[x] done` / `[ ] todo` / `todo`. */
export function linesToChecklist(text: string): Array<{ text: string; checked: boolean }> {
  return linesToList(text).map((l) => {
    const m = /^\[( |x|X)\]\s*(.*)$/.exec(l);
    return m ? { text: m[2], checked: m[1].toLowerCase() === "x" } : { text: l, checked: false };
  });
}
export const checklistToLines = (items: unknown): string => (Array.isArray(items) ? items : []).map((i: any) => `[${i?.checked ? "x" : " "}] ${str(i?.text)}`).join("\n");

/** Table rows, one per line, cells separated by ` | `. */
export const linesToRows = (text: string): string[][] => linesToList(text).map((l) => l.split("|").map((c) => c.trim()));
export const rowsToLines = (rows: unknown): string => (Array.isArray(rows) ? rows : []).map((r: unknown) => (Array.isArray(r) ? r : []).map(str).join(" | ")).join("\n");

/** Embed fields, one per line: `name | value` or `name | value | inline`. */
export function linesToFields(text: string): Array<{ name: string; value: string; inline: boolean }> {
  return linesToList(text).map((l) => {
    const [name = "", value = "", flag = ""] = l.split("|").map((c) => c.trim());
    return { name, value, inline: /^(inline|true|1|yes|si)$/i.test(flag) };
  });
}
export const fieldsToLines = (fields: unknown): string => (Array.isArray(fields) ? fields : []).map((f: any) => [str(f?.name), str(f?.value), f?.inline ? "inline" : ""].filter((x, i) => i < 2 || x).join(" | ")).join("\n");

/* ── what a message carries (renderer) ── */

export interface MessageReplyTo {
  /** Id of the message answered (the invocation, for a command). */
  messageId: string;
  userId: string | null;
  excerpt: string;
}

export interface MessageExtras {
  blocks: RichBlock[];
  /** Raw component rows, read by components.ts. */
  componentRows: unknown[];
  componentsExpiresAt: string | null;
  botId: string | null;
  /** Reply reference written by a bot (`{ messageId, userId, excerpt }`); the people's one (`{ id, content, displayName }`) is read by the message item. */
  replyTo: MessageReplyTo | null;
}

/** Reads the parts of `message.metadata` a bot writes. Tolerant: anything that is not the documented shape is ignored. */
export function readMessageExtras(metadata: unknown): MessageExtras {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, any>;
  const rawBlocks: unknown[] = Array.isArray(m.rich?.blocks) ? m.rich.blocks : [];
  const blocks = rawBlocks.filter((b): b is RichBlock => !!b && typeof b === "object" && (BLOCK_TYPES as readonly string[]).includes((b as any).type)).slice(0, RICH_LIMITS.maxBlocks);
  const rows = Array.isArray(m.components?.rows) ? m.components.rows : [];
  const r = m.replyTo && typeof m.replyTo === "object" ? m.replyTo : null;
  const replyTo = r && typeof r.messageId === "string" ? { messageId: r.messageId, userId: typeof r.userId === "string" ? r.userId : null, excerpt: typeof r.excerpt === "string" ? r.excerpt : "" } : null;
  return {
    blocks,
    componentRows: rows,
    componentsExpiresAt: typeof m.components?.expiresAt === "string" ? m.components.expiresAt : null,
    botId: typeof m.bot?.id === "string" ? m.bot.id : null,
    replyTo,
  };
}

/** Only https links are ever opened from a bot message (the server enforces it; this keeps a hostile row inert). */
export const safeHttpsUrl = (v: unknown): string | null => {
  const s = str(v).trim();
  return /^https:\/\/[^\s<>"']+$/i.test(s) && s.length <= RICH_LIMITS.maxUrlLength ? s : null;
};
