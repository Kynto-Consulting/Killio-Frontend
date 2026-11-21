"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { useRoomChat } from "@/hooks/use-room-chat";
import { useRoomPresence } from "@/hooks/use-room-presence";
import { useRoomCallHistory } from "@/hooks/use-room-call-history";
import { useRoomPermissions } from "@/hooks/use-room-permissions";
import { useRoomNotifications } from "@/hooks/use-room-notifications";
import { useRoomDirectory } from "@/hooks/use-room-directory";
import { useRoomUnread } from "@/hooks/use-room-unread";
import { useRoomReferences } from "@/hooks/use-room-references";
import { useRealtimeAccessRenewal } from "@/hooks/use-room-realtime-access";
import { useCall } from "@/components/providers/call-provider";
import {
  getRoom, listRoomMembers, listRoomMessages, listPinnedMessages, listActiveMutes, deleteRoomGroup, reorderRoomGroups, findOrCreateDm, unmuteTeamMember, sendAiRoomMessage, getActiveCall,
  type Room, type RoomCall, type RoomMember, type RoomGroup, RoomMessage,
} from "@/lib/api/rooms";
import { dmDisplayName } from "@/lib/rooms/channel-layout";
import { mergePinned, filterMessagesByText, messageActions, splitThreads } from "@/lib/rooms/message-structure";
import { neutralizeEveryone, toWireMentions } from "@/lib/rooms/mentions";
import { muteMinutesLeft } from "@/lib/rooms/room-controls";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import { streamAgentChat } from "@/lib/api/agent";
import { buildAiMessageWithReferenceContext } from "@/lib/reference-ai-context";
import { getFullBrickSchemaContext } from "@/lib/bricks/brick-schema-registry";
import { AgentChatPanel, ModelSelector } from "@/components/agent";
import { parseAiMarkup } from "@/lib/ai-markup";
import { NavbarAiCredits } from "@/components/ui/navbar-ai-credits";
import { RoomsLayout } from "@/components/rooms/RoomsLayout";
import { RoomSidebar } from "@/components/rooms/RoomSidebar";
import { RoomHeader } from "@/components/rooms/RoomHeader";
import { RoomChatArea } from "@/components/rooms/RoomChatArea";
import { RoomMembersPanel } from "@/components/rooms/RoomMembersPanel";
import { RoomMessageItem } from "@/components/rooms/RoomMessageItem";
import { PinnedPanel, ThreadPanel } from "@/components/rooms/SidePanels";
import { MuteMemberModal } from "@/components/rooms/MuteMemberModal";
import { ChannelSettingsModal } from "@/components/rooms/ChannelSettingsModal";
import { CategorySettingsModal } from "@/components/rooms/CategorySettingsModal";
import { Loader2, Menu, Phone, ShieldOff, X } from "lucide-react";
import { useTeamGroups } from "@/hooks/use-team-groups";

const escapeXmlAttr = (value: string) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const hasCompleteInlineToolMarkup = (value: string): boolean =>
  /<invoke\b[^>]*>[\s\S]*?<\/invoke>/i.test(value) ||
  /<tool_status\b[^>]*\/?>/i.test(value) ||
  /<tool_output\b[^>]*>[\s\S]*?<\/tool_output>/i.test(value) ||
  /<batch_invoke\b[^>]*>[\s\S]*?<\/batch_invoke>/i.test(value);

const buildRoomAiContent = (text: string, toolEvents: any[]): string => {
  const blocks: string[] = [];
  const baseText = String(text || "").trim();
  if (hasCompleteInlineToolMarkup(baseText)) return baseText;
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
  const searchParams = useSearchParams();
  const roomId = params.roomId as string;
  const { accessToken, activeTeamId, user } = useSession();
  const realtime = useRealtime();
  const { isAdmin } = useActiveTeamRole(activeTeamId, accessToken, user?.id);
  const directory = useRoomDirectory(activeTeamId, accessToken, user?.id, isAdmin);
  const { groups, capabilities, roles: teamRoles, myRoleIds, peers } = directory;
  const references = useRoomReferences(activeTeamId, accessToken);
  const { groups: teamGroups } = useTeamGroups(activeTeamId);
  const renewRealtimeAccess = useRealtimeAccessRenewal();

  const [room, setRoom] = useState<Room | null>(null);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [membersState, setMembersState] = useState<"loading" | "ready" | "error">("loading");
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [roomLoadError, setRoomLoadError] = useState<string | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isMembersPanelOpen, setIsMembersPanelOpen] = useState(false);
  const [isPinsOpen, setIsPinsOpen] = useState(false);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [jumpToMessageId, setJumpToMessageId] = useState<string | null>(null);
  const [fetchedPins, setFetchedPins] = useState<RoomMessage[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [muteTarget, setMuteTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const [activeMutes, setActiveMutes] = useState<Record<string, string | null>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialGroupId, setCreateInitialGroupId] = useState<string | undefined>();
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; group: RoomGroup | null }>({ open: false, group: null });
  const [chatInput, setChatInput] = useState("");
  const [showReadReceipts, setShowReadReceipts] = useState(true);
  const [activeCallInRoom, setActiveCallInRoom] = useState<RoomCall | null>(null);
  const [navbarUsageSlotEl, setNavbarUsageSlotEl] = useState<Element | null>(null);
  // Model chosen for the next AI message in an AI room. Threaded into
  // streamAgentChat as `model` (backend clamps to plan + once-only lock).
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const { access, controls, isReady: permissionsReady, refresh: refreshPermissions } = useRoomPermissions(roomId, accessToken, {
    channelType: room?.channelType,
    roomType: room?.type,
  });

  // An "AI room" is any room under the room group named "vault" (the Killio AI
  // assistant group, created from /rooms/vault). These behave like a private 1:1
  // chat with Killio: every message goes to the AI, and member/permission
  // management is disabled (no humans to add).
  const isAiRoom = useMemo(() => {
    if (!room?.groupId) return false;
    const group = groups.find((g) => g.id === room.groupId);
    return (group?.name ?? "").trim().toLowerCase() === "vault";
  }, [room?.groupId, groups]);

  const userInfo = user
    ? {
      id: user.id,
      displayName: user.displayName ?? user.username ?? undefined,
      username: user.username ?? undefined,
      email: user.email ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
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
        // 403 / 404: the room does not exist for this user (a private channel reads as missing, on purpose).
        const status = (err as { status?: number })?.status;
        setRoomLoadError(status === 403 || status === 404 ? t("errors.noAccessHint") : t("errors.loadFailed"));
      })
      .finally(() => setIsLoadingRoom(false));
  }, [accessToken, roomId]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // Panels belong to a room: switching rooms closes thread, search and the jump target.
  useEffect(() => {
    setThreadRootId(null);
    setSearchQuery("");
    setIsSearchOpen(false);
    setJumpToMessageId(null);
    setFetchedPins([]);
    setReplyTo(null);
    setChatInput("");
  }, [roomId]);

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

  // People who can see this room (the server resolves it; never the legacy room_members list).
  const [membersVersion, setMembersVersion] = useState(0);
  useEffect(() => {
    if (!accessToken || !roomId) return;
    let cancelled = false;
    setMembersState("loading");
    listRoomMembers(roomId, accessToken)
      .then((m) => { if (!cancelled) { setRoomMembers(m); setMembersState("ready"); } })
      .catch((err) => { if (!cancelled) { console.error(err); setMembersState("error"); } });
    return () => { cancelled = true; };
  }, [roomId, accessToken, membersVersion]);

  // Opening a thread loads its replies (the loaded page may not hold them all).
  const { mergeMessages } = chatHook;
  useEffect(() => {
    if (!threadRootId || !accessToken || !roomId) return;
    let cancelled = false;
    listRoomMessages(roomId, accessToken, 100, undefined, threadRootId)
      .then((list) => { if (!cancelled) mergeMessages(list); })
      .catch(() => { /* the replies already loaded are shown */ });
    return () => { cancelled = true; };
  }, [threadRootId, roomId, accessToken, mergeMessages]);

  // Pinned messages the server lists (older than the loaded page); merged with the live ones below.
  useEffect(() => {
    if (!isPinsOpen || !accessToken || !roomId) return;
    let cancelled = false;
    setPinsLoading(true);
    listPinnedMessages(roomId, accessToken)
      .then((p) => { if (!cancelled) setFetchedPins(p); })
      .catch(() => { /* old server: the loaded messages are enough */ })
      .finally(() => { if (!cancelled) setPinsLoading(false); });
    return () => { cancelled = true; };
  }, [isPinsOpen, roomId, accessToken]);

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
        model: selectedModel ?? undefined,
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

          // Save to DB and broadcast to others via backend. Pass `localBotId`
          // so the realtime echo of THIS message reconciles the optimistic
          // `bot-…` bubble in place (useRoomChat onMessage nonce match) instead
          // of appending a second identical AI bubble — the duplicate-reply bug.
          sendAiRoomMessage(roomId, buildRoomAiContent(finalContent, toolEvents), accessToken, {
            ...billingMetadata,
            localBotId: botMsgId,
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
  }, [roomId, accessToken, activeTeamId, chatHook, room?.name, selectedModel]);

  const handleToolApproval = useCallback((toolName: string, input: any, decision: 'approved' | 'rejected') => {
    // Resume AI trigger with decision
    handleAiTrigger("", decision, { name: toolName, input });
  }, [handleAiTrigger]);

  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);

  const handleSend = useCallback(async (overrideContent?: string) => {
    const finalContent = typeof overrideContent === 'string' ? overrideContent : chatInput;
    if (!finalContent.trim()) return;
    // The composer is replaced by a notice when the user cannot write; this also covers Enter pressed in a stale field.
    if (permissionsReady && controls.composer !== "input") return;
    // Without the right to mention everyone, the token becomes plain text instead of promising a notification.
    let content = neutralizeEveryone(finalContent.trim(), controls.canMentionEveryone);
    setChatInput("");

    let metadata: any = replyTo ? {
      replyTo: {
        id: replyTo.id,
        content: parseAiMarkup(replyTo.content).visibleText,
        displayName: replyTo.type === "ai" || replyTo.type === "ai_response" ? "AI Copilot" : (replyTo.user?.displayName || "User")
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

    const isReplyingToAi = replyTo?.type === "ai" || replyTo?.type === "ai_response";
    setReplyTo(null);

    // In an AI room the whole conversation IS the assistant: every message
    // triggers the AI, with no "#ai" prefix required. Strip a leading "#ai" if
    // the user still typed it so it doesn't show up in their bubble.
    if (isAiRoom) {
      const aiContent = content.replace(/^#ai\s*/i, "");
      await chatHook.sendMessage(toWireMentions(aiContent), metadata);
      handleAiTrigger(aiContent);
      return;
    }

    await chatHook.sendMessage(toWireMentions(content), metadata);

    if (content.toLowerCase().startsWith("#ai") || isReplyingToAi) {
      // Trigger AI after sending the user message to the room
      handleAiTrigger(content.replace(/^#ai\s*/i, ""));
    }
  }, [chatInput, chatHook, handleAiTrigger, replyTo, isAiRoom, permissionsReady, controls.composer, controls.canMentionEveryone]);

  // When arriving from /rooms/vault, the first message is passed via `?ai=`.
  // Send it to the room and trigger the AI once the room + chat are ready, then
  // strip the param so a refresh doesn't re-send. Reuses the normal AI flow.
  const pendingAiSentRef = useRef(false);
  useEffect(() => {
    if (pendingAiSentRef.current) return;
    if (isLoadingRoom || !room || chatHook.isLoading || !permissionsReady) return;
    const pending = searchParams.get("ai");
    if (!pending) return;
    pendingAiSentRef.current = true;
    router.replace(`/rooms/${roomId}`);
    handleSend(`#ai ${pending}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingRoom, room, chatHook.isLoading, permissionsReady, searchParams, roomId]);

  const handleJoinCall = useCallback(() => {
    stopRing();
    setActiveCallInRoom(null);
    joinRoomCall(roomId);
  }, [roomId, joinRoomCall, stopRing]);


  // Only one right-hand panel at a time: copilot, members, pinned messages or a thread.
  const openPanel = useCallback((panel: "ai" | "members" | "pins" | "thread" | null) => {
    setIsAiPanelOpen(panel === "ai");
    setIsMembersPanelOpen(panel === "members");
    setIsPinsOpen(panel === "pins");
    if (panel !== "thread") setThreadRootId(null);
  }, []);

  const handleToggleAiPanel = useCallback(() => openPanel(isAiPanelOpen ? null : "ai"), [openPanel, isAiPanelOpen]);
  const handleToggleMembersPanel = useCallback(() => openPanel(isMembersPanelOpen ? null : "members"), [openPanel, isMembersPanelOpen]);
  const handleTogglePins = useCallback(() => openPanel(isPinsOpen ? null : "pins"), [openPanel, isPinsOpen]);
  const handleOpenThread = useCallback((rootId: string) => {
    openPanel("thread");
    setThreadRootId(rootId);
  }, [openPanel]);
  const closePanels = useCallback(() => openPanel(null), [openPanel]);

  // ── Derived data for the view ──────────────────────────────────────────────
  const roomMatches = room?.id === roomId;
  const searching = searchQuery.trim().length > 0;
  const { main: mainMessages, replies: threadReplies } = useMemo(() => splitThreads(chatHook.messages), [chatHook.messages]);
  const listMessages = useMemo(
    () => (searching ? filterMessagesByText(chatHook.messages, searchQuery, (m) => parseAiMarkup(m.content).visibleText) : mainMessages),
    [searching, chatHook.messages, searchQuery, mainMessages],
  );
  const pins = useMemo(() => mergePinned(chatHook.messages, fetchedPins), [chatHook.messages, fetchedPins]);
  const threadRoot = threadRootId ? chatHook.messages.find((m) => m.id === threadRootId) : undefined;
  const myGroupIds = useMemo(() => teamGroups.filter((g) => g.isMember).map((g) => g.id), [teamGroups]);
  const decoratedRooms = useRoomUnread({ rooms: directory.rooms, activeRoomId: roomId, userId: user?.id, roleIds: myRoleIds, groupIds: myGroupIds }).rooms;

  const selfNames = useMemo(
    () => [user?.displayName, user?.username, user?.email, user?.email ? user.email.split("@")[0] : null],
    [user?.displayName, user?.username, user?.email],
  );

  const roomTitle = useMemo(() => {
    if (!room) return "";
    if (room.type === "dm") return dmDisplayName(room, selfNames, peers[room.id]?.name);
    if (room.linkedEntityType && room.linkedEntityId) return references.entityTitles[`${room.linkedEntityType}:${room.linkedEntityId}`] ?? room.name;
    return room.name;
  }, [room, selfNames, peers, references.entityTitles]);

  const resolverContext = useMemo(
    () => ({ documents: references.documents, boards: references.boards, folders: [], users: references.users, groups: teamGroups, roles: teamRoles }) as any,
    [references.documents, references.boards, references.users, teamGroups, teamRoles],
  );

  const muteLeft = muteMinutesLeft(access);
  const pageControls = permissionsReady ? controls : { ...controls, composer: "input" as const };

  // ── Actions ────────────────────────────────────────────────────────────────
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleReorderGroups = useCallback(async (orderedIds: string[]) => {
    if (!activeTeamId || !accessToken) return;
    const previous = directory.groups;
    directory.setGroups(orderedIds.map((id, index) => ({ ...(previous.find((g) => g.id === id) as RoomGroup), sortOrder: index })).filter((g) => g.id));
    try {
      await reorderRoomGroups(activeTeamId, orderedIds, accessToken);
    } catch {
      directory.setGroups(previous);
      setNotice(t("category.errors.reorderFailed"));
    }
  }, [activeTeamId, accessToken, directory, t]);

  const handleDeleteGroup = useCallback(async (group: RoomGroup) => {
    if (!activeTeamId || !accessToken) return;
    try {
      await deleteRoomGroup(activeTeamId, group.id, accessToken);
      directory.refresh();
    } catch {
      setNotice(t("category.errors.deleteFailed"));
    }
  }, [activeTeamId, accessToken, directory, t]);

  const handleOpenDirectMessage = useCallback(async (userId: string) => {
    if (!activeTeamId || !accessToken) return;
    try {
      const dm = await findOrCreateDm(activeTeamId, userId, accessToken);
      await renewRealtimeAccess(); // the DM may be new: its channel was not in the token
      directory.refresh();
      router.push(`/rooms/${dm.id}`);
    } catch {
      setNotice(t("sidebar.dmFailed"));
    }
  }, [activeTeamId, accessToken, directory, renewRealtimeAccess, router, t]);

  const handleUnmute = useCallback(async (member: RoomMember) => {
    if (!accessToken || !activeTeamId) return;
    try {
      await unmuteTeamMember(activeTeamId, member.userId, accessToken);
      setActiveMutes((prev) => { const { [member.userId]: _gone, ...rest } = prev; return rest; });
    } catch {
      setNotice(t("mod.errors.failed"));
    }
  }, [accessToken, activeTeamId, t]);

  // Who is muted right now (only people who may moderate need it), and the members panel list with roles and mute state.
  useEffect(() => {
    if (!isMembersPanelOpen || !capabilities.canMuteMembers || !activeTeamId || !accessToken) return;
    let cancelled = false;
    listActiveMutes(activeTeamId, accessToken).then((list) => {
      if (!cancelled) setActiveMutes(Object.fromEntries(list.map((m) => [m.userId, m.mutedUntil])));
    });
    return () => { cancelled = true; };
  }, [isMembersPanelOpen, capabilities.canMuteMembers, activeTeamId, accessToken]);

  const panelMembers = useMemo<RoomMember[]>(() => {
    const roleById = new Map(teamRoles.map((r) => [r.id, r]));
    return roomMembers.map((m) => {
      const roles = (references.memberRoleIds.get(m.userId) ?? []).map((id) => roleById.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
      return {
        ...m,
        roles: m.roles ?? roles,
        isBot: m.isBot ?? references.botIds.has(m.userId),
        mutedUntil: m.userId in activeMutes ? activeMutes[m.userId] : m.mutedUntil ?? null,
      };
    });
  }, [roomMembers, teamRoles, references.memberRoleIds, references.botIds, activeMutes]);

  const handleThreadSend = useCallback(async (content: string) => {
    if (!threadRootId) return;
    await chatHook.sendMessage(toWireMentions(neutralizeEveryone(content, controls.canMentionEveryone)), undefined, threadRootId);
  }, [chatHook, threadRootId, controls.canMentionEveryone]);

  const handleEdit = useCallback((id: string, content: string) => chatHook.editMessage(id, toWireMentions(neutralizeEveryone(content, controls.canMentionEveryone))), [chatHook, controls.canMentionEveryone]);
  const handleDelete = useCallback((id: string) => chatHook.deleteMessage(id), [chatHook]);
  const handlePin = useCallback((id: string, pinned: boolean) => chatHook.setPinned(id, pinned), [chatHook]);

  const renderThreadMessage = (m: RoomMessage) => (
    <RoomMessageItem
      message={m}
      isOwn={m.userId === user?.id}
      showAvatar
      inThread
      onReact={(emoji) => chatHook.addReaction(m.id, emoji)}
      resolverContext={resolverContext}
      teamId={activeTeamId ?? undefined}
      currentUserId={user?.id ?? ""}
      showReadReceipts={false}
      actions={messageActionsFor(m)}
      onEdit={(c) => handleEdit(m.id, c)}
      onDelete={() => handleDelete(m.id)}
      onTogglePin={(p) => handlePin(m.id, p)}
      myRoleIds={myRoleIds}
      myGroupIds={myGroupIds}
      t={t}
    />
  );

  const messageActionsFor = (m: RoomMessage) =>
    messageActions(m, user?.id ?? "", {
      canEditOwn: controls.canEditOwn, canDeleteOwn: controls.canDeleteOwn, canDeleteOthers: controls.canDeleteOthers,
      canPin: controls.canPin, canReply: controls.canReply, showReactions: controls.showReactions,
    });

  const rightPanel = (isMobileView: boolean) => {
    if (isAiPanelOpen) {
      return (
        <AgentChatPanel
          teamId={activeTeamId ?? ""}
          entityType="team"
          entityId={activeTeamId ?? ""}
          onClose={closePanels}
          className={isMobileView ? "h-full" : undefined}
        />
      );
    }
    if (threadRootId) {
      return (
        <ThreadPanel
          root={threadRoot}
          replies={threadReplies.get(threadRootId) ?? []}
          canReply={controls.canReply}
          onSend={handleThreadSend}
          renderMessage={renderThreadMessage}
          onClose={closePanels}
          t={t}
        />
      );
    }
    if (isPinsOpen) {
      return (
        <PinnedPanel
          messages={pins}
          isLoading={pinsLoading && pins.length === 0}
          canUnpin={controls.canPin}
          onUnpin={(id) => chatHook.setPinned(id, false)}
          onJump={(id) => { setSearchQuery(""); setIsSearchOpen(false); setJumpToMessageId(id); if (isMobileView) closePanels(); }}
          onClose={closePanels}
          t={t}
        />
      );
    }
    if (isMembersPanelOpen) {
      return (
        <RoomMembersPanel
          presenceMembers={presenceMembers}
          roomMembers={panelMembers}
          currentUserId={user?.id ?? ""}
          isLoading={membersState === "loading"}
          hasError={membersState === "error"}
          onRetry={() => setMembersVersion((v) => v + 1)}
          canModerate={capabilities.canMuteMembers && room?.type !== "dm"}
          onMute={(m) => setMuteTarget({ userId: m.userId, displayName: m.displayName || m.email })}
          onUnmute={handleUnmute}
          onOpenDm={(m) => { void handleOpenDirectMessage(m.userId); if (isMobileView) closePanels(); }}
          onClose={closePanels}
          t={t}
        />
      );
    }
    return null;
  };

  const anyPanelOpen = isAiPanelOpen || isMembersPanelOpen || isPinsOpen || Boolean(threadRootId);
  const panelTitle = isAiPanelOpen ? t("header.copilot") : threadRootId ? t("thread.title") : isPinsOpen ? t("pins.title") : t("members.title");

  const sidebarNode = (onClose: () => void) => (
    <RoomSidebar
      rooms={decoratedRooms}
      groups={groups}
      activeRoomId={roomId}
      isLoading={directory.isLoading}
      hasError={directory.error}
      onRetry={directory.refresh}
      canCreate={capabilities.canCreateChannels}
      canManage={capabilities.canManageChannels}
      entityTitles={references.entityTitles}
      peers={peers}
      selfNames={selfNames}
      members={references.users.map((m) => ({ id: m.id, name: m.name, email: m.primaryEmail ?? undefined, avatarUrl: m.avatarUrl }))}
      currentUserId={user?.id}
      onCreateRoom={(groupId) => { setCreateInitialGroupId(groupId); setIsCreateOpen(true); onClose(); }}
      onCreateGroup={() => { setCategoryDialog({ open: true, group: null }); onClose(); }}
      onEditGroup={(g) => { setCategoryDialog({ open: true, group: g }); onClose(); }}
      onDeleteGroup={handleDeleteGroup}
      onReorderGroups={handleReorderGroups}
      onOpenDirectMessage={(id) => { void handleOpenDirectMessage(id); onClose(); }}
      onClose={onClose}
      t={t}
    />
  );

  const slimBar = (openSidebar: () => void) => (
    <div className="flex shrink-0 items-center gap-2 border-b-2 border-[var(--memphis-line)] px-3 py-2 md:hidden">
      <button type="button" onClick={openSidebar} aria-label={t("sidebar.open")} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
        <Menu className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <RoomsLayout drawerLabel={t("sidebar.channels")} sidebar={sidebarNode}>
        {({ openSidebar }) => (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {roomLoadError ? (
                <>
                  {slimBar(openSidebar)}
                  <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
                    <ShieldOff className="h-8 w-8 opacity-60" aria-hidden />
                    <p className="max-w-xs">{roomLoadError}</p>
                    <button type="button" className="rounded-lg border-2 border-[var(--memphis-line)] px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]" onClick={loadRoom}>
                      {t("errors.retry")}
                    </button>
                  </div>
                </>
              ) : isLoadingRoom || !roomMatches || !room ? (
                <>
                  {slimBar(openSidebar)}
                  <div className="flex flex-1 items-center justify-center" role="status" aria-label={t("chat.loading")}>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
                  </div>
                </>
              ) : (
                <>
                  <RoomHeader
                    room={room}
                    title={roomTitle}
                    presenceMembers={presenceMembers}
                    memberCount={membersState === "ready" ? roomMembers.length : undefined}
                    isInCall={call.isInCall && activeRoomId === roomId}
                    isAiPanelOpen={isAiPanelOpen}
                    isMembersPanelOpen={isMembersPanelOpen}
                    isPinsOpen={isPinsOpen}
                    isSearchOpen={isSearchOpen}
                    pinCount={pins.length}
                    controls={pageControls}
                    isAiRoom={isAiRoom}
                    onOpenSidebar={openSidebar}
                    onStartCall={handleJoinCall}
                    onLeaveCall={leaveRoomCall}
                    onToggleAiPanel={handleToggleAiPanel}
                    onToggleMembersPanel={handleToggleMembersPanel}
                    onTogglePins={handleTogglePins}
                    onToggleSearch={() => { setIsSearchOpen((v) => { if (v) setSearchQuery(""); return !v; }); }}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    t={t}
                  />

                  {isSearchOpen && (
                    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
                      <label className="sr-only" htmlFor="room-search">{t("header.search")}</label>
                      <input
                        id="room-search"
                        type="search"
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); setIsSearchOpen(false); } }}
                        placeholder={t("header.searchPlaceholder")}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]"
                      />
                      <span className="shrink-0 text-[11px] text-muted-foreground" role="status">{searching ? t("header.searchResults", { count: listMessages.length }) : t("header.searchLoaded")}</span>
                      <button type="button" onClick={() => { setSearchQuery(""); setIsSearchOpen(false); }} aria-label={t("header.searchClose")} className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  )}

                  {/* Active call banner: visible to members not in the call, and only to those who may join */}
                  {activeCallInRoom && !call.isInCall && controls.showCall && (
                    <div role="status" className="flex shrink-0 items-center gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                      <span className="relative flex h-2 w-2" aria-hidden>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      <span className="flex-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">{t("header.callInProgress")}</span>
                      <button type="button" onClick={handleJoinCall} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 motion-reduce:transition-none">
                        {t("header.joinCall")}
                      </button>
                      <button type="button" onClick={() => setActiveCallInRoom(null)} className="rounded p-0.5 text-emerald-700 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 dark:text-emerald-300" aria-label={t("members.close")}>
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  )}

                  <RoomChatArea
                    messages={listMessages}
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
                    onOpenCopilot={() => openPanel("ai")}
                    replyTo={replyTo}
                    onReply={setReplyTo}
                    currentUserId={user?.id ?? ""}
                    teamId={activeTeamId ?? undefined}
                    controls={pageControls}
                    isCheckingAccess={!permissionsReady}
                    channelType={room.channelType ?? null}
                    muteMinutesLeft={muteLeft}
                    muteReason={access.muteReason}
                    isAiRoom={isAiRoom}
                    showReadReceipts={showReadReceipts}
                    roomName={roomTitle}
                    documents={references.documents}
                    boards={references.boards}
                    users={references.users}
                    roles={teamRoles}
                    commands={references.commands}
                    myRoleIds={myRoleIds}
                    myGroupIds={myGroupIds}
                    botUserIds={references.botIds}
                    resolverContext={resolverContext}
                    loadError={chatHook.loadError}
                    onReload={chatHook.reload}
                    searchQuery={searchQuery}
                    onEditMessage={handleEdit}
                    onDeleteMessage={handleDelete}
                    onTogglePin={handlePin}
                    onOpenThread={handleOpenThread}
                    threadReplies={threadReplies}
                    jumpToMessageId={jumpToMessageId}
                    onJumped={() => setJumpToMessageId(null)}
                    transcripts={(callHistoryHook.calls as any[]).map((c) => ({
                      callId: c.id,
                      roomId: roomId ?? "",
                      roomName: room?.name ?? "Room",
                      startedAt: c.startedAt,
                    }))}
                    activeCallId={(call.isInCall && activeRoomId === roomId) ? (call.callId ?? undefined) : undefined}
                    modelSelector={isAiRoom && activeTeamId ? (
                      <ModelSelector
                        teamId={activeTeamId}
                        value={selectedModel}
                        onChange={setSelectedModel}
                        variant="compact"
                      />
                    ) : undefined}
                    t={t}
                  />
                </>
              )}
            </div>

            {/* Right panel (desktop): copilot, thread, pins or members */}
            {!isMobile && anyPanelOpen && room && (
              <aside aria-label={panelTitle} className="flex w-72 shrink-0 flex-col overflow-hidden border-l-2 border-[var(--memphis-line)] lg:w-80">
                {rightPanel(false)}
              </aside>
            )}
          </div>
        )}
      </RoomsLayout>

      {/* Right panel (phones): full screen */}
      {isMobile && anyPanelOpen && room && (
        <div role="dialog" aria-modal="true" aria-label={panelTitle} className="fixed inset-0 z-[220] flex flex-col overflow-hidden bg-card">
          <div className="min-h-0 flex-1">{rightPanel(true)}</div>
        </div>
      )}

      <MuteMemberModal
        open={Boolean(muteTarget)}
        onClose={() => setMuteTarget(null)}
        teamId={activeTeamId ?? ""}
        accessToken={accessToken ?? ""}
        member={muteTarget}
        onMuted={(userId, mutedUntil) => setActiveMutes((prev) => ({ ...prev, [userId]: mutedUntil }))}
        t={t}
      />

      {activeTeamId && accessToken && (
        <>
          {/* Edit this channel (name, topic, type, category, who can do what) */}
          <ChannelSettingsModal
            open={isSettingsOpen && Boolean(room)}
            onClose={() => setIsSettingsOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            groups={groups}
            rooms={directory.rooms}
            room={room}
            canEditPermissions={controls.showSettings && !isAiRoom}
            showReadReceipts={showReadReceipts}
            onUpdated={(updated) => { setRoom((prev) => (prev ? { ...prev, ...updated } : prev)); directory.refresh(); refreshPermissions(); }}
            onDeleted={() => { directory.refresh(); router.push("/rooms"); }}
            onReadReceiptsChange={setShowReadReceipts}
            t={t}
          />
          {/* New channel */}
          <ChannelSettingsModal
            open={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            groups={groups}
            rooms={directory.rooms}
            initialGroupId={createInitialGroupId}
            canEditPermissions={capabilities.canManageChannels}
            onCreated={(created) => { directory.refresh(); router.push(`/rooms/${created.id}`); }}
            t={t}
          />
          <CategorySettingsModal
            open={categoryDialog.open}
            onClose={() => setCategoryDialog({ open: false, group: null })}
            teamId={activeTeamId}
            accessToken={accessToken}
            group={categoryDialog.group}
            canEditPermissions={capabilities.canManageChannels}
            onSaved={() => directory.refresh()}
            t={t}
          />
        </>
      )}

      {notice && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[300] -translate-x-1/2 rounded-xl border-2 border-[var(--memphis-line)] bg-card px-4 py-2 text-xs font-medium shadow-[3px_3px_0_0_var(--memphis-shadow)]">
          {notice}
        </div>
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
