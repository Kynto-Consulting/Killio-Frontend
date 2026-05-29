// Markdown → Killio bricks parser (Obsidian-flavoured). Uses "smart line break"
// block detection: blank lines and block triggers (headings, tables, checklists,
// code fences, standalone embeds, horizontal rules) split the stream into bricks;
// consecutive plain lines coalesce into a single text/paragraph brick.
//
// Inline [[wikilinks]] become Killio @-mention refpills via resolveWikiLink;
// standalone ![[embeds]] / ![](img) become media bricks via resolveEmbed.

export type ImportedBrick = { kind: string; content: Record<string, unknown> };

export type EmbedTarget = { kind: "image" | "video" | "audio" | "file"; url: string; title?: string; mimeType?: string | null };

export interface MarkdownImportHooks {
  /** Resolve [[Target]] / [[Target|alias]] → an inline token (e.g. "@[doc:path:alias]")
   *  or null to keep the original wikilink text. */
  resolveWikiLink: (target: string, alias: string | undefined) => string | null;
  /** Resolve an embed/image target (basename or path) → media info, or null. */
  resolveEmbed: (target: string) => EmbedTarget | null;
}

const WIKILINK_RE = /(!)?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
// Matches an embed token: ![[target|size?]] OR ![alt](url). Used to detect
// embed-only lines (possibly several adjacent embeds) and to extract each.
const EMBED_TOKEN_RE = /!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]|!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const CHECK_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const LIST_RE = /^\s*([-*+]|\d+\.)\s+/;

function uid(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Replace inline [[wikilinks]] (non-embed) with resolved tokens. Embeds left as-is. */
function transformInline(text: string, hooks: MarkdownImportHooks): string {
  return text.replace(WIKILINK_RE, (full, bang, target, alias) => {
    if (bang) return full; // embeds handled at block level
    const token = hooks.resolveWikiLink(String(target).trim(), alias ? String(alias).trim() : undefined);
    return token ?? (alias ? String(alias) : String(target));
  });
}

export function parseMarkdownToBricks(md: string, hooks: MarkdownImportHooks): ImportedBrick[] {
  const bricks: ImportedBrick[] = [];
  const rawLines = md.replace(/\r\n/g, "\n").split("\n");

  // Strip leading YAML front matter — only when `---` is the very first line
  // (Obsidian rule). A `---` after blank lines / mid-document is a horizontal
  // rule, not front matter, so it must NOT be treated as such.
  let start = 0;
  if (rawLines[0]?.trim() === "---") {
    let end = 1;
    while (end < rawLines.length && rawLines[end].trim() !== "---") end += 1;
    if (end < rawLines.length) start = end + 1;
  }
  const lines = rawLines.slice(start);

  let textBuf: string[] = [];
  let checkBuf: Array<{ label: string; checked: boolean }> = [];
  let tableBuf: string[] = [];

  const flushText = () => {
    // Drop trailing blank lines, keep internal newlines (paragraph cohesion).
    while (textBuf.length && textBuf[textBuf.length - 1].trim() === "") textBuf.pop();
    while (textBuf.length && textBuf[0].trim() === "") textBuf.shift();
    if (textBuf.length === 0) return;
    const markdown = textBuf.map((l) => transformInline(l, hooks)).join("\n");
    const isHeading = /^#{1,6}\s/.test(textBuf[0]);
    bricks.push({ kind: "text", content: { kind: "text", displayStyle: isHeading ? "heading" : "paragraph", markdown, childrenByContainer: {} } });
    textBuf = [];
  };
  const flushChecklist = () => {
    if (checkBuf.length === 0) return;
    bricks.push({
      kind: "checklist",
      content: { kind: "checklist", text: "", title: "", body: "", rows: [], childrenByContainer: {},
        items: checkBuf.map((c) => ({ id: uid(), label: transformInline(c.label, hooks), checked: c.checked })) },
    });
    checkBuf = [];
  };
  const flushTable = () => {
    if (tableBuf.length === 0) return;
    // A separator row contains only |, -, :, spaces (e.g. |---|:--:|).
    const isSeparator = (r: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(r) && /-/.test(r);
    const rows = tableBuf
      .filter((r) => !isSeparator(r))
      .map((r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => transformInline(c.trim(), hooks)));
    if (rows.length > 0) bricks.push({ kind: "table", content: { rows, childrenByContainer: {} } });
    tableBuf = [];
  };
  const flushAll = () => { flushText(); flushChecklist(); flushTable(); };

  const pushEmbed = (target: string, alias?: string) => {
    const e = hooks.resolveEmbed(target);
    if (e) {
      bricks.push({ kind: "media", content: { kind: "media", mediaType: e.kind, title: alias || e.title || target, url: e.url, mimeType: e.mimeType ?? null, sizeBytes: null, caption: "" } });
    } else {
      // Unresolved embed → keep a text note so nothing is silently dropped.
      bricks.push({ kind: "text", content: { kind: "text", displayStyle: "paragraph", markdown: `![[${target}]]`, childrenByContainer: {} } });
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block — consume until closing fence.
    const fence = trimmed.match(/^```(.*)$/);
    if (fence) {
      flushAll();
      const langRaw = fence[1].trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { code.push(lines[i]); i += 1; }
      const lang = /^html$/i.test(langRaw) ? "html[preview]" : langRaw; // no html brick yet → preview fence
      bricks.push({ kind: "text", content: { kind: "text", displayStyle: "paragraph", markdown: "```" + lang + "\n" + code.join("\n") + "\n```", childrenByContainer: {} } });
      continue;
    }

    // Embed-only line (one or more adjacent ![[..]] / ![](..)) → media bricks.
    // Handles `![[a.png|336]]![[b.png|333]]` and a trailing `|size` suffix.
    EMBED_TOKEN_RE.lastIndex = 0;
    const stripped = trimmed.replace(EMBED_TOKEN_RE, "").trim();
    if (trimmed.includes("![") && stripped === "") {
      flushAll();
      let m: RegExpExecArray | null;
      EMBED_TOKEN_RE.lastIndex = 0;
      while ((m = EMBED_TOKEN_RE.exec(trimmed)) !== null) {
        const target = (m[1] ?? m[4] ?? "").trim();
        const aliasRaw = (m[2] ?? m[3] ?? "").trim();
        const alias = aliasRaw && !/^\d+$/.test(aliasRaw) ? aliasRaw : undefined; // |336 is a size, not a title
        if (target) pushEmbed(target, alias);
      }
      continue;
    }

    // Checklist item.
    const chk = line.match(CHECK_RE);
    if (chk) { flushText(); flushTable(); checkBuf.push({ label: chk[2], checked: chk[1].toLowerCase() === "x" }); continue; }
    if (checkBuf.length) flushChecklist();

    // Table row.
    if (TABLE_ROW_RE.test(line)) { flushText(); tableBuf.push(line); continue; }
    if (tableBuf.length) flushTable();

    // Horizontal rule → block separator.
    if (HR_RE.test(line)) { flushAll(); continue; }

    // Heading → its own brick.
    if (HEADING_RE.test(trimmed)) { flushAll(); textBuf.push(trimmed); flushText(); continue; }

    // Blank line → end of paragraph.
    if (trimmed === "") { flushText(); continue; }

    // Plain line (paragraph / list line) → accumulate.
    textBuf.push(line);
    void LIST_RE;
  }

  flushAll();
  return bricks;
}
