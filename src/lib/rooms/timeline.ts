/**
 * The channel timeline: the room's messages with the person's private (ephemeral) bot answers mixed in by date, under the
 * same rule as every other message (createdAt, then id; see message-order.ts). An ephemeral keeps its own tie-break id
 * (`~eph:<id>`, after any normal message with the same timestamp) and is never part of the cached / paginated message list:
 * it is merged here, per render, so it cannot be duplicated by the per-room cache. Pure; tested in timeline.test.ts.
 */
import { insertOrdered } from "./message-order.ts";
import type { HistoryMessage } from "./history.ts";

export interface EphemeralLike {
  id: string;
  createdAt: string;
}

export type TimelineItem<M extends HistoryMessage, E extends EphemeralLike> =
  | { kind: "message"; key: string; createdAt: string; message: M }
  | { kind: "ephemeral"; key: string; createdAt: string; ephemeral: E };

interface Slot<M extends HistoryMessage, E extends EphemeralLike> extends HistoryMessage {
  item: TimelineItem<M, E>;
}

export const ephemeralKey = (id: string): string => `~eph:${id}`;

export interface TimelineWindow {
  /** The loaded window does not start at the first message of the room: older ephemerals wait until their time is loaded. */
  hasMoreBefore?: boolean;
  /** The window does not reach the present: newer ephemerals wait too. */
  hasMoreAfter?: boolean;
}

/**
 * Merges `ephemerals` into `messages` (already ordered) by (createdAt, id). Ephemerals whose time lies outside a partial
 * window are held back so they never show detached from their neighbours. Dismissed ones are simply absent from the input.
 */
export function mergeTimeline<M extends HistoryMessage, E extends EphemeralLike>(
  messages: readonly M[],
  ephemerals: readonly E[],
  window: TimelineWindow = {},
): TimelineItem<M, E>[] {
  const slots: Slot<M, E>[] = messages.map((m) => ({ id: m.id, createdAt: m.createdAt, item: { kind: "message", key: m.id, createdAt: m.createdAt, message: m } }));
  if (ephemerals.length === 0) return slots.map((s) => s.item);
  const first = messages[0];
  const last = messages[messages.length - 1];
  let merged = slots;
  for (const e of ephemerals) {
    const t = Date.parse(e.createdAt);
    if (first && window.hasMoreBefore && t < Date.parse(first.createdAt)) continue;
    if (last && window.hasMoreAfter && t > Date.parse(last.createdAt)) continue;
    const key = ephemeralKey(e.id);
    merged = insertOrdered(merged, { id: key, createdAt: e.createdAt, item: { kind: "ephemeral", key, createdAt: e.createdAt, ephemeral: e } } as Slot<M, E>);
  }
  return merged.map((s) => s.item);
}
