import type { Op, OpDraft, OpOrigin, OpScope } from "./types";

export const genOpId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `op_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export function makeOp(draft: OpDraft, scope: OpScope, actorId: string, origin: OpOrigin): Op {
  return {
    id: genOpId(),
    scope,
    type: draft.type,
    payload: draft.payload,
    inverse: draft.inverse,
    actorId,
    ts: Date.now(),
    origin,
  };
}

// Builds the inverse op (swap type/payload with the op's declared inverse).
export function invertOp(op: Op, actorId: string, origin: OpOrigin): Op {
  return {
    id: genOpId(),
    scope: op.scope,
    type: op.inverse.type,
    payload: op.inverse.payload,
    inverse: { type: op.type, payload: op.payload },
    actorId,
    ts: Date.now(),
    origin,
  };
}

/**
 * Per-user undo/redo log + de-dupe set. Holds only ops this client originated
 * (remote ops are applied elsewhere and never recorded), which gives Figma-style
 * per-user undo for free. Pure + framework-free so it is unit-testable.
 */
export class OpLog {
  undo: Op[] = [];
  redo: Op[] = [];
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private readonly cap: number;
  private readonly seenCap: number;

  constructor(cap = 100, seenCap = 1000) {
    this.cap = cap;
    this.seenCap = seenCap;
  }

  // Returns true the first time an id is seen (false on echoes/duplicates).
  markSeen(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > this.seenCap) {
      const drop = this.seenOrder.shift();
      if (drop) this.seen.delete(drop);
    }
    return true;
  }

  private pushUndo(op: Op) {
    this.undo.push(op);
    if (this.undo.length > this.cap) this.undo.shift();
  }

  // New local op: record it and invalidate the redo branch.
  record(op: Op) {
    this.pushUndo(op);
    this.redo = [];
  }

  // Pop the latest local op for undo; caller applies its inverse and stores the
  // original on the redo stack via pushRedo.
  popUndo(): Op | undefined {
    return this.undo.pop();
  }

  pushRedo(op: Op) {
    this.redo.push(op);
  }

  popRedo(): Op | undefined {
    return this.redo.pop();
  }

  // Redo re-applies the original forward op; it returns to the undo stack.
  reapply(op: Op) {
    this.pushUndo(op);
  }

  clear() {
    this.undo = [];
    this.redo = [];
    this.seen.clear();
    this.seenOrder = [];
  }

  get canUndo() {
    return this.undo.length > 0;
  }
  get canRedo() {
    return this.redo.length > 0;
  }
}
