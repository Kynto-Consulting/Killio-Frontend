"use client";

import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/providers/session-provider";
import { listTeamGroups, type TeamGroup } from "@/lib/api/groups";

const CACHE_MS = 60_000;
const cache = new Map<string, { groups: TeamGroup[]; at: number }>();
const listeners = new Set<(teamId: string) => void>();

/** Call after creating / editing / deleting a group so every open picker and list refreshes. */
export function invalidateTeamGroups(teamId: string): void {
  cache.delete(teamId);
  listeners.forEach((l) => l(teamId));
}

/**
 * The groups of a team, shared by everything on the page (mention pickers, pills, filters, the team screen).
 * One request per minute per team; `invalidateTeamGroups` forces a reload.
 */
export function useTeamGroups(teamId: string | null | undefined): { groups: TeamGroup[]; isLoading: boolean; reload: () => void } {
  const { accessToken } = useSession();
  const [groups, setGroups] = useState<TeamGroup[]>(() => (teamId ? cache.get(teamId)?.groups ?? [] : []));
  const [isLoading, setIsLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!teamId) {
      setGroups([]);
      return;
    }
    const hit = cache.get(teamId);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      setGroups(hit.groups);
      return;
    }
    if (!accessToken) return;
    let alive = true;
    setIsLoading(true);
    listTeamGroups(teamId, accessToken)
      .then((list) => {
        cache.set(teamId, { groups: list, at: Date.now() });
        if (alive) setGroups(list);
      })
      .catch(() => {
        if (alive) setGroups(hit?.groups ?? []);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [teamId, accessToken, nonce]);

  useEffect(() => {
    const onInvalidate = (id: string) => {
      if (id === teamId) setNonce((n) => n + 1);
    };
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, [teamId]);

  const reload = useCallback(() => {
    if (teamId) invalidateTeamGroups(teamId);
  }, [teamId]);

  return { groups, isLoading, reload };
}
