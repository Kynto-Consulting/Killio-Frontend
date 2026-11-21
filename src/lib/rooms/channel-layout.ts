/**
 * Pure layout rules of the rooms sidebar (Discord style): categories and their order, channels per category,
 * entity rooms (documents / boards) kept apart from channels, and direct messages titled after the OTHER person.
 * No React, no I/O: everything here is covered by channel-layout.test.ts.
 */

export type ChannelKind = "text" | "announcement";

export interface LayoutRoom {
  id: string;
  name: string;
  type: "channel" | "thread" | "dm";
  groupId?: string | null;
  categoryId?: string | null;
  channelType?: ChannelKind | null;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  position?: number | null;
  unreadCount?: number | null;
  mentionCount?: number | null;
  muted?: boolean | null;
}

export interface LayoutCategory {
  id: string;
  name: string;
  emoji?: string | null;
  sortOrder: number;
}

export interface SidebarCategory<R extends LayoutRoom = LayoutRoom> {
  category: LayoutCategory | null;
  rooms: R[];
  unread: number;
  mentions: number;
}

export interface EntityGroup<R extends LayoutRoom = LayoutRoom> {
  entityType: string;
  rooms: R[];
  unread: number;
  mentions: number;
}

export interface SidebarModel<R extends LayoutRoom = LayoutRoom> {
  categories: SidebarCategory<R>[];
  entityGroups: EntityGroup<R>[];
  directMessages: R[];
}

/** Order in which entity rooms are grouped; anything else goes last under its own name ("other" when untyped). */
export const ENTITY_TYPE_ORDER = ["document", "board", "mesh", "list", "card"] as const;

/** Rooms that hold the private Killio assistant conversation never show up as entity rooms. */
export const PRIVATE_ENTITY_TYPE = "vault_conversation";

const byName = (a: { name: string; id: string }, b: { name: string; id: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);

export function categoryIdOf(room: Pick<LayoutRoom, "groupId" | "categoryId">): string | null {
  return room.categoryId ?? room.groupId ?? null;
}

export function sortCategories<C extends LayoutCategory>(categories: readonly C[]): C[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b));
}

/** Ids in display order (what a `PUT .../order` call sends). */
export function categoryOrder(categories: readonly LayoutCategory[]): string[] {
  return sortCategories(categories).map((c) => c.id);
}

/** Swap a category with its neighbour (keyboard: Alt+Up / Alt+Down). Edges and unknown ids are a no-op. */
export function moveCategory(order: readonly string[], id: string, direction: -1 | 1): string[] {
  const index = order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Drag and drop: put `id` where `overId` is. */
export function reorderCategory(order: readonly string[], id: string, overId: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function isEntityRoom(room: LayoutRoom): boolean {
  if (room.type === "dm") return false;
  if (room.linkedEntityType === PRIVATE_ENTITY_TYPE) return false;
  return Boolean(room.linkedEntityType) || room.type === "thread";
}

function sumUnread(rooms: readonly LayoutRoom[]) {
  let unread = 0;
  let mentions = 0;
  for (const r of rooms) {
    if (r.muted) continue; // a muted room never raises the badge of its category
    unread += r.unreadCount ?? 0;
    mentions += r.mentionCount ?? 0;
  }
  return { unread, mentions };
}

function sortChannels<R extends LayoutRoom>(rooms: R[]): R[] {
  return [...rooms].sort((a, b) => {
    const pa = a.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.position ?? Number.MAX_SAFE_INTEGER;
    return pa - pb || byName(a, b);
  });
}

export function buildSidebarModel<R extends LayoutRoom>(
  rooms: readonly R[],
  categories: readonly LayoutCategory[],
): SidebarModel<R> {
  const sorted = sortCategories(categories);
  const known = new Set(sorted.map((c) => c.id));
  const channels = rooms.filter((r) => r.type !== "dm" && !isEntityRoom(r));

  const uncategorized = sortChannels(channels.filter((r) => {
    const cid = categoryIdOf(r);
    return !cid || !known.has(cid);
  }));

  const result: SidebarCategory<R>[] = [];
  if (uncategorized.length > 0) result.push({ category: null, rooms: uncategorized, ...sumUnread(uncategorized) });
  for (const category of sorted) {
    const inside = sortChannels(channels.filter((r) => categoryIdOf(r) === category.id));
    result.push({ category, rooms: inside, ...sumUnread(inside) });
  }

  const entityRooms = rooms.filter(isEntityRoom);
  const entityGroups: EntityGroup<R>[] = [];
  const typesInUse = new Set(entityRooms.map((r) => r.linkedEntityType || "other"));
  const known2 = ENTITY_TYPE_ORDER as readonly string[];
  const orderedTypes = [
    ...ENTITY_TYPE_ORDER.filter((t) => typesInUse.has(t)),
    ...[...typesInUse].filter((t) => !known2.includes(t)).sort(),
  ];
  for (const entityType of orderedTypes) {
    const inside = entityRooms.filter((r) => (r.linkedEntityType || "other") === entityType).sort(byName);
    entityGroups.push({ entityType, rooms: inside, ...sumUnread(inside) });
  }

  const directMessages = rooms.filter((r) => r.type === "dm").sort(byName);
  return { categories: result, entityGroups, directMessages };
}

const normalizeName = (value: string) => value.trim().toLowerCase();

/**
 * Title of a direct message. The backend names a DM "A, B" (both people, sorted), so each side saw the same text.
 * With `peerName` (from the room members) that name wins; otherwise the viewer's own names are removed from the text.
 */
export function dmDisplayName(room: Pick<LayoutRoom, "name">, selfNames: readonly (string | null | undefined)[], peerName?: string | null): string {
  if (peerName && peerName.trim()) return peerName.trim();
  const mine = new Set(selfNames.filter((n): n is string => Boolean(n && n.trim())).map(normalizeName));
  const parts = room.name.split(",").map((p) => p.trim()).filter(Boolean);
  const others = parts.filter((p) => !mine.has(normalizeName(p)));
  // Nothing removed (viewer unknown) or everything removed: the original text is still the most accurate.
  if (others.length === 0 || others.length === parts.length) return room.name;
  return others.join(", ");
}

/** Collapsed sections: explicit user choice first, then the section default (entity rooms start collapsed). */
export function isSectionCollapsed(state: Readonly<Record<string, boolean>>, key: string, defaultCollapsed = false): boolean {
  return key in state ? state[key] : defaultCollapsed;
}

export function totalBadges(model: SidebarModel): { unread: number; mentions: number } {
  let unread = 0;
  let mentions = 0;
  for (const c of model.categories) { unread += c.unread; mentions += c.mentions; }
  for (const g of model.entityGroups) { unread += g.unread; mentions += g.mentions; }
  const dm = sumUnread(model.directMessages);
  return { unread: unread + dm.unread, mentions: mentions + dm.mentions };
}
