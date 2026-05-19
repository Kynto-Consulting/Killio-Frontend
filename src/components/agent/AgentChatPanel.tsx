"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import {
  Bot, Send, Loader2, X, Trash2, Wrench, CheckCircle2, XCircle, Zap,
  Copy, ThumbsUp, ThumbsDown, RotateCcw, History, ChevronDown, ChevronUp,
  Layout, FileText, Code, Users, Search, List, Play, PlusCircle,
  ArrowRight, Edit2, LayoutDashboard, Grid3X3, Sparkles, Check,
  Clock, MessageSquare, Tag, AlertCircle, Info,
  ListChecks, FileCode, ExternalLink, Columns, Layers, Code2, Image as ImageIcon, Database, ShieldAlert,
  Brain, ShieldCheck, Lightbulb, HelpCircle, Maximize2, Download
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ToolCallChip, BatchToolChip, BuildingToolCallChip } from "@/components/agent/tool-call-chip";
import { useAgentChat, AgentMessage, ToolEvent, ToolResult, resolveToolCallRenderState } from "@/hooks/use-agent-chat";
import { AgentEntityScope, AgentConversation, listAgentConversations } from "@/lib/api/agent";
import { getTeamAiUsage, type TeamAiUsage } from "@/lib/api/contracts";
import { ReferenceTokenInput } from "@/components/ui/reference-token-input";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTeamAiCreditsUpdate } from "@/hooks/use-team-ai-credits-update";
import type { ResolverContext } from "@/lib/reference-resolver";
import type { DocumentSummary } from "@/lib/api/documents";
import type { WorkspaceMemberLike } from "@/lib/workspace-members";
import { getAiMarkupLabel, parseAiMarkup, parsePreThinkSections, splitAtPartialToolTag } from "@/lib/ai-markup";
import { RichText } from "../ui/rich-text";
import { UnifiedBrickRenderer } from "../bricks/brick-renderer";
import { uploadFile } from "@/lib/api/uploads";
import { API_BASE_URL } from "@/lib/api/client";

const resolveAssetUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
};

async function fetchAndDownload(url: string, filename?: string, accessToken?: string) {
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
    console.error('Download failed:', err);
    window.open(url, '_blank');
  }
}


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
      <div className="relative z-10 mt-4 text-xs font-bold text-blue-300 uppercase tracking-widest drop-shadow-md">{t("agent.asset.activateLive")}</div>
      <div className="relative z-10 mt-1 text-[10px] text-blue-500/60 font-mono truncate max-w-[80%]">
        {src.startsWith('/') ? window.location.hostname : (src.startsWith('http') ? new URL(src).hostname : src)}
      </div>
    </div>
  );
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface AgentChatPanelProps {
  teamId: string;
  entityType?: AgentEntityScope;
  entityId?: string;
  onClose?: () => void;
  className?: string;
  initialMessage?: string;
  autoSendInitial?: boolean;
  onInitialMessageClear?: () => void;
  documents?: DocumentSummary[];
  boards?: any[];
  users?: WorkspaceMemberLike[];
  cards?: any[];
  bricks?: any[];
  resolverContext?: ResolverContext;
}

// ─── Entity config ────────────────────────────────────────────────────────────

type EntityMeta = {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  capabilities: string[];
};

function getEntityConfig(t: TFn): Record<AgentEntityScope, EntityMeta> {
  const caps = (scope: AgentEntityScope) =>
    [0, 1, 2, 3].map((i) => t(`agent.capabilities.${scope}.${i}`));

  return {
    board: {
      label: t("agent.entity.board"),
      icon: <LayoutDashboard className="w-3 h-3" />,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      capabilities: caps("board"),
    },
    document: {
      label: t("agent.entity.document"),
      icon: <FileText className="w-3 h-3" />,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
      capabilities: caps("document"),
    },
    mesh: {
      label: t("agent.entity.mesh"),
      icon: <Grid3X3 className="w-3 h-3" />,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      capabilities: caps("mesh"),
    },
    script: {
      label: t("agent.entity.script"),
      icon: <Code className="w-3 h-3" />,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-900/20",
      capabilities: caps("script"),
    },
    team: {
      label: t("agent.entity.team"),
      icon: <Users className="w-3 h-3" />,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-900/20",
      capabilities: caps("team"),
    },
  };
}

function getEntitySuggestions(t: TFn): Record<AgentEntityScope, string[]> {
  const pick = (scope: AgentEntityScope) =>
    [0, 1, 2].map((i) => t(`agent.suggestions.${scope}.${i}`));
  return {
    board: pick("board"),
    document: pick("document"),
    mesh: pick("mesh"),
    script: pick("script"),
    team: pick("team"),
  };
}

// ─── Tool metadata ────────────────────────────────────────────────────────────

function getToolMeta(t: TFn, tool: string): { icon: React.ReactNode; color: string; label: string } {
  const s = tool.toLowerCase();
  if (s.includes("create_card") || s.includes("add_card"))
    return { icon: <PlusCircle className="w-3.5 h-3.5" />, color: "text-emerald-500", label: t("agent.tools.cardCreated") };
  if (s.includes("update_card") || s.includes("edit_card"))
    return { icon: <Edit2 className="w-3.5 h-3.5" />, color: "text-blue-500", label: t("agent.tools.cardUpdated") };
  if (s.includes("move_card"))
    return { icon: <ArrowRight className="w-3.5 h-3.5" />, color: "text-orange-500", label: t("agent.tools.cardMoved") };
  if (s.includes("card_tag") || s.includes("tag_") || s.includes("tag"))
    return { icon: <Tag className="w-3.5 h-3.5" />, color: "text-rose-500", label: formatToolName(tool) };
  if (s.includes("delete_card") || s.includes("remove_card"))
    return { icon: <Trash2 className="w-3.5 h-3.5" />, color: "text-red-500", label: t("agent.tools.cardDeleted") };
  if (s.includes("create_document") || s.includes("create_doc"))
    return { icon: <FileText className="w-3.5 h-3.5" />, color: "text-amber-500", label: t("agent.tools.documentCreated") };
  if (s.includes("update_document") || s.includes("update_doc"))
    return { icon: <FileText className="w-3.5 h-3.5" />, color: "text-amber-400", label: t("agent.tools.documentUpdated") };
  if (s.includes("create_brick") || s.includes("add_brick"))
    return { icon: <Layout className="w-3.5 h-3.5" />, color: "text-violet-500", label: t("agent.tools.blockCreated") };
  if (s.includes("create_board"))
    return { icon: <LayoutDashboard className="w-3.5 h-3.5" />, color: "text-blue-500", label: t("agent.tools.boardCreated") };
  if (s.includes("run_script") || s.includes("execute"))
    return { icon: <Play className="w-3.5 h-3.5" />, color: "text-green-500", label: t("agent.tools.scriptExecuted") };
  if (s.includes("search") || s.includes("find"))
    return { icon: <Search className="w-3.5 h-3.5" />, color: "text-blue-400", label: t("agent.tools.searching") };
  if (s.includes("list") || s.includes("get_"))
    return { icon: <List className="w-3.5 h-3.5" />, color: "text-neutral-400", label: t("agent.tools.querying") };
  if (s.includes("mesh") || s.includes("brick"))
    return { icon: <Grid3X3 className="w-3.5 h-3.5" />, color: "text-violet-400", label: t("agent.tools.canvas") };
  return { icon: <Zap className="w-3.5 h-3.5" />, color: "text-violet-400", label: formatToolName(tool) };
}

// ─── Follow-up suggestions ────────────────────────────────────────────────────

function getFollowUps(t: TFn, entityType?: AgentEntityScope, toolsUsed?: string[]): string[] {
  const tools = (toolsUsed ?? []).map((x) => x.toLowerCase());
  const pick = (key: string) => [0, 1, 2].map((i) => t(`agent.followUps.${key}.${i}`));

  if (tools.some((x) => x.includes("create_card") || x.includes("add_card")))
    return pick("cardCreated");
  if (tools.some((x) => x.includes("move_card") || x.includes("update_card")))
    return pick("cardMoved");
  if (tools.some((x) => x.includes("document") || x.includes("brick")))
    return pick("document");
  if (tools.some((x) => x.includes("search") || x.includes("list") || x.includes("get_")))
    return pick("search");
  if (entityType === "board") return pick("board");
  if (entityType === "document") return pick("documentDefault");
  if (entityType === "mesh") return pick("mesh");
  if (entityType === "script") return pick("script");
  return pick("team");
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentChatPanel({
  teamId,
  entityType,
  entityId,
  onClose,
  className = "",
  initialMessage,
  autoSendInitial = false,
  onInitialMessageClear,
  documents = [],
  boards = [],
  users = [],
  cards = [],
  bricks = [],
  resolverContext,
}: AgentChatPanelProps) {
  const { accessToken } = useSession();
  const t = useTranslations("common");

  const builtContext: ResolverContext = resolverContext ?? {
    documents,
    boards,
    users,
    activeBricks: bricks,
  };

  const {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    activeToolEvents,
    sendMessage,
    retryMessage,
    setThumb,
    loadConversation,
    cancel,
    clearConversation,
    sendToolApproval,
    conversationId,
  } = useAgentChat({ teamId, entityType, entityId, resolverContext: builtContext });

  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: 'img' | 'document' }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [aiUsage, setAiUsage] = useState<TeamAiUsage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeToolEvents]);

  useEffect(() => {
    if (initialMessage && !initialSentRef.current) {
      initialSentRef.current = true;
      if (autoSendInitial) {
        sendMessage(initialMessage);
      } else {
        setInputValue(initialMessage);
      }
      onInitialMessageClear?.();
    }
  }, [initialMessage, autoSendInitial, sendMessage, setInputValue, onInitialMessageClear]);

  // Load initial AI usage
  useEffect(() => {
    if (!teamId || !accessToken) return;

    const loadUsage = async () => {
      try {
        const usage = await getTeamAiUsage(teamId, accessToken);
        setAiUsage(usage);
      } catch (err) {
        console.error("Failed to load AI usage:", err);
      }
    };

    loadUsage();
  }, [teamId, accessToken]);

  // Subscribe to real-time credits updates
  const handleCreditsUsed = useCallback((event: any) => {
    setAiUsage((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        creditsUsed: parseFloat((prev.creditsUsed + event.credits).toFixed(6)),
        tokensUsed: prev.tokensUsed + event.tokens,
        remaining: parseFloat((prev.remaining - event.credits).toFixed(6)),
      };
    });
  }, []);

  useTeamAiCreditsUpdate(teamId, handleCreditsUsed);

  const openHistory = useCallback(async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const list = await listAgentConversations(teamId, accessToken!);
      setConversations(list);
    } catch {
      setConversations([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [teamId, accessToken]);

  const copyMessage = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => { });
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const toggleToolExpand = useCallback((id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    await performUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const performUpload = async (file: File) => {
    if (!accessToken) return;
    try {
      setIsUploading(true);
      const res = await uploadFile(file, accessToken, {
        ownerScopeType: "team",
        ownerScopeId: teamId,
        usage: "chat_attachment"
      });

      const isImage = file.type.startsWith("image/");
      setAttachments(prev => [...prev, {
        url: res.url,
        name: file.name,
        type: isImage ? 'img' : 'document'
      }]);
    } catch (err) {
      console.error("Failed to upload file:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAgentSend = (text?: string) => {
    const raw = typeof text === 'string' ? text : inputValue;
    if (!raw.trim() && attachments.length === 0) return;

    // Validate credits before sending
    if (!aiUsage || aiUsage.remaining <= 0) {
      alert(t("agent.errors.noCredits"));
      return;
    }

    let finalContent = raw;
    if (attachments.length > 0) {
      const assetTags = attachments.map(att =>
        att.type === 'img'
          ? `<asset type="img" src="${att.url}" />`
          : `<asset type="document" src="${att.url}" title="${att.name}" />`
      ).join('\n');
      finalContent = finalContent.trim() ? `${finalContent}\n\n${assetTags}` : assetTags;
    }

    sendMessage(finalContent);
    setAttachments([]);
  };

  const entityConfig = useMemo(() => getEntityConfig(t), [t]);
  const entitySuggestions = useMemo(() => getEntitySuggestions(t), [t]);
  const entityCfg = entityType ? entityConfig[entityType] : null;

  const followUps = useMemo(() => {
    if (isLoading || messages.length === 0) return [];
    const last = [...messages].reverse().find((m) => m.role === "assistant" && !m.isStreaming);
    if (!last) return [];
    return getFollowUps(t, entityType, last.toolsUsed);
  }, [messages, entityType, isLoading, t]);

  const isLastAssistant = useCallback(
    (msg: AgentMessage) => {
      const last = [...messages].reverse().find((m) => m.role === "assistant");
      return last?.id === msg.id;
    },
    [messages],
  );

  return (
    <div className={`flex flex-col bg-white dark:bg-neutral-900 relative overflow-hidden ${className || 'h-full'}`}>


      {/* ── History overlay ───────────────────────────────────────────────── */}
      {showHistory && (
        <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-neutral-900">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                {t("agent.header.historyLabel")}
              </span>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 transition-colors"
              title={t("actions.close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {historyLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
              </div>
            )}
            {!historyLoading && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-neutral-400 text-xs">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                <p>{t("agent.history.noConversations")}</p>
              </div>
            )}
            {!historyLoading &&
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    loadConversation(conv.id);
                    setShowHistory(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors text-sm ${conv.id === conversationId
                    ? "border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                    : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                    }`}
                >
                  <p className="font-medium truncate">
                    {conv.title ?? t("agent.history.untitled")}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                    {new Date(conv.updatedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </button>
              ))}
          </div>
          <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
            <button
              onClick={() => {
                clearConversation();
                setShowHistory(false);
              }}
              className="w-full h-9 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t("agent.header.newConversation")}
            </button>
          </div>
        </div>
      )}

      {/* ── Message list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <EmptyState
            t={t}
            entityType={entityType}
            entityCfg={entityCfg}
            suggestions={entityType ? entitySuggestions[entityType] : entitySuggestions.team}
            onSuggestionClick={(tip) => sendMessage(tip)}
          />
        )}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserMessage
              key={msg.id}
              t={t}
              message={msg}
              onCopy={() => copyMessage(msg.id, msg.text)}
              copied={copiedId === msg.id}
              copyLabel={t("agent.messages.copy")}
            />
          ) : (
            <AssistantMessage
              key={msg.id}
              t={t}
              message={msg}
              isLast={isLastAssistant(msg)}
              toolsExpanded={expandedTools.has(msg.id)}
              onToggleTools={() => toggleToolExpand(msg.id)}
              onCopy={() => copyMessage(msg.id, msg.text)}
              copied={copiedId === msg.id}
              onThumb={(v) => setThumb(msg.id, v)}
              onRetry={retryMessage}
              onToolApproval={sendToolApproval}
              resolverContext={builtContext}
              availableTags={[]}
            />
          ),
        )}

        {isLoading && <ThinkingBubble t={t} events={activeToolEvents} />}

        {followUps.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-1.5 pl-8">
            {followUps.map((tip) => (
              <button
                key={tip}
                onClick={() => sendMessage(tip)}
                className="text-xs px-2.5 py-1 rounded-full border border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
              >
                {tip}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 px-3 py-3">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 px-1 animate-in slide-in-from-bottom-2 duration-300">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative group/att">
                {att.type === 'img' ? (
                  <div className="w-14 h-14 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-50 dark:bg-neutral-800">
                    <img src={resolveAssetUrl(att.url)} alt="preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-14 px-3 flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-[10px] font-medium text-neutral-500">
                    <FileText className="w-3.5 h-3.5 text-violet-500" />
                    <span className="max-w-[70px] truncate">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover/att:opacity-100 transition-opacity shadow-sm"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {isUploading && (
              <div className="w-14 h-14 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700 flex items-center justify-center bg-neutral-50/50">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            type="file"
            accept="image/*,application/pdf,text/markdown,.md"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <div className="flex flex-col gap-1 mb-0.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isLoading}
              className="p-2 rounded-xl hover:bg-violet-400/10 text-violet-500/60 hover:text-violet-500 transition-all"
              title={t("agent.attach")}
            >
              <div className="relative">
                <FileText className="w-4 h-4" />
                <div className="absolute -top-1 -right-1 bg-violet-500 text-white rounded-full w-2.5 h-2.5 flex items-center justify-center text-[7px] font-bold">+</div>
              </div>
            </button>
          </div>

          <ReferenceTokenInput
            value={inputValue}
            onChange={setInputValue}
            placeholder={t("agent.input.placeholder")}
            documents={documents}
            boards={boards}
            users={users}
            cards={cards}
            onSubmit={() => handleAgentSend()}
            disabled={isLoading}
            className="flex-1"
            inputClassName="text-sm bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 rounded-xl focus:ring-2 focus:ring-violet-500/50 min-h-[38px]"
          />
          {isLoading ? (
            <button
              onClick={cancel}
              className="shrink-0 p-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200 transition-colors"
              title={t("actions.cancel")}
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => handleAgentSend()}
              disabled={(!inputValue.trim() && attachments.length === 0) || !aiUsage || aiUsage.remaining <= 0}
              className="shrink-0 p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="mt-1 text-[10px] text-neutral-400 text-center">{t("agent.input.hint")}</p>
        {aiUsage && aiUsage.remaining <= 0 && (
          <p className="mt-1 text-[10px] text-red-500 font-medium text-center">{t("agent.errors.noCredits")}</p>
        )}
        {aiUsage && aiUsage.remaining > 0 && aiUsage.remaining < 1 && (
          <p className="mt-1 text-[10px] text-amber-500 font-medium text-center">{t("agent.errors.lowCredits")}</p>
        )}
      </div>
    </div>
  );
}

// ─── UserMessage ──────────────────────────────────────────────────────────────

function UserMessage({
  t,
  message,
  onCopy,
  copied,
  copyLabel,
}: {
  t: TFn;
  message: AgentMessage;
  onCopy: () => void;
  copied: boolean;
  copyLabel: string;
}) {
  const { blocks: markupBlocks } = useMemo(() => parseAiMarkup(message.text), [message.text]);

  return (
    <div className="flex justify-end gap-2 group">
      <div className="max-w-[85%] flex flex-col items-end gap-1.5 min-w-0">
        {markupBlocks.map((block, index) => {
          const key = `user-${block.tag}-${index}`;

          if (block.tag === "asset") {
            const { type, src, title } = block.attributes || {};
            const assetSrc = resolveAssetUrl(src || "");
            return (
              <div key={key} className="relative group/img-asset rounded-xl border border-border/50 bg-neutral-100 dark:bg-neutral-800 p-2 overflow-hidden max-w-full animate-in zoom-in-95 duration-200">
                {type === "img" ? (
                  <div className="relative overflow-hidden rounded-lg">
                    <img
                      src={assetSrc}
                      alt={title || "Image"}
                      className="rounded-lg max-w-full h-auto object-contain bg-white dark:bg-neutral-900 shadow-sm transition-all group-hover/img-asset:scale-[1.01]"
                      style={{ maxHeight: '300px' }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img-asset:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <a 
                        href={assetSrc} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-all backdrop-blur-sm"
                        title={t("agent.asset.original")}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <a 
                        href={assetSrc} 
                        download={title || "image.png"} 
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-all backdrop-blur-sm"
                        title={t("agent.asset.download")}
                        onClick={async (e) => {
                          e.preventDefault();
                          try {
                            const response = await fetch(assetSrc);
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = title || (type === 'img' ? "image.png" : "file");
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                          } catch (err) {
                            console.error("Download failed:", err);
                            window.open(assetSrc, '_blank');
                          }
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-2 bg-white/50 dark:bg-black/20 rounded-lg">
                    <FileText className="w-5 h-5 text-violet-500" />
                    <span className="text-[11px] font-medium truncate max-w-[120px]">{title || (type === 'document' ? t("agent.asset.document") : t("agent.asset.file"))}</span>
                    <a href={assetSrc} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-full transition-colors text-violet-500">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            );
          }

          // Text block (user bubble)
          return (
            <div key={key} className="relative px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-violet-600 text-white text-sm shadow-sm leading-relaxed">
              <p className="whitespace-pre-wrap">{block.content}</p>
              {index === 0 && (
                <button
                  onClick={onCopy}
                  className="absolute -left-7 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-all"
                  title={copyLabel}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AssistantMessage ─────────────────────────────────────────────────────────

function AssistantMessage({
  t,
  message,
  isLast,
  toolsExpanded,
  onToggleTools,
  onCopy,
  copied,
  onThumb,
  onRetry,
  onToolApproval,
  resolverContext,
  availableTags,
}: {
  t: TFn;
  message: AgentMessage;
  isLast: boolean;
  toolsExpanded: boolean;
  onToggleTools: () => void;
  onCopy: () => void;
  copied: boolean;
  onThumb: (v: "up" | "down") => void;
  onRetry: () => void;
  onToolApproval?: (toolName: string, input: any, decision: 'approved' | 'rejected', toolId?: string) => void;
  resolverContext?: ResolverContext;
  availableTags?: any[];
}) {
  const [expandedMarkup, setExpandedMarkup] = useState<Set<string>>(new Set());

  const { visibleText: rawVisibleText, blocks: markupBlocks } = useMemo(() => parseAiMarkup(message.text), [message.text]);
  // If the message text already contains inline tool_call/batch_tool chips, suppress the
  // doneEvents summary section below to prevent the same tools appearing twice.
  const hasInlineToolChips = useMemo(
    () => markupBlocks.some(b => b.tag === 'tool_call' || b.tag === 'batch_tool' || b.tag === 'batch_invoke'),
    [markupBlocks],
  );
  const { clean: visibleText, hasPartial: hasPartialToolCall } = useMemo(
    () => splitAtPartialToolTag(rawVisibleText),
    [rawVisibleText],
  );

  const toggleMarkup = useCallback((key: string) => {
    setExpandedMarkup((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);
  const { accessToken } = useSession();

  const doneEvents = (message.toolEvents ?? []).filter((e) => e.phase === "done");
  const count = doneEvents.length;
  const actionsLabel =
    count === 1
      ? t("agent.messages.actionCount_one")
      : t("agent.messages.actionCount_other", { count });

  return (
    <div className="flex justify-start gap-2 group">
      <div className="shrink-0 flex items-start mt-0.5">
        <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
        </div>
      </div>

      <div className="max-w-[85%] flex flex-col gap-1.5 min-w-0">
        {(() => {
          // Pre-compute occurrence counters so same-named tools get the correct done event
          const toolOccurrenceCounter = new Map<string, number>();
          const getOccurrence = (name: string): number => {
            const n = (name ?? "").toLowerCase();
            const idx = toolOccurrenceCounter.get(n) ?? 0;
            toolOccurrenceCounter.set(n, idx + 1);
            return idx;
          };
          // First pass: count occurrences in document order (batch sub-chips + direct chips)
          const blockOccurrences: Array<{ blockIndex: number; subIndex?: number; occurrence: number }> = [];
          markupBlocks.forEach((block, blockIndex) => {
            if (block.tag === "batch_tool" || block.tag === "batch_invoke") {
              const { blocks: subBlocks } = parseAiMarkup(block.content);
              subBlocks.filter(b => b.tag === 'tool_call').forEach((sub, subIndex) => {
                try {
                  const d = JSON.parse(sub.content);
                  blockOccurrences.push({ blockIndex, subIndex, occurrence: getOccurrence(d.name) });
                } catch { blockOccurrences.push({ blockIndex, subIndex, occurrence: 0 }); }
              });
            } else if (block.tag === "tool_call") {
              try {
                const d = JSON.parse(block.content);
                blockOccurrences.push({ blockIndex, occurrence: getOccurrence(d.name) });
              } catch { blockOccurrences.push({ blockIndex, occurrence: 0 }); }
            }
          });

          return markupBlocks.map((block, index) => {
          const key = `${block.tag}-${index}`;
          const isExpanded = expandedMarkup.has(key);

          if (block.tag === "batch_tool" || block.tag === "batch_invoke") {
            const { blocks: subBlocks } = parseAiMarkup(block.content);
            const toolCalls = subBlocks.filter(b => b.tag === 'tool_call');
            const anyRunning = toolCalls.some(sub => {
              try {
                const d = JSON.parse(sub.content);
                return resolveToolCallRenderState(d, message.toolEvents ?? []).isRunning;
              } catch { return false; }
            });
            // Map sub-chip occurrence for this batch block
            const batchChipOccurrences = blockOccurrences.filter(o => o.blockIndex === index && o.subIndex !== undefined);
            return (
              <div key={key} className="my-1">
                <BatchToolChip t={t} count={toolCalls.length} defaultOpen={anyRunning}>
                  {toolCalls.map((sub, i) => {
                    try {
                      const data = JSON.parse(sub.content);
                      const occurrence = batchChipOccurrences.find(o => o.subIndex === i)?.occurrence ?? i;
                      return <AgentToolCallChip key={`${key}-${i}`} t={t} data={data} message={message} occurrenceIndex={occurrence} onToolApproval={onToolApproval} />;
                    } catch { return null; }
                  })}
                </BatchToolChip>
              </div>
            );
          }

          if (block.tag === "tool_call") {
            try {
              const data = JSON.parse(block.content);
              const occurrence = blockOccurrences.find(o => o.blockIndex === index && o.subIndex === undefined)?.occurrence ?? 0;
              return (
                <div key={key} className="my-0.5">
                  <AgentToolCallChip t={t} data={data} message={message} occurrenceIndex={occurrence} onToolApproval={onToolApproval} />
                </div>
              );
            } catch { return null; }
          }

          if (block.tag === "asset") {
            const { type, src, width, height, title, kind: brickKind, screenshot } = block.attributes || {};

            // "Portal" style for interactive/media types and entities
            const isUpload = src?.startsWith("/uploads/");
            const isPortal = !isUpload && ["iframe", "document", "mesh", "kanban", "script"].includes(type || "");
            const isBrick = type === "brick";

            const assetSrc = resolveAssetUrl(src || "");
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
                          onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || `attachment`, accessToken!); }}
                          className="p-1 hover:bg-blue-400/20 rounded transition-colors text-blue-400"
                          title={t?.("agent.asset.download") || 'Descargar'}
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

              const previewBrick = {
                id: `asset-brick-${key}`,
                documentId: 'preview',
                kind: brickKind || brickData?.kind || brickData?.content?.kind || 'text',
                content: (brickData?.content ?? brickData ?? {}),
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
                        title={t("agent.asset.original")}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || "image.png", accessToken!); }}
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-all backdrop-blur-sm pointer-events-auto"
                        title={t("agent.asset.download")}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
                {(type === "pdf" || type === "document") && assetSrc && (
                  <div className="flex items-center gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-lg border border-border/50">
                    <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold truncate text-foreground">{title || (type === 'pdf' ? "PDF Document" : "Documento")}</div>
                      <div className="text-[9px] text-muted-foreground uppercase font-mono tracking-tighter">Adjunto</div>
                    </div>
                    <a href={assetSrc} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-full transition-colors text-violet-500">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      type="button"
                      onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || 'attachment', accessToken!); }}
                      className="p-2 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-full transition-colors text-violet-500"
                      title={t("agent.asset.download")}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          }

          // "text" blocks are rendered in the bottom bubble via visibleText — skip here
          if (block.tag === "text") return null;

          if (block.tag === "plan") {
            const steps: { id: string; status: string; content: string }[] = [];
            const stepRegex = /<step\s+id=["']?([^"'>\s]+)["']?\s+status=["']?([^"'>\s]+)["']?>([\s\S]*?)<\/step>/gi;
            let match;
            while ((match = stepRegex.exec(block.content)) !== null) {
              steps.push({ id: match[1], status: match[2], content: match[3].trim() });
            }

            // Collect step IDs marked done via complete_step tool calls
            const completedByTool = new Set(
              (message.toolEvents ?? [])
                .filter(e => e.tool === 'complete_step' && e.input?.slot !== undefined)
                .map(e => String(e.input!.slot)),
            );

            return (
              <div key={key} className="mb-2 rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-900/10 p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-violet-500 uppercase tracking-wider">
                  <ListChecks className="w-3 h-3" />
                  <span>{t("agent.tools.executionPlan")}</span>
                </div>
                <div className="space-y-2">
                  {steps.map((step) => {
                    const isDone = step.status === "done" || completedByTool.has(step.id);
                    const isActive = !isDone && (step.status === "doing" || step.status === "active");
                    return (
                      <div key={step.id} className="flex gap-2.5 group/step">
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
                        <div className={`flex-1 text-[12px] leading-snug ${isDone ? "text-neutral-400 line-through decoration-neutral-300 dark:decoration-neutral-700" : "text-neutral-700 dark:text-neutral-300"}`}>
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
              assumptions: { icon: <HelpCircle className="w-3 h-3" />, label: t("agent.preThinkSections.assumptions"), color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-900/20" },
              risks: { icon: <ShieldCheck className="w-3 h-3" />, label: t("agent.preThinkSections.risks"), color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
              strategy: { icon: <Lightbulb className="w-3 h-3" />, label: t("agent.preThinkSections.strategy"), color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
              raw: { icon: <Brain className="w-3 h-3" />, label: t("agent.preThinkSections.thinking"), color: "text-neutral-500", bg: "bg-neutral-50 dark:bg-neutral-800/50" },
            };
            return (
              <div key={key} className="mb-1 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleMarkup(key)}
                  className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-neutral-400 hover:text-violet-500 transition-colors uppercase tracking-wider"
                >
                  <div className="flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5" />
                    <span>{t("agent.tools.preThink")}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 animate-in fade-in slide-in-from-top-1">
                    {sections.map((sec, si) => {
                      const meta = sectionMeta[sec.tag] ?? sectionMeta.raw;
                      return (
                        <div key={si} className={`rounded-lg p-2.5 ${meta.bg}`}>
                          <div className={`flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>
                            {meta.icon}
                            <span>{meta.label}</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">{sec.content}</p>
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

          return (
            <div key={key} className="mb-1 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 p-2 overflow-hidden shadow-sm">
              <button
                onClick={() => toggleMarkup(key)}
                className="w-full flex items-center justify-between text-[10px] font-bold text-neutral-400 hover:text-violet-500 transition-colors uppercase tracking-wider"
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                    {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                  </div>
                  <span>{getAiMarkupLabel(block.tag)}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="mt-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/70 px-3 py-2">
                  <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300 font-mono">
                    {block.content}
                  </pre>
                </div>
              )}
            </div>
          );
        });
        })()}

        {!hasInlineToolChips && doneEvents.length > 0 && (
          <button
            onClick={onToggleTools}
            className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors self-start"
          >
            <div className="flex items-center gap-0.5">
              {doneEvents.slice(0, 3).map((e, i) => {
                const meta = getToolMeta(t, e.tool);
                return (
                  <span key={i} className={meta.color}>
                    {meta.icon}
                  </span>
                );
              })}
              {count > 3 && <span className="text-[10px] text-neutral-400">+{count - 3}</span>}
            </div>
            <span>{actionsLabel}</span>
            {toolsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        {!hasInlineToolChips && toolsExpanded && doneEvents.length > 0 && (
          <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 space-y-1.5">
            {doneEvents.map((e, i) => {
              const meta = getToolMeta(t, e.tool);
              const inputPreview = formatToolInput(e.input);
              return (
                <div key={i} className="flex items-center gap-2 text-[11px] min-w-0">
                  {e.success === false ? (
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  )}
                  <span className={`${meta.color} shrink-0`}>{meta.icon}</span>
                  <span className="text-neutral-700 dark:text-neutral-300 font-mono">
                    {formatToolName(e.tool)}
                  </span>
                  {inputPreview && (
                    <span className="text-neutral-400 truncate min-w-0">
                      {inputPreview}
                    </span>
                  )}
                  {e.durationMs !== undefined && (
                    <span className="text-neutral-400 ml-1.5 shrink-0">{e.durationMs}ms</span>
                  )}

                  <div className="group/info relative ml-auto shrink-0">
                    <Info className="w-2.5 h-2.5 text-neutral-400 hover:text-violet-500 cursor-help transition-colors" />
                    <div className="absolute bottom-full right-0 mb-1 w-[280px] p-2 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50 pointer-events-auto">
                      <div className="text-[9px] font-mono text-violet-400 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Wrench className="w-2 h-2" />
                          TOOL CALL RAW
                        </span>
                        <button
                          onClick={(clickEvt) => {
                            clickEvt.stopPropagation();
                            navigator.clipboard.writeText(JSON.stringify(e.input || {}, null, 2));
                          }}
                          className="p-1 hover:bg-neutral-800 rounded transition-colors text-neutral-400 hover:text-violet-400"
                          title="Copy JSON"
                        >
                          <Copy className="w-2 h-2" />
                        </button>
                      </div>
                      <pre className="text-[9px] font-mono text-neutral-300 whitespace-pre-wrap break-all overflow-y-auto max-h-[160px] custom-scrollbar">
                        {JSON.stringify(e.input || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!hasInlineToolChips && message.toolResults && message.toolResults.length > 0 && (
          <ToolResultCards t={t} results={message.toolResults} />
        )}

        <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed">
          {visibleText ? (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:bg-neutral-200 dark:prose-pre:bg-neutral-700 prose-code:text-violet-600 dark:prose-code:text-violet-400 prose-code:bg-violet-50 dark:prose-code:bg-violet-900/20 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown>{visibleText}</ReactMarkdown>
            </div>
          ) : message.isStreaming && !hasPartialToolCall ? (
            <div className="flex items-center gap-1.5 py-1 italic text-muted-foreground/60 animate-pulse">
              <Bot className="w-3.5 h-3.5" />
              <span className="text-[11px]">{t("agent.header.thinking")}</span>
            </div>
          ) : null}
          {hasPartialToolCall && <BuildingToolCallChip t={t} />}
        </div>

        {!message.isStreaming && visibleText && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pl-0.5">
            <ActionButton onClick={onCopy} title={t("agent.messages.copy")}>
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </ActionButton>
            <ActionButton
              onClick={() => onThumb("up")}
              title={t("agent.messages.thumbsUp")}
              active={message.thumb === "up"}
              activeClass="text-emerald-500"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </ActionButton>
            <ActionButton
              onClick={() => onThumb("down")}
              title={t("agent.messages.thumbsDown")}
              active={message.thumb === "down"}
              activeClass="text-red-400"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </ActionButton>
            {isLast && (
              <ActionButton onClick={onRetry} title={t("agent.messages.retry")}>
                <RotateCcw className="w-3.5 h-3.5" />
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ThinkingBubble ───────────────────────────────────────────────────────────

function ThinkingBubble({ t, events }: { t: TFn; events: ToolEvent[] }) {
  const running = [...events].reverse().find((e) => e.phase === "start");
  const meta = running ? getToolMeta(t, running.tool) : null;

  return (
    <div className="flex justify-start gap-2">
      <div className="shrink-0">
        <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
        </div>
      </div>
      <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-neutral-100 dark:bg-neutral-800">
        {meta ? (
          <div className="flex items-center gap-2 text-xs text-violet-500 dark:text-violet-400">
            <span className={meta.color}>{meta.icon}</span>
            <span className="font-mono">{formatToolName(running!.tool)}</span>
            <Loader2 className="w-3 h-3 animate-spin" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

function ActionButton({
  onClick,
  title,
  children,
  active = false,
  activeClass = "",
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors ${active
        ? activeClass
        : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        }`}
    >
      {children}
    </button>
  );
}

// ─── ToolResultCards ──────────────────────────────────────────────────────────

function ToolResultCards({ t, results }: { t: TFn; results: ToolResult[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {results.map((r, i) => {
        const meta = getToolMeta(t, r.tool);
        const nestedTag = typeof r.data.tag === "object" && r.data.tag !== null ? r.data.tag as Record<string, unknown> : null;
        const title =
          (r.data.title as string) ||
          (r.data.name as string) ||
          (nestedTag?.name as string) ||
          (r.data.id as string) ||
          (r.data.tagId as string) ||
          (r.data.cardId as string) ||
          formatToolName(r.tool);
        const subtitle =
          (r.data.listName as string) ||
          (r.data.boardName as string) ||
          (nestedTag?.id as string) ||
          (r.data.description as string) ||
          null;

        return (
          <div
            key={i}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/60 text-xs"
          >
            <span className={`${meta.color} shrink-0`}>{meta.icon}</span>
            <div className="min-w-0">
              <p className="font-medium text-neutral-800 dark:text-neutral-200 truncate">{title}</p>
              {subtitle && <p className="text-neutral-400 truncate">{subtitle}</p>}
            </div>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto shrink-0" />
          </div>
        );
      })}
    </div>
  );
}

// ─── AgentToolCallChip — resolves AgentMessage events → ToolCallChip props ───

function AgentToolCallChip({
  t,
  data,
  message,
  occurrenceIndex = 0,
  onToolApproval,
}: {
  t: TFn;
  data: any;
  message: AgentMessage;
  /** Which occurrence of this tool name this chip represents (0-based). Used to disambiguate when the same tool runs multiple times. */
  occurrenceIndex?: number;
  onToolApproval?: (toolName: string, input: any, decision: 'approved' | 'rejected', toolId?: string) => void;
}) {
  const events = message.toolEvents ?? [];
  const state = resolveToolCallRenderState(data, events, occurrenceIndex);

  return (
    <ToolCallChip
      t={t}
      toolName={data.name ?? ""}
      input={state.input}
      isDone={state.isDone}
      isRunning={state.isRunning}
      isError={state.isError}
      needsApproval={state.needsApproval}
      output={state.output}
      onApprove={onToolApproval ? () => onToolApproval(data.name, data.input, 'approved', data.id) : undefined}
      onReject={onToolApproval  ? () => onToolApproval(data.name, data.input, 'rejected', data.id) : undefined}
    />
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  t,
  entityType,
  entityCfg,
  suggestions,
  onSuggestionClick,
}: {
  t: TFn;
  entityType?: AgentEntityScope;
  entityCfg: EntityMeta | null;
  suggestions: string[];
  onSuggestionClick?: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-6 px-2">
      <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
        <Bot className="w-6 h-6 text-violet-500" />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {t("agent.emptyState.title")}
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          {entityCfg
            ? t("agent.emptyState.fullAccess", { entity: entityCfg.label.toLowerCase() })
            : t("agent.emptyState.teamAccess")}
        </p>
      </div>

      {entityCfg && (
        <div className="w-full grid grid-cols-2 gap-1.5">
          {entityCfg.capabilities.map((cap) => (
            <div
              key={cap}
              className={`text-[11px] px-2.5 py-1.5 rounded-lg ${entityCfg.bg} ${entityCfg.color} flex items-center gap-1`}
            >
              <CheckCircle2 className="w-3 h-3 shrink-0 opacity-70" />
              <span>{cap}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 w-full">
        {suggestions.map((tip) => (
          <button
            key={tip}
            className="text-left text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-violet-300 dark:hover:border-violet-600 transition-colors"
            onClick={() => onSuggestionClick?.(tip)}
          >
            {tip}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatToolName(tool: string): string {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatToolInput(input?: Record<string, unknown>): string {
  if (!input) return "";
  const fields = ["name", "title", "cardId", "tagId", "boardId", "documentId", "meshId", "scriptId", "query", "scopeType"];
  const parts = fields
    .filter((key) => input[key] !== undefined && input[key] !== null && String(input[key]).trim())
    .slice(0, 3)
    .map((key) => `${key}:${String(input[key]).slice(0, 32)}`);
  return parts.length ? parts.join(" ") : "";
}
