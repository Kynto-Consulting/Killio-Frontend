import assert from "node:assert/strict";
import test from "node:test";

import { dashArrayFor, opacityFor, cornerRadiusFor, asStyle } from "./mesh-style.ts";

test("dashArrayFor: solid/undefined returns undefined", () => {
  assert.equal(dashArrayFor("solid", 2), undefined);
  assert.equal(dashArrayFor(undefined, 2), undefined);
});

test("dashArrayFor: dashed scales with stroke width", () => {
  assert.equal(dashArrayFor("dashed", 2), "6.0 5.0");
  assert.equal(dashArrayFor("dashed", 4), "12.0 10.0");
});

test("dashArrayFor: dotted produces tight dots", () => {
  assert.equal(dashArrayFor("dotted", 2), "2.0 4.0");
});

test("dashArrayFor: guards zero/negative width", () => {
  assert.equal(dashArrayFor("dashed", 0), "3.0 2.5");
  assert.equal(dashArrayFor("dashed", -5), "3.0 2.5");
});

test("opacityFor: default is 1", () => {
  assert.equal(opacityFor(undefined), 1);
  assert.equal(opacityFor({}), 1);
});

test("opacityFor: clamps to [0,1]", () => {
  assert.equal(opacityFor({ opacity: 0.5 }), 0.5);
  assert.equal(opacityFor({ opacity: -1 }), 0);
  assert.equal(opacityFor({ opacity: 2 }), 1);
  assert.equal(opacityFor({ opacity: NaN }), 1);
});

test("cornerRadiusFor: sharp=0, round=base", () => {
  assert.equal(cornerRadiusFor("sharp"), 0);
  assert.equal(cornerRadiusFor("round"), 10);
  assert.equal(cornerRadiusFor(undefined), 10);
  assert.equal(cornerRadiusFor("round", 16), 16);
});

test("asStyle: coerces non-objects to empty object", () => {
  assert.deepEqual(asStyle(null), {});
  assert.deepEqual(asStyle(undefined), {});
  assert.deepEqual(asStyle("x"), {});
  assert.deepEqual(asStyle({ opacity: 0.3 }), { opacity: 0.3 });
});
