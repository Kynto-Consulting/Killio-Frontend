"use client";

import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { Phone, PhoneOff, Bot, Users, Settings, Layout, FileText, GitBranch, Captions, ChevronLeft, Bell, Check } from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import type { Room, RoomNotificationPref } from "@/lib/api/rooms";
import type { RoomPresenceMember } from "@/hooks/use-room-presence";
import { usePlatform } from "@/components/providers/platform-provider";
import { useRoomNotificationPref } from "@/hooks/use-room-notification-pref";

type TFn = (key: string) => string;

interface RoomHeaderProps {
  room: Room;
  presenceMembers: RoomPresenceMember[];
  isInCall: boolean;
  isAiPanelOpen: boolean;
  isMembersPanelOpen: boolean;
  canCall: boolean;
  canManage: boolean;
  /** AI assistant room (Killio "vault" group): hide member/permission management. */
  isAiRoom?: boolean;
  onStartCall: () => void;
  onLeaveCall: () => void;
  onToggleAiPanel: () => void;
  onToggleMembersPanel: () => void;
  onOpenPermissions: () => void;
  t: TFn;
}

interface NotificationPrefButtonProps {
  roomId: string;
  t: TFn;
}

const NOTIF_OPTIONS: Array<{ pref: RoomNotificationPref; labelKey: string; icon: string }> = [
  { pref: "all", labelKey: "header.notifAll", icon: "🔔" },
  { pref: "mentions", labelKey: "header.notifMentions", icon: "🔕" },
  { pref: "none", labelKey: "header.notifNone", icon: "🚫" },
];

function NotificationPrefButton({ roomId, t }: NotificationPrefButtonProps) {
  const { pref, setPref } = useRoomNotificationPref(roomId);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("header.notifications")}
        className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-md border border-border/60 bg-popover shadow-md py-1">
          {NOTIF_OPTIONS.map((opt) => (
            <button
              key={opt.pref}
              onClick={() => {
                setPref(opt.pref);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent/10 transition-colors"
            >
              <span className="text-sm leading-none">{opt.icon}</span>
              <span className="flex-1 text-foreground">{t(opt.labelKey)}</span>
              {pref === opt.pref && <Check className="w-3 h-3 text-accent shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ENTITY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  board: Layout,
  document: FileText,
  mesh: GitBranch,
};

function roomPrefix(room: Room): string {
  if (room.type === "channel") return "#";
  if (room.type === "dm") return "";
  return "🔗";
}

export function RoomHeader({
  room,
  presenceMembers,
  isInCall,
  isAiPanelOpen,
  isMembersPanelOpen,
  canCall,
  canManage,
  isAiRoom = false,
  onStartCall,
  onLeaveCall,
  onToggleAiPanel,
  onToggleMembersPanel,
  onOpenPermissions,
  t,
}: RoomHeaderProps) {
  const platform = usePlatform();

  // Mobile-optimized header
  if (platform === "mobile") {
    const onlineCount = presenceMembers.length;
    return (
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-background/60 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/rooms" className="p-2 rounded-md text-muted-foreground hover:bg-accent/10">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {roomPrefix(room)} {room.name}
            </div>
            {onlineCount > 0 && (
              <div className="text-xs text-muted-foreground truncate">{onlineCount} online</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {canCall && (
            <button
              onClick={isInCall ? onLeaveCall : onStartCall}
              title={isInCall ? t("header.leaveCall") : t("header.call")}
              className="p-2 rounded-md hover:bg-accent/10 text-muted-foreground"
            >
              {isInCall ? <PhoneOff className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            </button>
          )}

          <button
            onClick={onToggleAiPanel}
            title={t("header.copilot")}
            className={`p-2 rounded-md ${isAiPanelOpen ? "bg-accent/20 text-accent" : "hover:bg-accent/10 text-muted-foreground"}`}
          >
            <Bot className="w-5 h-5" />
          </button>

          {!isAiRoom && (
            <button
              onClick={onToggleMembersPanel}
              title={t("header.members")}
              className={`p-2 rounded-md ${isMembersPanelOpen ? "bg-accent/20 text-accent" : "hover:bg-accent/10 text-muted-foreground"}`}
            >
              <Users className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const onlineCount = presenceMembers.length;
  const visibleAvatars = presenceMembers.slice(0, 4);
  const extraCount = onlineCount - 4;

  const EntityIcon = room.linkedEntityType ? ENTITY_ICONS[room.linkedEntityType] : null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-background/60 backdrop-blur shrink-0">
      {/* Left: room name */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-foreground truncate">
          {roomPrefix(room)} {room.name}
        </span>
        {room.description && (
          <span className="text-xs text-muted-foreground truncate hidden md:block">
            · {room.description}
          </span>
        )}
        {room.linkedEntityType && room.linkedEntityId && (
          <Link
            href={`/${room.linkedEntityType === "board" ? "b" : room.linkedEntityType === "document" ? "d" : "m"}/${room.linkedEntityId}`}
            className="flex items-center gap-1 text-[10px] text-accent/80 hover:text-accent border border-accent/20 rounded-full px-2 py-0.5 transition-colors"
          >
            {EntityIcon && <EntityIcon className="w-2.5 h-2.5" />}
            <span>{t("header.linkedTo")}</span>
          </Link>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Presence avatars */}
        {onlineCount > 0 && (
          <div className="flex items-center -space-x-1.5 mr-1">
            {visibleAvatars.map((m) => (
              <div
                key={m.clientId}
                className="w-6 h-6 rounded-full border-2 border-background overflow-hidden bg-muted"
                title={m.data.displayName}
              >
                <img
                  src={getUserAvatarUrl(m.data.avatarUrl ?? undefined, m.data.email, 24)}
                  alt={m.data.displayName}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {extraCount > 0 && (
              <div className="w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                +{extraCount}
              </div>
            )}
          </div>
        )}

        {/* Transcript / Captions button */}
        {canCall && (
          <Link
            href={`/rooms/${room.id}/transcripts`}
            title={t("header.transcripts")}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Captions className="w-3.5 h-3.5" />
          </Link>
        )}

        {/* Call button */}
        {canCall && (
          <button
            onClick={isInCall ? onLeaveCall : onStartCall}
            title={isInCall ? t("header.leaveCall") : t("header.call")}
            className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
              isInCall
                ? "bg-red-600/20 text-red-500 hover:bg-red-600/30"
                : "hover:bg-accent/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            {isInCall ? <PhoneOff className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* AI Copilot button */}
        <button
          onClick={onToggleAiPanel}
          title={t("header.copilot")}
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
            isAiPanelOpen
              ? "bg-accent/20 text-accent"
              : "hover:bg-accent/10 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
        </button>

        {/* Members button — hidden in AI rooms (private 1:1 with Killio, no humans to manage) */}
        {!isAiRoom && (
          <button
            onClick={onToggleMembersPanel}
            title={t("header.members")}
            className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
              isMembersPanelOpen
                ? "bg-accent/20 text-accent"
                : "hover:bg-accent/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Notification preference button */}
        <NotificationPrefButton roomId={room.id} t={t} />

        {/* Permissions button — hidden in AI rooms (no roles/members/invites to manage) */}
        {canManage && !isAiRoom && (
          <button
            onClick={onOpenPermissions}
            title={t("header.permissions")}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
