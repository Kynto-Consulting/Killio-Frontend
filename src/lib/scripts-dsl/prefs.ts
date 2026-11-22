// Preference of the DSL keyword language (English is the base, Spanish a full alias). Pure helpers: tested with node:test.
// It only decides how text is shown / generated / suggested; the compiler always accepts both languages.

export type KeywordLang = "en" | "es";
export const KEYWORD_LANG_KEY = "killio.scripts.dsl.keywordLang.v1";

export interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Remembered language of this browser profile; anything missing, unknown or unreadable gives English. */
export function readKeywordLang(storage: PrefStorage | null | undefined, userKey?: string | null): KeywordLang {
  try {
    const v = storage?.getItem(keyFor(userKey));
    return v === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

export function writeKeywordLang(storage: PrefStorage | null | undefined, lang: KeywordLang, userKey?: string | null): void {
  try {
    storage?.setItem(keyFor(userKey), lang);
  } catch {
    /* storage blocked: the choice just is not remembered */
  }
}

const keyFor = (userKey?: string | null) => (userKey ? `${KEYWORD_LANG_KEY}:${userKey}` : KEYWORD_LANG_KEY);

export type TextKeywordLanguage = "en" | "es" | "mixed" | "neutral";

/** Which conversion to offer for the text in the editor given the chosen language (null = nothing to convert). */
export function conversionOffer(textLang: TextKeywordLanguage | undefined, preferred: KeywordLang): KeywordLang | null {
  if (!textLang || textLang === "neutral") return null;
  if (textLang === "mixed") return preferred;
  return textLang === preferred ? null : preferred;
}
