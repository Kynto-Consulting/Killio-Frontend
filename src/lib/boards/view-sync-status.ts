/**
 * Tiny external store with the sync state of the board that is open (there is one Kanban board on screen at a time), so
 * the filter bar and the tag group modal can show "not saved" without the page passing anything down.
 */
import type { SyncState } from './view-sync.ts';

let current: SyncState = { status: 'local', tagGroupsScope: 'local' };
let retryFn: (() => void) | null = null;
const listeners = new Set<() => void>();

export const getViewSyncState = (): SyncState => current;

export function publishViewSyncState(state: SyncState, retry?: (() => void) | null): void {
  current = state;
  if (retry !== undefined) retryFn = retry;
  for (const l of [...listeners]) l();
}

export function subscribeViewSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function retryViewSync(): void {
  retryFn?.();
}
