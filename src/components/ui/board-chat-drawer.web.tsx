"use client";
import { useDockedDrawer } from "@/hooks/use-docked-drawer";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useActionTheme } from "@/hooks/use-action-theme";
import { useEffect, useState } from "react";

import { X, Send, Sparkles, Bot, MessageSquare, History, Info, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";
import { ReferenceTokenInput } from "./reference-token-input";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { AgentChatPanel } from "@/components/agent";
import { useSession } from "@/components/providers/session-provider";
import { AgentEntityScope } from "@/lib/api/agent";
import { useBoardChatDrawer, prettifyAction, fieldLabels, getResolverContext, getUserTintStyles } from "@/hooks/use-board-chat-drawer";
import { getWorkspaceMemberLabel } from "@/lib/workspace-members";
import { useLinkedRoom } from "@/hooks/use-linked-room";
import { useRoomChat } from "@/hooks/use-room-chat";
import { RoomMessageItem } from "@/components/rooms/RoomMessageItem";
import type { LinkedEntityType } from "@/lib/api/rooms";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { readLocalActivity } from "@/lib/local-workspace/local-activity";

export interface BoardChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  initialTab?: 'copilot' | 'chat' | 'activity';
  entityType?: AgentEntityScope;
  linkedRoomId?: string;
  /** Local workspace mode: rooms/chat unavailable; AI only when online. */
  localMode?: boolean;
  online?: boolean;
}




export function BoardChatDrawerWeb({ isOpen, onClose, boardId, initialTab = 'chat', entityType, linkedRoomId: linkedRoomIdProp, localMode = false, online = true }: BoardChatDrawerProps) {
  const t = useTranslations("board-detail");
  const tRooms = useTranslations("rooms");
  const getActionTheme = useActionTheme();
  const { activeTeamId, accessToken, user: sessionUser } = useSession();
  const {
    state: {
      activeTab, setActiveTab, setActivities, allAvailableTags, teamDocs, teamMembers, teamBoardsForMentions,
      boardCardsForMentions, selectedActivityGroup, setSelectedActivityGroup,
      isActivityModalOpen, setIsActivityModalOpen, bottomRef, groupedActivities, aiUsage, user
    },
    actions: {}
  } = useBoardChatDrawer(boardId, initialTab, isOpen);

  // Local mode: the cloud activity fetch no-ops (no token); read the local
  // hidden sidecar for this entity and feed it into the drawer's activity list.
  const { getDir } = useLocalWorkspace();
  useEffect(() => {
    if (!localMode || !isOpen || activeTab !== 'activity' || !boardId) return;
    const dir = getDir();
    if (!dir) return;
    let cancelled = false;
    void readLocalActivity(dir, boardId).then((entries) => {
      if (!cancelled) setActivities(entries as any);
    });
    return () => { cancelled = true; };
  }, [localMode, isOpen, activeTab, boardId, getDir, setActivities]);

  // Map AgentEntityScope → LinkedEntityType (ignore 'team' which has no linked room)
  const linkedEntityType = (
    entityType === 'board' || entityType === 'mesh' || entityType === 'document'
  ) ? entityType as LinkedEntityType : null;

  const { roomId: autoLinkedRoomId, ensureRoom } = useLinkedRoom(
    activeTeamId,
    linkedEntityType,
    boardId,
    accessToken,
    !!boardId && !!linkedEntityType
  );
  const effectiveRoomId = linkedRoomIdProp ?? autoLinkedRoomId;

  const roomChat = useRoomChat(effectiveRoomId, accessToken, sessionUser, linkedRoomIdProp ? undefined : ensureRoom);
  const [roomInput, setRoomInput] = useState("");

  const router = useRouter();
  const [drawerWidth, setDrawerWidth] = useState(384);
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);

  // Local mode: chat (room-backed) is unavailable; Copilot only when online.
  const tabs = (() => {
    const list: Array<{ id: 'copilot' | 'chat' | 'activity'; label: string; icon: typeof Bot }> = [];
    if (!localMode || online) list.push({ id: 'copilot', label: 'Copilot', icon: Bot });
    if (!localMode) list.push({ id: 'chat', label: 'Chat', icon: MessageSquare });
    list.push({ id: 'activity', label: t("chatDrawer.tabActivity"), icon: History });
    return list;
  })();
  useEffect(() => {
    if (isOpen && !tabs.some((tb) => tb.id === activeTab)) setActiveTab((tabs[0]?.id ?? 'activity') as any);
  }, [isOpen, tabs, activeTab, setActiveTab]);

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

  const { place } = useDockedDrawer(isOpen, drawerWidth);

  if (!isOpen) return null;


  return place(
    <div
      className="absolute top-0 right-0 bottom-0 min-w-[20rem] max-w-[90vw] bg-card border-l border-border/60 rounded-l-2xl shadow-xl flex flex-col overflow-hidden z-[50] transform transition-transform animate-in slide-in-from-right duration-300"
      style={{ width: drawerWidth }}
    >
      <div
        className="absolute left-0 top-0 hidden h-full w-2 -translate-x-1/2 cursor-col-resize md:block"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizingDrawer(true);
        }}
        title={t("chatDrawer.resizeTitle")}
      >
        <div className={`mx-auto mt-20 h-14 w-1 rounded-full transition-colors ${isResizingDrawer ? 'bg-amber-500/70' : 'bg-border/70 hover:bg-amber-500/50'}`} />
      </div>

      {/* Header with Tabs */}
      <div className="flex flex-col border-b border-border/40 bg-card shrink-0">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground min-w-0 truncate"><Sparkles className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{activeTab === 'activity' ? t("chatDrawer.headerActivity") : t("chatDrawer.headerCollaboration")}</span></h3>
          <div className="flex items-center gap-1">
            {!localMode && (
              <button
                onClick={() => router.push(effectiveRoomId ? `/rooms/${effectiveRoomId}` : "/rooms")}
                title={t("chatDrawer.openInRooms")}
                className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mx-4 mb-3 flex gap-1 rounded-lg bg-muted/50 p-1">
          {tabs.map(tab => (
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

      <div className={`flex-1 min-h-0 ${activeTab !== 'copilot' ? "overflow-y-auto overflow-x-hidden p-4 space-y-3" : "overflow-hidden flex flex-col"}`}>
        {activeTab === 'copilot' && activeTeamId && (
          <AgentChatPanel
            teamId={activeTeamId}
            entityType={entityType ?? 'board'}
            entityId={boardId}
            className="flex-1 min-h-0"
          />
        )}

        {activeTab === 'chat' && (
          roomChat.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : roomChat.messages.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-70 text-center">
              <MessageSquare className="h-8 w-8 mb-2 text-primary/50" strokeWidth={1.5} />
              <p>{tRooms("chat.noMessages")}</p>
            </div>
          ) : (
            roomChat.messages.map((msg, idx) => (
              <RoomMessageItem
                key={msg.id}
                message={msg}
                isOwn={msg.userId === sessionUser?.id}
                showAvatar={idx === 0 || roomChat.messages[idx - 1].userId !== msg.userId}
                onReact={(emoji) => void roomChat.addReaction(msg.id, emoji)}
                resolverContext={getResolverContext(teamDocs, [], teamMembers)}
                availableTags={allAvailableTags}
                t={tRooms}
              />
            ))
          )
        )}

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
                      <p className="text-xs text-foreground/80 leading-relaxed flex items-center gap-1.5 flex-wrap break-words [overflow-wrap:anywhere]">
                        <span className="inline-flex items-center gap-1 text-foreground text-xs font-medium">{getWorkspaceMemberLabel(member, t("chatDrawer.someone"))}</span>
                        <span className="text-muted-foreground/80">{prettifyAction(a.action)}</span>
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
          {roomChat.typingUsers.length > 0 && (
            <p className="text-[10px] text-muted-foreground/70 mb-1 px-1">
              {roomChat.typingUsers.map(u => u.displayName).join(", ")} {tRooms("chat.typing_one").replace("{name}", "")}
            </p>
          )}
          <form className="relative flex items-center" onSubmit={(e) => e.preventDefault()}>
            <ReferenceTokenInput
              value={roomInput}
              onChange={setRoomInput}
              placeholder={t("chatDrawer.inputPlaceholderChat")}
              documents={teamDocs}
              boards={teamBoardsForMentions}
              users={teamMembers}
              cards={boardCardsForMentions}
              onSubmit={async () => {
                if (!roomInput.trim()) return;
                await roomChat.sendMessage(roomInput.trim());
                setRoomInput("");
              }}
              className="w-full"
              inputClassName="pr-11 rounded-xl border-border/60 bg-background placeholder:text-muted-foreground/60"
            />
            <button
              type="button"
              onClick={async () => {
                if (!roomInput.trim()) return;
                await roomChat.sendMessage(roomInput.trim());
                setRoomInput("");
              }}
              disabled={!roomInput.trim() || roomChat.isSending}
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
  ) as React.ReactElement;
}

