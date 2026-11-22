/**
 * What the "..." menu of a channel row offers, Discord style: sections of items decided from permissions and state.
 * Pure; the UI (components/rooms/ChannelMenu.tsx) only renders it. Tested in channel-menu.test.ts.
 *
 * Notifications: the backend only has a per-user preference per room (`all` | `mentions` | `none`, see
 * api/rooms.ts). A timed mute (15 min, 1 h, ...) does not exist server side, so it is NOT offered here; it needs a
 * `muted_until` column and endpoint first.
 */

export type NotifPref = "all" | "mentions" | "none";

export type ChannelMenuItemId =
  | "markRead"
  | "notifications"
  | "notif:all"
  | "notif:mentions"
  | "notif:none"
  | "settings"
  | "copyLink"
  | "delete";

export interface ChannelMenuItem {
  id: ChannelMenuItemId;
  /** Opens a nested list (`children`) instead of running an action. */
  submenu?: boolean;
  children?: ChannelMenuItem[];
  checked?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}

export interface ChannelMenuInput {
  roomType: "channel" | "dm" | "thread" | string;
  /** Linked to a document / board / mesh (its settings live with the entity). */
  linkedEntity?: boolean;
  /** The assistant room: nothing to configure or delete. */
  isAiRoom?: boolean;
  unread: boolean;
  /** The user's current preference; null until known. */
  notifPref: NotifPref | null;
  /** Can edit this channel (same check as the header gear used to use). */
  canManage: boolean;
  /** Can delete this channel. */
  canDelete: boolean;
}

export const NOTIF_PREFS: NotifPref[] = ["all", "mentions", "none"];

export function buildChannelMenu(i: ChannelMenuInput): ChannelMenuItem[][] {
  const sections: ChannelMenuItem[][] = [];

  sections.push([{ id: "markRead", disabled: !i.unread }]);

  sections.push([
    {
      id: "notifications",
      submenu: true,
      children: NOTIF_PREFS.map((p) => ({ id: `notif:${p}` as ChannelMenuItemId, checked: i.notifPref === p })),
    },
  ]);

  const editable = i.roomType === "channel" && !i.linkedEntity && !i.isAiRoom;
  const manage: ChannelMenuItem[] = [];
  if (i.canManage && editable) manage.push({ id: "settings" });
  if (manage.length) sections.push(manage);

  const tail: ChannelMenuItem[] = [{ id: "copyLink" }];
  sections.push(tail);

  if (i.canDelete && editable) sections.push([{ id: "delete", destructive: true }]);
  return sections;
}

/** Flat list of the ids a keyboard can move through (submenu children excluded), skipping disabled items. */
export function focusableIds(sections: ChannelMenuItem[][]): ChannelMenuItemId[] {
  return sections.flat().filter((it) => !it.disabled).map((it) => it.id);
}

/** Next index in a roving list (wraps). `dir` is +1 / -1; `-1` as current means nothing focused yet. */
export function stepIndex(current: number, dir: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : length - 1;
  return (current + dir + length) % length;
}

/** Absolute URL of a channel (for "Copy link"). */
export function channelUrl(origin: string, roomId: string): string {
  return `${origin.replace(/\/+$/, "")}/rooms/${roomId}`;
}
