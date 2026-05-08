"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { SmilePlus } from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { RichText } from "@/components/ui/rich-text";
import type { RoomMessage } from "@/lib/api/rooms";
import type { ResolverContext } from "@/lib/reference-resolver";
import { RoomCallHistoryCard } from "./RoomCallHistoryCard";
import type { RoomCall } from "@/lib/api/rooms";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🙌", "🔥"];

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
  t: TFn;
}

const EMPTY_CONTEXT: ResolverContext = { documents: [], boards: [] };

function processContent(content: string, resolverContext?: ResolverContext, availableTags?: any[]) {
  return (
    <RichText
      content={content}
      context={resolverContext ?? EMPTY_CONTEXT}
      availableTags={availableTags}
    />
  );
}

export function RoomMessageItem({
  message,
  isOwn,
  showAvatar,
  onReact,
  onViewTranscript,
  linkedCall,
  resolverContext,
  availableTags,
  t,
}: RoomMessageItemProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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

  const reactions = message.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  const msgBubble = (
    <div className={`group relative flex gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      {showAvatar ? (
        <div className="h-7 w-7 rounded-full overflow-hidden border border-border shrink-0 mt-0.5 bg-muted/50">
          <img
            src={getUserAvatarUrl(avatarUrl, email, 28)}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        </div>
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

          {/* Timestamp */}
          <div className={`text-[9px] text-muted-foreground/60 mt-0.5 ${isOwn ? "text-right" : "text-left"}`}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {message.editedAt && " (edited)"}
          </div>

          {/* Emoji picker trigger (hover) */}
          <button
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="absolute -top-2.5 right-2 hidden group-hover:flex items-center gap-0.5 bg-card border border-border rounded-full px-1.5 py-0.5 shadow-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <SmilePlus className="w-3 h-3" />
          </button>

          {showEmojiPicker && (
            <div className="absolute top-0 right-0 mt-6 bg-card border border-border rounded-xl shadow-xl p-2 flex gap-1 z-20">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onReact(emoji); setShowEmojiPicker(false); }}
                  className="text-lg hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reactions */}
        {hasReactions && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {Object.entries(reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/60 border border-border/40 text-xs hover:bg-accent/10 transition-colors"
              >
                <span>{emoji}</span>
                <span className="text-[10px] text-muted-foreground">{users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return msgBubble;
}
