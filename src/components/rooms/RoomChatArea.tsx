"use client";

import { useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import type { RoomMessage, RoomCall } from "@/lib/api/rooms";
import type { ResolverContext } from "@/lib/reference-resolver";
import type { DocumentSummary } from "@/lib/api/documents";
import { RoomMessageItem } from "./RoomMessageItem";
import { RoomInput } from "./RoomInput";

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
  onSend: () => void;
  onLoadMore: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onMarkRead?: (messageIds: string[]) => void;
  onTyping: () => void;
  onViewTranscript: (callId: string) => void;
  onAiTrigger: (content: string) => void;
  currentUserId: string;
  teamId?: string;
  canPost: boolean;
  showReadReceipts?: boolean;
  roomName?: string;
  documents?: DocumentSummary[];
  boards?: any[];
  users?: any[];
  resolverContext?: ResolverContext;
  availableTags?: any[];
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
  showReadReceipts,
  roomName,
  documents,
  boards,
  users,
  resolverContext,
  availableTags,
  t,
}: RoomChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
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
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground opacity-60">
            {t("chat.noMessages")}
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
              t={t}
            />
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {typingText && (
        <div className="px-4 pb-1">
          <span className="text-[10px] text-muted-foreground italic">{typingText}</span>
        </div>
      )}

      {/* Input */}
      <RoomInput
        value={inputValue}
        onChange={onInputChange}
        onSend={onSend}
        onTyping={onTyping}
        readOnly={!canPost}
        roomName={roomName}
        documents={documents}
        boards={boards}
        users={users}
        onAiTrigger={onAiTrigger}
        t={t}
      />
    </div>
  );
}
