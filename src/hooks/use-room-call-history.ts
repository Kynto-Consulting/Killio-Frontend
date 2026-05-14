"use client";

import { useState, useEffect, useCallback } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import {
  listRoomCalls,
  getCallTranscript,
  RoomCall,
  CallTranscript,
} from "@/lib/api/rooms";

export function useRoomCallHistory(
  roomId: string | null | undefined,
  accessToken: string | null | undefined
) {
  const [calls, setCalls] = useState<RoomCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!roomId || !accessToken) return;
    setIsLoading(true);
    listRoomCalls(roomId, accessToken)
      .then(setCalls)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [roomId, accessToken]);

  let realtime: ReturnType<typeof useRealtime> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    realtime = useRealtime();
  } catch {}

  useEffect(() => {
    if (!roomId || !realtime) return;
    const channel = realtime.getChannel(realtimeChannel.room(roomId));

    const onCallStarted = (msg: { name: string; data: unknown }) => {
      const { callId, initiatorUserId, startedAt } = (msg.data ?? {}) as any;
      setCalls((prev) => {
        if (prev.some((c) => c.id === callId)) return prev;
        const newCall: RoomCall = {
          id: callId,
          roomId: roomId!,
          startedAt,
          initiatorUserId,
          participants: [],
          transcriptStatus: "none",
        };
        return [newCall, ...prev];
      });
    };

    const onCallEnded = (msg: { name: string; data: unknown }) => {
      const { callId, endedAt, transcriptStatus } = (msg.data ?? {}) as any;
      setCalls((prev) =>
        prev.map((c) =>
          c.id === callId ? { ...c, endedAt, transcriptStatus: transcriptStatus ?? c.transcriptStatus } : c
        )
      );
    };

    channel.subscribe("room.call.started", onCallStarted);
    channel.subscribe("room.call.ended", onCallEnded);

    return () => {
      try { channel.unsubscribe("room.call.started", onCallStarted); } catch {}
      try { channel.unsubscribe("room.call.ended", onCallEnded); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, realtime]);

  const getTranscript = useCallback(
    async (callId: string): Promise<CallTranscript | null> => {
      if (!roomId || !accessToken) return null;
      try {
        return await getCallTranscript(roomId, callId, accessToken);
      } catch {
        return null;
      }
    },
    [roomId, accessToken]
  );

  return { calls, isLoading, getTranscript };
}
