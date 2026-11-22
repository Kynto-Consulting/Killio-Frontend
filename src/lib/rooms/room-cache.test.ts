import test from "node:test";
import assert from "node:assert/strict";
import { DraftStore, RoomCache, ROOM_CACHE_MESSAGES, isFresh, mergeFreshPage, restoreTarget, type RoomSnapshot } from "./room-cache.ts";

const m = (id: string, s: number, extra: Record<string, unknown> = {}) => ({ id, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString(), ...extra });
const snap = (messages: ReturnType<typeof m>[] = [m("a", 1)], extra: Partial<RoomSnapshot> = {}): RoomSnapshot => ({ messages, hasMoreBefore: false, hasMoreAfter: false, readState: null, unreadAnchorId: null, scroll: null, fetchedAt: 0, ...extra });
const ids = (l: { id: string }[]) => l.map((x) => x.id).join(",");

test("LRU: the least recently used room is evicted past the capacity; get refreshes recency", () => {
  const c = new RoomCache(3);
  c.set("r1", snap()); c.set("r2", snap()); c.set("r3", snap());
  c.get("r1");
  c.set("r4", snap());
  assert.deepEqual(c.keys(), ["r3", "r1", "r4"]);
  assert.equal(c.has("r2"), false);
});

test("peek does not change the recency", () => {
  const c = new RoomCache(2);
  c.set("r1", snap()); c.set("r2", snap());
  c.peek("r1");
  c.set("r3", snap());
  assert.equal(c.has("r1"), false);
});

test("default capacity is 15 rooms", () => {
  const c = new RoomCache();
  for (let i = 0; i < 20; i++) c.set(`r${i}`, snap());
  assert.equal(c.size, 15);
  assert.equal(c.has("r4"), false);
  assert.equal(c.has("r5"), true);
});

test("scroll position is saved and restored; a bottom position opens at the bottom", () => {
  const c = new RoomCache();
  c.set("r1", snap());
  c.saveScroll("r1", 420.6, false);
  assert.deepEqual(restoreTarget(c.get("r1")), { kind: "scroll", top: 421 });
  c.saveScroll("r1", 900, true);
  assert.deepEqual(restoreTarget(c.get("r1")), { kind: "bottom" });
  assert.deepEqual(restoreTarget(undefined), { kind: "bottom" });
  c.saveScroll("nope", 5, false);
  assert.equal(c.has("nope"), false);
});

test("an unread divider wins over a saved scroll position", () => {
  assert.deepEqual(restoreTarget(snap([], { unreadAnchorId: "x", scroll: { top: 10, atBottom: false } })), { kind: "divider" });
});

test("a long window is trimmed to the newest messages and its pixel scroll is dropped", () => {
  const c = new RoomCache();
  const many = Array.from({ length: ROOM_CACHE_MESSAGES + 30 }, (_, i) => m(`m${String(i).padStart(4, "0")}`, i));
  c.set("r", snap(many, { scroll: { top: 99, atBottom: false } }));
  const s = c.get("r")!;
  assert.equal(s.messages.length, ROOM_CACHE_MESSAGES);
  assert.equal(s.messages[s.messages.length - 1]!.id, many[many.length - 1]!.id);
  assert.equal(s.hasMoreBefore, true);
  assert.equal(s.scroll, null);
});

test("invalidate and clear forget rooms; a new scope (another user) empties the cache", () => {
  const c = new RoomCache();
  c.setScope("u1");
  c.set("r1", snap()); c.set("r2", snap());
  c.invalidate("r1");
  assert.deepEqual(c.keys(), ["r2"]);
  c.setScope("u1");
  assert.equal(c.size, 1);
  c.setScope("u2");
  assert.equal(c.size, 0);
});

test("messages that arrive for a room that is not open are added in order to its cached window", () => {
  const c = new RoomCache();
  c.set("r", snap([m("a", 1), m("c", 5)]));
  assert.equal(c.applyLive("r", m("b", 3)), true);
  assert.equal(c.applyLive("r", m("b", 3, { content: "edited" })), true);
  assert.equal(ids(c.get("r")!.messages), "a,b,c");
  assert.equal((c.get("r")!.messages[1] as { content?: string }).content, "edited");
  assert.equal(c.applyLive("other", m("z", 9)), false);
});

test("a window detached from the present does not take live messages (revalidation fetches them)", () => {
  const c = new RoomCache();
  c.set("r", snap([m("a", 1)], { hasMoreAfter: true }));
  assert.equal(c.applyLive("r", m("z", 9)), false);
  assert.equal(c.get("r")!.messages.length, 1);
});

test("mergeFreshPage: fresh messages win, older cached history is kept, deleted ones inside the range disappear", () => {
  const cached = { messages: [m("old1", 1), m("old2", 2), m("a", 10, { content: "stale" }), m("gone", 11), m("b", 12)], hasMoreBefore: true, hasMoreAfter: false };
  const fresh = { messages: [m("a", 10, { content: "fresh" }), m("b", 12), m("new", 20)], hasMoreBefore: true, hasMoreAfter: false };
  const out = mergeFreshPage(cached, fresh);
  assert.equal(ids(out.messages), "old1,old2,a,b,new");
  assert.equal((out.messages[2] as { content?: string }).content, "fresh");
  assert.equal(out.hasMoreBefore, true);
});

test("mergeFreshPage keeps local placeholders in their time slot and an earlier late message is ordered", () => {
  const cached = { messages: [m("a", 10), m("temp-1", 30, { status: "sending" })], hasMoreBefore: false, hasMoreAfter: false };
  const fresh = { messages: [m("late", 9), m("a", 10), m("b", 25)], hasMoreBefore: false, hasMoreAfter: false };
  assert.equal(ids(mergeFreshPage(cached, fresh).messages), "late,a,b,temp-1");
});

test("mergeFreshPage on an emptied room keeps only local messages", () => {
  const out = mergeFreshPage({ messages: [m("a", 1), m("temp-1", 2)], hasMoreBefore: true, hasMoreAfter: false }, { messages: [], hasMoreBefore: false, hasMoreAfter: false });
  assert.equal(ids(out.messages), "temp-1");
  assert.equal(out.hasMoreBefore, false);
});

test("isFresh: a recent snapshot needs no prefetch", () => {
  assert.equal(isFresh({ fetchedAt: 1000 }, 1500), true);
  assert.equal(isFresh({ fetchedAt: 1000 }, 100_000), false);
  assert.equal(isFresh(undefined, 1), false);
});

test("drafts are kept per room and cleared when empty", () => {
  const d = new DraftStore();
  d.save("r1", "hello"); d.save("r2", "other");
  assert.equal(d.get("r1"), "hello");
  assert.equal(d.get("r2"), "other");
  d.save("r1", "   ");
  assert.equal(d.get("r1"), "");
  assert.equal(d.size, 1);
  assert.equal(d.get(null), "");
});
