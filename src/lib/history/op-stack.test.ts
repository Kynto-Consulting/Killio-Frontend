import test from "node:test";
import assert from "node:assert/strict";
import { OpLog, genOpId, invertOp, makeOp } from "./op-stack.ts";

const scope = { kind: "document" as const, id: "d1" };
const draft = (type: string, payload: any, invType = type, invPayload: any = {}) => ({
  type,
  payload,
  inverse: { type: invType, payload: invPayload },
});

// ── id + makeOp + invertOp ───────────────────────────────────────────────────
test("genOpId is unique", () => {
  const ids = new Set(Array.from({ length: 1000 }, () => genOpId()));
  assert.equal(ids.size, 1000);
});

test("makeOp fills metadata", () => {
  const op = makeOp(draft("doc.batch", { a: 1 }), scope, "user-1", "local");
  assert.equal(op.type, "doc.batch");
  assert.deepEqual(op.payload, { a: 1 });
  assert.equal(op.actorId, "user-1");
  assert.equal(op.origin, "local");
  assert.ok(op.id);
  assert.equal(op.scope.id, "d1");
});

test("invertOp swaps type+payload and keeps a re-inverse", () => {
  const op = makeOp(draft("doc.batch", { fwd: 1 }, "doc.batch", { back: 2 }), scope, "u", "local");
  const inv = invertOp(op, "u", "undo");
  assert.deepEqual(inv.payload, { back: 2 });
  assert.equal(inv.origin, "undo");
  // re-inverse points back to the original forward payload (so redo works)
  assert.deepEqual(inv.inverse.payload, { fwd: 1 });
  assert.notEqual(inv.id, op.id);
});

// ── OpLog mechanics ──────────────────────────────────────────────────────────
test("record pushes undo + clears redo", () => {
  const log = new OpLog();
  log.record(makeOp(draft("a", {}), scope, "u", "local"));
  assert.equal(log.canUndo, true);
  assert.equal(log.canRedo, false);
});

test("undo→pushRedo→reapply cycle", () => {
  const log = new OpLog();
  const op = makeOp(draft("a", {}), scope, "u", "local");
  log.record(op);
  const popped = log.popUndo();
  assert.equal(popped, op);
  assert.equal(log.canUndo, false);
  log.pushRedo(op);
  assert.equal(log.canRedo, true);
  const r = log.popRedo();
  assert.equal(r, op);
  log.reapply(op);
  assert.equal(log.canUndo, true);
  assert.equal(log.canRedo, false);
});

test("new record after undo invalidates redo branch", () => {
  const log = new OpLog();
  const a = makeOp(draft("a", {}), scope, "u", "local");
  log.record(a);
  log.pushRedo(log.popUndo()!); // simulate undo of a
  assert.equal(log.canRedo, true);
  log.record(makeOp(draft("b", {}), scope, "u", "local"));
  assert.equal(log.canRedo, false, "redo cleared on new action");
});

test("cap evicts oldest undo entries", () => {
  const log = new OpLog(3);
  for (let i = 0; i < 5; i++) log.record(makeOp(draft(`op${i}`, {}), scope, "u", "local"));
  assert.equal(log.undo.length, 3);
  assert.deepEqual(log.undo.map((o) => o.type), ["op2", "op3", "op4"]);
});

test("markSeen dedupes (echo + duplicates)", () => {
  const log = new OpLog();
  assert.equal(log.markSeen("x"), true);
  assert.equal(log.markSeen("x"), false);
  assert.equal(log.markSeen("y"), true);
});

test("markSeen evicts beyond seenCap but stays correct for recent", () => {
  const log = new OpLog(100, 3);
  log.markSeen("a");
  log.markSeen("b");
  log.markSeen("c");
  log.markSeen("d"); // evicts "a"
  assert.equal(log.markSeen("d"), false, "recent still deduped");
  assert.equal(log.markSeen("a"), true, "evicted id can be seen again");
});

test("clear empties everything", () => {
  const log = new OpLog();
  log.record(makeOp(draft("a", {}), scope, "u", "local"));
  log.markSeen("z");
  log.clear();
  assert.equal(log.canUndo, false);
  assert.equal(log.canRedo, false);
  assert.equal(log.markSeen("z"), true);
});

// ── full undo/redo simulation against an in-memory counter "engine" ───────────
// Mirrors how the hook drives apply(): undo applies inverse, redo re-applies fwd.
test("simulated undo/redo over multiple actions (per-user stack)", () => {
  const log = new OpLog();
  let value = 0;
  const apply = (op: any) => {
    value += op.payload.delta as number;
  };
  // forward op +5 then +3
  const op1 = makeOp(draft("add", { delta: 5 }, "add", { delta: -5 }), scope, "u", "local");
  apply(op1);
  log.record(op1);
  const op2 = makeOp(draft("add", { delta: 3 }, "add", { delta: -3 }), scope, "u", "local");
  apply(op2);
  log.record(op2);
  assert.equal(value, 8);

  // undo op2
  let u = log.popUndo()!;
  apply(invertOp(u, "u", "undo"));
  log.pushRedo(u);
  assert.equal(value, 5);

  // undo op1
  u = log.popUndo()!;
  apply(invertOp(u, "u", "undo"));
  log.pushRedo(u);
  assert.equal(value, 0);
  assert.equal(log.canUndo, false);

  // redo op1
  let r = log.popRedo()!;
  apply({ ...r, origin: "redo" });
  log.reapply(r);
  assert.equal(value, 5);

  // redo op2
  r = log.popRedo()!;
  apply({ ...r, origin: "redo" });
  log.reapply(r);
  assert.equal(value, 8);
  assert.equal(log.canRedo, false);
});

test("remote ops never enter the local stack (per-user undo invariant)", () => {
  const log = new OpLog();
  // local action
  log.record(makeOp(draft("local", {}), scope, "me", "local"));
  // a remote op arrives: hook applies it but only calls markSeen, never record
  const remote = makeOp(draft("remote", {}), scope, "other", "remote");
  log.markSeen(remote.id);
  assert.equal(log.undo.length, 1, "remote op not recorded");
  assert.equal(log.undo[0].actorId, "me");
});
