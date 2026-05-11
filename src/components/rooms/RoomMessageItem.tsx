"use client";

import { useMemo, useState, useCallback } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Check, CheckCheck, Clock, AlertCircle, Loader2, Bot, CornerUpLeft, ChevronDown, ChevronUp, Info, Wrench, Copy, ListChecks, FileCode } from "lucide-react";
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
  const { blocks: markupBlocks, visibleText } = useMemo(() => parseAiMarkup(message.content), [message.content]);

  const toggleMarkup = useCallback((key: string) => {
    setExpandedMarkup((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

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

  const isAi = message.type === "ai";
  const avatarUrl = message.user?.avatarUrl;
  const email = message.user?.email;
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
            className={`relative rounded-xl px-3 py-2 text-sm leading-relaxed border shadow-sm ${isOwn
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
                <div className="font-bold text-accent mb-0.5 truncate text-[10px]">
                  {message.metadata.replyTo.displayName === "User" || message.metadata.replyTo.userId === "000" || message.metadata.replyTo.id?.startsWith("bot-") ? (t("ai.copilotName") || "AI Copilot") : message.metadata.replyTo.displayName}
                </div>
                <div className="text-muted-foreground italic line-clamp-1 text-[11px]">
                  {parseAiMarkup(message.metadata.replyTo.content).visibleText || message.metadata.replyTo.content}
                </div>
              </button>
            )}

            <div className="flex flex-col gap-1.5 min-w-0">
              {markupBlocks.map((block, index) => {
                const key = `${block.tag}-${index}`;
                const isExpanded = expandedMarkup.has(key);

                if (block.tag === "text") {
                  // Special case for the legacy thinking placeholder
                  if (block.content === "AI_THINKING") return null;

                  return (
                    <div key={key} className="text-sm leading-relaxed max-w-full overflow-hidden">
                      <RichText
                        content={block.content}
                        context={resolverContext ?? { documents: [], boards: [], folders: [], users: [] }}
                        availableTags={availableTags}
                      />
                    </div>
                  );
                }

                  if (block.tag === "tool_call") {
                    try {
                      const data = JSON.parse(block.content);
                      const searchName = data.name?.toLowerCase();
                      const rawEvents = (message.metadata as any)?.toolEvents || [];
                      
                      // Synthesize events from DB columns if missing (crucial after page refresh)
                      const events = rawEvents.length > 0 ? rawEvents : (() => {
                        const syn: any[] = [];
                        const calls = (message as any).tool_calls || [];
                        const results = (message as any).tool_results || [];
                        calls.forEach((c: any) => {
                          const result = results.find((r: any) => (r.tool_use_id === c.id) || (r.tool === c.name));
                          syn.push({
                            tool: c.name,
                            phase: "done",
                            success: result ? !result.is_error : true 
                          });
                        });
                        return syn;
                      })();

                      const isDone = events.some((e: any) => e.tool?.toLowerCase() === searchName && e.phase === "done");
                      const isError = events.some((e: any) => e.tool?.toLowerCase() === searchName && e.phase === "done" && e.success === false);

                      return (
                        <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-violet-100 dark:border-violet-800/30 bg-violet-50/50 dark:bg-violet-900/10 text-[10px] animate-in fade-in slide-in-from-left-1">
                          <div className="relative shrink-0">
                            {!isDone && <div className="absolute inset-0 bg-violet-400 rounded-full animate-ping opacity-20" />}
                            <Bot className="w-3 h-3 text-violet-500 relative" />
                          </div>
                          <span className="text-violet-700 dark:text-violet-300 font-bold uppercase tracking-tighter truncate max-w-[140px]">
                            {data.name?.replace(/_/g, " ")}
                          </span>
                          {isDone ? (
                            isError ? (
                              <AlertCircle className="w-2.5 h-2.5 text-destructive shrink-0" />
                            ) : (
                              <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                            )
                          ) : (
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-violet-400 shrink-0" />
                          )}

                          <div className="group/info relative ml-auto shrink-0">
                            <Info className="w-2.5 h-2.5 text-muted-foreground/40 hover:text-violet-500 cursor-help transition-colors" />
                            <div className="absolute bottom-full right-0 mb-1 w-[280px] p-2 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50 pointer-events-auto">
                              <div className="text-[9px] font-mono text-violet-400 mb-1 flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <Wrench className="w-2 h-2" />
                                  TOOL CALL RAW
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(JSON.stringify(data.input, null, 2));
                                  }}
                                  className="p-1 hover:bg-neutral-800 rounded transition-colors text-neutral-400 hover:text-violet-400"
                                  title="Copy JSON"
                                >
                                  <Copy className="w-2 h-2" />
                                </button>
                              </div>
                              <pre className="text-[9px] font-mono text-neutral-300 whitespace-pre-wrap break-all overflow-y-auto max-h-[160px] custom-scrollbar">
                                {JSON.stringify(data.input, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      );
                    } catch (e) { return null; }
                  }

                  if (block.tag === "plan") {
                    const steps: { id: string; status: string; content: string }[] = [];
                    const stepRegex = /<step\s+id=["']?([^"'>\s]+)["']?\s+status=["']?([^"'>\s]+)["']?>([\s\S]*?)<\/step>/gi;
                    let match;
                    while ((match = stepRegex.exec(block.content)) !== null) {
                      steps.push({ id: match[1], status: match[2], content: match[3].trim() });
                    }

                    return (
                      <div key={key} className="mb-2 rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-900/10 p-3 shadow-sm max-w-full overflow-hidden">
                        <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-violet-500 uppercase tracking-wider">
                          <ListChecks className="w-3 h-3" />
                          <span>Execution Plan</span>
                        </div>
                        <div className="space-y-2">
                          {steps.map((step) => (
                            <div key={step.id} className="flex gap-2. group/step">
                              <div className="shrink-0 mt-0.5">
                                {step.status === "done" ? (
                                  <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                    <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                  </div>
                                ) : step.status === "doing" || step.status === "active" ? (
                                  <div className="w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                                    <Loader2 className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400 animate-spin" />
                                  </div>
                                ) : (
                                  <div className="w-4 h-4 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-[8px] font-bold text-neutral-400">{step.id}</span>
                                  </div>
                                )}
                              </div>
                              <div className={`flex-1 text-[12px] leading-snug ${step.status === "done" ? "text-muted-foreground line-through decoration-border" : "text-foreground"}`}>
                                <RichText
                                  content={step.content}
                                  context={resolverContext ?? { documents: [], boards: [], folders: [], users: [] }}
                                  availableTags={availableTags}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
 
                  if (block.tag === "edit") {
                    const file = block.attributes?.file;
                    const lines = block.content.split('\n');
                    return (
                      <div key={key} className="mb-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-900 overflow-hidden font-mono text-[11px] shadow-sm">
                        {file && (
                          <div className="bg-neutral-800/50 border-b border-neutral-800 px-3 py-1.5 flex items-center gap-2 text-neutral-400 font-sans font-semibold text-[10px] uppercase tracking-wider">
                            <FileCode className="w-3.5 h-3.5 text-violet-400" />
                            <span>{file}</span>
                          </div>
                        )}
                        <div className="p-2 space-y-0.5 overflow-x-auto custom-scrollbar">
                          {lines.map((line, i) => {
                            const isAdded = line.startsWith('+');
                            const isRemoved = line.startsWith('-');
                            return (
                              <div
                                key={i}
                                className={`px-1 rounded whitespace-pre ${
                                  isAdded ? 'bg-emerald-500/15 text-emerald-400' :
                                  isRemoved ? 'bg-red-500/15 text-red-400' :
                                  'text-neutral-400'
                                }`}
                              >
                                {line}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={key} className="mb-2 rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 overflow-hidden">
                      <button
                        onClick={() => toggleMarkup(key)}
                        className="w-full flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                        <span className="uppercase">{getAiMarkupLabel(block.tag)}</span>
                      </button>
                      {isExpanded && (
                        <div className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground font-medium animate-in fade-in slide-in-from-top-1">
                          <pre className="whitespace-pre-wrap font-mono">{block.content}</pre>
                        </div>
                      )}
                    </div>
                );
              })}

              {/* Persistent Thinking Indicator while streaming or if empty content */}
              {(message.status === "sending" || (isAi && markupBlocks.length === 0)) && (
                <div className="flex items-center gap-1.5 py-1 text-muted-foreground animate-pulse">
                  <Bot className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium italic">
                    {message.content.includes("AI_THINKING_TOOL:")
                      ? `${t("chat.thinking")} (${message.content.split("AI_THINKING_TOOL:")[1].split(/[<\n]/)[0]})`
                      : t("chat.thinking")}...
                  </span>
                </div>
              )}
            </div>
            )}

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

          <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? "justify-end" : "justify-start"}`}>
            <span className="text-[9px] text-muted-foreground/60">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            {isOwn && showReadReceipts && (
              <MessageStatusIcon status={message.status} />
            )}
          </div>
        </div>
      </div>

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
