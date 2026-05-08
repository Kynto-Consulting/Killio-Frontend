"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2, Plus } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { listTeamRooms, type Room } from "@/lib/api/rooms";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";

export default function RoomsPageWeb() {
  const t = useTranslations("rooms");
  const router = useRouter();
  const { accessToken, activeTeamId } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    setIsLoading(true);
    listTeamRooms(activeTeamId, accessToken)
      .then((fetched) => {
        setRooms(fetched);
        if (fetched.length > 0) {
          router.replace(`/rooms/${fetched[0].id}`);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId, router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
        <MessageSquare className="w-7 h-7 text-accent" />
      </div>
      <h2 className="text-xl font-semibold">{t("emptyState.title")}</h2>
      <p className="text-sm text-muted-foreground max-w-xs">{t("emptyState.description")}</p>
      <button
        onClick={() => setIsCreateOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t("emptyState.createButton")}
      </button>

      {activeTeamId && accessToken && (
        <CreateRoomModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          teamId={activeTeamId}
          accessToken={accessToken}
          onCreated={(roomId) => router.push(`/rooms/${roomId}`)}
          t={t}
        />
      )}
    </div>
  );
}
