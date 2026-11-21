import { test } from "node:test";
import assert from "node:assert/strict";
import { composerHeightPx, composerMaxHeightPx, shouldShowComposerHint } from "./agent-composer.ts";

test("max height is six lines plus padding", () => {
  assert.equal(composerMaxHeightPx(), 6 * 20 + 16);
  assert.equal(composerMaxHeightPx(0), 1 * 20 + 16);
  assert.equal(composerMaxHeightPx(NaN), 136);
});

test("height grows from one line and is capped", () => {
  assert.equal(composerHeightPx(0), 36);
  assert.equal(composerHeightPx(36), 36);
  assert.equal(composerHeightPx(76), 76);
  assert.equal(composerHeightPx(900), 136);
  assert.equal(composerHeightPx(NaN), 36);
});

test("hint needs focus and text, and hides while busy", () => {
  assert.equal(shouldShowComposerHint({ focused: true, text: "hola" }), true);
  assert.equal(shouldShowComposerHint({ focused: true, text: "   " }), false);
  assert.equal(shouldShowComposerHint({ focused: false, text: "hola" }), false);
  assert.equal(shouldShowComposerHint({ focused: true, text: "hola", busy: true }), false);
});
