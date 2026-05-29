// Direct HTML → Killio bricks (no markdown round-trip). Walks the DOM and emits
// native bricks: tables → table brick, checkbox lists → checklist brick, images
// → media brick, headings/paragraphs/quotes/code → text bricks. Inline styling
// is kept as markdown inside text content (the text brick renders it). Used for
// Word/Notion/Google-Docs/web paste where the platform's richest format is HTML.

import type { ClipboardBrick } from "./brick-clipboard.ts";

function inlineMd(node: Node): string {
  let s = "";
  node.childNodes.forEach((ch) => {
    if (ch.nodeType === Node.TEXT_NODE) { s += (ch.textContent || "").replace(/\s+/g, " "); return; }
    if (ch.nodeType !== Node.ELEMENT_NODE) return;
    const el = ch as HTMLElement; const tag = el.tagName.toLowerCase();
    if (tag === "br") { s += "\n"; return; }
    if (tag === "strong" || tag === "b") { const t = inlineMd(el); s += t.trim() ? `**${t}**` : t; return; }
    if (tag === "em" || tag === "i") { const t = inlineMd(el); s += t.trim() ? `*${t}*` : t; return; }
    if (tag === "del" || tag === "s" || tag === "strike") { s += `~~${inlineMd(el)}~~`; return; }
    if (tag === "u") { s += `__${inlineMd(el)}__`; return; }
    if (tag === "code") { s += `\`${el.textContent || ""}\``; return; }
    if (tag === "a") { const href = el.getAttribute("href") || ""; const t = inlineMd(el); s += href ? `[${t}](${href})` : t; return; }
    if (tag === "img") { const src = el.getAttribute("src") || ""; if (src) s += `![${el.getAttribute("alt") || ""}](${src})`; return; }
    s += inlineMd(el);
  });
  return s;
}

const textBrick = (markdown: string, displayStyle = "paragraph"): ClipboardBrick => ({ kind: "text", content: { kind: "text", displayStyle, markdown, childrenByContainer: {} } });

function liIsChecklist(ul: HTMLElement): boolean {
  return !!ul.querySelector('input[type="checkbox"]') || Array.from(ul.children).some((li) => /^\s*\[[ xX]\]/.test(li.textContent || ""));
}

function mediaBrick(src: string, alt: string): ClipboardBrick {
  const isImg = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(src) || src.startsWith("data:image/");
  return { kind: isImg ? "image" : "file", content: { kind: "media", mediaType: isImg ? "image" : "file", url: src, title: alt || "media" } };
}

export function htmlToBricks(html: string): ClipboardBrick[] {
  if (typeof document === "undefined" || !html) return [];
  const root = document.createElement("div");
  root.innerHTML = html;
  const bricks: ClipboardBrick[] = [];

  const walk = (parent: Node) => {
    parent.childNodes.forEach((ch) => {
      if (ch.nodeType === Node.TEXT_NODE) { const t = (ch.textContent || "").trim(); if (t) bricks.push(textBrick(t)); return; }
      if (ch.nodeType !== Node.ELEMENT_NODE) return;
      const el = ch as HTMLElement; const tag = el.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) { const t = inlineMd(el).trim(); if (t) bricks.push(textBrick(`${"#".repeat(Number(tag[1]))} ${t}`, "heading")); return; }
      if (tag === "p") { const t = inlineMd(el).trim(); if (t) bricks.push(textBrick(t)); return; }
      if (tag === "blockquote") { bricks.push(textBrick(inlineMd(el).split("\n").map((l) => `> ${l}`).join("\n"))); return; }
      if (tag === "pre") { bricks.push(textBrick("```\n" + (el.textContent || "") + "\n```")); return; }
      if (tag === "figure" && el.querySelector("img")) { const img = el.querySelector("img")!; bricks.push(mediaBrick(img.getAttribute("src") || "", img.getAttribute("alt") || "")); return; }
      if (tag === "img") { const src = el.getAttribute("src") || ""; if (src) bricks.push(mediaBrick(src, el.getAttribute("alt") || "")); return; }
      if (tag === "hr") { bricks.push({ kind: "divider", content: { kind: "divider" } }); return; }

      if (tag === "ul" || tag === "ol") {
        const lis = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li");
        if (liIsChecklist(el)) {
          const items = lis.map((li, idx) => {
            const cb = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
            const checked = cb ? cb.checked : /^\s*\[[xX]\]/.test(li.textContent || "");
            const label = inlineMd(li).replace(/^\s*\[[ xX]\]\s*/, "").trim();
            return { id: `i${idx}`, label, checked };
          });
          bricks.push({ kind: "checklist", content: { kind: "checklist", items, text: "", title: "", body: "", rows: [], childrenByContainer: {} } });
        } else {
          const ordered = tag === "ol";
          const md = lis.map((li, idx) => `${ordered ? `${idx + 1}.` : "-"} ${inlineMd(li).trim()}`).join("\n");
          if (md) bricks.push(textBrick(md));
        }
        return;
      }

      if (tag === "table") {
        const rows = Array.from(el.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map((c) => inlineMd(c).trim()));
        const filtered = rows.filter((r) => r.length > 0);
        if (filtered.length) bricks.push({ kind: "table", content: { rows: filtered, childrenByContainer: {} } });
        return;
      }

      // Container element → recurse into children.
      walk(el);
    });
  };
  walk(root);
  return bricks;
}
