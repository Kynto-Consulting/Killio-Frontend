"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getMemberModeration } from "@/lib/api/member-profile";
import type { MemberModeration } from "@/lib/rooms/user-profile-compact";

/** Loads the moderator view data (the server answers 403 to non-moderators; `enabled` keeps the call away from them). */
export function useMemberModeration(teamId: string | null | undefined, userId: string | null | undefined, roomId: string | null | undefined, accessToken: string | null | undefined, enabled: boolean) {
  const [data, setData] = useState<MemberModeration | null>(null);
  const [error, setError] = useState<{ status?: number } | null>(null);
  const [version, setVersion] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !teamId || !userId || !accessToken) return;
    const mine = ++seq.current;
    setError(null);
    getMemberModeration(teamId, userId, roomId, accessToken)
      .then((d) => { if (seq.current === mine) setData(d); })
      .catch((e: { status?: number }) => { if (seq.current === mine) setError({ status: e?.status }); });
    return () => { seq.current++; };
  }, [teamId, userId, roomId, accessToken, enabled, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading: enabled && !data && !error, reload };
}
