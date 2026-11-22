/**
 * One rule for the order of a room's messages: ascending `createdAt`, the id as the stable tie-break, no duplicates.
 * Every path that adds a message to the list (history pages, realtime, optimistic sends and their confirmation, the
 * per-room cache, late arrivals) goes through these helpers; nothing appends to the end without sorting.
 * Pure and tested in message-order.test.ts. Relative imports only.
 */
import { compareMessages, type HistoryMessage } from "./history.ts";

/** Inserts `message` at its chronological place; a message with a known id replaces (merges into) the existing one, which is re-placed by the new time. */
export function insertOrdered<M extends HistoryMessage>(list: readonly M[], message: M): M[] {
  const existing = list.findIndex((m) => m.id === message.id);
  const base = existing === -1 ? [...list] : list.filter((_, i) => i !== existing);
  const next = existing === -1 ? message : ({ ...list[existing], ...message } as M);
  let lo = 0;
  let hi = base.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareMessages(base[mid]!, next) <= 0) lo = mid + 1;
    else hi = mid;
  }
  base.splice(lo, 0, next);
  return base;
}

/**
 * The server confirmed a message that was shown optimistically under `placeholderId`: the placeholder goes away and the
 * definitive message is placed by the SERVER time (it may move relative to messages that arrived meanwhile). If the
 * definitive message is already in the list (the realtime echo came first) the placeholder is simply dropped.
 */
export function reconcileOptimistic<M extends HistoryMessage>(list: readonly M[], placeholderId: string, final: M): M[] {
  return insertOrdered(list.filter((m) => m.id !== placeholderId), final);
}

/** Sorted copy without duplicate ids (the later entry of an id wins field by field). Use when a whole batch comes in. */
export function normalizeOrder<M extends HistoryMessage>(messages: readonly M[]): M[] {
  const byId = new Map<string, M>();
  for (const m of messages) {
    const known = byId.get(m.id);
    byId.set(m.id, known ? ({ ...known, ...m } as M) : m);
  }
  return [...byId.values()].sort(compareMessages);
}

/** True when the list is already in the canonical order without duplicates (for assertions and dev checks). */
export function isOrdered(messages: readonly HistoryMessage[]): boolean {
  const seen = new Set<string>();
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]!;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    if (i > 0 && compareMessages(messages[i - 1]!, m) > 0) return false;
  }
  return true;
}
