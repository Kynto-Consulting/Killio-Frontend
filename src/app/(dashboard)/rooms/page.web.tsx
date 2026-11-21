"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import { useRoomDirectory } from "@/hooks/use-room-directory";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { SkeletonRoomRow } from "@/components/ui/skeleton";
import { buildSidebarModel, type LayoutRoom } from "@/lib/rooms/channel-layout";

/** `/rooms`: opens the first channel (the one the channel bar lists first); with no rooms it explains what to do. */
export default function RoomsPageWeb() {
  const t = useTranslations("rooms");
  const router = useRouter();
  const { accessToken, activeTeamId, user } = useSession();
  const { can: canTeam } = useTeamPermissions(activeTeamId, accessToken, user?.id);
  const isAdmin = canTeam("rooms.manage");
  const directory = useRoomDirectory(activeTeamId, accessToken, user?.id, isAdmin);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const firstRoomId = useMemo(() => {
    if (directory.isLoading || directory.rooms.length === 0) return null;
    const model = buildSidebarModel(directory.rooms as (typeof directory.rooms[number] & LayoutRoom)[], directory.groups.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, sortOrder: g.sortOrder })));
    const channel = model.categories.flatMap((c) => c.rooms)[0];
    return (channel ?? model.entityGroups[0]?.rooms[0] ?? model.directMessages[0])?.id ?? null;
  }, [directory.isLoading, directory.rooms, directory.groups]);

  useEffect(() => {
    if (firstRoomId) router.replace(`/rooms/${firstRoomId}`);
  }, [firstRoomId, router]);

  if (directory.isLoading || firstRoomId) {
    return (
      <div className="flex h-full flex-col divide-y divide-border" role="status" aria-label={t("sidebar.loading")}>
        {[1, 2, 3, 4, 5].map((i) => <SkeletonRoomRow key={i} />)}
      </div>
    );
  }

  if (directory.error) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("sidebar.loadError")}</p>
        <button type="button" onClick={directory.refresh} className="rounded-lg border-2 border-[var(--memphis-line)] px-3 py-1.5 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
          {t("errors.retry")}
        </button>
      </div>
    );
  }

  const canCreate = directory.capabilities.canCreateChannels;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--memphis-line)] bg-muted/40">
        <MessageSquare className="h-7 w-7" aria-hidden />
      </div>
      <h2 className="text-xl font-bold">{t("emptyState.title")}</h2>
      <p className="max-w-xs text-sm text-muted-foreground">{canCreate ? t("emptyState.description") : t("sidebar.emptyNoCreate")}</p>
      {canCreate && (
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--memphis-line)] bg-[hsl(var(--accent-ink))] px-4 py-2 text-sm font-bold text-[hsl(var(--accent-ink-fg))] shadow-[2px_2px_0_0_var(--memphis-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("emptyState.createButton")}
        </button>
      )}

      {activeTeamId && accessToken && (
        <CreateRoomModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          teamId={activeTeamId}
          accessToken={accessToken}
          groups={directory.groups}
          rooms={directory.rooms}
          canEditPermissions={directory.capabilities.canManageChannels}
          onCreated={(roomId) => router.push(`/rooms/${roomId}`)}
          t={t}
        />
      )}
    </div>
  );
}
