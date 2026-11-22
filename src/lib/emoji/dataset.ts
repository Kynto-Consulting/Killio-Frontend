import { ES_EMOJI_TERMS } from "./es-keywords.ts";
import { normalizeGlyph } from "./twemoji-url.ts";
import type { EmojiCategoryId, EmojiDataset, EmojiEntry, RawEmojiMartData } from "./types.ts";
import { EMOJI_CATEGORY_ORDER } from "./types.ts";

export type EmojiLocale = "en" | "es";

/** emoji-mart category ids that do not match ours. */
const CATEGORY_MAP: Record<string, EmojiCategoryId> = {
  people: "people", nature: "nature", foods: "foods", activity: "activity",
  places: "places", objects: "objects", symbols: "symbols", flags: "flags",
};

/** Lower-case and strip accents, so "corazón" matches "corazon". */
export function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Pure: builds the lookup structures from the raw emoji-mart data (tests feed it a small fixture). */
export function buildDataset(raw: RawEmojiMartData, locale: EmojiLocale = "en"): EmojiDataset {
  const entries: EmojiEntry[] = [];
  const byId = new Map<string, EmojiEntry>();
  const byNative = new Map<string, EmojiEntry>();
  const categories: EmojiDataset["categories"] = [];

  for (const cat of raw.categories) {
    const id = CATEGORY_MAP[cat.id];
    if (!id) continue;
    const ids: string[] = [];
    for (const emojiId of cat.emojis) {
      const e = raw.emojis[emojiId];
      if (!e || !e.skins?.length) continue;
      const es = locale === "es" ? ES_EMOJI_TERMS[emojiId] : undefined;
      const esParts = es ? es.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const entry: EmojiEntry = {
        id: e.id,
        name: esParts[0] ?? e.name,
        keywords: [...new Set([...esParts.map(fold), ...(e.keywords ?? []).map(fold), fold(e.name)])],
        skins: e.skins.map((s) => s.native),
        category: id,
      };
      entries.push(entry);
      byId.set(entry.id, entry);
      for (const g of entry.skins) byNative.set(normalizeGlyph(g), entry);
      ids.push(entry.id);
    }
    categories.push({ id, ids });
  }
  categories.sort((a, b) => EMOJI_CATEGORY_ORDER.indexOf(a.id) - EMOJI_CATEGORY_ORDER.indexOf(b.id));

  const aliases: Record<string, string> = {};
  for (const [alias, target] of Object.entries(raw.aliases ?? {})) if (byId.has(target)) aliases[alias] = target;
  return { entries, byId, byNative, aliases, categories };
}

// ── Lazy loading ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The JSON is ~430 KB: it is a dynamic import, so it never weighs on the first load of a page that only shows emojis.

const cache: Partial<Record<EmojiLocale, EmojiDataset>> = {};
const pending: Partial<Record<EmojiLocale, Promise<EmojiDataset>>> = {};

/** Synchronous access once loaded (renderers use it for labels; null before the first load). */
export function getCachedDataset(locale: EmojiLocale): EmojiDataset | null {
  return cache[locale] ?? null;
}

export function loadEmojiDataset(locale: EmojiLocale): Promise<EmojiDataset> {
  const hit = cache[locale];
  if (hit) return Promise.resolve(hit);
  const inflight = pending[locale];
  if (inflight) return inflight;
  const p = import("@emoji-mart/data/sets/15/native.json").then((mod) => {
    const raw = ((mod as { default?: unknown }).default ?? mod) as unknown as RawEmojiMartData;
    const ds = buildDataset(raw, locale);
    cache[locale] = ds;
    return ds;
  }).catch((err) => {
    delete pending[locale];
    throw err;
  });
  pending[locale] = p;
  return p;
}
