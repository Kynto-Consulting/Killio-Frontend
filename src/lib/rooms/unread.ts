/**
 * Unread and mention counters of the sidebar, kept on the client from live messages (the backend may also send
 * `unreadCount` / `mentionCount` per room, which only SEEDS rooms not tracked yet). Pure, tested in unread.test.ts.
 */

export type UnreadMap = Readonly<Record<string, { unread: number; mentions: number }>>;

export interface IncomingMessageEvent {
  roomId: string;
  activeRoomId: string | null;
  fromSelf: boolean;
  mentioned: boolean;
  /** Join / call banners and the like do not count as unread. */
  isSystem?: boolean;
}

export function onIncoming(map: UnreadMap, ev: IncomingMessageEvent): UnreadMap {
  if (ev.fromSelf || ev.isSystem || ev.roomId === ev.activeRoomId) return map;
  const current = map[ev.roomId] ?? { unread: 0, mentions: 0 };
  return { ...map, [ev.roomId]: { unread: current.unread + 1, mentions: current.mentions + (ev.mentioned ? 1 : 0) } };
}

export function clearRoom(map: UnreadMap, roomId: string): UnreadMap {
  if (!(roomId in map)) return map;
  const { [roomId]: _gone, ...rest } = map;
  return rest;
}

/** Counters sent by the server fill rooms that have no local count yet; the open room never shows a badge. */
export function seedFromRooms(
  map: UnreadMap,
  rooms: ReadonlyArray<{ id: string; unreadCount?: number | null; mentionCount?: number | null }>,
  activeRoomId: string | null,
): UnreadMap {
  let next: Record<string, { unread: number; mentions: number }> | null = null;
  for (const r of rooms) {
    if (r.id === activeRoomId || r.id in map) continue;
    const unread = Math.max(0, r.unreadCount ?? 0);
    const mentions = Math.max(0, r.mentionCount ?? 0);
    if (unread === 0 && mentions === 0) continue;
    next ??= { ...map };
    next[r.id] = { unread, mentions };
  }
  return next ?? map;
}

export function withBadges<R extends { id: string }>(
  rooms: readonly R[],
  map: UnreadMap,
  mutedIds: ReadonlySet<string>,
): Array<R & { unreadCount: number; mentionCount: number; muted: boolean }> {
  return rooms.map((r) => ({
    ...r,
    unreadCount: map[r.id]?.unread ?? 0,
    mentionCount: map[r.id]?.mentions ?? 0,
    muted: mutedIds.has(r.id),
  }));
}

/** Rooms worth subscribing to for badges: everything but the open one, capped so a big team does not open hundreds of channels. */
export function roomsToWatch<R extends { id: string; type: string }>(rooms: readonly R[], activeRoomId: string | null, cap = 40): R[] {
  return rooms.filter((r) => r.id !== activeRoomId).slice(0, cap);
}

export const MUTED_STORAGE_KEY = "killio:rooms:muted";

export function parseMutedIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function toggleMuted(ids: ReadonlySet<string>, roomId: string, muted: boolean): Set<string> {
  const next = new Set(ids);
  if (muted) next.add(roomId);
  else next.delete(roomId);
  return next;
}
