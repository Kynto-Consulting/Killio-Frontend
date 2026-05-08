"use client";

import Link from "next/link";
import { Phone, PhoneOff, Bot, Users, Settings, Layout, FileText, GitBranch } from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import type { Room } from "@/lib/api/rooms";
import type { RoomPresenceMember } from "@/hooks/use-room-presence";

type TFn = (key: string) => string;

interface RoomHeaderProps {
  room: Room;
  presenceMembers: RoomPresenceMember[];
  isInCall: boolean;
  isAiPanelOpen: boolean;
  isMembersPanelOpen: boolean;
  canCall: boolean;
  canManage: boolean;
  onStartCall: () => void;
  onLeaveCall: () => void;
  onToggleAiPanel: () => void;
  onToggleMembersPanel: () => void;
  onOpenPermissions: () => void;
  t: TFn;
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
  onStartCall,
  onLeaveCall,
  onToggleAiPanel,
  onToggleMembersPanel,
  onOpenPermissions,
  t,
}: RoomHeaderProps) {
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

        {/* Members button */}
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

        {/* Permissions button */}
        {canManage && (
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
