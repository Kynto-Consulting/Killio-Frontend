"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { useRoomChat } from "@/hooks/use-room-chat";
import { useRoomPresence } from "@/hooks/use-room-presence";
import { useRoomCallHistory } from "@/hooks/use-room-call-history";
import { useRoomPermissions } from "@/hooks/use-room-permissions";
import { useRoomNotifications } from "@/hooks/use-room-notifications";
import { useCall } from "@/components/providers/call-provider";
import { listTeamRooms, getRoom, listRoomMembers, listTeamRoomGroups, sendAiRoomMessage, type Room, type RoomCall, type RoomMember, type RoomGroup, RoomMessage } from "@/lib/api/rooms";
import { streamAgentChat } from "@/lib/api/agent";
import { buildAiMessageWithReferenceContext } from "@/lib/reference-ai-context";
import { getFullBrickSchemaContext } from "@/lib/bricks/brick-schema-registry";
import { AgentChatPanel } from "@/components/agent";
import { RoomsLayout } from "@/components/rooms/RoomsLayout";
import { RoomSidebar } from "@/components/rooms/RoomSidebar";
import { RoomHeader } from "@/components/rooms/RoomHeader";
import { RoomChatArea } from "@/components/rooms/RoomChatArea";
import { RoomMembersPanel } from "@/components/rooms/RoomMembersPanel";
import { RoomPermissionsModal } from "@/components/rooms/RoomPermissionsModal";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { CreateRoomGroupModal } from "@/components/rooms/CreateRoomGroupModal";
import { Loader2, X } from "lucide-react";

export default function RoomDetailWeb() {
  const platform = usePlatform();
  const isMobile = platform === "mobile";

  const t = useTranslations("rooms");
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { accessToken, activeTeamId, user } = useSession();
  const { isAdmin } = useActiveTeamRole(activeTeamId, accessToken, user?.id);

  const [room, setRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [groups, setGroups] = useState<RoomGroup[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isMembersPanelOpen, setIsMembersPanelOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialGroupId, setCreateInitialGroupId] = useState<string | undefined>();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showReadReceipts, setShowReadReceipts] = useState(true);

  const { permissions } = useRoomPermissions(roomId, accessToken);

  const userInfo = user
    ? {
      id: user.id,
      displayName: user.displayName ?? user.username ?? undefined,
      username: user.username ?? undefined,
      email: user.email ?? undefined,
      avatarUrl: undefined as string | undefined,
    }
    : null;

  const chatHook = useRoomChat(roomId, accessToken, user);
  const presenceMembers = useRoomPresence(roomId, userInfo, accessToken);
  const { call, activeRoomId, joinRoomCall, leaveRoomCall } = useCall();
  const callHistoryHook = useRoomCallHistory(roomId, accessToken);
  const { stopRing } = useRoomNotifications({
    roomId,
    roomName: room?.name,
    currentUserId: user?.id,
    accessToken,
  });

  const callsById = useMemo<Map<string, RoomCall>>(() => {
    const map = new Map<string, RoomCall>();
    callHistoryHook.calls.forEach((c: any) => map.set(c.id, c));
    return map;
  }, [callHistoryHook.calls]);

  useEffect(() => {
    if (!accessToken || !roomId) return;
    setIsLoadingRoom(true);
    getRoom(roomId, accessToken)
      .then((r) => {
        setRoom(r);
        setShowReadReceipts(r.showReadReceipts ?? true);
      })
      .catch(console.error)
      .finally(() => setIsLoadingRoom(false));
  }, [roomId, accessToken]);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    listTeamRooms(activeTeamId, accessToken).then(setRooms).catch(console.error);
    listTeamRoomGroups(activeTeamId, accessToken).then(setGroups).catch(console.error);
  }, [activeTeamId, accessToken]);

  useEffect(() => {
    if (!accessToken || !roomId) return;
    listRoomMembers(roomId, accessToken).then(setRoomMembers).catch(console.error);
  }, [roomId, accessToken]);

  const handleAiTrigger = useCallback(async (content: string) => {
    if (!roomId || !accessToken) return;

    // 1. Prepare context from last messages
    const lastMsgs = chatHook.messages.slice(-10).map(m => `${m.user?.displayName || (m.type === 'ai' ? 'AI Copilot' : 'User')}: ${m.content}`).join("\n");
    const systemPrompt = `You are AI Copilot, a helpful assistant in the Kynto workspace. 
You have access to tools to manage documents, boards, and search. 
Use document_list and board_list to discover IDs and titles before requesting details.
When asked for counts or data, ALWAYS use your tools. 
Do not provide placeholders like [insert number here]. 
If a tool fails, explain why. 
Current Room: ${room?.name || 'Unknown'}. 
Team Context: ${activeTeamId}.`;

    const fullPrompt = `${systemPrompt}\n\nRoom Context:\n${lastMsgs}\n\nUser Question: ${content}`;

    // 2. Add bot placeholder locally
    const botMsgId = `bot-${Date.now()}`;
    const botUser = {
      displayName: "AI Copilot",
      email: "ai@killio.app",
      avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=killio-ai&backgroundColor=c084fc",
    };

    chatHook.addLocalMessage({
      id: botMsgId,
      roomId,
      userId: "000",
      content: "AI_THINKING",
      type: "ai",
      createdAt: new Date().toISOString(),
      status: "sending",
      user: botUser,
    });

    // 3. Stream response
    let accText = "";
    streamAgentChat(
      {
        teamId: activeTeamId || "",
        entityType: "team",
        entityId: activeTeamId || "",
        message: fullPrompt,
      },
      accessToken,
      (event) => {
        if (event.type === "delta") {
          accText += event.text;
          chatHook.updateLocalMessage(botMsgId, { content: accText });
        } else if (event.type === "tool_start") {
          chatHook.updateLocalMessage(botMsgId, { content: `AI_THINKING_TOOL:${event.tool}` });
        } else if (event.type === "tool_done") {
          // Keep the accText if we have any, or go back to thinking
          chatHook.updateLocalMessage(botMsgId, { content: accText || "AI_THINKING" });
        } else if (event.type === "done") {
          const finalContent = event.text || accText;
          chatHook.updateLocalMessage(botMsgId, { content: finalContent, status: "sent" });

          // Save to DB and broadcast to others via backend
          sendAiRoomMessage(roomId, finalContent, accessToken).catch(console.error);
        } else if (event.type === "error") {
          chatHook.updateLocalMessage(botMsgId, { content: `Error: ${event.message}`, status: "failed" });
        }
      }
    );
  }, [roomId, accessToken, activeTeamId, chatHook]);

  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput("");

    const metadata = replyTo ? {
      replyTo: {
        id: replyTo.id,
        content: replyTo.content,
        displayName: replyTo.type === "ai" ? "AI Copilot" : (replyTo.user?.displayName || "User")
      }
    } : undefined;

    const isReplyingToAi = replyTo?.type === "ai";
    setReplyTo(null);
    await chatHook.sendMessage(content, metadata);

    if (content.toLowerCase().startsWith("#ai") || isReplyingToAi) {
      // Trigger AI after sending the user message to the room
      handleAiTrigger(content.replace(/^#ai\s*/i, ""));
    }
  }, [chatInput, chatHook, handleAiTrigger, replyTo]);

  const handleJoinCall = useCallback(() => {
    stopRing();
    joinRoomCall(roomId);
  }, [roomId, joinRoomCall, stopRing]);

  const handleToggleAiPanel = useCallback(() => {
    setIsAiPanelOpen((prev) => {
      const next = !prev;
      if (next) setIsMembersPanelOpen(false);
      return next;
    });
  }, []);

  const handleToggleMembersPanel = useCallback(() => {
    setIsMembersPanelOpen((prev) => {
      const next = !prev;
      if (next) setIsAiPanelOpen(false);
      return next;
    });
  }, []);

  if (isLoadingRoom) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Room not found.
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <RoomsLayout
        sidebar={(onClose) => (
          <RoomSidebar
            rooms={rooms}
            groups={groups}
            activeRoomId={roomId}
            isLoading={false}
            canCreate={isAdmin}
            onSelectRoom={(id) => { router.push(`/rooms/${id}`); onClose(); }}
            onCreateRoom={(groupId) => {
              setCreateInitialGroupId(groupId);
              setIsCreateOpen(true);
              onClose();
            }}
            onCreateGroup={() => { setIsCreateGroupOpen(true); onClose(); }}
            onClose={onClose}
            t={t}
          />
        )}
      >
        <div className="flex flex-1 overflow-hidden">
          {/* Main chat column */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <RoomHeader
              room={room}
              presenceMembers={presenceMembers}
              isInCall={call.isInCall && activeRoomId === roomId}
              isAiPanelOpen={isAiPanelOpen}
              isMembersPanelOpen={isMembersPanelOpen}
              canCall={permissions.canCall}
              canManage={permissions.canManage}
              onStartCall={handleJoinCall}
              onLeaveCall={leaveRoomCall}
              onToggleAiPanel={handleToggleAiPanel}
              onToggleMembersPanel={handleToggleMembersPanel}
              onOpenPermissions={() => setIsPermissionsOpen(true)}
              t={t}
            />
            <RoomChatArea
              messages={chatHook.messages}
              callsById={callsById}
              isLoading={chatHook.isLoading}
              isSending={chatHook.isSending}
              hasMore={chatHook.hasMore}
              typingUsers={chatHook.typingUsers}
              inputValue={chatInput}
              onInputChange={setChatInput}
              onSend={handleSend}
              onLoadMore={chatHook.loadMore}
              onReact={chatHook.addReaction}
              onMarkRead={chatHook.markAsRead}
              onTyping={() => chatHook.setTyping(true)}
              onViewTranscript={callHistoryHook.getTranscript}
              onAiTrigger={handleAiTrigger}
              onOpenCopilot={() => setIsAiPanelOpen(true)}
              replyTo={replyTo}
              onReply={setReplyTo}
              currentUserId={user?.id ?? ""}
              teamId={activeTeamId ?? undefined}
              canPost={permissions.canPost}
              showReadReceipts={showReadReceipts}
              t={t}
            />
          </div>

          {/* Right panel: AI or Members */}
          {!isMobile && isAiPanelOpen && (
            <div className="w-80 shrink-0 border-l border-border/50 overflow-hidden flex flex-col">
              <AgentChatPanel
                teamId={activeTeamId ?? ""}
                entityType="team"
                entityId={activeTeamId ?? ""}
                onClose={() => setIsAiPanelOpen(false)}
              />
            </div>
          )}
          {!isMobile && !isAiPanelOpen && isMembersPanelOpen && (
            <div className="w-60 shrink-0 border-l border-border/50 overflow-hidden flex flex-col">
              <RoomMembersPanel
                presenceMembers={presenceMembers}
                roomMembers={roomMembers}
                currentUserId={user?.id ?? ""}
                t={t}
              />
            </div>
          )}
        </div>
      </RoomsLayout>

      {isMobile && (isAiPanelOpen || isMembersPanelOpen) && (
        <button
          className="fixed inset-0 z-[210] bg-black/50 backdrop-blur-sm"
          onClick={() => {
            setIsAiPanelOpen(false);
            setIsMembersPanelOpen(false);
          }}
          aria-label="Close panel"
        />
      )}

      {isMobile && isAiPanelOpen && (
        <div className="fixed inset-0 z-[220] bg-card border-l border-border/50 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 shrink-0">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI Copilot</span>
            <button
              onClick={() => setIsAiPanelOpen(false)}
              className="p-1 rounded-md hover:bg-accent/10 text-muted-foreground"
              aria-label="Close AI panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <AgentChatPanel
              teamId={activeTeamId ?? ""}
              entityType="team"
              entityId={activeTeamId ?? ""}
              onClose={() => setIsAiPanelOpen(false)}
              className="h-full"
            />
          </div>
        </div>
      )}

      {isMobile && !isAiPanelOpen && isMembersPanelOpen && (
        <div className="fixed inset-0 z-[220] bg-card border-l border-border/50 overflow-hidden flex flex-col">
          <RoomMembersPanel
            presenceMembers={presenceMembers}
            roomMembers={roomMembers}
            currentUserId={user?.id ?? ""}
            onClose={() => setIsMembersPanelOpen(false)}
            t={t}
          />
        </div>
      )}


      <RoomPermissionsModal
        isOpen={isPermissionsOpen}
        onClose={() => setIsPermissionsOpen(false)}
        roomId={roomId}
        accessToken={accessToken ?? ""}
        currentUserId={user?.id ?? ""}
        showReadReceipts={showReadReceipts}
        onSettingsChange={(s) => setShowReadReceipts(s.showReadReceipts)}
        t={t}
      />

      {activeTeamId && accessToken && (
        <>
          <CreateRoomModal
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            groups={groups}
            initialGroupId={createInitialGroupId}
            onCreated={(newRoomId) => {
              setIsCreateOpen(false);
              router.push(`/rooms/${newRoomId}`);
            }}
            t={t}
          />
          <CreateRoomGroupModal
            isOpen={isCreateGroupOpen}
            onClose={() => setIsCreateGroupOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            onCreated={(newGroup) => {
              setGroups((prev) => [...prev, newGroup]);
              setIsCreateGroupOpen(false);
            }}
            t={t}
          />
        </>
      )}
    </div>
  );
}
