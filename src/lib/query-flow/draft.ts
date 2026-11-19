/**
 * Autosave of the work in progress to sessionStorage (one draft per owner) and the rules for offering it back:
 * only when it is newer than the saved flow and different from it. Every storage access is guarded.
 */
import type { FlowGraph } from './types.ts';

export const DRAFT_PREFIX = 'killio.queryFlow.draft.v1:';
export const DRAFT_MAX_BYTES = 200 * 1024;
export const DRAFT_DEBOUNCE_MS = 500;

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export interface StoredDraft { ownerId: string; updatedAt: number; graph: FlowGraph }

export const draftKey = (ownerId: string): string => `${DRAFT_PREFIX}${ownerId}`;

/** Saves the draft; false when it is too big (the previous draft is kept) or storage is unavailable. */
export function saveDraft(storage: StorageLike | null | undefined, ownerId: string, graph: FlowGraph, now: number = Date.now()): boolean {
  try {
    if (!storage) return false;
    const text = JSON.stringify({ ownerId, updatedAt: now, graph } satisfies StoredDraft);
    if (text.length > DRAFT_MAX_BYTES) return false;
    storage.setItem(draftKey(ownerId), text);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage: StorageLike | null | undefined, ownerId: string): void {
  try {
    storage?.removeItem(draftKey(ownerId));
  } catch {
    /* nothing to clear */
  }
}

/** The stored draft, or null when missing, corrupt or not shaped like one. */
export function readDraft(storage: StorageLike | null | undefined, ownerId: string): StoredDraft | null {
  try {
    const raw = storage?.getItem(draftKey(ownerId));
    if (!raw || raw.length > DRAFT_MAX_BYTES) return null;
    const data = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (!data || typeof data !== 'object' || typeof data.updatedAt !== 'number' || !data.graph || !Array.isArray(data.graph.nodes) || !Array.isArray(data.graph.edges)) return null;
    return { ownerId, updatedAt: data.updatedAt, graph: data.graph };
  } catch {
    return null;
  }
}

/** When the saved flow was applied (`savedAt` that Apply writes into it); 0 for flows saved before drafts existed. */
export function savedAtOf(flow: unknown): number {
  const at = (flow as { savedAt?: unknown } | null | undefined)?.savedAt;
  return typeof at === 'number' && Number.isFinite(at) ? at : 0;
}

/**
 * Should "Restore unsaved changes?" be offered? Yes when the draft is newer than the saved flow and its content differs
 * from what is saved (`savedGraphJson` = JSON of the graph the editor starts from).
 */
export function restorableDraft(draft: StoredDraft | null, savedFlow: unknown, savedGraphJson: string): StoredDraft | null {
  if (!draft) return null;
  if (draft.updatedAt <= savedAtOf(savedFlow)) return null;
  if (JSON.stringify(draft.graph) === savedGraphJson) return null;
  return draft;
}

/** Debounces `fn`: a timer-free core so it can be tested: returns `schedule(now)` -> true when the save is due. */
export function createSaveGate(delayMs: number = DRAFT_DEBOUNCE_MS): { touch: (now: number) => void; due: (now: number) => boolean; done: () => void } {
  let last: number | null = null;
  return {
    touch: (now) => { last = now; },
    due: (now) => last !== null && now - last >= delayMs,
    done: () => { last = null; },
  };
}
