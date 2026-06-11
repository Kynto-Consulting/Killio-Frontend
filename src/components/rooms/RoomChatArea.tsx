"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import { Loader2, X, MessageSquare } from "lucide-react";
import type { RoomMessage, RoomCall } from "@/lib/api/rooms";
import type { ResolverContext } from "@/lib/reference-resolver";
import type { DocumentSummary } from "@/lib/api/documents";
import { RoomMessageItem } from "./RoomMessageItem";
import { RoomInput } from "./RoomInput";
import { parseAiMarkup } from "@/lib/ai-markup";
import { getProactiveSuggestion } from "@/lib/api/agent";
import { useSession } from "@/components/providers/session-provider";
import { Sparkles } from "lucide-react";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface TypingUser { userId: string; displayName: string; }

interface RoomChatAreaProps {
  messages: RoomMessage[];
  callsById: Map<string, RoomCall>;
  isLoading: boolean;
  isSending: boolean;
  hasMore: boolean;
  typingUsers: TypingUser[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: (content?: string) => void;
  onLoadMore: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onMarkRead?: (messageIds: string[]) => void;
  onTyping: () => void;
  onViewTranscript: (callId: string) => void;
  onAiTrigger: (content: string) => void;
  currentUserId: string;
  teamId?: string;
  canPost: boolean;
  isAiRoom?: boolean;
  showReadReceipts?: boolean;
  roomName?: string;
  documents?: DocumentSummary[];
  boards?: any[];
  users?: any[];
  transcripts?: Array<{ callId: string; roomId: string; roomName: string; startedAt: string }>;
  activeCallId?: string;
  resolverContext?: ResolverContext;
  availableTags?: any[];
  onOpenCopilot?: () => void;
  onToolApproval?: (toolName: string, input: any, decision: 'approved' | 'rejected') => void;
  replyTo?: RoomMessage | null;
  onReply?: (message: RoomMessage | null) => void;
  /** Optional model picker rendered next to the composer (AI rooms only). */
  modelSelector?: React.ReactNode;
  t: TFn;
}

function formatTypingText(users: TypingUser[], t: TFn): string {
  if (users.length === 0) return "";
  if (users.length === 1) return t("chat.typing_one").replace("{name}", users[0].displayName);
  if (users.length === 2) return t("chat.typing_two").replace("{name1}", users[0].displayName).replace("{name2}", users[1].displayName);
  return t("chat.typing_many");
}

function insertDateDividers(messages: RoomMessage[]): (RoomMessage | { type: "divider"; label: string; key: string })[] {
  const result: (RoomMessage | { type: "divider"; label: string; key: string })[] = [];
  let lastDate = "";
  for (const msg of messages) {
    const d = new Date(msg.createdAt).toLocaleDateString();
    if (d !== lastDate) {
      lastDate = d;
      result.push({ type: "divider", label: d, key: `divider-${d}` });
    }
    result.push(msg);
  }
  return result;
}

export function RoomChatArea({
  messages,
  callsById,
  isLoading,
  hasMore,
  typingUsers,
  inputValue,
  onInputChange,
  onSend,
  onLoadMore,
  onReact,
  onMarkRead,
  onTyping,
  onViewTranscript,
  onAiTrigger,
  currentUserId,
  teamId,
  canPost,
  isAiRoom,
  showReadReceipts,
  roomName,
  documents,
  boards,
  users,
  transcripts,
  activeCallId,
  resolverContext,
  availableTags,
  onOpenCopilot,
  onToolApproval,
  replyTo,
  onReply,
  modelSelector,
  t,
}: RoomChatAreaProps) {
  const { accessToken } = useSession();
  const platform = usePlatform();
  const [proactiveSuggestion, setProactiveSuggestion] = useState<string>("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const suggestTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = platform === "mobile";
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setViewportHeight(vv.height);
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [isMobile]);

  // Scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Track scroll position to know if at bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    // Mark visible messages as read when scrolled to bottom
    if (isAtBottomRef.current && onMarkRead && showReadReceipts) {
      const unreadFromOthers = messages
        .filter((m) => m.userId !== currentUserId && m.status !== "read" && !m.id.startsWith("temp-"))
        .map((m) => m.id);
      if (unreadFromOthers.length > 0) onMarkRead(unreadFromOthers);
    }
  }, [messages, currentUserId, onMarkRead, showReadReceipts]);

  // Also mark as read when new messages arrive and we're at the bottom
  useEffect(() => {
    if (isAtBottomRef.current && onMarkRead && showReadReceipts) {
      const unreadFromOthers = messages
        .filter((m) => m.userId !== currentUserId && m.status !== "read" && !m.id.startsWith("temp-"))
        .map((m) => m.id);
      if (unreadFromOthers.length > 0) onMarkRead(unreadFromOthers);
    }
  }, [messages.length]);

  const withDividers = insertDateDividers(messages);
  const typingText = formatTypingText(typingUsers, t);
  const replyPreview = replyTo ? parseAiMarkup(replyTo.content).visibleText.trim() : "";

  // Proactive suggestions logic
  useEffect(() => {
    if (!accessToken || !teamId || inputValue.length < 15 || inputValue.length > 200) {
      setProactiveSuggestion("");
      return;
    }

    if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);

    suggestTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSuggesting(true);
        const res = await getProactiveSuggestion({
          teamId,
          message: inputValue,
          entityType: "team",
          entityId: teamId
        }, accessToken);
        
        if (res.text && res.text !== proactiveSuggestion) {
          setProactiveSuggestion(res.text);
        }
      } catch (err) {
        console.error("Proactive suggest error:", err);
      } finally {
        setIsSuggesting(false);
      }
    }, 1500); // 1.5s debounce

    return () => {
      if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
    };
  }, [inputValue, teamId, accessToken]);

  const handleSend = (content?: string) => {
    setProactiveSuggestion("");
    onSend(content);
  };

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden min-h-0"
      style={isMobile && viewportHeight !== undefined ? { height: viewportHeight } : undefined}
    >
      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto ${isMobile ? "px-3 py-3 pb-24" : "px-4 py-4"} space-y-1`}
      >
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={onLoadMore}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-md hover:bg-muted/50"
            >
              {t("chat.loadMore")}
            </button>
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-muted-foreground opacity-60">
            <MessageSquare className="w-10 h-10" />
            <span className="text-sm">{t("chat.noMessages")}</span>
          </div>
        )}

        {withDividers.map((item, idx) => {
          if ("type" in item && item.type === "divider") {
            return (
              <div key={item.key} className="flex items-center gap-2 py-3">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {item.label}
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
            );
          }

          const msg = item as RoomMessage;
          const prevMsg = idx > 0 && !("type" in withDividers[idx - 1]) ? withDividers[idx - 1] as RoomMessage : null;
          const showAvatar = !prevMsg || prevMsg.userId !== msg.userId || msg.type === "system";
          const linkedCall = msg.callRef ? callsById.get(msg.callRef) : undefined;

          return (
            <RoomMessageItem
              key={msg.id}
              message={msg}
              isOwn={msg.userId === currentUserId}
              showAvatar={showAvatar}
              onReact={(emoji) => onReact(msg.id, emoji)}
              onViewTranscript={onViewTranscript}
              linkedCall={linkedCall}
              resolverContext={resolverContext}
              availableTags={availableTags}
              teamId={teamId}
              currentUserId={currentUserId}
              showReadReceipts={showReadReceipts}
              onReply={onReply}
              onOpenCopilot={onOpenCopilot}
              onToolApproval={onToolApproval}
              t={t}
            />
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {typingText && (
        <div className={isMobile ? "px-3 pb-1" : "px-4 pb-1"}>
          <span className="text-[10px] text-muted-foreground italic">{typingText}</span>
        </div>
      )}

      {/* Reply Preview */}
      {replyTo && (
        <div className={`${isMobile ? "mx-3 mb-2 p-2" : "mx-4 mb-2 p-2"} rounded-xl bg-muted/80 border border-border/50 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-200`}>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-accent uppercase tracking-wider mb-0.5">
              {t("chat.replyingTo", { name: replyTo.type === "ai" ? "AI Copilot" : (replyTo.user?.displayName || "User") })}
            </div>
            <div className="text-muted-foreground italic line-clamp-1 text-[11px]">
              {parseAiMarkup(replyTo.content).visibleText}
            </div>
          </div>
          <button
            onClick={() => onReply?.(null)}
            className="p-1 rounded-md hover:bg-black/10 text-muted-foreground"
            title={t("chat.cancelReply")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Proactive Suggestion (Ghost Message) */}
      {proactiveSuggestion && !replyTo && (
        <div className={`${isMobile ? "mx-3 mb-2 px-3 py-2" : "mx-4 mb-2 px-3 py-2"} rounded-xl bg-violet-500/5 border border-violet-500/20 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-500 group/ghost`}>
          <Sparkles className="w-3 h-3 text-violet-500 animate-pulse" />
          <div className="flex-1 min-w-0 text-[11px] text-violet-600/80 dark:text-violet-400/80 font-medium italic truncate">
            {proactiveSuggestion}
          </div>
          <button
            onClick={() => setProactiveSuggestion("")}
            className="p-1 rounded-md hover:bg-violet-500/10 text-violet-400 opacity-0 group-hover/ghost:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Model selector (AI rooms) — sits right above the composer. */}
      {modelSelector && (
        <div className={`${isMobile ? "mx-3" : "mx-4"} mb-2 flex items-center justify-end`}>
          {modelSelector}
        </div>
      )}

      {/* Input */}
      <RoomInput
        value={inputValue}
        onChange={onInputChange}
        onSend={handleSend}
        onTyping={onTyping}
        readOnly={!canPost}
        isAiRoom={isAiRoom}
        roomName={roomName}
        documents={documents}
        boards={boards}
        users={users}
        transcripts={transcripts}
        activeCallId={activeCallId}
        onAiTrigger={onAiTrigger}
        replyTo={replyTo || undefined}
        teamId={teamId}
        t={t}
      />
    </div>
  );
}
