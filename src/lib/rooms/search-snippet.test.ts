import test from "node:test";
import assert from "node:assert/strict";

import { FRAG_SEP, HL_END, HL_START, matchCount, plainSnippet, splitSnippet } from "./search-snippet.ts";

const S = HL_START;
const E = HL_END;

test("splitSnippet: alternates plain and highlighted parts", () => {
  assert.deepEqual(splitSnippet(`hola ${S}mundo${E} bonito`), [
    { text: "hola ", match: false },
    { text: "mundo", match: true },
    { text: " bonito", match: false },
  ]);
});

test("splitSnippet: no markers is one plain part; empty is nothing", () => {
  assert.deepEqual(splitSnippet("sin marcas"), [{ text: "sin marcas", match: false }]);
  assert.deepEqual(splitSnippet(""), []);
});

test("splitSnippet: markers at the edges and adjacent matches", () => {
  assert.deepEqual(splitSnippet(`${S}a${E}${S}b${E}`), [{ text: "ab", match: true }]);
  assert.deepEqual(splitSnippet(`${S}todo${E}`), [{ text: "todo", match: true }]);
});

test("splitSnippet: fragments are joined by an ellipsis, also from the private separator", () => {
  assert.equal(plainSnippet(`primero ${S}uno${E} … segundo ${S}dos${E}`), "primero uno … segundo dos");
  const parts = splitSnippet(`a ${S}b${E}${FRAG_SEP}c ${S}d${E}`);
  assert.equal(plainSnippet(`a ${S}b${E}${FRAG_SEP}c ${S}d${E}`), "a b…c d");
  assert.equal(parts.filter((p) => p.match).length, 2);
});

test("splitSnippet: broken markers never throw or swallow text", () => {
  assert.equal(plainSnippet(`${E}suelto${E}`), "suelto");
  assert.deepEqual(splitSnippet(`a ${S}sin cerrar`), [{ text: "a ", match: false }, { text: "sin cerrar", match: true }]);
  assert.deepEqual(splitSnippet(`${S}a${S}b${E}`), [{ text: "ab", match: true }], "nested starts collapse");
  const open = splitSnippet(`${S}abierto${FRAG_SEP}cerrado`);
  assert.equal(open[0].match, true);
  assert.equal(open[open.length - 1].match, false, "a fragment boundary closes the highlight");
});

test("splitSnippet: HTML is just text (the caller renders text nodes)", () => {
  const parts = splitSnippet(`<img src=x onerror=alert(1)> ${S}<b>hi</b>${E}`);
  assert.equal(parts[0].text, "<img src=x onerror=alert(1)> ");
  assert.equal(parts[1].text, "<b>hi</b>");
  assert.equal(plainSnippet(`${S}&amp;${E}`), "&amp;", "entities are not decoded either");
});

test("matchCount", () => {
  assert.equal(matchCount(`${S}a${E} b ${S}c${E}`), 2);
  assert.equal(matchCount("nada"), 0);
});
