"use client";

import { useState, useEffect, useCallback } from "react";
import { getAblyClient } from "@/lib/ably";
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

  useEffect(() => {
    if (!roomId || !accessToken) return;
    const ably = getAblyClient(accessToken);
    const channel = ably.channels.get(`room:${roomId}`);

    const onCallStarted = (msg: any) => {
      const { callId, initiatorUserId, startedAt } = msg.data;
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

    const onCallEnded = (msg: any) => {
      const { callId, endedAt, transcriptStatus } = msg.data;
      setCalls((prev) =>
        prev.map((c) =>
          c.id === callId ? { ...c, endedAt, transcriptStatus: transcriptStatus ?? c.transcriptStatus } : c
        )
      );
    };

    channel.subscribe("room.call.started", onCallStarted);
    channel.subscribe("room.call.ended", onCallEnded);

    return () => {
      channel.unsubscribe("room.call.started", onCallStarted);
      channel.unsubscribe("room.call.ended", onCallEnded);
    };
  }, [roomId, accessToken]);

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
