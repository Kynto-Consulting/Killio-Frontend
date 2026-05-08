"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "@/components/providers/session-provider";
import { streamAgentChat, AgentEntityScope, AgentStreamEvent } from "@/lib/api/agent";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Tool events received during this assistant turn */
  toolEvents?: ToolEvent[];
  /** Final list of tools that were actually invoked */
  toolsUsed?: string[];
  isStreaming?: boolean;
}

export interface ToolEvent {
  tool: string;
  success?: boolean;
  durationMs?: number;
  phase: "start" | "done";
}

export interface UseAgentChatOptions {
  teamId: string;
  entityType?: AgentEntityScope;
  entityId?: string;
}

export function useAgentChat({ teamId, entityType, entityId }: UseAgentChatOptions) {
  const { accessToken } = useSession();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolEvents, setActiveToolEvents] = useState<ToolEvent[]>([]);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const cancelRef = useRef<(() => void) | null>(null);

  const sendMessage = useCallback(
    async (text?: string) => {
      const message = (text ?? inputValue).trim();
      if (!message || isLoading || !accessToken) return;

      setInputValue("");
      setIsLoading(true);
      setActiveToolEvents([]);

      const userMsg: AgentMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: message,
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
        {
          conversationId: conversationIdRef.current,
          teamId,
          entityType,
          entityId,
          message,
        },
        accessToken!,
        (event: AgentStreamEvent) => {
          switch (event.type) {
            case "tool_start":
              toolEvts.push({ tool: event.tool, phase: "start" });
              setActiveToolEvents([...toolEvts]);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, toolEvents: [...toolEvts] } : m,
                ),
              );
              break;

            case "tool_done":
              // Update the matching start event with result
              const idx = [...toolEvts].reverse().findIndex(
                (e) => e.tool === event.tool && e.phase === "start",
              );
              if (idx !== -1) {
                const realIdx = toolEvts.length - 1 - idx;
                toolEvts[realIdx] = {
                  tool: event.tool,
                  phase: "done",
                  success: event.success,
                  durationMs: event.durationMs,
                };
              } else {
                toolEvts.push({ tool: event.tool, phase: "done", success: event.success, durationMs: event.durationMs });
              }
              setActiveToolEvents([...toolEvts]);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, toolEvents: [...toolEvts] } : m,
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
    [inputValue, isLoading, accessToken, teamId, entityType, entityId],
  );

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
    cancel,
    clearConversation,
    conversationId: conversationIdRef.current,
  };
}
