/**
 * Which controls a room offers, decided ONLY from what the backend resolved for the current user (the frontend never
 * recomputes a role). Pure and tested in room-controls.test.ts.
 *
 * The backend answer of `GET /rooms/:id/permissions/me` has two shapes the UI accepts:
 *  - the legacy booleans `{ canPost, canCall, canRecord, canInvite, canManage }`, optionally extended with
 *    `canView / canReact / canManageMessages / canPin / canMentionEveryone / isMuted / mutedUntil / muteReason`;
 *  - a list of permission keys `{ permissions: ["room.view", "room.post", ...] }`.
 */

export interface RoomAccess {
  canView: boolean;
  canPost: boolean;
  canReact: boolean;
  canCall: boolean;
  canRecord: boolean;
  canInvite: boolean;
  canManage: boolean;
  canManageMessages: boolean;
  canPin: boolean;
  /** Pin without an expiry (room.pin_permanent). */
  canPinPermanent: boolean;
  /** Unpin what other people pinned (room.unpin_others). */
  canUnpinOthers: boolean;
  /** See the pinned list (room.view_pins). */
  canViewPins: boolean;
  canMentionEveryone: boolean;
  canMuteMembers: boolean;
  isMuted: boolean;
  mutedUntil: string | null;
  muteReason: string | null;
}

export type ComposerMode = "input" | "announcement" | "muted" | "readonly";

export interface RoomControls {
  composer: ComposerMode;
  showReactions: boolean;
  showCall: boolean;
  showTranscripts: boolean;
  showSettings: boolean;
  showModeration: boolean;
  canEditOwn: boolean;
  canDeleteOwn: boolean;
  canDeleteOthers: boolean;
  canPin: boolean;
  canMentionEveryone: boolean;
  canReply: boolean;
}

export interface RoomControlsContext {
  channelType?: "text" | "announcement" | null;
  roomType?: "channel" | "thread" | "dm";
  now?: number;
}

const has = (keys: Set<string>, key: string) => keys.has(key) || keys.has("administrator");

/** Accepts either backend shape (or an unknown / failed answer) and returns every flag explicitly. */
export function normalizeRoomAccess(raw: unknown): RoomAccess {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const keyList: unknown = Array.isArray(r.permissions) ? r.permissions : Array.isArray(r.allow) ? r.allow : null;
  const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

  if (keyList) {
    const keys = new Set((keyList as unknown[]).filter((k): k is string => typeof k === "string"));
    const post = has(keys, "room.post");
    return {
      canView: has(keys, "room.view"),
      canPost: post,
      canReact: has(keys, "room.react"),
      canCall: has(keys, "room.call"),
      canRecord: has(keys, "room.record") || has(keys, "room.call"),
      canInvite: has(keys, "room.invite"),
      canManage: has(keys, "room.manage"),
      canManageMessages: has(keys, "room.manage_messages"),
      canPin: has(keys, "room.pin") || has(keys, "room.manage_messages"),
      canPinPermanent: has(keys, "room.pin_permanent"),
      canUnpinOthers: has(keys, "room.unpin_others"),
      canViewPins: has(keys, "room.view_pins"),
      canMentionEveryone: has(keys, "room.mention_everyone"),
      canMuteMembers: has(keys, "members.mute"),
      isMuted: Boolean(r.isMuted ?? r.muted),
      mutedUntil: typeof r.mutedUntil === "string" ? r.mutedUntil : null,
      muteReason: typeof r.muteReason === "string" ? r.muteReason : null,
    };
  }

  const canPost = bool(r.canPost) ?? false;
  return {
    canView: bool(r.canView) ?? true,
    canPost,
    // Without an explicit flag the old rule holds: whoever can write can react and call.
    canReact: bool(r.canReact) ?? canPost,
    canCall: bool(r.canCall) ?? canPost,
    canRecord: bool(r.canRecord) ?? canPost,
    canInvite: bool(r.canInvite) ?? false,
    canManage: bool(r.canManage) ?? false,
    canManageMessages: bool(r.canManageMessages) ?? (bool(r.canManage) ?? false),
    canPin: bool(r.canPin) ?? (bool(r.canManageMessages) ?? (bool(r.canManage) ?? false)),
    canPinPermanent: bool(r.canPinPermanent) ?? false,
    canUnpinOthers: bool(r.canUnpinOthers) ?? false,
    canViewPins: bool(r.canViewPins) ?? (bool(r.canView) ?? true),
    canMentionEveryone: bool(r.canMentionEveryone) ?? (bool(r.canManage) ?? false),
    canMuteMembers: bool(r.canMuteMembers) ?? (bool(r.canManage) ?? false),
    isMuted: Boolean(r.isMuted ?? r.muted),
    mutedUntil: typeof r.mutedUntil === "string" ? r.mutedUntil : null,
    muteReason: typeof r.muteReason === "string" ? r.muteReason : null,
  };
}

/** Access used before the backend answers and when it fails: nothing risky is offered. */
export const LOADING_ROOM_ACCESS: RoomAccess = normalizeRoomAccess({ canView: true, canPost: false });

/** A mute is active while it has no end, or its end is still in the future. */
export function isMuteActive(access: Pick<RoomAccess, "isMuted" | "mutedUntil">, now = Date.now()): boolean {
  if (!access.isMuted) return false;
  if (!access.mutedUntil) return true;
  const until = Date.parse(access.mutedUntil);
  return Number.isNaN(until) ? true : until > now;
}

export function resolveRoomControls(access: RoomAccess, ctx: RoomControlsContext = {}): RoomControls {
  const now = ctx.now ?? Date.now();
  const muted = isMuteActive(access, now);
  const isDm = ctx.roomType === "dm";
  const canWrite = access.canPost && !muted;

  let composer: ComposerMode = "input";
  if (muted) composer = "muted";
  else if (!access.canPost) composer = ctx.channelType === "announcement" ? "announcement" : "readonly";

  return {
    composer,
    showReactions: access.canReact && !muted,
    showCall: access.canCall && !muted,
    showTranscripts: access.canCall,
    showSettings: access.canManage && !isDm,
    showModeration: (access.canMuteMembers || access.canManage) && !isDm,
    canEditOwn: canWrite,
    canDeleteOwn: canWrite,
    canDeleteOthers: access.canManageMessages && !muted,
    canPin: (access.canPin || access.canManageMessages) && !muted,
    canMentionEveryone: access.canMentionEveryone && canWrite,
    canReply: canWrite,
  };
}

/** Whole minutes left of a timed mute (rounded up), or null when it does not end / already ended. */
export function muteMinutesLeft(access: Pick<RoomAccess, "mutedUntil">, now = Date.now()): number | null {
  if (!access.mutedUntil) return null;
  const until = Date.parse(access.mutedUntil);
  if (Number.isNaN(until) || until <= now) return null;
  return Math.ceil((until - now) / 60_000);
}

export const MUTE_DURATIONS_MINUTES = [5, 60, 60 * 24, 60 * 24 * 7] as const;

/** Duration the moderation form sends: a known option, `null` for "until someone lifts it" (never a free number). */
export function sanitizeMuteDuration(minutes: number | null): number | null {
  if (minutes === null) return null;
  return (MUTE_DURATIONS_MINUTES as readonly number[]).includes(minutes) ? minutes : MUTE_DURATIONS_MINUTES[1];
}

export function sanitizeMuteReason(reason: string): string {
  return reason.replace(/\s+/g, " ").trim().slice(0, 200);
}
