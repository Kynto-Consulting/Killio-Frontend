"use client";

import { useMemo } from "react";

import { usePermissionCatalog } from "@/hooks/use-permission-catalog";
import { buildRoomCatalog, textsOfTeamCatalog, type RoomPermissionCatalog } from "@/lib/rooms/permission-catalog";

/**
 * The keys the channel / category editor shows. `raw` is the answer of `GET /rooms/:id/permissions` (or the category's): its
 * `universe` / `catalog` decide the keys. The team catalogue (already cached for the roles screens, and the only one that
 * honours the app's language) improves the texts and stands in for a channel that does not exist yet. With neither, the
 * fixed list of the editor is used (`source: "fallback"`).
 */
export function useRoomPermissionCatalog(raw: unknown, teamId: string | null | undefined): RoomPermissionCatalog {
  const { catalog: team } = usePermissionCatalog(teamId);
  return useMemo(() => {
    const entries = team.source === "server" ? team.providers.flatMap((p) => p.permissions) : [];
    // The team catalogue stands in only while there is no room answer (a channel being created). A room answer WITHOUT a
    // universe comes from an older server: it would refuse the finer keys, so the fixed list stays.
    return buildRoomCatalog(raw, { texts: entries.length > 0 ? textsOfTeamCatalog(entries) : undefined, teamEntries: raw == null ? entries : undefined });
  }, [raw, team]);
}
