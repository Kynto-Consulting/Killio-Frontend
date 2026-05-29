import test from "node:test";
import assert from "node:assert/strict";
import { computeMeshDelta, applyMeshBatch, makeMeshApplier, MESH_BATCH } from "./mesh-ops.ts";

type Brick = any;
const brick = (id: string, x = 0, parentId: string | null = null, extra: any = {}): Brick => ({
  id,
  kind: "text",
  parentId,
  position: { x, y: 0 },
  size: { w: 100, h: 40 },
  ...extra,
});
const conn = (id: string, a: string, b: string, extra: any = {}) => ({
  id,
  cons: [a, b] as [string, string],
  label: { type: "doc" as const },
  ...extra,
});

const state = (bricks: Brick[] = [], conns: any[] = [], rootOrder?: string[]) => ({
  version: "1",
  viewport: { x: 0, y: 0, zoom: 1 },
  rootOrder: rootOrder ?? bricks.filter((b) => !b.parentId).map((b) => b.id),
  bricksById: Object.fromEntries(bricks.map((b) => [b.id, b])),
  connectionsById: Object.fromEntries(conns.map((c) => [c.id, c])),
});

const ids = (m: Record<string, any>) => Object.keys(m).sort();

// ── computeMeshDelta ─────────────────────────────────────────────────────────
test("mesh: identical → null", () => {
  assert.equal(computeMeshDelta(state([brick("1")]), state([brick("1")])), null);
});

test("mesh: viewport-only change → null (camera not undoable)", () => {
  const a = state([brick("1")]);
  const b = { ...state([brick("1")]), viewport: { x: 99, y: 99, zoom: 2 } };
  assert.equal(computeMeshDelta(a, b), null);
});

test("mesh: created brick", () => {
  const d = computeMeshDelta(state([brick("1")]), state([brick("1"), brick("2", 50)]))!;
  assert.equal(d.type, MESH_BATCH);
  assert.equal(d.payload.bricks.created.map((b: any) => b.id).join(), "2");
  assert.equal(d.inverse.payload.bricks.removed.map((b: any) => b.id).join(), "2");
});

test("mesh: removed brick keeps full object", () => {
  const d = computeMeshDelta(state([brick("1"), brick("2", 50, null, { content: { t: "x" } })]), state([brick("1")]))!;
  assert.equal(d.payload.bricks.removed[0].id, "2");
  assert.equal(d.inverse.payload.bricks.created[0].content.t, "x");
});

test("mesh: moved brick = updated with prev", () => {
  const d = computeMeshDelta(state([brick("1", 0)]), state([brick("1", 300)]))!;
  assert.equal(d.payload.bricks.updated[0].position.x, 300);
  assert.equal(d.inverse.payload.bricks.updated[0].position.x, 0);
});

test("mesh: connection created/removed", () => {
  const before = state([brick("1"), brick("2")], []);
  const after = state([brick("1"), brick("2")], [conn("c1", "1", "2")]);
  const d = computeMeshDelta(before, after)!;
  assert.equal(d.payload.conns.created[0].id, "c1");
  assert.equal(d.inverse.payload.conns.removed[0].id, "c1");
});

test("mesh: rootOrder change recorded both ways", () => {
  const a = state([brick("1"), brick("2")], [], ["1", "2"]);
  const b = state([brick("1"), brick("2")], [], ["2", "1"]);
  const d = computeMeshDelta(a, b)!;
  assert.deepEqual(d.payload.rootOrder, ["2", "1"]);
  assert.deepEqual(d.inverse.payload.rootOrder, ["1", "2"]);
});

test("mesh: delta deep-cloned (no aliasing)", () => {
  const after = state([brick("1", 5)]);
  const d = computeMeshDelta(state([brick("1", 0)]), after)!;
  after.bricksById["1"].position.x = 999;
  assert.equal(d.payload.bricks.updated[0].position.x, 5);
});

// ── applyMeshBatch (pure reducer) ────────────────────────────────────────────
test("applyMeshBatch: create + remove + update", () => {
  const s0 = state([brick("1", 0), brick("2", 0)], [conn("c", "1", "2")]);
  const d = computeMeshDelta(s0, state([brick("1", 0), brick("3", 0)], []))!;
  const s1 = applyMeshBatch(s0, d.payload as any);
  assert.deepEqual(ids(s1.bricksById), ["1", "3"]);
  assert.equal(Object.keys(s1.connectionsById).length, 0);
});

test("applyMeshBatch: rootOrder pruned to surviving roots", () => {
  const s0 = state([brick("1"), brick("2")], [], ["1", "2"]);
  const d = computeMeshDelta(s0, state([brick("1")], []))!;
  const s1 = applyMeshBatch(s0, d.payload as any);
  assert.deepEqual(s1.rootOrder, ["1"]);
});

test("applyMeshBatch: new root auto-appended to rootOrder", () => {
  const s0 = state([brick("1")], [], ["1"]);
  const d = computeMeshDelta(s0, state([brick("1"), brick("2")]))!;
  const s1 = applyMeshBatch(s0, d.payload as any);
  assert.ok(s1.rootOrder.includes("2"));
});

// ── round-trips ──────────────────────────────────────────────────────────────
test("mesh round-trip: add → undo → redo", () => {
  const S0 = state([brick("1")]);
  const S1 = state([brick("1"), brick("2", 50, null, { content: { t: "n" } })]);
  const d = computeMeshDelta(S0, S1)!;
  // undo from S1
  const undone = applyMeshBatch(S1, d.inverse.payload as any);
  assert.deepEqual(ids(undone.bricksById), ["1"]);
  // redo
  const redone = applyMeshBatch(undone, d.payload as any);
  assert.deepEqual(ids(redone.bricksById), ["1", "2"]);
  assert.equal(redone.bricksById["2"].content.t, "n");
});

test("mesh round-trip: move → undo restores position", () => {
  const S0 = state([brick("1", 10)]);
  const S1 = state([brick("1", 400)]);
  const d = computeMeshDelta(S0, S1)!;
  const undone = applyMeshBatch(S1, d.inverse.payload as any);
  assert.equal(undone.bricksById["1"].position.x, 10);
});

test("mesh round-trip: delete connection → undo recreates", () => {
  const S0 = state([brick("1"), brick("2")], [conn("c", "1", "2", { label: { type: "doc", content: ["L"] } })]);
  const S1 = state([brick("1"), brick("2")], []);
  const d = computeMeshDelta(S0, S1)!;
  const undone = applyMeshBatch(S1, d.inverse.payload as any);
  assert.equal(undone.connectionsById["c"].cons.join(), "1,2");
});

// ── makeMeshApplier (drives setState + save) ─────────────────────────────────
test("meshApplier: persists when shouldPersist, syncs baseline", async () => {
  let cur = state([brick("1")]);
  let baseline: any = null;
  const saves: any[] = [];
  const applier = makeMeshApplier({
    getState: () => cur,
    setState: (n) => { cur = n; },
    save: (n) => { saves.push(n); },
    markBaseline: (n) => { baseline = n; },
  });
  const d = computeMeshDelta(state([brick("1")]), state([brick("1"), brick("2")]))!;
  await applier({ type: MESH_BATCH, payload: d.payload, inverse: d.inverse, id: "o", scope: { kind: "mesh", id: "m" }, actorId: "a", ts: 0, origin: "redo" } as any, { origin: "redo", shouldPersist: true });
  assert.deepEqual(ids(cur.bricksById), ["1", "2"]);
  assert.equal(saves.length, 1);
  assert.equal(baseline, cur, "baseline synced to applied state");
});

test("meshApplier: remote (shouldPersist false) mutates but does not save", async () => {
  let cur = state([brick("1")]);
  const saves: any[] = [];
  const applier = makeMeshApplier({ getState: () => cur, setState: (n) => { cur = n; }, save: (n) => { saves.push(n); } });
  const d = computeMeshDelta(state([brick("1")]), state([brick("1"), brick("2")]))!;
  await applier({ type: MESH_BATCH, payload: d.payload, inverse: d.inverse, id: "o", scope: { kind: "mesh", id: "m" }, actorId: "a", ts: 0, origin: "remote" } as any, { origin: "remote", shouldPersist: false });
  assert.deepEqual(ids(cur.bricksById), ["1", "2"]);
  assert.equal(saves.length, 0);
});
