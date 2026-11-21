/** Pure helpers for sharing boards / documents with groups. Mirrors the backend rule "never grant above your own role". */

export type GroupAccessRole = "owner" | "admin" | "member" | "viewer" | "guest";

export const GROUP_ACCESS_ROLES: GroupAccessRole[] = ["owner", "admin", "member", "viewer", "guest"];

const RANK: Record<GroupAccessRole, number> = { owner: 5, admin: 4, member: 3, viewer: 2, guest: 1 };

export function roleRank(role: string | null | undefined): number {
  return role && role in RANK ? RANK[role as GroupAccessRole] : 0;
}

/** Roles the caller may grant: every role up to (and including) their own. Unknown role = none. */
export function grantableRoles(callerRole: string | null | undefined): GroupAccessRole[] {
  const max = roleRank(callerRole);
  return GROUP_ACCESS_ROLES.filter((r) => RANK[r] <= max);
}

export function canGrantRole(callerRole: string | null | undefined, target: string): boolean {
  const rank = roleRank(target);
  return rank > 0 && rank <= roleRank(callerRole);
}

/** Whether the caller may change or remove a group whose current role is `groupRole` (not above their own). */
export function canModifyGroupRole(callerRole: string | null | undefined, groupRole: string): boolean {
  return canGrantRole(callerRole, groupRole);
}

/** Team groups that have no access yet. */
export function addableGroups<G extends { id: string }>(teamGroups: G[], withAccess: Array<{ groupId: string }>): G[] {
  const taken = new Set(withAccess.map((a) => a.groupId));
  return teamGroups.filter((g) => !taken.has(g.id));
}
