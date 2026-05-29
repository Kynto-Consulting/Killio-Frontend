// Portable brick clipboard envelope — the universal bridge between Killio's
// three brick engines (documents, board cards, mesh boards) and the outside
// world. Copy writes 3 MIME types simultaneously:
//   application/x-killio-bricks  → lossless JSON envelope (internal)
//   text/html                    → rendered (Notion/Word/Slack)
//   text/plain                   → markdown (Obsidian/editors)

export const KILLIO_MIME = "application/x-killio-bricks";
export const KILLIO_CLIPBOARD_VERSION = 1 as const;

export type ClipboardEngine = "document" | "board" | "mesh";

export type ClipboardBrick = {
  kind: string;
  content: unknown;
  /** Canvas placement when copied from a mesh (stripped on non-canvas paste). */
  meshMeta?: { x: number; y: number; w?: number; h?: number };
  children?: ClipboardBrick[];
};

export type KillioClipboard = {
  v: typeof KILLIO_CLIPBOARD_VERSION;
  source: { app: "killio"; engine: ClipboardEngine; id: string };
  bricks: ClipboardBrick[];
  /** Inlined small images (data URLs) so copies survive cross-context paste. */
  assets?: Array<{ ref: string; dataUrl: string }>;
};

export function makeEnvelope(engine: ClipboardEngine, id: string, bricks: ClipboardBrick[], assets?: KillioClipboard["assets"]): KillioClipboard {
  return { v: KILLIO_CLIPBOARD_VERSION, source: { app: "killio", engine, id }, bricks, assets: assets?.length ? assets : undefined };
}

// Same-tab lossless fallback: browsers strip custom web MIME types from paste
// events, so we also remember the last copied envelope keyed by its plain-text
// render. On paste, if the clipboard's text/plain matches, we restore the exact
// envelope (lossless) instead of re-parsing markdown.
let lastCopy: { envelope: KillioClipboard; plain: string } | null = null;
export function rememberCopy(envelope: KillioClipboard, plain: string): void { lastCopy = { envelope, plain }; }
export function recallCopy(plain: string): KillioClipboard | null {
  return lastCopy && lastCopy.plain === plain ? lastCopy.envelope : null;
}

export function isKillioEnvelope(value: unknown): value is KillioClipboard {
  const v = value as KillioClipboard | null;
  return !!v && v.v === KILLIO_CLIPBOARD_VERSION && v.source?.app === "killio" && Array.isArray(v.bricks);
}

/** Parse our envelope from a raw JSON string (returns null if not ours/corrupt). */
export function parseEnvelope(raw: string | null | undefined): KillioClipboard | null {
  if (!raw) return null;
  try { const v = JSON.parse(raw); return isKillioEnvelope(v) ? v : null; } catch { return null; }
}

/**
 * Write bricks to the system clipboard in all three formats. Prefers the async
 * Clipboard API (ClipboardItem with custom type); falls back to a synchronous
 * copy event override when called from within one.
 */
export async function writeBricksToClipboard(
  envelope: KillioClipboard,
  rendered: { html: string; plain: string },
): Promise<boolean> {
  const json = JSON.stringify(envelope);
  rememberCopy(envelope, rendered.plain);
  // Custom MIME via ClipboardItem requires it to be allowed; Chromium permits
  // "web " prefixed custom types. Use the web-custom-format spelling.
  try {
    const item = new ClipboardItem({
      "text/plain": new Blob([rendered.plain], { type: "text/plain" }),
      "text/html": new Blob([rendered.html], { type: "text/html" }),
      [`web ${KILLIO_MIME}`]: new Blob([json], { type: KILLIO_MIME }),
    } as unknown as Record<string, Blob>);
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    // Fallback: plain text only (best effort) so external paste still works.
    try { await navigator.clipboard.writeText(rendered.plain); return true; } catch { return false; }
  }
}

/** Populate a DataTransfer (copy/dragstart event) with all three formats. */
export function writeBricksToDataTransfer(dt: DataTransfer, envelope: KillioClipboard, rendered: { html: string; plain: string }): void {
  rememberCopy(envelope, rendered.plain);
  dt.setData(KILLIO_MIME, JSON.stringify(envelope));
  dt.setData("text/html", rendered.html);
  dt.setData("text/plain", rendered.plain);
}

/** Read our envelope from a DataTransfer (paste/drop event), if present. */
export function readEnvelopeFromDataTransfer(dt: DataTransfer | null): KillioClipboard | null {
  if (!dt) return null;
  return parseEnvelope(dt.getData(KILLIO_MIME) || dt.getData(`web ${KILLIO_MIME}`));
}
