import { useCallback, useRef, useState } from "react";

// Per-document op-history. Each entry is an inverse/forward closure pair.
// `undo` reverts a user mutation; `redo` re-applies it. Closures should call
// the existing persistence seam (create/update/delete/reorder) so persistence
// and the local-workspace file write happen for free.
export type HistoryEntry = {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  // Optional grouping key. Consecutive records sharing a key within the time
  // window collapse into one step (e.g. rapid content edits to one brick).
  coalesceKey?: string;
};

export type RecordOptions = {
  coalesceKey?: string;
  coalesceWithinMs?: number;
};

export type DocHistory = {
  record: (entry: HistoryEntry, opts?: RecordOptions) => void;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  clear: () => void;
  // True while an undo/redo is being applied. Mutation paths must check this
  // and skip recording so applying an inverse never pushes a new op.
  applyingRef: React.MutableRefObject<boolean>;
  canUndo: boolean;
  canRedo: boolean;
};

export function useDocHistory(opts?: { cap?: number }): DocHistory {
  const cap = opts?.cap ?? 50;
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const applyingRef = useRef(false);
  const lastRecordAtRef = useRef(0);
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  const record = useCallback(
    (entry: HistoryEntry, options?: RecordOptions) => {
      // Never record ops produced while applying an undo/redo.
      if (applyingRef.current) return;

      const key = options?.coalesceKey;
      const within = options?.coalesceWithinMs ?? 800;
      if (key && undoStack.current.length > 0) {
        const top = undoStack.current[undoStack.current.length - 1];
        if (top.coalesceKey === key && Date.now() - lastRecordAtRef.current < within) {
          // Fold into the previous step: keep its (older) undo, take the new redo.
          top.redo = entry.redo;
          lastRecordAtRef.current = Date.now();
          redoStack.current = [];
          bump();
          return;
        }
      }

      undoStack.current.push({ ...entry, coalesceKey: key });
      if (undoStack.current.length > cap) undoStack.current.shift();
      redoStack.current = [];
      lastRecordAtRef.current = Date.now();
      bump();
    },
    [cap],
  );

  const undo = useCallback(async () => {
    const entry = undoStack.current.pop();
    if (!entry) return false;
    applyingRef.current = true;
    try {
      await entry.undo();
    } finally {
      applyingRef.current = false;
    }
    redoStack.current.push(entry);
    bump();
    return true;
  }, []);

  const redo = useCallback(async () => {
    const entry = redoStack.current.pop();
    if (!entry) return false;
    applyingRef.current = true;
    try {
      await entry.redo();
    } finally {
      applyingRef.current = false;
    }
    undoStack.current.push(entry);
    bump();
    return true;
  }, []);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastRecordAtRef.current = 0;
    bump();
  }, []);

  return {
    record,
    undo,
    redo,
    clear,
    applyingRef,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
