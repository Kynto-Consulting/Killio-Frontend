import assert from "node:assert/strict";
import test from "node:test";

import { offlineBrickSupport, isOfflineEditable } from "./offline-bricks.ts";

test("full-support kinds", () => {
  for (const k of ["text", "checklist", "table", "beautiful_table", "code", "math", "image", "accordion", "tabs", "columns", "graph"]) {
    assert.equal(offlineBrickSupport(k), "full", k);
  }
});

test("degraded kinds", () => {
  for (const k of ["bookmark", "form", "popup_document"]) {
    assert.equal(offlineBrickSupport(k), "degraded", k);
  }
});

test("unsupported kinds", () => {
  for (const k of ["ai", "payment", "database"]) {
    assert.equal(offlineBrickSupport(k), "unsupported", k);
  }
});

test("unknown kind defaults to degraded", () => {
  assert.equal(offlineBrickSupport("some_future_brick"), "degraded");
});

test("isOfflineEditable covers text-like kinds only", () => {
  assert.equal(isOfflineEditable("text"), true);
  assert.equal(isOfflineEditable("callout"), true);
  assert.equal(isOfflineEditable("code"), true);
  assert.equal(isOfflineEditable("table"), false);
  assert.equal(isOfflineEditable("ai"), false);
});
