"use client";

import { useState } from "react";
import Link from "next/link";
import NextLink from "next/link";
import { Plus, Hash, Link2, MessageSquare, Loader2, ChevronDown, ChevronRight, FolderOpen, X, Sparkles } from "lucide-react";
import type { Room, RoomGroup } from "@/lib/api/rooms";

type TFn = (key: string) => string;

interface RoomSidebarProps {
  rooms: Room[];
  groups: RoomGroup[];
  activeRoomId: string | null;
  isLoading: boolean;
  canCreate: boolean;
  onSelectRoom: (roomId: string) => void;
  onCreateRoom: (groupId?: string) => void;
  onCreateGroup?: () => void;
  onClose?: () => void;
  t: TFn;
}

function RoomItem({ room, isActive }: { room: Room; isActive: boolean }) {
  const icon =
    room.type === "channel" ? (
      <Hash className="w-3.5 h-3.5 shrink-0 opacity-60" />
    ) : room.type === "thread" ? (
      <Link2 className="w-3.5 h-3.5 shrink-0 opacity-60" />
    ) : (
      <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
    );

  return (
    <Link
      href={`/rooms/${room.id}`}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
        isActive
          ? "bg-accent/20 text-accent font-semibold"
          : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
      }`}
    >
      {room.emoji ? (
        <span className="text-xs shrink-0">{room.emoji}</span>
      ) : (
        icon
      )}
      <span className="truncate">{room.name}</span>
    </Link>
  );
}

interface ChannelGroupSectionProps {
  group: RoomGroup | null; // null = ungrouped
  rooms: Room[];
  activeRoomId: string | null;
  canCreate: boolean;
  onCreateRoom: (groupId?: string) => void;
  t: TFn;
}

function ChannelGroupSection({ group, rooms, activeRoomId, canCreate, onCreateRoom, t }: ChannelGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const label = group
    ? `${group.emoji ? group.emoji + " " : ""}${group.name}`
    : t("sidebar.channels");

  // The VAULT group doubles as a route: a sparkle button opens /rooms/vault,
  // a full-page Killio assistant (chat with the AI directly).
  const isVault = (group?.name ?? "").trim().toLowerCase() === "vault";

  return (
    <div className="mb-1">
      {/* Group header */}
      <div className="flex items-center justify-between px-2 py-1 group/header">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors min-w-0 flex-1"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 shrink-0" />
          )}
          <span className="truncate">{label}</span>
        </button>
        <div className="flex items-center gap-1">
          {isVault && (
            <NextLink
              href="/rooms/vault"
              title={t("sidebar.openKillioChat")}
              className="w-4 h-4 flex items-center justify-center rounded text-cyan-500 hover:text-cyan-400 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
            </NextLink>
          )}
          {canCreate && (
            <button
              onClick={() => onCreateRoom(group?.id)}
              title={t("sidebar.createChannel")}
              className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/header:opacity-100"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Rooms in group */}
      {!collapsed && (
        <div className="pl-2">
          {rooms.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground/50 italic">{t("sidebar.noChannels")}</p>
          ) : (
            rooms.map((r) => (
              <RoomItem key={r.id} room={r} isActive={r.id === activeRoomId} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function RoomSidebar({
  rooms,
  groups,
  activeRoomId,
  isLoading,
  canCreate,
  onSelectRoom: _onSelectRoom,
  onCreateRoom,
  onCreateGroup,
  onClose,
  t,
}: RoomSidebarProps) {
  const channels = rooms.filter((r) => r.type === "channel");
  const threads = rooms.filter((r) => r.type === "thread");
  const dms = rooms.filter((r) => r.type === "dm");
  const [linkedCollapsed, setLinkedCollapsed] = useState(false);

  // Sort groups by sortOrder
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);

  // Channels without a group
  const ungroupedChannels = channels.filter(
    (r) => !r.groupId || !groups.find((g) => g.id === r.groupId)
  );

  return (
    <aside className="w-64 md:w-56 shrink-0 border-r border-border/60 bg-card/30 flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border/40 shrink-0 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {t("title")}
        </span>
        <div className="flex items-center gap-1">
          {canCreate && onCreateGroup && (
            <button
              onClick={onCreateGroup}
              title={t("sidebar.createGroup")}
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Mobile close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Ungrouped channels (always shown first if any exist, or if no groups) */}
            {(sortedGroups.length === 0 || ungroupedChannels.length > 0) && (
              <ChannelGroupSection
                group={null}
                rooms={ungroupedChannels}
                activeRoomId={activeRoomId}
                canCreate={canCreate}
                onCreateRoom={onCreateRoom}
                t={t}
              />
            )}

            {/* Named groups */}
            {sortedGroups.map((group) => (
              <ChannelGroupSection
                key={group.id}
                group={group}
                rooms={channels.filter((r) => r.groupId === group.id)}
                activeRoomId={activeRoomId}
                canCreate={canCreate}
                onCreateRoom={onCreateRoom}
                t={t}
              />
            ))}

            {/* Linked threads (boards, docs, meshes) — collapsible */}
            {threads.length > 0 && (
              <div className="mb-1 mt-2">
                <button
                  onClick={() => setLinkedCollapsed((v) => !v)}
                  className="w-full px-2 py-1 flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {linkedCollapsed ? (
                    <ChevronRight className="w-3 h-3 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {t("sidebar.linked")}
                  </span>
                  <span className="ml-auto text-[10px] tabular-nums opacity-60">{threads.length}</span>
                </button>
                {!linkedCollapsed && (
                  <div className="pl-2">
                    {threads.map((r) => (
                      <RoomItem key={r.id} room={r} isActive={r.id === activeRoomId} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DMs */}
            {dms.length > 0 && (
              <div className="mb-1 mt-2">
                <div className="px-2 py-1 flex items-center justify-between group/dmheader">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t("sidebar.directMessages")}
                  </span>
                  {canCreate && (
                    <button
                      onClick={() => onCreateRoom(undefined)}
                      title={t("sidebar.createDM")}
                      className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/dmheader:opacity-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="pl-2">
                  {dms.map((r) => (
                    <RoomItem key={r.id} room={r} isActive={r.id === activeRoomId} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
