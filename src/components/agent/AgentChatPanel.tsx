"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import {
  Bot, Send, Loader2, X, Trash2, Wrench, CheckCircle2, XCircle, Zap,
  Copy, ThumbsUp, ThumbsDown, RotateCcw, History, ChevronDown, ChevronUp,
  Layout, FileText, Code, Users, Search, List, Play, PlusCircle,
  ArrowRight, Edit2, LayoutDashboard, Grid3X3, Sparkles, Check,
  Clock, MessageSquare,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAgentChat, AgentMessage, ToolEvent, ToolResult } from "@/hooks/use-agent-chat";
import { AgentEntityScope, AgentConversation, listAgentConversations } from "@/lib/api/agent";
import { ReferenceTokenInput } from "@/components/ui/reference-token-input";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import type { ResolverContext } from "@/lib/reference-resolver";
import type { DocumentSummary } from "@/lib/api/documents";
import type { WorkspaceMemberLike } from "@/lib/workspace-members";

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
    conversationId,
  } = useAgentChat({ teamId, entityType, entityId, resolverContext: builtContext });

  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    navigator.clipboard.writeText(text).catch(() => {});
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
    <div className={`flex flex-col h-full bg-white dark:bg-neutral-900 relative ${className}`}>


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
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors text-sm ${
                    conv.id === conversationId
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
      <div className="flex-1 overflow-y-hidden px-4 py-4 space-y-4 min-h-0">
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
        <div className="flex items-end gap-2">
          <ReferenceTokenInput
            value={inputValue}
            onChange={setInputValue}
            placeholder={t("agent.input.placeholder")}
            documents={documents}
            boards={boards}
            users={users}
            cards={cards}
            onSubmit={() => sendMessage()}
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
              onClick={() => sendMessage()}
              disabled={!inputValue.trim()}
              className="shrink-0 p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="mt-1 text-[10px] text-neutral-400 text-center">{t("agent.input.hint")}</p>
      </div>
    </div>
  );
}

// ─── UserMessage ──────────────────────────────────────────────────────────────

function UserMessage({
  message,
  onCopy,
  copied,
  copyLabel,
}: {
  message: AgentMessage;
  onCopy: () => void;
  copied: boolean;
  copyLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 group">
      <div className="max-w-[85%] flex flex-col items-end gap-1">
        <div className="relative px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-violet-600 text-white text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{message.text}</p>
          <button
            onClick={onCopy}
            className="absolute -left-7 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-all"
            title={copyLabel}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
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
}) {
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
        {doneEvents.length > 0 && (
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

        {toolsExpanded && doneEvents.length > 0 && (
          <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 space-y-1.5">
            {doneEvents.map((e, i) => {
              const meta = getToolMeta(t, e.tool);
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  {e.success === false ? (
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  )}
                  <span className={`${meta.color} shrink-0`}>{meta.icon}</span>
                  <span className="text-neutral-700 dark:text-neutral-300 font-mono">
                    {formatToolName(e.tool)}
                  </span>
                  {e.durationMs !== undefined && (
                    <span className="text-neutral-400 ml-auto shrink-0">{e.durationMs}ms</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {message.toolResults && message.toolResults.length > 0 && (
          <ToolResultCards t={t} results={message.toolResults} />
        )}

        <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed">
          {message.text ? (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:bg-neutral-200 dark:prose-pre:bg-neutral-700 prose-code:text-violet-600 dark:prose-code:text-violet-400 prose-code:bg-violet-50 dark:prose-code:bg-violet-900/20 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown>{message.text}</ReactMarkdown>
            </div>
          ) : message.isStreaming ? (
            <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse rounded-sm" />
          ) : null}
        </div>

        {!message.isStreaming && message.text && (
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
      className={`p-1 rounded transition-colors ${
        active
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
        const title =
          (r.data.title as string) ||
          (r.data.name as string) ||
          (r.data.id as string) ||
          formatToolName(r.tool);
        const subtitle =
          (r.data.listName as string) ||
          (r.data.boardName as string) ||
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
