"use client";
import { useActionTheme } from "@/hooks/use-action-theme";

import { Bot, MessageSquare, History, Send, X, Loader2, Tag, Edit2, Sparkles, Trash2, RefreshCcw, Layout, Info, CheckCircle2, CheckCheck, FileText } from "lucide-react";
import { streamAiChat, listTeamActivity, getDocumentActivity, getTeamAiUsage, type TeamAiUsage, type ActivityLogEntry } from "@/lib/api/contracts";
import { useSession } from "../providers/session-provider";
import { listDocumentComments, addDocumentComment, DocumentSummary, updateDocumentTitle, createDocumentBrick, updateDocumentBrick, deleteDocumentBrick, getDocument } from "@/lib/api/documents";
import { BrickDiff } from "../bricks/brick-diff";
import { ResolverContext } from "@/lib/reference-resolver";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";
import { useMemo } from "react";
import { ReferenceTokenInput } from "./reference-token-input";
import { buildAiMessageWithReferenceContext } from "@/lib/reference-ai-context";
import { buildDocumentContextSummary } from "@/lib/brick-context";
import { getWorkspaceMemberLabel, normalizeWorkspaceMember, toReferenceUsers, type WorkspaceMemberLike } from "@/lib/workspace-members";

const fieldLabels: Record<string, string> = {
  title: "título",
  summary: "descripción",
  status: "estado",
  start_at: "inicio",
  due_at: "fecha límite",
  completed_at: "completada",
  archived_at: "archivada",
};



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
import { getUserAvatarUrl } from "@/lib/gravatar";
import { Fragment, useState, useEffect, useRef, type ReactNode } from "react";

function getResolverContext(documents: DocumentSummary[], boards: any[], members: WorkspaceMemberLike[]): ResolverContext {
  return {
    documents: documents || [],
    boards: boards || [],
    users: members || [],
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

function formatTimeDivider(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    return "Hoy";
  } else if (diffDays === 1) {
    return "Ayer";
  } else if (diffDays < 7) {
    return `Hace ${diffDays} días`;
  } else {
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}

function shouldShowTimeDivider(currentDate: Date, previousDate: Date | null): boolean {
  if (!previousDate) return true;
  
  const diffMs = Math.abs(currentDate.getTime() - previousDate.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  
  // Show divider if more than 4 hours apart
  if (diffHours >= 4) return true;
  
  // Show divider if different days
  const currentDay = currentDate.toDateString();
  const previousDay = previousDate.toDateString();
  return currentDay !== previousDay;
}

export function DocumentCommentsDrawer({
  isOpen,
  onClose,
  docId,
  documents = [],
  boards = [],  folders = [],  members = [],
  initialTab = "comments",
  contextSummary = "",
  initialAiInput = "",
  onAiInputClear,
  bricks: bricksProp = []
}: {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  documents?: DocumentSummary[];
  boards?: any[];
  folders?: any[];
  members?: WorkspaceMemberLike[];
  initialTab?: 'copilot' | 'comments' | 'activity';
  contextSummary?: string;
  initialAiInput?: string;
  onAiInputClear?: () => void;
  bricks?: any[];
}) {
  const getActionTheme = useActionTheme();
  const { accessToken, user, activeTeamId } = useSession();
  const [activeTab, setActiveTab] = useState(initialTab);

  // Comments State
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState("");

  // AI State
  const [aiMessages, setAiMessages] = useState<any[]>([]);
  const [aiInput, setAiInput] = useState("");

  // Activity State
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [docBricks, setDocBricks] = useState<any[]>(bricksProp);
  const [selectedActivityGroup, setSelectedActivityGroup] = useState<ActivityLogEntry[] | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [aiUsage, setAiUsage] = useState<TeamAiUsage | null>(null);
  const [drawerWidth, setDrawerWidth] = useState(384);
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);
  const [applyingAllMessageId, setApplyingAllMessageId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeAiStreamAbortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isResizingDrawer) return;

    const onMouseMove = (event: MouseEvent) => {
      const viewportWidth = window.innerWidth || 1280;
      const maxWidth = Math.max(420, Math.floor(viewportWidth * 0.9));
      const nextWidth = Math.min(maxWidth, Math.max(320, viewportWidth - event.clientX));
      setDrawerWidth(nextWidth);
    };

    const onMouseUp = () => setIsResizingDrawer(false);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizingDrawer]);

  useEffect(() => {
    return () => {
      activeAiStreamAbortRef.current?.();
      activeAiStreamAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isOpen) return;
    activeAiStreamAbortRef.current?.();
    activeAiStreamAbortRef.current = null;
    setAiMessages([]);
    setAiInput("");
    setIsLoading(false);
  }, [isOpen]);

  const refreshAiUsage = async () => {
    if (!activeTeamId || !accessToken) return;
    try {
      const usage = await getTeamAiUsage(activeTeamId, accessToken);
      setAiUsage(usage);
    } catch {
      // best effort
    }
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (initialAiInput && isOpen) {
      setAiInput(initialAiInput);
      if (onAiInputClear) onAiInputClear();
    }
  }, [initialAiInput, isOpen, onAiInputClear]);

  const fetchComments = async () => {
    if (!accessToken || !docId) return;
    try {
      const data = await listDocumentComments(docId, accessToken);
      // Validate and filter comments with proper structure
      const validComments = (data || []).filter(c => 
        c && c.id && c.createdAt && c.payload && typeof c.payload.text === 'string'
      );
      setComments(validComments);
    } catch (e) {
      console.error("Failed to fetch comments", e);
      setComments([]);
    }
  };

  const fetchActivity = async () => {
    if (!accessToken || !docId) return;
    try {
      const data = await getDocumentActivity(docId, accessToken);
      setActivities(data);
    } catch (e) {
      console.error("Failed to fetch document activity", e);
    }
  };

  // Keep docBricks in sync when bricksProp updates from the parent page
  useEffect(() => {
    if (bricksProp && bricksProp.length > 0) {
      setDocBricks(bricksProp);
    }
  }, [bricksProp]);

  const fetchDocContent = async () => {
    if (!accessToken || !docId) return;
    try {
      const doc = await getDocument(docId, accessToken);
      setDocBricks(doc.bricks || []);
    } catch (e) {
      console.error("Failed to fetch doc bricks", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'comments') fetchComments();
      if (activeTab === 'activity') fetchActivity();
      if (activeTab === 'copilot') void refreshAiUsage();
      fetchDocContent();
    }
  }, [isOpen, docId, activeTab]);

  // Refresh comments when switching to comments tab
  useEffect(() => {
    if (isOpen && activeTab === 'comments') {
      fetchComments();
    }
  }, [activeTab]);

  const groupedActivities = useMemo(() => {
    const windowMs = 3 * 60 * 1000;
    const groups: ActivityLogEntry[][] = [];
    for (const a of activities) {
      const lastGroup = groups[groups.length - 1];
      const head = lastGroup?.[0];
      if (!head) { groups.push([a]); continue; }
      const sameActor = head.actorId === a.actorId;
      const sameAction = head.action === a.action;
      const timeDiff = Math.abs(new Date(head.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (sameActor && sameAction && timeDiff <= windowMs) { lastGroup.push(a); }
      else { groups.push([a]); }
    }
    return groups;
  }, [activities]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments, aiMessages, activeTab]);

  const handleAiAction = async (actionData: any, options?: { silent?: boolean }) => {
    if (!docId || !accessToken) return false;

    const action = String(actionData?.action || actionData?.type || "").toUpperCase();
    const payload = (actionData?.payload && typeof actionData.payload === "object") ? actionData.payload : actionData;
    const entityId = String(actionData?.id || payload?.id || payload?.entityId || "").trim();
    const actionBrickId = String(actionData?.brickId || payload?.brickId || entityId || "").trim();

    try {
      if (action === "DOC_RENAME") {
        const title = String(payload?.title || payload?.name || "").trim();
        if (!title) throw new Error("DOC_RENAME requiere title");
        await updateDocumentTitle(docId, title, accessToken);
      } else if (action === "DOC_BRICK_INSERT") {
        const kind = String(payload?.kind || "text").trim();
        const content = payload?.content;
        const position = Number.isFinite(Number(payload?.position)) ? Number(payload.position) : 0;
        if (content === undefined) throw new Error("DOC_BRICK_INSERT requiere content");
        await createDocumentBrick(docId, { kind, content, position }, accessToken);
      } else if (action === "DOC_BRICK_REPLACE") {
        const replacementContent = payload?.content;
        if (!actionBrickId) throw new Error("DOC_BRICK_REPLACE requiere brickId");
        if (replacementContent === undefined) throw new Error("DOC_BRICK_REPLACE requiere content");
        await updateDocumentBrick(docId, actionBrickId, replacementContent, accessToken);
      } else if (action === "DOC_BRICK_APPEND") {
        const kind = String(payload?.kind || "text").trim();
        const content = payload?.content;
        const position = Number.isFinite(Number(payload?.position)) ? Number(payload.position) : 999999;
        if (content === undefined) throw new Error("DOC_BRICK_APPEND requiere content");
        await createDocumentBrick(docId, { kind, content, position }, accessToken);
      } else if (action === "DOC_BRICK_DELETE") {
        if (!actionBrickId) throw new Error("DOC_BRICK_DELETE requiere brickId");
        await deleteDocumentBrick(docId, actionBrickId, accessToken);
      } else {
        throw new Error(`Accion no soportada: ${action || "UNKNOWN"}`);
      }

      window.dispatchEvent(new Event("document:refresh"));
      await fetchDocContent();
      if (!options?.silent) {
        setAiMessages((prev) => [...prev, { id: Date.now(), role: "bot", content: `He ejecutado la acción: ${action}.` }]);
      }
      return true;
    } catch (err) {
      console.error("Failed to execute AI action", err);
      if (!options?.silent) {
        setAiMessages((prev) => [...prev, { id: Date.now(), role: "bot", content: `No pude ejecutar la acción ${action || "UNKNOWN"}. Verifica los datos o permisos.` }]);
      }
      return false;
    }
  };

  const parseAiActions = (text: string) => {
    const actions: any[] = [];
    let cleanText = text;

    const processMatch = (declaredType: string, jsonStr: string, fullMatch: string) => {
      try {
        const raw = JSON.parse(jsonStr);
        const action = String(raw?.action || raw?.type || declaredType).trim().toUpperCase();
        const explanation = String(raw?.explanation || "").trim();
        const id = String(raw?.id || raw?.entityId || raw?.brickId || "").trim();

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
          type: String(declaredType || "").trim().toUpperCase(),
          action,
          id,
          payload,
          explanation,
        });

        cleanText = cleanText.replace(fullMatch, "");
        if (explanation && !cleanText.includes(explanation)) {
          cleanText = `${cleanText.trim()}\n\n${explanation}`.trim();
        }
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
  };

  const applyAllActions = async (messageId: number, actions: any[]) => {
    if (actions.length === 0 || applyingAllMessageId !== null) return;

    setApplyingAllMessageId(messageId);
    let appliedCount = 0;

    for (const action of actions) {
      const success = await handleAiAction(action, { silent: true });
      if (success) appliedCount += 1;
    }

    setAiMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "bot",
        content: appliedCount > 0
          ? `Apliqué ${appliedCount} de ${actions.length} cambios sugeridos.`
          : "No pude aplicar los cambios sugeridos.",
      },
    ]);
    setApplyingAllMessageId(null);
  };

  if (!isOpen) return null;

  async function handleCommentSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!commentInput.trim() || isLoading || !accessToken) return;
    setIsLoading(true);
    try {
      const newComment = await addDocumentComment(docId, commentInput, accessToken);
      setCommentInput("");
      
      // Optimistically add the comment to the list
      if (newComment && newComment.id) {
        setComments(prev => [...prev, newComment]);
      }
      
      // Fetch fresh comments to ensure sync
      await fetchComments();
    } catch (e) { 
      console.error("Failed to add comment", e); 
    } finally { 
      setIsLoading(false); 
    }
  }

  function buildDocContextSummary(): string {
    return buildDocumentContextSummary(docBricks, contextSummary);
  }

  async function handleAiSubmit(e?: React.FormEvent, presetPrompt?: string) {
    e?.preventDefault();
    const messageToSend = (presetPrompt ?? aiInput).trim();
    if (!messageToSend || isLoading || !accessToken) return;

    const userMsg = { id: Date.now(), role: "user", content: messageToSend };
    const loadingMsg = { id: Date.now() + 1, role: "bot", content: "", loading: true };
    const historyForAi = aiMessages
      .filter((m) => !m.loading && (m.role === "user" || m.role === "bot") && typeof m.content === "string" && m.content.trim().length > 0)
      .slice(-16)
      .map((m) => ({
        role: m.role === "bot" ? "assistant" as const : "user" as const,
        content: m.content.trim(),
      }));
    setAiMessages(prev => [...prev, userMsg, loadingMsg]);
    setAiInput("");
    setIsLoading(true);

    try {
      const streamingId = Date.now() + 1;
      let accumulated = '';
      activeAiStreamAbortRef.current?.();
      activeAiStreamAbortRef.current = streamAiChat(
        {
          scope: "document",
          scopeId: docId,
          message: buildAiMessageWithReferenceContext(messageToSend, {
            documents,
            boards,
            activeBricks: docBricks,
            documentBricksById: { [docId]: docBricks as any },
            users: members || []
          }),
          contextSummary: buildDocContextSummary(),
          history: historyForAi,
        },
        accessToken,
        (event) => {
          if (event.type === 'delta') {
            accumulated += event.text;
            setAiMessages(prev => prev.map(m =>
              m.id === streamingId ? { ...m, loading: false, content: accumulated } : m
            ));
          } else if (event.type === 'done') {
            const finalText = event.text || accumulated || 'Lo siento, hubo un error con la IA.';
            setAiMessages(prev => prev.map(m =>
              m.id === streamingId ? { ...m, loading: false, content: finalText } : m
            ));
            activeAiStreamAbortRef.current = null;
            void refreshAiUsage();
            setIsLoading(false);
          } else if (event.type === 'error') {
            setAiMessages(prev => prev.map(m =>
              m.id === streamingId ? { ...m, loading: false, content: 'Lo siento, hubo un error con la IA.' } : m
            ));
            activeAiStreamAbortRef.current = null;
            setIsLoading(false);
          }
        },
      );
      // Assign the streaming id to the loading placeholder
      setAiMessages(prev => prev.map(m => m.loading ? { ...m, id: streamingId } : m));
    } catch (e) {
      setAiMessages(prev => [...prev.filter(m => !m.loading), { id: Date.now(), role: "bot", content: "Lo siento, hubo un error con la IA." }]);
      activeAiStreamAbortRef.current = null;
      setIsLoading(false);
    }
  }

  return (
    <div
      className="absolute top-0 right-0 bottom-0 min-w-[20rem] max-w-[90vw] bg-card border-l border-border/60 shadow-2xl flex flex-col z-40 animate-in slide-in-from-right duration-300"
      style={{ width: drawerWidth }}
    >
      <div
        className="absolute left-0 top-0 hidden h-full w-2 -translate-x-1/2 cursor-col-resize md:block"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizingDrawer(true);
        }}
        title="Arrastra para agrandar o reducir"
      >
        <div className={`mx-auto mt-20 h-14 w-1 rounded-full transition-colors ${isResizingDrawer ? 'bg-amber-500/70' : 'bg-border/70 hover:bg-amber-500/50'}`} />
      </div>

      {/* Header with Tabs */}
      <div className="flex flex-col border-b border-border/50 bg-background/50 backdrop-blur shrink-0">
        <div className="flex items-center justify-between p-4 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Colaboración</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent/10 text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex px-2 pb-0.5 gap-1">
          {[
            { id: 'copilot', label: 'Copilot', icon: Bot },
            { id: 'comments', label: 'Comentarios', icon: MessageSquare },
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

        {activeTab === 'copilot' && aiUsage && (
          <div className="px-3 pb-2">
            <div className="text-[10px] text-muted-foreground font-semibold">
              IA mensual: {aiUsage.creditsUsed.toFixed(2)} / {aiUsage.limit.toFixed(2)} creditos
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${Math.min(100, (aiUsage.creditsUsed / Math.max(aiUsage.limit, 0.0001)) * 100)}%` }}
              />
            </div>
            {typeof aiUsage.myCreditsUsed === 'number' && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                Tu consumo asignado: {aiUsage.myCreditsUsed.toFixed(2)} creditos ({(aiUsage.mySharePct ?? 0).toFixed(1)}%)
              </div>
            )}
            {Array.isArray(aiUsage.memberAllocations) && aiUsage.memberAllocations.length > 0 && (
              <div className="mt-1 text-[10px] text-muted-foreground/90 truncate">
                Team shared (paga {aiUsage.billingOwnerName || 'owner'}): {aiUsage.memberAllocations.slice(0, 3).map((entry) => `${entry.isCurrentUser ? 'Tu' : entry.name}: ${entry.creditsUsed.toFixed(2)} cr`).join(' · ')}
              </div>
            )}
          </div>
        )}
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
                  <p>¡Hola! Soy tu asistente de IA. Puedo ayudarte a mejorar este documento, resumir ideas o proponer acciones claras. ¿Qué necesitas?</p>
                </div>
              </div>

            {aiMessages.map((msg) => {
              const tint = getUserTintStyles(user?.id || user?.email || "user");
              const { cleanText, actions } = msg.loading ? { cleanText: "", actions: [] as any[] } : parseAiActions(msg.content);
              return (
                <div key={msg.id} className="space-y-3">
                  <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`h-8 w-8 shrink-0 rounded shadow-sm border flex items-center justify-center ${msg.role === 'bot'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                      : 'rounded-full bg-primary/10 border-primary/20 text-primary font-bold text-[10px]'
                      }`} style={msg.role === 'user' ? { backgroundColor: tint.bg, borderColor: tint.border, color: tint.text } : undefined}>
                      {msg.role === 'bot' ? <Bot className="h-4 w-4" /> : user?.displayName?.[0] || 'U'}
                    </div>
                    <div className={`max-w-[85%] p-3 text-sm leading-relaxed rounded-xl shadow-sm border ${msg.role === 'bot' ? 'bg-muted/50 border-border/50 rounded-tl-none' : 'bg-primary text-primary-foreground border-primary/20 rounded-tr-none'
                      }`} style={msg.role === 'user' ? { backgroundColor: tint.bg, borderColor: tint.border, color: "inherit" } : undefined}>
                      {msg.loading ? (
                        <div className="flex gap-1.5 py-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      ) : (
                        <RichText
                          content={cleanText}
                          context={{
                            ...getResolverContext(documents, boards, members),
                            activeBricks: docBricks,
                            documentBricksById: { [docId]: docBricks as any }
                          }}
                          onSuggestionApply={() => {
                            window.dispatchEvent(new Event('document:refresh'));
                            void fetchDocContent();
                          }}
                        />
                      )}
                    </div>
                </div>

                  {actions.map((action, actionIdx) => {
                    const actionKind = String(action.action || action.type || '').toUpperCase();
                    return (
                    <div key={actionIdx} className="ml-11 mr-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-[10px] uppercase font-black text-emerald-600/80 tracking-widest">Acción Sugerida</span>
                        </div>
                      </div>
                      <p className="text-[11px] font-semibold text-foreground/80">{action.explanation || "Realizar cambios en el documento"}</p>
                      <div className="bg-background/20 rounded border border-emerald-500/10 p-2 overflow-hidden shadow-inner">
                        {actionKind === 'DOC_BRICK_REPLACE' ? (
                          <BrickDiff
                            kind={action.payload?.kind || action.kind || 'text'}
                            oldContent={docBricks.find(b => b.id === (action.brickId || action.payload?.brickId))}
                            newContent={action.payload?.content || action.content}
                          />
                        ) : (
                          <div className="text-[10px] font-mono whitespace-pre-wrap text-emerald-800/70 max-h-32 overflow-y-auto">
                            {actionKind}: {JSON.stringify(action, null, 2)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleAiAction(action)}
                        className="w-full py-1.5 px-3 rounded-md bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600 shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Aplicar mejora
                      </button>
                    </div>
                    );
                  })}

                  {actions.length > 1 && (
                    <div className="ml-11 mr-4">
                      <button
                        onClick={() => {
                          void applyAllActions(msg.id, actions);
                        }}
                        disabled={applyingAllMessageId === msg.id}
                        className="w-full py-1.5 px-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 text-emerald-700 text-[10px] font-bold hover:bg-emerald-500/10 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 flex-wrap"
                      >
                        {applyingAllMessageId === msg.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="h-3.5 w-3.5" />
                        )}
                        <span>Aplicar todos los cambios</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => {
                    void handleAiSubmit(undefined, "Resume este documento y enumera sus ideas clave.");
                  }}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full text-[11px] font-bold hover:bg-amber-500/20 transition-all disabled:opacity-50"
                >
                  <FileText className="w-3 h-3" />
                  Resumir documento
                </button>
                <button
                  onClick={() => {
                    void handleAiSubmit(undefined, "Propón mejoras de redacción y estructura para este documento.");
                  }}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 text-primary border border-primary/10 rounded-full text-[11px] font-bold hover:bg-primary/10 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />
                  Mejorar redacción
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-4">
            {comments.length === 0 && !isLoading && (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-60">
                <MessageSquare className="h-8 w-8 mb-2" />
                <p>No hay comentarios aún.</p>
              </div>
            )}
            {isLoading && comments.length === 0 && (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
              {[...comments].reverse().map((entry, idx, arr) => {
              const isMe = entry.actorId === user?.id;
                const member = members.find(m => (m.id === entry.actorId || m.userId === entry.actorId) && entry.actorId);
              const normalizedMember = member ? normalizeWorkspaceMember(member) : null;
              const tint = getUserTintStyles(entry.actorId || member?.email || "user");
              
              const currentDate = new Date(entry.createdAt);
              const previousDate = idx > 0 ? new Date(arr[idx - 1].createdAt) : null;
              const showDivider = shouldShowTimeDivider(currentDate, previousDate);
              
              return (
                <Fragment key={entry.id}>
                  {showDivider && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-px bg-border/40" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-2">
                        {formatTimeDivider(currentDate)}
                      </span>
                      <div className="flex-1 h-px bg-border/40" />
                    </div>
                  )}
                  <div className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div className="h-8 w-8 shrink-0 rounded overflow-hidden border shadow-sm">
                      <img
                        src={getUserAvatarUrl(normalizedMember?.avatarUrl, normalizedMember?.primaryEmail || 'user@killio.app', 32)}
                        className="h-full w-full object-cover bg-muted"
                        alt={getWorkspaceMemberLabel(member, 'User')}
                      />
                    </div>
                    <div className={`max-w-[85%] space-y-1 ${isMe ? 'text-right' : ''}`}>
                      <div className="text-[9px] uppercase font-bold text-muted-foreground/70 tracking-tighter">
                        {getWorkspaceMemberLabel(member, 'User')} • {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className={`p-3 text-sm leading-relaxed rounded-xl shadow-sm border ${isMe ? 'bg-primary text-primary-foreground rounded-tr-none border-primary/20' :
                          'bg-muted/50 text-foreground/90 rounded-tl-none border-border/50'
                        }`} style={isMe ? { backgroundColor: tint.bg, borderColor: tint.border, color: "inherit" } : undefined}>
                        <RichText
                          content={entry.payload?.text || ""}
                          context={{
                            ...getResolverContext(documents, boards, members),
                            activeBricks: docBricks,
                            documentBricksById: { [docId]: docBricks as any }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-6 pr-1 overflow-x-hidden">
            {activities.length === 0 && (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-60 font-medium">
                <History className="h-8 w-8 mb-2" />
                <p>No hay actividad reciente.</p>
              </div>
            )}
            {groupedActivities.map((group) => {
              const a = group[0];
              const theme = getActionTheme(a.action);
              const Icon = theme.icon;
              const member = members.find(m => m.id === a.actorId || m.userId === a.actorId);
              const changes = (a.payload as any)?.changes || {};
              const changedFields = Object.keys(changes).map(k => fieldLabels[k] || k).join(", ");
              const resolverContext = {
                ...getResolverContext(documents, boards, members),
                activeBricks: docBricks,
                documentBricksById: { [docId]: docBricks as any }
              };

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
                        <span className="font-bold text-foreground">{getWorkspaceMemberLabel(member, 'Alguien')}</span>
                        <span className="text-muted-foreground/80"> {prettifyAction(a.action)}</span>
                      </p>

                      {changedFields && (
                        <p className="text-[10px] bg-muted/30 px-2 py-1 rounded border border-border/30 text-muted-foreground italic">
                          Campos: {changedFields}
                        </p>
                      )}

                      {(a.payload as any)?.text && (
                        <div className="text-[10px] text-muted-foreground px-2 border-l-2 border-border/50 bg-background/30 py-0.5">
                          <RichText content={(a.payload as any).text} context={resolverContext} />
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

      {(activeTab === 'copilot' || activeTab === 'comments') && (
        <div className="p-4 border-t border-border/50 bg-background/30 shrink-0 relative">
          <form className="relative flex items-center" onSubmit={activeTab === 'copilot' ? handleAiSubmit : handleCommentSubmit}>
            <ReferenceTokenInput
              value={activeTab === 'copilot' ? aiInput : commentInput}
              onChange={(val) => {
                if (activeTab === 'copilot') setAiInput(val);
                else setCommentInput(val);
              }}
              placeholder={activeTab === 'copilot' ? "Pregunta algo a la IA o usa @..." : "Comenta o menciona con @..."}
              documents={documents}
              boards={boards}
              folders={folders}
              users={members}
              activeBricks={docBricks as any[]}
              onSubmit={() => {
                if (activeTab === 'copilot') {
                  void handleAiSubmit();
                } else {
                  void handleCommentSubmit();
                }
              }}
              className="w-full"
              inputClassName={`pr-10 ring-offset-background ${activeTab === 'copilot' ? 'focus:border-amber-500/50 ring-amber-500/10' : ''}`}
            />
            <button type="submit" disabled={isLoading || (activeTab === 'copilot' ? !aiInput.trim() : !commentInput.trim())} className={`absolute right-1.5 p-1.5 rounded-full disabled:opacity-50 transition-colors shadow-sm ${activeTab === 'copilot' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-accent text-accent-foreground'}`}>
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
          teamMembers={members}
          teamDocs={documents}
          allAvailableTags={[]}
          getActionTheme={getActionTheme}
          prettifyAction={prettifyAction}
          fieldLabels={fieldLabels}
          getResolverContext={(docs, boardItems, memberItems) => ({
            ...getResolverContext(docs, boardItems, memberItems),
            activeBricks: docBricks,
            documentBricksById: { [docId]: docBricks as any },
          })}
        />
      )}
    </div>
  );
}
