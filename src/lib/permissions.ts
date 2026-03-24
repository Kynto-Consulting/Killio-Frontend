/**
 * Killio — Unified Permission Definitions
 *
 * Two role systems exist in the DB:
 *   team_memberships.role  : 'owner' | 'admin' | 'member' | 'guest'
 *   board_memberships.role : 'owner' | 'editor' | 'commenter' | 'viewer'
 *
 * Board role is authoritative for board actions. When a user has no explicit
 * board membership, we derive a safe default from their team role.
 */

export type BoardRole = 'owner' | 'editor' | 'commenter' | 'viewer';
export type TeamRole  = 'owner' | 'admin'  | 'member'    | 'guest';

const BOARD_ROLE_RANK: Record<BoardRole, number> = {
  owner: 4, editor: 3, commenter: 2, viewer: 1,
};

/**
 * Derives the user's effective BoardRole from their board + team roles.
 *
 * Priority:
 *   1. Explicit board membership role (always wins).
 *   2. Team role fallback:
 *        owner / admin / member → 'editor' (team members get write access)
 *        guest                  → 'viewer' (read-only)
 *   3. Unknown / no membership  → 'viewer' (safest default)
 */
export function getEffectiveBoardRole(
  boardRole: string | null | undefined,
  teamRole:  string | null | undefined,
): BoardRole {
  const b = boardRole as BoardRole | undefined;
  if (b && BOARD_ROLE_RANK[b] !== undefined) return b;

  if (teamRole === 'owner' || teamRole === 'admin' || teamRole === 'member') {
    return 'editor';
  }
  // guest team role OR no role at all → read-only
  return 'viewer';
}

// ─── Capability helpers ────────────────────────────────────────────────────

/** Can create / edit / delete cards, move cards, manage tags and assignees. */
export function canEditCards(role: BoardRole): boolean {
  return role === 'owner' || role === 'editor';
}

/** Can post comments (commenter, editor, owner — NOT viewer). */
export function canComment(role: BoardRole): boolean {
  return role !== 'viewer';
}

/** Can add lists, delete the board, change board settings. */
export function canManageBoard(role: BoardRole): boolean {
  return role === 'owner';
}
