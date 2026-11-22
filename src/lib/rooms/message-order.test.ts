import test from "node:test";
import assert from "node:assert/strict";
import { insertOrdered, isOrdered, normalizeOrder, reconcileOptimistic } from "./message-order.ts";

type Msg = { id: string; createdAt: string; [k: string]: unknown };
const m = (id: string, at: string, extra: Record<string, unknown> = {}): Msg => ({ id, createdAt: `2026-01-01T00:00:${at}.000Z`, ...extra });
const ids = (l: { id: string }[]) => l.map((x) => x.id).join(",");

test("insertOrdered puts a message at its chronological place, never at the end by default", () => {
  const list = [m("a", "01"), m("c", "03")];
  assert.equal(ids(insertOrdered(list, m("b", "02"))), "a,b,c");
  assert.equal(ids(insertOrdered(list, m("z", "09"))), "a,c,z");
  assert.equal(ids(insertOrdered(list, m("0", "00"))), "0,a,c");
  assert.equal(ids(insertOrdered([], m("a", "01"))), "a");
});

test("a late arrival of an earlier message slots in before the newer ones", () => {
  const list = [m("a", "01"), m("c", "05"), m("d", "06")];
  assert.equal(ids(insertOrdered(list, m("b", "03"))), "a,b,c,d");
});

test("equal timestamps tie-break by id and are stable whatever the arrival order", () => {
  const x = m("b", "02"), y = m("a", "02"), z = m("c", "02");
  assert.equal(ids(insertOrdered(insertOrdered(insertOrdered([], x), y), z)), "a,b,c");
  assert.equal(ids(insertOrdered(insertOrdered(insertOrdered([], z), x), y)), "a,b,c");
});

test("a known id is not duplicated: it is merged and re-placed by its new time", () => {
  const list = [m("a", "01", { content: "old" }), m("b", "02")];
  const next = insertOrdered(list, { id: "a", createdAt: "2026-01-01T00:00:05.000Z", content: "new" });
  assert.equal(ids(next), "b,a");
  assert.equal((next[1] as { content?: string }).content, "new");
  assert.equal(next.length, 2);
});

test("insertOrdered does not mutate its input", () => {
  const list = [m("a", "01")];
  insertOrdered(list, m("b", "02"));
  assert.equal(list.length, 1);
});

test("optimistic -> definitive: the placeholder is removed and the message moves to the server time", () => {
  const list = [m("a", "01"), m("other", "04"), m("temp-1", "05", { status: "sending" })];
  const next = reconcileOptimistic(list, "temp-1", m("real", "03", { status: "sent" }));
  assert.equal(ids(next), "a,real,other");
});

test("optimistic -> definitive when the realtime echo already added the definitive message", () => {
  const list = [m("a", "01"), m("real", "03"), m("temp-1", "03", { status: "sending" })];
  const next = reconcileOptimistic(list, "temp-1", m("real", "03", { status: "sent" }));
  assert.equal(ids(next), "a,real");
  assert.equal((next[1] as { status?: string }).status, "sent");
});

test("the placeholder keeps its local place while it is sending (ordered by local time)", () => {
  const list = [m("a", "01"), m("b", "05")];
  assert.equal(ids(insertOrdered(list, m("temp-9", "06", { status: "sending" }))), "a,b,temp-9");
});

test("normalizeOrder sorts a batch, drops duplicate ids and keeps the later fields", () => {
  const next = normalizeOrder([m("b", "02"), m("a", "01", { v: 1 }), m("a", "01", { v: 2 }), m("c", "02")]);
  assert.equal(ids(next), "a,b,c");
  assert.equal((next[0] as { v?: number }).v, 2);
  assert.ok(isOrdered(next));
});

test("isOrdered flags disorder and duplicates", () => {
  assert.equal(isOrdered([m("a", "02"), m("b", "01")]), false);
  assert.equal(isOrdered([m("a", "01"), m("a", "01")]), false);
  assert.equal(isOrdered([m("a", "01"), m("b", "01"), m("c", "02")]), true);
});

test("a bot answer is ordered by its real createdAt like any other message", () => {
  const list = [m("u1", "01"), m("u2", "02"), m("u3", "03")];
  const bot = m("bot1", "02", { metadata: { interaction: { id: "i" } } });
  assert.equal(ids(insertOrdered(list, bot)), "u1,bot1,u2,u3");
});
