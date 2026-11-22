export type EmojiCategoryId =
  | "frequent" | "people" | "nature" | "foods" | "activity" | "places" | "objects" | "symbols" | "flags" | "custom";

/** Order of the built-in sections (frequent and custom are added by the picker around them). */
export const EMOJI_CATEGORY_ORDER: EmojiCategoryId[] = [
  "people", "nature", "foods", "activity", "places", "objects", "symbols", "flags",
];

export interface EmojiEntry {
  /** Shortcode, without colons ("thumbsup"). */
  id: string;
  /** Display name (localised when a dictionary exists, English otherwise). */
  name: string;
  /** Lower-case search terms, already merged with the localised ones. */
  keywords: string[];
  /** skins[0] is the default glyph, skins[1..5] the five skin-tone variants (only for emojis that have them). */
  skins: string[];
  category: EmojiCategoryId;
}

/**
 * An emoji uploaded by a space ("Servidor" section). The backend for these does not exist yet: the picker and
 * the renderer already accept them through props / context, nothing in the app produces them today.
 */
export interface CustomEmoji {
  /** Stable id (used for recents). */
  id: string;
  /** Shortcode without colons: letters, digits and underscores, 2-32 characters. Written as `:name:` in text. */
  name: string;
  url: string;
  /** Stable key stored for a reaction (`custom:<id>`). */
  reaction?: string;
  keywords?: string[];
  animated?: boolean;
}

export interface EmojiDataset {
  entries: EmojiEntry[];
  byId: Map<string, EmojiEntry>;
  /** Any variant glyph (default or skin tone, with or without U+FE0F) -> entry. */
  byNative: Map<string, EmojiEntry>;
  /** alias -> id */
  aliases: Record<string, string>;
  categories: Array<{ id: EmojiCategoryId; ids: string[] }>;
}

/** Shape of `@emoji-mart/data/sets/15/native.json` (the parts we read). */
export interface RawEmojiMartData {
  categories: Array<{ id: string; emojis: string[] }>;
  emojis: Record<string, { id: string; name: string; keywords?: string[]; skins: Array<{ unified: string; native: string }> }>;
  aliases?: Record<string, string>;
}
