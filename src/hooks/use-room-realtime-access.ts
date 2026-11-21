"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { newlyVisibleRooms } from "@/lib/realtime/ably-recovery";

/**
 * Renews the realtime permissions (Ably: a fresh token) so channels of rooms created or shared after the token was
 * issued can be subscribed. Providers that authorise per team (Pulse) have no `renewAuth`: this resolves false and
 * nothing is lost. Safe to call often: concurrent calls share one renewal.
 */
export function useRealtimeAccessRenewal(): () => Promise<boolean> {
  const realtime = useRealtime();
  return useCallback(async () => {
    try {
      return (await realtime.renewAuth?.()) ?? false;
    } catch {
      return false;
    }
  }, [realtime]);
}

/** Renews the token when a room shows up in the list that was not there before (it was shared with the user). */
export function useRenewOnNewRooms(roomIds: readonly string[], ready: boolean): void {
  const renew = useRealtimeAccessRenewal();
  const known = useRef<Set<string> | null>(null);
  const key = roomIds.join("|");

  useEffect(() => {
    if (!ready) return;
    const fresh = newlyVisibleRooms(known.current, roomIds);
    known.current = new Set(roomIds);
    if (fresh.length > 0) void renew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, renew]);
}
