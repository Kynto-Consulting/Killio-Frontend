import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { buildDataset } from "./dataset.ts";
import { applyInsertion, buildEmojiSuggestions, findEmojiQuery } from "./suggest.ts";
import type { RawEmojiMartData } from "./types.ts";

const require = createRequire(import.meta.url);
const ds = buildDataset(JSON.parse(readFileSync(require.resolve("@emoji-mart/data/sets/15/native.json"), "utf8")) as RawEmojiMartData, "en");

test("query: needs a colon, two letters and a word boundary before it", () => {
  assert.deepEqual(findEmojiQuery("hola :sm", 8), { query: "sm", start: 5, end: 8 });
  assert.equal(findEmojiQuery("hola :s", 7), null);
  assert.equal(findEmojiQuery("hola :", 6), null);
  assert.equal(findEmojiQuery("https://x.com", 6), null);
  assert.equal(findEmojiQuery("a las 10:30", 11), null);
  assert.equal(findEmojiQuery("hola :sm mundo", 8)?.query, "sm", "uses the text before the caret, not the whole message");
  assert.equal(findEmojiQuery(":fire: ya", 9), null, "a completed shortcode is not a query");
  assert.equal(findEmojiQuery("x", 5), null);
});

test("suggestions: custom first, then unicode, limited", () => {
  const custom = [{ id: "1", name: "smug_cat", url: "u" }, { id: "2", name: "other", url: "u" }];
  const r = buildEmojiSuggestions(ds, custom, "sm", 6);
  assert.equal(r[0].custom?.id, "1");
  assert.equal(r[0].insert, ":smug_cat:");
  assert.ok(r.length <= 6 && r.length > 1);
  assert.ok(r.slice(1).every((s) => !s.custom));
  assert.deepEqual(buildEmojiSuggestions(ds, [], "zzzzqq"), []);
  assert.deepEqual(buildEmojiSuggestions(null, [], "sm"), []);
  assert.equal(buildEmojiSuggestions(ds, [], "fire")[0].insert, "🔥");
});

test("insertion replaces :query at the caret and keeps the rest", () => {
  assert.deepEqual(applyInsertion("hola :sm mundo", { start: 5, end: 8 }, "😄"), { text: "hola 😄 mundo", caret: 5 + 2 });
  const end = applyInsertion("hola :sm", { start: 5, end: 8 }, "😄");
  assert.equal(end.text, "hola 😄 ");
  assert.equal(end.caret, end.text.length);
  assert.deepEqual(applyInsertion("ab", { start: 1, end: 1 }, "🔥", false), { text: "a🔥b", caret: 3 });
});
