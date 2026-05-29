import test from "node:test";
import assert from "node:assert/strict";
import { computeBoardBatch, applyBoardBatch, makeBoardApplier, BOARD_BATCH } from "./board-ops.ts";

type L = { id: string; title: string; cards: any[] };
const card = (id: string, extra: any = {}) => ({ id, title: id, ...extra });
const list = (id: string, cards: any[] = [], title = id): L => ({ id, title, cards });

const flatIds = (lists: L[]) => lists.map((l) => `${l.id}:[${l.cards.map((c) => c.id).join(",")}]`).join(" ");

// ── computeBoardBatch ────────────────────────────────────────────────────────
test("board: identical → null", () => {
  const a = [list("l1", [card("c1")])];
  const b = [list("l1", [card("c1")])];
  assert.equal(computeBoardBatch(a, b), null);
});

test("board: card created", () => {
  const d = computeBoardBatch([list("l1", [])], [list("l1", [card("c1")])])!;
  assert.equal(d.type, BOARD_BATCH);
  assert.equal(d.payload.cards.created[0].card.id, "c1");
  assert.equal(d.inverse.payload.cards.removed[0].card.id, "c1");
});

test("board: card removed keeps full object", () => {
  const d = computeBoardBatch([list("l1", [card("c1", { summary: "keep" })])], [list("l1", [])])!;
  assert.equal(d.payload.cards.removed[0].card.summary, "keep");
  assert.equal(d.inverse.payload.cards.created[0].card.summary, "keep");
});

test("board: card moved across lists = updated with prev", () => {
  const before = [list("l1", [card("c1")]), list("l2", [])];
  const after = [list("l1", []), list("l2", [card("c1")])];
  const d = computeBoardBatch(before, after)!;
  assert.equal(d.payload.cards.updated[0].listId, "l2");
  assert.equal(d.inverse.payload.cards.updated[0].listId, "l1");
});

test("board: card field edit = updated", () => {
  const d = computeBoardBatch([list("l1", [card("c1", { title: "old" })])], [list("l1", [card("c1", { title: "new" })])])!;
  assert.equal(d.payload.cards.updated[0].card.title, "new");
  assert.equal(d.inverse.payload.cards.updated[0].card.title, "old");
});

test("board: list created / removed", () => {
  const created = computeBoardBatch([list("l1")], [list("l1"), list("l2")])!;
  assert.equal(created.payload.lists.created[0].id, "l2");
  assert.equal(created.inverse.payload.lists.removed[0].id, "l2");
});

test("board: delta deep-cloned (no aliasing)", () => {
  const after = [list("l1", [card("c1", { title: "n" })])];
  const d = computeBoardBatch([list("l1", [])], after)!;
  after[0].cards[0].title = "MUT";
  assert.equal(d.payload.cards.created[0].card.title, "n");
});

// ── applyBoardBatch reducer ──────────────────────────────────────────────────
test("apply: create + remove card", () => {
  const s0 = [list("l1", [card("c1"), card("c2")])];
  const d = computeBoardBatch(s0, [list("l1", [card("c1"), card("c3")])])!;
  const s1 = applyBoardBatch(s0, d.payload as any);
  assert.equal(flatIds(s1), "l1:[c1,c3]");
});

test("apply: move card across lists", () => {
  const s0 = [list("l1", [card("c1")]), list("l2", [])];
  const d = computeBoardBatch(s0, [list("l1", []), list("l2", [card("c1")])])!;
  const s1 = applyBoardBatch(s0, d.payload as any);
  assert.equal(flatIds(s1), "l1:[] l2:[c1]");
});

test("apply: idempotent create (twice)", () => {
  const s0 = [list("l1", [])];
  const d = computeBoardBatch(s0, [list("l1", [card("c1")])])!;
  let s1 = applyBoardBatch(s0, d.payload as any);
  s1 = applyBoardBatch(s1, d.payload as any);
  assert.equal(s1[0].cards.filter((c) => c.id === "c1").length, 1);
});

test("apply: list create + delete", () => {
  const s0 = [list("l1")];
  const created = applyBoardBatch(s0, (computeBoardBatch(s0, [list("l1"), list("l2")])!).payload as any);
  assert.deepEqual(created.map((l) => l.id), ["l1", "l2"]);
  const removed = applyBoardBatch(created, (computeBoardBatch(created, [list("l1")])!).payload as any);
  assert.deepEqual(removed.map((l) => l.id), ["l1"]);
});

// ── round-trips ──────────────────────────────────────────────────────────────
test("round-trip: add card → undo → redo", () => {
  const S0 = [list("l1", [])];
  const S1 = [list("l1", [card("c1", { summary: "x" })])];
  const d = computeBoardBatch(S0, S1)!;
  const undone = applyBoardBatch(S1, d.inverse.payload as any);
  assert.equal(flatIds(undone), "l1:[]");
  const redone = applyBoardBatch(undone, d.payload as any);
  assert.equal(redone[0].cards[0].summary, "x");
});

test("round-trip: delete card → undo restores at position", () => {
  const S0 = [list("l1", [card("a"), card("b"), card("c")])];
  const S1 = [list("l1", [card("a"), card("c")])];
  const d = computeBoardBatch(S0, S1)!;
  const undone = applyBoardBatch(S1, d.inverse.payload as any);
  assert.equal(flatIds(undone), "l1:[a,b,c]");
});

test("round-trip: move card → undo returns it", () => {
  const S0 = [list("l1", [card("c1")]), list("l2", [])];
  const S1 = [list("l1", []), list("l2", [card("c1")])];
  const d = computeBoardBatch(S0, S1)!;
  const undone = applyBoardBatch(S1, d.inverse.payload as any);
  assert.equal(flatIds(undone), "l1:[c1] l2:[]");
});

test("round-trip: delete list → undo recreates list (+card via card diff)", () => {
  const S0 = [list("l1", [card("c1")]), list("l2", [])];
  const S1 = [list("l2", [])];
  const d = computeBoardBatch(S0, S1)!;
  const undone = applyBoardBatch(S1, d.inverse.payload as any);
  assert.ok(undone.find((l) => l.id === "l1"), "list restored");
  assert.ok(undone.find((l) => l.id === "l1")!.cards.find((c) => c.id === "c1"), "card restored");
});

// ── applier (persist gating + API calls) ─────────────────────────────────────
test("boardApplier: create persists card+list, mutates state", async () => {
  let lists: L[] = [list("l1", [])];
  const calls: any = { createCard: [], updateCard: [], deleteCard: [], createList: [], deleteList: [] };
  const applier = makeBoardApplier({
    getLists: () => lists,
    setLists: (n) => { lists = n; },
    token: () => "tkn",
    boardId: () => "b1",
    createCard: async (b) => { calls.createCard.push(b); return { id: b.id }; },
    updateCard: async (id, u) => { calls.updateCard.push({ id, u }); return {}; },
    deleteCard: async (id) => { calls.deleteCard.push(id); },
    createList: async (_b, b) => { calls.createList.push(b); return { id: b.id }; },
    deleteList: async (_b, id) => { calls.deleteList.push(id); },
  });
  const d = computeBoardBatch([list("l1", [])], [list("l1", [card("c1")])])!;
  await applier({ type: BOARD_BATCH, payload: d.payload, inverse: d.inverse, id: "o", scope: { kind: "board", id: "b1" }, actorId: "a", ts: 0, origin: "redo" } as any, { origin: "redo", shouldPersist: true });
  assert.equal(lists[0].cards[0].id, "c1");
  assert.equal(calls.createCard.length, 1);
  assert.equal(calls.createCard[0].id, "c1");
});

test("boardApplier: remote (no persist) mutates state, no API calls", async () => {
  let lists: L[] = [list("l1", [])];
  let apiCalls = 0;
  const applier = makeBoardApplier({
    getLists: () => lists,
    setLists: (n) => { lists = n; },
    token: () => "tkn",
    boardId: () => "b1",
    createCard: async () => { apiCalls++; return {}; },
    updateCard: async () => { apiCalls++; return {}; },
    deleteCard: async () => { apiCalls++; },
    createList: async () => { apiCalls++; return {}; },
    deleteList: async () => { apiCalls++; },
  });
  const d = computeBoardBatch([list("l1", [])], [list("l1", [card("c1")])])!;
  await applier({ type: BOARD_BATCH, payload: d.payload, inverse: d.inverse, id: "o", scope: { kind: "board", id: "b1" }, actorId: "a", ts: 0, origin: "remote" } as any, { origin: "remote", shouldPersist: false });
  assert.equal(lists[0].cards[0].id, "c1");
  assert.equal(apiCalls, 0);
});
