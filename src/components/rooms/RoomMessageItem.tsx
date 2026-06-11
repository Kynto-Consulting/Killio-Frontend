"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import {
  Check, CheckCheck, Clock, AlertCircle, Loader2, Bot, CornerUpLeft,
  ChevronDown, ChevronUp, Info, Wrench, Copy, ListChecks, FileCode,
  Terminal, FileText, ExternalLink, Columns, Layers, Code2, Image as ImageIcon, Database, ArrowRight, Maximize2, MessageSquare, Play,
  ShieldAlert, X, Brain, ShieldCheck, Lightbulb, HelpCircle, Download, User, Phone,
} from "lucide-react";
import { ToolCallChip, BatchToolChip, BuildingToolCallChip } from "@/components/agent/tool-call-chip";
import { SubAgentActivity } from "@/components/agent/sub-agent-activity";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { RichText } from "@/components/ui/rich-text";
import type { RoomMessage, MessageStatus } from "@/lib/api/rooms";
import type { ResolverContext } from "@/lib/reference-resolver";
import { getAiMarkupLabel, parseAiMarkup, parseContactBlock, parsePreThinkSections, splitAtPartialToolTag } from "@/lib/ai-markup";
import { RoomCallHistoryCard } from "./RoomCallHistoryCard";
import { EmojiReactionPicker, trackEmojiUse } from "./EmojiReactionPicker";
import { UserProfileCard } from "./UserProfileCard";
import type { RoomCall } from "@/lib/api/rooms";
import { UnifiedBrickRenderer } from "../bricks/brick-renderer";
import { updateMessageMetadata } from "@/lib/api/rooms";
import { useSession } from "@/components/providers/session-provider";
import { API_BASE_URL } from "@/lib/api/client";
import { MessageInfoPanel } from "./MessageInfoPanel";
import { Portal } from "@/components/ui/portal";
import { parseInlineToolEvents, resolveToolCallRenderState } from "@/hooks/use-agent-chat";

const resolveAssetUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
};

const IframeWithPreview = ({ src, title, height, screenshot, t }: { src: string, title?: string, height: string, screenshot?: string, t: TFn }) => {
  const [isLive, setIsLive] = useState(false);

  if (isLive) {
    return (
      <iframe
        src={src}
        className="w-full rounded-lg bg-white animate-in fade-in duration-500"
        style={{ height }}
        title={title || "Portal Content"}
      />
    );
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center bg-slate-950/50 rounded-lg cursor-pointer hover:bg-slate-900/60 transition-all border border-blue-500/10 overflow-hidden"
      style={{ height }}
      onClick={() => setIsLive(true)}
    >
      {screenshot && (
        <img
          src={screenshot}
          alt={title || "Preview"}
          className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover/iframe:opacity-50 transition-opacity"
        />
      )}
      <div className="relative z-10 w-16 h-16 rounded-full bg-blue-500/20 backdrop-blur-sm flex items-center justify-center text-blue-400 group-hover/iframe:scale-110 transition-transform">
        <Play className="w-8 h-8 ml-1" />
      </div>
      <div className="relative z-10 mt-4 text-xs font-bold text-blue-300 uppercase tracking-widest drop-shadow-md">{t("ai.activateLiveView")}</div>
      <div className="relative z-10 mt-1 text-[10px] text-blue-500/60 font-mono truncate max-w-[80%]">
        {src.startsWith('/') ? window.location.hostname : (src.startsWith('http') ? new URL(src).hostname : src)}
      </div>
    </div>
  );
};

const PollRenderer = ({
  content,
  metadata,
  onVote,
  onClose,
  currentUserId,
  creatorId,
  t,
}: {
  content: string;
  metadata: any;
  onVote: (optionIndex: number, isRemoving?: boolean) => void;
  onClose?: () => void;
  currentUserId?: string;
  creatorId?: string;
  t: TFn;
}) => {
  const lines = content.includes('|')
    ? content.split('|').map(l => l.trim()).filter(Boolean)
    : content.split('\n').filter(l => l.trim());
  const question = lines[0];
  const options = lines.slice(1);
  const votes = metadata?.pollVotes || {}; // { optionIndex: [userIds] }
  const expiresAt = metadata?.expiresAt; // ISO string
  const isMultiple = metadata?.multiple === true;

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!expiresAt) return;
    const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
    const intervalMs = msUntilExpiry > 60_000 ? 15_000 : 5_000;
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const isExpired = expiresAt ? new Date(expiresAt) <= now : false;
  const isClosed = metadata?.isClosed || isExpired;

  const totalVotes = Object.values(votes).reduce((acc: number, val: any) => acc + (Array.isArray(val) ? val.length : 0), 0);

  const timeLeft = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - now.getTime()) : 0;
  const formatTimeLeft = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ${sec % 60}s`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  return (
    <div className={`my-3 p-4 rounded-2xl bg-white dark:bg-neutral-950 border shadow-sm animate-in zoom-in-95 duration-300 max-w-sm transition-opacity ${isClosed ? 'opacity-80 border-neutral-200 dark:border-neutral-800' : 'border-violet-200 dark:border-violet-800/40'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
          <ListChecks className="w-4 h-4" />
          <span className="text-[11px] font-bold uppercase tracking-widest">{question || t("poll.label")}</span>
        </div>
        <div className="flex items-center gap-2">
          {expiresAt && !isClosed && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-md">
              <Clock className="w-3 h-3" />
              {formatTimeLeft(timeLeft)}
            </div>
          )}
          {isClosed && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 uppercase tracking-tighter bg-neutral-100 dark:bg-neutral-900 px-1.5 py-0.5 rounded-md">
              <ShieldCheck className="w-3 h-3" />
              {t("poll.closed")}
            </div>
          )}
          {!isClosed && currentUserId === creatorId && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose?.(); }}
              className="text-[10px] font-bold text-neutral-400 hover:text-red-500 transition-colors uppercase tracking-tighter bg-neutral-100 dark:bg-neutral-900 px-1.5 py-0.5 rounded-md"
            >
              {t("poll.close")}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {options.map((opt, i) => {
          const optVotes = Array.isArray(votes[i]) ? votes[i] : [];
          const percentage = totalVotes > 0 ? Math.round((optVotes.length / totalVotes) * 100) : 0;
          const hasVoted = currentUserId && optVotes.includes(currentUserId);

          return (
            <button
              key={opt}
              disabled={isClosed}
              onClick={() => onVote(i, Boolean(hasVoted && isMultiple))}
              className={`w-full relative group/opt overflow-hidden rounded-xl border transition-all ${isClosed ? 'cursor-default' : ''} ${hasVoted ? 'border-violet-500 bg-violet-500/5' : 'border-border/50 hover:border-violet-400 hover:bg-violet-400/5'}`}
            >
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-1000 ${hasVoted ? 'bg-violet-500/10' : 'bg-violet-400/5'}`}
                style={{ width: `${percentage}%` }}
              />
              <div className="relative px-3 py-2 flex items-center justify-between gap-3 min-h-[40px]">
                <span className={`text-[13px] font-medium text-left ${hasVoted ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'}`}>{opt}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-muted-foreground opacity-60">{percentage}%</span>
                  {hasVoted && <Check className="w-3.5 h-3.5 text-violet-500" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground font-medium opacity-60">
        <div className="flex items-center gap-2">
          <span>{t("poll.totalVotes", { count: totalVotes })}</span>
          {isMultiple && <span className="bg-violet-100 dark:bg-violet-900/50 text-violet-600 px-1 rounded">{t("poll.multipleVotes")}</span>}
        </div>
        {currentUserId && Object.values(votes).some((v: any) => v.includes(currentUserId)) && (
          <span className="text-violet-500">{t("poll.alreadyVoted")}</span>
        )}
      </div>
    </div>
  );
};

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
  onToolApproval?: (toolName: string, input: any, decision: 'approved' | 'rejected') => void;
  onAiRetry?: () => void;
  onMarkRead?: (messageIds: string[]) => void;
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

// Renders a <contact> block (contacts_search output): person icon + name +
// tap-to-copy number + tel: call link. Matches the room chip/pill styling.
function RoomContactChip({ t, name, number }: { t: TFn; name: string; number: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!number) return;
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  const telHref = number ? `tel:${number.replace(/[^\d+]/g, "")}` : undefined;
  return (
    <div className="my-0.5 flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-card text-xs">
      <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
        <User className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        {name && <p className="font-medium text-foreground truncate">{name}</p>}
        {number && (
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? t("ai.contact.copied") : t("ai.contact.copyNumber")}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          >
            <span className="truncate">{number}</span>
            {copied ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : <Copy className="h-3 w-3 shrink-0 opacity-60" />}
          </button>
        )}
      </div>
      {telHref && (
        <a
          href={telHref}
          title={t("ai.contact.call")}
          className="ml-auto shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
        >
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
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
  onToolApproval,
  onAiRetry,
  onMarkRead,
  t,
}: RoomMessageItemProps) {
  const { accessToken } = useSession();
  async function fetchAndDownload(url: string, filename?: string) {
    try {
      const headers: Record<string, string> = {};
      if (accessToken && url.startsWith(API_BASE_URL)) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || (url.split('/').pop() || 'download');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      window.open(url, '_blank');
    }
  }
  const [userCard, setUserCard] = useState<{ anchor: { x: number; y: number } } | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

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
  const displayName = isAi ? (t("ai.copilotName") || "AI Copilot") : (message.user?.displayName ?? t("ai.unknown"));
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
                  {t("ai.bot")}
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

                  const { clean, hasPartial } = splitAtPartialToolTag(block.content);
                  return (
                    <div key={key} className="text-sm leading-relaxed max-w-full overflow-hidden">
                      {clean && (
                        <RichText
                          content={clean}
                          context={resolverContext ?? { documents: [], boards: [], folders: [], users: [] }}
                          availableTags={availableTags}
                        />
                      )}
                      {hasPartial && <BuildingToolCallChip t={t} />}
                    </div>
                  );
                }

                if (block.tag === "batch_tool") {
                  const { blocks: subBlocks } = parseAiMarkup(block.content);
                  const toolCalls = subBlocks.filter(b => b.tag === 'tool_call');
                  return (
                    <div key={key} className="my-1">
                      <BatchToolChip t={t} count={toolCalls.length}>
                        {toolCalls.map((sub, i) => {
                          try {
                            const data = JSON.parse(sub.content);
                            return <RoomToolCallChip key={`${key}-${i}`} t={t} data={data} message={message} onToolApproval={onToolApproval} />;
                          } catch { return null; }
                        })}
                      </BatchToolChip>
                    </div>
                  );
                }

                if (block.tag === "contact") {
                  const { name, number } = parseContactBlock(block.content);
                  if (!name && !number) return null;
                  return <RoomContactChip key={key} t={t} name={name} number={number} />;
                }

                if (block.tag === "tool_call") {
                  try {
                    const data = JSON.parse(block.content);
                    return (
                      <div key={key} className="my-0.5">
                        <RoomToolCallChip t={t} data={data} message={message} onToolApproval={onToolApproval} />
                      </div>
                    );
                  } catch { return null; }
                }

                if (block.tag === "asset") {
                  const { type, src, width, height, title, kind: brickKind, screenshot } = block.attributes || {};
                  const assetSrc = resolveAssetUrl(src);

                  const isUpload = src?.startsWith("/uploads/");
                  const isPortal = !isUpload && ["iframe", "document", "mesh", "kanban", "script"].includes(type || "");
                  const isBrick = type === "brick";

                  if (isPortal) {
                    return (
                      <div key={key} className="my-3 rounded-xl overflow-hidden border-2 border-blue-500/20 dark:border-blue-400/20 bg-slate-900/95 shadow-lg animate-in zoom-in-95 duration-200">
                        <div className="flex h-8 items-center gap-2 border-b border-blue-500/10 bg-blue-950/40 px-3 select-none">
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
                            {type === 'iframe' ? 'Live Content' : type}
                          </span>
                          {title && <span className="ml-1 truncate text-[10px] text-blue-200/60">— {title}</span>}
                          <div className="ml-auto flex items-center gap-1">
                            <a
                              href={type === 'document' ? `/d/${src}` : (type === 'kanban' || type === 'mesh' ? `/b/${src}` : src)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 hover:bg-blue-400/20 rounded transition-colors text-blue-400"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            {assetSrc && (assetSrc.startsWith('http') || assetSrc.startsWith('data:') || assetSrc.startsWith(API_BASE_URL)) && (
                              <button
                                type="button"
                                onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || `attachment`); }}
                                className="p-1 hover:bg-blue-400/20 rounded transition-colors text-blue-400"
                                title={t?.("chat.asset.download") || 'Descargar'}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="p-1">
                          {type === "iframe" ? (
                            <div className="relative group/iframe">
                              <IframeWithPreview
                                src={src.startsWith('/') ? (src.includes('?') ? `${src}&noLayout=true` : `${src}?noLayout=true`) : src}
                                title={title || "Portal Content"}
                                height={height || '400px'}
                                screenshot={screenshot}
                                t={t}
                              />
                            </div>
                          ) : (
                            <div
                              className="group/asset relative p-4 bg-blue-500/5 hover:bg-blue-500/10 transition-colors cursor-pointer rounded-lg flex items-center gap-4"
                              onClick={() => {
                                if (type === 'document') window.open(`/d/${src}`, '_blank');
                                if (type === 'kanban' || type === 'mesh') window.open(`/b/${src}`, '_blank');
                                if (type === 'script') window.open(`/s/${src}`, '_blank');
                              }}
                            >
                              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                                {type === 'document' && <FileText className="w-6 h-6" />}
                                {type === 'kanban' && <Columns className="w-6 h-6" />}
                                {type === 'mesh' && <Layers className="w-6 h-6" />}
                                {type === 'script' && <Code2 className="w-6 h-6" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-blue-50 truncate">{title || `Abrir ${type}`}</div>
                                <div className="text-[10px] text-blue-400/60 font-mono tracking-tight uppercase">Entidad: {src?.slice(0, 12)}...</div>
                              </div>
                              <div className="opacity-0 group-hover/asset:opacity-100 transition-opacity bg-blue-500/20 p-2 rounded-full">
                                <ArrowRight className="w-4 h-4 text-blue-400" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (isBrick) {
                    let brickData: any = null;
                    try {
                      const raw = (block.content || "").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\\"/g, '"'); try { brickData = JSON.parse(raw); } catch (e) { brickData = {}; }
                    } catch (e) { }
                    const rawContent = brickData?.content ?? brickData ?? {};
                    const previewBrick = {
                      id: `asset-brick-${key}`,
                      documentId: 'preview',
                      kind: brickKind || rawContent?.kind || brickData?.kind || 'text',
                      content: rawContent,
                      position: 0,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };

                    return (
                      <div key={key} className="my-3 rounded-xl overflow-hidden border border-violet-500/30 dark:border-violet-400/20 bg-white dark:bg-neutral-950 shadow-md animate-in slide-in-from-bottom-2 duration-300">
                        <div className="flex h-8 items-center gap-2 border-b border-violet-500/10 bg-violet-500/5 px-3 select-none">
                          <Database className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                            Asset Brick · {previewBrick.kind}
                          </span>
                          {title && <span className="ml-1 truncate text-[10px] text-muted-foreground">— {title}</span>}
                        </div>
                        <div className="p-2 overflow-auto max-h-[500px]">
                          <UnifiedBrickRenderer
                            brick={previewBrick as any}
                            canEdit={false}
                            onUpdate={() => { }}
                            isCompact
                          />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={key} className="my-2 rounded-xl border border-border/50 bg-background/50 p-2 overflow-hidden animate-in zoom-in-95 fill-mode-both">
                      {type === "img" && assetSrc && (
                        <div className="relative group/img-asset overflow-hidden rounded-lg">
                          <img
                            src={assetSrc}
                            alt={title || "Image Asset"}
                            className="w-full h-auto object-contain shadow-sm transition-all group-hover/img-asset:scale-[1.01] cursor-zoom-in bg-white dark:bg-neutral-900"
                            style={{ maxHeight: height || '400px' }}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img-asset:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <a
                              href={assetSrc}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-all backdrop-blur-sm pointer-events-auto"
                              title={t("chat.asset.original")}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              type="button"
                              onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || "image.png"); }}
                              className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-all backdrop-blur-sm pointer-events-auto"
                              title={t("chat.asset.download")}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      {type === "document" && assetSrc && (
                        <div className="flex items-center gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-lg border border-border/50">
                          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-violet-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold truncate text-foreground">{title || t("chat.asset.document")}</div>
                            <div className="text-[9px] text-muted-foreground uppercase font-mono tracking-tighter">{t("chat.asset.attached")}</div>
                          </div>
                          <a href={assetSrc} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-full transition-colors text-violet-500">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <button
                            type="button"
                            onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || 'attachment'); }}
                            className="p-2 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-full transition-colors text-violet-500"
                            title={t("chat.asset.download")}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                if (block.tag === "plan") {
                  const steps: { id: string; status: string; content: string }[] = [];
                  const stepRegex = /<step\s+id=["']?([^"'>\s]+)["']?\s+status=["']?([^"'>\s]+)["']?>([\s\S]*?)<\/step>/gi;
                  let match;
                  while ((match = stepRegex.exec(block.content)) !== null) {
                    steps.push({ id: match[1], status: match[2], content: match[3].trim() });
                  }

                  // Collect step IDs marked done via complete_step tool calls embedded in the message
                  const inlineToolEventsForPlan = parseInlineToolEvents(message.content);
                  const toolEventsForPlan = inlineToolEventsForPlan.length > 0
                    ? inlineToolEventsForPlan
                    : ((message.metadata as any)?.toolEvents ?? []);
                  const completedByTool = new Set(
                    toolEventsForPlan
                      .filter((e: any) => e.tool === 'complete_step' && e.input?.slot !== undefined)
                      .map((e: any) => String(e.input.slot)),
                  );

                  return (
                    <div key={key} className="mb-2 rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-900/10 p-3 shadow-sm max-w-full overflow-hidden">
                      <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-violet-500 uppercase tracking-wider">
                        <ListChecks className="w-3 h-3" />
                        <span>{t("ai.executionPlan")}</span>
                      </div>
                      <div className="space-y-2">
                        {steps.map((step) => {
                          const isDone = step.status === "done" || completedByTool.has(step.id);
                          const isActive = !isDone && (step.status === "doing" || step.status === "active");
                          return (
                            <div key={step.id} className="flex gap-2 group/step">
                              <div className="shrink-0 mt-0.5">
                                {isDone ? (
                                  <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                    <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                  </div>
                                ) : isActive ? (
                                  <div className="w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                                    <Loader2 className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400 animate-spin" />
                                  </div>
                                ) : (
                                  <div className="w-4 h-4 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-[8px] font-bold text-neutral-400">{step.id}</span>
                                  </div>
                                )}
                              </div>
                              <div className={`flex-1 text-[12px] leading-snug ${isDone ? "text-muted-foreground line-through decoration-border" : "text-foreground"}`}>
                                <RichText
                                  content={step.content}
                                  context={resolverContext ?? { documents: [], boards: [], folders: [], users: [] }}
                                  availableTags={availableTags}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (block.tag === "pre_think") {
                  const sections = parsePreThinkSections(block.content);
                  const sectionMeta: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
                    assumptions: { icon: <HelpCircle className="w-3 h-3" />, label: t("ai.assumptions"), color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-900/20" },
                    risks: { icon: <ShieldCheck className="w-3 h-3" />, label: t("ai.risks"), color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
                    strategy: { icon: <Lightbulb className="w-3 h-3" />, label: t("ai.strategy"), color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                    raw: { icon: <Brain className="w-3 h-3" />, label: t("ai.thinking"), color: "text-muted-foreground", bg: "bg-muted/40" },
                  };
                  return (
                    <div key={key} className="mb-2 rounded-lg border border-border/60 bg-background/50 overflow-hidden">
                      <button
                        onClick={() => toggleMarkup(key)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <Brain className="w-3 h-3 shrink-0" />
                          <span className="uppercase">{t("ai.preThink")}</span>
                        </div>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {isExpanded && (
                        <div className="px-2 pb-2 space-y-1.5 animate-in fade-in slide-in-from-top-1">
                          {sections.map((sec, si) => {
                            const meta = sectionMeta[sec.tag] ?? sectionMeta.raw;
                            return (
                              <div key={si} className={`rounded-lg p-2 ${meta.bg}`}>
                                <div className={`flex items-center gap-1.5 mb-1 text-[9px] font-bold uppercase tracking-wider ${meta.color}`}>
                                  {meta.icon}
                                  <span>{meta.label}</span>
                                </div>
                                <p className="text-[11px] leading-relaxed text-foreground/70 whitespace-pre-wrap">{sec.content}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
                              className={`px-1 rounded whitespace-pre ${isAdded ? 'bg-emerald-500/15 text-emerald-400' :
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

                if (block.tag === "poll") {
                  const handleVote = async (optionIndex: number, isRemoving?: boolean) => {
                    if (!accessToken || !currentUserId) return;
                    const prevMetadata = message.metadata || {};

                    // Security check: don't vote if closed
                    const isExpired = prevMetadata.expiresAt ? new Date(prevMetadata.expiresAt) <= new Date() : false;
                    if (prevMetadata.isClosed || isExpired) return;

                    const pollVotes = { ...(prevMetadata.pollVotes || {}) };
                    const isMultiple = prevMetadata.multiple === true;

                    if (!isMultiple) {
                      // Single choice: remove existing vote from any other option
                      Object.keys(pollVotes).forEach(idx => {
                        if (Array.isArray(pollVotes[idx])) {
                          pollVotes[idx] = pollVotes[idx].filter((id: string) => id !== currentUserId);
                        }
                      });
                    }

                    if (isRemoving) {
                      // Toggle off
                      if (Array.isArray(pollVotes[optionIndex])) {
                        pollVotes[optionIndex] = pollVotes[optionIndex].filter((id: string) => id !== currentUserId);
                      }
                    } else {
                      // Add vote
                      if (!Array.isArray(pollVotes[optionIndex])) pollVotes[optionIndex] = [];
                      if (!pollVotes[optionIndex].includes(currentUserId)) {
                        pollVotes[optionIndex].push(currentUserId);
                      }
                    }

                    const newMetadata = { ...prevMetadata, pollVotes };
                    try {
                      await updateMessageMetadata(message.roomId, message.id, newMetadata, accessToken);
                    } catch (err) {
                      console.error("Failed to vote:", err);
                    }
                  };

                  return (
                    <PollRenderer
                      key={key}
                      content={block.content}
                      metadata={message.metadata}
                      currentUserId={currentUserId}
                      creatorId={message.userId}
                      t={t}
                      onVote={handleVote}
                      onClose={async () => {
                        if (!accessToken) return;
                        const newMetadata = { ...(message.metadata || {}), isClosed: true };
                        await updateMessageMetadata(message.roomId, message.id, newMetadata, accessToken);
                      }}
                    />
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
              <div className="w-[1px] h-3 bg-border mx-1" />
              <button
                onClick={() => setIsInfoOpen(true)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-blue-500 transition-colors"
                title="Message Info"
              >
                <Info className="w-3.5 h-3.5" />
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

      {isInfoOpen && (
        <Portal>
          <div className="fixed inset-0 z-[300] flex items-center justify-end sm:p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
              onClick={() => setIsInfoOpen(false)}
            />
            <div className="relative w-full sm:w-[400px] h-full sm:h-[600px] sm:max-h-[90vh] bg-card sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">
              <MessageInfoPanel
                roomId={message.roomId}
                message={message}
                onClose={() => setIsInfoOpen(false)}
                onMarkRead={onMarkRead}
              />
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
// ─── RoomToolCallChip — resolves RoomMessage events → ToolCallChip props ─────

function RoomToolCallChip({
  t,
  data,
  message,
  onToolApproval,
}: {
  t: TFn;
  data: any;
  message: RoomMessage;
  onToolApproval?: (toolName: string, input: any, decision: 'approved' | 'rejected') => void;
}) {
  const searchName = (data.name ?? "").toLowerCase();
  const inlineEvents = useMemo(() => parseInlineToolEvents(message.content), [message.content]);
  const legacyEvents = (message.metadata as any)?.toolEvents || [];
  const legacyResults = (message.metadata as any)?.toolResults || [];
  const events = inlineEvents.length > 0 ? inlineEvents : (legacyEvents.length > 0 ? legacyEvents : (() => {
    const syn: any[] = [];
    const calls = (message as any).tool_calls || [];
    const results = (message as any).tool_results || [];
    calls.forEach((c: any) => {
      const res = results.find((r: any) => r.tool_use_id === c.id || r.tool === c.name);
      syn.push({ tool: c.name, phase: "done", success: res ? !res.is_error : true, output: res?.content });
    });
    return syn;
  })());
  const state = resolveToolCallRenderState(data, events);
  const matchingResult = inlineEvents.length > 0
    ? null
    : (legacyResults.length > 0 ? [...legacyResults].reverse().find((r: any) => String(r.toolName || r.tool || "").toLowerCase() === searchName) ?? legacyResults[0] ?? null : null);

  const hasUsefulOutput = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  };

  const candidateOutputs = [state.output, matchingResult?.data, matchingResult?.output, matchingResult?.content];
  const output = candidateOutputs.find(hasUsefulOutput);

  // sub_agent: render the nested run's full activity flow (thinking + tool chips
  // + text) through the SAME markup pipeline as the assistant panel — never the
  // raw {activity, reason, label} JSON. Mirrors AgentToolCallChip's special-case.
  if (searchName === "sub_agent" && state.isDone && !state.isError) {
    let out: any = output ?? {};
    // History/legacy paths can carry the tool_output as a JSON string — parse it
    // so we can pull `.activity`/`.reason` rather than rendering the raw string.
    if (typeof out === "string") {
      try { out = JSON.parse(out); } catch { out = {}; }
    }
    const activity = typeof out.activity === "string" ? out.activity : "";
    const reason = typeof out.reason === "string" ? out.reason : "";
    if (activity || reason) {
      return (
        <div>
          <ToolCallChip
            t={t}
            toolName="sub_agent"
            input={state.input ?? data.input}
            isDone
            isRunning={false}
            isError={false}
            needsApproval={false}
            output={undefined}
          />
          <SubAgentActivity t={t} activity={activity} reason={reason} />
        </div>
      );
    }
  }

  return (
    <ToolCallChip
      t={t}
      toolName={data.name ?? ""}
      input={state.input ?? data.input}
      isDone={state.isDone}
      isRunning={state.isRunning}
      isError={state.isError}
      needsApproval={state.needsApproval}
      output={output}
      onApprove={onToolApproval ? () => onToolApproval(data.name, state.input ?? data.input, 'approved') : undefined}
      onReject={onToolApproval ? () => onToolApproval(data.name, state.input ?? data.input, 'rejected') : undefined}
    />
  );
}
