import test from "node:test";
import assert from "node:assert/strict";
import { mergeTimeline, ephemeralKey } from "./timeline.ts";
import { RoomCache } from "./room-cache.ts";

const at = (h: number, m = 0, s = 0) => new Date(Date.UTC(2026, 0, 1, h, m, s)).toISOString();
const msg = (id: string, h: number, m = 0) => ({ id, createdAt: at(h, m) });
const eph = (id: string, h: number, m = 0) => ({ id, createdAt: at(h, m) });
const keys = (l: { key: string }[]) => l.map((x) => x.key).join(",");

test("an ephemeral is placed among the messages by time, not at the end", () => {
  const out = mergeTimeline([msg("a", 12, 0), msg("b", 12, 41)], [eph("e1", 12, 10), eph("e2", 12, 20)]);
  assert.equal(keys(out), `a,${ephemeralKey("e1")},${ephemeralKey("e2")},b`);
});

test("the screenshot case: a later message comes after the older private answers", () => {
  const out = mergeTimeline([msg("m1", 11, 0), msg("arubik", 12, 41)], [eph("r1", 12, 0), eph("r2", 12, 0), eph("r3", 12, 0)]);
  assert.equal(out[out.length - 1]!.key, "arubik");
  assert.equal(out.filter((i) => i.kind === "ephemeral").length, 3);
});

test("equal timestamps: the normal message first, ephemerals after, ephemerals by their id", () => {
  const out = mergeTimeline([msg("z", 12, 0)], [eph("b", 12, 0), eph("a", 12, 0)]);
  assert.equal(keys(out), `z,${ephemeralKey("a")},${ephemeralKey("b")}`);
});

test("different dates keep chronological order across days", () => {
  const old = { id: "old", createdAt: "2026-01-01T23:59:00.000Z" };
  const next = { id: "next", createdAt: "2026-01-02T00:05:00.000Z" };
  const e = { id: "e", createdAt: "2026-01-02T00:00:00.000Z" };
  assert.equal(keys(mergeTimeline([old, next], [e])), `old,${ephemeralKey("e")},next`);
});

test("dismissing removes it without touching the rest (a dismissed ephemeral is simply not passed in)", () => {
  const messages = [msg("a", 1), msg("b", 3)];
  assert.equal(keys(mergeTimeline(messages, [eph("e", 2)])), `a,${ephemeralKey("e")},b`);
  assert.equal(keys(mergeTimeline(messages, [])), "a,b");
});

test("it does not mutate its inputs and is stable for the same input", () => {
  const messages = [msg("a", 1), msg("b", 3)];
  const e = [eph("e", 2)];
  const one = mergeTimeline(messages, e);
  const two = mergeTimeline(messages, e);
  assert.equal(messages.length, 2);
  assert.deepEqual(keys(one), keys(two));
});

test("with an empty room the ephemerals still show", () => {
  assert.equal(keys(mergeTimeline([], [eph("e", 5)])), ephemeralKey("e"));
});

test("a partial window holds back ephemerals outside it (they appear when their time is loaded)", () => {
  const messages = [msg("a", 10), msg("b", 12)];
  const early = eph("early", 8);
  const late = eph("late", 14);
  assert.equal(keys(mergeTimeline(messages, [early, late], { hasMoreBefore: true, hasMoreAfter: true })), "a,b");
  assert.equal(keys(mergeTimeline(messages, [early, late], {})), `${ephemeralKey("early")},a,b,${ephemeralKey("late")}`);
  assert.equal(keys(mergeTimeline(messages, [early, late], { hasMoreBefore: true })), `a,b,${ephemeralKey("late")}`);
});

test("a cached room: ephemerals are never stored in the cache window, so reopening cannot duplicate them", () => {
  const cache = new RoomCache();
  const messages = [msg("a", 1), msg("b", 3)];
  const e = [eph("e", 2)];
  const first = mergeTimeline(messages, e);
  cache.set("r", { messages, hasMoreBefore: false, hasMoreAfter: false, readState: null, unreadAnchorId: null, scroll: null, fetchedAt: 0 });
  const again = mergeTimeline(cache.get("r")!.messages, e);
  assert.equal(keys(first), keys(again));
  assert.equal(cache.get("r")!.messages.length, 2);
  assert.equal(again.filter((i) => i.kind === "ephemeral").length, 1);
});

test("a message that arrives later with an older timestamp still lands before the ephemeral", () => {
  const e = [eph("e", 12, 30)];
  const before = mergeTimeline([msg("a", 12, 0)], e);
  const after = mergeTimeline([msg("a", 12, 0), msg("late", 12, 10)], e);
  assert.equal(keys(before), `a,${ephemeralKey("e")}`);
  assert.equal(keys(after), `a,late,${ephemeralKey("e")}`);
});
