"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getMemberProfile } from "@/lib/api/member-profile";
import type { MemberProfile } from "@/lib/rooms/user-profile";

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; data: MemberProfile }>();
const keyOf = (teamId: string, userId: string, roomId?: string | null) => `${teamId}:${userId}:${roomId ?? ""}`;

/** Forget the cached profile(s) of a person (after a role, group or mute change). */
export function invalidateMemberProfile(teamId: string, userId?: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(`${teamId}:${userId ?? ""}`)) cache.delete(k);
}

export interface MemberProfileState {
  profile: MemberProfile | null;
  /** True while there is no answer yet (the card shows the data it already knows plus a skeleton). */
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/** Loads the profile card data. A fresh cached answer shows instantly; the request still runs when the cache is stale. */
export function useMemberProfile(teamId: string | null | undefined, userId: string | null | undefined, roomId: string | null | undefined, accessToken: string | null | undefined, enabled = true): MemberProfileState {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !teamId || !userId || !accessToken) { setProfile(null); setLoading(false); return; }
    const key = keyOf(teamId, userId, roomId);
    const hit = cache.get(key);
    setProfile(hit?.data ?? null);
    setError(false);
    if (hit && Date.now() - hit.at < TTL_MS && version === 0) { setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(!hit);
    getMemberProfile(teamId, userId, roomId, accessToken)
      .then((data) => {
        if (seq.current !== mine) return;
        cache.set(key, { at: Date.now(), data });
        setProfile(data);
        setLoading(false);
      })
      .catch(() => {
        if (seq.current !== mine) return;
        setError(true);
        setLoading(false);
      });
    return () => { seq.current++; };
  }, [teamId, userId, roomId, accessToken, enabled, version]);

  const reload = useCallback(() => {
    if (teamId && userId) invalidateMemberProfile(teamId, userId);
    setVersion((v) => v + 1);
  }, [teamId, userId]);

  return { profile, loading, error, reload };
}
