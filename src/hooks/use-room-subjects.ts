"use client";

import { useEffect, useState } from "react";
import { listTeamMembers } from "@/lib/api/contracts";
import { listTeamRolesLite, type TeamRoleLite } from "@/lib/api/rooms";
import { listTeamGroups } from "@/lib/api/groups";
import { normalizeWorkspaceMembers } from "@/lib/workspace-members";

export interface SubjectMember {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface SubjectGroup {
  id: string;
  name: string;
  color?: string | null;
  memberCount?: number;
}

export interface RoomSubjects {
  roles: TeamRoleLite[];
  groups: SubjectGroup[];
  members: SubjectMember[];
}

const EMPTY: RoomSubjects = { roles: [], groups: [], members: [] };
const cache = new Map<string, { at: number; value: RoomSubjects }>();
const TTL_MS = 60_000;

/**
 * Who a permission or a mention can point at: the team's roles, groups and members. Loaded once per team (cached for a
 * minute) and only while `enabled`, so closed dialogs cost nothing. Each list that fails stays empty on its own.
 */
export function useRoomSubjects(teamId: string | null | undefined, accessToken: string | null | undefined, enabled = true) {
  const [subjects, setSubjects] = useState<RoomSubjects>(EMPTY);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !teamId || !accessToken) return;
    const hit = cache.get(teamId);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setSubjects(hit.value);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      listTeamRolesLite(teamId, accessToken).catch(() => [] as TeamRoleLite[]),
      listTeamGroups(teamId, accessToken).catch(() => []),
      listTeamMembers(teamId, accessToken).catch(() => []),
    ])
      .then(([roles, groups, members]) => {
        if (cancelled) return;
        const value: RoomSubjects = {
          roles,
          groups: (groups as any[]).map((g) => ({ id: g.id, name: g.name, color: g.color ?? null, memberCount: g.memberCount })),
          members: normalizeWorkspaceMembers(members as any[]).map((m) => ({ id: m.id, name: m.name || m.primaryEmail || m.id, email: m.primaryEmail ?? undefined, avatarUrl: m.avatarUrl })),
        };
        cache.set(teamId, { at: Date.now(), value });
        setSubjects(value);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [teamId, accessToken, enabled]);

  return { subjects, isLoading };
}
