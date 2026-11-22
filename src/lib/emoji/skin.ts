import type { EmojiEntry } from "./types.ts";

/** 0 = default (yellow); 1..5 = the five Fitzpatrick modifiers (light ... dark). */
export type SkinTone = 0 | 1 | 2 | 3 | 4 | 5;

export const SKIN_TONES: SkinTone[] = [0, 1, 2, 3, 4, 5];

const STORAGE_KEY = "killio_emoji_skin_tone";

export function normalizeTone(value: unknown): SkinTone {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : 0;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as SkinTone) : 0;
}

export function hasSkinTones(entry: EmojiEntry): boolean {
  return entry.skins.length > 1;
}

/** The glyph of an emoji for a tone (falls back to the default one when the emoji has no variants). */
export function glyphForTone(entry: EmojiEntry, tone: SkinTone): string {
  return entry.skins[tone] ?? entry.skins[0];
}

export function loadSkinTone(): SkinTone {
  try { return normalizeTone(localStorage.getItem(STORAGE_KEY)); } catch { return 0; }
}

export function saveSkinTone(tone: SkinTone): void {
  try { localStorage.setItem(STORAGE_KEY, String(tone)); } catch { /* storage unavailable: the tone is kept for the session only */ }
}
