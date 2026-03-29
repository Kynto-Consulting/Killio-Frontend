"use client";

import { Fragment, useState, useEffect, useRef, type ReactNode, useMemo } from "react";
import { X, Send, Bot, Loader2, MessageSquare, History, Tag, Edit2, Sparkles, Trash2, RefreshCcw, Layout, Info, CheckCircle2, FileText } from "lucide-react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";
import { useSession } from "../providers/session-provider";
import { getBoard, listTeamActivity, chatWithAiScope, type BoardView, type ActivityLogEntry, listTeamMembers, updateCard, createTag, updateList, getCardActivity, generateReportDocumentWithAi } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary, createDocument, createDocumentBrick } from "@/lib/api/documents";
import { ResolverContext } from "@/lib/reference-resolver";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";
import { ReferenceTokenInput } from "./reference-token-input";
import { buildAiMessageWithReferenceContext } from "@/lib/reference-ai-context";
import { extractDocumentReferenceIds, formatDateRangeLabel, GENERATE_REPORT_INTENT_REGEX, isTimestampInDateRange, resolveReportDateRange, toDocumentMentionToken } from "@/lib/ai-report";
import { getUserAvatarUrl } from "@/lib/gravatar";

const fieldLabels: Record<string, string> = {
  title: "título",
  summary: "descripción",
  status: "estado",
  start_at: "inicio",
  due_at: "fecha límite",
  completed_at: "completada",
  archived_at: "archivada",
};

function getActionTheme(action: string) {
  const lower = action.toLowerCase();
  if (lower === "card.tag_added") return { icon: Tag, badge: "Etiqueta", badgeClass: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" };
  if (lower === "card.tag_removed") return { icon: Tag, badge: "Borrado", badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
  if (lower === "card.commented" || lower === "board.commented") return { icon: MessageSquare, badge: "Comentario", badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
  if (lower === "card.updated") return { icon: Edit2, badge: "Actualizado", badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  if (lower.includes("created")) return { icon: Sparkles, badge: "Creado", badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (lower.includes("deleted") || lower.includes("removed")) return { icon: Trash2, badge: "Eliminado", badgeClass: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (lower.includes("updated") || lower.includes("edited")) return { icon: RefreshCcw, badge: "Cambio", badgeClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
  return { icon: Layout, badge: "Actividad", badgeClass: "bg-accent/10 text-accent border-accent/20" };
}

function prettifyAction(action: string): string {
  const lower = action.toLowerCase();
  if (lower === "card.tag_added") return "Añadió etiqueta";
  if (lower === "card.tag_removed") return "Quitó etiqueta";
  if (lower === "card.commented") return "Comentó";
  if (lower === "board.commented") return "Habló en el chat";
  if (lower === "card.updated") return "Actualizó tarjeta";
  if (lower === "card.created") return "Creó tarjeta";
  if (lower === "list.created") return "Añadió lista";
  return action.replace(/\./g, " ").replace(/_/g, " ").replace("created", "creado").replace("updated", "actualizado");
}

type Message = {
  id: number;
  role: "system" | "bot" | "user";
  content: string;
  avatar?: string;
  avatarUrl?: string | null;
  email?: string | null;
  loading?: boolean;
};

function getResolverContext(teamDocs: DocumentSummary[], teamBoards: any[], teamMembers: any[]): ResolverContext {
  return {
    documents: teamDocs,
    boards: teamBoards,
    users: (teamMembers || []).map(m => ({ id: m.id, name: m.displayName || m.name, avatarUrl: m.avatarUrl }))
  };
}

function hashString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getUserTintStyles(seed: string): { bg: string; border: string; text: string } {
  const palette = [
    { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.35)", text: "#93c5fd" },
    { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.35)", text: "#6ee7b7" },
    { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.35)", text: "#fcd34d" },
  ];
  return palette[hashString(seed || "user") % palette.length];
}

export function BoardChatDrawer({
  isOpen,
  onClose,
  boardId,
  initialTab = "chat"
}: {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  initialTab?: 'copilot' | 'chat' | 'activity';
}) {
  const { accessToken, activeTeamId, user } = useSession();
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [aiMessages, setAiMessages] = useState<Message[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { id: 0, role: "system", content: "Team Chat conectado. Bienvenidos." },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<string[]>([]);
  const [allAvailableTags, setAllAvailableTags] = useState<any[]>([]);
  const [teamDocs, setTeamDocs] = useState<DocumentSummary[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamBoardsForMentions, setTeamBoardsForMentions] = useState<any[]>([]);
  const [boardCardsForMentions, setBoardCardsForMentions] = useState<Array<{ id: string; title: string }>>([]);
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectedActivityGroup, setSelectedActivityGroup] = useState<ActivityLogEntry[] | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchActivity = async () => {
    if (!accessToken || !activeTeamId || !boardId || teamMembers.length === 0) return;
    try {
      const data = await listTeamActivity(activeTeamId, accessToken);
      const boardActivity = data.filter(a => a.scopeId === boardId || (a.payload as any)?.boardId === boardId);
      setActivities(boardActivity);

      // If we haven't loaded chat messages yet, parse them from activity logs
      if (chatMessages.length <= 1) {
        const comments = boardActivity
          .filter(a => a.action === 'board.commented')
          .reverse() // activity logs are newest first, we want oldest first for chat flow
          .map(a => {
            const member = teamMembers.find(m => m.id === a.actorId || m.userId === a.actorId);
            return {
              id: a.id as any,
              role: a.actorId === user?.id ? 'user' : 'bot',
              content: (a.payload as any)?.text || "",
              avatar: member?.displayName?.[0] || member?.name?.[0] || '?',
              avatarUrl: member?.avatarUrl || member?.avatar_url || null,
              email: member?.email || null,
            } as Message;
          });

        if (comments.length > 0) {
          setChatMessages(prev => [prev[0], ...comments]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch activity", e);
    }
  };

  useEffect(() => {
    if (isOpen && (activeTab === 'activity' || activeTab === 'chat')) {
      fetchActivity();
    }
  }, [isOpen, activeTab, boardId, teamMembers]);

  useEffect(() => {
    if (isOpen && boardId && accessToken && activeTeamId) {
      Promise.all([
        getBoard(boardId, accessToken),
        listDocuments(activeTeamId, accessToken),
        listTeamMembers(activeTeamId, accessToken)
      ]).then(([board, docs, members]) => {
        const tags = Array.from(new Set(
          board.lists.flatMap(l => l.cards.flatMap((c: any) => (c.tags || []).map((t: any) => JSON.stringify({ id: t.id, name: t.name, slug: t.slug, color: t.color, tag_kind: t.tag_kind }))))
        )).map(str => JSON.parse(str as string)).filter(Boolean);
        setAllAvailableTags(tags);
        setTeamDocs(docs);
        setTeamMembers(members);
        setTeamBoardsForMentions([
          {
            id: board.id,
            name: board.name,
          },
        ]);
        setBoardCardsForMentions(
          board.lists.flatMap((list) =>
            list.cards.map((card) => ({
              id: card.id,
              title: card.title,
            }))
          )
        );
      }).catch(console.error);
    }
  }, [isOpen, boardId, accessToken, activeTeamId]);

  const groupedActivities = useMemo(() => {
    const windowMs = 3 * 60 * 1000;
    const groups: ActivityLogEntry[][] = [];

    // Activities are usually newest first from the API
    for (const a of activities) {
      const lastGroup = groups[groups.length - 1];
      const head = lastGroup?.[0];

      if (!head) {
        groups.push([a]);
        continue;
      }

      const sameActor = head.actorId === a.actorId;
      const sameAction = head.action === a.action;
      const timeDiff = Math.abs(new Date(head.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (sameActor && sameAction && timeDiff <= windowMs) {
        lastGroup.push(a);
      } else {
        groups.push([a]);
      }
    }
    return groups;
  }, [activities]);

  const cleanText = (value?: string | null) => {
    if (!value) return "";
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const clipAiContext = (value: unknown, max = 140) => {
    const normalized = cleanText(String(value ?? ""));
    if (!normalized) return "";
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max)}...`;
  };

  const summarizeBrickForAi = (brick: any) => {
    const kind = String(brick?.kind || "unknown");
    if (kind === "text") {
      const markdown = brick?.markdown ?? brick?.content?.markdown;
      const displayStyle = brick?.displayStyle ?? brick?.content?.displayStyle;
      return `text(style=${displayStyle || "paragraph"}, md=${clipAiContext(markdown) || "empty"})`;
    }
    if (kind === "table") {
      const rows = Array.isArray(brick?.rows) ? brick.rows : Array.isArray(brick?.content?.rows) ? brick.content.rows : [];
      const rowCount = rows.length;
      const colCount = rowCount > 0 && Array.isArray(rows[0]) ? rows[0].length : 0;
      const preview = rowCount > 0 ? clipAiContext((rows[0] || []).join(" | "), 100) : "empty";
      return `table(rows=${rowCount}, cols=${colCount}, head=${preview || "empty"})`;
    }
    if (kind === "checklist") {
      const items = Array.isArray(brick?.items) ? brick.items : Array.isArray(brick?.content?.items) ? brick.content.items : [];
      const done = items.filter((item: any) => !!item?.checked).length;
      const preview = items.slice(0, 3).map((item: any) => clipAiContext(item?.label, 60)).filter(Boolean).join("; ");
      return `checklist(done=${done}/${items.length}, items=${preview || "none"})`;
    }
    if (kind === "media") {
      return `media(type=${brick?.mediaType || brick?.content?.mediaType || "file"}, title=${clipAiContext(brick?.title ?? brick?.content?.title, 70) || "none"}, caption=${clipAiContext(brick?.caption ?? brick?.content?.caption, 70) || "none"}, url=${clipAiContext(brick?.url ?? brick?.content?.url, 90) || "none"})`;
    }
    if (kind === "ai") {
      return `ai(status=${brick?.status || brick?.content?.status || "unknown"}, title=${clipAiContext(brick?.title ?? brick?.content?.title, 70) || "none"}, prompt=${clipAiContext(brick?.prompt ?? brick?.content?.prompt, 90) || "none"}, response=${clipAiContext(brick?.response ?? brick?.content?.response, 90) || "none"})`;
    }
    if (kind === "graph") {
      const graphData = Array.isArray(brick?.data) ? brick.data : Array.isArray(brick?.content?.data) ? brick.content.data : [];
      const tableSource = brick?.tableSource ?? brick?.content?.tableSource;
      const sourceLabel = tableSource?.brickId ? `table:${String(tableSource.brickId).slice(0, 8)}` : "manual";
      return `graph(type=${brick?.type || brick?.content?.type || "line"}, title=${clipAiContext(brick?.title ?? brick?.content?.title, 70) || "none"}, source=${sourceLabel}, points=${graphData.length})`;
    }
    if (kind === "accordion") {
      return `accordion(title=${clipAiContext(brick?.title ?? brick?.content?.title, 70) || "none"}, expanded=${(brick?.isExpanded ?? brick?.content?.isExpanded) ? "yes" : "no"}, body=${clipAiContext(brick?.body ?? brick?.content?.body, 100) || "empty"})`;
    }
    return `${kind}(raw=${clipAiContext(JSON.stringify(brick), 120) || "none"})`;
  };

  const summarizeCard = (card: any) => {
    const tags = (card.tags || []).map((t: any) => t.name).filter(Boolean).join(", ") || "none";
    const assignees = (card.assignees || []).map((a: any) => a.name || a.displayName || a.email).filter(Boolean).join(", ") || "none";
    const textBricks = (card.blocks || []).filter((b: any) => b.kind === "text");
    const checklistBricks = textBricks.filter((b: any) => b.displayStyle === "checklist");
    const checklistTotal = checklistBricks.reduce((acc: number, b: any) => acc + (b.tasks?.length || 0), 0);
    const checklistDone = checklistBricks.reduce((acc: number, b: any) => acc + (b.tasks || []).filter((t: any) => t.checked).length, 0);
    const summary = cleanText(card.summary);
    const shortSummary = summary ? summary.slice(0, 220) : "No summary";

    const brickList = (card.blocks || []).slice(0, 12).map((brick: any, index: number) => `[${index + 1}] ${summarizeBrickForAi(brick)}`).join(" || ") || "none";

    return [
      `Card: ${card.title}`,
      `status: ${card.status || "active"}`,
      `due: ${card.dueAt || "none"}`,
      `tags: ${tags}`,
      `assignees: ${assignees}`,
      `bricks: ${(card.blocks || []).length}`,
      `checklist: ${checklistDone}/${checklistTotal}`,
      `summary: ${shortSummary}`,
      `brickDetails: ${brickList}`,
    ].join(" | ");
  };

  const buildBoardContextSummary = (
    board: BoardView,
    activity: ActivityLogEntry[],
    realtime: string[],
  ) => {
    const cardCount = board.lists.reduce((acc, l) => acc + l.cards.length, 0);

    const listLines = board.lists.map((list) => {
      const cards = list.cards.map((card) => `  - ${summarizeCard(card)}`).join("\n");
      return `List: ${list.name} (${list.cards.length} cards)\n${cards || "  - No cards"}`;
    });

    const activityLines = activity.slice(0, 40).map((entry) => {
      const actor = teamMembers.find(m => m.id === entry.actorId || m.userId === entry.actorId);
      const actorName = actor?.displayName || actor?.name || actor?.email || entry.actorId || 'User';
      const payload = entry.payload && typeof entry.payload === "object" ? JSON.stringify(entry.payload).slice(0, 280) : "{}";
      return `- [${entry.createdAt}] ${actorName} did ${entry.action} (${entry.scope}:${entry.scopeId}) payload=${payload}`;
    });

    const realtimeLines = realtime.slice(0, 20).map((e) => `- ${e}`);

    const summary = [
      `Board: ${board.name}`,
      `Description: ${board.description || "none"}`,
      `Visibility: ${board.visibility}`,
      `Totals: ${board.lists.length} lists, ${cardCount} cards`,
      "",
      "Board structure and cards:",
      ...listLines,
      "",
      "Recent board/card activity logs:",
      ...(activityLines.length > 0 ? activityLines : ["- No activity logs available"]),
      "",
      "Recent realtime events:",
      ...(realtimeLines.length > 0 ? realtimeLines : ["- No realtime events recorded in this session"]),
    ].join("\n");

    return summary.slice(0, 15000);
  };

  const filterBoardActivity = (all: ActivityLogEntry[], targetBoardId?: string) => {
    if (!targetBoardId) return [];
    return all.filter((entry) => {
      const payloadBoardId = (entry.payload as Record<string, unknown> | undefined)?.boardId;
      if (entry.scope === "board" && entry.scopeId === targetBoardId) return true;
      if (typeof payloadBoardId === "string" && payloadBoardId === targetBoardId) return true;
      return false;
    });
  };

  const generateBoardTechnicalReport = async (sourcePrompt: string) => {
    if (!boardId || !accessToken || !activeTeamId || isGeneratingReport) return;

    const effectiveRange = resolveReportDateRange(sourcePrompt, {
      from: reportFromDate || undefined,
      to: reportToDate || undefined,
    });

    const loadingId = Date.now();
    setIsGeneratingReport(true);
    setAiMessages((prev) => [...prev, { id: loadingId, role: "bot", content: "", loading: true }]);

    try {
      const [boardData, allDocs, teamActivity] = await Promise.all([
        getBoard(boardId, accessToken),
        listDocuments(activeTeamId, accessToken),
        listTeamActivity(activeTeamId, accessToken),
      ]);

      const cards = boardData.lists.flatMap((list) => list.cards.map((card) => ({ listName: list.name, card })));
      const cardActivityByCard = await Promise.all(
        cards.map(async ({ card }) => {
          try {
            const logs = await getCardActivity(card.id, accessToken);
            return { cardId: card.id, logs: (logs || []) as ActivityLogEntry[] };
          } catch {
            return { cardId: card.id, logs: [] as ActivityLogEntry[] };
          }
        }),
      );

      const boardActivity = filterBoardActivity(teamActivity, boardId).filter((log) =>
        isTimestampInDateRange(log.createdAt, effectiveRange),
      );

      const cardActivity = cardActivityByCard.flatMap(({ logs }) =>
        logs.filter((log) => isTimestampInDateRange(log.createdAt, effectiveRange)),
      );

      const referencedDocIds = new Set<string>();
      cards.forEach(({ card }) => {
        extractDocumentReferenceIds(card, referencedDocIds);
      });
      boardActivity.forEach((entry) => extractDocumentReferenceIds(entry, referencedDocIds));
      cardActivity.forEach((entry) => extractDocumentReferenceIds(entry, referencedDocIds));

      const referencedDocs = allDocs.filter((doc) => referencedDocIds.has(doc.id));
      const referencedDocTokens = referencedDocs.map((doc) => toDocumentMentionToken(doc.id, doc.title));

      const cardLines = cards.slice(0, 80).map(({ listName, card }) => `- [${listName}] ${summarizeCard(card)}`);

      const cardChatLines = cards.flatMap(({ card }) => {
        const logs = cardActivityByCard.find((item) => item.cardId === card.id)?.logs || [];
        return logs
          .filter((log) => log.action === "card.commented" && isTimestampInDateRange(log.createdAt, effectiveRange))
          .slice(0, 20)
            .map((log) => {
              const actor = teamMembers.find((m) => m.id === log.actorId || m.userId === log.actorId);
              const actorName = actor?.displayName || actor?.name || actor?.email || "Alguien";
              return `- [${log.createdAt}] ${actorName} in ${card.title}: ${String((log.payload as any)?.text || "")}`;
            });
        }).slice(0, 200);

        const activityLines = [...boardActivity, ...cardActivity]
          .slice(0, 250)
          .map((log) => {
             const actor = teamMembers.find((m) => m.id === log.actorId || m.userId === log.actorId);
             const actorName = actor?.displayName || actor?.name || actor?.email || "Alguien";
             return `- [${log.createdAt}] ${actorName} did ${log.action} (${log.scope}:${log.scopeId})`;
          });
      const dateRangeLabel = formatDateRangeLabel(effectiveRange);

      const contextSummary = [
        `Board: ${boardData.name}`,
        `Date range: ${dateRangeLabel}`,
        `Cards: ${cards.length}`,
        "",
        "Cards snapshot:",
        ...(cardLines.length > 0 ? cardLines : ["- none"]),
        "",
        "Card chats:",
        ...(cardChatLines.length > 0 ? cardChatLines : ["- none"]),
        "",
        "Board and card activities:",
        ...(activityLines.length > 0 ? activityLines : ["- none"]),
        "",
        "Referenced document mentions:",
        ...(referencedDocTokens.length > 0 ? referencedDocTokens.map((token) => `- ${token}`) : ["- none"]),
      ].join("\n").slice(0, 16000);

      const reportResult = await generateReportDocumentWithAi(
        {
          scope: "board",
          scopeId: boardId,
          contextSummary,
          dateRangeLabel,
          userPrompt: sourcePrompt,
          referencedDocuments: referencedDocs.map((doc) => ({ id: doc.id, title: doc.title })),
        },
        accessToken,
      );

      const reportTitle = reportResult.title?.trim() || `Tech Report · ${boardData.name} · ${dateRangeLabel}`;
      const createdDoc = await createDocument({ teamId: activeTeamId, title: reportTitle }, accessToken);

      const reportBricks = Array.isArray(reportResult.bricks) && reportResult.bricks.length > 0
        ? reportResult.bricks
        : [
          {
            kind: "text" as const,
            content: { markdown: `# Technical Report\n\n- Board: ${boardData.name}\n- Date range: ${dateRangeLabel}` },
          },
        ];

      for (let i = 0; i < reportBricks.length; i += 1) {
        const brick = reportBricks[i];
        await createDocumentBrick(
          createdDoc.id,
          {
            kind: brick.kind,
            position: i,
            content: brick.content,
          },
          accessToken,
        );
      }

      setTeamDocs((prev) => (prev.some((doc) => doc.id === createdDoc.id) ? prev : [createdDoc, ...prev]));
      setAiMessages((prev) => [
        ...prev.filter((msg) => msg.id !== loadingId),
        {
          id: Date.now() + 1,
          role: "bot",
          content: `Reporte técnico generado: ${toDocumentMentionToken(createdDoc.id, createdDoc.title)}`,
        },
      ]);
    } catch (error) {
      console.error("Failed to generate board technical report", error);
      setAiMessages((prev) => [
        ...prev.filter((msg) => msg.id !== loadingId),
        {
          id: Date.now() + 1,
          role: "bot",
          content: "No pude generar el reporte técnico en este momento. Intenta de nuevo.",
        },
      ]);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Subscribe to Ably realtime events for this board
  useBoardRealtime(boardId, (event: BoardEvent) => {
    const compactEvent = `${event.type}: ${JSON.stringify(event.payload).slice(0, 240)}`;
    setRealtimeEvents((prev) => [compactEvent, ...prev].slice(0, 25));

    if (event.type === 'board.commented') {
      const { userId, text } = event.payload as { userId: string, text: string };
      if (userId === user?.id) return; // We already added our own message locally

      const member = teamMembers.find(m => m.id === userId || m.userId === userId);
      const msg: Message = {
        id: Date.now(),
        role: "bot", // Styled as other-user
        content: text,
        avatar: member?.displayName?.[0] || member?.name?.[0] || '?',
        avatarUrl: member?.avatarUrl || member?.avatar_url || null,
        email: member?.email || null,
      };
      setChatMessages(prev => [...prev, msg]);
    }
  }, accessToken);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, chatMessages]);

  const handleAiAction = async (actionData: any) => {
    if (!boardId || !accessToken) return;

    const action = String(actionData?.action || actionData?.type || '').toUpperCase();
    const payload = (actionData?.payload && typeof actionData.payload === 'object') ? actionData.payload : actionData;
    const entityId = String(actionData?.id || payload?.id || payload?.entityId || '').trim();

    try {
      if (action === 'CARD_RENAME') {
        const cardId = entityId || String(payload?.cardId || '').trim();
        const title = String(payload?.title || '').trim();
        if (!cardId || !title) throw new Error('CARD_RENAME requiere cardId e title');
        await updateCard(cardId, { title }, accessToken);
      } else if (action === 'TAG_ADD') {
        const cardId = entityId || String(payload?.cardId || '').trim();
        const tagName = String(payload?.tagName || '').trim();
        if (!cardId || !tagName) throw new Error('TAG_ADD requiere cardId y tagName');

        const { addCardTag, createTag: apiCreateTag } = await import("@/lib/api/contracts");
        let tag = allAvailableTags.find(t => String(t.name || '').toLowerCase() === tagName.toLowerCase());
        if (!tag) {
          tag = await apiCreateTag({
            scopeType: 'board',
            scopeId: boardId,
            name: tagName,
            color: payload?.color || '#3b82f6',
            tagKind: 'custom'
          }, accessToken);
          setAllAvailableTags(prev => [...prev, tag]);
        }
        await addCardTag(cardId, tag.id, accessToken);
      } else if (action === 'CARD_MOVE') {
        const cardId = entityId || String(payload?.cardId || '').trim();
        const targetListId = String(payload?.targetListId || payload?.listId || '').trim();
        if (!cardId || !targetListId) throw new Error('CARD_MOVE requiere cardId y targetListId');
        await updateCard(cardId, { list_id: targetListId }, accessToken);
      } else if (action === 'CARD_UPDATE') {
        const cardId = entityId || String(payload?.cardId || '').trim();
        if (!cardId) throw new Error('CARD_UPDATE requiere cardId');

        const updates: Record<string, any> = {};
        if (payload?.title !== undefined) updates.title = payload.title;
        if (payload?.summary !== undefined) updates.summary = payload.summary;
        if (payload?.status !== undefined) updates.status = payload.status;
        if (payload?.start_at !== undefined) updates.start_at = payload.start_at;
        if (payload?.due_at !== undefined) updates.due_at = payload.due_at;
        if (payload?.completed_at !== undefined) updates.completed_at = payload.completed_at;
        if (payload?.archived_at !== undefined) updates.archived_at = payload.archived_at;
        if (payload?.targetListId !== undefined || payload?.list_id !== undefined) {
          updates.list_id = payload?.list_id ?? payload?.targetListId;
        }

        if (Object.keys(updates).length === 0) throw new Error('CARD_UPDATE no contiene campos a actualizar');
        await updateCard(cardId, updates, accessToken);
      } else if (action === 'LIST_RENAME') {
        const listId = entityId || String(payload?.listId || '').trim();
        const name = String(payload?.title || payload?.name || '').trim();
        if (!listId || !name) throw new Error('LIST_RENAME requiere listId y title/name');
        await updateList(boardId, listId, { name }, accessToken);
      } else if (action === 'REPORT_GENERATE') {
        const prompt = String(payload?.prompt || 'Generar reporte técnico del tablero').trim();
        await generateBoardTechnicalReport(prompt);
      } else {
        throw new Error(`Accion no soportada: ${action || 'UNKNOWN'}`);
      }

      window.dispatchEvent(new Event('board:refresh'));
      if (action !== 'REPORT_GENERATE') {
        setAiMessages(prev => [...prev, { id: Date.now(), role: 'bot', content: `He ejecutado la acción: ${action}.` }]);
      }
    } catch (err) {
      console.error("Failed to execute AI action", err);
      setAiMessages(prev => [...prev, { id: Date.now(), role: 'bot', content: `No pude ejecutar la acción ${action || 'UNKNOWN'}. Verifica IDs y permisos.` }]);
    }
  };

  const parseAiActions = (text: string) => {
    const actions: any[] = [];
    let cleanText = text;

    const processMatch = (declaredType: string, jsonStr: string, fullMatch: string) => {
      try {
        const raw = JSON.parse(jsonStr);
        const action = String(raw?.action || raw?.type || declaredType).trim().toUpperCase();
        const explanation = String(raw?.explanation || '').trim();
        const id = String(raw?.id || raw?.entityId || raw?.cardId || raw?.listId || '').trim();

        let payload = raw?.payload;
        if (!payload || typeof payload !== 'object') {
          payload = { ...raw };
          delete payload.action;
          delete payload.type;
          delete payload.id;
          delete payload.entityId;
          delete payload.explanation;
        }

        actions.push({
          type: declaredType,
          action,
          id,
          payload,
          explanation,
        });
        cleanText = cleanText.replace(fullMatch, ''); if (explanation && !cleanText.includes(explanation)) cleanText = cleanText.trim() + '\n\n' + explanation;
      } catch (e) {
        console.error("Failed to parse AI action JSON", e);
      }
    };

    const regex = /\[ACTION:([^\]]+)\]\s*([\s\S]*?)\s*\[\/ACTION\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      processMatch(match[1], match[2], match[0]);
    }

    const fallbackRegex = /\[([A-Z_]+)\]\s*(\{[\s\S]*?\})\s*\[\/\1\]/g;
    while ((match = fallbackRegex.exec(text)) !== null) {
      if (match[1] === 'ACTION') continue;
      processMatch(match[1], match[2], match[0]);
    }

    return { cleanText: cleanText.trim(), actions };
  };

  if (!isOpen) return null;

  async function sendMessage(e?: React.FormEvent, presetPrompt?: string) {
    e?.preventDefault();
    const messageToSend = (presetPrompt ?? inputVal).trim();
    if (!messageToSend || isLoading || !boardId || !accessToken) return;

    const userMsg: Message = { 
      id: Date.now(), 
      role: "user", 
      content: messageToSend, 
      avatar: user?.displayName?.[0] || "U",
      avatarUrl: (user as any)?.user_metadata?.avatar_url || (user as any)?.avatarUrl || (user as any)?.photoURL || null,
      email: user?.email || null
    };
    setInputVal("");

    if (activeTab === 'chat') {
      // Human-to-human flow
      setChatMessages(prev => [...prev, userMsg]);
      try {
        const { addBoardComment } = await import("@/lib/api/contracts");
        await addBoardComment(boardId, userMsg.content, accessToken);
      } catch (err) {
        console.error("Failed to send board comment", err);
        setChatMessages(prev => [...prev, { id: Date.now(), role: 'system', content: '⚠️ Error enviando mensaje.' }]);
      }
      return;
    }

    // AI Copilot flow
    const loadingMsg: Message = { id: Date.now() + 1, role: "bot", content: "", loading: true };
    setAiMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      const [boardData, teamActivity] = await Promise.all([
        getBoard(boardId, accessToken),
        activeTeamId ? listTeamActivity(activeTeamId, accessToken) : Promise.resolve([] as ActivityLogEntry[]),
      ]);

      const scopedActivity = filterBoardActivity(teamActivity, boardId);
      const contextSummary = boardData
        ? buildBoardContextSummary(boardData, scopedActivity, realtimeEvents)
        : "No board context could be loaded.";

      const data = await chatWithAiScope(
        {
          scope: "board",
          scopeId: boardId,
          message: buildAiMessageWithReferenceContext(messageToSend, getResolverContext(teamDocs, teamBoardsForMentions, teamMembers)),
          contextSummary,
        },
        accessToken,
      );

      const botMsg: Message = { id: Date.now() + 2, role: "bot", content: data.text ?? "Lo siento, no pude procesar eso." };
      setAiMessages((prev) => [...prev.filter((m) => !m.loading), botMsg]);
    } catch {
      const errMsg: Message = { id: Date.now() + 2, role: "bot", content: "⚠️ AI no disponible ahora." };
      setAiMessages((prev) => [...prev.filter((m) => !m.loading), errMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 md:w-96 bg-card border-l border-border/60 shadow-2xl flex flex-col z-40 transform transition-transform animate-in slide-in-from-right duration-300">

      {/* Header with Tabs */}
      <div className="flex flex-col border-b border-border/50 bg-background/50 backdrop-blur shrink-0">
        <div className="flex items-center justify-between p-4 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{activeTab === 'activity' ? 'Actividad' : 'Colaboración'}</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent/10 text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex px-2 pb-0.5 gap-1">
          {[
            { id: 'copilot', label: 'Copilot', icon: Bot },
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'activity', label: 'Actividad', icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === tab.id
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
        {activeTab === 'copilot' && (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex-1 space-y-4">
              <div className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded shadow-sm border flex items-center justify-center bg-amber-500/10 border-amber-500/20 text-amber-500">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="max-w-[85%] p-3 rounded-xl text-sm shadow-sm border bg-muted/50 border-border/50 rounded-tl-none">
                  <p>¡Hola! Soy tu asistente de IA. Puedo ayudarte a organizar este tablero, priorizar tareas o detectar bloqueos. ¿En qué te ayudo?</p>
                </div>
              </div>

              {aiMessages.map((msg) => {
                const userTint = getUserTintStyles(user?.id || user?.email || msg.avatar || "user");
                const { cleanText, actions } = msg.loading ? { cleanText: "", actions: [] as any[] } : parseAiActions(msg.content);

                return (
                  <div key={msg.id} className="space-y-3">
                    <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div
                        className={`h-8 w-8 shrink-0 rounded shadow-sm border flex items-center justify-center overflow-hidden ${msg.role === 'user'
                          ? 'rounded-full bg-primary/10 border-primary/20 text-primary font-bold text-[10px]'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                          }`}
                        style={msg.role === 'user' ? { backgroundColor: userTint.bg, borderColor: userTint.border, color: userTint.text } : undefined}
                      >
                        {msg.role === 'user' ? (
                          (msg.avatarUrl || msg.email) ? (
                            <img src={getUserAvatarUrl(msg.avatarUrl, msg.email || user?.email, 32)} alt="Avatar" className="h-full w-full object-cover" />
                          ) : (msg.avatar || (user?.displayName?.[0] || 'U'))
                        ) : <Bot className="h-4 w-4" />}
                      </div>
                      <div
                        className={`max-w-[85%] p-3 rounded-xl text-sm shadow-sm border whitespace-pre-wrap break-words ${msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-none border-primary/20'
                          : 'bg-muted/50 border-border/50 rounded-tl-none'
                          }`}
                        style={msg.role === 'user' ? { backgroundColor: userTint.bg, borderColor: userTint.border, color: "inherit" } : undefined}
                      >
                        {msg.loading ? (
                          <div className="flex gap-1.5 items-center px-1 py-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        ) : (
                          <RichText
                            content={cleanText}
                            context={getResolverContext(teamDocs, [], teamMembers)}
                            availableTags={allAvailableTags}
                            onSuggestionApply={() => {
                              setAiMessages(prev => [...prev, { id: Date.now(), role: 'bot', content: 'Acción realizada con éxito.' }]);
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {actions.map((action, actionIdx) => (
                      <div key={actionIdx} className="ml-11 mr-4 mt-2 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 shadow-sm space-y-3 animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs uppercase font-black text-emerald-700 tracking-wider">Acción Sugerida</span>
                        </div>
                        
                        <div className="bg-emerald-500/20 rounded-md border border-emerald-500/30 px-3 py-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-emerald-800">{String(action.action || "").replace(/_/g, " ")}</span>
                        </div>

                        <button
                          onClick={() => handleAiAction(action)}
                          className="w-full py-2 px-3 rounded-md bg-emerald-600/90 text-white text-xs font-bold hover:bg-emerald-600 shadow-sm transition-all active:scale-[0.98]"
                        >
                          Confirmar y Ejecutar
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => {
                    void sendMessage(undefined, "Resume este tablero y destaca prioridades para hoy.");
                  }}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full text-[11px] font-bold hover:bg-amber-500/20 transition-all disabled:opacity-50"
                >
                  <FileText className="w-3 h-3" />
                  Resumir tablero
                </button>
                <button
                  onClick={() => {
                    const prompt = "Generar reporte técnico con el contexto de este tablero.";
                    void sendMessage(undefined, prompt);
                  }}
                  disabled={isLoading || isGeneratingReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 rounded-full text-[11px] font-bold hover:bg-indigo-500/20 transition-all disabled:opacity-50"
                >
                  {isGeneratingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                  Generar reporte
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chat' && chatMessages.map((msg) => {
          if (msg.role === "system") {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-2 py-1 bg-muted/50 rounded-full">
                  {msg.content}
                </span>
              </div>
            );
          }

          if (msg.role === "bot") {
            const isAi = !msg.avatarUrl && !msg.email && !msg.avatar;
            return (
              <div key={msg.id} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded border flex items-center justify-center shadow-sm bg-muted/50 border-border/50 text-muted-foreground overflow-hidden">
                  {isAi ? (
                    <MessageSquare className="h-4 w-4" />
                  ) : (
                    (msg.avatarUrl || msg.email) ? (
                      <img src={getUserAvatarUrl(msg.avatarUrl, msg.email, 32)} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold">{msg.avatar || "?"}</span>
                    )
                  )}
                </div>
                <div className="bg-muted/50 rounded-xl rounded-tl-none border border-border/50 p-3 text-sm text-foreground/90 leading-relaxed shadow-sm min-w-0 flex-1 whitespace-pre-wrap break-words">
                  <RichText
                    content={msg.content}
                    context={getResolverContext(teamDocs, [], teamMembers)}
                    availableTags={allAvailableTags}
                  />
                </div>
              </div>
            );
          }

          const userTint = getUserTintStyles(user?.id || user?.email || msg.avatar || "user");

          return (
            <div key={msg.id} className="flex gap-3 flex-row-reverse">
              <div
                className="h-8 w-8 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-[10px] shadow-sm overflow-hidden"
                style={{ backgroundColor: userTint.bg, borderColor: userTint.border, color: userTint.text }}
              >
                {(msg.avatarUrl || msg.email) ? (
                  <img src={getUserAvatarUrl(msg.avatarUrl, msg.email || user?.email, 32)} alt="Avatar" className="h-full w-full object-cover" />
                ) : ( msg.avatar || (user?.displayName?.[0] || 'U') )}
              </div>
              <div
                className="bg-primary text-primary-foreground rounded-xl rounded-tr-none p-3 text-sm leading-relaxed shadow-sm border border-primary/20 whitespace-pre-wrap break-words"
                style={{ backgroundColor: userTint.bg, borderColor: userTint.border, color: "inherit" }}
              >
                <RichText
                  content={msg.content}
                  context={getResolverContext(teamDocs, [], teamMembers)}
                  availableTags={allAvailableTags}
                />
              </div>
            </div>
          );
        })}

        {activeTab === 'activity' && (
          <div className="space-y-6 pr-1 overflow-x-hidden">
            {groupedActivities.length === 0 && (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-60 font-medium">
                <History className="h-8 w-8 mb-2" />
                <p>No hay actividad reciente.</p>
              </div>
            )}
            {groupedActivities.map((group) => {
              const a = group[0];
              const theme = getActionTheme(a.action);
              const Icon = theme.icon;
              const member = teamMembers.find(m => m.id === a.actorId || m.userId === a.actorId);
              const changes = (a.payload as any)?.changes || {};
              const changedFields = Object.keys(changes).map(k => fieldLabels[k] || k).join(", ");
              const resolverContext = getResolverContext(teamDocs, [], teamMembers);

              return (
                <div key={a.id} className="relative pl-6 pb-2 border-l border-border/40 last:border-0 group">
                  <div className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full bg-border ring-2 ring-background group-hover:bg-accent transition-colors" />
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3 w-3 text-muted-foreground/60" />
                      <div className="flex items-center gap-1 group/badge relative">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shadow-sm ${theme.badgeClass}`}>
                          {theme.badge}
                          {group.length > 1 && ` x${group.length}`}
                        </span>
                        {group.length > 1 && (
                          <button
                            onClick={() => {
                              setSelectedActivityGroup(group);
                              setIsActivityModalOpen(true);
                            }}
                            className="p-0.5 hover:bg-muted rounded-full transition-colors relative group/info"
                            title="Click para ver historial detallado"
                          >
                            <Info className="h-2.5 w-2.5 text-muted-foreground/60" />

                            {/* Custom Hover Summary */}
                            <div className="absolute left-full ml-2 top-0 z-50 invisible group-hover/info:visible bg-card border border-border shadow-xl rounded-lg p-2 min-w-32 animate-in fade-in zoom-in-95 duration-150">
                              <div className="text-[9px] font-bold uppercase tracking-tight text-muted-foreground/80 mb-1 border-b border-border/40 pb-1">Resumen de Cambios</div>
                              <div className="space-y-1">
                                {group.map((item, idx) => {
                                  const itemChanges = (item.payload as any)?.changes || {};
                                  const itemFields = Object.keys(itemChanges).map(k => fieldLabels[k] || k).join(", ");
                                  return (
                                    <div key={item.id} className="text-[8px] leading-tight text-foreground/80 flex items-start gap-1">
                                      <span className="text-muted-foreground">•</span>
                                      <span>{itemFields || prettifyAction(item.action)}</span>
                                    </div>
                                  );
                                }).slice(0, 5)}
                                {group.length > 5 && <div className="text-[8px] text-muted-foreground italic pl-2">y {group.length - 5} más...</div>}
                              </div>
                            </div>
                          </button>
                        )}
                      </div>
                      <time className="text-[9px] text-muted-foreground font-medium ml-auto">
                        {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        <span className="font-bold text-foreground">{member?.displayName || 'Alguien'}</span>
                        <span className="text-muted-foreground/80"> {prettifyAction(a.action)}</span>
                      </p>

                      {changedFields && (
                        <p className="text-[10px] bg-muted/30 px-2 py-1 rounded border border-border/30 text-muted-foreground italic">
                          Campos: {changedFields}
                        </p>
                      )}

                      {(a.payload as any)?.text && (
                        <div className="text-[10px] text-muted-foreground px-2 border-l-2 border-border/50 bg-background/30 py-0.5">
                          <RichText content={(a.payload as any).text} context={resolverContext} availableTags={allAvailableTags} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {(activeTab === 'chat' || activeTab === 'copilot') && (
        <div className="p-4 border-t border-border/50 bg-background/30 shrink-0">
          <form className="relative flex items-center" onSubmit={sendMessage}>
            <ReferenceTokenInput
              value={inputVal}
              onChange={setInputVal}
              placeholder={activeTab === 'copilot' ? "Pregunta algo a la IA o usa @..." : "Pregunta o menciona con @..."}
              documents={teamDocs}
              boards={teamBoardsForMentions}
              users={teamMembers.map((m: any) => ({
                id: m.id || m.userId,
                name: m.displayName || m.name || m.email || m.username || "User",
                avatarUrl: m.avatarUrl || m.avatar_url || null,
              }))}
              cards={boardCardsForMentions}
              onSubmit={() => {
                void sendMessage();
              }}
              className="w-full"
              inputClassName={`pr-10 shadow-sm ${activeTab === 'copilot' ? 'focus:border-amber-500/50 ring-amber-500/10' : ''}`}
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || isLoading}
              className={`absolute right-1.5 p-1.5 rounded-full disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground transition-colors shadow-sm ${activeTab === 'copilot' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-accent text-accent-foreground'}`}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}

      {selectedActivityGroup && (
        <ActivityLogModal
          isOpen={isActivityModalOpen}
          onClose={() => setIsActivityModalOpen(false)}
          title={prettifyAction(selectedActivityGroup[0].action)}
          activities={selectedActivityGroup}
          teamMembers={teamMembers}
          teamDocs={teamDocs}
          allAvailableTags={allAvailableTags}
          getActionTheme={getActionTheme}
          prettifyAction={prettifyAction}
          fieldLabels={fieldLabels}
          getResolverContext={getResolverContext}
        />
      )}
    </div>
  );
}
