import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLayoutToRooms, deleteConfirmationMatches, deleteErrorKind, deletedRoomId, moveChannel, nextRoomAfterDelete, removeRoomById, sameLayout,
  shiftChannel, toLayoutItems, type ChannelSection,
} from "./channel-order.ts";

const base: ChannelSection[] = [
  { categoryId: null, roomIds: ["a"] },
  { categoryId: "c1", roomIds: ["b", "c", "d"] },
  { categoryId: "c2", roomIds: [] },
];

test("toLayoutItems flattens in display order", () => {
  assert.deepEqual(toLayoutItems(base), [
    { roomId: "a", categoryId: null }, { roomId: "b", categoryId: "c1" }, { roomId: "c", categoryId: "c1" }, { roomId: "d", categoryId: "c1" },
  ]);
});

test("moveChannel reorders inside a category and does not mutate the input", () => {
  const next = moveChannel(base, "d", "c1", "b");
  assert.deepEqual(next[1].roomIds, ["d", "b", "c"]);
  assert.deepEqual(base[1].roomIds, ["b", "c", "d"]);
});

test("moveChannel moves across categories, to the end or into an empty one", () => {
  assert.deepEqual(moveChannel(base, "b", "c2")[2].roomIds, ["b"]);
  const next = moveChannel(base, "a", "c1", "c");
  assert.deepEqual(next[0].roomIds, []);
  assert.deepEqual(next[1].roomIds, ["b", "a", "c", "d"]);
  assert.deepEqual(moveChannel(base, "c", null)[0].roomIds, ["a", "c"]);
});

test("moveChannel ignores unknown ids and self drops", () => {
  assert.ok(sameLayout(moveChannel(base, "zz", "c1"), base));
  assert.ok(sameLayout(moveChannel(base, "b", "nope"), base));
  assert.ok(sameLayout(moveChannel(base, "b", "c1", "b"), base));
});

test("shiftChannel swaps with the neighbour and jumps categories at the edges", () => {
  assert.deepEqual(shiftChannel(base, "c", -1)[1].roomIds, ["c", "b", "d"]);
  const up = shiftChannel(base, "b", -1);
  assert.deepEqual(up[0].roomIds, ["a", "b"]);
  assert.deepEqual(up[1].roomIds, ["c", "d"]);
  const down = shiftChannel(base, "d", 1);
  assert.deepEqual(down[2].roomIds, ["d"]);
  assert.ok(sameLayout(shiftChannel(base, "a", -1), base));
  const single: ChannelSection[] = [{ categoryId: "c1", roomIds: ["x"] }];
  assert.ok(sameLayout(shiftChannel(single, "x", 1), single));
});

test("applyLayoutToRooms sets category and position, leaves others alone", () => {
  const rooms = [{ id: "a", sortOrder: 5 }, { id: "b", groupId: "c1", categoryId: "c1" }, { id: "dm", sortOrder: 9 }];
  const out = applyLayoutToRooms(rooms, [{ roomId: "b", categoryId: null }, { roomId: "a", categoryId: "c2" }]);
  assert.deepEqual(out[0], { id: "a", groupId: "c2", categoryId: "c2", sortOrder: 1 });
  assert.deepEqual(out[1], { id: "b", groupId: undefined, categoryId: undefined, sortOrder: 0 });
  assert.equal(out[2], rooms[2]);
});

test("deleteConfirmationMatches compares the name loosely", () => {
  assert.ok(deleteConfirmationMatches("  #General ", "general"));
  assert.ok(!deleteConfirmationMatches("gener", "general"));
  assert.ok(!deleteConfirmationMatches("", ""));
});

test("nextRoomAfterDelete prefers the neighbour", () => {
  assert.equal(nextRoomAfterDelete(["a", "b", "c"], "b"), "c");
  assert.equal(nextRoomAfterDelete(["a", "b", "c"], "c"), "b");
  assert.equal(nextRoomAfterDelete(["a"], "a"), null);
  assert.equal(nextRoomAfterDelete(["a", "b"], "zz"), "a");
});

test("removeRoomById, deletedRoomId and deleteErrorKind", () => {
  assert.deepEqual(removeRoomById([{ id: "a" }, { id: "b" }], "a"), [{ id: "b" }]);
  assert.equal(deletedRoomId({ roomId: "r" }), "r");
  assert.equal(deletedRoomId({ id: "x" }), "x");
  assert.equal(deletedRoomId(null), null);
  assert.equal(deletedRoomId({ roomId: 3 }), null);
  assert.deepEqual([400, 403, 404, 500, undefined].map(deleteErrorKind), ["badRequest", "forbidden", "notFound", "other", "other"]);
});
