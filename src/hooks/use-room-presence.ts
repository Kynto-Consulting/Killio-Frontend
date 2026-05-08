"use client";

import { useState, useEffect, useRef } from "react";
import { getAblyClient } from "@/lib/ably";
import type Ably from "ably";

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
  accessToken: string | null | undefined
): RoomPresenceMember[] {
  const [members, setMembers] = useState<RoomPresenceMember[]>([]);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);

  const refreshMembers = async (channel: Ably.RealtimeChannel) => {
    try {
      const presenceMembers = await channel.presence.get();
      if (!presenceMembers) return;
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
    if (!roomId || !accessToken || !user) return;

    const ably = getAblyClient(accessToken);
    const channel = ably.channels.get(`room:${roomId}`);
    channelRef.current = channel;

    const presenceData: RoomPresenceMember["data"] = {
      displayName: user.displayName || user.username || user.email || "Unknown",
      email: user.email || "",
      avatarUrl: user.avatarUrl ?? null,
      status: "online",
    };

    channel.presence.enter(presenceData).then(() => {
      refreshMembers(channel);
    }).catch(console.error);

    const handler = () => refreshMembers(channel);
    channel.presence.subscribe("enter", handler);
    channel.presence.subscribe("leave", handler);
    channel.presence.subscribe("update", handler);

    return () => {
      channel.presence.unsubscribe("enter", handler);
      channel.presence.unsubscribe("leave", handler);
      channel.presence.unsubscribe("update", handler);
      channel.presence.leave();
    };
  }, [roomId, accessToken, user?.id]);

  const setStatus = (status: "online" | "in-call") => {
    const channel = channelRef.current;
    if (!channel || !user) return;
    channel.presence.update({
      displayName: user.displayName || user.username || user.email || "Unknown",
      email: user.email || "",
      avatarUrl: user.avatarUrl ?? null,
      status,
    });
  };

  return members;
}
