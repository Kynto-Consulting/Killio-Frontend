/**
 * Twemoji image addressing. Pure (no package import) so it can be unit-tested and reused by the service worker.
 * The version is pinned to the installed `@twemoji/api` (a test fails when they drift apart).
 */
export const TWEMOJI_VERSION = "17.0.3";
export const TWEMOJI_ORIGIN = "https://cdn.jsdelivr.net";
export const TWEMOJI_PATH_PREFIX = `/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/svg/`;
export const TWEMOJI_BASE = `${TWEMOJI_ORIGIN}${TWEMOJI_PATH_PREFIX}`;

const FE0F = /️/g;

/** "1f468-200d-1f4bb" for a glyph. Twemoji drops U+FE0F unless the sequence has a ZWJ. */
export function emojiToCodePoints(glyph: string): string {
  const raw = glyph.includes("‍") ? glyph : glyph.replace(FE0F, "");
  const out: string[] = [];
  for (const ch of raw) out.push(ch.codePointAt(0)!.toString(16));
  return out.join("-");
}

export function twemojiUrl(glyph: string): string {
  return `${TWEMOJI_BASE}${emojiToCodePoints(glyph)}.svg`;
}

/** Key used to look an emoji up regardless of variation selectors. */
export function normalizeGlyph(glyph: string): string {
  return glyph.replace(FE0F, "");
}
