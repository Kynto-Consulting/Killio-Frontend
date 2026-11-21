import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addBookmarkLocal, BOOKMARK_LIMITS, clampNote, filterBookmarks, groupByRoom, normalizeBookmarks, plainExcerpt, removeBookmarkLocal, sortBookmarks, type Bookmark,
} from "./bookmarks.ts";

const bm = (id: string, room: string, at: string, extra: Partial<Bookmark> = {}): Bookmark => ({ messageId: id, roomId: room, roomName: `sala-${room}`, note: null, bookmarkedAt: at, content: `texto ${id}`, authorId: null, messageCreatedAt: null, ...extra });

test("the list answer is read tolerantly", () => {
  const list = normalizeBookmarks([{ messageId: "m1", roomId: "r1", roomName: "general", note: " guardar ", bookmarkedAt: "2026-01-02", content: "Hola" }, { messageId: "m2" }, null]);
  assert.equal(list.length, 1);
  assert.equal(list[0].note, "guardar");
  assert.deepEqual(normalizeBookmarks({}), []);
});

test("excerpt shows mentions as names and hides markup", () => {
  assert.equal(plainExcerpt("Hola @[Ana](u1) y @[user:u2:Beto] <asset type=\"img\" src=\"x\" /> mira   esto"), "Hola @Ana y @Beto mira esto");
  assert.equal(plainExcerpt("x".repeat(300), 10), `${"x".repeat(9)}…`);
});

test("notes are clamped to 500 characters", () => {
  assert.equal(clampNote(` ${"a".repeat(600)} `).length, BOOKMARK_LIMITS.note);
});

test("local patches keep newest first and replace an existing bookmark of the same message", () => {
  const base = [bm("m1", "r1", "2026-01-01"), bm("m2", "r1", "2026-01-03")];
  assert.deepEqual(sortBookmarks(base).map((b) => b.messageId), ["m2", "m1"]);
  const added = addBookmarkLocal(base, bm("m3", "r2", "2026-01-05"));
  assert.deepEqual(added.map((b) => b.messageId), ["m3", "m2", "m1"]);
  const replaced = addBookmarkLocal(added, bm("m1", "r1", "2026-01-09", { note: "nota" }));
  assert.deepEqual(replaced.map((b) => b.messageId), ["m1", "m3", "m2"]);
  assert.equal(replaced[0].note, "nota");
  assert.deepEqual(removeBookmarkLocal(replaced, "m3").map((b) => b.messageId), ["m1", "m2"]);
});

test("grouping by room keeps the order of first appearance", () => {
  const groups = groupByRoom([bm("m3", "r2", "3"), bm("m2", "r1", "2"), bm("m1", "r2", "1")]);
  assert.deepEqual(groups.map((g) => [g.roomId, g.items.length]), [["r2", 2], ["r1", 1]]);
});

test("filter ignores accents and case and searches text, note and room", () => {
  const list = [bm("m1", "r1", "1", { content: "Reunión de equipo" }), bm("m2", "r2", "2", { note: "revisar presupuesto" }), bm("m3", "r3", "3", { roomName: "Diseño" })];
  assert.deepEqual(filterBookmarks(list, "reunion").map((b) => b.messageId), ["m1"]);
  assert.deepEqual(filterBookmarks(list, "PRESUPUESTO").map((b) => b.messageId), ["m2"]);
  assert.deepEqual(filterBookmarks(list, "diseno").map((b) => b.messageId), ["m3"]);
  assert.equal(filterBookmarks(list, " ").length, 3);
});
