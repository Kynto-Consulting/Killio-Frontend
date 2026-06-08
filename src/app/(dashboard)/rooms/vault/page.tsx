"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";
import { RoomsLayout } from "@/components/rooms/RoomsLayout";
import { RoomSidebar } from "@/components/rooms/RoomSidebar";
import { VaultAssistantLanding } from "@/components/rooms/VaultAssistantLanding";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { CreateRoomGroupModal } from "@/components/rooms/CreateRoomGroupModal";
import {
  listTeamRooms,
  listTeamRoomGroups,
  createRoom,
  createRoomGroup,
  type Room,
  type RoomGroup,
} from "@/lib/api/rooms";

/**
 * Derive a short, human room title from the user's first message.
 * Takes the first ~6 words, trims, strips trailing punctuation and caps length.
 */
function deriveRoomTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  const words = clean.split(" ").slice(0, 6).join(" ");
  const trimmed = (words.length > 48 ? words.slice(0, 48) : words).replace(/[\s.,;:!?-]+$/, "");
  return trimmed || "Killio";
}

/**
 * /rooms/vault — Killio assistant landing INSIDE the rooms section.
 *
 * Renders the same rooms shell (sidebar + main area) as the rest of /rooms, but
 * the main area shows a from-scratch Killio assistant welcome + composer. On the
 * first message it creates a real room (channel, under the "vault" group) with an
 * auto-generated title, then navigates to /rooms/[id]?ai=<message> so the
 * existing room AI flow streams + persists the reply (no duplicated streaming).
 */
function RoomsVaultPageWeb() {
  const t = useTranslations("rooms");
  const router = useRouter();
  const { accessToken, activeTeamId, user } = useSession();
  const { isAdmin } = useActiveTeamRole(activeTeamId, accessToken, user?.id);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [groups, setGroups] = useState<RoomGroup[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create modals (parity with the rest of the rooms shell)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialGroupId, setCreateInitialGroupId] = useState<string | undefined>();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    listTeamRooms(activeTeamId, accessToken).then(setRooms).catch(console.error);
    listTeamRoomGroups(activeTeamId, accessToken).then(setGroups).catch(console.error);
  }, [accessToken, activeTeamId]);

  const handleSend = useCallback(
    async (message: string) => {
      if (!accessToken || !activeTeamId || isSubmitting) return;
      setIsSubmitting(true);
      try {
        // Find (or lazily create) the "vault" group so the new room is grouped
        // alongside other Killio assistant conversations.
        let vaultGroup = groups.find((g) => g.name.trim().toLowerCase() === "vault");
        if (!vaultGroup) {
          try {
            vaultGroup = await createRoomGroup(activeTeamId, { name: "vault", emoji: "✨" }, accessToken);
          } catch {
            vaultGroup = undefined; // fall back to ungrouped if group creation isn't allowed
          }
        }

        const room = await createRoom(
          activeTeamId,
          {
            name: deriveRoomTitle(message),
            type: "channel",
            groupId: vaultGroup?.id,
            emoji: "✨",
          },
          accessToken,
        );

        // Hand the first message to the new room's AI trigger via a query param.
        // The room page reads `?ai=` on mount and runs the existing AI flow.
        router.push(`/rooms/${room.id}?ai=${encodeURIComponent(message)}`);
      } catch (e) {
        console.error(e);
        setIsSubmitting(false);
      }
    },
    [accessToken, activeTeamId, groups, isSubmitting, router],
  );

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <RoomsLayout
        sidebar={(onClose) => (
          <RoomSidebar
            rooms={rooms}
            groups={groups}
            activeRoomId={null}
            isLoading={false}
            canCreate={isAdmin}
            onSelectRoom={(id) => { router.push(`/rooms/${id}`); onClose(); }}
            onCreateRoom={(groupId) => {
              setCreateInitialGroupId(groupId);
              setIsCreateOpen(true);
              onClose();
            }}
            onCreateGroup={() => { setIsCreateGroupOpen(true); onClose(); }}
            onClose={onClose}
            t={t}
          />
        )}
      >
        <VaultAssistantLanding
          userName={user?.displayName ?? user?.username ?? undefined}
          onSend={handleSend}
          isSubmitting={isSubmitting}
          t={t}
        />
      </RoomsLayout>

      {activeTeamId && accessToken && (
        <>
          <CreateRoomModal
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            groups={groups}
            initialGroupId={createInitialGroupId}
            onCreated={(newRoomId) => {
              setIsCreateOpen(false);
              router.push(`/rooms/${newRoomId}`);
            }}
            t={t}
          />
          <CreateRoomGroupModal
            isOpen={isCreateGroupOpen}
            onClose={() => setIsCreateGroupOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            onCreated={(newGroup) => {
              setGroups((prev) => [...prev, newGroup]);
              setIsCreateGroupOpen(false);
            }}
            t={t}
          />
        </>
      )}
    </div>
  );
}

export default function RoomsVaultPage() {
  return (
    <OfflineRouteFallback view="rooms">
      <RoomsVaultPageWeb />
    </OfflineRouteFallback>
  );
}
