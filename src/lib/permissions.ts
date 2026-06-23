/**
 * Killio — Unified Permission Definitions
 *
 * One role set across team + entities (boards, docs, mesh):
 *   owner > admin > member > viewer > guest
 *   - owner   : creator, full control + delete + manage members
 *   - admin   : manage members + everything below
 *   - member  : create / edit content
 *   - viewer  : read-only, part of the team
 *   - guest   : external, only sees what's explicitly shared (read-only)
 *
 * An explicit entity (board/doc) membership wins; otherwise the team role
 * carries over 1:1 (a team member's team role IS their entity role).
 */

export type Role = 'owner' | 'admin' | 'member' | 'viewer' | 'guest';
// Back-compat aliases (same underlying set).
export type BoardRole = Role;
export type TeamRole = Role;

export const ROLE_RANK: Record<Role, number> = {
  owner: 5, admin: 4, member: 3, viewer: 2, guest: 1,
};
const rankOf = (role: string | null | undefined): number => (role ? ROLE_RANK[role as Role] ?? 0 : 0);

/** Display order for role pickers (most → least capable). */
export const ROLE_OPTIONS: Role[] = ['owner', 'admin', 'member', 'viewer', 'guest'];

/**
 * Effective role from an explicit entity membership + the user's team role.
 * Entity membership wins; else the team role carries over; else 'guest'.
 */
export function getEffectiveBoardRole(
  boardRole: string | null | undefined,
  teamRole: string | null | undefined,
): Role {
  if (boardRole && ROLE_RANK[boardRole as Role] !== undefined) return boardRole as Role;
  if (teamRole && ROLE_RANK[teamRole as Role] !== undefined) return teamRole as Role;
  return 'guest';
}

// ─── Capability helpers ────────────────────────────────────────────────────

/** Can create / edit / delete content (cards, bricks, lists, …). member+. */
export function canEditCards(role: Role): boolean {
  return rankOf(role) >= ROLE_RANK.member;
}

/** Can post comments. member+ (viewer/guest are read-only). */
export function canComment(role: Role): boolean {
  return rankOf(role) >= ROLE_RANK.member;
}

/** Can add lists, delete the entity, change settings, manage members. admin+. */
export function canManageBoard(role: Role): boolean {
  return rankOf(role) >= ROLE_RANK.admin;
}
