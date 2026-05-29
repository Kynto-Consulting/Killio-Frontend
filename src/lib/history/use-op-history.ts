"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { MessageListener } from "@/lib/realtime/types";
import { useSession } from "@/components/providers/session-provider";
import type { Op, OpApplier, OpDraft, OpScope } from "./types";
import { OpLog, genOpId, invertOp, makeOp } from "./op-stack";

const OP_EVENT = "op";

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
 *
 * Pure stack/inversion mechanics live in ./op-stack (OpLog) and are unit-tested.
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

  const log = useMemo(() => new OpLog(cap), [cap]);
  const applyingRef = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

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
      log.markSeen(op.id);
      applyingRef.current = true;
      try {
        await applyRef.current(op, { origin: op.origin, shouldPersist: true });
      } finally {
        applyingRef.current = false;
      }
      publish(op);
    },
    [log, publish],
  );

  const dispatch = useCallback(
    async (draft: OpDraft) => {
      if (!scope) return;
      const op = makeOp(draft, scope, actorId, "local");
      await runLocal(op);
      log.record(op);
      bump();
    },
    [scope, actorId, runLocal, log],
  );

  // Already applied+persisted by the engine handler. Record + broadcast only.
  const record = useCallback(
    (draft: OpDraft) => {
      if (!scope) return;
      const op = makeOp(draft, scope, actorId, "local");
      log.markSeen(op.id);
      publish(op);
      log.record(op);
      bump();
    },
    [scope, actorId, log, publish],
  );

  const undo = useCallback(async () => {
    const op = log.popUndo();
    if (!op) return false;
    await runLocal(invertOp(op, actorId, "undo"));
    log.pushRedo(op);
    bump();
    return true;
  }, [log, runLocal, actorId]);

  const redo = useCallback(async () => {
    const op = log.popRedo();
    if (!op) return false;
    await runLocal({ ...op, id: genOpId(), origin: "redo" });
    log.reapply(op);
    bump();
    return true;
  }, [log, runLocal]);

  const clear = useCallback(() => {
    log.clear();
    bump();
  }, [log]);

  // Reset stacks when the scope entity changes.
  useEffect(() => {
    log.clear();
    bump();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.kind, scope?.id]);

  // Subscribe to remote ops on the scope channel and apply them idempotently.
  useEffect(() => {
    if (!enabled || !scope || !realtime || !user) return;
    const ch = realtime.getChannel(channelName(scope));
    const listener: MessageListener = (msg) => {
      if (msg.name !== OP_EVENT) return;
      const op = msg.data as Op | undefined;
      if (!op || !op.id) return;
      if (!log.markSeen(op.id)) return; // dedupe own echo + duplicates
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
  }, [enabled, scope?.kind, scope?.id, realtime, user, log]);

  return {
    dispatch,
    record,
    undo,
    redo,
    clear,
    canUndo: log.canUndo,
    canRedo: log.canRedo,
    newId: genOpId,
    applyingRef,
  };
}
