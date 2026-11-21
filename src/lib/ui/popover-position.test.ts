import test from "node:test";
import assert from "node:assert/strict";
import { placePopover } from "./popover-position.ts";

const vp = { width: 1000, height: 600 };

test("opens below the anchor when it fits", () => {
  const p = placePopover({ top: 100, left: 50, width: 80, height: 20 }, { width: 400, height: 200 }, vp);
  assert.equal(p.side, "below");
  assert.equal(p.top, 126);
  assert.equal(p.left, 50);
});

test("flips above when below has no room and above has more", () => {
  const p = placePopover({ top: 500, left: 50, width: 80, height: 20 }, { width: 400, height: 300 }, vp);
  assert.equal(p.side, "above");
  assert.equal(p.top, 500 - 6 - 300);
});

test("shrinks (max height) when neither side fits the whole popover", () => {
  const p = placePopover({ top: 300, left: 50, width: 80, height: 20 }, { width: 400, height: 900 }, vp);
  assert.ok(p.maxHeight < 900 && p.maxHeight >= 120);
  assert.ok(p.top >= 8 && p.top + Math.min(900, p.maxHeight) <= 600 - 8 + 1);
});

test("slides back inside the viewport horizontally", () => {
  assert.equal(placePopover({ top: 10, left: 900, width: 50, height: 20 }, { width: 400, height: 100 }, vp).left, 1000 - 400 - 8);
  assert.equal(placePopover({ top: 10, left: -50, width: 50, height: 20 }, { width: 400, height: 100 }, vp).left, 8);
  assert.equal(placePopover({ top: 10, left: 0, width: 50, height: 20 }, { width: 2000, height: 100 }, vp).left, 8);
});

test("an anchor scrolled out of view keeps the popover clamped inside the viewport", () => {
  const p = placePopover({ top: -400, left: 10, width: 50, height: 20 }, { width: 300, height: 200 }, vp);
  assert.ok(p.top >= 8 && p.top <= 600 - 8);
});
