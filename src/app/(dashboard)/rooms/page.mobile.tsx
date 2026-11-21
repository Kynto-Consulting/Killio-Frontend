"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, ChevronDown, ChevronRight, FileText, FolderPlus, Hash, Layout, List, Megaphone, MessageSquare, Network, Plus, StickyNote } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { useRoomDirectory } from "@/hooks/use-room-directory";
import { useRoomReferences } from "@/hooks/use-room-references";
import { useRoomUnread } from "@/hooks/use-room-unread";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { buildSidebarModel, dmDisplayName, type LayoutRoom } from "@/lib/rooms/channel-layout";
import type { Room, RoomGroup } from "@/lib/api/rooms";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { CategorySettingsModal } from "@/components/rooms/CategorySettingsModal";

type DecoratedRoom = Room & { unreadCount: number; mentionCount: number; muted: boolean };

const ENTITY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  document: FileText, board: Layout, mesh: Network, list: List, card: StickyNote,
};

/** Rooms index on phones: the same sections as the channel bar (categories, documents and boards, direct messages). */
export default function RoomsPageMobile() {
  const router = useRouter();
  const t = useTranslations("rooms");
  const { accessToken, activeTeamId, user } = useSession();
  const { isAdmin } = useActiveTeamRole(activeTeamId, accessToken, user?.id);
  const directory = useRoomDirectory(activeTeamId, accessToken, user?.id, isAdmin);
  const references = useRoomReferences(activeTeamId, accessToken);
  const { groups, capabilities, peers } = directory;
  const rooms = useRoomUnread({ rooms: directory.rooms, activeRoomId: null, userId: user?.id, roleIds: directory.myRoleIds }).rooms as DecoratedRoom[];

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [initialGroupId, setInitialGroupId] = useState<string | undefined>();
  const [entitiesOpen, setEntitiesOpen] = useState(false);

  const selfNames = useMemo(() => [user?.displayName, user?.username, user?.email, user?.email ? user.email.split("@")[0] : null], [user?.displayName, user?.username, user?.email]);
  const model = useMemo(
    () => buildSidebarModel<DecoratedRoom>(rooms as (DecoratedRoom & LayoutRoom)[], groups.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, sortOrder: g.sortOrder }))),
    [rooms, groups],
  );

  const titleOf = (room: DecoratedRoom): string => {
    if (room.type === "dm") return dmDisplayName(room, selfNames, peers[room.id]?.name);
    if (room.linkedEntityType && room.linkedEntityId) return references.entityTitles[`${room.linkedEntityType}:${room.linkedEntityId}`] ?? room.name;
    return room.name;
  };

  const iconFor = (room: DecoratedRoom) => {
    const cls = "h-4 w-4 shrink-0 text-muted-foreground";
    if (room.type === "dm") {
      const peer = peers[room.id];
      return peer
        ? <img src={getUserAvatarUrl(peer.avatarUrl, peer.email, 24)} alt="" className="h-5 w-5 shrink-0 rounded-full border border-border object-cover" />
        : <MessageSquare className={cls} aria-hidden />;
    }
    if (room.linkedEntityType) {
      const Icon = ENTITY_ICON[room.linkedEntityType] ?? Hash;
      return <Icon className={cls} aria-hidden />;
    }
    return room.channelType === "announcement" ? <Megaphone className={cls} aria-hidden /> : <Hash className={cls} aria-hidden />;
  };

  const entityTotal = model.entityGroups.reduce((n, g) => n + g.rooms.length, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b-2 border-[var(--memphis-line)] bg-background/70 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-sm font-bold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("roomsCount", { count: rooms.length })}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {capabilities.canManageChannels && (
            <button type="button" onClick={() => setCategoryOpen(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]" aria-label={t("sidebar.createGroup")}>
              <FolderPlus className="h-4 w-4" aria-hidden />
            </button>
          )}
          {capabilities.canCreateChannels && (
            <button type="button" onClick={() => { setInitialGroupId(undefined); setIsCreateOpen(true); }} className="rounded-lg border-2 border-[var(--memphis-line)] bg-[hsl(var(--accent-ink))] p-2 text-[hsl(var(--accent-ink-fg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] focus-visible:ring-offset-2" aria-label={t("sidebar.createChannel")}>
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-3">
        {directory.isLoading && (
          <div className="space-y-2" role="status" aria-label={t("sidebar.loading")}>
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />)}
          </div>
        )}

        {!directory.isLoading && directory.error && (
          <div role="alert" className="rounded-xl border-2 border-[var(--memphis-line)] p-4 text-center text-sm">
            <p className="mb-2 text-muted-foreground">{t("sidebar.loadError")}</p>
            <button type="button" onClick={directory.refresh} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">{t("errors.retry")}</button>
          </div>
        )}

        {!directory.isLoading && !directory.error && rooms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--memphis-line)]">
              <MessageSquare className="h-6 w-6" aria-hidden />
            </div>
            <p className="text-sm font-semibold">{t("emptyState.title")}</p>
            <p className="mt-1 max-w-[22rem] text-xs text-muted-foreground">{capabilities.canCreateChannels ? t("emptyState.description") : t("sidebar.emptyNoCreate")}</p>
            {capabilities.canCreateChannels && (
              <button type="button" onClick={() => setIsCreateOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 border-[var(--memphis-line)] bg-[hsl(var(--accent-ink))] px-4 py-2 text-sm font-bold text-[hsl(var(--accent-ink-fg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] focus-visible:ring-offset-2">
                <Plus className="h-4 w-4" aria-hidden />
                {t("emptyState.createButton")}
              </button>
            )}
          </div>
        )}

        {!directory.isLoading && !directory.error && rooms.length > 0 && (
          <>
            {model.categories.map((section) => {
              if (section.rooms.length === 0) return null;
              const group = section.category;
              return (
                <RoomSection
                  key={group?.id ?? "none"}
                  label={group ? `${group.emoji ? `${group.emoji} ` : ""}${group.name}` : t("sidebar.channels")}
                  rooms={section.rooms}
                  titleOf={titleOf}
                  iconFor={iconFor}
                  t={t}
                  onCreateRoom={capabilities.canCreateChannels && group ? () => { setInitialGroupId(group.id); setIsCreateOpen(true); } : undefined}
                />
              );
            })}

            {entityTotal > 0 && (
              <section className="space-y-1.5">
                <button type="button" onClick={() => setEntitiesOpen((v) => !v)} aria-expanded={entitiesOpen} className="flex w-full items-center gap-1 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
                  {entitiesOpen ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronRight className="h-3 w-3" aria-hidden />}
                  {t("sidebar.entityRooms")}
                  <span className="ml-1 text-[10px] opacity-70">{entityTotal}</span>
                </button>
                {entitiesOpen && model.entityGroups.map((g) => (
                  <RoomSection key={g.entityType} label={t(`sidebar.entityType.${g.entityType}`) === `sidebar.entityType.${g.entityType}` ? t("sidebar.entityType.other") : t(`sidebar.entityType.${g.entityType}`)} rooms={g.rooms} titleOf={titleOf} iconFor={iconFor} t={t} nested />
                ))}
              </section>
            )}

            {model.directMessages.length > 0 && (
              <RoomSection label={t("sidebar.directMessages")} rooms={model.directMessages} titleOf={titleOf} iconFor={iconFor} t={t} />
            )}
          </>
        )}
      </div>

      {activeTeamId && accessToken && (
        <>
          <CreateRoomModal
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            groups={groups}
            rooms={directory.rooms}
            initialGroupId={initialGroupId}
            canEditPermissions={capabilities.canManageChannels}
            onCreated={(roomId) => {
              setIsCreateOpen(false);
              router.push(`/rooms/${roomId}`);
            }}
            t={t}
          />
          <CategorySettingsModal
            open={categoryOpen}
            onClose={() => setCategoryOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            canEditPermissions={false}
            onSaved={(group: RoomGroup) => { directory.setGroups((prev) => [...prev, group]); }}
            t={t}
          />
        </>
      )}
    </div>
  );
}

function RoomSection({
  label, rooms, titleOf, iconFor, onCreateRoom, nested, t,
}: {
  label: string;
  rooms: DecoratedRoom[];
  titleOf: (room: DecoratedRoom) => string;
  iconFor: (room: DecoratedRoom) => React.ReactNode;
  onCreateRoom?: () => void;
  nested?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (rooms.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <h2 className={`font-bold uppercase tracking-wider text-muted-foreground ${nested ? "text-[10px]" : "text-[11px]"}`}>{label}</h2>
        {onCreateRoom && (
          <button type="button" onClick={onCreateRoom} className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]" aria-label={t("sidebar.createChannelIn", { name: label })}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {rooms.map((room) => {
          const unread = room.muted ? 0 : room.unreadCount;
          return (
            <li key={room.id}>
              <Link
                href={`/rooms/${room.id}`}
                className={`flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] motion-reduce:transition-none ${room.muted ? "opacity-60" : ""}`}
              >
                {room.emoji && room.type === "channel" ? <span className="shrink-0 text-sm" aria-hidden>{room.emoji}</span> : iconFor(room)}
                <span className={`min-w-0 flex-1 truncate text-sm ${unread > 0 || room.mentionCount > 0 ? "font-semibold" : ""}`}>{titleOf(room)}</span>
                {room.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("sidebar.muted")} />}
                {room.mentionCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-4 text-white" aria-label={t("sidebar.mentionsCount", { count: room.mentionCount })}>@{room.mentionCount}</span>
                ) : unread > 0 ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-foreground" aria-label={t("sidebar.unreadMessages", { count: unread })} />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
