"use client";

import { useEffect } from "react";
import { createRoomHeartbeat, sendRoomActivity } from "@/lib/rooms/room-activity";

/** Tells the server this room is open and visible (no push for what is already on screen). */
export function useRoomActivityHeartbeat(roomId: string | null | undefined, accessToken: string | null | undefined) {
  useEffect(() => {
    if (!roomId || !accessToken) return;
    const beat = createRoomHeartbeat({
      send: () => sendRoomActivity(roomId, accessToken, true),
      clear: () => sendRoomActivity(roomId, accessToken, false),
    });
    const sync = () => beat.setActive(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", () => beat.setActive(false));
    return () => {
      document.removeEventListener("visibilitychange", sync);
      beat.setActive(false);
    };
  }, [roomId, accessToken]);
}
