import type { MeshState, MeshBrick, MeshConnection } from "@/lib/api/contracts";
import type { Op, OpApplier, OpDraft } from "./types";

export const MESH_BATCH = "mesh.batch";

export interface MeshBatchPayload {
  bricks: { created: MeshBrick[]; removed: MeshBrick[]; updated: MeshBrick[] };
  conns: { created: MeshConnection[]; removed: MeshConnection[]; updated: MeshConnection[] };
  rootOrder?: string[]; // present only when order changed (target order)
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function diffMap<T extends { id: string }>(
  before: Record<string, T>,
  after: Record<string, T>,
): { created: T[]; removed: T[]; updated: T[]; updatedPrev: T[] } {
  const created: T[] = [];
  const removed: T[] = [];
  const updated: T[] = [];
  const updatedPrev: T[] = [];
  for (const id of Object.keys(after)) {
    const a = after[id];
    const b = before[id];
    if (!b) created.push(a);
    else if (JSON.stringify(b) !== JSON.stringify(a)) {
      updated.push(a);
      updatedPrev.push(b);
    }
  }
  for (const id of Object.keys(before)) {
    if (!after[id]) removed.push(before[id]);
  }
  return { created, removed, updated, updatedPrev };
}

// Entity-level reversible delta between two mesh states. Viewport is excluded
// (camera moves are not undoable). Returns null when nothing meaningful changed.
export function computeMeshDelta(before: MeshState, after: MeshState): OpDraft | null {
  const b = diffMap(before.bricksById ?? {}, after.bricksById ?? {});
  const c = diffMap(before.connectionsById ?? {}, after.connectionsById ?? {});
  const orderChanged = JSON.stringify(before.rootOrder ?? []) !== JSON.stringify(after.rootOrder ?? []);

  if (
    b.created.length === 0 && b.removed.length === 0 && b.updated.length === 0 &&
    c.created.length === 0 && c.removed.length === 0 && c.updated.length === 0 &&
    !orderChanged
  ) {
    return null;
  }

  const forward: MeshBatchPayload = {
    bricks: { created: clone(b.created), removed: clone(b.removed), updated: clone(b.updated) },
    conns: { created: clone(c.created), removed: clone(c.removed), updated: clone(c.updated) },
    ...(orderChanged ? { rootOrder: clone(after.rootOrder ?? []) } : {}),
  };
  const inverse: MeshBatchPayload = {
    bricks: { created: clone(b.removed), removed: clone(b.created), updated: clone(b.updatedPrev) },
    conns: { created: clone(c.removed), removed: clone(c.created), updated: clone(c.updatedPrev) },
    ...(orderChanged ? { rootOrder: clone(before.rootOrder ?? []) } : {}),
  };

  return { type: MESH_BATCH, payload: forward, inverse: { type: MESH_BATCH, payload: inverse } };
}

// Pure reducer: apply a mesh delta to a state, returning the next state.
export function applyMeshBatch(state: MeshState, payload: MeshBatchPayload): MeshState {
  const bricksById = { ...state.bricksById };
  for (const b of payload.bricks.removed) delete bricksById[b.id];
  for (const b of payload.bricks.created) bricksById[b.id] = b;
  for (const b of payload.bricks.updated) bricksById[b.id] = b;

  const connectionsById = { ...state.connectionsById };
  for (const c of payload.conns.removed) delete connectionsById[c.id];
  for (const c of payload.conns.created) connectionsById[c.id] = c;
  for (const c of payload.conns.updated) connectionsById[c.id] = c;

  let rootOrder = payload.rootOrder ? [...payload.rootOrder] : state.rootOrder;
  // Keep rootOrder consistent with surviving root bricks.
  rootOrder = rootOrder.filter((id) => bricksById[id] && !bricksById[id].parentId);
  for (const b of Object.values(bricksById)) {
    if (!b.parentId && !rootOrder.includes(b.id)) rootOrder.push(b.id);
  }

  return { ...state, bricksById, connectionsById, rootOrder };
}

export interface MeshApplierDeps {
  getState: () => MeshState;
  setState: (next: MeshState) => void;
  // Persist the whole state (existing seam). Rides the existing mesh.state.updated
  // realtime broadcast so undo/redo converge across peers.
  save: (next: MeshState) => void | Promise<void>;
  // Sync the recorder baseline so the apply does not get re-recorded as a new action.
  markBaseline?: (next: MeshState) => void;
}

export function makeMeshApplier(deps: MeshApplierDeps): OpApplier {
  return async (op: Op, ctx) => {
    const payload = op.payload as MeshBatchPayload;
    const next = applyMeshBatch(deps.getState(), payload);
    deps.markBaseline?.(next);
    deps.setState(next);
    if (ctx.shouldPersist) await deps.save(next);
  };
}
