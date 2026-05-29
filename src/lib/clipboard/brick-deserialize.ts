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

/** Strip HTML to plain text (lightweight; full html→bricks fidelity is P4). */
function htmlToText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ");
  const el = document.createElement("div");
  el.innerHTML = html;
  // Convert a few block tags to newlines so the markdown parser segments well.
  el.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  el.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,tr").forEach((n) => n.append("\n"));
  return (el.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
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
  if (plain) return markdownToBricks(plain);
  const html = dt.getData("text/html");
  if (html) return markdownToBricks(htmlToText(html));
  return [];
}

/** Resolve bricks from a ClipboardEvent (paste). */
export function bricksFromClipboardEvent(e: ClipboardEvent): ClipboardBrick[] {
  return bricksFromDataTransfer(e.clipboardData);
}
