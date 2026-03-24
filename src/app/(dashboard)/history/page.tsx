"use client";

import {
  History as HistoryIcon,
  User,
  Layout,
  Loader2,
  Tag,
  Edit2,
  MessageSquare,
  Sparkles,
  RefreshCcw,
  Trash2,
  CalendarClock,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import {
  listTeamActivity,
  listTeams,
  listTeamBoards,
  getBoard,
  getTagsByScope,
  ActivityLogEntry,
} from "@/lib/api/contracts";

type ActivityVisual = {
  id: string;
  action: string;
  actorId: string;
  createdAt: string;
  timestamp: number;
  icon: typeof Layout;
  badge: string;
  badgeClass: string;
  message: string;
  detail: string;
  boardLabel: string;
  cardLabel: string;
  tagLabel: string;
  changedFields: string[];
};

const GROUP_WINDOW_MS = 5 * 60 * 1000;

const fieldLabels: Record<string, string> = {
  title: "titulo",
  summary: "descripcion",
  status: "estado",
  urgency_state: "urgencia",
  start_at: "inicio",
  due_at: "fecha limite",
};

function getActionTheme(action: string) {
  const lower = action.toLowerCase();

  if (lower === "card.tag_added") {
    return {
      icon: Tag,
      badge: "Tag Added",
      badgeClass: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
    };
  }

  if (lower === "card.tag_removed") {
    return {
      icon: Tag,
      badge: "Tag Removed",
      badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    };
  }

  if (lower === "card.commented") {
    return {
      icon: MessageSquare,
      badge: "Comment",
      badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    };
  }

  if (lower === "card.updated") {
    return {
      icon: Edit2,
      badge: "Updated",
      badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    };
  }

  if (lower.includes("created")) {
    return {
      icon: Sparkles,
      badge: "Created",
      badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    };
  }

  if (lower.includes("deleted") || lower.includes("removed")) {
    return {
      icon: Trash2,
      badge: "Removed",
      badgeClass: "bg-red-500/15 text-red-300 border-red-500/30",
    };
  }

  if (lower.includes("updated") || lower.includes("edited")) {
    return {
      icon: RefreshCcw,
      badge: "Changed",
      badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    };
  }

  return {
    icon: Layout,
    badge: "Activity",
    badgeClass: "bg-accent/10 text-accent border-accent/20",
  };
}

function prettifyAction(action: string): string {
  const lower = action.toLowerCase();
  if (lower === "card.tag_added") return "Added tag";
  if (lower === "card.tag_removed") return "Removed tag";
  if (lower === "card.commented") return "Commented";
  if (lower === "card.updated") return "Updated card";
  return action.replace(/\./g, " ").replace(/_/g, " ");
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function summarizeGroup(items: ActivityVisual[]): { message: string; detail: string; groupedMeta: string } {
  const head = items[0];
  if (!head) return { message: "", detail: "", groupedMeta: "" };

  if (items.length === 1) {
    return {
      message: head.message,
      detail: head.detail,
      groupedMeta: "",
    };
  }

  const oldest = items[items.length - 1];
  const spanMinutes = Math.max(1, Math.round(Math.abs(head.timestamp - oldest.timestamp) / 60000));
  const groupedMeta = `${items.length} eventos en ${spanMinutes} min`;

  if (head.action === "card.tag_added" || head.action === "card.tag_removed") {
    const tags = Array.from(new Set(items.map((i) => i.tagLabel).filter(Boolean)));
    const cards = Array.from(new Set(items.map((i) => i.cardLabel).filter(Boolean)));
    const verb = head.action === "card.tag_added" ? "Added" : "Removed";
    const detail = [
      tags.length > 0 ? `Tags: ${tags.slice(0, 5).join(", ")}${tags.length > 5 ? ` +${tags.length - 5}` : ""}` : "",
      cards.length > 0 ? `Cards: ${cards.slice(0, 3).join(", ")}${cards.length > 3 ? ` +${cards.length - 3}` : ""}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      message: `${verb} ${tags.length || items.length} tags`,
      detail,
      groupedMeta,
    };
  }

  if (head.action === "card.updated") {
    const fields = Array.from(new Set(items.flatMap((i) => i.changedFields)));
    return {
      message: `Updated card ${items.length} times`,
      detail: fields.length > 0 ? `Fields: ${fields.join(", ")}` : "Multiple updates grouped",
      groupedMeta,
    };
  }

  if (head.action === "card.commented") {
    return {
      message: `Commented ${items.length} times`,
      detail: "Consecutive comments grouped",
      groupedMeta,
    };
  }

  return {
    message: `${prettifyAction(head.action)} x${items.length}`,
    detail: head.detail,
    groupedMeta,
  };
}

export default function HistoryPage() {
  const { accessToken, activeTeamId, user } = useSession();
  const [activities, setActivities] = useState<ActivityVisual[]>([]);
  const [teamName, setTeamName] = useState<string>("this team");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);

      try {
        const [teams, rawActivities, boards] = await Promise.all([
          listTeams(accessToken),
          listTeamActivity(activeTeamId, accessToken),
          listTeamBoards(activeTeamId, accessToken),
        ]);

        if (cancelled) return;

        const active = teams.find((t) => t.id === activeTeamId);
        if (active) {
          setTeamName(active.name);
        }

        const boardNameById = new Map<string, string>();
        for (const board of boards) {
          boardNameById.set(board.id, board.name);
        }

        const boardIds = new Set<string>();
        for (const entry of rawActivities) {
          const payload = (entry.payload || {}) as Record<string, unknown>;
          const payloadBoardId = safeString(payload.boardId);
          if (payloadBoardId) {
            boardIds.add(payloadBoardId);
            continue;
          }
          if (entry.scope === "board") {
            boardIds.add(entry.scopeId);
          }
        }

        const cardNameById = new Map<string, string>();
        const tagNameById = new Map<string, string>();

        const boardIdsList = Array.from(boardIds);
        const boardData = await Promise.allSettled(
          boardIdsList.map(async (boardId) => {
            const [board, tags] = await Promise.all([
              getBoard(boardId, accessToken),
              getTagsByScope("board", boardId, accessToken).catch(() => []),
            ]);

            return { boardId, board, tags };
          })
        );

        for (const result of boardData) {
          if (result.status !== "fulfilled") continue;

          const { boardId, board, tags } = result.value;
          if (!boardNameById.has(boardId)) {
            boardNameById.set(boardId, board.name);
          }

          for (const list of board.lists) {
            for (const card of list.cards) {
              cardNameById.set(card.id, card.title);
              for (const tag of card.tags || []) {
                tagNameById.set(tag.id, tag.name);
              }
            }
          }

          for (const tag of tags) {
            tagNameById.set(tag.id, tag.name);
          }
        }

        const mapped: ActivityVisual[] = rawActivities.map((entry) => {
          const payload = (entry.payload || {}) as Record<string, unknown>;
          const action = entry.action.toLowerCase();

          const payloadBoardId = safeString(payload.boardId);
          const boardId = payloadBoardId || (entry.scope === "board" ? entry.scopeId : "");
          const boardLabel = boardNameById.get(boardId) || (entry.scope === "team" ? active?.name || "team" : entry.scope);

          const cardLabel = cardNameById.get(entry.entityId) || entry.entityType || "card";
          const tagId = safeString(payload.tagId);
          const tagLabel = tagNameById.get(tagId) || (tagId ? `tag:${tagId.slice(0, 8)}` : "");

          const changes = payload.changes && typeof payload.changes === "object"
            ? (payload.changes as Record<string, unknown>)
            : {};
          const changedFields = Object.keys(changes).map((key) => fieldLabels[key] || key);

          const theme = getActionTheme(action);

          let message = prettifyAction(action);
          let detail = boardLabel ? `in ${boardLabel}` : "";

          if (action === "card.tag_added") {
            message = `Added tag ${tagLabel ? `\"${tagLabel}\"` : ""}`.trim();
            detail = `Card: ${cardLabel}${boardLabel ? ` · Board: ${boardLabel}` : ""}`;
          } else if (action === "card.tag_removed") {
            message = `Removed tag ${tagLabel ? `\"${tagLabel}\"` : ""}`.trim();
            detail = `Card: ${cardLabel}${boardLabel ? ` · Board: ${boardLabel}` : ""}`;
          } else if (action === "card.updated") {
            message = `Updated card \"${cardLabel}\"`;
            detail = changedFields.length > 0
              ? `Fields: ${changedFields.join(", ")}${boardLabel ? ` · Board: ${boardLabel}` : ""}`
              : `Card changes${boardLabel ? ` · Board: ${boardLabel}` : ""}`;
          } else if (action === "card.commented") {
            const text = safeString(payload.text);
            message = `Commented on \"${cardLabel}\"`;
            detail = text
              ? `${text.slice(0, 120)}${text.length > 120 ? "..." : ""}`
              : `${boardLabel ? `Board: ${boardLabel}` : "Comment event"}`;
          }

          return {
            id: entry.id,
            action,
            actorId: entry.actorId,
            createdAt: entry.createdAt,
            timestamp: new Date(entry.createdAt).getTime(),
            icon: theme.icon,
            badge: theme.badge,
            badgeClass: theme.badgeClass,
            message,
            detail,
            boardLabel,
            cardLabel,
            tagLabel,
            changedFields,
          };
        });

        if (!cancelled) {
          setActivities(mapped);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setActivities([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeTeamId]);

  const groupedActivities = useMemo(() => {
    const sorted = [...activities].sort((a, b) => b.timestamp - a.timestamp);
    const groups: ActivityVisual[][] = [];

    for (const event of sorted) {
      const lastGroup = groups[groups.length - 1];
      const previous = lastGroup?.[lastGroup.length - 1];

      if (!lastGroup || !previous) {
        groups.push([event]);
        continue;
      }

      const sameType = previous.action === event.action && previous.actorId === event.actorId;
      const withinWindow = Math.abs(previous.timestamp - event.timestamp) <= GROUP_WINDOW_MS;

      if (sameType && withinWindow) {
        lastGroup.push(event);
      } else {
        groups.push([event]);
      }
    }

    return groups;
  }, [activities]);

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-5xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Activity History</h1>
          <p className="text-muted-foreground">Recent changes with context, grouped in 5-minute windows.</p>
        </div>
        <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm h-9 px-4">
          <HistoryIcon className="mr-2 h-4 w-4 opacity-70" />
          Live Logs
        </button>
      </div>

      <div className="relative mt-8">
        <div className="absolute top-4 bottom-4 left-6 w-px bg-border max-md:hidden" />

        <div className="space-y-6">
          {isLoading ? (
            <div className="flex justify-center p-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : groupedActivities.length === 0 ? (
            <div className="pl-12 text-muted-foreground text-sm">No recent activity in this team.</div>
          ) : (
            groupedActivities.map((group) => {
              const head = group[0];
              if (!head) return null;

              const Icon = head.icon;
              const isMe = head.actorId === user?.id;
              const summary = summarizeGroup(group);

              return (
                <div key={head.id} className="relative flex items-start gap-4 md:gap-6 group">
                  <div className="absolute left-[22px] top-4 h-2 w-2 rounded-full bg-accent ring-4 ring-background max-md:hidden" />

                  <div className="h-10 w-10 shrink-0 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground shadow-sm md:ml-[34px] transition-colors z-10">
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 rounded-xl border border-border bg-card/70 backdrop-blur-sm p-4 shadow-sm hover:shadow-md hover:border-accent/40 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-sm font-medium leading-relaxed flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-foreground">{isMe ? "You" : "Team Member"}</span>
                        <span className={`px-2 py-0.5 rounded text-xs border ${head.badgeClass}`}>{head.badge}</span>
                        <span className="font-semibold text-foreground">{summary.message}</span>
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(head.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {summary.detail}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                        <CalendarClock className="h-3 w-3" />
                        {head.boardLabel || teamName}
                      </span>
                      {summary.groupedMeta ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-accent">
                          {summary.groupedMeta}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
