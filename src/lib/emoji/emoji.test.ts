import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { buildDataset, fold } from "./dataset.ts";
import { searchEmojis, searchCustomEmojis, normalizeQuery } from "./search.ts";
import { glyphForTone, hasSkinTones, normalizeTone } from "./skin.ts";
import { recordUse, topUsed, usageScore, MAX_STORED, DEFAULT_QUICK_EMOJIS } from "./usage.ts";
import { activeShortcodeQuery, customByName, replaceCompletedShortcodes, shortcodeToGlyph } from "./shortcodes.ts";
import { hasEmoji, splitEmojiSegments } from "./segments.ts";
import { emojiToCodePoints, twemojiUrl, TWEMOJI_VERSION, TWEMOJI_BASE } from "./twemoji-url.ts";
import { ES_EMOJI_TERMS } from "./es-keywords.ts";
import type { CustomEmoji, RawEmojiMartData } from "./types.ts";

const require = createRequire(import.meta.url);
const raw = JSON.parse(readFileSync(require.resolve("@emoji-mart/data/sets/15/native.json"), "utf8")) as RawEmojiMartData;
const en = buildDataset(raw, "en");
const es = buildDataset(raw, "es");

// ── twemoji urls ─────────────────────────────────────────────────────────────

test("twemoji code points drop FE0F except inside ZWJ sequences", () => {
  assert.equal(emojiToCodePoints("❤️"), "2764");
  assert.equal(emojiToCodePoints("😀"), "1f600");
  assert.equal(emojiToCodePoints("👍🏽"), "1f44d-1f3fd");
  assert.equal(emojiToCodePoints("👨‍💻"), "1f468-200d-1f4bb");
  assert.equal(emojiToCodePoints("🇪🇸"), "1f1ea-1f1f8");
  assert.equal(emojiToCodePoints("🏳️‍🌈"), "1f3f3-fe0f-200d-1f308");
  assert.equal(twemojiUrl("😀"), `${TWEMOJI_BASE}1f600.svg`);
});

test("the pinned CDN version is the installed @twemoji/api version", () => {
  const pkg = JSON.parse(readFileSync(require.resolve("@twemoji/api/package.json"), "utf8"));
  assert.equal(TWEMOJI_VERSION, pkg.version);
});

// ── dataset ──────────────────────────────────────────────────────────────────

test("dataset: categories in order, skins and native lookup", () => {
  assert.deepEqual(en.categories.map((c) => c.id), ["people", "nature", "foods", "activity", "places", "objects", "symbols", "flags"]);
  assert.ok(en.entries.length > 1500);
  const thumbs = en.byId.get("+1")!;
  assert.equal(hasSkinTones(thumbs), true);
  assert.equal(thumbs.skins.length, 6);
  assert.equal(en.byNative.get("👍🏽"), thumbs);
  assert.equal(en.byNative.get("❤"), en.byId.get("heart"), "lookup ignores U+FE0F");
});

test("every Spanish supplement id exists in the dataset", () => {
  const missing = Object.keys(ES_EMOJI_TERMS).filter((id) => !en.byId.has(id));
  assert.deepEqual(missing, []);
});

test("fold strips accents and case", () => {
  assert.equal(fold("Corazón"), "corazon");
  assert.equal(normalizeQuery("  :Fire: "), "fire");
});

// ── search ───────────────────────────────────────────────────────────────────

test("search: shortcode, alias and keyword; exact id first", () => {
  assert.equal(searchEmojis(en, "fire")[0].id, "fire");
  assert.equal(searchEmojis(en, ":thumbsup:")[0].id, "+1");
  const smile = searchEmojis(en, "smile").map((e) => e.id);
  assert.equal(smile[0], "smile");
  assert.ok(smile.length > 5);
  assert.deepEqual(searchEmojis(en, ""), []);
  assert.deepEqual(searchEmojis(en, "zzzzqqqq"), []);
});

test("search: every word has to match", () => {
  const r = searchEmojis(en, "red heart").map((e) => e.id);
  assert.ok(r.includes("heart"));
  assert.ok(!r.includes("fire"));
});

test("search in Spanish finds common emojis, accent-insensitive", () => {
  assert.equal(searchEmojis(es, "corazon")[0].id, "heart");
  assert.equal(searchEmojis(es, "Corazón rojo")[0].id, "heart");
  assert.ok(searchEmojis(es, "fuego").some((e) => e.id === "fire"));
  assert.equal(es.byId.get("fire")!.name, "Fuego");
  assert.equal(en.byId.get("fire")!.name, "Fire");
});

test("search respects the limit", () => {
  assert.equal(searchEmojis(en, "face", { limit: 5 }).length, 5);
});

test("custom emoji search by name and keywords", () => {
  const list: CustomEmoji[] = [
    { id: "1", name: "party_parrot", url: "https://x/p.gif", keywords: ["loro"] },
    { id: "2", name: "logo", url: "https://x/l.png" },
  ];
  assert.deepEqual(searchCustomEmojis(list, "parrot").map((c) => c.id), ["1"]);
  assert.deepEqual(searchCustomEmojis(list, "LORO").map((c) => c.id), ["1"]);
  assert.deepEqual(searchCustomEmojis(list, ""), []);
});

// ── skin tones ───────────────────────────────────────────────────────────────

test("skin tones", () => {
  const wave = en.byId.get("wave")!;
  assert.equal(glyphForTone(wave, 0), "👋");
  assert.equal(glyphForTone(wave, 3), "👋🏽");
  const fire = en.byId.get("fire")!;
  assert.equal(hasSkinTones(fire), false);
  assert.equal(glyphForTone(fire, 4), "🔥");
  assert.equal(normalizeTone("3"), 3);
  assert.equal(normalizeTone("9"), 0);
  assert.equal(normalizeTone(null), 0);
  assert.equal(normalizeTone(0), 0);
});

// ── recents ──────────────────────────────────────────────────────────────────

test("usage: counts, recency weighting and trimming", () => {
  const now = 1_000_000_000_000;
  let m = recordUse({}, "👍", now - 10 * 86_400_000);
  m = recordUse(m, "👍", now - 10 * 86_400_000);
  m = recordUse(m, "🎉", now - 60_000);
  assert.equal(m["👍"].count, 2);
  // 🎉: 1 use in the last hour (x3) beats 👍: 2 old uses (x1)
  assert.ok(usageScore(m["🎉"], now) > usageScore(m["👍"], now));
  assert.deepEqual(topUsed(m, 2, now), ["🎉", "👍"]);

  let big = {};
  for (let i = 0; i < MAX_STORED + 20; i++) big = recordUse(big, `e${i}`, now - i);
  assert.equal(Object.keys(big).length, MAX_STORED);
});

test("usage: fallback fills up without duplicates", () => {
  const now = Date.now();
  const m = recordUse({}, "🔥", now);
  const top = topUsed(m, 5, now, DEFAULT_QUICK_EMOJIS);
  assert.equal(top.length, 5);
  assert.equal(top[0], "🔥");
  assert.equal(new Set(top).size, 5);
});

// ── shortcodes ───────────────────────────────────────────────────────────────

test("shortcodes resolve ids and aliases", () => {
  assert.equal(shortcodeToGlyph(en, "fire"), "🔥");
  assert.equal(shortcodeToGlyph(en, "THUMBSUP"), "👍");
  assert.equal(shortcodeToGlyph(en, "nope_nope"), null);
});

test("completed shortcodes are replaced, the rest is untouched", () => {
  assert.equal(replaceCompletedShortcodes("hola :fire: mundo", en), "hola 🔥 mundo");
  assert.equal(replaceCompletedShortcodes(":tada:", en), "🎉");
  assert.equal(replaceCompletedShortcodes("a :unknown_code: b", en), "a :unknown_code: b");
  assert.equal(replaceCompletedShortcodes("hora 10:30:15 ok", en), "hora 10:30:15 ok");
  assert.equal(replaceCompletedShortcodes("[x](user:fire:)", en), "[x](user:fire:)", "glued to a word: left alone");
  assert.equal(replaceCompletedShortcodes("sin dos puntos", en), "sin dos puntos");
});

test("active shortcode query at the caret", () => {
  assert.deepEqual(activeShortcodeQuery("hola :fi", 8), { query: "fi", start: 5, end: 8 });
  assert.equal(activeShortcodeQuery("hola :f", 7), null, "needs two characters");
  assert.equal(activeShortcodeQuery("a:fire", 6), null, "glued to a word");
  assert.equal(activeShortcodeQuery("hola :fire: x", 13), null);
  assert.deepEqual(activeShortcodeQuery(":sm", 3), { query: "sm", start: 0, end: 3 });
});

// ── text -> segments ─────────────────────────────────────────────────────────

const join = (segs: ReturnType<typeof splitEmojiSegments>) => segs.map((s) => s.value).join("");

test("segments: text with emojis, round-trips to the original", () => {
  const text = "Hola 👋 equipo ❤️ y 👨‍💻 con 👍🏽 y 🇪🇸!";
  const segs = splitEmojiSegments(text);
  assert.equal(join(segs), text);
  assert.deepEqual(segs.filter((s) => s.type === "emoji").map((s) => s.value), ["👋", "❤️", "👨‍💻", "👍🏽", "🇪🇸"]);
  assert.equal(segs[0].type, "text");
});

test("segments: text without emojis is a single segment, hasEmoji agrees", () => {
  assert.deepEqual(splitEmojiSegments("solo texto 123 # * ©"), [{ type: "text", value: "solo texto 123 # * ©" }]);
  assert.equal(hasEmoji("solo texto 123"), false);
  assert.equal(hasEmoji("hola 🎉"), true);
  assert.deepEqual(splitEmojiSegments(""), []);
});

test("segments: keycaps are emojis, bare digits are not", () => {
  const segs = splitEmojiSegments("1️⃣ y 2");
  assert.deepEqual(segs.filter((s) => s.type === "emoji").map((s) => s.value), ["1️⃣"]);
});

test("segments: mentions, code, links and URLs are left as written", () => {
  const text = "hola @[Ana 🎉](user:123) mira `x 🔥 y` y [doc 📄](https://a.b/c) en https://ex.com/😀 fin 🎉";
  const segs = splitEmojiSegments(text);
  assert.equal(join(segs), text);
  assert.deepEqual(segs.filter((s) => s.type === "emoji").map((s) => s.value), ["🎉"]);
  assert.equal(segs[segs.length - 1].value, "🎉");
});

test("segments: custom :name: emojis resolve, unknown ones stay text", () => {
  const custom = customByName([{ id: "1", name: "party_parrot", url: "https://x/p.gif" }]);
  const segs = splitEmojiSegments("hola :party_parrot: y :otro: 🔥", custom);
  assert.equal(join(segs), "hola :party_parrot: y :otro: 🔥");
  const kinds = segs.map((s) => s.type);
  assert.deepEqual(kinds, ["text", "custom", "text", "emoji"]);
  assert.equal((segs[1] as { emoji: CustomEmoji }).emoji.id, "1");
});

test("custom emoji names are validated", () => {
  const map = customByName([
    { id: "a", name: "ok_name", url: "u" },
    { id: "b", name: "bad name", url: "u" },
    { id: "c", name: "x", url: "u" },
  ]);
  assert.deepEqual([...map.keys()], ["ok_name"]);
});
