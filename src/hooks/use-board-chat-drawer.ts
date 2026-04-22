"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";
import { useSession } from "@/components/providers/session-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  getBoard,
  listTeamActivity,
  chatWithAiScope,
  type BoardView,
  type ActivityLogEntry,
  listTeamMembers,
  updateCard,
  updateList,
  getCardActivity,
  generateReportDocumentWithAi
} from "@/lib/api/contracts";
import { listDocuments, DocumentSummary, createDocument, createDocumentBrick } from "@/lib/api/documents";
import { ResolverContext } from "@/lib/reference-resolver";
import { buildAiMessageWithReferenceContext } from "@/lib/reference-ai-context";
import {
  extractDocumentReferenceIds,
  formatDateRangeLabel,
  isTimestampInDateRange,
  resolveReportDateRange,
  toDocumentMentionToken,
} from "@/lib/ai-report";

export const fieldLabels: Record<string, string> = {
  title: "título",
  summary: "descripción",
  status: "estado",
  start_at: "inicio",
  due_at: "fecha límite",
  completed_at: "completada",
  archived_at: "archivada",
};

export function prettifyAction(action: string): string {
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

export type Message = {
  id: number;
  role: "system" | "bot" | "user";
  content: string;
  avatar?: string;
  avatarUrl?: string | null;
  email?: string | null;
  loading?: boolean;
  timestamp?: string;
};

function getDateLabel(date: Date, locale: string = 'es', t: (key: string) => string): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const isSameDay = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
  
  if (isSameDay(date, today)) {
    return t('dates.today');
  }
  if (isSameDay(date, yesterday)) {
    return t('dates.yesterday');
  }
  
  return date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  });
}

function insertDateDividers(messages: Message[], locale: string = 'es', t: (key: string) => string): Message[] {
  if (messages.length === 0) return messages;
  
  const result: Message[] = [];
  let lastDate: string | null = null;
  
  messages.forEach((msg) => {
    if (msg.role === 'system') {
      result.push(msg);
      return;
    }
    
    const msgDate = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const dateKey = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;
    
    if (dateKey !== lastDate) {
      const dateLabel = getDateLabel(msgDate, locale, t);
      result.push({
        id: Date.now() + Math.random(),
        role: 'system',
        content: dateLabel,
      });
      lastDate = dateKey;
    }
    
    result.push(msg);
  });
  
  return result;
}

export function getResolverContext(teamDocs: DocumentSummary[], teamBoards: any[], teamMembers: any[]): ResolverContext {
  return {
    documents: teamDocs,
    boards: teamBoards,
    users: (teamMembers || []).map((m) => ({
      id: m.userId || m.id,
      name: m.displayName || m.name,
      avatarUrl: m.avatarUrl,
    }))
  };
}

export function hashString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getUserTintStyles(seed: string): { bg: string; border: string; text: string } {
  const palette = [
    { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.35)", text: "#93c5fd" },
    { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.35)", text: "#6ee7b7" },
    { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.35)", text: "#fcd34d" },
  ];
  return palette[hashString(seed || "user") % palette.length];
}

export function parseAiActions(text: string) {
  const actions: any[] = [];
  let cleanText = text;

  const processMatch = (declaredType: string, jsonStr: string, fullMatch: string) => {
    try {
      const raw = JSON.parse(jsonStr);
      const action = String(raw?.action || raw?.type || declaredType).trim().toUpperCase();
      const explanation = String(raw?.explanation || "").trim();
      const id = String(raw?.id || raw?.entityId || raw?.cardId || raw?.listId || "").trim();

      let payload = raw?.payload;
      if (!payload || typeof payload !== "object") {
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
      cleanText = cleanText.replace(fullMatch, "");
      if (explanation && !cleanText.includes(explanation)) cleanText = cleanText.trim() + "\n\n" + explanation;
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
    if (match[1] === "ACTION") continue;
    processMatch(match[1], match[2], match[0]);
  }

  return { cleanText: cleanText.trim(), actions };
}

export function useBoardChatDrawer(boardId?: string, initialTab: 'copilot' | 'chat' | 'activity' = 'chat', isOpen: boolean = false) {
  const { accessToken, activeTeamId, user } = useSession();
  const { locale, messages } = useI18n();
  const t = (key: string) => {
    const parts = key.split('.');
    let current: any = messages.common;
    for (const part of parts) {
      if (!current) return key;
      current = current[part];
    }
    return typeof current === 'string' ? current : key;
  };
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [aiMessages, setAiMessages] = useState<Message[]>([]);
  const [rawChatMessages, setRawChatMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
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

      if (rawChatMessages.length === 0) {
        const comments = boardActivity
          .filter(a => a.action === 'board.commented')
          .reverse()
          .map(a => {
            const member = teamMembers.find(m => m.id === a.actorId || m.userId === a.actorId);
            return {
              id: a.id as any,
              role: a.actorId === user?.id ? 'user' : 'bot',
              content: (a.payload as any)?.text || "",
              avatar: member?.displayName?.[0] || member?.name?.[0] || '?',
              avatarUrl: member?.avatarUrl || member?.avatar_url || null,
              email: member?.email || null,
              timestamp: a.createdAt,
            } as Message;
          });

        if (comments.length > 0) {
          setRawChatMessages(comments);
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
  }, [isOpen, activeTab, boardId, teamMembers, rawChatMessages]);

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
        setTeamBoardsForMentions([{ id: board.id, name: board.name }]);
        setBoardCardsForMentions(
          board.lists.flatMap((list) => list.cards.map((card) => ({ id: card.id, title: card.title })))
        );
      }).catch(console.error);
    }
  }, [isOpen, boardId, accessToken, activeTeamId]);

  const groupedActivities = useMemo(() => {
    const windowMs = 3 * 60 * 1000;
    const groups: ActivityLogEntry[][] = [];

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

  const buildBoardContextSummary = (board: BoardView, activity: ActivityLogEntry[], realtime: string[]) => {
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

  useBoardRealtime(boardId, (event: BoardEvent) => {
    const compactEvent = `${event.type}: ${JSON.stringify(event.payload).slice(0, 240)}`;
    setRealtimeEvents((prev) => [compactEvent, ...prev].slice(0, 25));

    if (event.type === 'board.commented') {
      const { userId, text } = event.payload as { userId: string, text: string };
      if (userId === user?.id) return;

      const member = teamMembers.find(m => m.id === userId || m.userId === userId);
      const msg: Message = {
        id: Date.now(),
        role: "bot",
        content: text,
        avatar: member?.displayName?.[0] || member?.name?.[0] || '?',
        avatarUrl: member?.avatarUrl || member?.avatar_url || null,
        email: member?.email || null,
        timestamp: new Date().toISOString(),
      };
      setRawChatMessages(prev => [...prev, msg]);
    }
  }, accessToken);

  const chatMessages = useMemo(() => insertDateDividers(rawChatMessages, locale, t), [rawChatMessages, locale, t]);

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

  async function sendMessage(e?: React.FormEvent, presetPrompt?: string) {
    e?.preventDefault();
    const messageToSend = (presetPrompt ?? inputVal).trim();
    if (!messageToSend || isLoading || isSendingMessage || !boardId || !accessToken) return;

    const userMsg: Message = { 
      id: Date.now(), 
      role: "user", 
      content: messageToSend, 
      avatar: user?.displayName?.[0] || "U",
      avatarUrl: (user as any)?.user_metadata?.avatar_url || (user as any)?.avatarUrl || (user as any)?.photoURL || null,
      email: user?.email || null
    };
    setInputVal("");
    setIsSendingMessage(true);

    if (activeTab === 'chat') {
      const msgWithTimestamp = { ...userMsg, timestamp: new Date().toISOString() };
      setRawChatMessages(prev => [...prev, msgWithTimestamp]);
      try {
        const { addBoardComment } = await import("@/lib/api/contracts");
        await addBoardComment(boardId, userMsg.content, accessToken);
      } catch (err) {
        console.error("Failed to send board comment", err);
      } finally {
        setIsSendingMessage(false);
      }
      return;
    }

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
      setIsSendingMessage(false);
    }
  }

  return {
    state: {
      activeTab,
      setActiveTab,
      aiMessages,
      setAiMessages,
      chatMessages,
      rawChatMessages,
      setRawChatMessages,
      inputVal,
      setInputVal,
      isLoading,
      isSendingMessage,
      activities,
      allAvailableTags,
      teamDocs,
      teamMembers,
      teamBoardsForMentions,
      boardCardsForMentions,
      isGeneratingReport,
      selectedActivityGroup,
      setSelectedActivityGroup,
      isActivityModalOpen,
      setIsActivityModalOpen,
      bottomRef,
      groupedActivities,
      user
    },
    actions: {
      sendMessage,
      handleAiAction,
    }
  };
}