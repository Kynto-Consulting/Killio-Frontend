/**
 * Pure rules for reordering channels (drag and drop, Alt+Up / Alt+Down) and for deleting one.
 * Backend contract: `PUT /teams/:id/rooms/layout` with `{ items: [{ roomId, categoryId: string | null }] }`
 * (the position of each item in the list is its order; only plain channels take part; max 500 items).
 */

export interface ChannelSection {
  /** `null` = channels without category. */
  categoryId: string | null;
  roomIds: string[];
}

export interface LayoutItem {
  roomId: string;
  categoryId: string | null;
}

export const MAX_LAYOUT_ITEMS = 500;

const clone = (sections: readonly ChannelSection[]): ChannelSection[] => sections.map((s) => ({ categoryId: s.categoryId, roomIds: [...s.roomIds] }));

/** Body of the layout call: every channel, in display order, with its category. */
export function toLayoutItems(sections: readonly ChannelSection[]): LayoutItem[] {
  return sections.flatMap((s) => s.roomIds.map((roomId) => ({ roomId, categoryId: s.categoryId })));
}

function locate(sections: readonly ChannelSection[], roomId: string): { s: number; i: number } | null {
  for (let s = 0; s < sections.length; s += 1) {
    const i = sections[s].roomIds.indexOf(roomId);
    if (i >= 0) return { s, i };
  }
  return null;
}

/**
 * Drag and drop: put `roomId` into `targetCategoryId`, right before `beforeRoomId` (or at the end when it is
 * missing or unknown). Dropping a channel onto itself, an unknown channel or an unknown category is a no-op.
 */
export function moveChannel(
  sections: readonly ChannelSection[],
  roomId: string,
  targetCategoryId: string | null,
  beforeRoomId?: string | null,
): ChannelSection[] {
  const next = clone(sections);
  const from = locate(next, roomId);
  const target = next.find((s) => s.categoryId === targetCategoryId);
  if (!from || !target || roomId === beforeRoomId) return next;
  next[from.s].roomIds.splice(from.i, 1);
  const at = beforeRoomId ? target.roomIds.indexOf(beforeRoomId) : -1;
  if (at >= 0) target.roomIds.splice(at, 0, roomId);
  else target.roomIds.push(roomId);
  return next;
}

/**
 * Keyboard (Alt+Up / Alt+Down): swap with the neighbour; at the edge of a category the channel jumps to the end
 * (up) or start (down) of the neighbouring category. The first and last positions overall are a no-op.
 */
export function shiftChannel(sections: readonly ChannelSection[], roomId: string, direction: -1 | 1): ChannelSection[] {
  const next = clone(sections);
  const at = locate(next, roomId);
  if (!at) return next;
  const list = next[at.s].roomIds;
  const target = at.i + direction;
  if (target >= 0 && target < list.length) {
    [list[at.i], list[target]] = [list[target], list[at.i]];
    return next;
  }
  const neighbour = next[at.s + direction];
  if (!neighbour) return next;
  list.splice(at.i, 1);
  if (direction === -1) neighbour.roomIds.push(roomId);
  else neighbour.roomIds.unshift(roomId);
  return next;
}

export function sameLayout(a: readonly ChannelSection[], b: readonly ChannelSection[]): boolean {
  return JSON.stringify(toLayoutItems(a)) === JSON.stringify(toLayoutItems(b));
}

/** Optimistic update: rooms take the category and position of the new layout; other rooms stay untouched. */
export function applyLayoutToRooms<R extends { id: string; groupId?: string; categoryId?: string; sortOrder?: number }>(
  rooms: readonly R[],
  items: readonly LayoutItem[],
): R[] {
  const byId = new Map(items.map((item, index) => [item.roomId, { item, index }]));
  return rooms.map((room) => {
    const hit = byId.get(room.id);
    if (!hit) return room;
    const categoryId = hit.item.categoryId ?? undefined;
    return { ...room, groupId: categoryId, categoryId, sortOrder: hit.index };
  });
}

// --- Deleting a channel -------------------------------------------------------

/** The user must type the channel name; comparison ignores case, surrounding spaces and a leading `#`. */
export function deleteConfirmationMatches(typed: string, channelName: string): boolean {
  const clean = (v: string) => v.trim().replace(/^#/, "").trim().toLowerCase();
  return clean(channelName).length > 0 && clean(typed) === clean(channelName);
}

/** Where to go after deleting `deletedId`: the neighbour in the sidebar order, else the first channel, else null. */
export function nextRoomAfterDelete(orderedChannelIds: readonly string[], deletedId: string): string | null {
  const index = orderedChannelIds.indexOf(deletedId);
  const rest = orderedChannelIds.filter((id) => id !== deletedId);
  if (rest.length === 0) return null;
  if (index < 0) return rest[0];
  return rest[Math.min(index, rest.length - 1)];
}

export function removeRoomById<R extends { id: string }>(rooms: readonly R[], roomId: string): R[] {
  return rooms.filter((r) => r.id !== roomId);
}

/** `room.deleted` payload: tolerate `{ roomId }` and `{ id }`. */
export function deletedRoomId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { roomId?: unknown; id?: unknown };
  const id = p.roomId ?? p.id;
  return typeof id === "string" && id ? id : null;
}

export type DeleteErrorKind = "badRequest" | "forbidden" | "notFound" | "other";

/** 400 = not deletable (DM / entity room), 403 = no permission, 404 = already gone. */
export function deleteErrorKind(status: number | undefined): DeleteErrorKind {
  if (status === 400) return "badRequest";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  return "other";
}
