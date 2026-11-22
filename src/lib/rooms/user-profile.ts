/**
 * Pure rules of the user profile card (the popover that opens from the members panel, a message author, an @mention or the
 * "X used /cmd" line). Nothing here touches the DOM or the network; tested in user-profile.test.ts.
 *
 * Wire shape: `GET /teams/:teamId/members/:userId/profile?roomId=` (backend rooms/member-profile.service.ts).
 */

export interface ProfileRole {
  id: string;
  name: string;
  color: string | null;
  position: number;
  /** Comes from a group, not assigned to the person. */
  inherited: boolean;
}

export interface ProfileGroup {
  id: string;
  name: string;
  color: string | null;
}

export interface ProfileViewerCaps {
  isSelf: boolean;
  canManage: boolean;
  canAssignRoles: boolean;
  canManageGroups: boolean;
  canMute: boolean;
  canKick: boolean;
}

export interface MemberProfile {
  userId: string;
  displayName: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  timezone: string | null;
  locale: string | null;
  isBot: boolean;
  joinedTeamAt: string | null;
  roles: ProfileRole[];
  groups: ProfileGroup[];
  isOwner: boolean;
  mute: { until: string | null; reason: string | null } | null;
  bot: null | {
    id: string;
    description: string | null;
    isActive: boolean;
    createdByName: string | null;
    createdAt: string;
    commands: Array<{ name: string; description: string; usage: string | null }>;
    /** BOT lock (identity and settings frozen) and CODE lock (its script is unreadable): only the facts, never the code. Absent on an older server. */
    locked?: boolean;
    codeLocked?: boolean;
    lockSource?: "owner" | "pack" | null;
    /** Immutable original author (the publisher for an imported bot) and the pack it was imported from. */
    originalAuthorName?: string | null;
    origin?: { packId: string; packTitle: string | null; packVersion: string | null; publisherName: string | null } | null;
    forkedFromName?: string | null;
  };
  room: null | {
    id: string;
    joinedAt: string | null;
    permissions: { canSee: boolean; allowed: string[]; denied: string[] } | null;
  };
  viewer: ProfileViewerCaps;
}

/** What the caller already knows (members panel row, message author) so the card paints before the request answers. */
export interface KnownProfile {
  displayName?: string;
  avatarUrl?: string | null;
  email?: string | null;
  isBot?: boolean;
  /** Colour of the person's highest role. */
  color?: string | null;
}

export type Presence = "online" | "in-call" | "offline";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const safeHex = (c: string | null | undefined): string | null => (c && HEX.test(c) ? c : null);

// ── roles ───────────────────────────────────────────────────────────────────

/** Highest role first (position, then name). */
export const sortProfileRoles = (roles: readonly ProfileRole[]): ProfileRole[] =>
  [...roles].sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));

/** Roles the person holds themselves and the ones that only come through a group (shown dashed). */
export function groupProfileRoles(roles: readonly ProfileRole[]): { direct: ProfileRole[]; inherited: ProfileRole[] } {
  const sorted = sortProfileRoles(roles);
  return { direct: sorted.filter((r) => !r.inherited), inherited: sorted.filter((r) => r.inherited) };
}

/** Colour of the name: the highest role that has a valid colour (the same rule as the members panel). */
export function profileColor(roles: readonly ProfileRole[]): string | null {
  const top = sortProfileRoles(roles)[0];
  return safeHex(top?.color);
}

// ── banner ──────────────────────────────────────────────────────────────────

/** Banner behind the avatar: the colour of the highest role, else the workspace brand (`--primary`). There is no banner image in the API. */
export function bannerStyle(color: string | null): { background: string } {
  const c = safeHex(color);
  if (!c) return { background: "linear-gradient(135deg, hsl(var(--primary) / 0.45), hsl(var(--primary) / 0.18))" };
  return { background: `linear-gradient(135deg, ${c}, ${c}99)` };
}

// ── dates ───────────────────────────────────────────────────────────────────

/** "Nov 21, 2026" in the app language; "" for a missing or unparsable date. */
export function formatMemberSince(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

/** The person's local time ("14:32") from their IANA timezone; "" when unknown or invalid. */
export function formatLocalTime(timezone: string | null | undefined, now: Date, locale?: string): string {
  if (!timezone) return "";
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(now);
  } catch {
    return "";
  }
}

/** Mute label key + params: "until a date" or "until someone lifts it"; null when not muted or already expired. */
export function muteState(mute: MemberProfile["mute"], now: number): { kind: "forever" } | { kind: "until"; until: string } | null {
  if (!mute) return null;
  if (mute.until === null) return { kind: "forever" };
  const t = Date.parse(mute.until);
  if (!Number.isFinite(t)) return { kind: "forever" };
  return t > now ? { kind: "until", until: mute.until } : null;
}

// ── sections and tabs ───────────────────────────────────────────────────────

export type ProfileTab = "profile" | "permissions";
export type ProfileSection = "about" | "bot" | "commands" | "roles" | "groups" | "dates" | "mute";

/** Tabs: "Permissions" only when the server sent the effective permissions (the viewer manages the room). */
export function profileTabs(profile: Pick<MemberProfile, "room"> | null): ProfileTab[] {
  return profile?.room?.permissions ? ["profile", "permissions"] : ["profile"];
}

/** Which blocks the Profile tab shows, in order. A block without data is not listed (nothing is invented). */
export function profileSections(profile: MemberProfile): ProfileSection[] {
  const out: ProfileSection[] = [];
  if (profile.isBot) {
    // The commands of a bot are not listed in its profile (they are discoverable with "/"): the card stays short.
    out.push("bot");
  } else if (profile.bio || profile.timezone) {
    out.push("about");
  }
  if (profile.roles.length > 0) out.push("roles");
  if (profile.groups.length > 0) out.push("groups");
  if (profile.joinedTeamAt || profile.room?.joinedAt) out.push("dates");
  if (profile.mute) out.push("mute");
  return out;
}

// ── actions ─────────────────────────────────────────────────────────────────

export type ProfileAction = "message" | "mention" | "copyId" | "editProfile" | "mute" | "unmute" | "roles" | "groups" | "kick";

export interface ActionContext {
  isSelf: boolean;
  isBot: boolean;
  /** The surface can open a DM (the rooms page can; a DM with a bot or with yourself makes no sense). */
  canDm: boolean;
  /** The surface has a composer to insert the mention into. */
  canMention: boolean;
  muted: boolean;
  viewer: Pick<ProfileViewerCaps, "canAssignRoles" | "canManageGroups" | "canMute" | "canKick"> | null;
}

/** Primary actions first, then the management ones. The server decides the caps; this only orders and hides what does not apply. */
export function profileActions(ctx: ActionContext): ProfileAction[] {
  const out: ProfileAction[] = [];
  if (ctx.isSelf) out.push("editProfile");
  else if (!ctx.isBot && ctx.canDm) out.push("message");
  if (ctx.canMention && !ctx.isSelf) out.push("mention");
  out.push("copyId");
  const v = ctx.viewer;
  if (v && !ctx.isSelf) {
    if (v.canMute) out.push(ctx.muted ? "unmute" : "mute");
    if (v.canAssignRoles) out.push("roles");
    if (v.canManageGroups && !ctx.isBot) out.push("groups");
    if (v.canKick) out.push("kick");
  }
  return out;
}

// ── placement ───────────────────────────────────────────────────────────────

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const toAnchor = (r: { left: number; top: number; right: number; bottom: number }): AnchorRect => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/**
 * Desktop placement: to the LEFT of the anchor when it sits on the right edge (members panel) and to the right otherwise, so the
 * card never covers the row or message it came from; vertically aligned with the anchor and clamped into the viewport.
 */
export function cardPosition(
  anchor: AnchorRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
  margin = 8,
): { left: number; top: number; side: "left" | "right" } {
  const roomRight = viewport.width - anchor.right - gap - margin;
  const roomLeft = anchor.left - gap - margin;
  const side = roomRight >= size.width || roomRight >= roomLeft ? "right" : "left";
  let left = side === "right" ? anchor.right + gap : anchor.left - gap - size.width;
  left = Math.max(margin, Math.min(left, viewport.width - margin - size.width));
  const top = Math.max(margin, Math.min(anchor.top, viewport.height - margin - size.height));
  return { left, top, side };
}

/** Below this width the card is a bottom sheet. */
export const SHEET_MAX_WIDTH = 639;
