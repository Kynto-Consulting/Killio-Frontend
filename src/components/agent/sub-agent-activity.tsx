"use client";

/**
 * SubAgentActivity — renders a nested sub_agent run's full activity flow.
 *
 * The `sub_agent` tool_output is `{ activity, reason, label }` where `activity`
 * is a self-contained chat-markup string (visible text + <thinking> blocks +
 * inline <invoke>/<tool_status>/<tool_output> chips). We parse it the SAME way a
 * top-level assistant message is parsed — toolEvents from the inline markup,
 * blocks from parseAiMarkup — so the sub-agent's thinking, tool chips and text
 * render nested under the parent's sub_agent chip instead of as raw JSON.
 *
 * Shared between the assistant panel (AgentChatPanel) and the room/conversation
 * view (RoomMessageItem) so the nested flow renders identically in every surface
 * a sub_agent chip can appear.
 */

import { useMemo, useState } from "react";
import { Bot, Brain, ChevronDown } from "lucide-react";
import { ToolCallChip, type TFn } from "@/components/agent/tool-call-chip";
import {
  parseInlineToolEvents,
  resolveToolCallRenderState,
  type ToolEvent,
} from "@/hooks/use-agent-chat";
import { parseAiMarkup } from "@/lib/ai-markup";

const SUB_AGENT_ACTIVITY_MAX = 8000;

/** Normalize the sub_agent activity markup before rendering:
 *  - convert raw <thinking>…</thinking> (Anthropic thinking tag the nested model
 *    may emit) into a <pre_think>…</pre_think> block so it renders as a collapsed
 *    thinking section instead of leaking as raw text.
 *  - strip leading/trailing whitespace and the trailing "\n\n" that leaks in. */
function normalizeActivity(raw: string): string {
  let s = String(raw || "");
  s = s.replace(/<thinking\b[^>]*>([\s\S]*?)<\/thinking>/gi, (_m, inner) => `<pre_think>\n${String(inner).trim()}\n</pre_think>`);
  // Defensive: drop any dangling unterminated <thinking> open tag.
  s = s.replace(/<thinking\b[^>]*>/gi, "");
  return s.replace(/\s+$/g, "").replace(/^\s+/g, "");
}

/** Inline tool-call chip for a nested sub-agent tool. Resolves render state from
 *  the synthetic message's own inline <tool_status>/<tool_output> events. */
function NestedToolChip({ t, data, events }: { t: TFn; data: any; events: ToolEvent[] }) {
  const state = resolveToolCallRenderState(data, events);
  const output =
    state.output !== undefined && state.output !== null && Object.keys(state.output as object).length > 0
      ? state.output
      : undefined;
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
    />
  );
}

/** Collapsed thinking block, mirroring the top-level pre_think chip. */
function NestedThinking({ t, content }: { t: TFn; content: string }) {
  const [open, setOpen] = useState(false);
  const text = content.trim();
  if (!text) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 py-0.5 px-1 -mx-1 text-[12px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 rounded transition-colors"
      >
        <Brain className="w-3 h-3 shrink-0 text-violet-400" />
        <span className="font-medium">{t("agent.preThinkSections.thinking") || "Thinking"}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="ml-5 mt-0.5 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap break-words">
          {text}
        </div>
      )}
    </div>
  );
}

export function SubAgentActivity({ t, activity, reason }: { t: TFn; activity: string; reason: string }) {
  const bounded = useMemo(() => {
    const norm = normalizeActivity(activity);
    return norm.length > SUB_AGENT_ACTIVITY_MAX ? norm.slice(0, SUB_AGENT_ACTIVITY_MAX) + "…" : norm;
  }, [activity]);

  const events = useMemo(() => parseInlineToolEvents(bounded), [bounded]);
  const { blocks } = useMemo(() => parseAiMarkup(bounded), [bounded]);

  return (
    <div className="ml-6 mt-1 mb-1 flex flex-col gap-1 border-l-2 border-violet-200 dark:border-violet-900/50 pl-3">
      {reason && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          <Bot className="w-3 h-3 shrink-0" />
          <span className="truncate">{reason}</span>
        </div>
      )}
      {blocks.map((block, index) => {
        const key = `sa-${block.tag}-${index}`;
        if (block.tag === "tool_call") {
          try {
            const d = JSON.parse(block.content);
            return (
              <div key={key} className="my-0.5">
                <NestedToolChip t={t} data={d} events={events} />
              </div>
            );
          } catch {
            return null;
          }
        }
        if (block.tag === "pre_think" || block.tag === "reasoning") {
          return <NestedThinking key={key} t={t} content={block.content} />;
        }
        if (block.tag === "text" && typeof block.content === "string" && block.content.trim()) {
          return (
            <div
              key={key}
              className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words"
            >
              {block.content.trim()}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
