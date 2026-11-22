"use client";

/**
 * Compact, Discord-style profile card. It opens from the members panel, the author of a message, an @mention and the "X used /cmd"
 * line, anchored to what was pressed (a bottom sheet under 640px). Banner with two round buttons (moderator view for moderators,
 * "More"), avatar with a solid presence dot, name, short badges, a clamped biography, roles on one or two lines (+N) and a field to
 * send a direct message. Mute, roles, groups and kick live in the moderator view (UserModerationView).
 * What the caller already knows paints at once; the rest (`GET /teams/:id/members/:userId/profile`) fills in behind a skeleton.
 * Rules of what to show live in lib/rooms/user-profile*.ts.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Bot, Clock, Copy, Crown, Link2, Lock, MoreHorizontal, Pencil, ShieldAlert, X } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { RoleChip } from "@/components/roles/ui";
import { invalidateMemberProfile, useMemberProfile } from "@/hooks/use-member-profile";
import { getUserAvatarUrl } from "@/lib/gravatar";
import {
  bannerStyle, cardPosition, formatLocalTime, formatMemberSince, muteState, profileColor, safeHex,
  type AnchorRect, type KnownProfile, type Presence,
} from "@/lib/rooms/user-profile";
import {
  badgeRoles, bannerButtons, bioPreview, canOpenModeration, moreItems, profileLink, roleOverflow, showDmField, type CompactContext, type MoreItem,
} from "@/lib/rooms/user-profile-compact";
import { botProfileFacts } from "@/lib/bots/locks";
import { toast } from "@/lib/toast";
import { BotBadge, PresenceDot, Section, Skeleton, Tip, trapTab, useNarrow } from "./profile-shared";
import { UserModerationView, type ModerationHandlers } from "./UserModerationView";
import { UserProfileDm } from "./UserProfileDm";

/** The id the app uses for the built-in AI copilot "user". */
export const COPILOT_USER_ID = "000";
const CARD_WIDTH = 340;

export interface ProfileCardActions extends Pick<ModerationHandlers, "onMute" | "onUnmute" | "onChanged"> {
  /** Open (or create) the direct message with the person; it is also what "Open conversation" calls. Omit where DMs make no sense. */
  onMessage?: (userId: string) => void;
  /** Insert an @mention of the person in the composer. Omit where there is no composer. */
  onMention?: (target: { userId: string; displayName: string }) => void;
  /** Open the advanced search of the page with these operators (team scope). */
  onSearch?: (chips: Array<{ key: string; value: string }>) => void;
  onOpenCopilot?: () => void;
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

export function UserProfileCard({ teamId, userId, roomId, anchor, known, presence, actions = {}, onClose }: UserProfileCardProps) {
  const t = useTranslations("rooms");
  const { locale } = useI18n();
  const { accessToken, user } = useSession();
  const isCopilot = userId === COPILOT_USER_ID;
  const { profile, error, reload } = useMemberProfile(teamId, userId, roomId, accessToken, !isCopilot);
  const narrow = useNarrow();
  const titleId = useId();
  const menuId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [moderation, setModeration] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);

  const displayName = profile?.displayName ?? known?.displayName ?? "";
  const isBot = profile?.isBot ?? known?.isBot ?? isCopilot;
  const isSelf = profile?.viewer.isSelf ?? (Boolean(user?.id) && user?.id === userId);
  const color = profile ? profileColor(profile.roles) : safeHex(known?.color);
  const avatarUrl = profile?.avatarUrl ?? known?.avatarUrl ?? null;
  const email = profile?.email ?? known?.email ?? undefined;
  const now = Date.now();
  const mute = profile ? muteState(profile.mute, now) : null;
  const presenceKind: Presence | null = isBot ? null : presence ?? null;
  const presenceLabel = presenceKind === "in-call" ? t("profile.presence.inCall") : presenceKind === "online" ? t("profile.presence.online") : t("profile.presence.offline");

  const ctx: CompactContext = {
    isSelf, isBot, isCopilot,
    canMention: Boolean(actions.onMention),
    canModerate: canOpenModeration(profile),
    canSendDm: Boolean(actions.onMessage),
    canLink: Boolean(roomId),
  };
  const buttons = bannerButtons(ctx);
  const menu = moreItems(ctx);
  const dmField = showDmField(ctx) && Boolean(displayName);

  // Desktop: measured once the card exists; follows resize and content growth.
  useLayoutEffect(() => {
    if (narrow) return;
    const place = () => {
      const h = cardRef.current?.getBoundingClientRect().height ?? 360;
      const next = cardPosition(anchor, { width: CARD_WIDTH, height: h }, { width: window.innerWidth, height: window.innerHeight });
      setPos({ left: next.left, top: next.top });
    };
    place();
    window.addEventListener("resize", place);
    const ro = typeof ResizeObserver === "function" && cardRef.current ? new ResizeObserver(place) : null;
    if (ro && cardRef.current) ro.observe(cardRef.current);
    return () => { window.removeEventListener("resize", place); ro?.disconnect(); };
  }, [anchor, narrow]);

  // Esc closes the menu first, then the card; a press outside closes the popover (the sheet has its own backdrop). All pause while the moderator view is open.
  useEffect(() => {
    if (moderation) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (menuOpen) { setMenuOpen(false); moreRef.current?.focus(); } else onClose();
        return;
      }
      // "M" opens the moderator view (not while typing).
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);
      if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && ctx.canModerate && !isSelf) { e.preventDefault(); setModeration(true); }
    };
    const onDown = (e: MouseEvent) => { if (!narrow && cardRef.current && !cardRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("mousedown", onDown, true); };
  }, [moderation, menuOpen, narrow, onClose, ctx.canModerate, isSelf]);

  useEffect(() => { cardRef.current?.focus(); }, []);

  const copy = async (text: string, okKey: string) => {
    try { await navigator.clipboard.writeText(text); toast(t(okKey), "success"); } catch { /* clipboard blocked: nothing to do */ }
  };

  const onMore = (item: MoreItem) => {
    setMenuOpen(false);
    switch (item) {
      case "mention": actions.onMention?.({ userId, displayName }); onClose(); break;
      case "copyId": void copy(userId, "profile.actions.copied"); break;
      case "copyLink": if (roomId) void copy(profileLink(window.location.origin, roomId, userId), "profile.linkCopied"); break;
      case "editProfile": window.dispatchEvent(new CustomEvent("killio:open-profile-settings")); onClose(); break;
    }
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]"));
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  };

  const bio = useMemo(() => bioPreview(profile?.bio), [profile?.bio]);
  const badges = useMemo(() => badgeRoles(profile?.roles ?? [], 2), [profile?.roles]);
  const roleList = useMemo(() => roleOverflow(profile?.roles ?? [], 4, rolesOpen), [profile?.roles, rolesOpen]);
  const localTime = profile ? formatLocalTime(profile.timezone, new Date(now), locale) : "";

  const roundBtn = "group/tip relative";
  const roundBtnCls = "flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-card text-foreground/80 shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
  const moderateTip = `${menuId}-mod`;
  const moreTip = `${menuId}-more`;

  const onChanged = useCallback(() => { invalidateMemberProfile(teamId, userId); reload(); actions.onChanged?.(); }, [teamId, userId, reload, actions]);

  const body = (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal={narrow ? true : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="user-profile-card"
      onKeyDown={(e) => trapTab(e, cardRef.current)}
      style={narrow ? undefined : { left: pos?.left ?? 0, top: pos?.top ?? 0, width: CARD_WIDTH, visibility: pos && !moderation ? "visible" : "hidden" }}
      className={
        narrow
          ? `fixed inset-x-0 bottom-0 z-[320] flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-border/50 bg-card text-foreground shadow-xl outline-none motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200 ${moderation ? "invisible" : ""}`
          : "fixed z-[320] flex max-h-[min(80vh,620px)] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card text-foreground shadow-lg outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      }
    >
      {/* Banner: round buttons on the right, avatar overlapping on the left (child of the banner so the scroll area cannot clip it) */}
      <div className="relative h-16 shrink-0" style={bannerStyle(color)}>
        {narrow && <span className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-card" aria-hidden />}
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
          {buttons.includes("moderate") && (
            <div className={roundBtn}>
              <button type="button" onClick={() => setModeration(true)} aria-label={t("profile.moderate")} aria-describedby={moderateTip} aria-keyshortcuts="M" className={roundBtnCls}>
                <ShieldAlert className="h-4 w-4" aria-hidden />
              </button>
              <Tip id={moderateTip} text={t("profile.moderate")} />
            </div>
          )}
          {buttons.includes("more") && menu.length > 0 && (
            <div className={roundBtn}>
              <button
                ref={moreRef}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={t("profile.more")}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                aria-describedby={moreTip}
                className={roundBtnCls}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
              {!menuOpen && <Tip id={moreTip} text={t("profile.more")} />}
              {menuOpen && (
                <div id={menuId} role="menu" onKeyDown={onMenuKey} className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-border/50 bg-popover py-1 text-popover-foreground shadow-lg">
                  {menu.map((item, i) => (
                    <button key={item} role="menuitem" type="button" autoFocus={i === 0} onClick={() => onMore(item)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none lg:py-1.5">
                      {item === "mention" ? <AtSign className="h-3.5 w-3.5" aria-hidden /> : item === "copyId" ? <Copy className="h-3.5 w-3.5" aria-hidden /> : item === "copyLink" ? <Link2 className="h-3.5 w-3.5" aria-hidden /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
                      {t(`profile.actions.${item}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {narrow && (
            <button type="button" onClick={onClose} aria-label={t("profile.close")} className={roundBtnCls}><X className="h-4 w-4" aria-hidden /></button>
          )}
        </div>
        <div className="absolute left-4 top-8 z-10 shrink-0">
          {isCopilot ? (
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-card bg-violet-600 text-white"><Bot className="h-8 w-8" aria-hidden /></span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getUserAvatarUrl(avatarUrl, email, 128)} alt="" className="h-16 w-16 rounded-full border-4 border-card bg-muted object-cover" />
          )}
          {presenceKind && <PresenceDot presence={presenceKind} label={presenceLabel} />}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-3 pt-10">
        {/* Name, alias and short badges */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 id={titleId} className="truncate text-base font-bold leading-tight" style={color ? { color } : undefined}>
              {isCopilot ? t("ai.copilotName") : displayName || <span className="inline-block h-4 w-28 animate-pulse rounded bg-muted align-middle motion-reduce:animate-none" aria-label={t("profile.loading")} />}
            </h2>
            {isBot && <BotBadge label={t("ai.bot")} />}
            {profile?.isOwner && <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300"><Crown className="h-2.5 w-2.5" aria-hidden />{t("profile.owner")}</span>}
            {isSelf && <span className="text-[11px] text-muted-foreground">{t("profile.you")}</span>}
          </div>
          {profile && profile.name !== profile.displayName && <p className="truncate text-xs text-muted-foreground">{profile.name}</p>}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {presenceKind && <span>{presenceLabel}</span>}
            {localTime && <span>{t("profile.localTime", { time: localTime })}</span>}
          </p>
          {badges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">{badges.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} />)}</div>
          )}
        </div>

        {isCopilot && (
          <div className="space-y-2">
            <p className="text-xs leading-relaxed text-muted-foreground">{t("profile.copilot.about")}</p>
            {actions.onOpenCopilot && (
              <button type="button" onClick={() => { actions.onOpenCopilot?.(); onClose(); }} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <Bot className="h-3.5 w-3.5" aria-hidden />{t("profile.copilot.ask")}
              </button>
            )}
          </div>
        )}

        {!isCopilot && !profile && !error && <Skeleton label={t("profile.loading")} />}
        {!isCopilot && error && !profile && (
          <div role="alert" className="rounded-xl border border-border/50 p-3 text-center text-xs">
            <p className="mb-2 text-muted-foreground">{t("profile.loadError")}</p>
            <button type="button" onClick={reload} className="rounded-lg border border-border px-3 py-1 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("profile.retry")}</button>
          </div>
        )}

        {profile && (
          <>
            {mute && (
              <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium">
                <Clock className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
                {mute.kind === "forever" ? t("profile.mutedForever") : t("profile.mutedUntil", { date: new Date(mute.until).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}
              </div>
            )}

            {profile.isBot ? (
              <Section title={t("profile.botInfo")}>
                <p className="text-xs leading-relaxed">{profile.bot?.description || <span className="text-muted-foreground">{t("profile.noDescription")}</span>}</p>
                {profile.bot && (() => {
                  const facts = botProfileFacts(profile.bot);
                  return (
                    <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-full ${profile.bot.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />{profile.bot.isActive ? t("profile.botActive") : t("profile.botPaused")}</span>
                        {facts.creatorName && <span>{t("profile.createdBy", { name: facts.creatorName })}</span>}
                      </p>
                      {facts.importedFrom && (
                        <p>{facts.importedFrom.publisher ? t("profile.importedFrom", { pack: facts.importedFrom.pack, publisher: facts.importedFrom.publisher }) : t("profile.importedFromNoPublisher", { pack: facts.importedFrom.pack })}</p>
                      )}
                      {(facts.botLocked || facts.codeLocked) && (
                        <p className="flex flex-wrap items-center gap-1">
                          {facts.botLocked && <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/15 px-1.5 py-px text-[10px] font-bold text-amber-800 dark:text-amber-200"><Lock className="h-2.5 w-2.5" aria-hidden />{t("profile.botLocked")}</span>}
                          {facts.codeLocked && <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/15 px-1.5 py-px text-[10px] font-bold text-amber-800 dark:text-amber-200"><Lock className="h-2.5 w-2.5" aria-hidden />{t("profile.codeLocked")}</span>}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </Section>
            ) : bio.text ? (
              <Section title={t("profile.about")}>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{bioOpen || !bio.truncated ? profile.bio : bio.text}</p>
                {bio.truncated && (
                  <button type="button" onClick={() => setBioOpen((v) => !v)} aria-expanded={bioOpen} className="mt-1 rounded text-[11px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    {bioOpen ? t("profile.bio.showLess") : t("profile.bio.showAll")}
                  </button>
                )}
              </Section>
            ) : null}

            {profile.roles.length > 0 && (
              <Section title={t("profile.roles")}>
                <div className="flex flex-wrap items-center gap-1">
                  {roleList.visible.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} muted={r.inherited} title={r.inherited ? t("profile.rolesInherited") : undefined} />)}
                  {roleList.hidden > 0 && (
                    <button type="button" onClick={() => setRolesOpen(true)} aria-label={t("profile.rolesToggle.more", { n: roleList.hidden })} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">+{roleList.hidden}</button>
                  )}
                  {rolesOpen && profile.roles.length > 4 && (
                    <button type="button" onClick={() => setRolesOpen(false)} className="rounded px-1 text-[11px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("profile.rolesToggle.less")}</button>
                  )}
                </div>
              </Section>
            )}

            {(profile.joinedTeamAt || profile.room?.joinedAt) && (
              <dl className="space-y-0.5 text-[11px] text-muted-foreground">
                {profile.joinedTeamAt && <div className="flex justify-between gap-2"><dt>{t("profile.memberSince")}</dt><dd className="font-medium text-foreground">{formatMemberSince(profile.joinedTeamAt, locale)}</dd></div>}
                {profile.room?.joinedAt && <div className="flex justify-between gap-2"><dt>{t("profile.inRoomSince")}</dt><dd className="font-medium text-foreground">{formatMemberSince(profile.room.joinedAt, locale)}</dd></div>}
              </dl>
            )}
          </>
        )}
      </div>

      {dmField && <UserProfileDm teamId={teamId} userId={userId} displayName={displayName} onOpenConversation={(id) => { actions.onMessage?.(id); onClose(); }} />}
    </div>
  );

  return createPortal(
    <>
      {narrow && <div className={`fixed inset-0 z-[319] bg-background/70 backdrop-blur-sm ${moderation ? "hidden" : ""}`} aria-hidden onClick={onClose} />}
      {body}
      {moderation && profile && (
        <UserModerationView
          teamId={teamId}
          roomId={roomId}
          profile={profile}
          onReload={reload}
          onClose={() => { setModeration(false); requestAnimationFrame(() => cardRef.current?.focus()); }}
          onCloseAll={onClose}
          onMute={actions.onMute}
          onUnmute={actions.onUnmute}
          onSearch={actions.onSearch}
          onChanged={onChanged}
        />
      )}
    </>,
    document.body,
  );
}
