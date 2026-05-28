import assert from "node:assert/strict";
import test from "node:test";

import { outlineToSvgPath } from "./freehand.ts";

test("outlineToSvgPath: empty / single point returns empty string", () => {
  assert.equal(outlineToSvgPath([]), "");
  assert.equal(outlineToSvgPath([[0, 0]]), "");
});

test("outlineToSvgPath: produces a closed quadratic path", () => {
  const d = outlineToSvgPath([[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.ok(d.startsWith("M "), "starts with moveto");
  assert.ok(d.includes("Q"), "uses quadratic curves");
  assert.ok(d.endsWith(" Z"), "is closed");
});

test("outlineToSvgPath: coordinates are fixed to 2 decimals", () => {
  const d = outlineToSvgPath([[1.23456, 2.34567], [3, 4]]);
  assert.ok(d.includes("1.23"), "rounds x");
  assert.ok(d.includes("2.35"), "rounds y");
  assert.ok(!d.includes("1.23456"), "no raw float precision");
});
