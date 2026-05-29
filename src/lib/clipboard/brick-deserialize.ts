// Clipboard/DataTransfer → bricks. Order of preference:
//   1. our envelope (application/x-killio-bricks) → lossless
//   2. text/plain markdown → reuse the vault import parser
//   3. text/html → stripped to text, then markdown parser
// Returns ClipboardBrick[] ready to instantiate in any engine.

import type { ClipboardBrick } from "./brick-clipboard.ts";
import { parseEnvelope, recallCopy } from "./brick-clipboard.ts";
import { parseMarkdownToBricks } from "@/lib/local-workspace/markdown-import.ts";

/** Markdown text → bricks (external paste). No wiki/asset resolution available. */
export function markdownToBricks(md: string): ClipboardBrick[] {
  if (!md.trim()) return [];
  const parsed = parseMarkdownToBricks(md, {
    resolveWikiLink: () => null, // keep [[..]] as plain text on external paste
    resolveEmbed: (target) => {
      // ![](http...) images become media bricks; local-only embeds drop to text.
      if (/^https?:\/\//i.test(target) || target.startsWith("data:")) {
        const isImg = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(target) || target.startsWith("data:image/");
        return { kind: isImg ? "image" : "file", url: target, title: target.split("/").pop() || "media" };
      }
      return null;
    },
  });
  return parsed.map((b) => ({ kind: b.kind, content: b.content }));
}

/**
 * Structured HTML → Markdown (Notion/Word/web paste). Walks the DOM and emits
 * markdown so the importer produces real bricks (headings, lists, tables, images,
 * quotes, code). Sanitization is by construction — we read structure/text only
 * and never re-inject the source HTML.
 */
function htmlToMarkdown(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ");
  const root = document.createElement("div");
  root.innerHTML = html;

  const inline = (node: Node): string => {
    let s = "";
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === Node.TEXT_NODE) { s += (ch.textContent || "").replace(/\s+/g, " "); return; }
      if (ch.nodeType !== Node.ELEMENT_NODE) return;
      const el = ch as HTMLElement; const tag = el.tagName.toLowerCase();
      if (tag === "br") { s += "\n"; return; }
      if (tag === "strong" || tag === "b") { s += `**${inline(el)}**`; return; }
      if (tag === "em" || tag === "i") { s += `*${inline(el)}*`; return; }
      if (tag === "del" || tag === "s" || tag === "strike") { s += `~~${inline(el)}~~`; return; }
      if (tag === "code") { s += `\`${el.textContent || ""}\``; return; }
      if (tag === "a") { const href = el.getAttribute("href") || ""; s += href ? `[${inline(el)}](${href})` : inline(el); return; }
      if (tag === "img") { const src = el.getAttribute("src") || ""; s += src ? `![${el.getAttribute("alt") || ""}](${src})` : ""; return; }
      s += inline(el);
    });
    return s;
  };

  const blocks: string[] = [];
  const walk = (parent: Node) => {
    parent.childNodes.forEach((ch) => {
      if (ch.nodeType === Node.TEXT_NODE) { const t = (ch.textContent || "").trim(); if (t) blocks.push(t); return; }
      if (ch.nodeType !== Node.ELEMENT_NODE) return;
      const el = ch as HTMLElement; const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) { blocks.push(`${"#".repeat(Number(tag[1]))} ${inline(el)}`); return; }
      if (tag === "p") { const t = inline(el).trim(); if (t) blocks.push(t); return; }
      if (tag === "blockquote") { blocks.push(inline(el).split("\n").map((l) => `> ${l}`).join("\n")); return; }
      if (tag === "pre") { blocks.push("```\n" + (el.textContent || "") + "\n```"); return; }
      if (tag === "ul" || tag === "ol") {
        const ordered = tag === "ol";
        Array.from(el.children).filter((li) => li.tagName.toLowerCase() === "li").forEach((li, idx) => blocks.push(`${ordered ? `${idx + 1}.` : "-"} ${inline(li)}`));
        return;
      }
      if (tag === "table") {
        const rows = Array.from(el.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map((c) => inline(c).replace(/\|/g, "\\|").trim()));
        if (rows.length) {
          const head = rows[0];
          const md = [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`)];
          blocks.push(md.join("\n"));
        }
        return;
      }
      if (tag === "img") { const src = el.getAttribute("src") || ""; if (src) blocks.push(`![${el.getAttribute("alt") || ""}](${src})`); return; }
      if (tag === "hr") { blocks.push("---"); return; }
      // container → recurse
      walk(el);
    });
  };
  walk(root);
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Resolve bricks from a paste/drop DataTransfer (sync). */
export function bricksFromDataTransfer(dt: DataTransfer | null): ClipboardBrick[] {
  if (!dt) return [];
  const env = parseEnvelope(dt.getData("application/x-killio-bricks") || dt.getData("web application/x-killio-bricks"));
  if (env) return env.bricks;
  const plain = dt.getData("text/plain");
  // Same-tab lossless: clipboard stripped our custom MIME, but if the plain text
  // matches the last in-app copy, restore that exact envelope.
  if (plain) { const recalled = recallCopy(plain); if (recalled) return recalled.bricks; }
  // External: prefer rich HTML (structured) over lossy plain text.
  const html = dt.getData("text/html");
  if (html) { const bricks = markdownToBricks(htmlToMarkdown(html)); if (bricks.length) return bricks; }
  if (plain) return markdownToBricks(plain);
  return [];
}

/** Resolve bricks from a ClipboardEvent (paste). */
export function bricksFromClipboardEvent(e: ClipboardEvent): ClipboardBrick[] {
  return bricksFromDataTransfer(e.clipboardData);
}
