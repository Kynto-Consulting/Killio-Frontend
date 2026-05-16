"use client";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useActionTheme } from "@/hooks/use-action-theme";
import { useEffect, useState } from "react";

import { X, Send, Bot, MessageSquare, History, Info, ExternalLink, Loader2 } from "lucide-react";
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

export interface BoardChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  initialTab?: 'copilot' | 'chat' | 'activity';
  entityType?: AgentEntityScope;
  linkedRoomId?: string;
}




export function BoardChatDrawerWeb({ isOpen, onClose, boardId, initialTab = 'chat', entityType, linkedRoomId: linkedRoomIdProp }: BoardChatDrawerProps) {
  const t = useTranslations("board-detail");
  const tRooms = useTranslations("rooms");
  const getActionTheme = useActionTheme();
  const { activeTeamId, accessToken, user: sessionUser } = useSession();
  const {
    state: {
      activeTab, setActiveTab, allAvailableTags, teamDocs, teamMembers, teamBoardsForMentions,
      boardCardsForMentions, selectedActivityGroup, setSelectedActivityGroup,
      isActivityModalOpen, setIsActivityModalOpen, bottomRef, groupedActivities, aiUsage, user
    },
    actions: {}
  } = useBoardChatDrawer(boardId, initialTab, isOpen);

  // Map AgentEntityScope → LinkedEntityType (ignore 'team' which has no linked room)
  const linkedEntityType = (
    entityType === 'board' || entityType === 'mesh' || entityType === 'document'
  ) ? entityType as LinkedEntityType : null;

  const { roomId: autoLinkedRoomId } = useLinkedRoom(
    activeTeamId,
    linkedEntityType,
    boardId,
    accessToken,
    !!boardId && !!linkedEntityType
  );
  const effectiveRoomId = linkedRoomIdProp ?? autoLinkedRoomId;

  const roomChat = useRoomChat(effectiveRoomId, accessToken);
  const [roomInput, setRoomInput] = useState("");

  const router = useRouter();
  const [drawerWidth, setDrawerWidth] = useState(384);
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);

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

  if (!isOpen) return null;


  return (
    <div
      className="absolute top-0 right-0 bottom-0 min-w-[20rem] max-w-[90vw] bg-card border-l border-border/60 shadow-2xl flex flex-col z-[50] transform transition-transform animate-in slide-in-from-right duration-300"
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
      <div className="flex flex-col border-b border-border/50 bg-background/50 backdrop-blur shrink-0">
        <div className="flex items-center justify-between p-4 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{activeTab === 'activity' ? t("chatDrawer.headerActivity") : t("chatDrawer.headerCollaboration")}</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => router.push(effectiveRoomId ? `/rooms/${effectiveRoomId}` : "/rooms")}
              title={t("chatDrawer.openInRooms")}
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
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'activity', label: t("chatDrawer.tabActivity"), icon: History }
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

      <div className={`space-y-4 flex-1 chat-drawer ${activeTab != 'copilot' ? "overflow-y-auto min-h-0 p-4 " : "p-b-2"}`}>
        {activeTab === 'copilot' && activeTeamId && (
          <AgentChatPanel
            teamId={activeTeamId}
            entityType={entityType ?? 'board'}
            entityId={boardId}
            className="h-full"
          />
        )}

        {activeTab === 'chat' && (
          roomChat.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : roomChat.messages.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-60">
              <MessageSquare className="h-8 w-8 mb-2" />
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
          <div className="space-y-6 pr-1 overflow-x-hidden">
            {groupedActivities.length === 0 && (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-60 font-medium">
                <History className="h-8 w-8 mb-2" />
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
                      <time className="text-[9px] text-muted-foreground font-medium ml-auto">
                        {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-foreground/80 leading-relaxed flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded border border-primary/25 bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-medium">{getWorkspaceMemberLabel(member, t("chatDrawer.someone"))}</span>
                        <span className="text-muted-foreground/80">{prettifyAction(a.action)}</span>
                      </p>

                      {changedFields && (
                        <p className="text-[10px] bg-muted/30 px-2 py-1 rounded border border-border/30 text-muted-foreground italic">
                          {t("chatDrawer.fields")} {changedFields}
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

      {activeTab === 'chat' && (
        <div className="p-4 border-t border-border/50 bg-background/30 shrink-0">
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
              inputClassName="pr-10 shadow-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!roomInput.trim()) return;
                await roomChat.sendMessage(roomInput.trim());
                setRoomInput("");
              }}
              disabled={!roomInput.trim() || roomChat.isSending}
              className="absolute right-1.5 p-1.5 rounded-full disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground transition-colors shadow-sm bg-accent text-accent-foreground"
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

