"use client";

import { useMemo, useState } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Check, CheckCheck, Clock, AlertCircle, Loader2, Bot, CornerUpLeft, ChevronDown, ChevronUp, Info, Wrench } from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { RichText } from "@/components/ui/rich-text";
import type { RoomMessage, MessageStatus } from "@/lib/api/rooms";
import type { ResolverContext } from "@/lib/reference-resolver";
import { getAiMarkupLabel, parseAiMarkup } from "@/lib/ai-markup";
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
  onReply?: (message: RoomMessage) => void;
  onOpenCopilot?: () => void;
  t: TFn;
}

function MessageStatusIcon({ status }: { status?: MessageStatus }) {
  if (!status || status === "sent" || status === "delivered") {
    return <CheckCheck className="w-2.5 h-2.5 text-muted-foreground/50" />;
  }
  if (status === "sending") return <Loader2 className="w-2.5 h-2.5 text-muted-foreground/40 animate-spin" />;
  if (status === "failed") return <AlertCircle className="w-2.5 h-2.5 text-destructive" />;
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
  onReply,
  onOpenCopilot,
  t,
}: RoomMessageItemProps) {
  const [userCard, setUserCard] = useState<{ anchor: { x: number; y: number } } | null>(null);
  const [expandedMarkup, setExpandedMarkup] = useState<Set<string>>(new Set());
  const platform = usePlatform();
  const isMobile = platform === "mobile";
  const { blocks: markupBlocks, visibleText: visibleContent } = useMemo(() => parseAiMarkup(message.content), [message.content]);
  const replyPreview = message.metadata?.replyTo?.content
    ? parseAiMarkup(message.metadata.replyTo.content).visibleText
    : "";

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
          onViewTranscript={onViewTranscript ?? (() => { })}
          t={t}
        />
      </div>
    );
  }

  const avatarUrl = message.user?.avatarUrl;
  const email = message.user?.email;
  const isAi = message.type === "ai";
  const displayName = isAi ? (t("ai.copilotName") || "AI Copilot") : (message.user?.displayName ?? "Unknown");
  const userId = message.userId ?? (isAi ? "000" : "");
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
      <div
        id={`msg-${message.id}`}
        className={`group relative flex gap-2 ${showAvatar ? "mt-3" : "mt-0.5"} ${isOwn ? "flex-row-reverse" : "flex-row"}`}
      >
        {/* Avatar */}
        {showAvatar ? (
          canOpenDm ? (
            <button
              onClick={handleAvatarClick}
              className={`${isMobile ? "h-6 w-6" : "h-7 w-7"} rounded-full overflow-hidden border border-border shrink-0 mt-0.5 bg-muted/50 hover:ring-2 hover:ring-accent/40 transition-all cursor-pointer`}
            >
              <img
                src={getUserAvatarUrl(avatarUrl || (isAi ? "https://api.dicebear.com/7.x/bottts/svg?seed=ai-copilot&backgroundColor=6d28d9" : null), isAi ? "ai@killio.app" : email, isMobile ? 32 : 28)}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <div className={`${isMobile ? "h-6 w-6" : "h-7 w-7"} rounded-full overflow-hidden border border-border shrink-0 mt-0.5 bg-muted/50`}>
              <img
                src={getUserAvatarUrl(avatarUrl || (isAi ? "https://api.dicebear.com/7.x/bottts/svg?seed=ai-copilot&backgroundColor=6d28d9" : null), isAi ? "ai@killio.app" : email, isMobile ? 32 : 28)}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            </div>
          )
        ) : (
          <div className={`${isMobile ? "w-6" : "w-7"} shrink-0`} />
        )}

        <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} ${isMobile ? "max-w-[85%]" : "max-w-[75%]"}`}>
          {showAvatar && !isOwn && (
            <div className="flex items-center gap-1 mb-0.5 px-1">
              <span className="text-[10px] font-semibold text-muted-foreground">
                {displayName}
              </span>
              {isAi && (
                <span className="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-[8px] font-bold px-1 rounded flex items-center gap-0.5 uppercase tracking-tighter">
                  <Bot className="w-2 h-2" />
                  Bot
                </span>
              )}
            </div>
          )}

          <div
            className={`relative rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words border shadow-sm ${isOwn
                ? "bg-accent/15 text-foreground border-accent/20 rounded-tr-sm"
                : "bg-muted/50 text-foreground border-border/50 rounded-tl-sm"
              }`}
          >
            {/* Quoted Message (Reply) */}
            {message.metadata?.replyTo && (
              <button
                onClick={() => {
                  const el = document.getElementById(`msg-${message.metadata.replyTo.id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el?.classList.add('animate-pulse-accent');
                  setTimeout(() => el?.classList.remove('animate-pulse-accent'), 2000);
                }}
                className="block text-left mb-2 p-2 rounded-lg bg-black/5 dark:bg-white/5 border-l-4 border-accent/50 text-[11px] opacity-80 hover:bg-black/10 dark:hover:bg-white/10 transition-colors max-w-[280px] overflow-hidden"
              >
                <div className="font-bold text-accent mb-0.5 truncate">
                  {message.metadata.replyTo.displayName === "User" || message.metadata.replyTo.userId === "000" || message.metadata.replyTo.id.startsWith("bot-") || message.metadata.replyTo.id.includes("ai") ? (t("ai.copilotName") || "AI Copilot") : message.metadata.replyTo.displayName}
                </div>
                <div className="text-muted-foreground italic line-clamp-1">
                  {replyPreview}
                </div>
              </button>
            )}
            {/* Markdown + reference pills */}
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-pre:my-1 prose-code:text-xs">
              {message.content.startsWith("AI_THINKING") ? (
                <div className="flex items-center gap-2 py-1 italic text-muted-foreground animate-pulse">
                  <Bot className="w-3 h-3" />
                  <span>
                    {message.content.startsWith("AI_THINKING_TOOL:") 
                      ? `${t("chat.thinking")} (${message.content.split(":")[1]})`
                      : t("chat.thinking")}
                  </span>
                  <span className="flex gap-1 ml-1">
                    <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1 h-1 rounded-full bg-current animate-bounce"></span>
                  </span>
                </div>
              ) : (
                <>
                  {markupBlocks.map((block, index) => {
                    const key = `${block.tag}-${index}`;
                    const isExpanded = expandedMarkup.has(key);

                    if (block.tag === "tool_call") {
                      try {
                        const data = JSON.parse(block.content);
                        const searchName = data.name.toLowerCase();
                        const isDone = message.metadata?.toolEvents?.some((e: any) => e.tool.toLowerCase() === searchName && e.phase === "done");

                        return (
                          <div key={key} className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded-lg border border-violet-100 dark:border-violet-800/30 bg-violet-50/50 dark:bg-violet-900/10 text-[10px] animate-in fade-in slide-in-from-left-1">
                            <div className="relative">
                              {!isDone && <div className="absolute inset-0 bg-violet-400 rounded-full animate-ping opacity-20" />}
                              <Bot className="w-3 h-3 text-violet-500 relative" />
                            </div>
                            <span className="text-violet-700 dark:text-violet-300 font-bold uppercase tracking-tighter">
                              {data.name.replace(/_/g, " ")}
                            </span>
                            {isDone ? (
                              message.metadata?.toolEvents?.some((e: any) => e.tool?.toLowerCase() === searchName && e.phase === "done" && e.success === false) ? (
                                <AlertCircle className="w-2.5 h-2.5 text-destructive" />
                              ) : (
                                <Check className="w-2.5 h-2.5 text-emerald-500" />
                              )
                            ) : (
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-violet-400" />
                            )}

                            <div className="group/info relative ml-auto">
                              <Info className="w-2.5 h-2.5 text-muted-foreground/40 hover:text-violet-500 cursor-help transition-colors" />
                              <div className="absolute bottom-full right-0 mb-2 w-[240px] p-2 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50 pointer-events-none">
                                <div className="text-[9px] font-mono text-violet-400 mb-1 flex items-center justify-between">
                                  <span>TOOL CALL RAW</span>
                                  <Wrench className="w-2 h-2" />
                                </div>
                                <pre className="text-[9px] font-mono text-neutral-300 whitespace-pre-wrap break-all overflow-y-auto max-h-[120px]">
                                  {JSON.stringify(data.input, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        );
                      } catch (e) {
                        return null;
                      }
                    }

                    return (
                      <div key={key} className="mb-2 rounded-lg border border-border/60 bg-background/50 px-2 py-1.5">
                        <button
                          onClick={() => {
                            setExpandedMarkup((prev) => {
                              const next = new Set(prev);
                              next.has(key) ? next.delete(key) : next.add(key);
                              return next;
                            });
                          }}
                          className="w-full flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          title={isExpanded ? `Ocultar ${getAiMarkupLabel(block.tag)}` : `Mostrar ${getAiMarkupLabel(block.tag)}`}
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          <span>{getAiMarkupLabel(block.tag)}</span>
                        </button>
                        {isExpanded && (
                          <pre className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground font-mono">
                            {block.content}
                          </pre>
                        )}
                      </div>
                    );
                  })}

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
                    {visibleContent}
                  </ReactMarkdown>
                </>
              )}
            </div>

            {/* Rich text (reference pills) — second pass */}
            {visibleContent.includes("@[") && (
              <div className="mt-0.5">
                <RichText
                  content={visibleContent}
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

            {/* Message Actions (Emoji + Reply) */}
            <div className={`absolute -top-3.5 ${isOwn ? "left-2" : "right-2"} opacity-0 md:group-hover:opacity-100 transition-all duration-200 hidden md:flex items-center bg-card border border-border rounded-lg shadow-lg z-20 py-0.5 px-1`}>
              <EmojiReactionPicker onReact={handleReact} isOwn={isOwn} t={t} />
              <div className="w-[1px] h-3 bg-border mx-1" />
              <button
                onClick={() => onReply?.(message)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-accent transition-colors"
                title="Reply"
              >
                <CornerUpLeft className="w-3.5 h-3.5" />
              </button>
            </div>
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
          onOpenCopilot={onOpenCopilot}
        />
      )}
    </>
  );
}
