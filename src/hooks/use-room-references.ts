"use client";

import { useEffect, useMemo, useState } from "react";
import { listDocuments, type DocumentSummary } from "@/lib/api/documents";
import { listTeamBoards, listTeamMembers, type BoardSummary } from "@/lib/api/contracts";
import { listBotCommands } from "@/lib/api/rooms";
import { normalizeWorkspaceMembers, type WorkspaceMember } from "@/lib/workspace-members";
import type { SlashCommand } from "@/lib/rooms/message-structure";

/**
 * What the chat needs to resolve and offer references: the team's documents, boards and people (for `@` mentions and
 * for showing real names), the registered bot slash commands, and real titles for the document / board rooms.
 * Each source fails on its own: a missing list only means fewer suggestions.
 */
export function useRoomReferences(teamId: string | null | undefined, accessToken: string | null | undefined) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [users, setUsers] = useState<WorkspaceMember[]>([]);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [memberRoleIds, setMemberRoleIds] = useState<Map<string, string[]>>(() => new Map());
  const [botIds, setBotIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!teamId || !accessToken) return;
    let cancelled = false;
    Promise.allSettled([
      listDocuments(teamId, accessToken),
      listTeamBoards(teamId, accessToken),
      listTeamMembers(teamId, accessToken),
      listBotCommands(teamId, accessToken),
    ]).then(([docs, brds, members, cmds]) => {
      if (cancelled) return;
      if (docs.status === "fulfilled") setDocuments(docs.value);
      if (brds.status === "fulfilled") setBoards(brds.value);
      if (members.status === "fulfilled") {
        const raw = members.value as any[];
        setUsers(normalizeWorkspaceMembers(raw));
        // Personal roles per person (roles inherited through groups are not in this list).
        setMemberRoleIds(new Map(raw.filter((m) => Array.isArray(m?.roleIds)).map((m) => [String(m.id), m.roleIds as string[]])));
        setBotIds(new Set(raw.filter((m) => m?.isBot === true || m?.is_bot === true).map((m) => String(m.id))));
      }
      if (cmds.status === "fulfilled") {
        setCommands(cmds.value.map((c) => ({ name: c.name, description: c.description, usage: c.usage, source: c.botName, botAvatarUrl: c.botAvatarUrl })));
      }
    });
    return () => { cancelled = true; };
  }, [teamId, accessToken]);

  const entityTitles = useMemo(() => {
    const out: Record<string, string> = {};
    for (const d of documents) if (d.title) out[`document:${d.id}`] = d.title;
    for (const b of boards) {
      if (!b.name) continue;
      out[`board:${b.id}`] = b.name;
      out[`mesh:${b.id}`] = b.name;
    }
    return out;
  }, [documents, boards]);

  return { documents, boards, users, commands, entityTitles, memberRoleIds, botIds };
}
