/**
 * The permission keys a channel or category override may mention, read from the server (design: nothing is a fixed list).
 * Pure and tested in permission-catalog.test.ts.
 *
 * Wire shape (`GET /rooms/:id/permissions` and `GET /teams/:teamId/room-groups/:groupId/permissions`):
 *   `universe: string[]`                                   keys an override may mention
 *   `catalog: [{ key, label, description, group, scope, alsoIn, resourceTypes, dangerous, requires, impliedBy, providerId }]`
 * Both are optional: an older server sends neither and the editor falls back to the fixed list (ROOM_PERMISSION_KEYS).
 *
 * Three things the server does NOT give today, so the client fills them in (each is a fallback, never an override of the server):
 *  - texts: the room endpoints always answer in English and take no `?lang=`. `texts` (the team catalogue, which does honour
 *    the language) wins when it knows the key.
 *  - groups: every core room key arrives under one generic group ("Access to a room"), so the client sorts the known keys into
 *    Messages / Threads / Pinned / Calls / ...; keys it does not know (modules, extensions) keep the server's group.
 *  - impliedBy: `impliedBy` is team-scope only on the server, but room keys cascade too (rooms/room-permissions.ts
 *    ROOM_KEY_PARENT); that table is mirrored here for the "if left on Same, inherits from X" text.
 */

import { ROOM_PERMISSION_KEYS } from "./tristate.ts";

export type RoomKeyGroupId = "access" | "messages" | "threads" | "pins" | "calls" | "moderation" | "webhooks" | "management";

/** Order of the client-side groups; groups that come from the server (modules, extensions) follow, in arrival order. */
export const ROOM_GROUP_ORDER: readonly RoomKeyGroupId[] = ["access", "messages", "threads", "pins", "calls", "moderation", "webhooks", "management"];

/** Group of every core room key. Mirrors the backend key list; an unknown key is grouped by what the server says. */
export const CORE_KEY_GROUP: Readonly<Record<string, RoomKeyGroupId>> = {
  "room.view": "access",
  "room.read_history": "access",
  "room.post": "messages",
  "room.react": "messages",
  "room.attach_files": "messages",
  "room.embed_links": "messages",
  "room.mention_everyone": "messages",
  "room.mention_roles": "messages",
  "room.use_commands": "messages",
  "room.use_components": "messages",
  "room.send_bricks": "messages",
  "room.edit_own_messages": "messages",
  "room.delete_own_messages": "messages",
  "room.create_threads": "threads",
  "room.send_in_threads": "threads",
  "room.manage_threads": "threads",
  "room.pin": "pins",
  "room.pin_permanent": "pins",
  "room.unpin_others": "pins",
  "room.view_pins": "pins",
  "room.call": "calls",
  "room.record": "calls",
  "room.call.start": "calls",
  "room.call.join": "calls",
  "room.call.speak": "calls",
  "room.call.video": "calls",
  "room.call.screen_share": "calls",
  "room.call.mute_others": "calls",
  "room.call.remove_participants": "calls",
  "room.manage_messages": "moderation",
  "room.bypass_slowmode": "moderation",
  "room.view_audit": "moderation",
  "room.manage_webhooks": "webhooks",
  "room.invite": "management",
  "room.manage": "management",
  "room.manage_channel": "management",
  "room.manage_permissions": "management",
};

/** Mirror of the backend ROOM_KEY_PARENT: while no layer names a fine key, it takes the value of its parent. */
export const ROOM_KEY_PARENT: Readonly<Record<string, string>> = {
  "room.pin_permanent": "room.pin",
  "room.unpin_others": "room.pin",
  "room.view_pins": "room.view",
  "room.read_history": "room.view",
  "room.attach_files": "room.post",
  "room.embed_links": "room.post",
  "room.create_threads": "room.post",
  "room.send_in_threads": "room.post",
  "room.mention_roles": "room.post",
  "room.use_commands": "room.post",
  "room.send_bricks": "room.post",
  "room.edit_own_messages": "room.post",
  "room.use_components": "room.react",
  "room.delete_own_messages": "room.view",
  "room.manage_threads": "room.manage",
  "room.manage_channel": "room.manage",
  "room.manage_permissions": "room.manage",
  "room.call.start": "room.call",
  "room.call.join": "room.call",
  "room.call.speak": "room.call",
  "room.call.video": "room.call",
  "room.call.screen_share": "room.call",
  "room.call.mute_others": "room.manage",
  "room.call.remove_participants": "room.manage",
  "room.bypass_slowmode": "room.manage_messages",
  "room.manage_webhooks": "room.manage",
  "room.view_audit": "room.manage",
};

export interface RoomKeyInfo {
  key: string;
  /** Server (or localised team catalogue) text; empty = none: the UI falls back to its own translation, then the key. */
  label: string;
  description: string;
  /** The text came from the team catalogue in the app's language (the room endpoints only speak English). */
  localized: boolean;
  /** A RoomKeyGroupId for core keys, `srv:<server group label>` for the rest. */
  groupId: string;
  /** Only for server groups; client groups are translated by the UI. */
  groupLabel: string;
  dangerous: boolean;
  /** The key this one falls back to when it stays on "Same" in every layer (null = it decides alone). */
  impliedBy: string | null;
  requires: string[];
}

export interface RoomPermissionCatalog {
  /** `server` = the room endpoint's own catalog; `team` = derived from the team catalogue; `fallback` = the fixed list. */
  source: "server" | "team" | "fallback";
  keys: RoomKeyInfo[];
  index: ReadonlyMap<string, RoomKeyInfo>;
  /** The keys, in order: what a draft may carry and what a preset may touch. */
  universe: string[];
  universeSet: ReadonlySet<string>;
}

/** Localised texts keyed by permission key (from the team catalogue, which honours `?lang=`). */
export interface KeyTexts {
  label: string;
  description: string;
  groupLabel?: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function info(key: string, entry: Record<string, unknown> | undefined, texts: ReadonlyMap<string, KeyTexts> | undefined): RoomKeyInfo {
  const core = CORE_KEY_GROUP[key];
  const local = texts?.get(key);
  const serverGroup = str(entry?.group).trim();
  // The server echoes the key as the label when it has nothing better: that is "no text".
  const serverLabel = str(entry?.label) === key ? "" : str(entry?.label);
  return {
    key,
    label: local?.label || serverLabel,
    description: local?.description || str(entry?.description),
    localized: !!local?.label,
    groupId: core ?? `srv:${local?.groupLabel || serverGroup || "other"}`,
    groupLabel: core ? "" : local?.groupLabel || serverGroup,
    dangerous: entry?.dangerous === true,
    impliedBy: str(entry?.impliedBy) || ROOM_KEY_PARENT[key] || null,
    requires: strList(entry?.requires),
  };
}

function assemble(keys: RoomKeyInfo[], source: RoomPermissionCatalog["source"]): RoomPermissionCatalog {
  const universe = keys.map((k) => k.key);
  return { source, keys, index: new Map(keys.map((k) => [k.key, k])), universe, universeSet: new Set(universe) };
}

/**
 * Where the i18n text of a permission key lives: `perm.keys.<path>` / `perm.keyHints.<path>`. Only the first dot separates the
 * namespace (`room`); the rest become underscores because `room.call` already has a text and cannot also be an object
 * (`room.call.start` -> `room.call_start`).
 */
export function permLabelPath(key: string): string {
  const i = key.indexOf(".");
  return i < 0 ? key : key.slice(0, i + 1) + key.slice(i + 1).replace(/\./g, "_");
}

/** Every core room key (the whole list the client knows, with its group), for views that only read permissions. */
export function coreRoomCatalog(): RoomPermissionCatalog {
  return assemble(Object.keys(CORE_KEY_GROUP).map((k) => info(k, undefined, undefined)), "fallback");
}

/** The fixed list of the editor before the server sent a catalog: the keys older servers know, no server texts. */
export function fallbackRoomCatalog(): RoomPermissionCatalog {
  return assemble(ROOM_PERMISSION_KEYS.map((k) => info(k, undefined, undefined)), "fallback");
}

/** Minimal slice of the team catalogue this module needs (see lib/roles/catalog.ts, CatalogPermission). */
export interface TeamCatalogEntry {
  key: string;
  label: string;
  description: string;
  groupLabel: string;
  scope: string;
  alsoIn?: readonly string[];
  resourceTypes: readonly string[] | null;
  dangerous: boolean;
  requires: readonly string[];
  impliedBy?: string | null;
  obsolete?: boolean;
}

/** Keys an override on a room or category may mention, according to the team catalogue (scope room, or a team key that is also a room key). */
export function roomEntriesOfTeamCatalog(entries: readonly TeamCatalogEntry[]): TeamCatalogEntry[] {
  return entries.filter((d) => {
    if (d.obsolete) return false;
    if (d.scope === "room") return !d.resourceTypes || d.resourceTypes.includes("room") || d.resourceTypes.includes("room_category");
    return (d.alsoIn ?? []).includes("room");
  });
}

/** Texts by key, from the team catalogue, in the app's language. */
export function textsOfTeamCatalog(entries: readonly TeamCatalogEntry[]): Map<string, KeyTexts> {
  const out = new Map<string, KeyTexts>();
  for (const d of entries) if (!out.has(d.key) && (d.label || d.description)) out.set(d.key, { label: d.label, description: d.description, groupLabel: d.groupLabel });
  return out;
}

/**
 * Builds the catalog the editor shows.
 *  1. `raw.universe` / `raw.catalog` present: the server's own keys (universe order; catalog-only when no universe).
 *  2. else `teamEntries` (the team catalogue, when it came from the server) restricted to room keys.
 *  3. else the fixed list.
 * `texts` only improves labels, it never adds or removes keys.
 */
export function buildRoomCatalog(raw: unknown, opts: { texts?: ReadonlyMap<string, KeyTexts>; teamEntries?: readonly TeamCatalogEntry[] } = {}): RoomPermissionCatalog {
  const r = (raw && typeof raw === "object" ? raw : {}) as { universe?: unknown; permissionKeys?: unknown; catalog?: unknown };
  const catalog = Array.isArray(r.catalog) ? r.catalog.filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as any).key === "string") : [];
  const byKey = new Map<string, Record<string, unknown>>(catalog.map((e) => [e.key as string, e]));
  const universe = strList(r.universe).length > 0 ? strList(r.universe) : strList(r.permissionKeys);
  const order = universe.length > 0 ? universe : catalog.map((e) => e.key as string);
  const seen = new Set<string>();
  const keys: RoomKeyInfo[] = [];
  for (const key of order) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(info(key, byKey.get(key), opts.texts));
  }
  if (keys.length > 0) return assemble(keys, "server");

  const fromTeam = roomEntriesOfTeamCatalog(opts.teamEntries ?? []);
  if (fromTeam.length > 0) {
    const texts = opts.texts ?? textsOfTeamCatalog(fromTeam);
    const core = ROOM_PERMISSION_KEYS as readonly string[];
    const ordered = [...fromTeam].sort((a, b) => (core.indexOf(a.key) + 1 || 999) - (core.indexOf(b.key) + 1 || 999));
    for (const d of ordered) {
      if (seen.has(d.key)) continue;
      seen.add(d.key);
      keys.push(info(d.key, { label: d.label, description: d.description, group: d.groupLabel, dangerous: d.dangerous, requires: d.requires, impliedBy: d.impliedBy ?? undefined }, texts));
    }
    return assemble(keys, "team");
  }
  return fallbackRoomCatalog();
}

export interface KeyTextResolver {
  name(k: RoomKeyInfo): string;
  desc(k: RoomKeyInfo): string;
  group(id: string, serverLabel: string): string;
}

export interface RoomGroupView {
  id: string;
  label: string;
  keys: RoomKeyInfo[];
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Groups in display order; `query` keeps the keys whose name, description or key match (or all keys of a matching group). */
export function groupRoomKeys(catalog: RoomPermissionCatalog, resolve: KeyTextResolver, query = ""): RoomGroupView[] {
  const groups = new Map<string, RoomGroupView>();
  for (const k of catalog.keys) {
    const g = groups.get(k.groupId) ?? { id: k.groupId, label: resolve.group(k.groupId, k.groupLabel), keys: [] };
    g.keys.push(k);
    groups.set(k.groupId, g);
  }
  const rank = (id: string) => {
    const i = (ROOM_GROUP_ORDER as readonly string[]).indexOf(id);
    return i === -1 ? ROOM_GROUP_ORDER.length : i;
  };
  const ordered = [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id));
  const q = fold(query.trim());
  if (!q) return ordered;
  return ordered
    .map((g) => (fold(g.label).includes(q) ? g : { ...g, keys: g.keys.filter((k) => fold(`${resolve.name(k)} ${resolve.desc(k)} ${k.key}`).includes(q)) }))
    .filter((g) => g.keys.length > 0);
}

/** Rules (yes / no) a subject holds inside each group, for the counters of the group headers. */
export function groupRuleCounts(states: Readonly<Partial<Record<string, "allow" | "deny" | "inherit">>>, groups: readonly RoomGroupView[]): Map<string, { allow: number; deny: number }> {
  const out = new Map<string, { allow: number; deny: number }>();
  for (const g of groups) {
    let allow = 0;
    let deny = 0;
    for (const k of g.keys) {
      const s = states[k.key];
      if (s === "allow") allow++;
      else if (s === "deny") deny++;
    }
    out.set(g.id, { allow, deny });
  }
  return out;
}
