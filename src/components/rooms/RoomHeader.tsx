"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot, Captions, FileText, GitBranch, Hash, Layout, Megaphone, Menu, MessageSquare, MoreHorizontal, Phone, PhoneOff,
  Pin, Search, Users, List, StickyNote, Bookmark,
  PanelLeft,
} from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import type { Room } from "@/lib/api/rooms";
import type { ChannelMenuExtras } from "./ChannelMenu";
import type { RoomPresenceMember } from "@/hooks/use-room-presence";
import type { RoomControls } from "@/lib/rooms/room-controls";
import { usePlatform } from "@/components/providers/platform-provider";

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
  /** Opens the channel "..." menu (notifications, settings, mark as read, copy link...) next to the given button. */
  /** Small screens only: opens THE channel menu (the sidebar row's one) with the actions this header hides on top. */
  onOpenChannelMenu?: (anchor: { x: number; y: number; rect: { left: number; right: number; top: number; bottom: number } }, extras: ChannelMenuExtras) => void;
  t: TFn;
}

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  board: Layout,
  document: FileText,
  mesh: GitBranch,
  list: List,
  card: StickyNote,
};

const btn =
  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none lg:h-8 lg:w-8";
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

export function RoomHeader({
  room, title, presenceMembers, memberCount, isInCall, isAiPanelOpen, isMembersPanelOpen, isPinsOpen, isBookmarksOpen = false, isSearchOpen, pinCount, controls, isAiRoom = false,
  onOpenSidebar, onStartCall, callBlockedReason, onLeaveCall, onToggleAiPanel, onToggleMembersPanel, onTogglePins, onToggleBookmarks, onToggleSearch, onOpenSettings, onOpenChannelMenu, t,
}: RoomHeaderProps) {
  const platform = usePlatform();
  const isMobile = platform === "mobile";
  const router = useRouter();

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
      <div className="flex min-h-[56px] items-center justify-between gap-1 px-2 py-1.5 sm:gap-2 sm:px-3 lg:min-h-[48px] lg:px-4">
        {/* Left: channel identity */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onOpenSidebar && (
            <button type="button" onClick={onOpenSidebar} aria-label={t("sidebar.open")} className={`${btn} lg:hidden`}>
              <PanelLeft className="h-4 w-4" aria-hidden />
            </button>
          )}
          <LeadIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1 lg:flex-none">
            <h1 className="truncate text-sm font-bold leading-tight text-foreground">{title}</h1>
            {room.description && isMobile && <p className="truncate text-[11px] leading-tight text-muted-foreground">{room.description}</p>}
          </div>
          {room.description && !isMobile && (
            <>
              <span className="hidden h-4 w-px shrink-0 bg-border xl:block" aria-hidden />
              <p className="hidden min-w-0 truncate text-xs text-muted-foreground xl:block" title={room.description}>{room.description}</p>
            </>
          )}
          {entityHref && !isMobile && (
            <Link href={entityHref} className="hidden shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:flex">
              {EntityIcon && <EntityIcon className="h-2.5 w-2.5" />}
              {t("header.linkedTo")}
            </Link>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          {!isMobile && onlineCount > 0 && (
            <div className="mr-1.5 hidden items-center -space-x-1.5 xl:flex" aria-label={t("header.online", { count: onlineCount })}>
              {visibleAvatars.map((m) => (
                <img key={m.clientId} src={getUserAvatarUrl(m.data.avatarUrl ?? undefined, m.data.email, 24)} alt="" title={m.data.displayName} className="h-6 w-6 rounded-full border-2 border-background object-cover" />
              ))}
              {extraCount > 0 && <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-bold text-muted-foreground">+{extraCount}</span>}
            </div>
          )}

          {callButton}
          <IconButton label={t("header.search")} pressed={isSearchOpen} onClick={onToggleSearch}><Search className="h-4 w-4" aria-hidden /></IconButton>

          {!isMobile && (
            <span className="hidden items-center gap-0.5 lg:contents">
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
            </span>
          )}

          {showMembers && (
            <span className="hidden sm:contents"><IconButton label={memberCount !== undefined ? t("header.membersCount", { count: memberCount }) : t("header.members")} pressed={isMembersPanelOpen} onClick={onToggleMembersPanel}>
              <Users className="h-4 w-4" aria-hidden />
            </IconButton></span>
          )}

          {onOpenChannelMenu && (
            <span className={isMobile ? "contents" : "contents lg:hidden"}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-label={t("channelMenu.title")}
                title={t("channelMenu.title")}
                onClick={(ev) => {
                  const r = ev.currentTarget.getBoundingClientRect();
                  onOpenChannelMenu(
                    { x: r.left, y: r.bottom, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } },
                    {
                      members: showMembers ? { count: memberCount, run: onToggleMembersPanel } : false,
                      pins: { count: pinCount, run: onTogglePins },
                      bookmarks: onToggleBookmarks ? { run: onToggleBookmarks } : undefined,
                      copilot: { run: onToggleAiPanel },
                      transcripts: controls.showTranscripts ? { run: () => router.push(`/rooms/${room.id}/transcripts`) } : undefined,
                      linked: entityHref ? { run: () => router.push(entityHref) } : undefined,
                    },
                  );
                }}
                className={btn}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
