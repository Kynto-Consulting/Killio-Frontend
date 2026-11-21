"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { listTeamRolesLite, type TeamRoleLite } from "@/lib/api/rooms";
import { useRoomPermissions } from "@/hooks/use-room-permissions";
import { EVERYONE_TOKEN, neutralizeEveryone, roleMentionToken, toWireMentions } from "@/lib/rooms/mentions";

/**
 * Mentions for the chat of a board or document (a room bound to an entity): the same rows (roles, @everyone) and the same
 * wire format as in the channels. `prepare(text)` converts what the composer holds into what the server interprets.
 */
export function useRoomMentionSupport(
  teamId: string | null | undefined,
  roomId: string | null | undefined,
  accessToken: string | null | undefined,
) {
  const tRooms = useTranslations("rooms");
  const [roles, setRoles] = useState<TeamRoleLite[]>([]);
  const { controls } = useRoomPermissions(roomId, accessToken, {});
  const canMentionEveryone = Boolean(controls.canMentionEveryone);

  useEffect(() => {
    if (!teamId || !accessToken) return;
    let cancelled = false;
    listTeamRolesLite(teamId, accessToken).then((r) => { if (!cancelled) setRoles(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [teamId, accessToken]);

  const extraMentions = useMemo(() => [
    ...(canMentionEveryone ? [{ token: EVERYONE_TOKEN, label: "everyone", mentionType: "everyone" as const, subtitle: tRooms("mention.everyoneHint"), search: "everyone todos all here" }] : []),
    ...roles.filter((r) => r.mentionable).map((r) => ({
      token: roleMentionToken(r), label: r.name, mentionType: "role" as const, color: r.color, subtitle: tRooms("mention.role"), search: `role rol ${r.name}`,
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [roles, canMentionEveryone]);

  const prepare = useCallback(
    (text: string) => toWireMentions(neutralizeEveryone(text, canMentionEveryone)),
    [canMentionEveryone],
  );

  return { roles, extraMentions, prepare, canMentionEveryone };
}
