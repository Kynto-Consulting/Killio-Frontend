"use client";

/**
 * Moderator view of a member (the third Discord screenshot): bigger dialog, a row of actions with icons and sections for the team
 * activity (counters), moderator permissions, roles and groups, and the account. Mute, roles, groups and kick live HERE, not in the
 * compact card. Everything it shows comes from `GET /teams/:id/members/:userId/moderation` plus the profile the card already loaded;
 * who may do what is decided by the server (`viewer.*`). A bottom sheet (full height) under 640px.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Copy, Gavel, Link2, MessageSquare, Paperclip, ScrollText, ShieldCheck, Users, Volume2, VolumeX, X } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { RoleChip } from "@/components/roles/ui";
import { invalidateMemberProfile } from "@/hooks/use-member-profile";
import { useMemberModeration } from "@/hooks/use-member-moderation";
import { listAuditLog, type AuditEntry } from "@/lib/api/roles";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { auditActionKey, humanizeKey } from "@/lib/roles/audit";
import { formatMemberSince, groupProfileRoles, muteState, type MemberProfile } from "@/lib/rooms/user-profile";
import {
  DESTRUCTIVE, activityRows, formatCounter, moderationActions, moderationSummary, searchChipsFor, type ActivityRow, type ModerationAction,
} from "@/lib/rooms/user-profile-compact";
import { toast } from "@/lib/toast";
import { Section, Skeleton, trapTab, useNarrow } from "./profile-shared";
import { ProfileGroupsDialog, ProfileKickDialog, ProfileRolesDialog } from "./UserProfileDialogs";
import { ChannelPermissions } from "./UserProfilePermissions";

export interface ModerationHandlers {
  /** Opens the room's mute dialog for the person (the page's MuteMemberModal). */
  onMute?: (target: { userId: string; displayName: string }) => void;
  onUnmute?: (userId: string) => void | Promise<void>;
  /** Opens the advanced search with these operators (team scope). */
  onSearch?: (chips: Array<{ key: string; value: string }>) => void;
  /** A role, group or expulsion changed. */
  onChanged?: () => void;
}

interface Props extends ModerationHandlers {
  teamId: string;
  roomId?: string | null;
  profile: MemberProfile;
  onReload: () => void;
  onClose: () => void;
  /** Closes the card too (used by actions that hand over to a page dialog). */
  onCloseAll: () => void;
}

const ROW_ICON: Record<ActivityRow, React.ReactNode> = {
  messages: <MessageSquare className="h-4 w-4" aria-hidden />,
  links: <Link2 className="h-4 w-4" aria-hidden />,
  media: <Paperclip className="h-4 w-4" aria-hidden />,
  audit: <ScrollText className="h-4 w-4" aria-hidden />,
};

function AuditList({ teamId, userId }: { teamId: string; userId: string }) {
  const t = useTranslations("rooms");
  const tr = useTranslations("roles");
  const { locale } = useI18n();
  const { accessToken } = useSession();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listAuditLog(teamId, accessToken, { userId, limit: 10 })
      .then((p) => { if (!cancelled) setEntries(p.entries); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [teamId, userId, accessToken]);
  if (failed) return <p role="alert" className="px-1 pt-1 text-xs text-destructive">{t("profile.mod.auditLoadError")}</p>;
  if (!entries) return <div className="pt-2"><Skeleton label={t("profile.loading")} lines={2} /></div>;
  if (entries.length === 0) return <p className="px-1 pt-1 text-xs text-muted-foreground">{t("profile.mod.auditEmpty")}</p>;
  return (
    <ul className="mt-1.5 divide-y divide-border/50">
      {entries.map((e) => {
        const key = `audit.action.${auditActionKey(e.action)}`;
        const label = tr(key) === key ? humanizeKey(e.action) : tr(key);
        return (
          <li key={e.id} className="flex items-baseline justify-between gap-2 py-1.5 text-xs">
            <span className="min-w-0"><span className="font-medium">{label}</span>{e.actorName && <span className="text-muted-foreground"> · {t("profile.mod.auditBy", { name: e.actorName })}</span>}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{formatMemberSince(e.createdAt, locale)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function UserModerationView({ teamId, roomId, profile, onReload, onClose, onCloseAll, onMute, onUnmute, onSearch, onChanged }: Props) {
  const t = useTranslations("rooms");
  const tr = useTranslations("roles");
  const { locale } = useI18n();
  const { accessToken } = useSession();
  const narrow = useNarrow();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const { data, error, loading, reload } = useMemberModeration(teamId, profile.userId, roomId, accessToken, true);
  const [dialog, setDialog] = useState<"roles" | "groups" | "kick" | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const name = profile.displayName;
  const caps = data?.viewer ?? profile.viewer;
  const mute = muteState(data?.mute ?? profile.mute, Date.now());
  const actionList = moderationActions({ ...caps, canMute: caps.canMute && Boolean(onMute && (mute ? onUnmute : true)) }, Boolean(mute), profile.isBot);
  const roles = groupProfileRoles(profile.roles);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    if (dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dialog, onClose]);

  const changed = useCallback(() => {
    invalidateMemberProfile(teamId, profile.userId);
    setDialog(null);
    onReload();
    reload();
    onChanged?.();
  }, [teamId, profile.userId, onReload, reload, onChanged]);

  const run = async (a: ModerationAction) => {
    switch (a) {
      case "mute": onMute?.({ userId: profile.userId, displayName: name }); onCloseAll(); break;
      case "unmute":
        if (!onUnmute) return;
        setBusy(true);
        try { await onUnmute(profile.userId); invalidateMemberProfile(teamId, profile.userId); onReload(); reload(); } finally { setBusy(false); }
        break;
      case "roles": setDialog("roles"); break;
      case "groups": setDialog("groups"); break;
      case "kick": setDialog("kick"); break;
      case "copyId":
        try { await navigator.clipboard.writeText(profile.userId); toast(t("profile.actions.copied"), "success"); } catch { /* clipboard blocked */ }
        break;
    }
  };

  const ICON: Record<ModerationAction, React.ReactNode> = {
    mute: <VolumeX className="h-4 w-4" aria-hidden />, unmute: <Volume2 className="h-4 w-4" aria-hidden />, roles: <ShieldCheck className="h-4 w-4" aria-hidden />,
    groups: <Users className="h-4 w-4" aria-hidden />, kick: <Gavel className="h-4 w-4" aria-hidden />, copyId: <Copy className="h-4 w-4" aria-hidden />,
  };

  const summary = data ? moderationSummary(data.moderator.held, data.moderator.total) : null;
  const keyLabel = (k: string) => { const p = `perm.${k.replace(/\./g, "_")}.name`; const v = tr(p); return v === p ? k : v; };
  const date = (iso: string | null) => formatMemberSince(iso, locale) || "—";

  const openRow = (row: ActivityRow) => {
    if (row === "audit") { setAuditOpen((v) => !v); return; }
    if (!onSearch) return;
    onSearch(searchChipsFor(row, name));
    onCloseAll();
  };

  const panel = (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="user-moderation-view"
      onKeyDown={(e) => trapTab(e, ref.current)}
      className={`fixed z-[341] flex flex-col overflow-hidden border border-border/50 bg-popover text-popover-foreground shadow-xl outline-none ${dialog ? "invisible" : ""} ${
        narrow
          ? "inset-x-0 bottom-0 top-8 rounded-t-2xl border-b-0 motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200"
          : "left-1/2 top-1/2 max-h-[85vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={getUserAvatarUrl(profile.avatarUrl, data?.email ?? profile.email ?? undefined, 80)} alt="" className="h-10 w-10 shrink-0 rounded-full border border-border/50 bg-muted object-cover" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-sm font-bold leading-tight">{t("profile.mod.title")} · {name}</h2>
          {profile.name !== profile.displayName && <p className="truncate text-xs text-muted-foreground">{profile.name}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={t("profile.mod.close")} className="rounded-md border border-border/50 bg-card p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Actions */}
      <div role="group" aria-label={t("profile.mod.actions")} className="flex flex-wrap gap-1.5 border-b border-border/50 px-4 py-2.5">
        {actionList.map((a) => (
          <button
            key={a}
            type="button"
            disabled={busy}
            onClick={() => void run(a)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 ${DESTRUCTIVE.has(a) ? "text-destructive" : ""}`}
          >
            {ICON[a]}{t(`profile.actions.${a}`)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && !data ? (
          <div role="alert" className="rounded-xl border border-border/50 p-3 text-center text-xs text-muted-foreground">
            {error.status === 403 ? t("profile.mod.forbidden") : t("profile.mod.loadError")}
            {error.status !== 403 && <button type="button" onClick={reload} className="ml-2 font-semibold text-primary hover:underline">{t("profile.retry")}</button>}
          </div>
        ) : (
          <>
            <Section title={t("profile.mod.activity")}>
              {loading || !data ? <Skeleton label={t("profile.loading")} lines={4} /> : (
                <ul className="-mx-1">
                  {activityRows(data.activity).map((row) => {
                    const counter = data.activity[row];
                    const clickable = row === "audit" || Boolean(onSearch);
                    const label = t(`profile.mod.${row}`);
                    const inner = (
                      <>
                        <span className="flex items-center gap-2.5 text-xs font-medium">{ROW_ICON[row]}{label}</span>
                        <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">{formatCounter(counter, locale)}{clickable && (row === "audit" ? (auditOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />) : <ChevronRight className="h-3.5 w-3.5" aria-hidden />)}</span>
                      </>
                    );
                    return (
                      <li key={row}>
                        {clickable ? (
                          <button
                            type="button"
                            onClick={() => openRow(row)}
                            aria-expanded={row === "audit" ? auditOpen : undefined}
                            title={row === "audit" ? undefined : t("profile.mod.searchHint")}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >{inner}</button>
                        ) : <div className="flex items-center justify-between gap-2 px-2 py-2">{inner}</div>}
                        {row === "audit" && auditOpen && <div className="px-2 pb-1"><AuditList teamId={teamId} userId={profile.userId} /></div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section title={t("profile.mod.permissions")}>
              {!summary ? <Skeleton label={t("profile.loading")} lines={1} /> : summary.kind === "none" ? (
                <p className="text-xs text-muted-foreground">{t("profile.mod.permNone")}</p>
              ) : summary.kind === "all" ? (
                <p className="text-xs font-medium">{t("profile.mod.permAll", { n: summary.count })}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  {summary.shown.map((k) => <span key={k} className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium">{keyLabel(k)}</span>)}
                  {summary.more > 0 && <span className="text-[11px] text-muted-foreground">{t("profile.mod.permMore", { n: summary.more })}</span>}
                </div>
              )}
            </Section>

            <Section
              title={t("profile.mod.roles")}
              action={actionList.includes("roles") && <button type="button" onClick={() => setDialog("roles")} className="rounded text-[11px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("profile.mod.editRoles")}</button>}
            >
              {profile.roles.length === 0 ? <p className="text-xs text-muted-foreground">{t("profile.mod.rolesEmpty")}</p> : (
                <div className="flex flex-wrap gap-1">
                  {roles.direct.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} />)}
                  {roles.inherited.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} muted />)}
                </div>
              )}
            </Section>

            {(profile.groups.length > 0 || actionList.includes("groups")) && (
              <Section
                title={t("profile.mod.groups")}
                action={actionList.includes("groups") && <button type="button" onClick={() => setDialog("groups")} className="rounded text-[11px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("profile.mod.editGroups")}</button>}
              >
                <div className="flex flex-wrap gap-1">{profile.groups.map((g) => <RoleChip key={g.id} name={g.name} color={g.color} />)}</div>
              </Section>
            )}

            <Section title={t("profile.mod.account")}>
              {loading || !data ? <Skeleton label={t("profile.loading")} lines={3} /> : (
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("profile.mod.created")}</dt><dd className="font-medium">{date(data.account.createdAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("profile.mod.joinedTeam")}</dt><dd className="font-medium">{date(data.account.joinedTeamAt)}</dd></div>
                  {data.account.joinedRoomAt && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("profile.mod.joinedRoom")}</dt><dd className="font-medium">{date(data.account.joinedRoomAt)}</dd></div>}
                  {data.email && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("profile.mod.email")}</dt><dd className="min-w-0 truncate font-medium">{data.email}</dd></div>}
                </dl>
              )}
              {mute && (
                <div role="status" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs">
                  <p className="font-semibold">
                    {t("profile.mod.muted")} {mute.kind === "forever" ? t("profile.mod.mutedForever") : t("profile.mod.mutedUntil", { date: new Date(mute.until).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}
                    {data?.mute?.byName ? ` · ${t("profile.mod.mutedBy", { name: data.mute.byName })}` : ""}
                  </p>
                  {(data?.mute?.reason ?? profile.mute?.reason) && <p className="text-muted-foreground">{t("profile.mod.mutedReason", { reason: (data?.mute?.reason ?? profile.mute?.reason) as string })}</p>}
                </div>
              )}
            </Section>

            {profile.room?.permissions && (
              <Section title={t("profile.mod.channelPerms")}>
                <ChannelPermissions profile={profile} t={t} />
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className={`fixed inset-0 z-[340] bg-background/70 backdrop-blur-sm ${dialog ? "hidden" : ""}`} aria-hidden onClick={onClose} />
      {panel}
      {dialog === "roles" && <ProfileRolesDialog teamId={teamId} profile={profile} onClose={() => setDialog(null)} onDone={changed} />}
      {dialog === "groups" && <ProfileGroupsDialog teamId={teamId} profile={profile} onClose={() => setDialog(null)} onDone={changed} />}
      {dialog === "kick" && <ProfileKickDialog teamId={teamId} profile={profile} onClose={() => setDialog(null)} onDone={() => { invalidateMemberProfile(teamId); onChanged?.(); onCloseAll(); }} />}
    </>,
    document.body,
  );
}
