import type { CustomEmoji, EmojiDataset } from "./types.ts";

/** `:name:` as typed by the user. */
const SHORTCODE_RE = /(^|[^A-Za-z0-9:])(:[A-Za-z0-9_+-]{2,32}:)/g;

/** Resolve a shortcode (id or alias, no colons) to its default glyph. */
export function shortcodeToGlyph(ds: EmojiDataset, code: string): string | null {
  const key = code.toLowerCase();
  const entry = ds.byId.get(key) ?? ds.byId.get(ds.aliases[key] ?? "");
  return entry ? entry.skins[0] : null;
}

/**
 * Replaces the completed `:smile:` shortcodes in a text with their glyph. Unknown codes and anything glued to a
 * word (`https://x:80:` style or `user:abc:`) are left alone.
 */
export function replaceCompletedShortcodes(text: string, ds: EmojiDataset): string {
  if (!text.includes(":")) return text;
  return text.replace(SHORTCODE_RE, (whole, lead: string, token: string) => {
    const glyph = shortcodeToGlyph(ds, token.slice(1, -1));
    return glyph ? `${lead}${glyph}` : whole;
  });
}

export interface ShortcodeQuery { query: string; start: number; end: number }

/**
 * The `:partial` being typed right before the caret (Discord shows suggestions from 2 characters on), or null.
 * Used by composers that want an autocomplete list.
 */
export function activeShortcodeQuery(text: string, caret: number): ShortcodeQuery | null {
  const before = text.slice(0, caret);
  const m = /(^|[\s(])(:[A-Za-z0-9_+-]{2,32})$/.exec(before);
  if (!m) return null;
  const start = caret - m[2].length;
  return { query: m[2].slice(1), start, end: caret };
}

export interface CompletedShortcode { start: number; end: number; replacement: string; kind: "custom" | "unicode" }

/**
 * A `:name:` that was just completed right before the caret (the closing colon is the last character before it) and
 * names a custom emoji of the team (kept as `:name:` text, the editor draws it as an image) or a known Unicode
 * shortcode (replaced by its glyph). Null for anything else, including names glued to a word.
 */
export function completedShortcodeBefore(text: string, caret: number, ds: EmojiDataset | null, custom?: Map<string, CustomEmoji>): CompletedShortcode | null {
  const before = text.slice(0, caret);
  const m = /(^|[^A-Za-z0-9:])(:([A-Za-z0-9_+-]{2,32}):)$/.exec(before);
  if (!m) return null;
  const start = caret - m[2].length;
  const name = m[3].toLowerCase();
  if (custom?.has(name)) return { start, end: caret, replacement: m[2], kind: "custom" };
  const glyph = ds ? shortcodeToGlyph(ds, name) : null;
  return glyph ? { start, end: caret, replacement: glyph, kind: "unicode" } : null;
}

export const CUSTOM_NAME_RE = /^[A-Za-z0-9_]{2,32}$/;

export function customByName(list: CustomEmoji[] | undefined): Map<string, CustomEmoji> {
  const map = new Map<string, CustomEmoji>();
  for (const c of list ?? []) if (CUSTOM_NAME_RE.test(c.name)) map.set(c.name.toLowerCase(), c);
  return map;
}
