"use client";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useActionTheme } from "@/hooks/use-action-theme";
import { useState } from "react";

import { X, Send, Bot, Loader2, MessageSquare, History, Tag, Edit2, Sparkles, Trash2, RefreshCcw, Layout, Info, CheckCircle2, CheckCheck, FileText } from "lucide-react";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";
import { ReferenceTokenInput } from "./reference-token-input";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { useBoardChatDrawer, prettifyAction, fieldLabels, getResolverContext, getUserTintStyles, parseAiActions } from "@/hooks/use-board-chat-drawer";
import { getWorkspaceMemberLabel, toReferenceUsers } from "@/lib/workspace-members";
import { AgentChatPanel } from "@/components/agent";
import { useSession } from "@/components/providers/session-provider";
import type { AgentEntityScope } from "@/lib/api/agent";

export interface BoardChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  initialTab?: 'copilot' | 'chat' | 'activity';
  entityType?: AgentEntityScope;
}




export function BoardChatDrawerMobile({ isOpen, onClose, boardId, initialTab = 'chat', entityType }: BoardChatDrawerProps) {
  const t = useTranslations("board-detail");
  const getActionTheme = useActionTheme();
  const { activeTeamId } = useSession();
  const {
    state: {
      activeTab, setActiveTab, aiMessages, setAiMessages, chatMessages, inputVal, setInputVal,
      isLoading, isSendingMessage, allAvailableTags, teamDocs, teamMembers, teamBoardsForMentions,
      boardCardsForMentions, isGeneratingReport, selectedActivityGroup, setSelectedActivityGroup,
      isActivityModalOpen, setIsActivityModalOpen, bottomRef, groupedActivities, user
    },
    actions: { sendMessage, handleAiAction }
  } = useBoardChatDrawer(boardId, initialTab, isOpen);
  const [applyingAllMessageId, setApplyingAllMessageId] = useState<number | null>(null);

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
          ? t("chatDrawer.appliedChanges", { applied: appliedCount, total: actions.length })
          : t("chatDrawer.applyFailed"),
      },
    ]);
    setApplyingAllMessageId(null);
  };

  if (!isOpen) return null;


  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[90] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 h-[85vh] bg-card rounded-t-3xl border-t border-border/60 shadow-xl flex flex-col overflow-hidden z-[100] transform transition-transform animate-in slide-in-from-bottom duration-300">
        {/* Mobile Handle */}
        <div className="flex justify-center p-2 shrink-0 touch-none">
          <div className="w-12 h-1.5 bg-muted rounded-full opacity-60" />
        </div>

      {/* Header with Tabs */}
      <div className="flex flex-col border-b border-border/40 bg-card shrink-0">
        <div className="flex items-center justify-between px-4 pt-2 pb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground min-w-0"><Sparkles className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{activeTab === 'activity' ? t("chatDrawer.headerActivity") : t("chatDrawer.headerCollaboration")}</span></h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-4 mb-3 flex gap-1 rounded-lg bg-muted/50 p-1">
          {[
            { id: 'copilot', label: 'Copilot', icon: Bot },
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'activity', label: t("chatDrawer.tabActivity"), icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all ${activeTab === tab.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`space-y-3 flex-1 chat-drawer ${activeTab != 'copilot' ? "overflow-y-auto overflow-x-hidden min-h-0 p-4 " : "p-b-2"}`}>
        {activeTab === 'copilot' && activeTeamId && (
          <AgentChatPanel
            teamId={activeTeamId}
            entityType={entityType ?? 'board'}
            entityId={boardId}
            documents={teamDocs}
            boards={teamBoardsForMentions}
            users={teamMembers}
            cards={boardCardsForMentions}
            className="h-full"
          />
        )}

        {activeTab === 'chat' && chatMessages.map((msg) => {
          if (msg.role === "system") {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-[10px] text-muted-foreground px-2.5 py-1 bg-muted/50 rounded-full">
                  {msg.content}
                </span>
              </div>
            );
          }

          if (msg.role === "bot") {
            const isAi = !msg.avatarUrl && !msg.email && !msg.avatar;
            return (
              <div key={msg.id} className="flex gap-3">
                <div className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center bg-muted text-muted-foreground overflow-hidden">
                  {isAi ? (
                    <MessageSquare className="h-3 w-3" />
                  ) : (
                    (msg.avatarUrl || msg.email) ? (
                      <img src={getUserAvatarUrl(msg.avatarUrl, msg.email, 32)} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold">{msg.avatar || "?"}</span>
                    )
                  )}
                </div>
                <div className="bg-muted/60 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-foreground leading-relaxed min-w-0 max-w-[85%] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
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
                className="h-6 w-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-[10px] overflow-hidden"
                style={{ backgroundColor: userTint.bg, borderColor: userTint.border, color: userTint.text }}
              >
                {(user?.avatarUrl || msg.avatarUrl || msg.email) ? (
                  <img src={getUserAvatarUrl(user?.avatarUrl ?? msg.avatarUrl, msg.email || user?.email, 32)} alt="Avatar" className="h-full w-full object-cover" />
                ) : ( msg.avatar || (user?.displayName?.[0] || 'U') )}
              </div>
              <div
                className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed max-w-[85%] min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
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
          <div className="space-y-4 pr-1 overflow-x-hidden">
            {groupedActivities.length === 0 && (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-70 text-center">
                <History className="h-8 w-8 mb-2 text-primary/50" strokeWidth={1.5} />
                <p>{t("chatDrawer.noActivity")}</p>
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
                <div key={a.id} className="relative pl-5 pb-1 border-l border-border/30 last:border-0 group min-w-0">
                  <div className="absolute left-[-3px] top-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 group-hover:bg-primary transition-colors" />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3 w-3 text-muted-foreground/60" />
                      <div className="flex items-center gap-1 group/badge relative">
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium uppercase tracking-wide border ${theme.badgeClass}`}>
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
                              <div className="text-[9px] font-bold uppercase tracking-tight text-muted-foreground/80 mb-1 border-b border-border/40 pb-1">{t("chatDrawer.changeSummary")}</div>
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
                                {group.length > 5 && <div className="text-[8px] text-muted-foreground italic pl-2">{t("chatDrawer.andMore", { n: group.length - 5 })}</div>}
                              </div>
                            </div>
                          </button>
                        )}
                      </div>
                      <time className="text-[10px] text-muted-foreground/70 ml-auto">
                        {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-foreground/80 leading-relaxed break-words [overflow-wrap:anywhere]">
                        <span className="font-medium text-foreground">{getWorkspaceMemberLabel(member, t("chatDrawer.someone"))}</span>
                        <span className="text-muted-foreground/80"> {prettifyAction(a.action)}</span>
                      </p>

                      {changedFields && (
                        <p className="text-[10px] bg-muted/40 px-2.5 py-1 rounded-lg text-muted-foreground break-words [overflow-wrap:anywhere]">
                          {t("chatDrawer.fields")} {changedFields}
                        </p>
                      )}

                      {(a.payload as any)?.text && (
                        <div className="text-[10px] text-muted-foreground px-2 border-l-2 border-border/40 py-0.5 break-words [overflow-wrap:anywhere]">
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

      {activeTab === 'chat' && (
        <div className="px-4 pb-4 pt-3 border-t border-border/40 bg-card shrink-0">
          <form className="relative flex items-center" onSubmit={(e) => e.preventDefault()}>
            <ReferenceTokenInput
              value={inputVal}
              onChange={setInputVal}
              placeholder={t("chatDrawer.inputPlaceholderChat")}
              documents={teamDocs}
              boards={teamBoardsForMentions}
              users={teamMembers}
              cards={boardCardsForMentions}
              onSubmit={() => {
                void sendMessage();
              }}
              className="w-full"
              inputClassName="pr-11 rounded-xl border-border/60 bg-background placeholder:text-muted-foreground/60"
            />
            <button
              type="button"
              onClick={() => {
                void sendMessage();
              }}
              disabled={!inputVal.trim() || isLoading || isSendingMessage}
              className="absolute right-2 p-1.5 rounded-full disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
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

