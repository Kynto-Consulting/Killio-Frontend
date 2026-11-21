"use client";

import { useEffect, useRef } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { MessageListener } from "@/lib/realtime/types";
import { deletedRoomId } from "@/lib/rooms/channel-order";

const MAX_WATCHED = 200;

/**
 * Calls `onDeleted(roomId)` when another client deletes a channel (`room.deleted`). The event is listened on the
 * team channel and on the channel of each listed room, so it works whichever of them the server publishes to.
 */
export function useRoomDeleted(
  teamId: string | null | undefined,
  channelIds: readonly string[],
  onDeleted: (roomId: string) => void,
): void {
  const realtime = useRealtime();
  const handler = useRef(onDeleted);
  handler.current = onDeleted;
  const key = channelIds.slice(0, MAX_WATCHED).join("|");

  useEffect(() => {
    if (!realtime) return;
    const listener: MessageListener = (msg) => {
      const id = deletedRoomId(msg.data);
      if (id) handler.current(id);
    };
    const channels = [
      ...(teamId ? [realtime.getChannel(realtimeChannel.team(teamId))] : []),
      ...(key ? key.split("|").map((id) => realtime.getChannel(realtimeChannel.room(id))) : []),
    ];
    for (const ch of channels) ch.subscribe("room.deleted", listener);
    return () => {
      for (const ch of channels) {
        try { ch.unsubscribe("room.deleted", listener); } catch { /* channel gone */ }
      }
    };
  }, [realtime, teamId, key]);
}
