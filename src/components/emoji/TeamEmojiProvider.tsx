"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "@/components/providers/session-provider";
import { useTeamRealtime } from "@/hooks/useTeamRealtime";
import { API_BASE_URL } from "@/lib/api/client";
import { listTeamEmojis } from "@/lib/api/emojis";
import { toCustomEmoji } from "@/lib/emoji/custom";
import type { CustomEmoji } from "@/lib/emoji/types";
import { EmojiProvider } from "./emoji-context";

/**
 * Feeds <EmojiProvider> with the custom emojis of the active team ("Servidor" section, `:name:` in messages,
 * `custom:<id>` reactions) and keeps them fresh with the `team.emoji.*` events of the team channel.
 */
export function TeamEmojiProvider({ children }: { children: ReactNode }) {
  const { accessToken, activeTeamId } = useSession();
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);

  const load = useCallback(async () => {
    if (!accessToken || !activeTeamId) { setEmojis([]); return; }
    try {
      const res = await listTeamEmojis(activeTeamId, accessToken);
      setEmojis(res.emojis.map((e) => toCustomEmoji(e, API_BASE_URL)));
    } catch {
      // Offline or no access: the app keeps working with Unicode emojis only.
      setEmojis([]);
    }
  }, [accessToken, activeTeamId]);

  useEffect(() => { void load(); }, [load]);

  useTeamRealtime(activeTeamId, (e) => {
    if (/^(team\.)?emoji\.(created|updated|deleted)$/.test(String(e.type ?? ""))) void load();
  });

  const value = useMemo(() => emojis, [emojis]);
  return <EmojiProvider customEmojis={value}>{children}</EmojiProvider>;
}
