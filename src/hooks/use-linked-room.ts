"use client";

import { useState, useEffect } from "react";
import { findRoomByEntity, createRoom, type Room, type LinkedEntityType } from "@/lib/api/rooms";

const entitySlug: Record<LinkedEntityType, string> = {
  board: "board",
  mesh: "mesh",
  document: "doc",
};

export function useLinkedRoom(
  teamId: string | null | undefined,
  entityType: LinkedEntityType | null | undefined,
  entityId: string | null | undefined,
  accessToken: string | null | undefined,
  autoCreate = true
): { room: Room | null; roomId: string | null; isLoading: boolean } {
  const [room, setRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!teamId || !entityType || !entityId || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);

    findRoomByEntity(teamId, entityType, entityId, accessToken)
      .then(async (found) => {
        if (cancelled) return;
        if (found) {
          setRoom(found);
        } else if (autoCreate) {
          const created = await createRoom(
            teamId,
            {
              name: `${entitySlug[entityType]}-${entityId.slice(-6)}`,
              type: "thread",
              linkedEntityType: entityType,
              linkedEntityId: entityId,
            },
            accessToken
          );
          if (!cancelled) setRoom(created);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, entityType, entityId, accessToken, autoCreate]);

  return { room, roomId: room?.id ?? null, isLoading };
}
