/**
 * Typed API for roles, moderation, audit and resource permissions.
 *
 * Contract: design doc section 6 + addendum v2. Routes marked ASSUMED are not in the doc (the backend
 * branch had not published them when this was written): see the report for the list.
 */

import { fetchApi } from "@/lib/api/client";
import { normalizeCatalog, type PermissionCatalog } from "@/lib/roles/catalog";
import {
  normalizeOverride,
  normalizeRole,
  type MyTeamPermissions,
  type PermissionMap,
  type ResourceOverride,
  type TeamRole,
} from "@/lib/roles/model";

const json = (body: unknown) => JSON.stringify(body);
const q = encodeURIComponent;

/* ── me/permissions ── */
export async function getMyTeamPermissions(teamId: string, accessToken: string): Promise<MyTeamPermissions> {
  const raw = await fetchApi<any>(`/teams/${q(teamId)}/me/permissions`, { accessToken });
  return {
    isOwner: !!raw?.isOwner,
    roles: Array.isArray(raw?.roles) ? raw.roles.map((r: any) => ({ id: String(r.id), name: String(r.name), color: r.color ?? null, position: Number(r.position) || 0 })) : [],
    permissions: Array.isArray(raw?.permissions) ? raw.permissions.filter((p: unknown) => typeof p === "string") : [],
    manageableRoleIds: Array.isArray(raw?.manageableRoleIds) ? raw.manageableRoleIds.map(String) : undefined,
    invitableRoleIds: Array.isArray(raw?.invitableRoleIds) ? raw.invitableRoleIds.map(String) : undefined,
  };
}

/* ── permission catalogue (addendum A7): the editors are built only from this ── */
/** Throws when the endpoint is missing or answers something that is not a catalogue (callers fall back to the approximate one). */
export async function getPermissionCatalog(teamId: string, accessToken: string, locale = "en"): Promise<PermissionCatalog> {
  // `?lang=`: the app's language decides the texts (without it the server uses the account's locale, which may differ).
  const raw = await fetchApi<unknown>(`/teams/${q(teamId)}/permissions/catalog?lang=${encodeURIComponent(locale)}`, { accessToken });
  const catalog = normalizeCatalog(raw, locale);
  if (!catalog || catalog.providers.length === 0) throw new Error("Empty permission catalog");
  return catalog;
}

/* ── roles ── */
export interface RoleInput {
  name: string;
  color?: string | null;
  mentionable?: boolean;
  /** Needs roles.manage; the server refuses system / default roles and roles with dangerous permissions (400 with the reason). */
  selfAssignable?: boolean;
  permissions?: PermissionMap;
}

export async function listRoles(teamId: string, accessToken: string): Promise<TeamRole[]> {
  const raw = await fetchApi<any>(`/teams/${q(teamId)}/roles`, { accessToken });
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.roles) ? raw.roles : [];
  return list.map(normalizeRole);
}
export const createRole = async (teamId: string, input: RoleInput, accessToken: string) =>
  normalizeRole(await fetchApi<any>(`/teams/${q(teamId)}/roles`, { method: "POST", accessToken, body: json(input) }));
export const updateRole = async (teamId: string, roleId: string, patch: Partial<RoleInput>, accessToken: string) =>
  normalizeRole(await fetchApi<any>(`/teams/${q(teamId)}/roles/${q(roleId)}`, { method: "PATCH", accessToken, body: json(patch) }));
export const deleteRole = (teamId: string, roleId: string, accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/roles/${q(roleId)}`, { method: "DELETE", accessToken });
/** ids ordered from the highest role to the lowest. */
export const reorderRoles = (teamId: string, roleIds: string[], accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/roles/order`, { method: "PUT", accessToken, body: json({ roleIds }) });

/* ── assignment ── */
export const setMemberRoles = (teamId: string, userId: string, roleIds: string[], accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/members/${q(userId)}/roles`, { method: "PUT", accessToken, body: json({ roleIds }) });
export const setGroupRoles = (teamId: string, groupId: string, roleIds: string[], accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/groups/${q(groupId)}/roles`, { method: "PUT", accessToken, body: json({ roleIds }) });

/* ── ownership (addendum A3) ── */
export const transferOwnership = (teamId: string, toUserId: string, accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/transfer-ownership`, { method: "POST", accessToken, body: json({ toUserId }) });

/* ── moderation (ASSUMED routes: addendum A4 names the permissions, not the paths) ── */
export const kickMember = (teamId: string, userId: string, reason: string | null, accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/members/${q(userId)}/kick`, { method: "POST", accessToken, body: json({ reason }) });
export const banMember = (teamId: string, userId: string, reason: string | null, accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/members/${q(userId)}/ban`, { method: "POST", accessToken, body: json({ reason }) });
/** durationMinutes null = until someone lifts it. */
export const muteMember = (teamId: string, userId: string, reason: string | null, durationMinutes: number | null, accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/members/${q(userId)}/mute`, { method: "POST", accessToken, body: json({ reason, durationMinutes }) });
export const unmuteMember = (teamId: string, userId: string, accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/members/${q(userId)}/mute`, { method: "DELETE", accessToken });

export interface BanEntry {
  userId: string;
  name: string;
  email: string | null;
  reason: string | null;
  bannedAt: string;
  bannedByName: string | null;
}
export async function listBans(teamId: string, accessToken: string): Promise<BanEntry[]> {
  const raw = await fetchApi<any>(`/teams/${q(teamId)}/bans`, { accessToken });
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.bans) ? raw.bans : [];
  return list.map((b: any) => ({
    userId: String(b.userId ?? b.user_id ?? ""),
    name: String(b.name ?? b.userName ?? b.email ?? ""),
    email: b.email ?? null,
    reason: b.reason ?? null,
    bannedAt: String(b.bannedAt ?? b.createdAt ?? ""),
    bannedByName: b.bannedByName ?? b.actorName ?? null,
  }));
}
export const unbanMember = (teamId: string, userId: string, accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/bans/${q(userId)}`, { method: "DELETE", accessToken });

export type AuditAction = string;
export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  targetName: string | null;
  /** What else the action touched (role, group, resource...). */
  targetType: string | null;
  objectId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface AuditPage {
  entries: AuditEntry[];
  /** Pass as `before` to load older entries; null on the last page. */
  nextBefore: string | null;
}
export async function listAuditLog(teamId: string, accessToken: string, opts: { action?: string; limit?: number; before?: string | null } = {}): Promise<AuditPage> {
  const qs = new URLSearchParams();
  if (opts.action) qs.set("action", opts.action);
  if (opts.before) qs.set("before", opts.before);
  qs.set("limit", String(opts.limit ?? 50));
  const raw = await fetchApi<any>(`/teams/${q(teamId)}/audit?${qs.toString()}`, { accessToken });
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
  const entries: AuditEntry[] = list.map((e: any) => ({
    id: String(e.id),
    action: String(e.action ?? ""),
    actorId: e.actor?.id ?? e.actorId ?? e.actor_user_id ?? null,
    actorName: e.actor?.name ?? e.actorName ?? e.actor_name ?? null,
    targetId: e.target?.id ?? e.targetUserId ?? e.target_user_id ?? null,
    targetName: e.target?.name ?? e.targetName ?? e.target_name ?? null,
    targetType: e.targetType ?? e.target_type ?? null,
    objectId: e.targetId ?? e.target_id ?? null,
    reason: e.reason ?? null,
    metadata: e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata) ? e.metadata : {},
    createdAt: String(e.createdAt ?? e.created_at ?? ""),
  }));
  const nextBefore = Array.isArray(raw) ? null : typeof raw?.nextBefore === "string" ? raw.nextBefore : null;
  return { entries, nextBefore };
}

/* ── resource overrides (documents, boards, meshes) ── */
export type ResourceKind = "board" | "document" | "mesh";

export async function getResourceOverrides(kind: ResourceKind, id: string, accessToken: string): Promise<ResourceOverride[]> {
  const raw = await fetchApi<any>(`/resources/${kind}/${q(id)}/permissions`, { accessToken });
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.overrides) ? raw.overrides : [];
  return list.map(normalizeOverride);
}
export const putResourceOverrides = (kind: ResourceKind, id: string, overrides: ResourceOverride[], accessToken: string) =>
  fetchApi<unknown>(`/resources/${kind}/${q(id)}/permissions`, { method: "PUT", accessToken, body: json({ overrides }) });
export async function getMyResourcePermissions(kind: ResourceKind, id: string, accessToken: string): Promise<string[]> {
  const raw = await fetchApi<any>(`/resources/${kind}/${q(id)}/my-permissions`, { accessToken });
  const list = Array.isArray(raw) ? raw : raw?.permissions;
  return Array.isArray(list) ? list.filter((p: unknown): p is string => typeof p === "string") : [];
}
