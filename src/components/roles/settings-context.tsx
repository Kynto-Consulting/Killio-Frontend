"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { TeamGroup } from "@/lib/api/groups";
import type { TeamMemberSummary, TeamView } from "@/lib/api/contracts";
import type { TeamPermissionsState } from "@/hooks/use-team-permissions";
import { groupRoleIds, highestPositionOf, memberRoleIds, type Actor, type TeamRole } from "@/lib/roles/model";

/** Member row as the roles-aware API returns it: legacy `role` plus (optionally) the roles array. */
export type SettingsMember = TeamMemberSummary & { roleIds?: string[]; mutedUntil?: string | null; isMuted?: boolean };

export interface SettingsCtx {
  teamId: string;
  accessToken: string;
  userId: string | null;
  team: TeamView | null;
  perms: TeamPermissionsState;
  /** Hierarchy + permissions of the person using the screen (only to disable controls; the server decides). */
  actor: Actor;
  roles: TeamRole[];
  rolesError: string | null;
  rolesLoading: boolean;
  groups: TeamGroup[];
  members: SettingsMember[];
  membersLoading: boolean;
  reloadMembers: () => void | Promise<void>;
  reloadRoles: () => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ value, children }: { value: SettingsCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings must be used inside <SettingsProvider>");
  return v;
}

export function buildActor(perms: TeamPermissionsState, roles: TeamRole[]): Actor {
  // me/permissions already carries positions; the roles list is only a second source (e.g. when the roles API answers first).
  const mine = new Set(perms.roles.map((r) => r.id));
  const fromRoles = highestPositionOf([...mine], roles);
  return {
    isOwner: perms.isOwner,
    permissions: new Set(perms.permissions),
    highestPosition: Math.max(perms.highestPosition, fromRoles),
  };
}

export function useMemberTarget(member: SettingsMember) {
  const { roles, groups } = useSettings();
  return useMemo(() => {
    const ids = [...memberRoleIds(member, roles), ...groupRoleIds(member.id, groups)];
    const isOwner = member.role === "owner" || roles.some((r) => r.systemKey === "owner" && ids.includes(r.id));
    return { userId: member.id, isOwner, highestPosition: highestPositionOf(ids, roles) };
  }, [member, roles, groups]);
}
