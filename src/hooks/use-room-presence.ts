"use client";

import { useState, useEffect, useRef } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { IRealtimeChannel } from "@/lib/realtime/types";

export interface RoomPresenceMember {
  clientId: string;
  data: {
    displayName: string;
    email: string;
    avatarUrl?: string | null;
    status: "online" | "in-call";
  };
}

export function useRoomPresence(
  roomId: string | null | undefined,
  user: { id?: string; email?: string; displayName?: string; username?: string; avatarUrl?: string } | null | undefined,
  accessToken?: string | null | undefined,
): RoomPresenceMember[] {
  const [members, setMembers] = useState<RoomPresenceMember[]>([]);
  const channelRef = useRef<IRealtimeChannel | null>(null);

  let realtime: ReturnType<typeof useRealtime> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    realtime = useRealtime();
  } catch {
    // Provider not mounted yet — no-op
  }

  const refreshMembers = async (channel: IRealtimeChannel) => {
    try {
      const presenceMembers = await channel.presence.get();
      const seen = new Set<string>();
      const deduped: RoomPresenceMember[] = [];
      for (const m of presenceMembers) {
        if (!seen.has(m.clientId)) {
          seen.add(m.clientId);
          deduped.push({ clientId: m.clientId, data: m.data as RoomPresenceMember["data"] });
        }
      }
      setMembers(deduped);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!roomId || !user || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.room(roomId));
    channelRef.current = channel;

    const presenceData = {
      displayName: user.displayName || user.username || user.email || "Unknown",
      email: user.email || "",
      avatarUrl: user.avatarUrl ?? null,
      status: "online" as const,
    };

    channel.presence.enter(presenceData).then(() => {
      refreshMembers(channel);
    }).catch(console.error);

    const handler = () => refreshMembers(channel);
    channel.presence.subscribe(["enter", "leave", "update"], handler);

    return () => {
      channel.presence.unsubscribe();
      channel.presence.leave().catch(console.error);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id, realtime]);

  const setStatus = (status: "online" | "in-call") => {
    const channel = channelRef.current;
    if (!channel || !user) return;
    channel.presence.update({
      displayName: user.displayName || user.username || user.email || "Unknown",
      email: user.email || "",
      avatarUrl: user.avatarUrl ?? null,
      status,
    }).catch(console.error);
  };

  return members;
}
