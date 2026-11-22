import { threadRootOf, type RoomMessage, type MessageStatus } from "@/lib/api/rooms";
import { unreadDividerId, type HistoryPage, type ReadState } from "./history.ts";
import { fetchMessagesPage, fetchReadState } from "./history-api.ts";
import { RoomCache, isFresh, type RoomSnapshot } from "./room-cache.ts";

/** The one in-memory cache of room windows (stale-while-revalidate), shared by the open room and the prefetch. */
export const roomCache = new RoomCache<RoomMessage>();

/** Normalises a message coming from the API (thread root field, default status). */
export function prepareMessage(m: RoomMessage): RoomMessage {
  const root = threadRootOf(m as RoomMessage & { thread_root_id?: string });
  const withRoot = root && !m.threadRootId ? { ...m, threadRootId: root } : m;
  return withRoot.status ? withRoot : { ...withRoot, status: "sent" as MessageStatus };
}

export interface FetchedRoom {
  page: HistoryPage<RoomMessage>;
  readState: ReadState | null;
  unreadAnchorId: string | null;
}

/**
 * What opening a room needs: the first window (the latest page, or the page around the first unread message), the read
 * state and the unread divider. Throws when the messages cannot be read (the read state failing is not fatal).
 */
export async function fetchRoomWindow(roomId: string, token: string, userId: string | null | undefined, signal?: AbortSignal): Promise<FetchedRoom> {
  const [pageRes, readRes] = await Promise.allSettled([
    fetchMessagesPage<RoomMessage>(roomId, token, {}, { normalize: prepareMessage, signal }),
    fetchReadState(roomId, token, { signal }),
  ]);
  if (pageRes.status === "rejected") throw pageRes.reason;
  let page = pageRes.value;
  const rs = readRes.status === "fulfilled" ? readRes.value : null;
  let anchor: string | null = null;
  if (rs && rs.unreadCount > 0) {
    if (rs.firstUnreadMessageId && page.messages.some((m) => m.id === rs.firstUnreadMessageId)) anchor = rs.firstUnreadMessageId;
    else if (rs.firstUnreadMessageId && !page.legacy) {
      try {
        const around = await fetchMessagesPage<RoomMessage>(roomId, token, { around: rs.firstUnreadMessageId }, { normalize: prepareMessage, signal });
        page = around;
        anchor = rs.firstUnreadMessageId;
      } catch {
        // the latest page is shown; the banner still offers the jump
      }
    } else anchor = unreadDividerId(page.messages, rs, userId);
  }
  return { page, readState: rs, unreadAnchorId: anchor };
}

/** Loads a room's first window into the cache (hover prefetch / neighbour warm-up). A room already cached is left alone. */
export async function prefetchRoom(roomId: string, token: string, userId: string | null | undefined, signal: AbortSignal): Promise<void> {
  if (roomCache.has(roomId)) return;
  const fetched = await fetchRoomWindow(roomId, token, userId, signal);
  if (signal.aborted || roomCache.has(roomId)) return;
  const snap: RoomSnapshot<RoomMessage> = {
    messages: fetched.page.messages,
    hasMoreBefore: fetched.page.hasMoreBefore,
    hasMoreAfter: fetched.page.hasMoreAfter,
    readState: fetched.readState,
    unreadAnchorId: fetched.unreadAnchorId,
    scroll: null,
    fetchedAt: Date.now(),
  };
  roomCache.set(roomId, snap);
}

/** True when a prefetch has nothing to do for this room. */
export function prefetchNotNeeded(roomId: string, openRoomId: string | null | undefined): boolean {
  return roomId === openRoomId || isFresh(roomCache.peek(roomId), Date.now());
}
