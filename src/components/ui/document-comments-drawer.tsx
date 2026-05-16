"use client";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useActionTheme } from "@/hooks/use-action-theme";

import { Bot, MessageSquare, History, Send, X, Loader2, Info, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLinkedRoom } from "@/hooks/use-linked-room";
import { useRoomChat } from "@/hooks/use-room-chat";
import { RoomMessageItem } from "@/components/rooms/RoomMessageItem";
import { listTeamActivity, getDocumentActivity, getTeamAiUsage, type TeamAiUsage, type ActivityLogEntry } from "@/lib/api/contracts";
import { useSession } from "../providers/session-provider";
import { listDocumentComments, addDocumentComment, DocumentSummary, getDocument } from "@/lib/api/documents";
import { ResolverContext } from "@/lib/reference-resolver";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";
import { useMemo } from "react";
import { ReferenceTokenInput } from "./reference-token-input";
import { AgentChatPanel } from "@/components/agent";
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
  bricks: bricksProp = [],
  linkedRoomId,
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
  linkedRoomId?: string;
}) {
  const t = useTranslations("document-detail");
  const tRooms = useTranslations("rooms");
  const getActionTheme = useActionTheme();
  const { accessToken, user, activeTeamId } = useSession();
  const [activeTab, setActiveTab] = useState(initialTab);

  // Room-backed chat
  const { roomId: autoLinkedRoomId } = useLinkedRoom(activeTeamId, "document", docId, accessToken, !!docId);
  const effectiveRoomId = linkedRoomId ?? autoLinkedRoomId;
  const roomChat = useRoomChat(effectiveRoomId, accessToken);
  const [roomInput, setRoomInput] = useState("");

  // Legacy comments state (kept for the activity tab resolver context)
  const [comments, setComments] = useState<any[]>([]);

  // Activity State
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [docBricks, setDocBricks] = useState<any[]>(bricksProp);
  const [selectedActivityGroup, setSelectedActivityGroup] = useState<ActivityLogEntry[] | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [aiUsage, setAiUsage] = useState<TeamAiUsage | null>(null);
  const router = useRouter();
  const [drawerWidth, setDrawerWidth] = useState(384);
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (isOpen) return;
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
  }, [comments, activeTab]);


  if (!isOpen) return null;

  async function handleCommentSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!roomInput.trim() || roomChat.isSending) return;
    try {
      await roomChat.sendMessage(roomInput.trim());
      setRoomInput("");
    } catch (e) {
      console.error("Failed to send comment", e);
    } finally {
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
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("commentsDrawer.collaboration")}</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => router.push(effectiveRoomId ? `/rooms/${effectiveRoomId}` : "/rooms")}
              title="Open in Rooms"
              className="rounded-md p-1 hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-accent/10 text-muted-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
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

      </div>
      <div className={`flex-1 min-h-0 ${activeTab !== 'copilot' ? "overflow-y-auto p-4 space-y-4" : "overflow-hidden flex flex-col"}`}>
        {activeTab === 'copilot' && activeTeamId && (
          <AgentChatPanel
            teamId={activeTeamId}
            entityType="document"
            entityId={docId}
            documents={documents}
            boards={boards}
            users={members}
            bricks={docBricks}
            initialMessage={initialAiInput}
            autoSendInitial={false}
            onInitialMessageClear={onAiInputClear}
            className="flex-1 min-h-0"
          />
        )}

        {activeTab === 'comments' && (
          roomChat.isLoading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : roomChat.messages.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-60">
              <MessageSquare className="h-8 w-8 mb-2" />
              <p>{t("commentsDrawer.noComments")}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {roomChat.messages.map((msg, idx) => (
                <RoomMessageItem
                  key={msg.id}
                  message={msg}
                  isOwn={msg.userId === user?.id}
                  showAvatar={idx === 0 || roomChat.messages[idx - 1].userId !== msg.userId}
                  onReact={(emoji) => void roomChat.addReaction(msg.id, emoji)}
                  resolverContext={{
                    ...getResolverContext(documents, boards, members),
                    activeBricks: docBricks,
                    documentBricksById: { [docId]: docBricks as any },
                  }}
                  t={tRooms}
                />
              ))}
            </div>
          )
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
                                {group.length > 5 && <div className="text-[8px] text-muted-foreground italic pl-2">{t("commentsDrawer.andMore", { n: group.length - 5 })}</div>}
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

      {activeTab === 'comments' && (
        <div className="p-4 border-t border-border/50 bg-background/30 shrink-0 relative">
          {roomChat.typingUsers.length > 0 && (
            <p className="text-[10px] text-muted-foreground/70 mb-1 px-1">
              {roomChat.typingUsers.map(u => u.displayName).join(", ")} {tRooms("chat.typing_one").replace("{name}", "")}
            </p>
          )}
          <form className="relative flex items-center" onSubmit={(e) => e.preventDefault()}>
            <ReferenceTokenInput
              value={roomInput}
              onChange={setRoomInput}
              placeholder="Comenta o menciona con @..."
              documents={documents}
              boards={boards}
              folders={folders}
              users={members}
              activeBricks={docBricks as any[]}
              onSubmit={async () => {
                if (!roomInput.trim()) return;
                await roomChat.sendMessage(roomInput.trim());
                setRoomInput("");
              }}
              className="w-full"
              inputClassName="pr-10 ring-offset-background"
            />
            <button
              type="button"
              onClick={async () => {
                if (!roomInput.trim()) return;
                await roomChat.sendMessage(roomInput.trim());
                setRoomInput("");
              }}
              disabled={roomChat.isSending || !roomInput.trim()}
              className="absolute right-1.5 p-1.5 rounded-full disabled:opacity-50 transition-colors shadow-sm bg-accent text-accent-foreground"
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
