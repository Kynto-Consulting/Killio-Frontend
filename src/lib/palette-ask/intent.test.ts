import assert from "node:assert/strict";
import test from "node:test";

import { countWords, resolveEnterAction, resolvePaletteIntent, resolveTabAction, stripAskPrefix } from "./intent.ts";

test("empty or blank text is the empty state: nothing to submit", () => {
  for (const raw of ["", "   ", "\n"]) {
    const i = resolvePaletteIntent(raw, false);
    assert.equal(i.kind, "empty");
    assert.equal(i.askPosition, "first");
    assert.equal(i.canSubmit, false);
    assert.equal(resolveEnterAction(i), "none");
  }
});

test("text that matches no command makes the ask row the first row", () => {
  const i = resolvePaletteIntent("cuántas tarjetas abiertas tiene Dropout por responsable", false);
  assert.equal(i.kind, "ask-first");
  assert.equal(i.askPosition, "first");
  assert.equal(i.question, "cuántas tarjetas abiertas tiene Dropout por responsable");
  assert.equal(i.canSubmit, true);
  assert.equal(resolveEnterAction(i), "ask");
});

test("a command match wins: the ask row drops to second and Enter runs the command", () => {
  for (const raw of ["board 2", "history", "list add Sprint"]) {
    const i = resolvePaletteIntent(raw, true);
    assert.equal(i.kind, "command-first");
    assert.equal(i.askPosition, "second");
    assert.equal(i.question, raw);
    assert.equal(resolveEnterAction(i), "command");
  }
});

test("more than 3 words without a command match is flagged as a suggested question; 3 or fewer is not", () => {
  assert.equal(resolvePaletteIntent("uno dos tres cuatro", false).suggested, true);
  assert.equal(resolvePaletteIntent("uno dos tres", false).suggested, false);
  assert.equal(resolvePaletteIntent("uno dos tres cuatro", true).suggested, false);
});

test("a ? or /ia prefix forces the question even when a command matches, and is stripped", () => {
  const a = resolvePaletteIntent("? board 2", true);
  assert.equal(a.kind, "forced");
  assert.equal(a.askPosition, "first");
  assert.equal(a.question, "board 2");
  assert.equal(resolveEnterAction(a), "ask");

  const b = resolvePaletteIntent("/ia history del equipo", true);
  assert.equal(b.kind, "forced");
  assert.equal(b.question, "history del equipo");

  const c = resolvePaletteIntent("?cuántas tarjetas", false);
  assert.equal(c.question, "cuántas tarjetas");

  const d = resolvePaletteIntent("/IA   hola", false);
  assert.equal(d.question, "hola");
});

test("a bare prefix is forced but has nothing to submit yet", () => {
  for (const raw of ["?", "/ia", "/ia  ", "? "]) {
    const i = resolvePaletteIntent(raw, false);
    assert.equal(i.kind, "forced");
    assert.equal(i.canSubmit, false);
    assert.equal(resolveEnterAction(i), "none");
  }
});

test("/ia must be a whole token: /iaxyz and /ias are not the prefix", () => {
  assert.deepEqual(stripAskPrefix("/iaxyz"), { forced: false, text: "/iaxyz" });
  assert.deepEqual(stripAskPrefix("/ias hola"), { forced: false, text: "/ias hola" });
  assert.deepEqual(stripAskPrefix("  /ia hola "), { forced: true, text: "hola" });
});

test("Tab completes a partial command, and picks the ask row when completion would change nothing", () => {
  const partial = resolvePaletteIntent("his", true);
  assert.equal(resolveTabAction(partial, true), "autocomplete");
  assert.equal(resolveTabAction(partial, false), "ask");

  const question = resolvePaletteIntent("qué pasó ayer", false);
  assert.equal(resolveTabAction(question, false), "ask");
  assert.equal(resolveTabAction(resolvePaletteIntent("", false), false), "none");
  assert.equal(resolveTabAction(resolvePaletteIntent("?", false), false), "none");
});

test("countWords ignores extra whitespace", () => {
  assert.equal(countWords("  a   b \n c "), 3);
  assert.equal(countWords(""), 0);
});
