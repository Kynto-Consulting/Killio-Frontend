import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { buildDataset } from "./dataset.ts";
import { clipboardHtml, emojiTokenHtml, serializeClipboardText, textToEditorHtml, type ClipNode } from "./token-html.ts";
import { completedShortcodeBefore, customByName, replaceCompletedShortcodes } from "./shortcodes.ts";
import { emojiOnlyCount } from "./segments.ts";
import type { RawEmojiMartData } from "./types.ts";

const require = createRequire(import.meta.url);
const ds = buildDataset(JSON.parse(readFileSync(require.resolve("@emoji-mart/data/sets/15/native.json"), "utf8")) as RawEmojiMartData, "en");
const custom = customByName([{ id: "1", name: "teto", url: "https://api.x/uploads/teto.png" }]);

// ── editor html ──────────────────────────────────────────────────────────────

test("custom :name: becomes an atomic token whose value stays :name:", () => {
  const html = textToEditorHtml("hola :teto: ya", custom);
  assert.match(html, /^hola ​<span contenteditable="false" data-token=":teto:" data-emoji="custom" role="img" aria-label=":teto:"/);
  assert.match(html, /<img src="https:\/\/api\.x\/uploads\/teto\.png" alt=":teto:"/);
  assert.ok(html.endsWith("​ ya"));
});

test("unknown :names: and plain text stay text, escaped", () => {
  assert.equal(textToEditorHtml("a :nope: <b>\nb", custom), "a :nope: &lt;b&gt;<br>b");
});

test("Unicode emojis become tokens whose value is the glyph, with a label", () => {
  const html = textToEditorHtml("ok 🔥", undefined, (g) => (g === "🔥" ? ":fire:" : undefined));
  assert.match(html, /data-token="🔥" data-emoji="unicode" role="img" aria-label=":fire:"/);
  assert.match(html, /1f525\.svg/);
});

test("mentions, code and links are not touched", () => {
  const text = "@[user:1:Ana :teto:] y `:teto:` y [x](https://a.b/:teto:)";
  const html = textToEditorHtml(text, custom);
  assert.ok(!html.includes("data-token"));
});

test("token attributes are escaped", () => {
  const html = emojiTokenHtml("custom", ':x"y:', { src: 'https://a/"onerror=1', label: ':x"y:' });
  assert.ok(!/"onerror=1/.test(html.replace(/&quot;/g, "")) || html.includes("&quot;onerror=1"));
  assert.ok(!html.includes('data-token=":x"y:"'));
});

// ── copy / cut ───────────────────────────────────────────────────────────────

const text = (v: string): ClipNode => ({ nodeType: 3, textContent: v, childNodes: [] });
const el = (tagName: string, children: ClipNode[], dataset?: ClipNode["dataset"], textContent: string | null = null): ClipNode => ({ nodeType: 1, tagName, dataset, childNodes: children, textContent });

test("copy: custom token -> :name:, Unicode token -> glyph, mentions keep their visible text", () => {
  const nodes = [
    text("hola ​"),
    el("SPAN", [el("IMG", [])], { token: ":teto:", emoji: "custom" }),
    text("​ y "),
    el("SPAN", [], { token: "🔥", emoji: "unicode" }),
    text(" con "),
    el("SPAN", [text("Ana")], { token: "@[user:1:Ana]" }, "Ana"),
    el("BR", []),
    text("fin"),
  ];
  assert.equal(nodes.map(serializeClipboardText).join(""), "hola :teto: y 🔥 con Ana\nfin");
});

test("clipboard html carries no image or token markup", () => {
  const h = clipboardHtml("a :teto: <x>\nb");
  assert.equal(h, "a :teto: &lt;x&gt;<br>b");
  assert.ok(!h.includes("<img") && !h.includes("data-token"));
});

// ── paste / conversion ───────────────────────────────────────────────────────

test("pasting :fire: converts Unicode shortcodes, custom ones stay :name: for the editor to draw", () => {
  const pasted = "mira :fire: y :teto: y :nada:";
  const expanded = replaceCompletedShortcodes(pasted, ds);
  assert.equal(expanded, "mira 🔥 y :teto: y :nada:");
  const html = textToEditorHtml(expanded, custom);
  assert.equal((html.match(/data-emoji="custom"/g) ?? []).length, 1);
  assert.equal((html.match(/data-emoji="unicode"/g) ?? []).length, 1);
  assert.ok(html.includes(":nada:"));
});

test("typing the closing colon converts only known names right before the caret", () => {
  assert.deepEqual(completedShortcodeBefore("hola :teto:", 11, ds, custom), { start: 5, end: 11, replacement: ":teto:", kind: "custom" });
  assert.deepEqual(completedShortcodeBefore(":fire:", 6, ds, custom), { start: 0, end: 6, replacement: "🔥", kind: "unicode" });
  assert.equal(completedShortcodeBefore("hola :nada:", 11, ds, custom), null);
  assert.equal(completedShortcodeBefore("a:teto:", 7, ds, custom), null, "glued to a word");
  assert.equal(completedShortcodeBefore("hola :teto: x", 13, ds, custom), null, "the caret is not right after it");
  assert.equal(completedShortcodeBefore("hola :TETO:", 11, ds, custom)?.kind, "custom");
  assert.equal(completedShortcodeBefore(":fire:", 6, null, undefined), null, "before the emoji list loads nothing converts");
});

// ── jumbo ────────────────────────────────────────────────────────────────────

test("jumbo only when the message is emojis and spaces (1 to 27)", () => {
  assert.equal(emojiOnlyCount("🔥", custom), 1);
  assert.equal(emojiOnlyCount(" 🔥 :teto:  🎉 ", custom), 3);
  assert.equal(emojiOnlyCount("hola 🔥", custom), 0);
  assert.equal(emojiOnlyCount(":teto:", undefined), 0, "unknown custom is just text");
  assert.equal(emojiOnlyCount("", custom), 0);
  assert.equal(emojiOnlyCount("🔥".repeat(27), custom), 27);
  assert.equal(emojiOnlyCount("🔥".repeat(28), custom), 0);
  assert.equal(emojiOnlyCount("`🔥`", custom), 0);
});
