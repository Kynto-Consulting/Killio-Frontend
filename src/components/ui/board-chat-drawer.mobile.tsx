"use client";

import { X, Send, Bot, Loader2, MessageSquare, History, Tag, Edit2, Sparkles, Trash2, RefreshCcw, Layout, Info, CheckCircle2, FileText } from "lucide-react";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";
import { ReferenceTokenInput } from "./reference-token-input";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { useBoardChatDrawer, prettifyAction, fieldLabels, getResolverContext, getUserTintStyles, parseAiActions } from "@/hooks/use-board-chat-drawer";

export interface BoardChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  initialTab?: 'copilot' | 'chat' | 'activity';
}

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

import { useBoardChatDrawer, prettifyAction, fieldLabels, getResolverContext, getUserTintStyles, parseAiActions } from "@/hooks/use-board-chat-drawer";

export interface BoardChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  initialTab?: 'copilot' | 'chat' | 'activity';
}

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

export function BoardChatDrawerMobile({ isOpen, onClose, boardId, initialTab = 'chat' }: BoardChatDrawerProps) {
  const {
    state: {
      activeTab, setActiveTab, aiMessages, setAiMessages, chatMessages, inputVal, setInputVal,
      isLoading, isSendingMessage, allAvailableTags, teamDocs, teamMembers, teamBoardsForMentions,
      boardCardsForMentions, isGeneratingReport, selectedActivityGroup, setSelectedActivityGroup,
      isActivityModalOpen, setIsActivityModalOpen, bottomRef, groupedActivities, user
    },
    actions: { sendMessage, handleAiAction }
  } = useBoardChatDrawer(boardId, initialTab, isOpen);

  if (!isOpen) return null;

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
      // Human-to-human flow
      setChatMessages(prev => [...prev, userMsg]);
      try {
        const { addBoardComment } = await import("@/lib/api/contracts");
        await addBoardComment(boardId, userMsg.content, accessToken);
      } catch (err) {
        console.error("Failed to send board comment", err);
        setChatMessages(prev => [...prev, { id: Date.now(), role: 'system', content: '⚠️ Error enviando mensaje.' }]);
      } finally {
        setIsSendingMessage(false);
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
      setIsSendingMessage(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[90] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 h-[85vh] bg-card rounded-t-3xl border-t border-border/60 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex flex-col z-[100] transform transition-transform animate-in slide-in-from-bottom duration-300">
        {/* Mobile Handle */}
        <div className="flex justify-center p-2 shrink-0 touch-none" onTouchMove={onClose}>
          <div className="w-12 h-1.5 bg-muted rounded-full opacity-60" />
        </div>

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
          <form className="relative flex items-center" onSubmit={(e) => e.preventDefault()}>
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
              type="button"
              onClick={() => {
                void sendMessage();
              }}
              disabled={!inputVal.trim() || isLoading || isSendingMessage}
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
    </>
  );
}

