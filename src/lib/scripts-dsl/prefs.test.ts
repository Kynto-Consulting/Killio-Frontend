import assert from "node:assert/strict";
import { test } from "node:test";

import { KEYWORD_LANG_KEY, conversionOffer, readKeywordLang, writeKeywordLang } from "./prefs.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};

test("English is the default, independent of anything else", () => {
  assert.equal(readKeywordLang(mem()), "en");
  assert.equal(readKeywordLang(null), "en");
  assert.equal(readKeywordLang(undefined), "en");
});

test("the choice is remembered, per user when a user key is given", () => {
  const s = mem();
  writeKeywordLang(s, "es", "u1");
  assert.equal(readKeywordLang(s, "u1"), "es");
  assert.equal(readKeywordLang(s, "u2"), "en");
  assert.equal(readKeywordLang(s), "en");
  writeKeywordLang(s, "es");
  assert.equal(readKeywordLang(s), "es");
  assert.ok(s.raw.has(KEYWORD_LANG_KEY));
});

test("unknown values and a blocked storage fall back to English and never throw", () => {
  const s = mem();
  s.raw.set(KEYWORD_LANG_KEY, "fr");
  assert.equal(readKeywordLang(s), "en");
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readKeywordLang(blocked), "en");
  assert.doesNotThrow(() => writeKeywordLang(blocked, "es"));
});

test("conversion is offered only when the text is not in the chosen language", () => {
  assert.equal(conversionOffer("es", "en"), "en");
  assert.equal(conversionOffer("en", "en"), null);
  assert.equal(conversionOffer("en", "es"), "es");
  assert.equal(conversionOffer("es", "es"), null);
  assert.equal(conversionOffer("mixed", "en"), "en");
  assert.equal(conversionOffer("mixed", "es"), "es");
  assert.equal(conversionOffer("neutral", "en"), null);
  assert.equal(conversionOffer(undefined, "en"), null);
});
