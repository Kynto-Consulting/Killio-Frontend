import { searchEmojis } from "./search.ts";
import { activeShortcodeQuery, type ShortcodeQuery } from "./shortcodes.ts";
import type { CustomEmoji, EmojiDataset } from "./types.ts";

export interface EmojiSuggestion {
  key: string;
  /** Unicode glyph, or the `:name:` text for a custom emoji. */
  insert: string;
  shortcode: string;
  name: string;
  custom?: CustomEmoji;
}

/** The `:query` right before the caret (two or more characters after the colon), or null. */
export function findEmojiQuery(text: string, caret: number): ShortcodeQuery | null {
  if (caret < 0 || caret > text.length) return null;
  return activeShortcodeQuery(text, caret);
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Custom emojis whose name starts with / contains the query come first, then Unicode matches. */
export function buildEmojiSuggestions(ds: EmojiDataset | null, custom: CustomEmoji[], query: string, limit = 8): EmojiSuggestion[] {
  const q = query.toLowerCase();
  const out: EmojiSuggestion[] = [];
  const mine = custom
    .filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name));
  for (const c of mine) out.push({ key: `c:${c.id}`, insert: `:${c.name}:`, shortcode: c.name, name: c.name, custom: c });
  if (ds) {
    for (const e of searchEmojis(ds, query, { limit })) {
      out.push({ key: `u:${e.id}`, insert: e.skins[0], shortcode: e.id, name: cap(e.name) });
    }
  }
  return out.slice(0, limit);
}

/** Replaces `[range.start, range.end)` with `insert` (+ a trailing space when asked) and returns the new text and caret. */
export function applyInsertion(text: string, range: { start: number; end: number }, insert: string, trailingSpace = true): { text: string; caret: number } {
  const tail = text.slice(range.end);
  const add = trailingSpace && !tail.startsWith(" ") ? `${insert} ` : insert;
  const next = text.slice(0, range.start) + add + tail;
  return { text: next, caret: range.start + (trailingSpace && !tail.startsWith(" ") ? insert.length + 1 : insert.length) };
}
