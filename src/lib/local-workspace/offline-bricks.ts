// Offline support classification for brick kinds. In a Local workspace there is
// no backend, so some bricks render fully from file data, some degrade (lose a
// live capability but still display), and some can't work at all. The offline
// brick renderer uses this to decide how to render each brick.

export type OfflineSupport = "full" | "degraded" | "unsupported";

// Fully renderable from file content alone.
const FULL = new Set<string>([
  "text", "checklist", "quote", "divider", "callout",
  "table", "beautiful_table", "code", "math", "graph",
  "accordion", "tabs", "columns",
  "image", "media", "video", "audio", // when backed by an asset: ref or data/http url
]);

// Displays but loses a live/online capability.
const DEGRADED = new Set<string>([
  "bookmark",        // no live metadata fetch — show the raw URL
  "form",            // view-only — submissions need the backend
  "popup_document",  // shows a link/title — can't resolve the target offline
]);

// Cannot function without the backend/an external service.
const UNSUPPORTED = new Set<string>([
  "ai",        // needs the AI API
  "payment",   // needs a payment provider
  "database",  // needs the backend datastore
]);

export function offlineBrickSupport(kind: string): OfflineSupport {
  if (UNSUPPORTED.has(kind)) return "unsupported";
  if (DEGRADED.has(kind)) return "degraded";
  if (FULL.has(kind)) return "full";
  // Unknown kinds: assume degraded (render what we can, no guarantees).
  return "degraded";
}

export function isOfflineEditable(kind: string): boolean {
  // Kinds that make sense to edit inline in the offline editor (text-like).
  return kind === "text" || kind === "quote" || kind === "callout" || kind === "code";
}
