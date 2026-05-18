"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
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
import { listTeamRooms, getRoom, listRoomMembers, listTeamRoomGroups, sendAiRoomMessage, getActiveCall, type Room, type RoomCall, type RoomMember, type RoomGroup, RoomMessage } from "@/lib/api/rooms";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import { streamAgentChat } from "@/lib/api/agent";
import { buildAiMessageWithReferenceContext } from "@/lib/reference-ai-context";
import { getFullBrickSchemaContext } from "@/lib/bricks/brick-schema-registry";
import { AgentChatPanel } from "@/components/agent";
import { parseAiMarkup } from "@/lib/ai-markup";
import { NavbarAiCredits } from "@/components/ui/navbar-ai-credits";
import { RoomsLayout } from "@/components/rooms/RoomsLayout";
import { RoomSidebar } from "@/components/rooms/RoomSidebar";
import { RoomHeader } from "@/components/rooms/RoomHeader";
import { RoomChatArea } from "@/components/rooms/RoomChatArea";
import { RoomMembersPanel } from "@/components/rooms/RoomMembersPanel";
import { RoomPermissionsModal } from "@/components/rooms/RoomPermissionsModal";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { CreateRoomGroupModal } from "@/components/rooms/CreateRoomGroupModal";
import { Loader2, Phone, X } from "lucide-react";

const escapeXmlAttr = (value: string) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const buildRoomAiContent = (text: string, toolEvents: any[]): string => {
  const blocks: string[] = [];
  const baseText = String(text || "").trim();
  if (baseText) blocks.push(baseText);

  for (const event of toolEvents) {
    const id = String(event.id ?? `tc-${event.tool ?? event.toolName ?? "tool"}`);
    const toolName = String(event.tool ?? event.toolName ?? "tool");
    const input = event.input ?? {};
    const output = event.output ?? event.result ?? event.data;

    blocks.push(`<invoke id="${escapeXmlAttr(id)}" name="${escapeXmlAttr(toolName)}"><parameters>${JSON.stringify(input)}</parameters></invoke>`);

    if (event.phase === "waiting_for_approval") {
      blocks.push(`<tool_status id="${escapeXmlAttr(id)}" status="waiting_for_approval" />`);
      continue;
    }

    if (event.phase === "start") {
      blocks.push(`<tool_status id="${escapeXmlAttr(id)}" status="running" />`);
      continue;
    }

    if (event.phase === "done") {
      const success = event.success !== false;
      const durationMs = typeof event.durationMs === "number" ? event.durationMs : 0;
      blocks.push(`<tool_status id="${escapeXmlAttr(id)}" status="${success ? "done" : "error"}" success="${success}" duration_ms="${durationMs}" />`);
      if (output !== undefined) {
        const outputText = typeof output === "string" ? output : JSON.stringify(output);
        blocks.push(`<tool_output id="${escapeXmlAttr(id)}" success="${success}" duration_ms="${durationMs}">${outputText}</tool_output>`);
      }
    }
  }

  return blocks.join("\n");
};

export default function RoomDetailWeb() {
  const platform = usePlatform();
  const isMobile = platform === "mobile";

  const t = useTranslations("rooms");
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { accessToken, activeTeamId, user } = useSession();
  const realtime = useRealtime();
  const { isAdmin } = useActiveTeamRole(activeTeamId, accessToken, user?.id);

  const [room, setRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [groups, setGroups] = useState<RoomGroup[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [roomLoadError, setRoomLoadError] = useState<string | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isMembersPanelOpen, setIsMembersPanelOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialGroupId, setCreateInitialGroupId] = useState<string | undefined>();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showReadReceipts, setShowReadReceipts] = useState(true);
  const [activeCallInRoom, setActiveCallInRoom] = useState<RoomCall | null>(null);
  const [navbarUsageSlotEl, setNavbarUsageSlotEl] = useState<Element | null>(null);

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

  const loadRoom = useCallback(() => {
    if (!accessToken || !roomId) return;
    setIsLoadingRoom(true);
    setRoomLoadError(null);
    getRoom(roomId, accessToken)
      .then((r) => {
        setRoom(r);
        setShowReadReceipts(r.showReadReceipts ?? true);
      })
      .catch((err) => {
        console.error(err);
        setRoomLoadError(t("errors.loadFailed"));
      })
      .finally(() => setIsLoadingRoom(false));
  }, [accessToken, roomId]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    listTeamRooms(activeTeamId, accessToken).then(setRooms).catch(console.error);
    listTeamRoomGroups(activeTeamId, accessToken).then(setGroups).catch(console.error);
  }, [activeTeamId, accessToken]);

  // Detect navbar usage slot for portal rendering
  useEffect(() => {
    const checkDomElement = () => {
      const navSlot = document.getElementById("navbar-usage-slot");
      setNavbarUsageSlotEl((prev) => (prev === navSlot ? prev : navSlot));
    };

    checkDomElement();

    const observer = new MutationObserver(checkDomElement);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // Fetch active call on room load + subscribe to call started/ended events
  useEffect(() => {
    if (!roomId || !accessToken) return;
    getActiveCall(roomId, accessToken).then(setActiveCallInRoom).catch(() => {});

    const channel = realtime.getChannel(realtimeChannel.room(roomId));

    const onCallStarted = (msg: { name: string; data: unknown; clientId?: string }) => {
      const d = (msg.data ?? {}) as any;
      const { callId, initiatorUserId, startedAt } = d;
      if (!callId) return;
      setActiveCallInRoom({ id: callId, roomId, initiatorUserId: initiatorUserId ?? '', startedAt: startedAt ?? new Date().toISOString(), participants: [], transcriptStatus: 'none' });
    };

    const onCallEnded = () => {
      setActiveCallInRoom(null);
    };

    channel.subscribe('room.call.started', onCallStarted);
    channel.subscribe('room.call.ended', onCallEnded);

    return () => {
      try { channel.unsubscribe('room.call.started', onCallStarted); } catch {}
      try { channel.unsubscribe('room.call.ended', onCallEnded); } catch {}
    };
  }, [roomId, accessToken, realtime]);

  useEffect(() => {
    if (!accessToken || !roomId) return;
    listRoomMembers(roomId, accessToken).then(setRoomMembers).catch(console.error);
  }, [roomId, accessToken]);

  const handleAiTrigger = useCallback(async (content: string, approvalDecision?: 'approved' | 'rejected', approvalToolCall?: any) => {
    if (!roomId || !accessToken) return;

    // 1. Prepare context from last messages
    const lastMsgs = chatHook.messages.slice(-10).map(m => {
      const author = m.user?.displayName || (m.type === 'ai' ? 'AI Copilot' : 'User');
      let text = m.content;
      
      // If it's a poll, include results in context
      if (m.metadata?.pollVotes) {
        const votes = m.metadata.pollVotes;
        const summary = Object.entries(votes).map(([idx, uids]: [string, any]) => {
          const count = Array.isArray(uids) ? uids.length : 0;
          return `Option ${parseInt(idx) + 1}: ${count} votes`;
        }).join(", ");
        text += `\n[Poll State: ${summary}]`;
      }
      
      return `${author}: ${text}`;
    }).join("\n");
    const systemPrompt = `You are AI Copilot, a helpful assistant in the Kynto workspace. 
You have access to tools to manage documents, boards, and search. 
Use document_list and board_list to discover IDs and titles before requesting details.
When asked for counts or data, ALWAYS use your tools. 
Do not provide placeholders like [insert number here]. 
If a tool fails, explain why. 
You can create interactive polls/surveys using the <poll> tag.
Example: <poll>Question | Opt1 | Opt2</poll>.
To make it a multi-select survey, add "multiple: true" to metadata.
To set an expiration, add "expiresAt: ISOString" to metadata.
Current Room: ${room?.name || 'Unknown'}. 
Team Context: ${activeTeamId}.`;

    const fullPrompt = `${systemPrompt}\n\nRoom Context:\n${lastMsgs}\n\nUser Question: ${content}`;

    // 2. Add or update bot placeholder locally
    // If it's an approval resumption, find the last bot message
    const existingBotMsg = approvalDecision ? chatHook.messages.slice().reverse().find(m => m.type === 'ai' && m.id.startsWith('bot-')) : null;
    const botMsgId = existingBotMsg?.id || `bot-${Date.now()}`;
    const botUser = {
      displayName: t("ai.copilotName") || "AI Copilot",
      email: "ai@killio.app",
      avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=ai-copilot&backgroundColor=6d28d9",
    };

    if (!existingBotMsg) {
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
    } else {
      chatHook.updateLocalMessage(botMsgId, { status: 'sending' });
    }

    // 3. Stream response
    let accText = existingBotMsg?.content || "";
    const toolEvents: any[] = (existingBotMsg?.metadata?.toolEvents as any[]) || [];

    streamAgentChat(
      {
        teamId: activeTeamId || "",
        entityType: "team",
        entityId: activeTeamId || "",
        message: fullPrompt,
        approvalDecision,
        approvalToolCall,
      },
      accessToken,
      (event) => {
        if (event.type === "delta") {
          accText += event.text;
          chatHook.updateLocalMessage(botMsgId, { 
            content: buildRoomAiContent(accText || "AI_THINKING", toolEvents),
            metadata: { ...((existingBotMsg?.metadata as any) || {}) }
          });
        } else if (event.type === "tool_start") {
          toolEvents.push({ id: (event as any).id, tool: event.tool, input: event.input, phase: "start" });
          chatHook.updateLocalMessage(botMsgId, { 
            content: buildRoomAiContent(accText || `AI_THINKING_TOOL:${event.tool}`, toolEvents),
            metadata: { ...((existingBotMsg?.metadata as any) || {}) }
          });
        } else if (event.type === "tool_approval_request") {
          const idx = [...toolEvents].reverse().findIndex(e => (e.id && e.id === (event as any).id) || (e.tool === event.tool && e.phase === "start"));
          if (idx !== -1) {
            const actualIdx = toolEvents.length - 1 - idx;
            toolEvents[actualIdx] = { ...toolEvents[actualIdx], id: (event as any).id ?? toolEvents[actualIdx].id, phase: "waiting_for_approval" };
          }
          chatHook.updateLocalMessage(botMsgId, { 
            content: buildRoomAiContent(accText, toolEvents), 
            status: 'sent',
            metadata: { ...((existingBotMsg?.metadata as any) || {}) } 
          });
        } else if (event.type === "tool_done") {
          const incomingOutput = (event as any).output ?? (event as any).result ?? (event as any).data;
          const idx = [...toolEvents].reverse().findIndex(e => (e.id && e.id === (event as any).id) || (e.tool === event.tool && (e.phase === "start" || e.phase === "waiting_for_approval")));
          if (idx !== -1) {
            const actualIdx = toolEvents.length - 1 - idx;
            const previousOutput = toolEvents[actualIdx]?.output ?? toolEvents[actualIdx]?.result ?? toolEvents[actualIdx]?.data;
            toolEvents[actualIdx] = { 
              ...toolEvents[actualIdx], 
              id: (event as any).id ?? toolEvents[actualIdx].id,
              phase: "done", 
              success: event.success, 
              durationMs: event.durationMs,
              output: incomingOutput ?? previousOutput,
              result: incomingOutput ?? previousOutput,
            };
          } else {
            toolEvents.push({ 
              id: (event as any).id,
              tool: event.tool, 
              phase: "done", 
              success: event.success, 
              durationMs: event.durationMs,
              output: incomingOutput,
              result: incomingOutput,
            });
          }
          chatHook.updateLocalMessage(botMsgId, { 
            content: buildRoomAiContent(accText || "AI_THINKING", toolEvents),
            metadata: { ...((existingBotMsg?.metadata as any) || {}) }
          });
        } else if (event.type === "tool_result") {
          const incomingOutput = event.data;
          const idx = [...toolEvents].reverse().findIndex(e => (e.id && e.id === (event as any).id) || (e.tool === event.tool && (e.phase === "start" || e.phase === "waiting_for_approval" || e.phase === "done")));
          if (idx !== -1) {
            const actualIdx = toolEvents.length - 1 - idx;
            toolEvents[actualIdx] = {
              ...toolEvents[actualIdx],
              id: (event as any).id ?? toolEvents[actualIdx].id,
              output: incomingOutput,
              result: incomingOutput,
              phase: "done",
              success: event.success !== false,
              durationMs: event.durationMs ?? toolEvents[actualIdx]?.durationMs,
            };
          } else {
            toolEvents.push({
              id: (event as any).id,
              tool: event.tool,
              phase: "done",
              success: event.success !== false,
              durationMs: event.durationMs,
              output: incomingOutput,
              result: incomingOutput,
            });
          }
          chatHook.updateLocalMessage(botMsgId, {
            content: buildRoomAiContent(accText || "AI_THINKING", toolEvents),
            metadata: { ...((existingBotMsg?.metadata as any) || {}) }
          });
        } else if (event.type === "done") {
          const finalContent = event.text || accText;
          const billingMetadata = {
            billedTokens: event.billedTokens,
            billedCredits: event.billedCredits,
            modelUsed: event.modelUsed
          };
          
    const botUser = {
      displayName: "AI Copilot",
      email: "ai@killio.app",
      avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=ai-copilot&backgroundColor=6d28d9",
    };
    
    chatHook.updateLocalMessage(botMsgId, { 
      content: buildRoomAiContent(finalContent, toolEvents), 
      status: "sent",
      user: botUser,
      metadata: { ...billingMetadata } 
    });

          // Save to DB and broadcast to others via backend
          sendAiRoomMessage(roomId, buildRoomAiContent(finalContent, toolEvents), accessToken, {
            ...billingMetadata
          }).catch(console.error);

          // Speak AI response aloud when user is in an active call
          if (call.isInCall && activeRoomId === roomId && typeof window !== 'undefined' && window.speechSynthesis) {
            const plainText = finalContent
              .replace(/```[\s\S]*?```/g, '')
              .replace(/`[^`]*`/g, '')
              .replace(/[#*_~>]/g, '')
              .trim()
              .slice(0, 800);
            if (plainText) {
              window.speechSynthesis.cancel();
              const utter = new SpeechSynthesisUtterance(plainText);
              utter.rate = 1.05;
              window.speechSynthesis.speak(utter);
            }
          }
        } else if (event.type === "error") {
          chatHook.updateLocalMessage(botMsgId, { content: `Error: ${event.message}`, status: "failed" });
        }
      }
    );
  }, [roomId, accessToken, activeTeamId, chatHook, room?.name]);

  const handleToolApproval = useCallback((toolName: string, input: any, decision: 'approved' | 'rejected') => {
    // Resume AI trigger with decision
    handleAiTrigger("", decision, { name: toolName, input });
  }, [handleAiTrigger]);

  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);

  const handleSend = useCallback(async (overrideContent?: string) => {
    const finalContent = typeof overrideContent === 'string' ? overrideContent : chatInput;
    if (!finalContent.trim()) return;
    let content = finalContent.trim();
    setChatInput("");

    let metadata: any = replyTo ? {
      replyTo: {
        id: replyTo.id,
        content: parseAiMarkup(replyTo.content).visibleText,
        displayName: replyTo.type === "ai" ? "AI Copilot" : (replyTo.user?.displayName || "User")
      }
    } : undefined;

    // Detect /poll or /survey command
    const pollMatch = content.match(/^\/(poll|survey)\s+(.+)/i);
    if (pollMatch) {
      const type = pollMatch[1].toLowerCase();
      const rawBody = pollMatch[2];
      const parts = rawBody.split('|').map(p => p.trim()).filter(Boolean);
      
      if (parts.length >= 2) {
        const question = parts[0];
        const options = parts.slice(1);
        content = `<poll>\n${question}\n${options.join('\n')}\n</poll>`;
        
        metadata = {
          ...metadata,
          multiple: type === 'survey',
          // Default expiry: 2 hours
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        };
      }
    }

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
    setActiveCallInRoom(null);
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

  if (roomLoadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>{roomLoadError}</span>
        <button className="text-xs underline hover:text-foreground transition-colors" onClick={loadRoom}>
          Reintentar
        </button>
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
            {/* Active call banner — visible to members not in the call */}
            {activeCallInRoom && !call.isInCall && (
              <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 shrink-0">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex-1 font-medium">
                  Llamada en curso
                </span>
                <button
                  onClick={handleJoinCall}
                  className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1 rounded-full transition-colors"
                >
                  Unirse
                </button>
                <button
                  onClick={() => setActiveCallInRoom(null)}
                  className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  aria-label="Cerrar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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
              onToolApproval={handleToolApproval}
              onOpenCopilot={() => setIsAiPanelOpen(true)}
              replyTo={replyTo}
              onReply={setReplyTo}
              currentUserId={user?.id ?? ""}
              teamId={activeTeamId ?? undefined}
              canPost={permissions.canPost}
              showReadReceipts={showReadReceipts}
              transcripts={(callHistoryHook.calls as any[]).map((c) => ({
                callId: c.id,
                roomId: roomId ?? "",
                roomName: room?.name ?? "Room",
                startedAt: c.startedAt,
              }))}
              activeCallId={(call.isInCall && activeRoomId === roomId) ? (call.callId ?? undefined) : undefined}
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

      {/* Render AI Credits in navbar */}
      {navbarUsageSlotEl && activeTeamId && accessToken ? 
        createPortal(
          <NavbarAiCredits teamId={activeTeamId} accessToken={accessToken} />,
          navbarUsageSlotEl
        ) 
        : null}
    </div>
  );
}
