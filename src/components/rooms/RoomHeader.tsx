"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  Bell, BellOff, Bot, Captions, Check, FileText, GitBranch, Hash, Layout, Megaphone, Menu, MessageSquare, MoreHorizontal, Phone, PhoneOff,
  Pin, Search, Settings, Users, List, StickyNote, Bookmark,
} from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import type { Room, RoomNotificationPref } from "@/lib/api/rooms";
import type { RoomPresenceMember } from "@/hooks/use-room-presence";
import type { RoomControls } from "@/lib/rooms/room-controls";
import { usePlatform } from "@/components/providers/platform-provider";
import { useRoomNotificationPref } from "@/hooks/use-room-notification-pref";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface RoomHeaderProps {
  room: Room;
  /** Shown name: the other person for a DM, the document / board title for an entity room, else the channel name. */
  title: string;
  presenceMembers: RoomPresenceMember[];
  /** People who can see this room (the panel list), not just who is online. */
  memberCount?: number;
  isInCall: boolean;
  isAiPanelOpen: boolean;
  isMembersPanelOpen: boolean;
  isPinsOpen: boolean;
  isBookmarksOpen?: boolean;
  isSearchOpen: boolean;
  pinCount: number;
  controls: RoomControls;
  /** AI assistant room (Killio "vault" group): hide member / settings management. */
  isAiRoom?: boolean;
  onOpenSidebar?: () => void;
  onStartCall: () => void;
  /** Why starting / joining a call is not allowed here (the button is then disabled, with this as tooltip). */
  callBlockedReason?: string | null;
  onLeaveCall: () => void;
  onToggleAiPanel: () => void;
  onToggleMembersPanel: () => void;
  onTogglePins: () => void;
  onToggleBookmarks?: () => void;
  onToggleSearch: () => void;
  onOpenSettings: () => void;
  t: TFn;
}

const NOTIF_OPTIONS: Array<{ pref: RoomNotificationPref; labelKey: string }> = [
  { pref: "all", labelKey: "header.notifAll" },
  { pref: "mentions", labelKey: "header.notifMentions" },
  { pref: "none", labelKey: "header.notifNone" },
];

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  board: Layout,
  document: FileText,
  mesh: GitBranch,
  list: List,
  card: StickyNote,
};

const btn =
  "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none";
const btnOn = "bg-muted text-foreground";

function IconButton({ label, pressed, onClick, children, tone, disabledReason }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode; tone?: "danger"; disabledReason?: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={disabledReason ?? label}
      aria-pressed={pressed}
      disabled={!!disabledReason}
      className={`${btn} ${pressed ? btnOn : ""} ${disabledReason ? "cursor-not-allowed opacity-40" : ""} ${tone === "danger" ? "!bg-rose-600/15 !text-rose-600 hover:!bg-rose-600/25" : ""}`}
    >
      {children}
    </button>
  );
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close, ref]);
}

function NotificationPrefButton({ pref, setPref, t }: { pref: RoomNotificationPref; setPref: (p: RoomNotificationPref) => void | Promise<void>; t: TFn }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useDismiss(open, () => setOpen(false), ref);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={t("header.notifications")} title={t("header.notifications")} className={`${btn} ${open ? btnOn : ""}`}>
        {pref === "none" ? <BellOff className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
          {NOTIF_OPTIONS.map((opt) => (
            <button
              key={opt.pref}
              role="menuitemradio"
              aria-checked={pref === opt.pref}
              onClick={() => { setPref(opt.pref); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="flex-1">{t(opt.labelKey)}</span>
              {pref === opt.pref && <Check className="h-3 w-3 shrink-0" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Overflow({ children, label }: { children: (close: () => void) => React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={label} title={label} className={`${btn} ${open ? btnOn : ""}`}>
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const menuItem = "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

export function RoomHeader({
  room, title, presenceMembers, memberCount, isInCall, isAiPanelOpen, isMembersPanelOpen, isPinsOpen, isBookmarksOpen = false, isSearchOpen, pinCount, controls, isAiRoom = false,
  onOpenSidebar, onStartCall, callBlockedReason, onLeaveCall, onToggleAiPanel, onToggleMembersPanel, onTogglePins, onToggleBookmarks, onToggleSearch, onOpenSettings, t,
}: RoomHeaderProps) {
  const platform = usePlatform();
  const isMobile = platform === "mobile";
  const { pref: notifPref, setPref: setNotifPref } = useRoomNotificationPref(room.id);

  const EntityIcon = room.linkedEntityType ? ENTITY_ICONS[room.linkedEntityType] : null;
  const LeadIcon = room.type === "dm" ? MessageSquare : EntityIcon ?? (room.channelType === "announcement" ? Megaphone : Hash);
  const onlineCount = presenceMembers.length;
  const visibleAvatars = presenceMembers.slice(0, 4);
  const extraCount = onlineCount - visibleAvatars.length;
  const entityHref = room.linkedEntityType && room.linkedEntityId
    ? `/${room.linkedEntityType === "board" || room.linkedEntityType === "mesh" ? "b" : room.linkedEntityType === "document" ? "d" : "b"}/${room.linkedEntityId}`
    : null;

  const showMembers = !isAiRoom && room.type !== "dm";
  const callButton = controls.showCall ? (
    <IconButton label={isInCall ? t("header.leaveCall") : t("header.call")} onClick={isInCall ? onLeaveCall : onStartCall} tone={isInCall ? "danger" : undefined} disabledReason={isInCall ? null : callBlockedReason}>
      {isInCall ? <PhoneOff className="h-4 w-4" aria-hidden /> : <Phone className="h-4 w-4" aria-hidden />}
    </IconButton>
  ) : null;

  return (
    <header className="shrink-0 border-b border-border/50 bg-background/70 backdrop-blur">
      <div className="flex min-h-[48px] items-center justify-between gap-2 px-3 py-1.5 md:px-4">
        {/* Left: channel identity */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onOpenSidebar && (
            <button type="button" onClick={onOpenSidebar} aria-label={t("sidebar.open")} className={`${btn} md:hidden`}>
              <Menu className="h-4 w-4" aria-hidden />
            </button>
          )}
          <LeadIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1 md:flex-none">
            <h1 className="truncate text-sm font-bold leading-tight text-foreground">{title}</h1>
            {room.description && isMobile && <p className="truncate text-[11px] leading-tight text-muted-foreground">{room.description}</p>}
          </div>
          {room.description && !isMobile && (
            <>
              <span className="hidden h-4 w-px shrink-0 bg-border md:block" aria-hidden />
              <p className="hidden min-w-0 truncate text-xs text-muted-foreground md:block" title={room.description}>{room.description}</p>
            </>
          )}
          {entityHref && !isMobile && (
            <Link href={entityHref} className="hidden shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:flex">
              {EntityIcon && <EntityIcon className="h-2.5 w-2.5" />}
              {t("header.linkedTo")}
            </Link>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          {!isMobile && onlineCount > 0 && (
            <div className="mr-1.5 hidden items-center -space-x-1.5 sm:flex" aria-label={t("header.online", { count: onlineCount })}>
              {visibleAvatars.map((m) => (
                <img key={m.clientId} src={getUserAvatarUrl(m.data.avatarUrl ?? undefined, m.data.email, 24)} alt="" title={m.data.displayName} className="h-6 w-6 rounded-full border-2 border-background object-cover" />
              ))}
              {extraCount > 0 && <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-bold text-muted-foreground">+{extraCount}</span>}
            </div>
          )}

          {callButton}
          <IconButton label={t("header.search")} pressed={isSearchOpen} onClick={onToggleSearch}><Search className="h-4 w-4" aria-hidden /></IconButton>

          {!isMobile && (
            <span className="hidden items-center gap-0.5 sm:contents">
              <IconButton label={pinCount > 0 ? t("header.pinsCount", { count: pinCount }) : t("header.pins")} pressed={isPinsOpen} onClick={onTogglePins}>
                <Pin className="h-4 w-4" aria-hidden />
                {pinCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full bg-foreground px-1 text-[9px] font-bold leading-[14px] text-background">{pinCount}</span>}
              </IconButton>
              {onToggleBookmarks && (
                <IconButton label={t("header.bookmarks")} pressed={isBookmarksOpen} onClick={onToggleBookmarks}>
                  <Bookmark className="h-4 w-4" aria-hidden />
                </IconButton>
              )}
              {controls.showTranscripts && (
                <Link href={`/rooms/${room.id}/transcripts`} aria-label={t("header.transcripts")} title={t("header.transcripts")} className={btn}>
                  <Captions className="h-4 w-4" aria-hidden />
                </Link>
              )}
              <IconButton label={t("header.copilot")} pressed={isAiPanelOpen} onClick={onToggleAiPanel}><Bot className="h-4 w-4" aria-hidden /></IconButton>
              <NotificationPrefButton pref={notifPref} setPref={setNotifPref} t={t} />
            </span>
          )}

          {showMembers && (
            <IconButton label={memberCount !== undefined ? t("header.membersCount", { count: memberCount }) : t("header.members")} pressed={isMembersPanelOpen} onClick={onToggleMembersPanel}>
              <Users className="h-4 w-4" aria-hidden />
            </IconButton>
          )}

          {controls.showSettings && !isAiRoom && (
            <IconButton label={t("header.settings")} onClick={onOpenSettings}><Settings className="h-4 w-4" aria-hidden /></IconButton>
          )}

          <div className={isMobile ? "contents" : "contents sm:hidden"}>
            <Overflow label={t("header.more")}>
              {(close) => (
                <>
                  <button role="menuitem" className={menuItem} onClick={() => { close(); onTogglePins(); }}><Pin className="h-3.5 w-3.5" aria-hidden />{pinCount > 0 ? t("header.pinsCount", { count: pinCount }) : t("header.pins")}</button>
                  {onToggleBookmarks && <button role="menuitem" className={menuItem} onClick={() => { close(); onToggleBookmarks(); }}><Bookmark className="h-3.5 w-3.5" aria-hidden />{t("header.bookmarks")}</button>}
                  <button role="menuitem" className={menuItem} onClick={() => { close(); onToggleAiPanel(); }}><Bot className="h-3.5 w-3.5" aria-hidden />{t("header.copilot")}</button>
                  {controls.showTranscripts && (
                    <Link role="menuitem" href={`/rooms/${room.id}/transcripts`} className={menuItem} onClick={close}><Captions className="h-3.5 w-3.5" aria-hidden />{t("header.transcripts")}</Link>
                  )}
                  {entityHref && <Link role="menuitem" href={entityHref} className={menuItem} onClick={close}>{EntityIcon && <EntityIcon className="h-3.5 w-3.5" aria-hidden />}{t("header.linkedTo")}</Link>}
                  {NOTIF_OPTIONS.map((opt) => (
                    <button key={opt.pref} role="menuitemradio" aria-checked={notifPref === opt.pref} className={menuItem} onClick={() => { void setNotifPref(opt.pref); close(); }}>
                      <Bell className="h-3.5 w-3.5" aria-hidden /><span className="flex-1">{t(opt.labelKey)}</span>{notifPref === opt.pref && <Check className="h-3 w-3" aria-hidden />}
                    </button>
                  ))}
                </>
              )}
            </Overflow>
            </div>
        </div>
      </div>
    </header>
  );
}
