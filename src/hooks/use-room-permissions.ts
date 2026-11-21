"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMyRoomPermissions, type RoomPermissions } from "@/lib/api/rooms";
import {
  LOADING_ROOM_ACCESS,
  muteMinutesLeft,
  normalizeRoomAccess,
  resolveRoomControls,
  type RoomAccess,
  type RoomControls,
  type RoomControlsContext,
} from "@/lib/rooms/room-controls";

/**
 * What the current user may do in a room, as resolved by the backend. While loading or when the server cannot answer,
 * the user is treated as read-only: nothing that could fail with 403 is offered.
 *
 * `permissions` keeps the legacy five-boolean shape for older callers (the console page); new code reads `access` and
 * `controls`.
 */
export function useRoomPermissions(
  roomId: string | null | undefined,
  accessToken: string | null | undefined,
  context: Omit<RoomControlsContext, "now"> = {}
) {
  const [access, setAccess] = useState<RoomAccess>(LOADING_ROOM_ACCESS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);
  /** Room whose answer (or failure) has arrived: until then `access` is only the read-only placeholder. */
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Ticks when a timed mute ends so the composer comes back without a reload.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!roomId || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    // Another room: the previous room's rights must never apply while the answer is on its way.
    if (readyFor !== roomId) setAccess(LOADING_ROOM_ACCESS);
    getMyRoomPermissions(roomId, accessToken)
      .then((raw: RoomPermissions) => { if (!cancelled) setAccess(normalizeRoomAccess(raw)); })
      .catch((err) => {
        if (cancelled) return;
        setAccess(LOADING_ROOM_ACCESS);
        setError((err as { status?: number })?.status === 403 ? "forbidden" : "failed");
      })
      .finally(() => { if (!cancelled) { setIsLoading(false); setReadyFor(roomId); } });
    return () => { cancelled = true; };
    // `readyFor` is read only to decide the reset above; re-running on it would refetch for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, accessToken, version]);

  const isReady = readyFor === roomId;

  useEffect(() => {
    const minutes = muteMinutesLeft(access, Date.now());
    if (minutes === null) return;
    const timer = setTimeout(() => setNow(Date.now()), minutes * 60_000 + 500);
    return () => clearTimeout(timer);
  }, [access]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const controls: RoomControls = useMemo(
    () => resolveRoomControls(access, { channelType: context.channelType, roomType: context.roomType, now }),
    [access, context.channelType, context.roomType, now]
  );

  const permissions: RoomPermissions = useMemo(
    () => ({
      canPost: access.canPost && controls.composer === "input",
      canCall: controls.showCall,
      canInvite: access.canInvite,
      canManage: access.canManage,
      canRecord: access.canRecord && controls.showCall,
    }),
    [access, controls]
  );

  return { permissions, access, controls, isLoading, isReady, error, refresh };
}
