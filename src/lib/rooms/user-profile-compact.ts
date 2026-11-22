/**
 * Pure rules of the COMPACT profile card and of the moderator view (what each one shows, how much biography and how many roles fit,
 * how the moderation permissions are summarised). No DOM, no network; tested in user-profile-compact.test.ts.
 *
 * Wire shape of the moderator view: `GET /teams/:teamId/members/:userId/moderation?roomId=` (backend member-moderation.service.ts).
 */

import type { MemberProfile, ProfileRole, ProfileViewerCaps } from "./user-profile.ts";
import { sortProfileRoles } from "./user-profile.ts";

export interface Counter {
  count: number;
  /** The server stopped counting at its cap: show "10000+". */
  capped: boolean;
}

export interface MemberModeration {
  userId: string;
  isBot: boolean;
  email: string | null;
  account: { createdAt: string | null; joinedTeamAt: string | null; joinedRoomAt: string | null };
  activity: { messages: Counter; links: Counter; media: Counter; audit: Counter | null };
  moderator: { held: string[]; total: number; isOwner: boolean };
  mute: { until: string | null; reason: string | null; byName: string | null } | null;
  viewer: ProfileViewerCaps;
}

// ── biography ───────────────────────────────────────────────────────────────

export const BIO_MAX_LINES = 3;
export const BIO_MAX_CHARS = 160;

/** Clamp of "About me": at most 3 lines and ~160 characters, cut at a word. `truncated` is false for a short bio (no "see all" link). */
export function bioPreview(bio: string | null | undefined): { text: string; truncated: boolean } {
  const full = (bio ?? "").trim();
  if (!full) return { text: "", truncated: false };
  const lines = full.split(/\r?\n/);
  let text = lines.slice(0, BIO_MAX_LINES).join("\n");
  let truncated = lines.length > BIO_MAX_LINES;
  if (text.length > BIO_MAX_CHARS) {
    const cut = text.slice(0, BIO_MAX_CHARS);
    const space = cut.lastIndexOf(" ");
    text = (space > BIO_MAX_CHARS * 0.6 ? cut.slice(0, space) : cut).trimEnd();
    truncated = true;
  }
  return truncated ? { text: `${text}…`, truncated: true } : { text, truncated: false };
}

// ── roles ───────────────────────────────────────────────────────────────────

/** Roles in the compact card: the first `max` (highest first) and how many stay behind the "+N" chip. */
export function roleOverflow<T extends Pick<ProfileRole, "position" | "name">>(roles: readonly T[], max = 4, expanded = false): { visible: T[]; hidden: number } {
  const sorted = sortProfileRoles(roles as unknown as ProfileRole[]) as unknown as T[];
  if (expanded || sorted.length <= max) return { visible: sorted, hidden: 0 };
  return { visible: sorted.slice(0, max), hidden: sorted.length - max };
}

/** The "highlighted" roles shown next to the name: the highest ones the person holds themselves (not inherited). */
export function badgeRoles(roles: readonly ProfileRole[], n = 2): ProfileRole[] {
  return sortProfileRoles(roles.filter((r) => !r.inherited)).slice(0, n);
}

// ── compact card: buttons ───────────────────────────────────────────────────

export type MoreItem = "mention" | "copyId" | "copyLink" | "editProfile";

export interface CompactContext {
  isSelf: boolean;
  isBot: boolean;
  isCopilot: boolean;
  canMention: boolean;
  /** The server said the viewer may moderate this person (and the surface has a moderator view). */
  canModerate: boolean;
  /** The page can send a DM (the composer field exists only then). */
  canSendDm: boolean;
  /** The profile link has somewhere to land (the rooms page). */
  canLink: boolean;
}

/** Round buttons of the banner: moderator view (only for moderators) and "More". The copilot has neither. */
export function bannerButtons(ctx: CompactContext): Array<"moderate" | "more"> {
  if (ctx.isCopilot) return [];
  const out: Array<"moderate" | "more"> = [];
  if (ctx.canModerate && !ctx.isSelf) out.push("moderate");
  out.push("more");
  return out;
}

/** Items of the "More" menu. Large buttons are gone: mute, roles and kick live in the moderator view. */
export function moreItems(ctx: CompactContext): MoreItem[] {
  if (ctx.isCopilot) return [];
  const out: MoreItem[] = [];
  if (ctx.canMention && !ctx.isSelf) out.push("mention");
  out.push("copyId");
  if (ctx.canLink) out.push("copyLink");
  if (ctx.isSelf) out.push("editProfile");
  return out;
}

/** The message field is for other humans only: not your own card, not the AI copilot, and bots only when a DM with them exists. */
export function showDmField(ctx: Pick<CompactContext, "isSelf" | "isBot" | "isCopilot" | "canSendDm">, botDmSupported = false): boolean {
  if (!ctx.canSendDm || ctx.isSelf || ctx.isCopilot) return false;
  return !ctx.isBot || botDmSupported;
}

/** Enter sends, Shift+Enter is a new line, and nothing is sent while an IME composition is open or the text is blank. */
export function dmKeyAction(e: { key: string; shiftKey: boolean; isComposing?: boolean }, text: string): "send" | "newline" | "none" {
  if (e.key !== "Enter" || e.isComposing) return "none";
  if (e.shiftKey) return "newline";
  return text.trim() ? "send" : "none";
}

/** Link that opens the rooms page with this person's card. */
export function profileLink(origin: string, roomId: string, userId: string): string {
  return `${origin.replace(/\/$/, "")}/rooms/${encodeURIComponent(roomId)}?profile=${encodeURIComponent(userId)}`;
}

// ── moderator view ──────────────────────────────────────────────────────────

export type ModerationAction = "mute" | "unmute" | "roles" | "groups" | "kick" | "copyId";

/** Row of actions of the moderator view, from the server's caps. Order: least to most destructive, Copy ID last. */
export function moderationActions(caps: Pick<ProfileViewerCaps, "canMute" | "canAssignRoles" | "canManageGroups" | "canKick">, muted: boolean, isBot: boolean): ModerationAction[] {
  const out: ModerationAction[] = [];
  if (caps.canMute) out.push(muted ? "unmute" : "mute");
  if (caps.canAssignRoles) out.push("roles");
  if (caps.canManageGroups && !isBot) out.push("groups");
  if (caps.canKick) out.push("kick");
  out.push("copyId");
  return out;
}

export const DESTRUCTIVE: ReadonlySet<ModerationAction> = new Set<ModerationAction>(["kick"]);

/** "Sin permisos" / "Todos (N)" / the first few names and how many more. */
export function moderationSummary(held: readonly string[], total: number, show = 4): { kind: "none" } | { kind: "all"; count: number } | { kind: "some"; shown: string[]; more: number; count: number } {
  if (held.length === 0) return { kind: "none" };
  if (total > 0 && held.length >= total) return { kind: "all", count: held.length };
  return { kind: "some", shown: held.slice(0, show), more: Math.max(0, held.length - show), count: held.length };
}

/** "1 234" / "10 000+" for a counter. */
export function formatCounter(c: Counter | null | undefined, locale?: string): string {
  if (!c) return "—";
  return `${c.count.toLocaleString(locale)}${c.capped ? "+" : ""}`;
}

export type ActivityRow = "messages" | "links" | "media" | "audit";

/** Rows of "Team activity": audit only when the server sent it (the viewer reads the audit log). */
export function activityRows(a: MemberModeration["activity"]): ActivityRow[] {
  return a.audit ? ["messages", "links", "media", "audit"] : ["messages", "links", "media"];
}

/** Operator chips the search panel opens with for an activity row (media: files; images are a separate `has:` kind). */
export function searchChipsFor(row: Exclude<ActivityRow, "audit">, authorName: string): Array<{ key: string; value: string }> {
  const from = { key: "from", value: authorName };
  if (row === "links") return [from, { key: "has", value: "link" }];
  if (row === "media") return [from, { key: "has", value: "file" }];
  return [from];
}

/** The whole moderator view needs the server's say-so. */
export const canOpenModeration = (profile: Pick<MemberProfile, "viewer"> | null | undefined): boolean => Boolean(profile?.viewer.canModerate && !profile.viewer.isSelf);
