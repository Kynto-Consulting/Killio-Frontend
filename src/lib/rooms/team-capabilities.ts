/**
 * What the user may do with channels and categories at TEAM level, from the permissions the backend resolved
 * (`GET /teams/:teamId/me/permissions`). Old servers do not have that endpoint: then the legacy "team admin" flag decides.
 */

export interface TeamRoomCapabilities {
  canCreateChannels: boolean;
  /** Rename / reorder / delete categories and edit channel permissions. */
  canManageChannels: boolean;
  canMuteMembers: boolean;
}

export interface TeamPermissionsLike {
  isOwner?: boolean;
  permissions: readonly string[];
}

export function teamRoomCapabilities(mine: TeamPermissionsLike | null, legacyIsAdmin: boolean): TeamRoomCapabilities {
  if (!mine) return { canCreateChannels: legacyIsAdmin, canManageChannels: legacyIsAdmin, canMuteMembers: legacyIsAdmin };
  const all = Boolean(mine.isOwner) || mine.permissions.includes("administrator");
  const has = (key: string) => all || mine.permissions.includes(key);
  return {
    canCreateChannels: has("rooms.create") || has("rooms.manage"),
    canManageChannels: has("rooms.manage"),
    canMuteMembers: has("members.mute") || has("rooms.manage"),
  };
}
