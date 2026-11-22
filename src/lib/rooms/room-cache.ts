/**
 * In-memory cache of the room message windows (stale-while-revalidate) and the per-room composer drafts.
 *
 * Switching rooms shows the cached window at once and revalidates it in the background; a skeleton is only needed when
 * there is no cache. Everything here is pure (no React, no fetch): the cache is a small LRU keyed by room id, scoped to
 * a user so another account never sees it. Tested in room-cache.test.ts. Relative imports only (node runs the tests
 * without the `@/` alias).
 */
import { isLocalMessage, mergeById, sortMessages, type HistoryMessage, type HistoryPage, type ReadState } from "./history.ts";

/** Rooms kept in memory. Above it the least recently used one is dropped. */
export const ROOM_CACHE_SIZE = 15;
/** Messages kept per cached room (the newest ones): the cache must stay small. */
export const ROOM_CACHE_MESSAGES = 120;

export interface RoomSnapshot<M extends HistoryMessage = HistoryMessage> {
  messages: M[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  readState: ReadState | null;
  unreadAnchorId: string | null;
  /** Last scroll position of the list, with whether it was at the present (then the room opens at the bottom). */
  scroll: { top: number; atBottom: boolean } | null;
  /** When the window was last confirmed by the server (ms). */
  fetchedAt: number;
}

/** LRU of room snapshots. `get` marks the room as recently used. */
export class RoomCache<M extends HistoryMessage = HistoryMessage> {
  private map = new Map<string, RoomSnapshot<M>>();
  private scope = "";

  private readonly capacity: number;

  constructor(capacity: number = ROOM_CACHE_SIZE) {
    this.capacity = capacity;
  }

  /** Another user (or none): nothing cached before is valid. */
  setScope(scope: string): void {
    if (scope === this.scope) return;
    this.scope = scope;
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  has(roomId: string): boolean {
    return this.map.has(roomId);
  }

  /** Room ids from the least to the most recently used. */
  keys(): string[] {
    return [...this.map.keys()];
  }

  /** The snapshot, marked as the most recently used. */
  get(roomId: string): RoomSnapshot<M> | undefined {
    const s = this.map.get(roomId);
    if (!s) return undefined;
    this.map.delete(roomId);
    this.map.set(roomId, s);
    return s;
  }

  /** Looks without touching the recency (for the prefetch decision). */
  peek(roomId: string): RoomSnapshot<M> | undefined {
    return this.map.get(roomId);
  }

  set(roomId: string, snap: RoomSnapshot<M>): void {
    const kept = snap.messages.length > ROOM_CACHE_MESSAGES && !snap.hasMoreAfter
      ? { ...snap, messages: snap.messages.slice(-ROOM_CACHE_MESSAGES), hasMoreBefore: true, scroll: null } // a pixel offset means nothing once the top is cut
      : snap;
    this.map.delete(roomId);
    this.map.set(roomId, kept);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  /** Remembers where the list was scrolled. Ignored for a room that is not cached. */
  saveScroll(roomId: string, top: number, atBottom: boolean): void {
    const s = this.map.get(roomId);
    if (s) s.scroll = { top: Math.max(0, Math.round(top)), atBottom };
  }

  /** The room changed in a way the cache cannot follow (deleted, access lost, rewritten): the next visit loads it again. */
  invalidate(roomId: string): void {
    this.map.delete(roomId);
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * A message that arrived for a room that is not the open one: added to its cached window when that window touches the
   * present (otherwise only the revalidation will fetch it). Returns whether the cache changed.
   */
  applyLive(roomId: string, message: M): boolean {
    const s = this.map.get(roomId);
    if (!s || s.hasMoreAfter) return false;
    const known = s.messages.some((m) => m.id === message.id);
    s.messages = known ? s.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)) : mergeById(s.messages, [message]);
    return true;
  }
}

/**
 * Merges the latest page the server just returned into a cached window (revalidation):
 *  - the messages of the fresh page win (edits, reactions, deletions inside its range);
 *  - cached messages older than the fresh page are kept (the user may have loaded more history), and cached messages
 *    inside the fresh range that the server no longer has are dropped (deleted while the user was away);
 *  - local placeholders (messages being sent) survive;
 *  - the edge flags come from the fresh page when the cache had nothing older, else the cached `hasMoreBefore` is kept.
 */
export function mergeFreshPage<M extends HistoryMessage>(
  cached: Pick<RoomSnapshot<M>, "messages" | "hasMoreBefore" | "hasMoreAfter">,
  fresh: Pick<HistoryPage<M>, "messages" | "hasMoreBefore" | "hasMoreAfter">,
): { messages: M[]; hasMoreBefore: boolean; hasMoreAfter: boolean } {
  if (fresh.messages.length === 0) {
    // An empty room (or every message deleted): keep only what is local.
    return { messages: cached.messages.filter((m) => isLocalMessage(m as M & { status?: string })), hasMoreBefore: false, hasMoreAfter: false };
  }
  const ordered = sortMessages(fresh.messages);
  const first = ordered[0]!;
  const older = cached.messages.filter((m) => !isLocalMessage(m as M & { status?: string }) && compareBefore(m, first));
  const locals = cached.messages.filter((m) => isLocalMessage(m as M & { status?: string }));
  const merged = mergeById(mergeById(older, ordered), locals);
  return {
    messages: merged,
    hasMoreBefore: older.length > 0 ? cached.hasMoreBefore || fresh.hasMoreBefore : fresh.hasMoreBefore,
    hasMoreAfter: fresh.hasMoreAfter,
  };
}

function compareBefore(a: HistoryMessage, b: HistoryMessage): boolean {
  const d = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (d !== 0) return d < 0;
  return a.id < b.id;
}

/** True when the cached snapshot is recent enough that a hover prefetch is pointless. */
export function isFresh(snap: Pick<RoomSnapshot, "fetchedAt"> | undefined, now: number, maxAgeMs = 30_000): boolean {
  return Boolean(snap) && now - (snap as RoomSnapshot).fetchedAt < maxAgeMs;
}

/** What the list should do when a room is opened from the cache. */
export function restoreTarget(snap: Pick<RoomSnapshot, "scroll" | "unreadAnchorId"> | undefined): { kind: "bottom" } | { kind: "divider" } | { kind: "scroll"; top: number } {
  if (!snap) return { kind: "bottom" };
  if (snap.unreadAnchorId) return { kind: "divider" };
  if (snap.scroll && !snap.scroll.atBottom) return { kind: "scroll", top: snap.scroll.top };
  return { kind: "bottom" };
}

/** Composer drafts per room: a room keeps what was being typed when the user comes back. */
export class DraftStore {
  private drafts = new Map<string, string>();

  save(roomId: string | null | undefined, text: string): void {
    if (!roomId) return;
    if (text.trim() === "") this.drafts.delete(roomId);
    else this.drafts.set(roomId, text);
  }

  get(roomId: string | null | undefined): string {
    return (roomId && this.drafts.get(roomId)) || "";
  }

  clear(roomId: string): void {
    this.drafts.delete(roomId);
  }

  get size(): number {
    return this.drafts.size;
  }
}
