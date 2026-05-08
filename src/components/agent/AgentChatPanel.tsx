"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { Bot, Send, Loader2, X, Trash2, Wrench, CheckCircle2, XCircle, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAgentChat, AgentMessage, ToolEvent } from "@/hooks/use-agent-chat";
import { AgentEntityScope } from "@/lib/api/agent";

interface AgentChatPanelProps {
  teamId: string;
  entityType?: AgentEntityScope;
  entityId?: string;
  onClose?: () => void;
  className?: string;
}

export function AgentChatPanel({
  teamId,
  entityType,
  entityId,
  onClose,
  className = "",
}: AgentChatPanelProps) {
  const { messages, inputValue, setInputValue, isLoading, activeToolEvents, sendMessage, cancel, clearConversation } =
    useAgentChat({ teamId, entityType, entityId });

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeToolEvents]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-neutral-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40">
            <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Killio AI
          </span>
          {isLoading && (
            <span className="flex items-center gap-1 text-xs text-violet-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>pensando…</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearConversation}
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 transition-colors"
            title="Nueva conversación"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <EmptyState entityType={entityType} onSuggestionClick={(tip) => sendMessage(tip)} />
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Active tool events indicator */}
        {isLoading && activeToolEvents.length > 0 && (
          <ActiveToolsIndicator events={activeToolEvents} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta algo o pide una acción…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2.5 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 max-h-40 overflow-y-auto"
            style={{ fieldSizing: "content" } as any}
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              onClick={cancel}
              className="shrink-0 p-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200 transition-colors"
              title="Cancelar"
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
        <p className="mt-1.5 text-[11px] text-neutral-400 text-center">
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>
      {!isUser && (
        <div className="shrink-0 flex items-start mt-1">
          <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          </div>
        </div>
      )}

      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Tool events summary (only for assistant messages with tools) */}
        {!isUser && message.toolEvents && message.toolEvents.length > 0 && (
          <ToolEventsSummary events={message.toolEvents} isStreaming={message.isStreaming} />
        )}

        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-violet-600 text-white rounded-br-sm"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-bl-sm"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.text}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2">
              {message.text ? (
                <ReactMarkdown>{message.text}</ReactMarkdown>
              ) : message.isStreaming ? (
                <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse rounded-sm" />
              ) : null}
            </div>
          )}
        </div>

        {/* Tools used footer */}
        {!isUser && !message.isStreaming && message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {message.toolsUsed.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-mono"
              >
                <Zap className="w-2.5 h-2.5" />
                {formatToolName(tool)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolEventsSummary({ events, isStreaming }: { events: ToolEvent[]; isStreaming?: boolean }) {
  const doneEvents = events.filter((e) => e.phase === "done");
  if (doneEvents.length === 0 && !isStreaming) return null;

  return (
    <div className="flex flex-col gap-0.5 px-1 text-[11px] text-neutral-500 dark:text-neutral-400">
      {doneEvents.map((e, i) => (
        <div key={i} className="flex items-center gap-1">
          {e.success ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          ) : (
            <XCircle className="w-3 h-3 text-red-400" />
          )}
          <span className="font-mono">{formatToolName(e.tool)}</span>
          {e.durationMs !== undefined && (
            <span className="text-neutral-400">{e.durationMs}ms</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ActiveToolsIndicator({ events }: { events: ToolEvent[] }) {
  const latestStart = [...events].reverse().find((e) => e.phase === "start");
  if (!latestStart) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-violet-500 dark:text-violet-400 px-1">
      <div className="flex items-center gap-1">
        <Wrench className="w-3.5 h-3.5 animate-pulse" />
        <span className="font-mono">{formatToolName(latestStart.tool)}</span>
      </div>
      <Loader2 className="w-3 h-3 animate-spin" />
    </div>
  );
}

function EmptyState({ entityType, onSuggestionClick }: { entityType?: AgentEntityScope; onSuggestionClick?: (text: string) => void }) {
  const suggestions: Record<string, string[]> = {
    board: [
      "¿Cuántas tarjetas hay sin asignar?",
      "Crea una tarjeta para revisar el diseño",
      "Mueve todas las tarjetas de 'Doing' a 'Review'",
    ],
    mesh: [
      "Agrega un bloque de texto con el título del proyecto",
      "Conecta el bloque de arquitectura con el de despliegue",
      "¿Cuántos bricks hay en el canvas?",
    ],
    document: [
      "Agrega una sección de resumen ejecutivo",
      "¿Cuál es el contenido de este documento?",
      "Cambia la visibilidad a pública",
    ],
    script: [
      "¿Cuántos nodos tiene este script?",
      "Ejecuta este script",
      "Agrega un nodo de transformación JSON",
    ],
  };

  const tips = entityType ? suggestions[entityType] ?? [] : [
    "¿Qué tableros tiene el equipo?",
    "Busca documentos sobre arquitectura",
    "Crea un nuevo script de automatización",
  ];

  return (
    <div className="flex flex-col items-center gap-6 py-8 px-2 text-center">
      <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
        <Bot className="w-7 h-7 text-violet-500" />
      </div>
      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          ¿En qué puedo ayudarte?
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          Puedo crear, editar y mover elementos en tu espacio de trabajo
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full">
        {tips.map((tip) => (
          <button
            key={tip}
            className="text-left text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-violet-300 transition-colors"
            onClick={() => onSuggestionClick?.(tip)}
          >
            {tip}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatToolName(tool: string): string {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
