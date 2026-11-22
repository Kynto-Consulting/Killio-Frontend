"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bot, Clock, MessageSquare, MoreHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import type { RoomPresenceMember } from "@/hooks/use-room-presence";
import type { RoomMember } from "@/lib/api/rooms";
import { useProfileProviderOpen, anchorOf } from "./user-profile-context";
import { buildMemberSections, memberColor, type PanelMember } from "@/lib/rooms/members-layout";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface MemberRowProps {
  member: RoomMember;
  isOnline: boolean;
  isInCall: boolean;
  isYou: boolean;
  canModerate: boolean;
  isMuted: boolean;
  onMute: (m: RoomMember) => void;
  onUnmute: (m: RoomMember) => void;
  onOpenDm?: (m: RoomMember) => void;
  /** Opens the profile card anchored to the row. */
  onOpenProfile?: (m: RoomMember, anchor: HTMLElement) => void;
  t: TFn;
}

/** The avatar and name of a row: a button that opens the profile card when the page offers one, plain otherwise. */
function Identity({ member, onOpenProfile, label, children }: { member: RoomMember; onOpenProfile?: (m: RoomMember, anchor: HTMLElement) => void; label: string; children: React.ReactNode }) {
  if (!onOpenProfile) return <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>;
  return (
    <button
      type="button"
      onClick={(e) => onOpenProfile(member, e.currentTarget)}
      aria-haspopup="dialog"
      aria-label={label}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
    </button>
  );
}

function MemberRow({ member, isOnline, isInCall, isYou, canModerate, isMuted, onMute, onUnmute, onOpenDm, onOpenProfile, t }: MemberRowProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const color = memberColor(member);
  const hasMenu = !isYou && !member.isBot && ((canModerate) || Boolean(onOpenDm));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const item = "flex w-full items-center gap-2 px-3 py-3 text-left text-sm hover:bg-muted lg:py-1.5 lg:text-xs focus-visible:bg-muted focus-visible:outline-none";
  // Offline people are dimmed (avatar and text), never the status dot: that one stays a solid, readable badge.
  const dim = !(isOnline || member.isBot);

  return (
    <li className={`group/member flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 lg:py-1 motion-reduce:transition-none`}>
      <Identity onOpenProfile={onOpenProfile} member={member} label={t("members.profile", { name: member.displayName })}>
      <span className="relative block shrink-0">
        <img src={getUserAvatarUrl(member.avatarUrl, member.email, 28)} alt="" className={`h-7 w-7 rounded-full border border-border object-cover transition-opacity ${dim ? "opacity-55" : ""}`} />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-card ${isInCall ? "bg-sky-500" : isOnline ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"}`}
          aria-hidden
        />
      </span>
      <span className={`block min-w-0 flex-1 text-left transition-opacity ${dim ? "opacity-60" : ""}`}>
        <span className="flex items-center gap-1">
          <span className="truncate text-xs font-medium" style={color ? { color } : undefined}>{member.displayName}</span>
          {member.isBot && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-500/15 px-1 text-[9px] font-bold uppercase tracking-tight text-violet-700 dark:text-violet-300">
              <Bot className="h-2 w-2" aria-hidden />{t("ai.bot")}
            </span>
          )}
          {isYou && <span className="text-[10px] text-muted-foreground">{t("members.you")}</span>}
          {isMuted && <Clock className="h-3 w-3 shrink-0 text-amber-600" aria-label={t("members.muted")} />}
        </span>
        <span className="block text-[10px] text-muted-foreground">
          {(member.inheritedRoles ?? []).length > 0 && (
            <span className="mr-1 inline-flex flex-wrap gap-0.5 align-middle" title={t("members.inherited")}>
              {member.inheritedRoles!.map((r) => (
                <span key={r.id} className="rounded border border-dashed border-border px-1 text-[9px] font-semibold text-muted-foreground">{r.name}</span>
              ))}
            </span>
          )}
          {isInCall ? t("members.inCall") : isOnline ? t("members.online") : member.isBot ? t("members.botLabel") : t("members.offline")}
        </span>
      </span>
      </Identity>
      {hasMenu && (
        <div ref={ref} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-label={t("members.actions", { name: member.displayName })}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:opacity-0 md:group-hover/member:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
          </button>
          {open && (
            <div id={menuId} role="menu" className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
              {onOpenDm && <button role="menuitem" className={item} onClick={() => { setOpen(false); onOpenDm(member); }}><MessageSquare className="h-3.5 w-3.5" aria-hidden />{t("members.message")}</button>}
              {canModerate && (isMuted
                ? <button role="menuitem" className={item} onClick={() => { setOpen(false); onUnmute(member); }}><Volume2 className="h-3.5 w-3.5" aria-hidden />{t("mod.unmute")}</button>
                : <button role="menuitem" className={`${item} text-destructive`} onClick={() => { setOpen(false); onMute(member); }}><VolumeX className="h-3.5 w-3.5" aria-hidden />{t("mod.mute")}</button>)}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

interface RoomMembersPanelProps {
  presenceMembers: RoomPresenceMember[];
  /** Only the people who can SEE this room (what the server resolved), never the legacy room_members. */
  roomMembers: RoomMember[];
  currentUserId: string;
  isLoading?: boolean;
  hasError?: boolean;
  onRetry?: () => void;
  canModerate?: boolean;
  onMute?: (m: RoomMember) => void;
  onUnmute?: (m: RoomMember) => void;
  onOpenDm?: (m: RoomMember) => void;
  /** Opens the profile card of a person (anchored to their row). */
  onOpenProfile?: (m: RoomMember, anchor: HTMLElement) => void;
  onClose?: () => void;
  t: TFn;
}

export function RoomMembersPanel({
  presenceMembers, roomMembers, currentUserId, isLoading, hasError, onRetry, canModerate = false, onMute, onUnmute, onOpenDm, onOpenProfile, onClose, t,
}: RoomMembersPanelProps) {
  // With the page-level profile provider every row opens the card; a caller may still pass its own handler.
  const providerOpen = useProfileProviderOpen();
  const openProfile = useMemo<RoomMembersPanelProps["onOpenProfile"]>(
    () => onOpenProfile ?? (providerOpen
      ? (m, el) => providerOpen({ userId: m.userId, anchor: anchorOf(el), known: { displayName: m.displayName || m.email, avatarUrl: m.avatarUrl ?? null, email: m.email || null, isBot: m.isBot, color: memberColor(m) } })
      : undefined),
    [onOpenProfile, providerOpen],
  );
  // The person looking at the panel is online by definition (their own presence entry may not have arrived yet).
  const onlineIds = useMemo(() => {
    const ids = new Set(presenceMembers.map((m) => m.clientId));
    if (currentUserId) ids.add(currentUserId);
    return ids;
  }, [presenceMembers, currentUserId]);
  const inCallIds = useMemo(() => new Set(presenceMembers.filter((m) => m.data.status === "in-call").map((m) => m.clientId)), [presenceMembers]);
  const byId = useMemo(() => new Map(roomMembers.map((m) => [m.userId, m])), [roomMembers]);
  const now = Date.now();

  const sections = useMemo(
    () => buildMemberSections(roomMembers.map<PanelMember>((m) => ({
      userId: m.userId, displayName: m.displayName || m.email, email: m.email, avatarUrl: m.avatarUrl, roles: m.roles, isBot: m.isBot, mutedUntil: m.mutedUntil,
    })), onlineIds),
    [roomMembers, onlineIds],
  );

  const sectionTitle = (kind: string, title: string | null, count: number) => {
    const base = kind === "role" ? title ?? "" : t(`members.section.${kind}`);
    return `${base} — ${count}`;
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card/40">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("members.title")} — {roomMembers.length}</h2>
        {onClose && (
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:h-7 lg:w-7" aria-label={t("members.close")}>
            <X className="h-5 w-5 lg:h-4 lg:w-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="space-y-2 px-1" role="status" aria-label={t("members.loading")}>
            {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-2"><div className="h-7 w-7 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><div className="h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>)}
          </div>
        ) : hasError ? (
          <div role="alert" className="rounded-xl border border-border p-3 text-center text-xs">
            <p className="mb-2 text-muted-foreground">{t("members.loadError")}</p>
            {onRetry && <button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-1 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("errors.retry")}</button>}
          </div>
        ) : sections.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t("members.empty")}</p>
        ) : (
          sections.map((s) => (
            <section key={s.key} className="mb-3" aria-label={sectionTitle(s.kind, s.title, s.members.length)}>
              <h3 className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider" style={s.color ? { color: s.color } : undefined}>
                {s.color && <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />}
                <span className={s.color ? "" : "text-muted-foreground"}>{sectionTitle(s.kind, s.title, s.members.length)}</span>
              </h3>
              <ul>
                {s.members.map((pm) => {
                  const m = byId.get(pm.userId)!;
                  const muted = Boolean(m.mutedUntil) && (Date.parse(m.mutedUntil as string) > now || Number.isNaN(Date.parse(m.mutedUntil as string)));
                  return (
                    <MemberRow
                      key={m.userId}
                      member={m}
                      isOnline={onlineIds.has(m.userId)}
                      isInCall={inCallIds.has(m.userId)}
                      isYou={m.userId === currentUserId}
                      canModerate={canModerate && Boolean(onMute)}
                      isMuted={muted}
                      onMute={(x) => onMute?.(x)}
                      onUnmute={(x) => onUnmute?.(x)}
                      onOpenDm={onOpenDm}
                      onOpenProfile={openProfile}
                      t={t}
                    />
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
