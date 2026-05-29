import type { MutableRefObject } from "react";
import type { DocumentBrick, DocumentView } from "@/lib/api/documents";
import type { Op, OpApplier, OpDraft } from "./types";

export const DOC_BATCH = "doc.batch";

export interface DocBatchPayload {
  created: DocumentBrick[];
  removed: DocumentBrick[];
  updated: { id: string; content: any }[];
  reordered: { id: string; position: number }[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// Diff two brick arrays into a minimal, reversible delta. Returns null when
// nothing meaningful changed (so callers can skip recording no-ops).
export function computeDocBatch(before: DocumentBrick[], after: DocumentBrick[]): OpDraft | null {
  const beforeById = new Map(before.map((b) => [b.id, b]));
  const afterById = new Map(after.map((b) => [b.id, b]));

  const created = after.filter((b) => !beforeById.has(b.id));
  const removed = before.filter((b) => !afterById.has(b.id));

  const updated: { id: string; content: any }[] = [];
  const updatedPrev: { id: string; content: any }[] = [];
  const reordered: { id: string; position: number }[] = [];
  const reorderedPrev: { id: string; position: number }[] = [];

  for (const b of after) {
    const prev = beforeById.get(b.id);
    if (!prev) continue;
    if (JSON.stringify(prev.content) !== JSON.stringify(b.content)) {
      updated.push({ id: b.id, content: clone(b.content) });
      updatedPrev.push({ id: b.id, content: clone(prev.content) });
    }
    if (prev.position !== b.position) {
      reordered.push({ id: b.id, position: b.position });
      reorderedPrev.push({ id: b.id, position: prev.position });
    }
  }

  if (created.length === 0 && removed.length === 0 && updated.length === 0 && reordered.length === 0) {
    return null;
  }

  const forward: DocBatchPayload = {
    created: clone(created),
    removed: clone(removed),
    updated,
    reordered,
  };
  const inverse: DocBatchPayload = {
    created: clone(removed),
    removed: clone(created),
    updated: updatedPrev,
    reordered: reorderedPrev,
  };

  return { type: DOC_BATCH, payload: forward, inverse: { type: DOC_BATCH, payload: inverse } };
}

export interface DocApplierDeps {
  setDocument: (updater: (prev: DocumentView | null) => DocumentView | null) => void;
  bricksRef: MutableRefObject<DocumentBrick[]>;
  sanitize: (bricks: DocumentBrick[]) => DocumentBrick[];
  docId: () => string;
  token: () => string | null | undefined;
  localMode: () => boolean;
  createBrick: (docId: string, payload: { id?: string; kind: string; position: number; content: any }, token?: string | null) => Promise<DocumentBrick>;
  updateBrick: (docId: string, brickId: string, content: any, token?: string | null) => Promise<DocumentBrick>;
  deleteBrick: (docId: string, brickId: string, token?: string | null) => Promise<void>;
  reorderBricks: (docId: string, updates: { id: string; position: number }[], token?: string | null) => Promise<void>;
  onError?: () => void;
}

// Builds the OpApplier for the document engine. Idempotent: applying the same
// batch twice (legacy broadcast + op echo, or a redo replay) converges.
export function makeDocApplier(deps: DocApplierDeps): OpApplier {
  return async (op: Op, ctx) => {
    const payload = op.payload as DocBatchPayload;

    deps.setDocument((prev) => {
      if (!prev) return prev;
      let bricks = prev.bricks;

      if (payload.removed.length) {
        const rm = new Set(payload.removed.map((b) => b.id));
        bricks = bricks.filter((b) => !rm.has(b.id));
      }
      if (payload.created.length) {
        const have = new Set(bricks.map((b) => b.id));
        const add = payload.created.filter((b) => !have.has(b.id));
        if (add.length) bricks = [...bricks, ...add];
      }
      if (payload.updated.length) {
        const u = new Map(payload.updated.map((x) => [x.id, x.content]));
        bricks = bricks.map((b) => (u.has(b.id) ? { ...b, content: u.get(b.id) } : b));
      }
      if (payload.reordered.length) {
        const r = new Map(payload.reordered.map((x) => [x.id, x.position]));
        bricks = bricks.map((b) => (r.has(b.id) ? { ...b, position: r.get(b.id)! } : b));
      }

      bricks = deps.sanitize(bricks).sort((a, b) => a.position - b.position);
      deps.bricksRef.current = bricks;
      return { ...prev, bricks };
    });

    if (!ctx.shouldPersist) return; // remote ops were already persisted by their originator
    if (deps.localMode()) return; // local-mode autosave persists the whole doc
    const token = deps.token();
    if (!token) return;
    const docId = deps.docId();

    try {
      for (const b of payload.removed) await deps.deleteBrick(docId, b.id, token);
      for (const b of payload.created) await deps.createBrick(docId, { id: b.id, kind: b.kind, position: b.position, content: b.content }, token);
      for (const u of payload.updated) await deps.updateBrick(docId, u.id, u.content, token);
      if (payload.reordered.length) await deps.reorderBricks(docId, payload.reordered, token);
    } catch (e) {
      console.error("[doc-history] persist failed", e);
      deps.onError?.();
    }
  };
}
