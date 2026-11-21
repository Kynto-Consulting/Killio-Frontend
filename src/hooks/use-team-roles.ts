"use client";

import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/providers/session-provider";
import { listRoles } from "@/lib/api/roles";
import { sortRoles, type TeamRole } from "@/lib/roles/model";

const CACHE_MS = 30_000;
const cache = new Map<string, { roles: TeamRole[]; at: number }>();
const listeners = new Set<(teamId: string) => void>();
const inflight = new Map<string, Promise<TeamRole[]>>();

/** Call after creating / editing / deleting / reordering roles so every open picker refreshes. */
export function invalidateTeamRoles(teamId: string): void {
  cache.delete(teamId);
  listeners.forEach((l) => l(teamId));
}

/**
 * The roles of a workspace, highest first. `error` is set when the API is not reachable
 * (or does not exist yet): screens then show a short explanation instead of an empty editor.
 */
export function useTeamRoles(teamId: string | null | undefined): {
  roles: TeamRole[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
} {
  const { accessToken } = useSession();
  const [roles, setRoles] = useState<TeamRole[]>(() => (teamId ? cache.get(teamId)?.roles ?? [] : []));
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = (id: string) => id === teamId && setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [teamId]);

  useEffect(() => {
    if (!teamId || !accessToken) {
      setRoles([]);
      return;
    }
    const hit = cache.get(teamId);
    if (hit) setRoles(hit.roles);
    else setRoles([]);
    if (hit && Date.now() - hit.at < CACHE_MS) return;
    let cancelled = false;
    setLoading(true);
    let request = inflight.get(teamId);
    if (!request) {
      request = listRoles(teamId, accessToken)
        .then((list) => {
          const sorted = sortRoles(list);
          cache.set(teamId, { roles: sorted, at: Date.now() });
          return sorted;
        })
        .finally(() => inflight.delete(teamId));
      inflight.set(teamId, request);
    }
    request
      .then((list) => {
        if (cancelled) return;
        setRoles(list);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "error"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [teamId, accessToken, tick]);

  const reload = useCallback(() => teamId && invalidateTeamRoles(teamId), [teamId]);
  return { roles, isLoading, error, reload };
}
