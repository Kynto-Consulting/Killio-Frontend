"use client";

import { Fragment, useState, useEffect, useRef, type ReactNode, useMemo } from "react";
import { X, Send, Bot, Loader2, MessageSquare, History, Tag, Edit2, Sparkles, Trash2, RefreshCcw, Layout, Info, CheckCircle2 } from "lucide-react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";
import { useSession } from "../providers/session-provider";
import { getBoard, listTeamActivity, chatWithAiScope, type BoardView, type ActivityLogEntry, listTeamMembers, updateCard, createTag, updateList } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary } from "@/lib/api/documents";
import { Portal } from "./portal";
import { ReferencePicker } from "../documents/reference-picker";
import { ResolverContext } from "@/lib/reference-resolver";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";

const fieldLabels: Record<string, string> = {
  title: "título",
  summary: "descripción",
  status: "estado",
  urgency_state: "urgencia",
  start_at: "inicio",
  due_at: "fecha límite",
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
  loading?: boolean;
};

function getResolverContext(teamDocs: DocumentSummary[], teamBoards: any[], teamMembers: any[]): ResolverContext {
  return {
    documents: teamDocs,
    boards: teamBoards,
    users: (teamMembers || []).map(m => ({ id: m.id, name: m.displayName || m.name, avatarUrl: m.avatarUrl }))
  };
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
  const [aiMessages, setAiMessages] = useState<Message[]>([
    { id: 1, role: "bot", content: "Hola. ¿En qué puedo ayudarte con este tablero?" },
  ]);
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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedActivityGroup, setSelectedActivityGroup] = useState<ActivityLogEntry[] | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchActivity = async () => {
    if (!accessToken || !activeTeamId || !boardId) return;
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
            const member = teamMembers.find(m => m.id === a.actorId);
            return {
              id: a.id as any,
              role: a.actorId === user?.id ? 'user' : 'bot',
              content: (a.payload as any)?.text || "",
              avatar: member?.displayName?.[0] || member?.name?.[0] || '?'
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

  const summarizeCard = (card: any) => {
    const tags = (card.tags || []).map((t: any) => t.name).filter(Boolean).join(", ") || "none";
    const assignees = (card.assignees || []).map((a: any) => a.name || a.displayName || a.email).filter(Boolean).join(", ") || "none";
    const textBricks = (card.blocks || []).filter((b: any) => b.kind === "text");
    const checklistBricks = textBricks.filter((b: any) => b.displayStyle === "checklist");
    const checklistTotal = checklistBricks.reduce((acc: number, b: any) => acc + (b.tasks?.length || 0), 0);
    const checklistDone = checklistBricks.reduce((acc: number, b: any) => acc + (b.tasks || []).filter((t: any) => t.checked).length, 0);
    const summary = cleanText(card.summary);
    const shortSummary = summary ? summary.slice(0, 220) : "No summary";

    return [
      `Card: ${card.title}`,
      `status: ${card.urgency || "normal"}`,
      `due: ${card.dueAt || "none"}`,
      `tags: ${tags}`,
      `assignees: ${assignees}`,
      `bricks: ${(card.blocks || []).length}`,
      `checklist: ${checklistDone}/${checklistTotal}`,
      `summary: ${shortSummary}`,
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
      const payload = entry.payload && typeof entry.payload === "object" ? JSON.stringify(entry.payload).slice(0, 280) : "{}";
      return `- [${entry.createdAt}] ${entry.action} (${entry.scope}:${entry.scopeId}) payload=${payload}`;
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

  // Subscribe to Ably realtime events for this board
  useBoardRealtime(boardId, (event: BoardEvent) => {
    const compactEvent = `${event.type}: ${JSON.stringify(event.payload).slice(0, 240)}`;
    setRealtimeEvents((prev) => [compactEvent, ...prev].slice(0, 25));

    if (event.type === 'board.commented') {
      const { userId, text } = event.payload as { userId: string, text: string };
      if (userId === user?.id) return; // We already added our own message locally

      const msg: Message = {
        id: Date.now(),
        role: "bot", // Styled as other-user
        content: text,
      };
      setChatMessages(prev => [...prev, msg]);
    } else {
      const msg: Message = {
        id: Date.now(),
        role: "bot",
        content: `🔔 Realtime: ${event.type.replace(".", " ")} — ${JSON.stringify(event.payload)}`,
      };
      setAiMessages((prev) => [...prev, msg]);
    }
  }, accessToken);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, chatMessages]);

  const handleAiAction = async (actionData: any) => {
    if (!boardId || !accessToken) return;
    const { action, payload, id: entityId } = actionData;
    try {
      if (action === 'CARD_RENAME') {
        await updateCard(entityId, { title: payload.title }, accessToken);
      } else if (action === 'TAG_ADD') {
        const { addCardTag, createTag: apiCreateTag } = await import("@/lib/api/contracts");
        let tag = allAvailableTags.find(t => t.name.toLowerCase() === payload.tagName.toLowerCase());
        if (!tag) {
          tag = await apiCreateTag({
            scopeType: 'board',
            scopeId: boardId,
            name: payload.tagName,
            color: payload.color || '#3b82f6',
            tagKind: 'custom'
          }, accessToken);
          setAllAvailableTags(prev => [...prev, tag]);
        }
        await addCardTag(entityId, tag.id, accessToken);
      } else if (action === 'CARD_MOVE') {
        await updateCard(entityId, { listId: payload.targetListId }, accessToken);
      } else if (action === 'LIST_RENAME') {
        await updateList(boardId, entityId || payload.listId, { name: payload.title }, accessToken);
      }
      window.dispatchEvent(new Event('board:refresh'));
      setAiMessages(prev => [...prev, { id: Date.now(), role: 'bot', content: `He ejecutado la acción: ${action}.` }]);
    } catch (err) {
      console.error("Failed to execute AI action", err);
      setAiMessages(prev => [...prev, { id: Date.now(), role: 'bot', content: `No pude ejecutar la acción ${action}. Verifica los permisos.` }]);
    }
  };

  const parseAiActions = (text: string) => {
    const actions: any[] = [];
    const regex = /\[ACTION:([^\]]+)\]\s*([\s\S]*?)\s*\[\/ACTION\]/g;
    let match;
    let cleanText = text;
    while ((match = regex.exec(text)) !== null) {
      try {
        const payload = JSON.parse(match[2]);
        actions.push({ type: match[1], ...payload });
        cleanText = cleanText.replace(match[0], '');
      } catch (e) {
        console.error("Failed to parse AI action JSON", e);
      }
    }
    return { cleanText: cleanText.trim(), actions };
  };

  if (!isOpen) return null;

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputVal.trim() || isLoading || !boardId || !accessToken) return;

    const userMsg: Message = { id: Date.now(), role: "user", content: inputVal, avatar: user?.displayName?.[0] || "U" };
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
          message: userMsg.content,
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
        {(activeTab === 'chat' || activeTab === 'copilot') && (activeTab === 'chat' ? chatMessages : aiMessages).map((msg) => {
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
            return (
              <div key={msg.id} className="flex gap-3">
                <div className={`h-8 w-8 shrink-0 rounded border flex items-center justify-center border shadow-sm ${activeTab === 'copilot' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-muted/50 border-border/50 text-muted-foreground'
                  }`}>
                  {activeTab === 'copilot' ? <Bot className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                </div>
                <div className="bg-muted/50 rounded-xl rounded-tl-none border border-border/50 p-3 text-sm text-foreground/90 leading-relaxed shadow-sm min-w-0 flex-1">
                  {msg.loading ? (
                    <div className="flex gap-1.5 items-center px-1 py-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (() => {
                    const { cleanText, actions } = parseAiActions(msg.content);
                    return (
                      <div className="space-y-3">
                        <RichText
                          content={cleanText}
                          context={getResolverContext(teamDocs, [], teamMembers)}
                          availableTags={allAvailableTags}
                          onSuggestionApply={() => {
                            setAiMessages(prev => [...prev, { id: Date.now(), role: 'bot', content: 'Acción realizada con éxito.' }]);
                          }}
                        />
                        {actions.map((action, actionIdx) => (
                          <div key={actionIdx} className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-[10px] uppercase font-black text-emerald-600/80 tracking-widest">Acción Sugerida</span>
                              </div>
                            </div>
                            <p className="text-[11px] font-semibold text-foreground/80">{action.explanation || "Realizar cambios en el tablero"}</p>
                            <div className="bg-background/50 rounded border border-emerald-500/10 p-2 text-[10px] font-mono whitespace-pre-wrap text-emerald-800/70">
                              {action.action}: {JSON.stringify(action.payload, null, 2)}
                            </div>
                            <button 
                              onClick={() => handleAiAction(action)}
                              className="w-full py-1.5 px-3 rounded-md bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600 shadow-sm transition-all active:scale-[0.98]"
                            >
                              Confirmar y Ejecutar
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex gap-3 flex-row-reverse">
              <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-[10px] shadow-sm border">
                {msg.avatar || (user?.displayName?.[0] || 'U')}
              </div>
              <div className="bg-primary text-primary-foreground rounded-xl rounded-tr-none p-3 text-sm leading-relaxed shadow-sm border border-primary/20">
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
            <input
              type="text"
              value={inputVal}
              onChange={(e) => {
                const val = e.target.value;
                const { selectionStart } = e.target;
                setInputVal(val);
                // Trigger if the character just typed at cursor is @
                if (selectionStart !== null && val[selectionStart - 1] === "@") {
                  setIsPickerOpen(true);
                }
              }}
              placeholder={activeTab === 'copilot' ? "Pregunta al Asistente..." : "Pregunta o menciona con @..."}
              className="w-full bg-card border border-input rounded-full pr-10 pl-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent transition-all placeholder:text-muted-foreground shadow-sm"
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || isLoading}
              className="absolute right-1.5 p-1.5 rounded-full bg-accent text-accent-foreground disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground transition-colors shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>

          {isPickerOpen && (
            <Portal>
              <ReferencePicker
                boards={[]}
                documents={teamDocs}
                users={teamMembers}
                onClose={() => setIsPickerOpen(false)}
                onSelect={(item) => {
                  const newVal = inputVal.substring(0, inputVal.lastIndexOf("@")) + ` @[${item.type}:${item.id}:${item.name}] `;
                  setInputVal(newVal);
                  setIsPickerOpen(false);
                }}
              />
            </Portal>
          )}
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
