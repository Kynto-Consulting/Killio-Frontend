"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Check, CheckCheck, Clock, AlertCircle, Loader2 } from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { RichText } from "@/components/ui/rich-text";
import type { RoomMessage, MessageStatus } from "@/lib/api/rooms";
import type { ResolverContext } from "@/lib/reference-resolver";
import { RoomCallHistoryCard } from "./RoomCallHistoryCard";
import { EmojiReactionPicker, trackEmojiUse } from "./EmojiReactionPicker";
import { UserProfileCard } from "./UserProfileCard";
import type { RoomCall } from "@/lib/api/rooms";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface RoomMessageItemProps {
  message: RoomMessage;
  isOwn: boolean;
  showAvatar: boolean;
  onReact: (emoji: string) => void;
  onViewTranscript?: (callId: string) => void;
  linkedCall?: RoomCall;
  resolverContext?: ResolverContext;
  availableTags?: any[];
  teamId?: string;
  currentUserId?: string;
  showReadReceipts?: boolean;
  t: TFn;
}

function MessageStatusIcon({ status }: { status?: MessageStatus }) {
  if (!status || status === "sent") return <Check className="w-2.5 h-2.5 text-muted-foreground/50" />;
  if (status === "sending") return <Loader2 className="w-2.5 h-2.5 text-muted-foreground/40 animate-spin" />;
  if (status === "failed") return <AlertCircle className="w-2.5 h-2.5 text-destructive" />;
  if (status === "delivered") return <CheckCheck className="w-2.5 h-2.5 text-muted-foreground/50" />;
  if (status === "read") return <CheckCheck className="w-2.5 h-2.5 text-accent" />;
  return null;
}

const EMPTY_CONTEXT: ResolverContext = { documents: [], boards: [] };

export function RoomMessageItem({
  message,
  isOwn,
  showAvatar,
  onReact,
  onViewTranscript,
  linkedCall,
  resolverContext,
  availableTags,
  teamId,
  currentUserId,
  showReadReceipts,
  t,
}: RoomMessageItemProps) {
  const [userCard, setUserCard] = useState<{ anchor: { x: number; y: number } } | null>(null);

  // System / call history messages
  if (message.type === "system") {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-2 py-1 bg-muted/50 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  if ((message.type === "call_started" || message.type === "call_ended") && linkedCall) {
    return (
      <div className="flex justify-center my-2">
        <RoomCallHistoryCard
          call={linkedCall}
          onViewTranscript={onViewTranscript ?? (() => {})}
          t={t}
        />
      </div>
    );
  }

  const avatarUrl = message.user?.avatarUrl;
  const email = message.user?.email;
  const displayName = message.user?.displayName ?? "Unknown";
  const userId = message.userId ?? "";
  const canOpenDm = teamId && userId && userId !== currentUserId;

  const handleAvatarClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canOpenDm) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setUserCard({
      anchor: {
        x: Math.min(rect.right + 8, window.innerWidth - 270),
        y: Math.min(rect.top, window.innerHeight - 280),
      },
    });
  };

  const reactions = message.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  const handleReact = (emoji: string) => {
    trackEmojiUse(emoji);
    onReact(emoji);
  };

  return (
    <>
      <div className={`group relative flex gap-2 ${showAvatar ? "mt-3" : "mt-0.5"} ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        {showAvatar ? (
          canOpenDm ? (
            <button
              onClick={handleAvatarClick}
              className="h-7 w-7 rounded-full overflow-hidden border border-border shrink-0 mt-0.5 bg-muted/50 hover:ring-2 hover:ring-accent/40 transition-all cursor-pointer"
            >
              <img
                src={getUserAvatarUrl(avatarUrl, email, 28)}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <div className="h-7 w-7 rounded-full overflow-hidden border border-border shrink-0 mt-0.5 bg-muted/50">
              <img
                src={getUserAvatarUrl(avatarUrl, email, 28)}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            </div>
          )
        ) : (
          <div className="w-7 shrink-0" />
        )}

        <div className={`flex flex-col max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
          {showAvatar && !isOwn && (
            <span className="text-[10px] font-semibold text-muted-foreground mb-0.5 px-1">
              {displayName}
            </span>
          )}

          <div
            className={`relative rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words border shadow-sm ${
              isOwn
                ? "bg-accent/15 text-foreground border-accent/20 rounded-tr-sm"
                : "bg-muted/50 text-foreground border-border/50 rounded-tl-sm"
            }`}
          >
            {/* Markdown + reference pills */}
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-pre:my-1 prose-code:text-xs">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" className="text-accent underline" />
                  ),
                  code: ({ node, className, children, ...props }) => {
                    const isBlock = className?.includes("language-");
                    return isBlock ? (
                      <code
                        className={`block bg-background/60 rounded px-2 py-1 text-xs font-mono overflow-x-auto ${className ?? ""}`}
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <code className="bg-background/60 rounded px-1 text-xs font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  p: ({ children }) => <span>{children}</span>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Rich text (reference pills) — second pass */}
            {message.content.includes("@[") && (
              <div className="mt-0.5">
                <RichText
                  content={message.content}
                  context={resolverContext ?? EMPTY_CONTEXT}
                  availableTags={availableTags}
                />
              </div>
            )}

            {/* Timestamp + status */}
            <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? "justify-end" : "justify-start"}`}>
              <span className="text-[9px] text-muted-foreground/60">
                {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {message.editedAt && " (edited)"}
              </span>
              {isOwn && showReadReceipts && (
                <MessageStatusIcon status={message.status} />
              )}
            </div>

            {/* Smart emoji picker */}
            <EmojiReactionPicker onReact={handleReact} isOwn={isOwn} t={t} />
          </div>

          {/* Reactions */}
          {hasReactions && (
            <div className="flex flex-wrap gap-1 mt-1 px-1">
              {Object.entries(reactions).map(([emoji, users]) => (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/60 border border-border/40 text-xs hover:bg-accent/10 transition-colors"
                >
                  <span>{emoji}</span>
                  <span className="text-[10px] text-muted-foreground">{new Set(users as string[]).size}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User profile card (DM trigger from avatar) */}
      {userCard && teamId && (
        <UserProfileCard
          userId={userId}
          displayName={displayName}
          email={email}
          avatarUrl={avatarUrl}
          teamId={teamId}
          anchor={userCard.anchor}
          onClose={() => setUserCard(null)}
        />
      )}
    </>
  );
}
