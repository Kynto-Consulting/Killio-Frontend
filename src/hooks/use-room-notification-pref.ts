"use client";

import { useState, useEffect, useCallback } from "react";
import { getRoomNotificationPref, setRoomNotificationPref, RoomNotificationPref } from "@/lib/api/rooms";
import { useSession } from "@/components/providers/session-provider";
import { setRoomMutedLocally } from "@/hooks/use-room-unread";

export function useRoomNotificationPref(roomId: string) {
  const { accessToken } = useSession();
  const [pref, setPrefState] = useState<RoomNotificationPref>("all");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!roomId || !accessToken) return;
    setIsLoading(true);
    getRoomNotificationPref(roomId, accessToken)
      .then((p) => {
        setPrefState(p);
        setRoomMutedLocally(roomId, p === "none");
      })
      .catch(() => {
        // Silently fall back to default; backend may not be ready
      })
      .finally(() => setIsLoading(false));
  }, [roomId, accessToken]);

  const setPref = useCallback(
    async (newPref: RoomNotificationPref) => {
      if (!accessToken) return;
      // Optimistic update
      setPrefState(newPref);
      setRoomMutedLocally(roomId, newPref === "none");
      try {
        const confirmed = await setRoomNotificationPref(roomId, newPref, accessToken);
        setPrefState(confirmed);
        setRoomMutedLocally(roomId, confirmed === "none");
      } catch {
        // Revert is not strictly necessary since the value is best-effort,
        // but we can silently ignore errors here.
      }
    },
    [roomId, accessToken]
  );

  return { pref, setPref, isLoading };
}
