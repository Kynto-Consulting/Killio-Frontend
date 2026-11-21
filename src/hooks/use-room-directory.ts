"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMyTeamPermissions, listRoomMembers, listTeamRolesLite, listTeamRoomGroups, listTeamRooms,
  type MyTeamPermissions, type Room, type RoomGroup, type TeamRoleLite,
} from "@/lib/api/rooms";
import { teamRoomCapabilities } from "@/lib/rooms/team-capabilities";
import { useRenewOnNewRooms } from "@/hooks/use-room-realtime-access";

export interface DmPeer {
  name: string;
  avatarUrl?: string;
  email?: string;
}

const peerCache = new Map<string, DmPeer | null>();
const MAX_DM_LOOKUPS = 30;

/**
 * Everything the sidebar needs about the team's rooms: rooms (without document / board chats their owner switched off),
 * categories, team roles (colours for mentions and members), the user's team rights and, for each direct message, the
 * OTHER person (the backend names a DM "A, B" for both sides).
 */
export function useRoomDirectory(
  teamId: string | null | undefined,
  accessToken: string | null | undefined,
  userId: string | null | undefined,
  legacyIsAdmin: boolean,
) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [groups, setGroups] = useState<RoomGroup[]>([]);
  const [roles, setRoles] = useState<TeamRoleLite[]>([]);
  const [mine, setMine] = useState<MyTeamPermissions | null>(null);
  const [peers, setPeers] = useState<Record<string, DmPeer | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!teamId || !accessToken) return;
    let cancelled = false;
    setError(false);
    Promise.all([
      listTeamRooms(teamId, accessToken),
      listTeamRoomGroups(teamId, accessToken),
      listTeamRolesLite(teamId, accessToken),
      getMyTeamPermissions(teamId, accessToken),
    ])
      .then(([r, g, ro, perms]) => {
        if (cancelled) return;
        setRooms(r.filter((room) => room.chatEnabled !== false));
        setGroups(g);
        setRoles(ro);
        setMine(perms);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(true);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [teamId, accessToken, version]);

  // A room that appears after the first list (created or shared): the realtime token must learn about it.
  useRenewOnNewRooms(useMemo(() => rooms.map((r) => r.id), [rooms]), !isLoading && !error);

  useEffect(() => {
    if (!accessToken || !userId) return;
    const dms = rooms.filter((r) => r.type === "dm").slice(0, MAX_DM_LOOKUPS);
    const missing = dms.filter((r) => !peerCache.has(r.id));
    if (missing.length === 0) {
      setPeers((prev) => {
        const next = { ...prev };
        for (const r of dms) next[r.id] = peerCache.get(r.id) ?? null;
        return next;
      });
      return;
    }
    let cancelled = false;
    Promise.all(
      missing.map(async (r) => {
        try {
          const members = await listRoomMembers(r.id, accessToken);
          const other = members.find((m) => m.userId !== userId);
          peerCache.set(r.id, other ? { name: other.displayName || other.email, avatarUrl: other.avatarUrl, email: other.email } : null);
        } catch {
          peerCache.set(r.id, null); // the text fallback of dmDisplayName takes over
        }
      })
    ).then(() => {
      if (cancelled) return;
      setPeers((prev) => {
        const next = { ...prev };
        for (const r of dms) next[r.id] = peerCache.get(r.id) ?? null;
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [rooms, accessToken, userId]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const capabilities = useMemo(() => teamRoomCapabilities(mine, legacyIsAdmin), [mine, legacyIsAdmin]);
  const myRoleIds = useMemo(() => (mine?.roles ?? []).map((r) => r.id), [mine]);

  return { rooms, setRooms, groups, setGroups, roles, capabilities, myRoleIds, peers, isLoading, error, refresh };
}
