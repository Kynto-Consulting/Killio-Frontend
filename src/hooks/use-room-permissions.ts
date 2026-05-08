"use client";

import { useState, useEffect } from "react";
import { getMyRoomPermissions, RoomPermissions } from "@/lib/api/rooms";

const DEFAULT_PERMISSIONS: RoomPermissions = {
  canPost: true,
  canCall: true,
  canInvite: false,
  canManage: false,
  canRecord: true,
};

export function useRoomPermissions(
  roomId: string | null | undefined,
  accessToken: string | null | undefined
) {
  const [permissions, setPermissions] = useState<RoomPermissions>(DEFAULT_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!roomId || !accessToken) return;
    setIsLoading(true);
    getMyRoomPermissions(roomId, accessToken)
      .then(setPermissions)
      .catch(() => setPermissions(DEFAULT_PERMISSIONS))
      .finally(() => setIsLoading(false));
  }, [roomId, accessToken]);

  return { permissions, isLoading };
}
