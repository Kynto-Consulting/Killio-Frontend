"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "@/components/providers/session-provider";
import { useTeamRealtime } from "@/hooks/useTeamRealtime";
import { listTeamMembers } from "@/lib/api/contracts";
import { getMyTeamPermissions } from "@/lib/api/roles";
import { fallbackPermissions, makeCan, type MyTeamPermissions } from "@/lib/roles/model";

/** What the screens read: permissions already resolved by the server (never computed from roles here). */
export interface TeamPermissionsState {
  /** `can("scripts.manage")`. False while loading (callers use `isLoading` to avoid flashing a denial). */
  can: (permission: string) => boolean;
  isOwner: boolean;
  roles: MyTeamPermissions["roles"];
  permissions: string[];
  /** Highest position among my roles (drives which controls are disabled; the server still decides). */
  highestPosition: number;
  /** Role ids I can hand out, from me/permissions (undefined on older backends). */
  manageableRoleIds?: string[];
  /** Role ids I can hand out when inviting. */
  invitableRoleIds?: string[];
  isLoading: boolean;
  /** True once there is an answer (server or backup). Redirect-on-denied logic must wait for it. */
  isReady: boolean;
  /** "server" = me/permissions answered; "fallback" = the endpoint failed and the legacy role is used (never wider). */
  source: "server" | "fallback" | "none";
}

const TTL_MS = 30_000;
const FAIL_RETRY_MS = 15_000;

interface Entry {
  /** teamId:userId this answer belongs to (so a team switch never shows the previous team's permissions). */
  k: string;
  data: MyTeamPermissions | null;
  source: "server" | "fallback";
  all?: boolean;
  at: number;
}
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
const listeners = new Set<(teamId: string) => void>();

const keyOf = (teamId: string, userId: string) => `${teamId}:${userId}`;

async function load(teamId: string, userId: string, accessToken: string): Promise<Entry> {
  const key = keyOf(teamId, userId);
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = (async (): Promise<Entry> => {
    try {
      const data = await getMyTeamPermissions(teamId, accessToken);
      return { k: key, data, source: "server", at: Date.now() };
    } catch {
      // Backup: what the legacy role allowed before. It can only be as wide as the old behaviour.
      try {
        const members = await listTeamMembers(teamId, accessToken);
        const role = members.find((m) => m.id === userId)?.role ?? null;
        const fb = fallbackPermissions(role);
        return { k: key, data: { isOwner: fb.isOwner, roles: [], permissions: fb.permissions }, all: fb.all, source: "fallback", at: Date.now() - (TTL_MS - FAIL_RETRY_MS) };
      } catch {
        return { k: key, data: null, source: "fallback", at: Date.now() - (TTL_MS - FAIL_RETRY_MS) };
      }
    }
  })()
    .then((entry) => {
      cache.set(key, entry);
      return entry;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

/** Forces a reload for every mounted consumer (after changing roles, on realtime events, on team switch). */
export function invalidateTeamPermissions(teamId?: string): void {
  for (const k of [...cache.keys()]) if (!teamId || k.startsWith(`${teamId}:`)) cache.delete(k);
  listeners.forEach((l) => l(teamId ?? "*"));
}

const NONE: TeamPermissionsState = {
  can: () => false,
  isOwner: false,
  roles: [],
  permissions: [],
  highestPosition: 0,
  isLoading: false,
  isReady: false,
  source: "none",
};

/**
 * The current user's permissions in a workspace, from `GET /teams/:teamId/me/permissions`.
 * Short cache (30s), refreshed on team switch and when the realtime channel reports
 * `member.role_changed` / `member.added` (also `role.*` events: a role edit changes everyone's permissions).
 */
export function useTeamPermissions(teamId: string | null | undefined, accessToken: string | null | undefined, userId: string | null | undefined): TeamPermissionsState {
  const [rawEntry, setEntry] = useState<Entry | null>(() => (teamId && userId ? cache.get(keyOf(teamId, userId)) ?? null : null));
  const [loading, setLoading] = useState(() => !!(teamId && accessToken && userId && !cache.get(keyOf(teamId, userId))));
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const onInvalidate = (id: string) => {
      if (id === "*" || id === teamId) setTick((n) => n + 1);
    };
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, [teamId]);

  useTeamRealtime(teamId, (event) => {
    const name = String(event.type ?? "");
    if (name === "member.role_changed" || name === "member.added" || name.startsWith("role.") || name === "member.removed") {
      const target = event.payload?.userId ?? event.payload?.memberUserId;
      if (!target || target === userId || name.startsWith("role.")) invalidateTeamPermissions(teamId ?? undefined);
    }
  });

  useEffect(() => {
    if (!teamId || !accessToken || !userId) {
      setEntry(null);
      setLoading(false);
      return;
    }
    const cached = cache.get(keyOf(teamId, userId));
    if (cached) setEntry(cached);
    else setEntry(null);
    if (cached && Date.now() - cached.at < TTL_MS) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(!cached);
    load(teamId, userId, accessToken).then((fresh) => {
      if (cancelled || !mounted.current) return;
      setEntry(fresh);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, accessToken, userId, tick]);

  return useMemo<TeamPermissionsState>(() => {
    if (!teamId || !userId) return NONE;
    const entry = rawEntry && rawEntry.k === keyOf(teamId, userId) ? rawEntry : null;
    if (!entry?.data) return { ...NONE, isLoading: loading || (!entry && !!accessToken), source: entry ? "fallback" : "none" };
    const roles = entry.data.roles;
    return {
      can: makeCan({ isOwner: entry.data.isOwner, permissions: entry.data.permissions, all: entry.all }),
      isOwner: entry.data.isOwner,
      roles,
      permissions: entry.data.permissions,
      highestPosition: roles.reduce((m, r) => Math.max(m, r.position), 0),
      manageableRoleIds: entry.data.manageableRoleIds,
      invitableRoleIds: entry.data.invitableRoleIds,
      isLoading: loading,
      isReady: true,
      source: entry.source,
    };
  }, [rawEntry, loading, teamId, userId, accessToken]);
}

/** Same, for the active workspace of the session. */
export function useActiveTeamPermissions(): TeamPermissionsState {
  const { activeTeamId, accessToken, user } = useSession();
  return useTeamPermissions(activeTeamId, accessToken, user?.id);
}

/** For callbacks that must not re-render: stable reference to the latest `can`. */
export function useCanRef(state: TeamPermissionsState) {
  const ref = useRef(state.can);
  ref.current = state.can;
  return useCallback((p: string) => ref.current(p), []);
}
