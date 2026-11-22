"use client";

/**
 * Discord-style profile card of a team member. It opens from the members panel, the author of a message, an @mention and the
 * "X used /cmd" line, anchored to what was pressed (a bottom sheet under 640px). What the caller already knows paints at once;
 * the rest (`GET /teams/:id/members/:userId/profile`) fills in behind a skeleton. Rules of what to show live in lib/rooms/user-profile.ts.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Bot, Check, Clock, Copy, Crown, Gavel, Loader2, MessageSquare, Pencil, ShieldCheck, Users, Volume2, VolumeX, X, XCircle } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { RoleChip } from "@/components/roles/ui";
import { invalidateMemberProfile, useMemberProfile } from "@/hooks/use-member-profile";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { fallbackRoomCatalog, groupRoomKeys, type KeyTextResolver, type RoomKeyInfo } from "@/lib/rooms/permission-catalog";
import {
  SHEET_MAX_WIDTH, bannerStyle, cardPosition, formatLocalTime, formatMemberSince, groupProfileRoles, muteState, profileActions, profileColor, profileSections,
  profileTabs, safeHex, type AnchorRect, type KnownProfile, type MemberProfile, type Presence, type ProfileAction, type ProfileTab,
} from "@/lib/rooms/user-profile";
import { toast } from "@/lib/toast";
import { ProfileGroupsDialog, ProfileKickDialog, ProfileRolesDialog } from "./UserProfileDialogs";

/** The id the app uses for the built-in AI copilot "user". */
export const COPILOT_USER_ID = "000";
const CARD_WIDTH = 340;

export interface ProfileCardActions {
  /** Open (or create) the direct message with the person. Omit where it makes no sense. */
  onMessage?: (userId: string) => void;
  /** Insert an @mention of the person in the composer. Omit where there is no composer. */
  onMention?: (target: { userId: string; displayName: string }) => void;
  /** Opens the room's mute dialog / lifts the mute. Omit where moderation is not offered. */
  onMute?: (target: { userId: string; displayName: string }) => void;
  onUnmute?: (userId: string) => void | Promise<void>;
  onOpenCopilot?: () => void;
  /** A role, group or expulsion changed: refresh the lists behind the card. */
  onChanged?: () => void;
}

export interface UserProfileCardProps {
  teamId: string;
  userId: string;
  roomId?: string | null;
  anchor: AnchorRect;
  known?: KnownProfile;
  presence?: Presence | null;
  actions?: ProfileCardActions;
  onClose: () => void;
}

type TFn = (key: string, params?: Record<string, string | number>) => string;
type Dlg = "roles" | "groups" | "kick" | null;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(max-width: ${SHEET_MAX_WIDTH}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Solid status dot (never translucent): online, in a call, offline. */
function PresenceDot({ presence, label, size = "md" }: { presence: Presence; label: string; size?: "md" | "sm" }) {
  const tone = presence === "in-call" ? "bg-sky-500" : presence === "online" ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500";
  return <span role="img" aria-label={label} className={`absolute rounded-full border-[3px] border-card ${tone} ${size === "md" ? "-bottom-0.5 -right-0.5 h-[18px] w-[18px]" : "-bottom-0.5 -right-0.5 h-3 w-3"}`} />;
}

const BotBadge = ({ label }: { label: string }) => (
  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-500/15 px-1 text-[10px] font-bold uppercase tracking-tight text-violet-700 dark:text-violet-300">
    <Bot className="h-2.5 w-2.5" aria-hidden />{label}
  </span>
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
      <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {["w-full", "w-4/5", "w-2/3"].map((w) => <div key={w} className={`h-3 ${w} animate-pulse rounded bg-muted motion-reduce:animate-none`} />)}
    </div>
  );
}

function PermissionsTab({ profile, t }: { profile: MemberProfile; t: TFn }) {
  const perms = profile.room?.permissions;
  const groups = useMemo(() => {
    const resolve: KeyTextResolver = {
      name: (k: RoomKeyInfo) => { const p = `perm.keys.${k.key}`; const v = t(p); return v === p ? k.key : v; },
      desc: () => "",
      group: (id) => { const p = `perm.keyGroups.${id}`; const v = t(p); return v === p ? id : v; },
    };
    const catalog = fallbackRoomCatalog();
    const view = groupRoomKeys(catalog, resolve);
    // Keys the server reported that the fixed list does not know still show (as allowed), never silently dropped.
    const known = new Set(catalog.universe);
    const extra = (perms?.allowed ?? []).filter((k) => !known.has(k));
    return { view, resolve, extra };
  }, [t, perms]);
  if (!perms) return null;
  const allowed = new Set(perms.allowed);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("profile.perm.intro", { name: profile.displayName })}</p>
      <p className="text-xs font-semibold">{t("profile.perm.summary", { allowed: perms.allowed.length, denied: perms.denied.length })}</p>
      {!perms.canSee && <p role="note" className="rounded-lg border border-border/50 bg-muted/60 px-2.5 py-1.5 text-xs">{t("profile.perm.cannotSee")}</p>}
      {groups.view.map((g) => (
        <Section key={g.id} title={g.label}>
          <ul className="space-y-0.5">
            {g.keys.map((k) => {
              const ok = allowed.has(k.key);
              return (
                <li key={k.key} className="flex items-center gap-2 text-xs">
                  {ok ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className={ok ? "" : "text-muted-foreground"}>{groups.resolve.name(k)}</span>
                  <span className="sr-only">{ok ? t("profile.perm.allowed") : t("profile.perm.denied")}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
      {groups.extra.length > 0 && (
        <Section title={t("perm.keyGroups.other")}>
          <ul className="space-y-0.5">
            {groups.extra.map((k) => (
              <li key={k} className="flex items-center gap-2 text-xs"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /><span>{k}</span><span className="sr-only">{t("profile.perm.allowed")}</span></li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function UserProfileCard({ teamId, userId, roomId, anchor, known, presence, actions = {}, onClose }: UserProfileCardProps) {
  const t = useTranslations("rooms");
  const { locale } = useI18n();
  const { accessToken, user } = useSession();
  const isCopilot = userId === COPILOT_USER_ID;
  const { profile, error, reload } = useMemberProfile(teamId, userId, roomId, accessToken, !isCopilot);
  const narrow = useNarrow();
  const titleId = useId();
  const tabsId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [tab, setTab] = useState<ProfileTab>("profile");
  const [dialog, setDialog] = useState<Dlg>(null);
  const [busy, setBusy] = useState(false);

  const displayName = profile?.displayName ?? known?.displayName ?? "";
  const isBot = profile?.isBot ?? known?.isBot ?? isCopilot;
  const isSelf = profile?.viewer.isSelf ?? (Boolean(user?.id) && user?.id === userId);
  const color = profile ? profileColor(profile.roles) : safeHex(known?.color);
  const avatarUrl = profile?.avatarUrl ?? known?.avatarUrl ?? null;
  const email = profile?.email ?? known?.email ?? undefined;
  const tabs = profileTabs(profile);
  const activeTab: ProfileTab = tabs.includes(tab) ? tab : "profile";
  const now = Date.now();
  const mute = profile ? muteState(profile.mute, now) : null;
  const presenceKind: Presence | null = isBot ? null : presence ?? null;

  // Desktop: measured once the card exists; follows resize.
  useLayoutEffect(() => {
    if (narrow) return;
    const place = () => {
      const h = cardRef.current?.getBoundingClientRect().height ?? 420;
      const next = cardPosition(anchor, { width: CARD_WIDTH, height: h }, { width: window.innerWidth, height: window.innerHeight });
      setPos({ left: next.left, top: next.top });
    };
    place();
    window.addEventListener("resize", place);
    const ro = typeof ResizeObserver === "function" && cardRef.current ? new ResizeObserver(place) : null;
    if (ro && cardRef.current) ro.observe(cardRef.current);
    return () => { window.removeEventListener("resize", place); ro?.disconnect(); };
  }, [anchor, narrow]);

  // Esc closes; a press outside closes the popover (the sheet has its own backdrop). Both pause while a dialog is open.
  useEffect(() => {
    if (dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onDown = (e: MouseEvent) => { if (!narrow && cardRef.current && !cardRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("mousedown", onDown, true); };
  }, [dialog, narrow, onClose]);

  useEffect(() => { cardRef.current?.focus(); }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !cardRef.current) return;
    const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = tabs.indexOf(activeTab);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    setTab(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  };

  const changed = useCallback(() => {
    invalidateMemberProfile(teamId, userId);
    setDialog(null);
    reload();
    actions.onChanged?.();
  }, [teamId, userId, reload, actions]);

  const copyId = async () => {
    try { await navigator.clipboard.writeText(userId); toast(t("profile.actions.copied"), "success"); } catch { /* clipboard blocked: nothing to do */ }
  };

  const unmute = async () => {
    if (!actions.onUnmute) return;
    setBusy(true);
    try { await actions.onUnmute(userId); invalidateMemberProfile(teamId, userId); reload(); } finally { setBusy(false); }
  };

  const available = profileActions({
    isSelf,
    isBot,
    canDm: Boolean(actions.onMessage),
    canMention: Boolean(actions.onMention),
    muted: Boolean(mute),
    viewer: profile ? { ...profile.viewer, canMute: profile.viewer.canMute && Boolean(actions.onMute && (mute ? actions.onUnmute : true)) } : null,
  });

  const run = (a: ProfileAction) => {
    switch (a) {
      case "message": actions.onMessage?.(userId); onClose(); break;
      case "mention": actions.onMention?.({ userId, displayName }); onClose(); break;
      case "copyId": void copyId(); break;
      case "editProfile": window.dispatchEvent(new CustomEvent("killio:open-profile-settings")); onClose(); break;
      case "mute": actions.onMute?.({ userId, displayName }); onClose(); break;
      case "unmute": void unmute(); break;
      case "roles": setDialog("roles"); break;
      case "groups": setDialog("groups"); break;
      case "kick": setDialog("kick"); break;
    }
  };

  const ICON: Record<ProfileAction, React.ReactNode> = {
    message: <MessageSquare className="h-3.5 w-3.5" aria-hidden />,
    mention: <AtSign className="h-3.5 w-3.5" aria-hidden />,
    copyId: <Copy className="h-3.5 w-3.5" aria-hidden />,
    editProfile: <Pencil className="h-3.5 w-3.5" aria-hidden />,
    mute: <VolumeX className="h-3.5 w-3.5" aria-hidden />,
    unmute: <Volume2 className="h-3.5 w-3.5" aria-hidden />,
    roles: <ShieldCheck className="h-3.5 w-3.5" aria-hidden />,
    groups: <Users className="h-3.5 w-3.5" aria-hidden />,
    kick: <Gavel className="h-3.5 w-3.5" aria-hidden />,
  };
  const primary: ProfileAction[] = available.filter((a) => a === "message" || a === "editProfile" || a === "mention" || a === "copyId");
  const manage = available.filter((a) => !primary.includes(a));
  const btnBase = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 min-h-9";

  const sections = profile ? profileSections(profile) : [];
  const roles = profile ? groupProfileRoles(profile.roles) : null;
  const localTime = profile ? formatLocalTime(profile.timezone, new Date(now), locale) : "";
  const presenceLabel = presenceKind === "in-call" ? t("profile.presence.inCall") : presenceKind === "online" ? t("profile.presence.online") : t("profile.presence.offline");

  const body = (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal={narrow ? true : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="user-profile-card"
      onKeyDown={onKeyDown}
      style={narrow ? undefined : { left: pos?.left ?? 0, top: pos?.top ?? 0, width: CARD_WIDTH, visibility: pos && !dialog ? "visible" : "hidden" }}
      className={
        narrow
          ? `fixed inset-x-0 bottom-0 z-[320] flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-border/50 bg-card text-foreground shadow-xl outline-none motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200 ${dialog ? "invisible" : ""}`
          : "fixed z-[320] flex max-h-[min(80vh,640px)] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card text-foreground shadow-lg outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      }
    >
      {/* Banner */}
      <div className="relative h-16 shrink-0" style={bannerStyle(color)}>
        {narrow && <span className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-card" aria-hidden />}
        <button type="button" onClick={onClose} aria-label={t("profile.close")} className="absolute right-2 top-2 rounded-md border border-border/50 bg-card p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {/* Avatar + names */}
        <div className="-mt-8 flex items-end gap-3">
          <div className="relative shrink-0">
            {isCopilot ? (
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-card bg-violet-600 text-white"><Bot className="h-8 w-8" aria-hidden /></span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getUserAvatarUrl(avatarUrl, email, 128)} alt="" className="h-16 w-16 rounded-full border-4 border-card bg-muted object-cover" />
            )}
            {presenceKind && <PresenceDot presence={presenceKind} label={presenceLabel} />}
          </div>
        </div>
        <div className="mt-2 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 id={titleId} className="truncate text-base font-bold leading-tight" style={color ? { color } : undefined}>
              {isCopilot ? t("ai.copilotName") : displayName || <span className="inline-block h-4 w-28 animate-pulse rounded bg-muted align-middle motion-reduce:animate-none" aria-label={t("profile.loading")} />}
            </h2>
            {isBot && <BotBadge label={t("ai.bot")} />}
            {profile?.isOwner && <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300"><Crown className="h-2.5 w-2.5" aria-hidden />{t("profile.owner")}</span>}
            {isSelf && <span className="text-[11px] text-muted-foreground">{t("profile.you")}</span>}
          </div>
          {profile && profile.name !== profile.displayName && <p className="truncate text-xs text-muted-foreground">{profile.name}</p>}
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          {presenceKind && <p className="mt-0.5 text-[11px] text-muted-foreground">{presenceLabel}</p>}
        </div>

        {/* Actions */}
        {!isCopilot && available.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {primary.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {primary.map((a, i) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => run(a)}
                    className={`${btnBase} ${i === 0 && (a === "message" || a === "editProfile") ? "flex-1 bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border/60 bg-background hover:bg-muted"}`}
                  >
                    {ICON[a]}{t(`profile.actions.${a}`)}
                  </button>
                ))}
              </div>
            )}
            {manage.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("profile.actions.more")}>
                {manage.map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={busy}
                    onClick={() => run(a)}
                    className={`${btnBase} border border-border/60 bg-background hover:bg-muted ${a === "kick" ? "text-destructive" : ""}`}
                  >
                    {busy && a === "unmute" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : ICON[a]}{t(`profile.actions.${a}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isCopilot && (
          <div className="mt-3 space-y-2">
            <p className="text-xs leading-relaxed text-muted-foreground">{t("profile.copilot.about")}</p>
            {actions.onOpenCopilot && (
              <button type="button" onClick={() => { actions.onOpenCopilot?.(); onClose(); }} className={`${btnBase} w-full bg-violet-600 text-white hover:bg-violet-700`}>
                <Bot className="h-3.5 w-3.5" aria-hidden />{t("profile.copilot.ask")}
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        {!isCopilot && tabs.length > 1 && (
          <div role="tablist" aria-label={t("profile.tabs.label")} onKeyDown={onTabKey} className="mt-3 flex gap-1 border-b border-border/50">
            {tabs.map((id) => (
              <button
                key={id}
                id={`${tabsId}-${id}`}
                role="tab"
                type="button"
                aria-selected={activeTab === id}
                aria-controls={`${tabsId}-panel`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t(`profile.tabs.${id}`)}
              </button>
            ))}
          </div>
        )}

        {!isCopilot && (
          <div id={`${tabsId}-panel`} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `${tabsId}-${activeTab}` : undefined} className="mt-3 space-y-2">
            {activeTab === "permissions" && profile ? (
              <PermissionsTab profile={profile} t={t} />
            ) : !profile && !error ? (
              <Skeleton label={t("profile.loading")} />
            ) : error && !profile ? (
              <div role="alert" className="rounded-xl border border-border/50 p-3 text-center text-xs">
                <p className="mb-2 text-muted-foreground">{t("profile.loadError")}</p>
                <button type="button" onClick={reload} className="rounded-lg border border-border px-3 py-1 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("profile.retry")}</button>
              </div>
            ) : profile ? (
              <>
                {mute && (
                  <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
                    <div>
                      <p className="font-semibold">{mute.kind === "forever" ? t("profile.mutedForever") : t("profile.mutedUntil", { date: new Date(mute.until).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}</p>
                      {profile.mute?.reason && <p className="text-muted-foreground">{t("profile.mutedReason", { reason: profile.mute.reason })}</p>}
                    </div>
                  </div>
                )}
                {sections.map((s) => {
                  switch (s) {
                    case "about":
                      return (
                        <Section key={s} title={t("profile.about")}>
                          {profile.bio && <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{profile.bio}</p>}
                          {localTime && <p className="mt-1 text-[11px] text-muted-foreground">{t("profile.localTime", { time: localTime })}</p>}
                        </Section>
                      );
                    case "bot":
                      return (
                        <Section key={s} title={t("profile.botInfo")}>
                          <p className="text-xs leading-relaxed">{profile.bot?.description || <span className="text-muted-foreground">{t("profile.noDescription")}</span>}</p>
                          {profile.bot && (
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-full ${profile.bot.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />{profile.bot.isActive ? t("profile.botActive") : t("profile.botPaused")}</span>
                              {profile.bot.createdByName && <span>{t("profile.createdBy", { name: profile.bot.createdByName })}</span>}
                            </p>
                          )}
                        </Section>
                      );
                    case "commands":
                      return (
                        <Section key={s} title={t("profile.commands")}>
                          <ul className="space-y-1.5">
                            {profile.bot!.commands.map((c) => (
                              <li key={c.name} className="text-xs">
                                <code className="font-mono font-semibold">/{c.name}</code>
                                {c.description && <span className="text-muted-foreground"> — {c.description}</span>}
                                {c.usage && <div className="font-mono text-[11px] text-muted-foreground">{c.usage}</div>}
                              </li>
                            ))}
                          </ul>
                        </Section>
                      );
                    case "roles":
                      return (
                        <Section key={s} title={t("profile.roles")}>
                          <div className="flex flex-wrap gap-1">
                            {roles!.direct.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} />)}
                          </div>
                          {roles!.inherited.length > 0 && (
                            <div className="mt-1.5">
                              <p className="mb-1 text-[10px] text-muted-foreground">{t("profile.rolesInherited")}</p>
                              <div className="flex flex-wrap gap-1">{roles!.inherited.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} muted />)}</div>
                            </div>
                          )}
                        </Section>
                      );
                    case "groups":
                      return (
                        <Section key={s} title={t("profile.groups")}>
                          <div className="flex flex-wrap gap-1">{profile.groups.map((g) => <RoleChip key={g.id} name={g.name} color={g.color} />)}</div>
                        </Section>
                      );
                    case "dates":
                      return (
                        <Section key={s} title={t("profile.memberSince")}>
                          <dl className="space-y-0.5 text-xs">
                            {profile.joinedTeamAt && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("profile.memberSince")}</dt><dd className="font-medium">{formatMemberSince(profile.joinedTeamAt, locale)}</dd></div>}
                            {profile.room?.joinedAt && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("profile.inRoomSince")}</dt><dd className="font-medium">{formatMemberSince(profile.room.joinedAt, locale)}</dd></div>}
                          </dl>
                        </Section>
                      );
                    default:
                      return null;
                  }
                })}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(
    <>
      {narrow && <div className={`fixed inset-0 z-[319] bg-background/70 backdrop-blur-sm ${dialog ? "hidden" : ""}`} aria-hidden onClick={onClose} />}
      {body}
      {profile && dialog === "roles" && <ProfileRolesDialog teamId={teamId} profile={profile} onClose={() => setDialog(null)} onDone={changed} />}
      {profile && dialog === "groups" && <ProfileGroupsDialog teamId={teamId} profile={profile} onClose={() => setDialog(null)} onDone={changed} />}
      {profile && dialog === "kick" && <ProfileKickDialog teamId={teamId} profile={profile} onClose={() => setDialog(null)} onDone={() => { invalidateMemberProfile(teamId); setDialog(null); actions.onChanged?.(); onClose(); }} />}
    </>,
    document.body,
  );
}
