import assert from "node:assert/strict";
import test from "node:test";

import { clearRoom, onIncoming, parseMutedIds, roomsToWatch, seedFromRooms, toggleMuted, withBadges } from "./unread.ts";

const base = { roomId: "a", activeRoomId: "b", fromSelf: false, mentioned: false };

test("a message from someone else in a closed room raises the badge", () => {
  const m1 = onIncoming({}, base);
  assert.deepEqual(m1, { a: { unread: 1, mentions: 0 } });
  const m2 = onIncoming(m1, { ...base, mentioned: true });
  assert.deepEqual(m2, { a: { unread: 2, mentions: 1 } });
});

test("own messages, the open room and system banners never count", () => {
  assert.deepEqual(onIncoming({}, { ...base, fromSelf: true }), {});
  assert.deepEqual(onIncoming({}, { ...base, activeRoomId: "a" }), {});
  assert.deepEqual(onIncoming({}, { ...base, isSystem: true }), {});
});

test("opening a room clears its badge and leaves the others", () => {
  const map = { a: { unread: 3, mentions: 1 }, c: { unread: 1, mentions: 0 } };
  assert.deepEqual(clearRoom(map, "a"), { c: { unread: 1, mentions: 0 } });
  assert.equal(clearRoom(map, "zzz"), map, "unknown room: same object");
});

test("server counters only seed rooms that are not tracked, never the open one", () => {
  const map = { a: { unread: 5, mentions: 0 } };
  const seeded = seedFromRooms(map, [
    { id: "a", unreadCount: 9 },
    { id: "b", unreadCount: 4, mentionCount: 2 },
    { id: "c", unreadCount: 0 },
    { id: "d", unreadCount: 2 },
  ], "b");
  assert.deepEqual(seeded, { a: { unread: 5, mentions: 0 }, d: { unread: 2, mentions: 0 } });
  assert.equal(seedFromRooms(map, [], null), map);
});

test("withBadges decorates rooms with counters and the muted flag", () => {
  const out = withBadges([{ id: "a" }, { id: "b" }], { a: { unread: 2, mentions: 1 } }, new Set(["b"]));
  assert.deepEqual(out, [
    { id: "a", unreadCount: 2, mentionCount: 1, muted: false },
    { id: "b", unreadCount: 0, mentionCount: 0, muted: true },
  ]);
});

test("only a bounded set of closed rooms is watched", () => {
  const rooms = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, type: "channel" }));
  const watched = roomsToWatch(rooms, "r0", 40);
  assert.equal(watched.length, 40);
  assert.ok(!watched.some((r) => r.id === "r0"));
});

test("muted ids survive corrupted storage", () => {
  assert.deepEqual([...parseMutedIds('["a","b"]')], ["a", "b"]);
  assert.equal(parseMutedIds("{not json").size, 0);
  assert.equal(parseMutedIds(null).size, 0);
  assert.deepEqual([...parseMutedIds('[1,"a",null]')], ["a"]);
  const s = toggleMuted(new Set(["a"]), "b", true);
  assert.deepEqual([...s].sort(), ["a", "b"]);
  assert.deepEqual([...toggleMuted(s, "a", false)], ["b"]);
});
