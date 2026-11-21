"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import { dismissRoomEphemeral, listRoomEphemeral } from "@/lib/api/room-tools";
import { addEphemeral, dismissEphemeral, mergeRoomEphemeral, normalizeEphemeral, visibleEphemeral, type EphemeralMessage } from "@/lib/rooms/ephemeral";

/**
 * The private bot answers of the current person in one room: loaded when the room opens (so a reload keeps them), received live on the
 * person's own channel (`room.ephemeral` on `user:<id>`), dropped when they expire or are dismissed. Never part of the message list.
 */
export function useRoomEphemeral(roomId: string | null | undefined, userId: string | null | undefined, accessToken: string | null | undefined) {
  const realtime = useRealtime();
  const [all, setAll] = useState<EphemeralMessage[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!roomId || !accessToken) return;
    let cancelled = false;
    listRoomEphemeral(roomId, accessToken)
      .then((list) => { if (!cancelled) setAll((cur) => mergeRoomEphemeral(cur, roomId, list)); })
      .catch(() => undefined); // no private answers is the normal state; a failure must not break the chat
    return () => { cancelled = true; };
  }, [roomId, accessToken]);

  useEffect(() => {
    if (!userId || !realtime) return;
    const channel = realtime.getChannel(realtimeChannel.user(userId));
    const onEphemeral = (msg: { name: string; data: unknown }) => {
      const e = normalizeEphemeral(msg.data);
      if (e) setAll((cur) => addEphemeral(cur, e));
    };
    channel.subscribe("room.ephemeral", onEphemeral);
    return () => { try { channel.unsubscribe("room.ephemeral", onEphemeral); } catch {} };
  }, [userId, realtime]);

  // Expired messages disappear without a reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const items = useMemo(() => (roomId ? visibleEphemeral(all, roomId, now) : []), [all, roomId, now]);

  const dismiss = useCallback(
    (id: string) => {
      setAll((cur) => dismissEphemeral(cur, id));
      if (roomId && accessToken) void dismissRoomEphemeral(roomId, id, accessToken).catch(() => undefined);
    },
    [roomId, accessToken],
  );

  return { items, dismiss };
}
