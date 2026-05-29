// Brick → Markdown / HTML serializers for the clipboard's external formats
// (text/plain for Obsidian/editors, text/html for Notion/Word/Slack). Inverse
// of markdown-import.ts. Pure.

import type { ClipboardBrick } from "./brick-clipboard.ts";
import { markdownToHtml, inlineMdToHtml as inlineHtml, escHtml } from "./md-html.ts";

function rec(content: unknown): Record<string, unknown> {
  return content && typeof content === "object" ? (content as Record<string, unknown>) : {};
}
function str(v: unknown): string { return typeof v === "string" ? v : ""; }

function mediaUrl(c: Record<string, unknown>): string {
  const url = str(c.url);
  if (url) return url;
  const caption = str(c.caption);
  const m = caption.match(/"url"\s*:\s*"([^"]+)"/);
  return m ? m[1] : "";
}

// ── Markdown ──────────────────────────────────────────────────────────────────

export function brickToMarkdown(b: ClipboardBrick): string {
  const c = rec(b.content);
  const kind = String(b.kind || c.kind || "text").toLowerCase();
  switch (kind) {
    case "text":
    case "draw":
      return str(c.markdown) || str(c.text);
    case "checklist": {
      const items = Array.isArray(c.items) ? c.items : [];
      return items.map((it: any) => `- [${it?.checked ? "x" : " "}] ${str(it?.label)}`).join("\n");
    }
    case "table":
    case "beautiful_table": {
      const rows = Array.isArray(c.rows) ? (c.rows as unknown[][]) : [];
      if (rows.length === 0) return "";
      const cells = rows.map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? "")) : []));
      const head = cells[0] || [];
      const sep = head.map(() => "---");
      const out = [`| ${head.join(" | ")} |`, `| ${sep.join(" | ")} |`, ...cells.slice(1).map((r) => `| ${r.join(" | ")} |`)];
      return out.join("\n");
    }
    case "media": case "image": case "video": case "audio": case "file": case "bookmark": {
      const url = mediaUrl(c);
      const title = str(c.title) || "image";
      return url ? `![${title}](${url})` : "";
    }
    case "accordion":
      return `> [!note] ${str(c.title)}\n> ${str(c.body)}`;
    default:
      return str(c.markdown) || str(c.text) || "";
  }
}

export function bricksToMarkdown(bricks: ClipboardBrick[]): string {
  return bricks.map(brickToMarkdown).filter(Boolean).join("\n\n");
}

// ── HTML ──────────────────────────────────────────────────────────────────────

export function brickToHtml(b: ClipboardBrick): string {
  const c = rec(b.content);
  const kind = String(b.kind || c.kind || "text").toLowerCase();
  switch (kind) {
    case "text": case "draw":
      // Reuse the shared block markdown renderer (headings/lists/quotes/tables/…).
      return markdownToHtml(str(c.markdown) || str(c.text));
    case "checklist": {
      const items = Array.isArray(c.items) ? c.items : [];
      return `<ul>${items.map((it: any) => `<li>${it?.checked ? "☑" : "☐"} ${inlineHtml(str(it?.label))}</li>`).join("")}</ul>`;
    }
    case "table": case "beautiful_table": {
      const rows = Array.isArray(c.rows) ? (c.rows as unknown[][]) : [];
      if (rows.length === 0) return "";
      const tr = (r: unknown[], tag: string) => `<tr>${r.map((x) => `<${tag}>${inlineHtml(String(x ?? ""))}</${tag}>`).join("")}</tr>`;
      return `<table><thead>${tr(rows[0] || [], "th")}</thead><tbody>${rows.slice(1).map((r) => tr(Array.isArray(r) ? r : [], "td")).join("")}</tbody></table>`;
    }
    case "media": case "image": case "video": case "audio": case "file": case "bookmark": {
      const url = mediaUrl(c);
      return url ? `<img src="${escHtml(url)}" alt="${escHtml(str(c.title) || "image")}" />` : "";
    }
    default:
      return `<p>${inlineHtml(str(c.markdown) || str(c.text))}</p>`;
  }
}

export function bricksToHtml(bricks: ClipboardBrick[]): string {
  return `<div>${bricks.map(brickToHtml).filter(Boolean).join("\n")}</div>`;
}
