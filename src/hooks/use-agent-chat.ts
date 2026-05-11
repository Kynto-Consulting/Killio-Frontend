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
}

export interface ToolEvent {
  tool: string;
  input?: Record<string, unknown>;
  success?: boolean;
  durationMs?: number;
  phase: "start" | "done";
}

export interface UseAgentChatOptions {
  teamId: string;
  entityType?: AgentEntityScope;
  entityId?: string;
  resolverContext?: ResolverContext;
}

export function useAgentChat({ teamId, entityType, entityId, resolverContext }: UseAgentChatOptions) {
  const { accessToken } = useSession();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolEvents, setActiveToolEvents] = useState<ToolEvent[]>([]);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const cancelRef = useRef<(() => void) | null>(null);
  const lastUserTextRef = useRef<string>("");

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

      let accText = "";
      const toolEvts: ToolEvent[] = [];

      const cancel = streamAgentChat(
        { conversationId: conversationIdRef.current, teamId, entityType, entityId, message },
        accessToken!,
        (event: AgentStreamEvent) => {
          switch (event.type) {
            case "tool_start":
              toolEvts.push({ tool: event.tool, input: event.input, phase: "start" });
              setActiveToolEvents([...toolEvts]);
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, toolEvents: [...toolEvts] } : m),
              );
              break;

            case "tool_done": {
              const idx = [...toolEvts].reverse().findIndex(
                (e) => e.tool === event.tool && e.phase === "start",
              );
              if (idx !== -1) {
                toolEvts[toolEvts.length - 1 - idx] = {
                  tool: event.tool,
                  input: toolEvts[toolEvts.length - 1 - idx].input,
                  phase: "done",
                  success: event.success,
                  durationMs: event.durationMs,
                };
              } else {
                toolEvts.push({ tool: event.tool, phase: "done", success: event.success, durationMs: event.durationMs });
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
              accText += event.text;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: accText } : m)),
              );
              break;

            case "done":
              conversationIdRef.current = event.conversationId;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, text: event.text || accText, isStreaming: false, toolsUsed: event.toolsUsed }
                    : m,
                ),
              );
              setIsLoading(false);
              setActiveToolEvents([]);
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
      );

      cancelRef.current = cancel;
    },
    [inputValue, isLoading, accessToken, teamId, entityType, entityId, resolverContext],
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

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!accessToken) return;
    conversationIdRef.current = conversationId;
    setIsLoading(true);
    try {
      const raw = await getAgentMessages(conversationId, accessToken);
      const mapped: AgentMessage[] = raw.map((m) => {
        // Synthesize toolEvents from tool_calls and tool_results columns
        const toolEvents: ToolEvent[] = [];
        const calls = m.tool_calls || [];
        const results = m.tool_results || [];

        calls.forEach((call: any) => {
          toolEvents.push({
            tool: call.function?.name || call.tool,
            input: call.function?.arguments ? JSON.parse(call.function.arguments) : call.input,
            phase: "done",
            success: true,
          });
        });

        results.forEach((res: any) => {
          const match = toolEvents.find(e => e.tool === res.tool_use_id || e.tool === res.tool);
          if (match) {
            match.success = !res.is_error;
          }
        });

        return {
          id: m.id,
          role: m.role,
          text: m.content || "",
          toolEvents,
          isStreaming: false,
        };
      });
      setMessages(mapped);
    } catch (err) {
      console.error("Failed to load agent history", err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    setIsLoading(false);
    setActiveToolEvents([]);
  }, []);

  const clearConversation = useCallback(() => {
    conversationIdRef.current = undefined;
    setMessages([]);
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
    conversationId: conversationIdRef.current,
  };
}
