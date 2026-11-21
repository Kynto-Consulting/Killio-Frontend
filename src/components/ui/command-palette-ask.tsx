"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckSquare,
  FileText,
  Grid3X3,
  LayoutDashboard,
  Loader2,
  Maximize2,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  WifiOff,
  X,
  Check,
} from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { useBrandName } from "@/components/providers/tenant-provider";
import { useAgentChat, type AgentMessage, type ToolEvent } from "@/hooks/use-agent-chat";
import {
  deleteAgentConversation,
  getAiPaletteSettings,
  updateAgentConversation,
  type AgentConversationMode,
  type AgentStreamEvent,
  type AiPaletteSettings,
} from "@/lib/api/agent";
import { getTeamAiUsage } from "@/lib/api/contracts";
import { parseAiMarkup } from "@/lib/ai-markup";
import { buildAssistantRender } from "@/lib/agent-render";
import { AssistantMessageContent } from "@/components/agent/assistant-message-content";
import { toast } from "@/lib/toast";
import { fmt, getAskCopy, type AskCopy } from "@/lib/palette-ask/copy";
import { classifyAskError, shouldShowUsageNotice, type AskErrorKind } from "@/lib/palette-ask/errors";
import {
  describeToolInput,
  extractSources,
  humanizeTool,
  toolStatusKind,
  type PaletteSource,
} from "@/lib/palette-ask/sources";

export type AskPageScope = { type: "board" | "document" | "mesh"; id: string; name?: string | null };

type PaletteAskPanelProps = {
  teamId: string;
  /** The question typed in the palette. Empty = open ready to type. */
  initialQuestion: string;
  /** The page the user has open, offered as scope ("Usando: …"). */
  pageScope: AskPageScope | null;
  /** Esc: back to the command list, keeping the draft. */
  onBack: () => void;
  onClose: () => void;
  /** ⤢: continue this same conversation in the full chat panel. */
  onExpand: (conversationId: string) => void;
};

type AskError = { kind: AskErrorKind; message: string };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PaletteAskPanel({ teamId, initialQuestion, pageScope, onBack, onClose, onExpand }: PaletteAskPanelProps) {
  const { accessToken } = useSession();
  const { locale } = useI18n();
  const brand = useBrandName();
  const copy = useMemo(() => getAskCopy(locale), [locale]);

  const [settings, setSettings] = useState<AiPaletteSettings | null>(null);
  const [mode, setMode] = useState<AgentConversationMode>("ephemeral");
  const [ready, setReady] = useState(false);
  const [scopeOn, setScopeOn] = useState(Boolean(pageScope));
  const [error, setError] = useState<AskError | null>(null);
  const [usagePercent, setUsagePercent] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [convId, setConvId] = useState<string | undefined>(undefined);
  const [convMode, setConvMode] = useState<AgentConversationMode | undefined>(undefined);
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>({});

  const rootRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentInitialRef = useRef(false);
  const handoffRef = useRef(false);
  const modeRef = useRef(mode);
  const convIdRef = useRef<string | undefined>(undefined);
  const tokenRef = useRef<string | null>(accessToken ?? null);
  modeRef.current = mode;
  convIdRef.current = convId;
  tokenRef.current = accessToken ?? null;

  const pageContext = scopeOn && pageScope ? { type: pageScope.type, id: pageScope.id } : undefined;

  const handleStreamEvent = useCallback((event: AgentStreamEvent) => {
    if (typeof event.conversationId === "string" && event.conversationId) setConvId(event.conversationId);
    if (event.mode === "saved" || event.mode === "ephemeral") setConvMode(event.mode);
    if (typeof event.usagePercent === "number") setUsagePercent(event.usagePercent);
    if (event.type === "error") {
      const kind = classifyAskError(
        { code: event.code, status: event.status, message: event.message },
        typeof navigator === "undefined" ? true : navigator.onLine,
      );
      setError({ kind, message: event.message });
    }
  }, []);

  const chat = useAgentChat({
    teamId,
    mode,
    source: "palette",
    pageContext,
    onStreamEvent: handleStreamEvent,
  });
  const { messages, isLoading, activeToolEvents, sendMessage, retryMessage, sendToolApproval, cancel, inputValue, setInputValue } = chat;

  // Team setting (default mode / lock) and credit balance, before the first send.
  useEffect(() => {
    if (!accessToken || !teamId) return;
    let alive = true;
    (async () => {
      const [s, usage] = await Promise.all([
        getAiPaletteSettings(teamId, accessToken),
        getTeamAiUsage(teamId, accessToken).catch(() => null),
      ]);
      if (!alive) return;
      setSettings(s);
      setMode(s.defaultMode);
      if (usage && usage.remaining <= 0) setError({ kind: "no_credits", message: "" });
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, teamId]);

  const noCredits = error?.kind === "no_credits" || error?.kind === "cap_reached";

  const submit = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || isLoading) return;
      if (error?.kind === "no_credits" || error?.kind === "cap_reached") return;
      setError(null);
      sendMessage(value);
    },
    [isLoading, error, sendMessage],
  );

  // The question typed in the palette goes out as soon as the mode is known.
  useEffect(() => {
    if (!ready || sentInitialRef.current) return;
    sentInitialRef.current = true;
    if (initialQuestion.trim()) submit(initialQuestion);
  }, [ready, initialQuestion, submit]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, activeToolEvents, error]);

  // Closing (or going back) discards an ephemeral conversation, unless it was handed to the full chat.
  useEffect(() => {
    return () => {
      cancel();
      const id = convIdRef.current;
      const token = tokenRef.current;
      if (id && token && modeRef.current === "ephemeral" && !handoffRef.current) {
        void deleteAgentConversation(id, token);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── derived ────────────────────────────────────────────────────────────────

  const lastAssistant = useMemo(() => [...messages].reverse().find((m) => m.role === "assistant"), [messages]);
  const lastUserText = useMemo(() => [...messages].reverse().find((m) => m.role === "user")?.text ?? "", [messages]);

  const pendingApprovals = useMemo(() => {
    if (!lastAssistant) return [] as Array<{ key: string; event: ToolEvent }>;
    return (lastAssistant.toolEvents ?? [])
      .map((event, index) => ({ key: event.id ?? `${event.tool}#${index}`, event }))
      .filter(({ event }) => event.phase === "waiting_for_approval");
  }, [lastAssistant]);

  const hasUndecided = pendingApprovals.some(({ key }) => !decisions[key]);

  const emptyResult = useMemo(() => {
    if (isLoading || error || !lastAssistant || lastAssistant.isStreaming || hasUndecided) return false;
    if (pendingApprovals.length > 0) return false;
    // A reply that is only a brick/image is not empty.
    return !buildAssistantRender(lastAssistant.text).hasContent && (lastAssistant.toolEvents ?? []).every((e) => e.phase !== "done" || e.success === false);
  }, [isLoading, error, lastAssistant, hasUndecided, pendingApprovals.length]);

  const runningTool = useMemo(() => [...activeToolEvents].reverse().find((e) => e.phase === "start"), [activeToolEvents]);

  const modeLocked = settings?.lockMode === true;
  const savedAlready = convMode === "saved" || (mode === "saved" && Boolean(convId));

  const chooseMode = async (next: AgentConversationMode) => {
    if (modeLocked || next === mode) return;
    if (next === "ephemeral") {
      if (savedAlready) return; // a saved conversation cannot be made ephemeral again
      setMode("ephemeral");
      return;
    }
    if (!convId || !accessToken) {
      setMode("saved");
      return;
    }
    const ok = await updateAgentConversation(convId, { mode: "saved" }, accessToken);
    if (ok) {
      setMode("saved");
      setConvMode("saved");
      toast(copy.mode.savedNow, "success");
    } else {
      toast(copy.mode.saveError, "error");
    }
  };

  const decide = (key: string, event: ToolEvent, decision: "approved" | "rejected") => {
    if (isLoading || decisions[key]) return;
    setDecisions((prev) => ({ ...prev, [key]: decision }));
    void sendToolApproval(event.tool, event.input ?? {}, decision, event.id);
  };

  const expand = () => {
    if (!convId || isLoading) return;
    handoffRef.current = true;
    onExpand(convId);
  };

  const onRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const nodes = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !rootRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !rootRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const hasAnswerArea = messages.length > 0 || isLoading || Boolean(error);
  const inputDisabled = isLoading || noCredits || hasUndecided || !teamId;

  useEffect(() => {
    if (!inputDisabled) inputRef.current?.focus();
  }, [inputDisabled]);

  return (
    <div
      ref={rootRef}
      onKeyDown={onRootKeyDown}
      className="flex w-full flex-col max-h-[min(80vh,720px)] max-sm:h-[100dvh] max-sm:max-h-none"
    >
      {/* header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          title={copy.panel.back}
          aria-label={copy.panel.back}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        <span className="text-sm font-semibold text-foreground">{fmt(copy.panel.title, { brand })}</span>

        <div className="ml-auto flex items-center gap-1.5">
          <ModeSwitch
            copy={copy}
            mode={mode}
            locked={modeLocked}
            ephemeralDisabled={savedAlready}
            onChoose={chooseMode}
          />
          <button
            type="button"
            onClick={expand}
            disabled={!convId || isLoading}
            title={copy.panel.expand}
            aria-label={copy.panel.expand}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title={copy.panel.close}
            aria-label={copy.panel.close}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {pageScope && scopeOn ? (
          <div className="flex w-full items-center">
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs text-foreground">
              <span className="truncate">{fmt(copy.scope.using, { page: scopeLabel(copy, pageScope) })}</span>
              <button
                type="button"
                onClick={() => setScopeOn(false)}
                title={copy.scope.remove}
                aria-label={copy.scope.remove}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-accent/20 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        ) : null}
      </div>

      {/* answer area */}
      <div className="min-h-[120px] flex-1 overflow-y-auto px-4 py-3">
        {!teamId ? <Banner tone="info" icon={<AlertCircle className="h-4 w-4" />} text={copy.panel.noTeam} /> : null}

        <div role="log" aria-live="polite" aria-relevant="additions text" aria-label={copy.panel.answerLabel} className="space-y-3">
          {messages.map((message) =>
            message.role === "user" ? (
              <UserLine key={message.id} copy={copy} message={message} />
            ) : (
              <AnswerBlock
                key={message.id}
                copy={copy}
                brand={brand}
                message={message}
                decisions={decisions}
                isLast={message.id === lastAssistant?.id}
                busy={isLoading}
                onDecide={decide}
                onNavigate={onClose}
              />
            ),
          )}
        </div>

        <div role="status" aria-live="polite" className="mt-2">
          {isLoading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
              {runningTool ? statusLabel(copy, runningTool.tool) : copy.status.thinking}
            </p>
          ) : null}
        </div>

        {!online ? <Banner tone="warn" icon={<WifiOff className="h-4 w-4" />} text={copy.state.offline} /> : null}

        {error ? (
          <ErrorState
            copy={copy}
            error={error}
            onRetry={lastUserText ? () => { setError(null); retryMessage(); } : undefined}
          />
        ) : null}

        {!error && shouldShowUsageNotice(usagePercent) ? (
          <Banner tone="warn" icon={<AlertCircle className="h-4 w-4" />} text={fmt(copy.state.usageNotice, { percent: Math.round(usagePercent ?? 0) })} />
        ) : null}

        {emptyResult ? (
          <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            <p>{copy.state.empty}</p>
            {lastUserText ? (
              <button
                type="button"
                onClick={() => submit(fmt(copy.state.webQuery, { question: lastUserText }))}
                className="mt-2 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent/10"
              >
                {copy.state.searchWeb}
              </button>
            ) : null}
          </div>
        ) : null}

        {!hasAnswerArea && !isLoading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{copy.panel.firstInput}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* follow-up input */}
      <form
        className="border-t border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const text = inputValue;
          if (!text.trim()) return;
          setInputValue("");
          submit(text);
        }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={inputDisabled}
            placeholder={messages.length === 0 ? copy.panel.firstInput : copy.panel.followUp}
            aria-label={messages.length === 0 ? copy.panel.firstInput : copy.panel.followUp}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/40 disabled:opacity-60"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={cancel}
              title={copy.panel.stop}
              aria-label={copy.panel.stop}
              className="rounded-md border border-border p-2 text-foreground hover:bg-accent/10"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={inputDisabled || !inputValue.trim()}
              title={copy.panel.send}
              aria-label={copy.panel.send}
              className="rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{copy.panel.footer}</p>
      </form>
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function scopeLabel(copy: AskCopy, scope: AskPageScope): string {
  if (scope.type === "board") {
    return scope.name ? fmt(copy.scope.board, { name: scope.name }) : copy.scope.boardUnnamed;
  }
  return scope.type === "document" ? copy.scope.document : copy.scope.mesh;
}

function statusLabel(copy: AskCopy, tool: string): string {
  const kind = toolStatusKind(tool);
  if (kind === "searching") return copy.status.searching;
  if (kind === "querying") return copy.status.querying;
  return fmt(copy.status.running, { tool: humanizeTool(tool) });
}

function ModeSwitch({
  copy,
  mode,
  locked,
  ephemeralDisabled,
  onChoose,
}: {
  copy: AskCopy;
  mode: AgentConversationMode;
  locked: boolean;
  ephemeralDisabled: boolean;
  onChoose: (mode: AgentConversationMode) => void;
}) {
  const options: Array<{ id: AgentConversationMode; label: string; hint: string; disabled: boolean }> = [
    { id: "ephemeral", label: copy.mode.ephemeral, hint: copy.mode.ephemeralHint, disabled: locked || ephemeralDisabled },
    { id: "saved", label: copy.mode.saved, hint: copy.mode.savedHint, disabled: locked },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={copy.mode.label}
      title={locked ? copy.mode.locked : undefined}
      className="inline-flex overflow-hidden rounded-md border border-border text-xs"
    >
      {options.map((opt) => {
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled && !active}
            aria-disabled={opt.disabled}
            title={locked ? copy.mode.locked : opt.hint}
            onClick={() => onChoose(opt.id)}
            className={`px-2.5 py-1 transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
            } ${opt.disabled && !active ? "cursor-not-allowed opacity-50" : ""} ${locked && active ? "cursor-not-allowed" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Banner({ tone, icon, text }: { tone: "info" | "warn" | "error"; icon: React.ReactNode; text: string }) {
  const toneClass =
    tone === "error"
      ? "border-destructive/40 bg-destructive/10"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-border bg-muted/40";
  return (
    <div className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-foreground ${toneClass}`}>
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function ErrorState({ copy, error, onRetry }: { copy: AskCopy; error: AskError; onRetry?: () => void }) {
  const text =
    error.kind === "no_credits"
      ? copy.state.noCredits
      : error.kind === "cap_reached"
        ? copy.state.capReached
        : error.kind === "rate_limit"
          ? copy.state.rateLimit
          : error.kind === "offline"
            ? copy.state.offline
            : copy.state.error;
  const retryable = error.kind === "rate_limit" || error.kind === "offline" || error.kind === "unknown";
  return (
    <div role="alert" className="mt-2">
      <Banner tone="error" icon={<AlertCircle className="h-4 w-4" />} text={text} />
      {retryable && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent/10"
        >
          {copy.state.retry}
        </button>
      ) : null}
    </div>
  );
}

function UserLine({ copy, message }: { copy: AskCopy; message: AgentMessage }) {
  const { blocks } = useMemo(() => parseAiMarkup(message.text), [message.text]);
  const text = blocks.filter((b) => b.tag === "text").map((b) => b.content).join("\n").trim() || message.text;
  return (
    <p className="text-sm text-foreground">
      <span className="font-semibold text-muted-foreground">{copy.panel.you}: </span>
      {text}
    </p>
  );
}

const SOURCE_STYLE: Record<PaletteSource["kind"], { Icon: typeof FileText }> = {
  board: { Icon: LayoutDashboard },
  document: { Icon: FileText },
  mesh: { Icon: Grid3X3 },
  card: { Icon: CheckSquare },
};

function SourceChips({ copy, sources, onNavigate }: { copy: AskCopy; sources: PaletteSource[]; onNavigate: () => void }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{copy.panel.sources}:</span>
      {sources.map((s) => {
        const { Icon } = SOURCE_STYLE[s.kind];
        const body = (
          <>
            <Icon className="h-3 w-3 shrink-0 text-primary" aria-hidden />
            <span className="max-w-[200px] truncate">{s.title}</span>
          </>
        );
        const cls = "inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-foreground";
        return s.href ? (
          <Link
            key={`${s.kind}:${s.id}`}
            href={s.href}
            onClick={onNavigate}
            title={fmt(copy.panel.openSource, { title: s.title })}
            className={`${cls} hover:bg-accent/10`}
          >
            {body}
          </Link>
        ) : (
          <span key={`${s.kind}:${s.id}`} className={cls}>
            {body}
          </span>
        );
      })}
    </div>
  );
}

const markdownComponents = {
  table: ({ node: _n, ...props }: any) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  thead: ({ node: _n, ...props }: any) => <thead className="bg-muted/60" {...props} />,
  th: ({ node: _n, ...props }: any) => <th className="border-b border-border px-2.5 py-1.5 text-left font-semibold text-foreground" {...props} />,
  td: ({ node: _n, ...props }: any) => <td className="border-b border-border/60 px-2.5 py-1.5 text-foreground" {...props} />,
};

function AnswerBlock({
  copy,
  brand,
  message,
  decisions,
  isLast,
  busy,
  onDecide,
  onNavigate,
}: {
  copy: AskCopy;
  brand: string;
  message: AgentMessage;
  decisions: Record<string, "approved" | "rejected">;
  isLast: boolean;
  busy: boolean;
  onDecide: (key: string, event: ToolEvent, decision: "approved" | "rejected") => void;
  onNavigate: () => void;
}) {
  const parsed = useMemo(() => parseAiMarkup(message.text), [message.text]);
  const render = useMemo(() => buildAssistantRender(message.text, { streaming: message.isStreaming }), [message.text, message.isStreaming]);
  const text = render.text;

  const sources = useMemo(() => {
    const fromTools = extractSources(message.toolEvents, message.toolResults);
    const seen = new Set(fromTools.map((s) => `${s.kind}:${s.id}`));
    for (const block of parsed.blocks) {
      if (block.tag !== "asset") continue;
      const { type, src, title } = block.attributes ?? {};
      const kind = type === "document" ? "document" : type === "kanban" ? "board" : type === "mesh" ? "mesh" : null;
      if (!kind || !src || seen.has(`${kind}:${src}`)) continue;
      seen.add(`${kind}:${src}`);
      fromTools.push({ kind, id: src, title: title || src.slice(0, 8), href: kind === "document" ? `/d/${src}` : kind === "board" ? `/b/${src}` : `/m/${src}` });
    }
    return fromTools.slice(0, 8);
  }, [message.toolEvents, message.toolResults, parsed.blocks]);

  const doneTools = (message.toolEvents ?? []).filter((e) => e.phase === "done");
  const approvals = (message.toolEvents ?? [])
    .map((event, index) => ({ key: event.id ?? `${event.tool}#${index}`, event }))
    .filter(({ event }) => event.phase === "waiting_for_approval");

  // A failed turn is shown as the error state (with Reintentar), not as a bubble.
  if (text.startsWith("Error:") && approvals.length === 0 && doneTools.length === 0) return null;
  if (message.isStreaming && !render.hasContent && doneTools.length === 0 && approvals.length === 0) return null;

  return (
    <div className="flex gap-2">
      <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        {doneTools.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {doneTools.map((e, i) => (
              <span
                key={`${e.id ?? e.tool}-${i}`}
                title={fmt(copy.panel.toolDone, { tool: humanizeTool(e.tool) })}
                className={`inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] ${
                  e.success === false ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {e.success === false ? <X className="h-3 w-3" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
                <span className="font-mono">{humanizeTool(e.tool)}</span>
              </span>
            ))}
          </div>
        ) : null}

        {render.hasContent ? (
          <AssistantMessageContent
            text={message.text}
            isStreaming={message.isStreaming}
            variant="compact"
            markdownComponents={markdownComponents}
          />
        ) : null}

        {!message.isStreaming ? <SourceChips copy={copy} sources={sources} onNavigate={onNavigate} /> : null}

        {approvals.map(({ key, event }) => (
          <ApprovalCard
            key={key}
            copy={copy}
            brand={brand}
            event={event}
            decision={decisions[key]}
            interactive={isLast && !busy}
            onApprove={() => onDecide(key, event, "approved")}
            onReject={() => onDecide(key, event, "rejected")}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A write the agent wants to make. It lists every field of the tool input and
 * nothing happens until the person presses Aprobar. Focus lands on Rechazar so
 * a stray Enter can never approve.
 */
function ApprovalCard({
  copy,
  brand,
  event,
  decision,
  interactive,
  onApprove,
  onReject,
}: {
  copy: AskCopy;
  brand: string;
  event: ToolEvent;
  decision?: "approved" | "rejected";
  interactive: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const rows = useMemo(() => describeToolInput(event.input), [event.input]);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const pending = !decision && interactive;

  useEffect(() => {
    if (pending) rejectRef.current?.focus();
  }, [pending]);

  return (
    <section
      aria-label={fmt(copy.approval.title, { brand })}
      className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
    >
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
        {fmt(copy.approval.title, { brand })}
      </h3>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">{copy.approval.action}</dt>
          <dd className="font-mono text-foreground">{humanizeTool(event.tool)}</dd>
        </div>
        {rows.map((row) => (
          <div key={row.key} className="flex gap-2">
            <dt className="w-24 shrink-0 truncate text-muted-foreground" title={row.key}>
              {row.key}
            </dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground [overflow-wrap:anywhere]">{row.value}</dd>
          </div>
        ))}
      </dl>

      {decision ? (
        <p className="mt-2 text-xs text-muted-foreground">{decision === "approved" ? copy.approval.approved : copy.approval.rejected}</p>
      ) : (
        <>
          <p className="mt-2 text-[11px] text-muted-foreground">{copy.approval.notice}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={!interactive}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Check className="h-3 w-3" aria-hidden />
              {copy.approval.approve}
            </button>
            <button
              ref={rejectRef}
              type="button"
              onClick={onReject}
              disabled={!interactive}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent/10 disabled:opacity-50"
            >
              <X className="h-3 w-3" aria-hidden />
              {copy.approval.reject}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
