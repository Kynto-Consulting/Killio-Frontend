"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { IRealtimeChannel, MessageListener } from "@/lib/realtime/types";
import { mentionsMe } from "@/lib/rooms/mentions";
import {
  MUTED_STORAGE_KEY, clearRoom, onIncoming, parseMutedIds, roomsToWatch, seedFromRooms, toggleMuted, withBadges, type UnreadMap,
} from "@/lib/rooms/unread";

const MUTED_EVENT = "killio:rooms:muted-changed";

function readMuted(): Set<string> {
  try {
    return parseMutedIds(typeof window === "undefined" ? null : window.localStorage.getItem(MUTED_STORAGE_KEY));
  } catch {
    return new Set();
  }
}

/** Marks a room as silenced for the sidebar (the server preference stays the source of truth for notifications). */
export function setRoomMutedLocally(roomId: string, muted: boolean): void {
  try {
    const next = toggleMuted(readMuted(), roomId, muted);
    window.localStorage.setItem(MUTED_STORAGE_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(MUTED_EVENT));
  } catch {
    // storage blocked: the dimming is a convenience only
  }
}

interface Options<R extends { id: string; type: string; unreadCount?: number; mentionCount?: number }> {
  rooms: readonly R[];
  activeRoomId: string | null;
  userId?: string | null;
  roleIds?: readonly string[];
  groupIds?: readonly string[];
}

/**
 * Unread / mention badges for the sidebar. Subscribes to the live messages of the rooms that are not open (bounded) and
 * counts the ones from other people; opening a room clears its badge. Rooms come back decorated with `unreadCount`,
 * `mentionCount` and `muted`.
 */
export function useRoomUnread<R extends { id: string; type: string; unreadCount?: number; mentionCount?: number }>({
  rooms, activeRoomId, userId, roleIds, groupIds,
}: Options<R>) {
  const realtime = useRealtime();
  const [map, setMap] = useState<UnreadMap>({});
  const [muted, setMuted] = useState<Set<string>>(() => new Set());
  const me = useRef({ userId, roleIds, groupIds });
  me.current = { userId, roleIds, groupIds };
  const activeRef = useRef(activeRoomId);
  activeRef.current = activeRoomId;

  useEffect(() => {
    setMuted(readMuted());
    const refresh = () => setMuted(readMuted());
    window.addEventListener(MUTED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MUTED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (activeRoomId) setMap((m) => clearRoom(m, activeRoomId));
  }, [activeRoomId]);

  useEffect(() => {
    setMap((m) => seedFromRooms(m, rooms, activeRef.current));
  }, [rooms]);

  const watchedKey = useMemo(() => roomsToWatch(rooms, activeRoomId).map((r) => r.id).join("|"), [rooms, activeRoomId]);

  useEffect(() => {
    if (!watchedKey) return;
    const subs: Array<{ channel: IRealtimeChannel; listener: MessageListener }> = [];
    for (const id of watchedKey.split("|")) {
      const channel = realtime.getChannel(realtimeChannel.room(id));
      const listener: MessageListener = (msg) => {
        const d = (msg.data ?? {}) as { userId?: string; content?: string; type?: string };
        const type = d.type ?? "text";
        const current = me.current;
        setMap((m) =>
          onIncoming(m, {
            roomId: id,
            activeRoomId: activeRef.current,
            fromSelf: Boolean(current.userId) && d.userId === current.userId,
            mentioned: mentionsMe(d.content ?? "", { userId: current.userId, roleIds: current.roleIds, groupIds: current.groupIds }),
            isSystem: type === "system" || type === "call_started" || type === "call_ended",
          })
        );
      };
      channel.subscribe("room.message", listener);
      subs.push({ channel, listener });
    }
    return () => {
      for (const s of subs) {
        try { s.channel.unsubscribe("room.message", s.listener); } catch { /* channel gone */ }
      }
    };
  }, [watchedKey, realtime]);

  const decorated = useMemo(() => withBadges(rooms, map, muted), [rooms, map, muted]);
  const clear = useCallback((roomId: string) => setMap((m) => clearRoom(m, roomId)), []);
  return { rooms: decorated, clear };
}
