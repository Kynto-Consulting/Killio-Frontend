"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
): { room: Room | null; roomId: string | null; isLoading: boolean; ensureRoom: () => Promise<string | null> } {
  const [room, setRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pending = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    if (!teamId || !entityType || !entityId || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);

    findRoomByEntity(teamId, entityType, entityId, accessToken)
      .then(async (found) => {
        if (cancelled) return;
        // Lookup only: the room is created on the first message (ensureRoom), never because a panel opened.
        setRoom(found ?? null);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, entityType, entityId, accessToken, autoCreate]);

  /** Creates the thread room on demand (first message). Concurrent calls share one request. */
  const ensureRoom = useCallback(async (): Promise<string | null> => {
    if (room) return room.id;
    if (!autoCreate || !teamId || !entityType || !entityId || !accessToken) return null;
    if (!pending.current) {
      pending.current = createRoom(
        teamId,
        {
          name: `${entitySlug[entityType]}-${entityId.slice(-6)}`,
          type: "thread",
          linkedEntityType: entityType,
          linkedEntityId: entityId,
        },
        accessToken
      )
        .then((created) => {
          setRoom(created);
          return created.id;
        })
        .catch((error) => {
          console.error(error);
          return null;
        })
        .finally(() => {
          pending.current = null;
        });
    }
    return pending.current;
  }, [room, autoCreate, teamId, entityType, entityId, accessToken]);

  return { room, roomId: room?.id ?? null, isLoading, ensureRoom };
}
