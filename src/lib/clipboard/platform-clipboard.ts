// Platform-specific clipboard adapters. Instead of one lossy html→markdown for
// everyone, detect the exact format each app writes and parse it precisely:
//  - Excel / Google Sheets → TSV in text/plain → table brick
//  - Excalidraw → JSON ("excalidraw/clipboard") → text/shape bricks
//  - Word / Notion → text/html (mso/Notion cleanup) handled by the html path
//  - Miro / images → image in items / <img> → media brick
// Returns null when no platform format matched (caller falls through to the
// generic envelope → html → markdown chain).

import type { ClipboardBrick } from "./brick-clipboard.ts";

/** Excel / Google Sheets paste a TSV grid in text/plain. → one table brick. */
function tryTsvTable(dt: DataTransfer): ClipboardBrick[] | null {
  const plain = dt.getData("text/plain");
  if (!plain || plain.indexOf("\t") === -1) return null;
  const lines = plain.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  if (lines.length === 0) return null;
  const rows = lines.map((l) => l.split("\t"));
  const cols = rows[0].length;
  // Require a real grid: >=2 columns and consistent-ish width.
  if (cols < 2) return null;
  const consistent = rows.every((r) => Math.abs(r.length - cols) <= 1);
  if (!consistent) return null;
  return [{ kind: "table", content: { rows, childrenByContainer: {} } }];
}

type ExcalidrawEl = { type?: string; text?: string; label?: { text?: string }; x?: number; y?: number; width?: number; height?: number };

/** Excalidraw writes its scene as JSON under custom MIME types (and text/plain
 *  fallback): application/vnd.excalidraw+json / vnd.excalidraw.clipboard+json,
 *  payload shape `{ type:"excalidraw/clipboard", elements:[...] }`. Map text +
 *  labelled shapes to bricks (full shape/arrow → mesh mapping is future). */
function tryExcalidraw(dt: DataTransfer): ClipboardBrick[] | null {
  const raw = dt.getData("application/vnd.excalidraw.clipboard+json")
    || dt.getData("application/vnd.excalidraw+json")
    || dt.getData("application/json")
    || dt.getData("text/plain");
  if (!raw || raw.indexOf("excalidraw") === -1) return null;
  let data: { type?: string; elements?: ExcalidrawEl[] } | null = null;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || !Array.isArray(data.elements)) return null;
  const bricks: ClipboardBrick[] = [];
  for (const el of data.elements) {
    const text = el.text || el.label?.text || "";
    if (el.type === "text" && text) bricks.push({ kind: "text", content: { kind: "text", displayStyle: "paragraph", markdown: text } });
    else if (text) bricks.push({ kind: "text", content: { kind: "text", displayStyle: "paragraph", markdown: text } });
  }
  return bricks.length ? bricks : null;
}

/** Image dragged/copied from Miro/web/OS → media brick (object URL). */
function tryImageItems(dt: DataTransfer): ClipboardBrick[] | null {
  const items = Array.from(dt.items || []).filter((it) => it.kind === "file" && it.type.startsWith("image/"));
  if (items.length === 0) return null;
  const bricks: ClipboardBrick[] = [];
  for (const it of items) {
    const file = it.getAsFile();
    if (file) bricks.push({ kind: "image", content: { kind: "media", mediaType: "image", url: URL.createObjectURL(file), title: file.name || "image", mimeType: file.type } });
  }
  return bricks.length ? bricks : null;
}

/** Strip Word (mso) / Office cruft from HTML before the generic html→markdown. */
export function cleanPlatformHtml(html: string): string {
  return html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, "")
    .replace(/<\/?o:[^>]*>/gi, "")
    .replace(/<xml[\s\S]*?<\/xml>/gi, "")
    .replace(/\sclass="?Mso[^"\s>]*"?/gi, "")
    .replace(/mso-[^:;"']+:[^;"']+;?/gi, "");
}

/** Try platform-specific parsers. Returns bricks or null (fall through). */
export function parsePlatformClipboard(dt: DataTransfer): ClipboardBrick[] | null {
  return tryExcalidraw(dt) || tryImageItems(dt) || tryTsvTable(dt);
}
