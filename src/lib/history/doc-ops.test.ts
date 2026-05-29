import test from "node:test";
import assert from "node:assert/strict";
import { computeDocBatch, makeDocApplier, DOC_BATCH } from "./doc-ops.ts";

// ── helpers ──────────────────────────────────────────────────────────────────
type Brick = {
  id: string;
  documentId: string;
  kind: string;
  position: number;
  content: any;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

const mk = (id: string, position: number, content: any = {}, kind = "text"): Brick => ({
  id,
  documentId: "d1",
  kind,
  position,
  content,
  createdByUserId: "u",
  createdAt: "",
  updatedAt: "",
});

const byIdMap = (bricks: Brick[]) =>
  Object.fromEntries(bricks.map((b) => [b.id, { content: b.content, position: b.position, kind: b.kind }]));

const sameBricks = (a: Brick[], b: Brick[]) =>
  JSON.stringify(byIdMap(a)) === JSON.stringify(byIdMap(b));

// Minimal engine that mimics the page's setDocument + seam fns.
function makeEngine(initial: Brick[], opts?: { localMode?: boolean; token?: string | null }) {
  let doc: any = { bricks: initial.map((b) => ({ ...b })) };
  const bricksRef = { current: doc.bricks as Brick[] };
  const calls = { create: [] as any[], update: [] as any[], delete: [] as string[], reorder: [] as any[], error: 0 };

  const sanitize = (bricks: Brick[]) => Array.from(new Map(bricks.map((b) => [b.id, b])).values());

  const applier = makeDocApplier({
    setDocument: (u: any) => {
      doc = u(doc);
    },
    bricksRef: bricksRef as any,
    sanitize: sanitize as any,
    docId: () => "d1",
    token: () => (opts?.token === undefined ? "tkn" : opts.token),
    localMode: () => !!opts?.localMode,
    createBrick: async (_d, payload) => {
      calls.create.push(payload);
      return mk(payload.id!, payload.position, payload.content, payload.kind);
    },
    updateBrick: async (_d, brickId, content) => {
      calls.update.push({ brickId, content });
      return mk(brickId, 0, content);
    },
    deleteBrick: async (_d, brickId) => {
      calls.delete.push(brickId);
    },
    reorderBricks: async (_d, updates) => {
      calls.reorder.push(updates);
    },
    onError: () => {
      calls.error += 1;
    },
  });

  const wrap = (draft: any, dir: "forward" | "inverse", ctx: any) => ({
    id: "op1",
    scope: { kind: "document", id: "d1" },
    type: dir === "forward" ? draft.type : draft.inverse.type,
    payload: dir === "forward" ? draft.payload : draft.inverse.payload,
    inverse: { type: draft.type, payload: draft.payload },
    actorId: "a",
    ts: 0,
    origin: ctx.origin ?? "local",
  });

  return {
    getBricks: () => doc.bricks as Brick[],
    bricksRef,
    calls,
    applyForward: (draft: any, ctx: any = { origin: "redo", shouldPersist: true }) => applier(wrap(draft, "forward", ctx) as any, ctx),
    applyInverse: (draft: any, ctx: any = { origin: "undo", shouldPersist: true }) => applier(wrap(draft, "inverse", ctx) as any, ctx),
    applyRaw: (op: any, ctx: any) => applier(op, ctx),
  };
}

// ── computeDocBatch ──────────────────────────────────────────────────────────
test("computeDocBatch: identical → null", () => {
  const a = [mk("1", 1000, { text: "x" })];
  const b = [mk("1", 1000, { text: "x" })];
  assert.equal(computeDocBatch(a as any, b as any), null);
});

test("computeDocBatch: created brick", () => {
  const before = [mk("1", 1000)];
  const after = [mk("1", 1000), mk("2", 2000, { text: "new" })];
  const d = computeDocBatch(before as any, after as any)!;
  assert.equal(d.type, DOC_BATCH);
  assert.equal(d.payload.created.length, 1);
  assert.equal(d.payload.created[0].id, "2");
  assert.equal(d.payload.removed.length, 0);
  // inverse deletes the created one
  assert.equal(d.inverse.payload.removed.length, 1);
  assert.equal(d.inverse.payload.created.length, 0);
  assert.equal(d.inverse.payload.removed[0].id, "2");
});

test("computeDocBatch: removed brick keeps full object for recreate", () => {
  const before = [mk("1", 1000), mk("2", 2000, { text: "bye" })];
  const after = [mk("1", 1000)];
  const d = computeDocBatch(before as any, after as any)!;
  assert.equal(d.payload.removed.length, 1);
  assert.equal(d.payload.removed[0].content.text, "bye");
  // inverse recreates with same id+content
  assert.equal(d.inverse.payload.created.length, 1);
  assert.equal(d.inverse.payload.created[0].id, "2");
  assert.equal(d.inverse.payload.created[0].content.text, "bye");
});

test("computeDocBatch: content update records prev for inverse", () => {
  const before = [mk("1", 1000, { text: "old" })];
  const after = [mk("1", 1000, { text: "new" })];
  const d = computeDocBatch(before as any, after as any)!;
  assert.equal(d.payload.updated.length, 1);
  assert.deepEqual(d.payload.updated[0], { id: "1", content: { text: "new" } });
  assert.deepEqual(d.inverse.payload.updated[0], { id: "1", content: { text: "old" } });
  assert.equal(d.payload.reordered.length, 0);
});

test("computeDocBatch: reorder records prev positions", () => {
  const before = [mk("1", 1000), mk("2", 2000)];
  const after = [mk("1", 3000), mk("2", 2000)];
  const d = computeDocBatch(before as any, after as any)!;
  assert.equal(d.payload.reordered.length, 1);
  assert.deepEqual(d.payload.reordered[0], { id: "1", position: 3000 });
  assert.deepEqual(d.inverse.payload.reordered[0], { id: "1", position: 1000 });
});

test("computeDocBatch: mixed add+remove+update+reorder", () => {
  const before = [mk("1", 1000, { t: "a" }), mk("2", 2000)];
  const after = [mk("1", 5000, { t: "b" }), mk("3", 3000)];
  const d = computeDocBatch(before as any, after as any)!;
  assert.equal(d.payload.created.map((b: any) => b.id).join(), "3");
  assert.equal(d.payload.removed.map((b: any) => b.id).join(), "2");
  assert.equal(d.payload.updated[0].id, "1");
  assert.equal(d.payload.reordered[0].id, "1");
});

test("computeDocBatch: nesting (childrenByContainer) change is an update", () => {
  const before = [mk("p", 1000, { childrenByContainer: { body: ["c1"] } }), mk("c1", 2000)];
  const after = [mk("p", 1000, { childrenByContainer: { body: ["c1", "c2"] } }), mk("c1", 2000), mk("c2", 3000)];
  const d = computeDocBatch(before as any, after as any)!;
  assert.equal(d.payload.created.map((b: any) => b.id).join(), "c2");
  assert.equal(d.payload.updated[0].id, "p");
  assert.deepEqual(d.payload.updated[0].content.childrenByContainer.body, ["c1", "c2"]);
  // inverse restores parent ref list + removes c2
  assert.deepEqual(d.inverse.payload.updated[0].content.childrenByContainer.body, ["c1"]);
  assert.equal(d.inverse.payload.removed[0].id, "c2");
});

test("computeDocBatch: snapshots are deep-cloned (no aliasing)", () => {
  const before = [mk("1", 1000, { text: "old" })];
  const after = [mk("1", 1000, { text: "new" })];
  const d = computeDocBatch(before as any, after as any)!;
  // mutate the source after computing — op must be unaffected
  after[0].content.text = "MUTATED";
  assert.equal(d.payload.updated[0].content.text, "new");
});

// ── makeDocApplier ───────────────────────────────────────────────────────────
test("applier: created persists with client id + mutates state", async () => {
  const eng = makeEngine([mk("1", 1000)]);
  const d = computeDocBatch([mk("1", 1000)] as any, [mk("1", 1000), mk("2", 2000, { text: "x" })] as any)!;
  await eng.applyForward(d, { origin: "redo", shouldPersist: true });
  assert.equal(eng.getBricks().length, 2);
  assert.equal(eng.calls.create.length, 1);
  assert.equal(eng.calls.create[0].id, "2");
  assert.equal(eng.calls.create[0].content.text, "x");
});

test("applier: removed calls deleteBrick + drops from state", async () => {
  const eng = makeEngine([mk("1", 1000), mk("2", 2000)]);
  const d = computeDocBatch([mk("1", 1000), mk("2", 2000)] as any, [mk("1", 1000)] as any)!;
  await eng.applyForward(d, { origin: "redo", shouldPersist: true });
  assert.deepEqual(eng.getBricks().map((b) => b.id), ["1"]);
  assert.deepEqual(eng.calls.delete, ["2"]);
});

test("applier: updated calls updateBrick + sets content", async () => {
  const eng = makeEngine([mk("1", 1000, { text: "old" })]);
  const d = computeDocBatch([mk("1", 1000, { text: "old" })] as any, [mk("1", 1000, { text: "new" })] as any)!;
  await eng.applyForward(d, { origin: "redo", shouldPersist: true });
  assert.equal(eng.getBricks()[0].content.text, "new");
  assert.equal(eng.calls.update[0].brickId, "1");
  assert.equal(eng.calls.update[0].content.text, "new");
});

test("applier: reordered calls reorderBricks once + sets positions", async () => {
  const eng = makeEngine([mk("1", 1000), mk("2", 2000)]);
  const d = computeDocBatch([mk("1", 1000), mk("2", 2000)] as any, [mk("1", 3000), mk("2", 2000)] as any)!;
  await eng.applyForward(d, { origin: "redo", shouldPersist: true });
  assert.equal(eng.calls.reorder.length, 1);
  assert.equal(eng.getBricks().find((b) => b.id === "1")!.position, 3000);
});

test("applier: idempotent create (apply twice → no duplicate)", async () => {
  const eng = makeEngine([mk("1", 1000)]);
  const d = computeDocBatch([mk("1", 1000)] as any, [mk("1", 1000), mk("2", 2000)] as any)!;
  await eng.applyForward(d, { origin: "redo", shouldPersist: false });
  await eng.applyForward(d, { origin: "remote", shouldPersist: false });
  assert.equal(eng.getBricks().filter((b) => b.id === "2").length, 1);
});

test("applier: remote op (shouldPersist false) mutates state but no seam calls", async () => {
  const eng = makeEngine([mk("1", 1000)]);
  const d = computeDocBatch([mk("1", 1000)] as any, [mk("1", 1000), mk("2", 2000)] as any)!;
  await eng.applyForward(d, { origin: "remote", shouldPersist: false });
  assert.equal(eng.getBricks().length, 2);
  assert.equal(eng.calls.create.length, 0);
  assert.equal(eng.calls.delete.length, 0);
});

test("applier: local mode persists nothing (autosave owns it)", async () => {
  const eng = makeEngine([mk("1", 1000)], { localMode: true });
  const d = computeDocBatch([mk("1", 1000)] as any, [mk("1", 1000), mk("2", 2000)] as any)!;
  await eng.applyForward(d, { origin: "redo", shouldPersist: true });
  assert.equal(eng.getBricks().length, 2);
  assert.equal(eng.calls.create.length, 0);
});

test("applier: no token → state only, no persist", async () => {
  const eng = makeEngine([mk("1", 1000)], { token: null });
  const d = computeDocBatch([mk("1", 1000)] as any, [mk("1", 1000), mk("2", 2000)] as any)!;
  await eng.applyForward(d, { origin: "redo", shouldPersist: true });
  assert.equal(eng.getBricks().length, 2);
  assert.equal(eng.calls.create.length, 0);
});

test("applier: bricksRef stays in sync with state", async () => {
  const eng = makeEngine([mk("1", 1000)]);
  const d = computeDocBatch([mk("1", 1000)] as any, [mk("1", 1000), mk("2", 2000)] as any)!;
  await eng.applyForward(d, { origin: "redo", shouldPersist: false });
  assert.deepEqual(eng.bricksRef.current.map((b) => b.id).sort(), ["1", "2"]);
});

// ── round-trips (compute → apply inverse = undo, apply forward = redo) ─────────
test("round-trip: add → undo removes → redo re-adds same id", async () => {
  const S0 = [mk("1", 1000)];
  const S1 = [mk("1", 1000), mk("2", 2000, { text: "n" })];
  const d = computeDocBatch(S0 as any, S1 as any)!;

  const eng = makeEngine(S1); // start at S1 (just added)
  await eng.applyInverse(d, { origin: "undo", shouldPersist: true });
  assert.ok(sameBricks(eng.getBricks(), S0 as any), "undo → S0");
  await eng.applyForward(d, { origin: "redo", shouldPersist: true });
  assert.ok(sameBricks(eng.getBricks(), S1 as any), "redo → S1");
  assert.equal(eng.getBricks().find((b) => b.id === "2")!.content.text, "n");
});

test("round-trip: delete → undo recreates id+content+position", async () => {
  const S0 = [mk("1", 1000), mk("2", 2000, { text: "keepme" })];
  const S1 = [mk("1", 1000)];
  const d = computeDocBatch(S0 as any, S1 as any)!;

  const eng = makeEngine(S1);
  await eng.applyInverse(d, { origin: "undo", shouldPersist: true });
  assert.ok(sameBricks(eng.getBricks(), S0 as any), "undo restores deleted");
  const restored = eng.getBricks().find((b) => b.id === "2")!;
  assert.equal(restored.content.text, "keepme");
  assert.equal(restored.position, 2000);
  // persisted via createBrick with the original id
  assert.equal(eng.calls.create[0].id, "2");
});

test("round-trip: update → undo restores prev content → redo new", async () => {
  const S0 = [mk("1", 1000, { text: "old" })];
  const S1 = [mk("1", 1000, { text: "new" })];
  const d = computeDocBatch(S0 as any, S1 as any)!;

  const eng = makeEngine(S1);
  await eng.applyInverse(d, { origin: "undo", shouldPersist: true });
  assert.equal(eng.getBricks()[0].content.text, "old");
  await eng.applyForward(d, { origin: "redo", shouldPersist: true });
  assert.equal(eng.getBricks()[0].content.text, "new");
});

test("round-trip: reorder → undo restores order", async () => {
  const S0 = [mk("1", 1000), mk("2", 2000)];
  const S1 = [mk("1", 3000), mk("2", 2000)];
  const d = computeDocBatch(S0 as any, S1 as any)!;

  const eng = makeEngine(S1);
  await eng.applyInverse(d, { origin: "undo", shouldPersist: true });
  assert.equal(eng.getBricks().find((b) => b.id === "1")!.position, 1000);
});

test("round-trip: nested delete → undo recreates parent ref + child", async () => {
  const S0 = [mk("p", 1000, { childrenByContainer: { body: ["c1"] } }), mk("c1", 2000, { text: "child" })];
  const S1 = [mk("p", 1000, { childrenByContainer: { body: [] } })];
  const d = computeDocBatch(S0 as any, S1 as any)!;

  const eng = makeEngine(S1);
  await eng.applyInverse(d, { origin: "undo", shouldPersist: true });
  assert.ok(sameBricks(eng.getBricks(), S0 as any), "child + parent ref restored");
  assert.deepEqual(eng.getBricks().find((b) => b.id === "p")!.content.childrenByContainer.body, ["c1"]);
});
