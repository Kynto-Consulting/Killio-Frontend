/**
 * Roles and permissions: pure helpers (no I/O, no React).
 *
 * The SERVER always decides. Everything here only drives the UI: ordering, which controls are
 * disabled (and why), how a tri-state looks, and plain-language summaries.
 */

export type TriState = "allow" | "deny" | "inherit";
/** What a role stores: absent key = inherit. */
export type PermissionMap = Record<string, "allow" | "deny">;

export interface TeamRole {
  id: string;
  name: string;
  color: string | null;
  /** Higher = above. */
  position: number;
  permissions: PermissionMap;
  isSystem: boolean;
  /** owner | admin | member | viewer | guest for the five system roles. */
  systemKey: string | null;
  isDefault: boolean;
  mentionable: boolean;
  /** Members may take it themselves through a bot (reaction / button). Never on system or default roles. */
  selfAssignable: boolean;
  memberCount?: number;
}

export interface Actor {
  isOwner: boolean;
  /** Permissions the actor holds in state allow (from me/permissions). */
  permissions: ReadonlySet<string>;
  /** Highest position among the actor's effective roles (owner is exempt anyway). */
  highestPosition: number;
  /** Server-resolved role ids the actor may assign; when present it replaces the position heuristic. */
  manageableRoleIds?: ReadonlySet<string>;
  /** Server-resolved role ids the actor may hand out when INVITING (authority for the invite picker only). */
  invitableRoleIds?: ReadonlySet<string>;
}

/** The actor as the invite pickers see it: invitableRoleIds replaces manageableRoleIds when the server sent it. */
export const inviteActor = (actor: Actor): Actor => (actor.invitableRoleIds ? { ...actor, manageableRoleIds: actor.invitableRoleIds } : actor);

/* ───────────────────────── Permission catalogue ───────────────────────── */

export const PERMISSION_GROUPS = [
  { id: "general", keys: ["administrator", "team.manage", "roles.manage", "groups.manage", "metrics.view", "audit.view"] },
  { id: "members", keys: ["members.invite", "invites.manage", "members.manage", "members.manage_roles", "members.kick", "members.ban", "members.mute"] },
  { id: "content", keys: ["boards.create", "documents.create", "meshes.create", "folders.manage", "content.manage_all", "marketplace.import"] },
  {
    id: "rooms",
    keys: ["rooms.create", "rooms.manage", "room.view", "room.post", "room.react", "room.call", "room.record", "room.invite", "room.pin", "room.manage_messages", "room.mention_everyone", "room.manage"],
  },
  { id: "integrations", keys: ["integrations.manage", "scripts.manage", "scripts.run", "env.manage", "sql.manage", "sql.query"] },
  { id: "bots", keys: ["bots.manage"] },
  { id: "billing", keys: ["billing.manage"] },
] as const;

export type PermissionGroupId = (typeof PERMISSION_GROUPS)[number]["id"];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) => [...g.keys]);

/** Permissions that need the owner to be touched (see addendum A1). */
export const OWNER_ONLY_PERMISSIONS: ReadonlySet<string> = new Set(["administrator"]);

export const RESOURCE_PERMISSION_KEYS = ["resource.view", "resource.comment", "resource.edit", "resource.manage"] as const;

export const ROLE_COLOR_PRESETS = ["#B7791F", "#C0392B", "#E67E22", "#D4A017", "#2F9E6B", "#1ABC9C", "#2F6FED", "#6C5CE7", "#C2559A", "#718096"];
const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
export const ROLE_NAME_RE = /^[^<>\[\]]{1,40}$/;

/* ───────────────────────── Normalising server data ───────────────────────── */

/** Accepts the new jsonb map or the legacy text[] (every key = allow). */
export function normalizePermissions(raw: unknown): PermissionMap {
  const out: PermissionMap = {};
  if (Array.isArray(raw)) {
    for (const k of raw) if (typeof k === "string" && k) out[k] = "allow";
    return out;
  }
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v === "allow" || v === "deny") out[k] = v;
    }
  }
  return out;
}

export function normalizeRole(raw: any): TeamRole {
  return {
    id: String(raw?.id ?? ""),
    name: String(raw?.name ?? ""),
    color: isHexColor(raw?.color) ? raw.color : null,
    position: Number.isFinite(Number(raw?.position)) ? Number(raw.position) : 0,
    permissions: normalizePermissions(raw?.permissions),
    isSystem: !!(raw?.isSystem ?? raw?.is_system),
    systemKey: (raw?.systemKey ?? raw?.system_key ?? null) || null,
    isDefault: !!(raw?.isDefault ?? raw?.is_default),
    mentionable: !!raw?.mentionable,
    selfAssignable: raw?.selfAssignable === true,
    memberCount: typeof raw?.memberCount === "number" ? raw.memberCount : undefined,
  };
}

/* ───────────────────────── Ordering (hierarchy) ───────────────────────── */

/** Top of the list = highest. Ties break by name so the order is stable. */
export function sortRoles<T extends Pick<TeamRole, "position" | "name">>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
}

export const isOwnerRole = (r: Pick<TeamRole, "systemKey">) => r.systemKey === "owner";

/** Roles whose place in the list cannot be changed: owner (top) and the default one (bottom). */
export const isPinnedRole = (r: Pick<TeamRole, "systemKey" | "isDefault">) => r.systemKey === "owner" || r.isDefault;

/** Moves one id up (-1) or down (+1) inside an ordered id list; returns a new list (same list when blocked). */
export function moveId(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Drag and drop: puts `id` where `overId` is. */
export function dropId(ids: readonly string[], id: string, overId: string): string[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/**
 * Keeps pinned roles where they must be (owner first, default last) whatever the user did,
 * so the payload sent to PUT /roles/order is always valid.
 */
export function enforcePinned(ids: readonly string[], roles: readonly TeamRole[]): string[] {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const top = ids.filter((id) => byId.get(id) && isOwnerRole(byId.get(id)!));
  const bottom = ids.filter((id) => byId.get(id) && !isOwnerRole(byId.get(id)!) && byId.get(id)!.isDefault);
  const middle = ids.filter((id) => !top.includes(id) && !bottom.includes(id));
  return [...top, ...middle, ...bottom];
}

/** Whether `delta` is possible for this role given the actor and the pinned roles (disables the arrows). */
export function canMoveRole(actor: Actor, ordered: readonly TeamRole[], roleId: string, delta: -1 | 1): boolean {
  const i = ordered.findIndex((r) => r.id === roleId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ordered.length) return false;
  const role = ordered[i];
  const other = ordered[j];
  if (isPinnedRole(role) || isPinnedRole(other)) return false;
  return canManageRole(actor, role) && canManageRole(actor, other);
}

/** Position values to show/send: highest first, spaced so custom roles fit between. */
export function positionsFromOrder(ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  ids.forEach((id, i) => {
    out[id] = (ids.length - i) * 10;
  });
  return out;
}

/* ───────────────────────── Manageability (UI only) ───────────────────────── */

/** Can the actor edit / assign this role? Needs roles.manage elsewhere; here only the hierarchy rule. */
export function canManageRole(actor: Actor, role: Pick<TeamRole, "position" | "systemKey">): boolean {
  if (role.systemKey === "owner") return false; // nobody edits or assigns the owner role
  if (actor.isOwner) return true;
  return role.position < actor.highestPosition;
}

export type PermissionBlock = "owner_role" | "position" | "not_owned" | "owner_only" | null;

/** Why a permission toggle of a role is disabled for this actor (null = enabled). */
export function permissionBlockReason(actor: Actor, role: Pick<TeamRole, "position" | "systemKey">, key: string): PermissionBlock {
  if (role.systemKey === "owner") return "owner_role";
  if (!actor.isOwner && !(role.position < actor.highestPosition)) return "position";
  if (actor.isOwner) return null;
  if (OWNER_ONLY_PERMISSIONS.has(key)) return "owner_only";
  if (!actor.permissions.has(key) && !actor.permissions.has("administrator")) return "not_owned";
  return null;
}

/** A member the actor wants to act on (kick/ban/mute/change roles). */
export interface MemberTarget {
  userId: string;
  isOwner: boolean;
  highestPosition: number;
}

export type MemberActionBlock = "self" | "target_owner" | "position" | "no_permission" | null;

export function memberActionBlockReason(
  actor: Actor,
  actorUserId: string | null | undefined,
  target: MemberTarget,
  permission: string,
): MemberActionBlock {
  if (actorUserId && target.userId === actorUserId) return "self";
  if (target.isOwner) return "target_owner";
  if (!actor.isOwner && !actor.permissions.has(permission) && !actor.permissions.has("administrator")) return "no_permission";
  if (!actor.isOwner && !(target.highestPosition < actor.highestPosition)) return "position";
  return null;
}

/** Highest position of a set of role ids (0 when none). */
export function highestPositionOf(roleIds: readonly string[], roles: readonly TeamRole[]): number {
  const set = new Set(roleIds);
  return roles.reduce((m, r) => (set.has(r.id) ? Math.max(m, r.position) : m), 0);
}

/** Roles a member holds personally: explicit ids, else the legacy single role mapped to its system role. */
export function memberRoleIds(member: { roleIds?: string[] | null; role?: string | null }, roles: readonly TeamRole[]): string[] {
  if (Array.isArray(member.roleIds)) return member.roleIds;
  const legacy = roles.find((r) => r.systemKey && r.systemKey === member.role);
  return legacy ? [legacy.id] : [];
}

/** Roles a member gets through their groups. */
export function groupRoleIds(memberUserId: string, groups: readonly { memberUserIds: string[]; roleIds?: string[] }[]): string[] {
  const out = new Set<string>();
  for (const g of groups) if (g.memberUserIds.includes(memberUserId)) (g.roleIds ?? []).forEach((id) => out.add(id));
  return [...out];
}

export type RoleSource = { kind: "personal" } | { kind: "group"; groupId: string; groupName: string };

/** The roles of a member with where each one comes from. */
export function effectiveRoles(
  member: { userId: string; roleIds?: string[] | null; role?: string | null },
  roles: readonly TeamRole[],
  groups: readonly { id: string; name: string; memberUserIds: string[]; roleIds?: string[] }[],
): Array<{ role: TeamRole; source: RoleSource }> {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const out: Array<{ role: TeamRole; source: RoleSource }> = [];
  for (const id of memberRoleIds(member, roles)) {
    const role = byId.get(id);
    if (role) out.push({ role, source: { kind: "personal" } });
  }
  for (const g of groups) {
    if (!g.memberUserIds.includes(member.userId)) continue;
    for (const id of g.roleIds ?? []) {
      const role = byId.get(id);
      if (role) out.push({ role, source: { kind: "group", groupId: g.id, groupName: g.name } });
    }
  }
  return out.sort((a, b) => b.role.position - a.role.position);
}

/* ───────────────────────── Tri-state ───────────────────────── */

export const TRI_STATES: TriState[] = ["allow", "inherit", "deny"];

export const triStateOf = (map: PermissionMap | undefined, key: string): TriState => map?.[key] ?? "inherit";

/** Sets one key; "inherit" removes it. Returns a new map. */
export function setTriState(map: PermissionMap, key: string, state: TriState): PermissionMap {
  const next = { ...map };
  if (state === "inherit") delete next[key];
  else next[key] = state;
  return next;
}

/** Visual descriptor of a state: glyph, i18n key suffix and a tone the components map to colours. */
export function triStateVisual(state: TriState): { glyph: string; labelKey: "allow" | "deny" | "inherit"; tone: "good" | "bad" | "neutral" } {
  if (state === "allow") return { glyph: "✓", labelKey: "allow", tone: "good" };
  if (state === "deny") return { glyph: "✗", labelKey: "deny", tone: "bad" };
  return { glyph: "–", labelKey: "inherit", tone: "neutral" };
}

export function countStates(map: PermissionMap): { allow: number; deny: number } {
  let allow = 0;
  let deny = 0;
  for (const v of Object.values(map)) {
    if (v === "allow") allow++;
    else if (v === "deny") deny++;
  }
  return { allow, deny };
}

/** Diff between two maps, to enable the Save / Reset buttons. */
export function permissionsChanged(a: PermissionMap, b: PermissionMap): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return true;
  return ka.some((k) => a[k] !== b[k]);
}

/* ───────────────────────── Cascade simulator (approximation) ───────────────────────── */

export interface CascadeInput {
  isOwner: boolean;
  groupRoles: TeamRole[];
  personalRoles: TeamRole[];
  defaultRole: TeamRole | null;
}
export type CascadeSource = { layer: "owner" } | { layer: "group" | "personal" | "default"; role: TeamRole } | { layer: "none" };

/** Addendum A1 cascade: groups, then personal roles, then the default role; the first non-inherit wins. */
export function simulateTeamPermission(key: string, input: CascadeInput): { state: "allow" | "deny"; source: CascadeSource } {
  if (input.isOwner) return { state: "allow", source: { layer: "owner" } };
  const layers: Array<["group" | "personal" | "default", TeamRole[]]> = [
    ["group", sortRoles(input.groupRoles)],
    ["personal", sortRoles(input.personalRoles)],
    ["default", input.defaultRole ? [input.defaultRole] : []],
  ];
  for (const [layer, rs] of layers) {
    for (const r of rs) {
      const s = r.permissions[key];
      if (s) return { state: s, source: { layer, role: r } };
    }
  }
  if (key !== "administrator") {
    // administrator=allow in any layer opens everything, unless an earlier layer denies administrator.
    for (const [layer, rs] of layers) {
      for (const r of rs) {
        const s = r.permissions.administrator;
        if (s === "deny") return { state: "deny", source: { layer: "none" } };
        if (s === "allow") return { state: "allow", source: { layer, role: r } };
      }
    }
  }
  return { state: "deny", source: { layer: "none" } };
}

/* ───────────────────────── Summaries ───────────────────────── */

/** Groups the permissions a person holds so Summary can say it in plain words. */
export function groupHeldPermissions(held: readonly string[]): Array<{ group: PermissionGroupId; keys: string[] }> {
  if (held.includes("administrator")) return [{ group: "general", keys: ["administrator"] }];
  const set = new Set(held);
  return PERMISSION_GROUPS.map((g) => ({ group: g.id, keys: g.keys.filter((k) => set.has(k)) })).filter((g) => g.keys.length > 0);
}

/** What an invitation hands out: roles and groups, flagged when it is just the default role. */
export function summarizeInvite(args: {
  roleIds: readonly string[];
  groupIds: readonly string[];
  roles: readonly TeamRole[];
  groups: readonly { id: string; name: string; roleIds?: string[] }[];
}): { roles: TeamRole[]; groups: Array<{ id: string; name: string }>; viaGroupRoles: TeamRole[]; usesDefault: boolean } {
  const rolesById = new Map(args.roles.map((r) => [r.id, r]));
  const chosen = args.roleIds.map((id) => rolesById.get(id)).filter((r): r is TeamRole => !!r);
  const groups = args.groups.filter((g) => args.groupIds.includes(g.id)).map((g) => ({ id: g.id, name: g.name }));
  const via = new Map<string, TeamRole>();
  for (const g of args.groups) {
    if (!args.groupIds.includes(g.id)) continue;
    for (const id of g.roleIds ?? []) {
      const r = rolesById.get(id);
      if (r && !chosen.some((c) => c.id === r.id)) via.set(r.id, r);
    }
  }
  return { roles: sortRoles(chosen), groups, viaGroupRoles: sortRoles([...via.values()]), usesDefault: chosen.length === 0 };
}

/** Why a role cannot be handed out by the actor (null = can). Used for tooltips on disabled options. */
export function assignBlockReason(actor: Actor, role: TeamRole): "owner_role" | "position" | "not_owned" | null {
  if (role.systemKey === "owner") return "owner_role";
  if (actor.isOwner) return null;
  if (actor.manageableRoleIds) return actor.manageableRoleIds.has((role as TeamRole).id) ? null : "position";
  if (!canManageRole(actor, role)) return "position";
  const blocked = Object.entries(role.permissions).some(([k, v]) => v === "allow" && permissionBlockReason(actor, role, k) !== null);
  return blocked ? "not_owned" : null;
}

/** Roles of a list the actor may hand out (never owner; below the actor; permissions the actor holds). */
export function assignableRoles(actor: Actor, roles: readonly TeamRole[]): TeamRole[] {
  return sortRoles(roles).filter((r) => assignBlockReason(actor, r) === null);
}

/* ───────────────────────── Members list helpers ───────────────────────── */

export function filterMembers<T extends { name: string; alias?: string | null; primaryEmail: string }>(
  members: readonly T[],
  opts: { query?: string; roleId?: string | null; groupId?: string | null; roleIdsOf: (m: T) => string[]; groupIdsOf: (m: T) => string[] },
): T[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  return members.filter((m) => {
    if (q && !`${m.alias ?? ""} ${m.name} ${m.primaryEmail}`.toLowerCase().includes(q)) return false;
    if (opts.roleId && !opts.roleIdsOf(m).includes(opts.roleId)) return false;
    if (opts.groupId && !opts.groupIdsOf(m).includes(opts.groupId)) return false;
    return true;
  });
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): { items: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * pageSize, p * pageSize), pages, page: p };
}

/** Typed confirmation: the user must type the workspace name exactly (trimmed). */
export const confirmationMatches = (typed: string, expected: string) => expected.trim().length > 0 && typed.trim() === expected.trim();

/* ───────────────────────── Resource overrides (document / board / mesh) ───────────────────────── */

export type OverrideSubjectType = "everyone" | "role" | "group" | "member";

export interface ResourceOverride {
  subjectType: OverrideSubjectType;
  subjectId: string | null;
  allow: string[];
  deny: string[];
}

export const overrideKey = (o: Pick<ResourceOverride, "subjectType" | "subjectId">) => `${o.subjectType}:${o.subjectId ?? ""}`;

export function overrideState(o: Pick<ResourceOverride, "allow" | "deny">, key: string): TriState {
  if (o.deny.includes(key)) return "deny";
  if (o.allow.includes(key)) return "allow";
  return "inherit";
}

export function setOverrideState(o: ResourceOverride, key: string, state: TriState): ResourceOverride {
  const allow = o.allow.filter((k) => k !== key);
  const deny = o.deny.filter((k) => k !== key);
  if (state === "allow") allow.push(key);
  if (state === "deny") deny.push(key);
  return { ...o, allow, deny };
}

/** An override with every key on inherit does nothing: it is dropped before saving. */
export const isEmptyOverride = (o: Pick<ResourceOverride, "allow" | "deny">) => o.allow.length === 0 && o.deny.length === 0;

export function normalizeOverride(raw: any): ResourceOverride {
  const type = raw?.subjectType;
  return {
    subjectType: type === "role" || type === "group" || type === "member" ? type : "everyone",
    subjectId: type === "everyone" || type == null ? null : raw?.subjectId != null ? String(raw.subjectId) : null,
    allow: Array.isArray(raw?.allow) ? raw.allow.filter((k: unknown) => typeof k === "string") : [],
    deny: Array.isArray(raw?.deny) ? raw.deny.filter((k: unknown) => typeof k === "string") : [],
  };
}

/** Plain-language level of the caller on a resource from `my-permissions`. */
export function resourceLevel(perms: readonly string[]): "manage" | "edit" | "comment" | "view" | "none" {
  const s = new Set(perms);
  if (s.has("resource.manage")) return "manage";
  if (s.has("resource.edit")) return "edit";
  if (s.has("resource.comment")) return "comment";
  if (s.has("resource.view")) return "view";
  return "none";
}

/* ───────────────────────── Current user's team permissions (client fallback) ───────────────────────── */

export interface MyTeamPermissions {
  isOwner: boolean;
  roles: Array<{ id: string; name: string; color: string | null; position: number }>;
  permissions: string[];
  /** Role ids the user may hand out (server-resolved). Absent on older backends. */
  manageableRoleIds?: string[];
  /** Role ids the user may hand out when inviting (server-resolved). */
  invitableRoleIds?: string[];
}

/**
 * Backup while me/permissions loads or fails: what a legacy role could do. NEVER opens more than the
 * system roles did before (mirrors the backend seed). Unknown role = nothing.
 */
const LEGACY_FALLBACK: Record<string, string[]> = {
  owner: ["*"],
  admin: ["*"],
  member: ["members.invite", "boards.create", "documents.create", "meshes.create", "folders.manage", "sql.query", "rooms.create"],
  viewer: ["documents.create", "folders.manage", "sql.query", "rooms.create"],
  guest: ["documents.create", "sql.query", "rooms.create"],
};

export function fallbackPermissions(legacyRole: string | null | undefined): { isOwner: boolean; permissions: string[]; all: boolean } {
  const list = (legacyRole && LEGACY_FALLBACK[legacyRole]) || [];
  return { isOwner: legacyRole === "owner", permissions: list.filter((k) => k !== "*"), all: list.includes("*") };
}

/** `can(key)` over a permission snapshot. administrator and owner pass everything. */
export function makeCan(snapshot: { isOwner: boolean; permissions: readonly string[]; all?: boolean } | null): (key: string) => boolean {
  if (!snapshot) return () => false;
  if (snapshot.isOwner || snapshot.all) return () => true;
  const set = new Set(snapshot.permissions);
  const admin = set.has("administrator");
  return (key) => admin || set.has(key);
}

/* ───────────────────────── Invitation status ───────────────────────── */

export type InviteState = "pending" | "active" | "used" | "expired" | "revoked";

/** Status of a reusable link or an email invite for the list on the Invitations tab. */
export function inviteState(i: { status?: string | null; expiresAt?: string | null; maxUses?: number | null; useCount?: number | null }, now: number = Date.now()): InviteState {
  if (i.status === "revoked") return "revoked";
  if (i.status === "accepted" || i.status === "used") return "used";
  if (i.maxUses != null && (i.useCount ?? 0) >= i.maxUses) return "used";
  if (i.expiresAt && new Date(i.expiresAt).getTime() <= now) return "expired";
  if (i.status === "expired") return "expired";
  return i.maxUses !== undefined || i.useCount !== undefined ? "active" : "pending";
}
