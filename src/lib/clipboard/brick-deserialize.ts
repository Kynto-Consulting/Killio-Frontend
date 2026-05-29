// Clipboard/DataTransfer → bricks. Order of preference:
//   1. our envelope (application/x-killio-bricks) → lossless
//   2. text/plain markdown → reuse the vault import parser
//   3. text/html → stripped to text, then markdown parser
// Returns ClipboardBrick[] ready to instantiate in any engine.

import type { ClipboardBrick } from "./brick-clipboard.ts";
import { parseEnvelope, recallCopy } from "./brick-clipboard.ts";
import { parseMarkdownToBricks } from "@/lib/local-workspace/markdown-import.ts";
import { parsePlatformClipboard, cleanPlatformHtml } from "./platform-clipboard.ts";
import { htmlToBricks } from "./html-bricks.ts";

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

/** Resolve bricks from a paste/drop DataTransfer (sync). */
export function bricksFromDataTransfer(dt: DataTransfer | null): ClipboardBrick[] {
  if (!dt) return [];
  const env = parseEnvelope(dt.getData("application/x-killio-bricks") || dt.getData("web application/x-killio-bricks"));
  if (env) return env.bricks;
  const plain = dt.getData("text/plain");
  // Same-tab lossless: clipboard stripped our custom MIME, but if the plain text
  // matches the last in-app copy, restore that exact envelope.
  if (plain) { const recalled = recallCopy(plain); if (recalled) return recalled.bricks; }
  // Exact platform formats: Excalidraw JSON, image items (Miro/OS), Excel/Sheets TSV.
  const platform = parsePlatformClipboard(dt);
  if (platform && platform.length) return platform;
  // External rich HTML (Notion/Word/Docs/web): clean Office cruft, then map the
  // DOM DIRECTLY to native bricks (tables/lists/images/text) — no markdown hop.
  const html = dt.getData("text/html");
  if (html) { const bricks = htmlToBricks(cleanPlatformHtml(html)); if (bricks.length) return bricks; }
  if (plain) return markdownToBricks(plain);
  return [];
}

/** Resolve bricks from a ClipboardEvent (paste). */
export function bricksFromClipboardEvent(e: ClipboardEvent): ClipboardBrick[] {
  return bricksFromDataTransfer(e.clipboardData);
}
