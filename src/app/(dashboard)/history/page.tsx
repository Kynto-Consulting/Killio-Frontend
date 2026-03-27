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
  Info
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  listTeamActivity,
  listTeams,
  listTeamBoards,
  getBoard,
  getTagsByScope,
  ActivityLogEntry,
} from "@/lib/api/contracts";
import { ActivityLogModal } from "@/components/ui/activity-log-modal";
import { ResolverContext } from "@/lib/reference-resolver";
import { TagBadge } from "@/components/ui/tag-badge";
import { Fragment } from "react";

type TFunc = (key: string, params?: Record<string, string | number>) => string;

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

const GROUP_WINDOW_MS = 3 * 60 * 1000;

function getActionTheme(action: string, t: TFunc) {
  const lower = action.toLowerCase();

  if (lower === "card.tag_added") {
    return {
      icon: Tag,
      badge: t("badges.tagAdded"),
      badgeClass: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
    };
  }

  if (lower === "card.tag_removed") {
    return {
      icon: Tag,
      badge: t("badges.tagRemoved"),
      badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    };
  }

  if (lower === "card.commented") {
    return {
      icon: MessageSquare,
      badge: t("badges.comment"),
      badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    };
  }

  if (lower === "card.updated") {
    return {
      icon: Edit2,
      badge: t("badges.updated"),
      badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    };
  }

  if (lower.includes("created")) {
    return {
      icon: Sparkles,
      badge: t("badges.created"),
      badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    };
  }

  if (lower.includes("deleted") || lower.includes("removed")) {
    return {
      icon: Trash2,
      badge: t("badges.removed"),
      badgeClass: "bg-red-500/15 text-red-300 border-red-500/30",
    };
  }

  if (lower.includes("updated") || lower.includes("edited")) {
    return {
      icon: RefreshCcw,
      badge: t("badges.changed"),
      badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    };
  }

  return {
    icon: Layout,
    badge: t("badges.activity"),
    badgeClass: "bg-accent/10 text-accent border-accent/20",
  };
}

function prettifyAction(action: string, t: TFunc): string {
  const lower = action.toLowerCase();
  if (lower === "card.tag_added") return t("actions.addedTag");
  if (lower === "card.tag_removed") return t("actions.removedTag");
  if (lower === "card.commented") return t("actions.commented");
  if (lower === "card.updated") return t("actions.updatedCard");
  return action.replace(/\./g, " ").replace(/_/g, " ");
}

function renderMessageTokens(message: string) {
  const parts = message.split(/("tag\.(?:native|custom)\.[^"]+")/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('"tag.')) {
          const tagStr = part.slice(1, -1);
          return (
            <span key={i} className="inline-flex align-middle mx-1">
              <TagBadge tag={{ name: tagStr, slug: tagStr }} />
            </span>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function summarizeGroup(items: ActivityVisual[], t: TFunc): { message: string; detail: string; groupedMeta: string } {
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
  const groupedMeta = t("eventsInMinutes", { count: items.length, minutes: spanMinutes });

  if (head.action === "card.tag_added" || head.action === "card.tag_removed") {
    const tags = Array.from(new Set(items.map((i) => i.tagLabel).filter(Boolean)));
    const cards = Array.from(new Set(items.map((i) => i.cardLabel).filter(Boolean)));
    const isAdded = head.action === "card.tag_added";
    const detail = [
      tags.length > 0 ? t("tagsSummary", { tags: `${tags.slice(0, 5).join(", ")}${tags.length > 5 ? ` +${tags.length - 5}` : ""}` }) : "",
      cards.length > 0 ? t("cardsSummary", { cards: `${cards.slice(0, 3).join(", ")}${cards.length > 3 ? ` +${cards.length - 3}` : ""}` }) : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      message:
        (tags.length || items.length) === 1
          ? t(isAdded ? "addedTagsSummaryOne" : "removedTagsSummaryOne", { count: tags.length || items.length })
          : t(isAdded ? "addedTagsSummary" : "removedTagsSummary", { count: tags.length || items.length }),
      detail,
      groupedMeta,
    };
  }

  if (head.action === "card.updated") {
    const fields = Array.from(new Set(items.flatMap((i) => i.changedFields)));
    return {
      message: items.length === 1 ? t("updatedCardTimeOne", { count: items.length }) : t("updatedCardTimes", { count: items.length }),
      detail: fields.length > 0 ? t("fieldsOnly", { fields: fields.join(", ") }) : t("multipleUpdates"),
      groupedMeta,
    };
  }

  if (head.action === "card.commented") {
    return {
      message: items.length === 1 ? t("commentedTimeOne", { count: items.length }) : t("commentedTimes", { count: items.length }),
      detail: t("commentsGrouped"),
      groupedMeta,
    };
  }

  return {
    message: t("actionGrouped", { action: prettifyAction(head.action, t), count: items.length }),
    detail: head.detail,
    groupedMeta,
  };
}

export default function HistoryPage() {
  const { accessToken, activeTeamId, user } = useSession();
  const t = useTranslations("history");
  const fieldLabels: Record<string, string> = {
    title: t("fields.title"),
    summary: t("fields.summary"),
    status: t("fields.status"),
    start_at: t("fields.startAt"),
    due_at: t("fields.dueAt"),
    completed_at: t("fields.completedAt"),
    archived_at: t("fields.archivedAt"),
  };
  const [teamName, setTeamName] = useState<string>("");
  const [activities, setActivities] = useState<ActivityVisual[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedActivityGroup, setSelectedActivityGroup] = useState<any[] | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [teamDocs, setTeamDocs] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

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

          const theme = getActionTheme(action, t);

          let message = prettifyAction(action, t);
          let detail = boardLabel ? t("inBoard", { board: boardLabel }) : "";

          if (action === "card.tag_added") {
            message = t("addedTagMessage", { tag: tagLabel || "" }).trim();
            detail = t("cardBoardDetail", { card: cardLabel, board: boardLabel || t("teamLabel") });
          } else if (action === "card.tag_removed") {
            message = t("removedTagMessage", { tag: tagLabel || "" }).trim();
            detail = t("cardBoardDetail", { card: cardLabel, board: boardLabel || t("teamLabel") });
          } else if (action === "card.updated") {
            message = t("updatedCardMessage", { card: cardLabel });
            detail = changedFields.length > 0
              ? boardLabel
                ? t("fieldsDetail", { fields: changedFields.join(", "), board: boardLabel })
                : t("fieldsOnly", { fields: changedFields.join(", ") })
              : t("cardChanges", { suffix: boardLabel ? ` · ${t("boardPrefix", { board: boardLabel })}` : "" });
          } else if (action === "card.commented") {
            const text = safeString(payload.text);
            message = t("commentedCardMessage", { card: cardLabel });
            detail = text
              ? `${text.slice(0, 120)}${text.length > 120 ? "..." : ""}`
              : `${boardLabel ? t("boardPrefix", { board: boardLabel }) : t("commentEvent")}`;
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
          setTeamDocs(boardData.map(d => (d as any).value?.board).filter(Boolean));
          // Approximate members from board data
          const membersMap = new Map();
          boardData.forEach(d => {
            if (d.status === 'fulfilled') {
              d.value.board.lists.forEach((l: any) => l.cards.forEach((c: any) => c.assignees?.forEach((u: any) => membersMap.set(u.id, u))));
            }
          });
          setTeamMembers(Array.from(membersMap.values()));
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
  }, [accessToken, activeTeamId, t]);

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
          <h1 className="text-3xl font-bold tracking-tight mb-2">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm h-9 px-4">
          <HistoryIcon className="mr-2 h-4 w-4 opacity-70" />
          {t("liveLogs")}
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
            <div className="pl-12 text-muted-foreground text-sm">{t("noRecent")}</div>
          ) : (
            groupedActivities.map((group) => {
              const head = group[0];
              if (!head) return null;

              const Icon = head.icon;
              const isMe = head.actorId === user?.id;
              const summary = summarizeGroup(group, t);

              return (
                <div key={head.id} className="relative flex items-start gap-4 md:gap-6 group hover:z-50">
                  <div className="absolute left-[22px] top-4 h-2 w-2 rounded-full bg-accent ring-4 ring-background max-md:hidden" />

                  <div className="h-10 w-10 shrink-0 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground shadow-sm md:ml-[34px] transition-colors z-10">
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 rounded-xl border border-border bg-card/70 backdrop-blur-sm p-4 shadow-sm hover:shadow-md hover:border-accent/40 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-sm font-medium leading-relaxed flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-foreground">{isMe ? t("you") : t("teamMember")}</span>
                        <span className={`px-2 py-0.5 rounded text-xs border ${head.badgeClass}`}>{head.badge}</span>
                        <span className="font-semibold text-foreground">{renderMessageTokens(summary.message)}</span>
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
                        {head.boardLabel || teamName || t("teamLabel")}
                      </span>
                      {summary.groupedMeta ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-accent">
                            {summary.groupedMeta}
                          </span>
                          <div className="relative group/info">
                            <button
                              onClick={() => {
                                setSelectedActivityGroup(group);
                                setIsActivityModalOpen(true);
                              }}
                              className="p-1 hover:bg-accent/10 rounded-full transition-colors text-accent/80 shadow-sm border border-accent/20"
                              title={t("viewDetailedHistory")}
                            >
                              <Info className="h-3 w-3" />
                            </button>

                            {/* Hover Summary */}
                            <div className="absolute left-full ml-2 top-0 z-50 invisible group-hover/info:visible bg-card border border-border shadow-2xl rounded-xl p-3 min-w-48 animate-in fade-in zoom-in-95 duration-200">
                              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 mb-2 border-b border-border/40 pb-1.5 flex items-center gap-2">
                                <HistoryIcon className="h-3 w-3" />
                                {t("summary")}
                              </div>
                              <div className="space-y-1.5">
                                {group.map((item, idx) => (
                                  <div key={item.id} className="text-[9px] leading-snug text-foreground/90 flex items-start gap-2">
                                    <span className="text-accent mt-0.5">•</span>
                                    <div className="flex flex-col">
                                      <span className="font-bold">{item.badge}</span>
                                      <span className="text-muted-foreground">{renderMessageTokens(item.message)}</span>
                                    </div>
                                  </div>
                                )).slice(0, 4)}
                                {group.length > 4 && <div className="text-[9px] text-muted-foreground italic pl-3 pt-1 border-t border-border/20 mt-1">{t("andMore", { count: group.length - 4 })}</div>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {selectedActivityGroup && (
        <ActivityLogModal
          isOpen={isActivityModalOpen}
          onClose={() => setIsActivityModalOpen(false)}
          title={t("historyTitle", { badge: selectedActivityGroup[0].badge })}
          activities={selectedActivityGroup.map(v => ({
            id: v.id,
            action: v.action,
            actorId: v.actorId,
            createdAt: v.createdAt,
            payload: { text: v.detail, changes: v.changedFields.reduce((acc: any, f: any) => ({ ...acc, [f]: true }), {}) }
          })) as any}
          teamMembers={teamMembers}
          teamDocs={teamDocs}
          allAvailableTags={[]}
          getActionTheme={(action) => getActionTheme(action, t)}
          prettifyAction={(action) => prettifyAction(action, t)}
          fieldLabels={fieldLabels}
          getResolverContext={(docs, boards, members) => ({ documents: docs, boards, users: members })}
        />
      )}
    </div>
  );
}
