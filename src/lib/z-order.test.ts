import assert from "node:assert/strict";
import test from "node:test";

import { reorderInList } from "./z-order.ts";

test("front: moves to end", () => {
  assert.deepEqual(reorderInList(["a", "b", "c"], "a", "front"), ["b", "c", "a"]);
});

test("back: moves to start", () => {
  assert.deepEqual(reorderInList(["a", "b", "c"], "c", "back"), ["c", "a", "b"]);
});

test("forward: swaps with next", () => {
  assert.deepEqual(reorderInList(["a", "b", "c"], "a", "forward"), ["b", "a", "c"]);
});

test("backward: swaps with previous", () => {
  assert.deepEqual(reorderInList(["a", "b", "c"], "c", "backward"), ["a", "c", "b"]);
});

test("no-op returns same reference when already at edge", () => {
  const list = ["a", "b", "c"];
  assert.equal(reorderInList(list, "c", "front"), list);
  assert.equal(reorderInList(list, "a", "back"), list);
  assert.equal(reorderInList(list, "c", "forward"), list);
  assert.equal(reorderInList(list, "a", "backward"), list);
});

test("missing id returns same reference", () => {
  const list = ["a", "b"];
  assert.equal(reorderInList(list, "z", "front"), list);
});

test("does not mutate input", () => {
  const list = ["a", "b", "c"];
  reorderInList(list, "a", "front");
  assert.deepEqual(list, ["a", "b", "c"]);
});
