"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "@/components/providers/session-provider";
import { streamAgentChat, AgentEntityScope, AgentStreamEvent, getAgentMessages } from "@/lib/api/agent";
import { buildAiMessageWithReferenceContext } from "@/lib/reference-ai-context";
import type { ResolverContext } from "@/lib/reference-resolver";

export interface ToolResult {
  tool: string;
  data: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolEvents?: ToolEvent[];
  toolResults?: ToolResult[];
  toolsUsed?: string[];
  isStreaming?: boolean;
  thumb?: "up" | "down";
  toolExecution?: Array<{
    toolName: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    success: boolean;
    durationMs: number;
    durationSeconds: string;
    phase: string;
    timestamp: string;
  }>;
  /** Marks a compressed-history checkpoint — rendered as a divider pill, not a bubble. */
  kind?: "checkpoint";
  /** For checkpoint: how many messages it summarized. */
  coversCount?: number;
}

export interface ToolEvent {
  id?: string;
  tool: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  success?: boolean;
  durationMs?: number;
  phase: "start" | "done" | "waiting_for_approval";
}

export interface ToolCallRenderState {
  matchedEvent?: ToolEvent;
  isDone: boolean;
  isRunning: boolean;
  isError: boolean;
  needsApproval: boolean;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export function resolveToolCallRenderState(
  data: { id?: string; name?: string; input?: Record<string, unknown>; output?: Record<string, unknown> },
  events: ToolEvent[],
  occurrenceIndex = 0,
): ToolCallRenderState {
  const searchName = String(data.name ?? "").toLowerCase();
  const searchId = String(data.id ?? "").trim();

  if (searchId) {
    const matchedEvent = events.find((event) => event.id === searchId);
    const isDone = matchedEvent?.phase === "done";
    const isRunning = matchedEvent?.phase === "start";
    const needsApproval = matchedEvent?.phase === "waiting_for_approval";
    return {
      matchedEvent,
      isDone,
      isRunning,
      isError: matchedEvent?.success === false,
      needsApproval,
      input: matchedEvent?.input ?? data.input,
      output: matchedEvent?.output ?? data.output,
    };
  }

  const allDoneForTool = events.filter((event) => event.tool?.toLowerCase() === searchName && event.phase === "done");
  const doneEvent = allDoneForTool[occurrenceIndex] ?? allDoneForTool[allDoneForTool.length - 1];
  const allStartForTool = events.filter((event) => event.tool?.toLowerCase() === searchName && event.phase === "start");
  const waitingApproval = events.some((event) => event.tool?.toLowerCase() === searchName && event.phase === "waiting_for_approval");

  return {
    matchedEvent: doneEvent,
    isDone: !!doneEvent,
    isRunning: !doneEvent && allStartForTool.length > occurrenceIndex,
    isError: doneEvent?.success === false,
    needsApproval: waitingApproval,
    input: doneEvent?.input ?? data.input,
    output: doneEvent?.output ?? data.output,
  };
}

export interface UseAgentChatOptions {
  teamId: string;
  entityType?: AgentEntityScope;
  entityId?: string;
  resolverContext?: ResolverContext;
  /** When set, the agent runs in file-production mode pinned to this
   *  scratch-folder slug (used in local workspaces — the agent writes
   *  .kd/.kb/.km/.ks files and emits killio_import chips that the chat
   *  renders, which then land in the local FS handle). */
  workspaceSlug?: string;
}

function parseInvokeParameters(inputStr: string): Record<string, unknown> {
  const source = String(inputStr || "").trim();
  if (!source) return {};

  if (source.startsWith("{") || source.startsWith("[")) {
    try {
      return JSON.parse(source);
    } catch {
      return {};
    }
  }

  const tagPattern = /<([a-zA-Z_][\w-]*)>([\s\S]*?)<\/\1>/g;
  const result: Record<string, unknown> = {};
  let match: RegExpExecArray | null;
  let foundAny = false;

  while ((match = tagPattern.exec(source)) !== null) {
    foundAny = true;
    const key = match[1]!;
    const rawValue = match[2]!.trim();
    const parsedValue = coerceInvokeParameterValue(rawValue);
    const existing = result[key];
    if (existing === undefined) {
      result[key] = parsedValue;
    } else if (Array.isArray(existing)) {
      existing.push(parsedValue);
    } else {
      result[key] = [existing, parsedValue];
    }
  }

  return foundAny ? result : {};
}

function coerceInvokeParameterValue(rawValue: string): unknown {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      // fall through
    }
  }

  if (/<([a-zA-Z_][\w-]*)>([\s\S]*?)<\/\1>/.test(value)) {
    return parseInvokeParameters(value);
  }

  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^null$/i.test(value)) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseInlineToolEvents(content: string): ToolEvent[] {
  const events: ToolEvent[] = [];
  if (!content) return events;

  // Matches both <invoke …>…</invoke> and <async_invoke …>…</async_invoke>.
  const invokeRe = /<(async_)?invoke\s+([^>]+?)>([\s\S]*?)<\/\1?invoke>/gi;
  let m: RegExpExecArray | null;
  const invokeById = new Map<string, { id: string; tool: string; input: Record<string, unknown> }>();

  while ((m = invokeRe.exec(content)) !== null) {
    // m[1] = optional "async_" prefix; m[2] = attrs; m[3] = inner body.
    const attrsStr = m[2] ?? "";
    const inner = m[3] ?? "";
    const nameMatch = attrsStr.match(/name\s*=\s*["']([\w_]+)["']/);
    const idMatch = attrsStr.match(/id\s*=\s*["']([^"']+)["']/);
    if (!nameMatch) continue;
    const toolName = nameMatch[1]!;
    const id = idMatch ? idMatch[1]! : toolName;
    const paramsMatch = inner.match(/<parameters\s*>([\s\S]*?)<\/parameters\s*>/i);
    const inputStr = paramsMatch ? paramsMatch[1].trim() : inner.trim();
    const input = parseInvokeParameters(inputStr);
    // Keep first occurrence — duplicates arise when plan continuation loops
    // re-emit the same invoke IDs; the first one has the correct inline position.
    if (!invokeById.has(id)) {
      invokeById.set(id, { id, tool: toolName, input });
    }
  }

  const eventById = new Map<string, ToolEvent>();

  const statusRe = /<tool_status\s+([^>]+?)\/?>/gi;
  while ((m = statusRe.exec(content)) !== null) {
    const attrsStr = m[1] ?? "";
    const idMatch = attrsStr.match(/id\s*=\s*["']([^"']+)["']/);
    const statusMatch = attrsStr.match(/status\s*=\s*["']([^"']+)["']/);
    const successMatch = attrsStr.match(/success\s*=\s*["']?(true|false)["']?/);
    const durationMatch = attrsStr.match(/duration_ms\s*=\s*["']?(\d+)["']?/);
    const id = idMatch ? idMatch[1]! : "";
    const status = statusMatch ? statusMatch[1]! : "done";
    const success = successMatch ? successMatch[1] === "true" : undefined;
    const durationMs = durationMatch ? parseInt(durationMatch[1], 10) : undefined;
    const invokeMeta = invokeById.get(id);

    const phase: ToolEvent["phase"] =
      status === "waiting_for_approval"
        ? "waiting_for_approval"
        : status === "running" || status === "start"
          ? "start"
          : "done";

    if (!eventById.has(id)) {
      eventById.set(id, {
        id: id || invokeMeta?.id,
        tool: invokeMeta?.tool ?? id,
        input: invokeMeta?.input,
        output: undefined,
        success,
        durationMs,
        phase,
      });
    }
  }

  const outputRe = /<tool_output\s+([^>]+?)>([\s\S]*?)<\/tool_output>/gi;
  while ((m = outputRe.exec(content)) !== null) {
    const attrsStr = m[1] ?? "";
    const data = m[2]?.trim() ?? "";
    const idMatch = attrsStr.match(/id\s*=\s*["']([^"']+)["']/);
    const successMatch = attrsStr.match(/success\s*=\s*["']?(true|false)["']?/);
    const durationMatch = attrsStr.match(/duration_ms\s*=\s*["']?(\d+)["']?/);
    const id = idMatch ? idMatch[1]! : "";
    const success = successMatch ? successMatch[1] === "true" : true;
    const durationMs = durationMatch ? parseInt(durationMatch[1], 10) : undefined;
    const invokeMeta = invokeById.get(id);
    const existing = eventById.get(id);
    // Only set output if we haven't seen this ID yet, or if the existing entry has no output
    if (!existing?.output) {
      let output: Record<string, unknown> = {};
      try { output = JSON.parse(data); } catch { output = { raw: data }; }
      eventById.set(id, {
        id: id || invokeMeta?.id,
        tool: invokeMeta?.tool ?? existing?.tool ?? id,
        input: invokeMeta?.input ?? existing?.input,
        output,
        success,
        durationMs,
        phase: "done",
      });
    }
  }

  events.push(...eventById.values());
  return events;
}

export function useAgentChat({ teamId, entityType, entityId, resolverContext, workspaceSlug }: UseAgentChatOptions) {
  const { accessToken } = useSession();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolEvents, setActiveToolEvents] = useState<ToolEvent[]>([]);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const cancelRef = useRef<(() => void) | null>(null);
  const lastUserTextRef = useRef<string>("");

  /**
   * Shared streaming event handler factory.
   * Returns an `onEvent` callback that wires tool/delta/done/error events into
   * the given mutable `toolEvts` array and the `assistantId` message slot.
   * Extracting this avoids duplicating the entire switch in both sendMessage
   * and sendToolApproval.
   */
  const makeStreamHandler = useCallback(
    (assistantId: string, toolEvts: ToolEvent[], accTextRef: { current: string }) =>
      (event: AgentStreamEvent) => {
        switch (event.type) {
          case "tool_start":
            toolEvts.push({ id: (event as any).id, tool: event.tool, input: event.input, phase: "start" });
            setActiveToolEvents([...toolEvts]);
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, toolEvents: [...toolEvts] } : m),
            );
            break;

          case "tool_done": {
            // Find the most-recent matching start event (handles same tool called multiple times)
            const idx = [...toolEvts].reverse().findIndex(
              (e) => e.tool === event.tool && e.phase === "start",
            );
            if (idx !== -1) {
              toolEvts[toolEvts.length - 1 - idx] = {
                id: (event as any).id ?? toolEvts[toolEvts.length - 1 - idx].id,
                tool: event.tool,
                // Prefer the backend-supplied input; fall back to the start event's input
                input: event.input ?? toolEvts[toolEvts.length - 1 - idx].input,
                output: event.output,
                phase: "done",
                success: event.success,
                durationMs: event.durationMs,
              };
            } else {
              // No matching start found — push a new done entry with whatever data we have
              toolEvts.push({
                id: (event as any).id,
                tool: event.tool,
                input: event.input,
                output: event.output,
                phase: "done",
                success: event.success,
                durationMs: event.durationMs,
              });
            }
            setActiveToolEvents([...toolEvts]);
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, toolEvents: [...toolEvts] } : m),
            );
            break;
          }

          case "tool_result":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, toolResults: [...(m.toolResults ?? []), { tool: event.tool, data: event.data }] }
                  : m,
              ),
            );
            break;

          case "delta":
            accTextRef.current += event.text;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, text: accTextRef.current } : m),
            );
            break;

          case "done": {
            conversationIdRef.current = event.conversationId;
            const realAssistantId = event.messageId ?? assistantId;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      id: realAssistantId,
                      text: event.text || accTextRef.current,
                      isStreaming: false,
                      toolsUsed: event.toolsUsed,
                      toolExecution: event.toolExecution,
                    }
                  : m,
              ),
            );
            setIsLoading(false);
            setActiveToolEvents([]);
            break;
          }

          case "tool_approval_request":
            toolEvts.push({ id: (event as any).id, tool: event.tool, input: event.input, phase: "waiting_for_approval" });
            setActiveToolEvents([...toolEvts]);
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, toolEvents: [...toolEvts] } : m),
            );
            setIsLoading(false);
            break;

          case "error":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, text: `Error: ${event.message}`, isStreaming: false }
                  : m,
              ),
            );
            setIsLoading(false);
            setActiveToolEvents([]);
            break;
        }
      },
    // conversationIdRef and setters are stable refs — no deps needed beyond the hook's own state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const sendMessage = useCallback(
    async (text?: string) => {
      const rawMessage = (text ?? inputValue).trim();
      if (!rawMessage || isLoading || !accessToken) return;

      const message = resolverContext
        ? buildAiMessageWithReferenceContext(rawMessage, resolverContext)
        : rawMessage;

      lastUserTextRef.current = rawMessage;
      setInputValue("");
      setIsLoading(true);
      setActiveToolEvents([]);

      const userMsg: AgentMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: rawMessage,
      };

      const assistantId = `a-${Date.now()}`;
      const assistantMsg: AgentMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        toolEvents: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      const accTextRef = { current: "" };
      const toolEvts: ToolEvent[] = [];

      const cancel = streamAgentChat(
        { conversationId: conversationIdRef.current, teamId, entityType, entityId, message, workspaceSlug },
        accessToken!,
        makeStreamHandler(assistantId, toolEvts, accTextRef),
      );

      cancelRef.current = cancel;
    },
    [inputValue, isLoading, accessToken, teamId, entityType, entityId, resolverContext, workspaceSlug, makeStreamHandler],
  );

  const retryMessage = useCallback(() => {
    if (isLoading) return;
    const lastText = lastUserTextRef.current;
    if (!lastText) return;
    setMessages((prev) => {
      const copy = [...prev];
      if (
        copy.length >= 2 &&
        copy[copy.length - 1].role === "assistant" &&
        copy[copy.length - 2].role === "user"
      ) {
        return copy.slice(0, -2);
      }
      return copy;
    });
    sendMessage(lastText);
  }, [isLoading, sendMessage]);

  const setThumb = useCallback((messageId: string, vote: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, thumb: m.thumb === vote ? undefined : vote } : m,
      ),
    );
  }, []);

  /**
   * Parse toolEvents from message content that contains inline tool markup.
   * Source of truth: <invoke id="tc-1" name="tool">...</invoke> + <tool_status ... /> + <tool_output ...>...</tool_output>
   */
  const parseToolEventsFromContent = useCallback((content: string): ToolEvent[] => parseInlineToolEvents(content), []);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!accessToken) return;
    conversationIdRef.current = conversationId;
    setIsLoading(true);
    try {
      const raw = await getAgentMessages(conversationId, accessToken);
      const isCheckpoint = (m: any) =>
        m?.metadata?.compressed === true ||
        (typeof m?.content === "string" && m.content.startsWith("<compressed>"));
      const mapped: AgentMessage[] = raw.map((m) => {
        // Compressed-history checkpoints render as a divider pill, not a bubble.
        if (isCheckpoint(m)) {
          return {
            id: m.id,
            role: "assistant" as const,
            text: "",
            kind: "checkpoint" as const,
            coversCount: Number(m?.metadata?.coversCount) || undefined,
          };
        }
        // 1. Try parsing toolEvents from inline <invoke>/<tool_output> content (new format)
        const contentToolEvents = m.content ? parseToolEventsFromContent(m.content) : [];
        if (contentToolEvents.length > 0) {
          return {
            id: m.id,
            role: m.role,
            text: m.content || "",
            toolEvents: contentToolEvents,
            toolResults: contentToolEvents.map(e => ({ tool: e.tool, data: e.output ?? {} })),
            isStreaming: false,
          };
        }

        // 2. Fall back to synthesizing from tool_calls/tool_results columns (legacy)
        const toolEvents: ToolEvent[] = [];
        const calls = m.tool_calls || [];
        const results = m.tool_results || [];

        calls.forEach((call: any) => {
          toolEvents.push({
            id: call.id || call.tool_use_id,
            tool: call.function?.name || call.tool || call.name,
            input: call.function?.arguments ? JSON.parse(call.function.arguments) : (call.input || {}),
            phase: "done",
            success: true,
          });
        });

        results.forEach((res: any) => {
          const match = toolEvents.find(e =>
            e.tool === res.tool_use_id || e.tool === res.tool || e.tool === res.toolName,
          );
          if (match) {
            match.success = !res.is_error && res.success !== false;
            if (res.output) match.output = res.output;
            if (res.durationMs) match.durationMs = res.durationMs;
          }
        });

        const toolResults: ToolResult[] = results
          .filter((res: any) => res.content || res.output)
          .map((res: any) => ({
            tool: res.toolName || res.tool,
            data: res.output || (typeof res.content === "string" ? JSON.parse(res.content) : res.content),
          }));

        return {
          id: m.id,
          role: m.role,
          text: m.content || "",
          toolEvents: toolEvents.length > 0 ? toolEvents : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
          isStreaming: false,
          };
        });
      setMessages(mapped);
    } catch (err) {
      console.error("Failed to load agent history", err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, parseToolEventsFromContent]);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    setIsLoading(false);
    setActiveToolEvents([]);
  }, []);

  const sendToolApproval = useCallback(async (toolName: string, input: any, decision: 'approved' | 'rejected', toolId?: string) => {
    if (isLoading || !accessToken) return;

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;

    const assistantId = lastMsg.id;
    setIsLoading(true);

    // Continue existing text + tool events from the paused assistant message
    const accTextRef = { current: lastMsg.text };
    const toolEvts: ToolEvent[] = [...(lastMsg.toolEvents ?? [])];

    const cancel = streamAgentChat(
      {
        conversationId: conversationIdRef.current,
        teamId,
        entityType,
        entityId,
        message: lastUserTextRef.current,
        approvalDecision: decision,
        approvalToolCall: { id: toolId, name: toolName, input },
        workspaceSlug,
      },
      accessToken!,
      makeStreamHandler(assistantId, toolEvts, accTextRef),
    );
    cancelRef.current = cancel;
  }, [messages, isLoading, accessToken, teamId, entityType, entityId, workspaceSlug, makeStreamHandler]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    conversationIdRef.current = undefined;
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setIsLoading(false);
    setActiveToolEvents([]);
  }, []);

  return {
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
    conversationId: conversationIdRef.current,
  };
}
