"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Hash, Link2, MessageSquare, Plus, FolderPlus } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { listTeamRooms, listTeamRoomGroups, type Room, type RoomGroup } from "@/lib/api/rooms";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { CreateRoomGroupModal } from "@/components/rooms/CreateRoomGroupModal";

export default function RoomsPageMobile() {
  const router = useRouter();
  const t = useTranslations("rooms");
  const { accessToken, activeTeamId, user } = useSession();
  const { isAdmin } = useActiveTeamRole(activeTeamId, accessToken, user?.id);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [groups, setGroups] = useState<RoomGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [initialGroupId, setInitialGroupId] = useState<string | undefined>();

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    setIsLoading(true);
    Promise.all([
      listTeamRooms(activeTeamId, accessToken),
      listTeamRoomGroups(activeTeamId, accessToken),
    ])
      .then(([fetchedRooms, fetchedGroups]) => {
        setRooms(fetchedRooms);
        setGroups(fetchedGroups);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  const channels = useMemo(() => rooms.filter((r) => r.type === "channel"), [rooms]);
  const dms = useMemo(() => rooms.filter((r) => r.type === "dm"), [rooms]);
  const threads = useMemo(() => rooms.filter((r) => r.type === "thread"), [rooms]);
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.sortOrder - b.sortOrder), [groups]);

  const ungroupedChannels = useMemo(
    () => channels.filter((r) => !r.groupId || !groups.some((g) => g.id === r.groupId)),
    [channels, groups],
  );

  const iconForRoom = (room: Room) => {
    if (room.type === "channel") return <Hash className="w-4 h-4 text-muted-foreground" />;
    if (room.type === "thread") return <Link2 className="w-4 h-4 text-muted-foreground" />;
    return <MessageSquare className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 bg-background/70 backdrop-blur shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{rooms.length} rooms</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsCreateGroupOpen(true)}
              className="p-2 rounded-md hover:bg-accent/10 text-muted-foreground"
              aria-label={t("sidebar.createGroup")}
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setInitialGroupId(undefined);
                setIsCreateOpen(true);
              }}
              className="p-2 rounded-md bg-accent text-accent-foreground"
              aria-label={t("sidebar.createChannel")}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && rooms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-accent" />
            </div>
            <p className="text-sm font-medium">{t("emptyState.title")}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[22rem]">{t("emptyState.description")}</p>
            {isAdmin && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                {t("emptyState.createButton")}
              </button>
            )}
          </div>
        )}

        {!isLoading && rooms.length > 0 && (
          <>
            {(sortedGroups.length === 0 || ungroupedChannels.length > 0) && (
              <RoomSection
                label={t("sidebar.channels")}
                rooms={ungroupedChannels}
                iconForRoom={iconForRoom}
              />
            )}

            {sortedGroups.map((group) => (
              <RoomSection
                key={group.id}
                label={`${group.emoji ? `${group.emoji} ` : ""}${group.name}`}
                rooms={channels.filter((r) => r.groupId === group.id)}
                iconForRoom={iconForRoom}
                onCreateRoom={isAdmin ? () => {
                  setInitialGroupId(group.id);
                  setIsCreateOpen(true);
                } : undefined}
              />
            ))}

            {threads.length > 0 && (
              <RoomSection
                label={t("sidebar.threads")}
                rooms={threads}
                iconForRoom={iconForRoom}
              />
            )}

            {dms.length > 0 && (
              <RoomSection
                label={t("sidebar.directMessages")}
                rooms={dms}
                iconForRoom={iconForRoom}
              />
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
            initialGroupId={initialGroupId}
            onCreated={(roomId) => {
              setIsCreateOpen(false);
              router.push(`/rooms/${roomId}`);
            }}
            t={t}
          />
          <CreateRoomGroupModal
            isOpen={isCreateGroupOpen}
            onClose={() => setIsCreateGroupOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            onCreated={(group) => {
              setGroups((prev) => [...prev, group]);
              setIsCreateGroupOpen(false);
            }}
            t={t}
          />
        </>
      )}
    </div>
  );
}

function RoomSection({
  label,
  rooms,
  iconForRoom,
  onCreateRoom,
}: {
  label: string;
  rooms: Room[];
  iconForRoom: (room: Room) => React.ReactNode;
  onCreateRoom?: () => void;
}) {
  if (rooms.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</h2>
        {onCreateRoom && (
          <button
            onClick={onCreateRoom}
            className="p-1 rounded text-muted-foreground hover:bg-accent/10"
            aria-label="Create room in group"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-1">
        {rooms.map((room) => (
          <Link
            key={room.id}
            href={`/rooms/${room.id}`}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/50 bg-card/40 hover:bg-accent/5 transition-colors"
          >
            {room.emoji ? (
              <span className="text-sm shrink-0">{room.emoji}</span>
            ) : (
              iconForRoom(room)
            )}
            <span className="text-sm truncate">{room.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
