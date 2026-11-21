import test from "node:test";
import assert from "node:assert/strict";

import {
  createDebounced, emptyHistory, formatNewCount, historyReducer, mergeById, newerFromOthers, normalizePage, normalizeReadState,
  shouldMarkRead, sortMessages, trimWindow, unreadDividerId, type HistoryPage, type HistoryState, type ReadState,
} from "./history.ts";

type M = { id: string; createdAt: string; userId?: string; status?: string; deleted?: boolean; content?: string };
const at = (n: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, n)).toISOString();
const msg = (n: number, extra: Partial<M> = {}): M => ({ id: `m${String(n).padStart(4, "0")}`, createdAt: at(n), userId: "u1", ...extra });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => msg(a + i));
const ids = (list: M[]) => list.map((m) => m.id);
const page = (messages: M[], more: Partial<HistoryPage<M>> = {}): HistoryPage<M> => ({
  messages, hasMoreBefore: false, hasMoreAfter: false, anchorMessageId: null, legacy: false, ...more,
});
const reduce = (s: HistoryState<M>, a: Parameters<typeof historyReducer<M>>[1], rules?: Parameters<typeof historyReducer<M>>[2]) => historyReducer<M>(s, a, rules);

test("normalizePage: paged answer keeps the flags and the anchor", () => {
  const p = normalizePage<M>({ messages: [msg(2), msg(1)], hasMoreBefore: true, hasMoreAfter: false, anchorMessageId: "m0002" });
  assert.deepEqual(ids(p.messages), ["m0001", "m0002"]);
  assert.equal(p.hasMoreBefore, true);
  assert.equal(p.hasMoreAfter, false);
  assert.equal(p.anchorMessageId, "m0002");
  assert.equal(p.legacy, false);
});

test("normalizePage: a bare array is legacy; a full page suggests more before", () => {
  const full = normalizePage<M>(range(1, 50), { limit: 50 });
  assert.equal(full.legacy, true);
  assert.equal(full.hasMoreBefore, true);
  assert.equal(full.hasMoreAfter, false);
  const short = normalizePage<M>(range(1, 10), { limit: 50 });
  assert.equal(short.hasMoreBefore, false);
});

test("normalizePage: drops tombstones and junk, tolerates a broken body", () => {
  const p = normalizePage<M>({ messages: [msg(1), msg(2, { deleted: true }), null, { nope: 1 }] });
  assert.deepEqual(ids(p.messages), ["m0001"]);
  const empty = normalizePage<M>(null);
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.hasMoreBefore, false);
});

test("sortMessages: ties on the same instant are ordered by id", () => {
  const a = { id: "b", createdAt: at(1) };
  const b = { id: "a", createdAt: at(1) };
  assert.deepEqual(sortMessages([a, b]).map((m) => m.id), ["a", "b"]);
});

test("reducer: replace sets the window and the flags, and resets the pending counter", () => {
  const s0: HistoryState<M> = { ...emptyHistory<M>(), pendingNew: 4 };
  const s1 = reduce(s0, { type: "replace", page: page(range(10, 20), { hasMoreBefore: true, hasMoreAfter: true }) });
  assert.equal(s1.messages.length, 11);
  assert.equal(s1.hasMoreBefore, true);
  assert.equal(s1.hasMoreAfter, true);
  assert.equal(s1.pendingNew, 0);
});

test("reducer: replace keeps local placeholders only when asked", () => {
  const s0: HistoryState<M> = { ...emptyHistory<M>(), messages: [msg(1), { id: "temp-1", createdAt: at(99), status: "sending" }] };
  const kept = reduce(s0, { type: "replace", page: page(range(1, 3)), keepLocal: true });
  assert.ok(kept.messages.some((m) => m.id === "temp-1"));
  const dropped = reduce(s0, { type: "replace", page: page(range(1, 3)) });
  assert.ok(!dropped.messages.some((m) => m.id === "temp-1"));
});

test("reducer: prepend adds older messages in order and takes hasMoreBefore from the page", () => {
  const s0 = reduce(emptyHistory<M>(), { type: "replace", page: page(range(51, 100), { hasMoreBefore: true }) });
  const s1 = reduce(s0, { type: "prepend", page: page(range(1, 50), { hasMoreBefore: false }) });
  assert.equal(s1.messages.length, 100);
  assert.equal(s1.messages[0].id, "m0001");
  assert.equal(s1.hasMoreBefore, false);
});

test("reducer: duplicated ids between pages are merged, not repeated (incoming fields win)", () => {
  const s0 = reduce(emptyHistory<M>(), { type: "replace", page: page([msg(5, { content: "old" }), msg(6)]) });
  const s1 = reduce(s0, { type: "prepend", page: page([msg(4), msg(5, { content: "new" })]) });
  assert.deepEqual(ids(s1.messages), ["m0004", "m0005", "m0006"]);
  assert.equal(s1.messages[1].content, "new");
});

test("reducer: append after a jump takes hasMoreAfter and clears pending when it reaches the present", () => {
  let s = reduce(emptyHistory<M>(), { type: "replace", page: page(range(1, 50), { hasMoreAfter: true }) });
  s = reduce(s, { type: "live", message: msg(500) });
  assert.equal(s.pendingNew, 1);
  assert.equal(s.messages.length, 50, "a live message is not added while detached");
  s = reduce(s, { type: "append", page: page(range(51, 100), { hasMoreAfter: true }) });
  assert.equal(s.hasMoreAfter, true);
  assert.equal(s.pendingNew, 1);
  s = reduce(s, { type: "append", page: page(range(101, 110), { hasMoreAfter: false }) });
  assert.equal(s.hasMoreAfter, false);
  assert.equal(s.pendingNew, 0);
});

test("reducer: live message is appended at the present, and a known one is updated in place", () => {
  let s = reduce(emptyHistory<M>(), { type: "replace", page: page(range(1, 3)) });
  s = reduce(s, { type: "live", message: msg(4) });
  assert.deepEqual(ids(s.messages), ["m0001", "m0002", "m0003", "m0004"]);
  s = reduce(s, { type: "live", message: msg(4, { content: "edited" }) });
  assert.equal(s.messages.length, 4);
  assert.equal(s.messages[3].content, "edited");
  assert.equal(s.pendingNew, 0);
});

test("reducer: a live message already loaded by a page is not duplicated while detached", () => {
  let s = reduce(emptyHistory<M>(), { type: "replace", page: page(range(1, 5), { hasMoreAfter: true }) });
  s = reduce(s, { type: "live", message: msg(3, { content: "x" }) });
  assert.equal(s.pendingNew, 0);
  assert.equal(s.messages[2].content, "x");
});

test("trimWindow: below the limit nothing changes (same array)", () => {
  const list = range(1, 100);
  const out = trimWindow(list, "top", { max: 300 });
  assert.equal(out.messages, list);
  assert.equal(out.trimmed, false);
});

test("trimWindow: trims the far edge down to the target and never drops protected messages", () => {
  const list = [...range(1, 320), { id: "temp-9", createdAt: at(1), status: "sending" } as M];
  const sorted = sortMessages(list);
  const top = trimWindow(sorted, "top", { max: 300, trimTo: 200 });
  assert.equal(top.trimmed, true);
  assert.equal(top.messages.length, 200);
  assert.ok(top.messages.some((m) => m.id === "temp-9"), "protected survives although it is the oldest");
  assert.equal(top.messages[top.messages.length - 1].id, "m0320");
  const bottom = trimWindow(sorted, "bottom", { max: 300, trimTo: 200 });
  assert.equal(bottom.messages.length, 200);
  assert.equal(bottom.messages[0].id, "m0001".replace("1", "1"));
});

test("trimWindow: a custom protect keeps the replies of the open thread", () => {
  const list = range(1, 320).map((m, i) => (i < 5 ? { ...m, threadRootId: "root" } : m));
  const out = trimWindow(list as M[], "top", { max: 300, trimTo: 200, protect: (m) => (m as M & { threadRootId?: string }).threadRootId === "root" });
  assert.equal(out.messages.filter((m) => (m as M & { threadRootId?: string }).threadRootId === "root").length, 5);
  assert.equal(out.messages.length, 200);
});

test("reducer: appending past the window trims the top and marks hasMoreBefore", () => {
  let s = reduce(emptyHistory<M>(), { type: "replace", page: page(range(1, 280), { hasMoreBefore: false, hasMoreAfter: true }) });
  s = reduce(s, { type: "append", page: page(range(281, 330), { hasMoreAfter: true }) });
  assert.ok(s.messages.length <= 300);
  assert.equal(s.hasMoreBefore, true);
  assert.equal(s.messages[s.messages.length - 1].id, "m0330");
});

test("reducer: prepending past the window trims the bottom and detaches from the present", () => {
  let s = reduce(emptyHistory<M>(), { type: "replace", page: page(range(100, 380), { hasMoreBefore: true, hasMoreAfter: false }) });
  s = reduce(s, { type: "prepend", page: page(range(50, 99), { hasMoreBefore: true }) });
  assert.ok(s.messages.length <= 300);
  assert.equal(s.hasMoreAfter, true);
  assert.equal(s.messages[0].id, "m0050");
  // from now on live messages are counted, not appended
  s = reduce(s, { type: "live", message: msg(900) });
  assert.equal(s.pendingNew, 1);
});

test("reducer: map applies an arbitrary change without touching the flags", () => {
  const s0 = reduce(emptyHistory<M>(), { type: "replace", page: page(range(1, 3), { hasMoreBefore: true }) });
  const s1 = reduce(s0, { type: "map", fn: (l) => l.filter((m) => m.id !== "m0002") });
  assert.deepEqual(ids(s1.messages), ["m0001", "m0003"]);
  assert.equal(s1.hasMoreBefore, true);
});

test("mergeById: incoming overrides field by field", () => {
  const out = mergeById<M>([msg(1, { content: "a", status: "read" })], [msg(1, { content: "b" })]);
  assert.equal(out[0].content, "b");
  assert.equal(out[0].status, "read");
});

// ── read state ──

const rs = (over: Partial<ReadState> = {}): ReadState => ({
  lastReadMessageId: null, lastReadAt: null, firstUnreadMessageId: null, firstUnreadAt: null, unreadCount: 0, unreadMentions: 0, unreadCapped: false, ...over,
});

test("normalizeReadState: tolerant to missing fields and wrong types", () => {
  assert.equal(normalizeReadState(null), null);
  const s = normalizeReadState({ unreadCount: 3, unreadMentions: "x", firstUnreadMessageId: "m1", unreadCapped: true });
  assert.equal(s?.unreadCount, 3);
  assert.equal(s?.unreadMentions, 0);
  assert.equal(s?.firstUnreadMessageId, "m1");
  assert.equal(s?.unreadCapped, true);
  assert.equal(s?.lastReadAt, null);
});

test("unreadDividerId: none without unread; the server id wins when loaded", () => {
  const list = range(1, 10);
  assert.equal(unreadDividerId(list, rs(), "me"), null);
  assert.equal(unreadDividerId(list, rs({ unreadCount: 3, firstUnreadMessageId: "m0008" }), "me"), "m0008");
});

test("unreadDividerId: not loaded id falls back to the first newer message from others", () => {
  const list = [msg(1), msg(2, { userId: "me" }), msg(3), msg(4)];
  const id = unreadDividerId(list, rs({ unreadCount: 2, firstUnreadMessageId: "gone", lastReadAt: at(1) }), "me");
  assert.equal(id, "m0003", "own messages are never 'unread'");
  assert.equal(unreadDividerId(list, rs({ unreadCount: 2, firstUnreadMessageId: "gone" }), "me"), null, "no boundary at all");
});

test("shouldMarkRead: only forward, only loaded, never placeholders", () => {
  const list = range(1, 10);
  assert.equal(shouldMarkRead(list, null, "m0005"), true);
  assert.equal(shouldMarkRead(list, "m0005", "m0005"), false);
  assert.equal(shouldMarkRead(list, "m0007", "m0005"), false);
  assert.equal(shouldMarkRead(list, "m0005", "m0009"), true);
  assert.equal(shouldMarkRead(list, null, "unknown"), false);
  assert.equal(shouldMarkRead(list, null, "temp-1"), false);
  assert.equal(shouldMarkRead(list, "not-loaded", "m0002"), true, "unknown marker counts as nothing reported");
});

test("newerFromOthers: counts messages after the marker that are not mine nor local", () => {
  const list = [msg(1), msg(2, { userId: "me" }), msg(3), msg(4), { id: "temp-1", createdAt: at(50), userId: "me" } as M];
  assert.equal(newerFromOthers(list, "m0001", "me"), 2);
  assert.equal(newerFromOthers(list, null, "me"), 3);
  assert.equal(newerFromOthers(list, "m0004", "me"), 0);
});

test("formatNewCount caps at 99+", () => {
  assert.equal(formatNewCount(0), "0");
  assert.equal(formatNewCount(7), "7");
  assert.equal(formatNewCount(100), "99+");
});

test("createDebounced: only the last call runs; flush runs it now; cancel drops it", () => {
  const timers: Array<{ fn: () => void; id: number; live: boolean }> = [];
  let n = 0;
  const set = ((fn: () => void) => { const t = { fn, id: ++n, live: true }; timers.push(t); return t.id; }) as unknown as typeof setTimeout;
  const clear = ((id: number) => { const t = timers.find((x) => x.id === id); if (t) t.live = false; }) as unknown as typeof clearTimeout;
  const seen: string[] = [];
  const d = createDebounced((v: string) => seen.push(v), 800, { set, clear });
  d.call("a"); d.call("b"); d.call("c");
  timers.filter((t) => t.live).forEach((t) => t.fn());
  assert.deepEqual(seen, ["c"]);
  d.call("d");
  d.flush();
  assert.deepEqual(seen, ["c", "d"]);
  d.call("e");
  d.cancel();
  timers.filter((t) => t.live).forEach((t) => t.fn());
  assert.deepEqual(seen, ["c", "d"]);
});

// ── thread window ──

import { rangeAfterPage, windowReplies } from "./history.ts";

test("windowReplies: no range shows everything; a range hides replies outside it, never local placeholders", () => {
  const list = [...range(1, 10), { id: "temp-1", createdAt: at(99), status: "sending" } as M];
  assert.equal(windowReplies(list, null).length, 11);
  const out = windowReplies(list, { from: Date.parse(at(4)), to: Date.parse(at(7)) });
  assert.deepEqual(ids(out), ["m0004", "m0005", "m0006", "m0007", "temp-1"]);
  assert.equal(windowReplies(list, { from: null, to: null }).length, 11);
});

test("rangeAfterPage: replace / before / after keep the range contiguous", () => {
  const latest = rangeAfterPage(null, page(range(51, 100), { hasMoreBefore: true }), "replace");
  assert.deepEqual(latest, { from: Date.parse(at(51)), to: null });
  const older = rangeAfterPage(latest, page(range(1, 50), { hasMoreBefore: false }), "before");
  assert.deepEqual(older, { from: null, to: null });
  const around = rangeAfterPage(null, page(range(20, 30), { hasMoreBefore: true, hasMoreAfter: true }), "replace");
  assert.deepEqual(around, { from: Date.parse(at(20)), to: Date.parse(at(30)) });
  const newer = rangeAfterPage(around, page(range(31, 40), { hasMoreBefore: true, hasMoreAfter: false }), "after");
  assert.deepEqual(newer, { from: Date.parse(at(20)), to: null });
});
