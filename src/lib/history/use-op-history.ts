"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { MessageListener } from "@/lib/realtime/types";
import { useSession } from "@/components/providers/session-provider";
import type { Op, OpApplier, OpDraft, OpOrigin, OpScope } from "./types";

const OP_EVENT = "op";

const genId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `op_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const channelName = (scope: OpScope): string =>
  scope.kind === "document"
    ? realtimeChannel.document(scope.id)
    : scope.kind === "mesh"
      ? realtimeChannel.mesh(scope.id)
      : realtimeChannel.board(scope.id);

export interface OpHistory {
  // Apply + persist + broadcast + record a brand-new op (forward).
  dispatch: (draft: OpDraft) => Promise<void>;
  // Op already applied+persisted by an engine handler: just broadcast + record.
  record: (draft: OpDraft) => void;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // New stable id for client-chosen entity ids (so create ops carry the id the
  // backend will store — see ON CONFLICT id-honoring on the create endpoints).
  newId: () => string;
  // True while applying an undo/redo or a remote op, so engine effects (legacy
  // autosave, re-record guards) can opt out.
  applyingRef: MutableRefObject<boolean>;
}

/**
 * Per-user op history with delta transport over the existing realtime channel.
 *
 * Undo semantics are per-user (Figma/Notion style): only ops this client
 * dispatched enter its undo stack; remote ops are applied but never recorded.
 * Forward and inverse ops are broadcast on the scope channel as `"op"` events;
 * peers apply them idempotently (deduped by op.id) without re-persisting.
 */
export function useOpHistory(opts: {
  scope: OpScope | null;
  apply: OpApplier;
  enabled?: boolean;
  cap?: number;
  broadcast?: boolean;
}): OpHistory {
  const { scope, apply, enabled = true, cap = 100, broadcast = true } = opts;
  const { user } = useSession();
  const realtime = useRealtime();
  const actorId = user?.id ?? "local";

  const undoStack = useRef<Op[]>([]);
  const redoStack = useRef<Op[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const seenOrder = useRef<string[]>([]);
  const applyingRef = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  const markSeen = useCallback((id: string) => {
    if (seen.current.has(id)) return false;
    seen.current.add(id);
    seenOrder.current.push(id);
    if (seenOrder.current.length > 1000) {
      const drop = seenOrder.current.shift();
      if (drop) seen.current.delete(drop);
    }
    return true;
  }, []);

  const publish = useCallback(
    (op: Op) => {
      if (!broadcast || !scope) return;
      try {
        void realtime.getChannel(channelName(scope)).publish(OP_EVENT, op);
      } catch {
        /* realtime is best-effort; persistence already happened */
      }
    },
    [broadcast, scope, realtime],
  );

  // Apply locally (+persist) then broadcast. Used by dispatch/undo/redo.
  const runLocal = useCallback(
    async (op: Op) => {
      markSeen(op.id);
      applyingRef.current = true;
      try {
        await applyRef.current(op, { origin: op.origin, shouldPersist: true });
      } finally {
        applyingRef.current = false;
      }
      publish(op);
    },
    [markSeen, publish],
  );

  const makeOp = useCallback(
    (draft: OpDraft, origin: OpOrigin): Op => ({
      id: genId(),
      scope: scope as OpScope,
      type: draft.type,
      payload: draft.payload,
      inverse: draft.inverse,
      actorId,
      ts: Date.now(),
      origin,
    }),
    [scope, actorId],
  );

  const pushUndo = useCallback(
    (op: Op) => {
      undoStack.current.push(op);
      if (undoStack.current.length > cap) undoStack.current.shift();
    },
    [cap],
  );

  const dispatch = useCallback(
    async (draft: OpDraft) => {
      if (!scope) return;
      const op = makeOp(draft, "local");
      await runLocal(op);
      redoStack.current = [];
      pushUndo(op);
      bump();
    },
    [scope, makeOp, runLocal, pushUndo],
  );

  // Already applied+persisted by the engine handler. Record + broadcast only.
  const record = useCallback(
    (draft: OpDraft) => {
      if (!scope) return;
      const op = makeOp(draft, "local");
      markSeen(op.id);
      publish(op);
      redoStack.current = [];
      pushUndo(op);
      bump();
    },
    [scope, makeOp, markSeen, publish, pushUndo],
  );

  const invert = useCallback(
    (op: Op, origin: OpOrigin): Op => ({
      id: genId(),
      scope: op.scope,
      type: op.inverse.type,
      payload: op.inverse.payload,
      inverse: { type: op.type, payload: op.payload },
      actorId,
      ts: Date.now(),
      origin,
    }),
    [actorId],
  );

  const undo = useCallback(async () => {
    const op = undoStack.current.pop();
    if (!op) return false;
    await runLocal(invert(op, "undo"));
    redoStack.current.push(op);
    bump();
    return true;
  }, [runLocal, invert]);

  const redo = useCallback(async () => {
    const op = redoStack.current.pop();
    if (!op) return false;
    const fwd: Op = { ...op, id: genId(), origin: "redo" };
    await runLocal(fwd);
    pushUndo(op);
    bump();
    return true;
  }, [runLocal, invert, pushUndo]);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    bump();
  }, []);

  // Reset stacks when the scope entity changes.
  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    seen.current.clear();
    seenOrder.current = [];
    bump();
  }, [scope?.kind, scope?.id]);

  // Subscribe to remote ops on the scope channel and apply them idempotently.
  useEffect(() => {
    if (!enabled || !scope || !realtime || !user) return;
    const ch = realtime.getChannel(channelName(scope));
    const listener: MessageListener = (msg) => {
      if (msg.name !== OP_EVENT) return;
      const op = msg.data as Op | undefined;
      if (!op || !op.id) return;
      if (!markSeen(op.id)) return; // dedupe own echo + duplicates
      applyingRef.current = true;
      Promise.resolve(applyRef.current(op, { origin: "remote", shouldPersist: false })).finally(() => {
        applyingRef.current = false;
      });
    };
    ch.subscribe(OP_EVENT, listener);
    return () => {
      try {
        ch.unsubscribe(OP_EVENT, listener);
      } catch {
        /* noop */
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scope?.kind, scope?.id, realtime, user, markSeen]);

  return {
    dispatch,
    record,
    undo,
    redo,
    clear,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    newId: genId,
    applyingRef,
  };
}
