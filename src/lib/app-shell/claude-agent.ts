/**
 * The agent, run on this device against the person's own Claude Code (Killio App, "Claude" provider).
 *
 * With the host AI the whole agent runs on the server. The person's Claude Code lives on their computer,
 * where the server cannot reach it, so here the loop runs in the app instead: the model is asked through
 * the app's Claude bridge, and every Killio tool the model calls is executed by the server through the same
 * endpoints Killio CLI uses, with the person's own session and permissions. The server's AI is not used, so
 * no credits are spent. Device tools run on the device, as with the host AI.
 *
 * The model starts with two tools, `tool_search` and `tool_load`, and loads the Killio tools it needs.
 */
import type { AgentStreamEvent } from "@/lib/api/agent";
import { API_BASE_URL } from "@/lib/api/client";
import { AnthropicStreamAssembler, type AnthropicBlock } from "./anthropic-stream.ts";
import { appClientActions, runAppClientAction, type ClientActionConfirmKind } from "./client-actions";
import type { KillioClaudeBridge } from "./index";

export type ClaudeMessage = { role: "user" | "assistant"; content: string | Array<Record<string, unknown>> };

type ToolSchema = { name: string; description?: string; input_schema: Record<string, unknown> };

const META_TOOLS: ToolSchema[] = [
  {
    name: "tool_search",
    description: "Find Killio tools by keyword (boards, cards, documents, rooms, device…). Returns names and one-line descriptions. Load the ones you need with tool_load before calling them.",
    input_schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
  },
  {
    name: "tool_load",
    description: "Load Killio tools by exact name so you can call them in your next step.",
    input_schema: { type: "object", properties: { names: { type: "array", items: { type: "string" } } }, required: ["names"] },
  },
];

const MAX_STEPS = 24;
const MAX_RESULT_CHARS = 60_000;

export interface ClaudeTurnOptions {
  bridge: KillioClaudeBridge;
  model: string;
  /** The conversation so far, as this function returned it last time. */
  history: ClaudeMessage[];
  /** Tools loaded earlier in this conversation; kept by the caller between turns. */
  tools: Map<string, ToolSchema>;
  userText: string;
  accessToken: string;
  teamId: string;
  entityType?: string;
  entityId?: string;
  confirm: (kind: ClientActionConfirmKind | "runTool", detail: string) => boolean | Promise<boolean>;
  emit: (event: AgentStreamEvent) => void;
  /** Set `cancelled` to stop; the loop stores the running request in `requestId` so it can be cancelled. */
  control: { cancelled: boolean; requestId?: number };
}

function systemPrompt(o: ClaudeTurnOptions): string {
  return [
    "You are the assistant inside Killio, a workspace for boards, cards, documents, meshes, rooms and scripts.",
    "Answer in the language the person writes in. Be brief and concrete.",
    "You act through tools. You start with tool_search and tool_load: search for the Killio tools a request needs, load them, then call them. Never claim something was done unless a tool call returned success.",
    "Device tools (opening links or apps, screenshots, clipboard) run on the person's device and ask them first; a refusal is final for that request.",
    `Context: teamId=${o.teamId}` + (o.entityType && o.entityId ? `, the person is looking at ${o.entityType} ${o.entityId}` : "") + `. Today is ${new Date().toISOString().slice(0, 10)}.`,
  ].join("\n");
}

async function api(path: string, accessToken: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: any }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

const messageOf = (body: any, fallback: string): string => {
  const message = Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
  return typeof message === "string" && message ? message : fallback;
};

/** Runs one tool call and returns what goes back to the model. */
async function runTool(o: ClaudeTurnOptions, name: string, input: Record<string, unknown>): Promise<{ success: boolean; output: Record<string, unknown> }> {
  if (name === "tool_search") {
    const query = typeof input.query === "string" ? input.query : "";
    const limit = Math.min(Math.max(Number(input.limit) || 8, 1), 20);
    const found = await api(`/agent/tools/manifest?search=${encodeURIComponent(query)}`, o.accessToken);
    if (!found.ok) return { success: false, output: { error: messageOf(found.body, "The tool list could not be read.") } };
    // The list may name device tools this device cannot run; calling one of those answers with a plain
    // "not available on this device" (see below), which the model handles like any failed tool.
    const tools = (Array.isArray(found.body?.tools) ? found.body.tools : [])
      .slice(0, limit)
      .map((t: any) => ({ name: t.name, description: t.description }));
    return { success: true, output: { tools, count: tools.length } };
  }
  if (name === "tool_load") {
    const names = (Array.isArray(input.names) ? input.names : []).filter((n): n is string => typeof n === "string").slice(0, 12);
    const loaded: string[] = [];
    const failed: string[] = [];
    for (const toolName of names) {
      if (o.tools.has(toolName)) { loaded.push(toolName); continue; }
      const schema = await api(`/agent/tools/${encodeURIComponent(toolName)}/schema`, o.accessToken);
      if (schema.ok && schema.body?.schema?.name === toolName && schema.body.schema.input_schema) {
        o.tools.set(toolName, { name: toolName, description: schema.body.schema.description, input_schema: schema.body.schema.input_schema });
        loaded.push(toolName);
      } else failed.push(toolName);
    }
    return { success: failed.length === 0, output: { loaded, ...(failed.length ? { notFound: failed } : {}) } };
  }
  if (appClientActions().includes(name)) {
    const outcome = await runAppClientAction(name, input, { accessToken: o.accessToken, teamId: o.teamId, confirm: o.confirm });
    return { success: outcome.success, output: outcome.success ? outcome.output ?? {} : { error: outcome.error ?? "The device could not do it." } };
  }
  const body = JSON.stringify({ name, input, teamId: o.teamId, entityType: o.entityType, entityId: o.entityId });
  let result = await api("/agent/tools/execute", o.accessToken, { method: "POST", body });
  // The server keeps destructive tools behind an explicit confirmation: ask the person, then repeat with it.
  if (!result.ok && result.status === 400 && /requires confirmation/i.test(messageOf(result.body, ""))) {
    if (!(await o.confirm("runTool", name))) return { success: false, output: { error: "The user declined." } };
    result = await api("/agent/tools/execute?confirm=true", o.accessToken, { method: "POST", body });
  }
  if (!result.ok && /client-action tool/i.test(messageOf(result.body, ""))) return { success: false, output: { error: `${name} is not available on this device.` } };
  if (!result.ok) return { success: false, output: { error: messageOf(result.body, `The tool failed (${result.status}).`) } };
  return result.body?.success
    ? { success: true, output: (result.body.output && typeof result.body.output === "object" ? result.body.output : { result: result.body.output ?? null }) as Record<string, unknown> }
    : { success: false, output: { error: String(result.body?.error ?? "The tool failed.") } };
}

/** One request to the model; emits the text as it arrives. */
async function ask(o: ClaudeTurnOptions, messages: ClaudeMessage[]): Promise<{ blocks: AnthropicBlock[]; stopReason: string | null }> {
  const request = { model: o.model, max_tokens: 8192, system: systemPrompt(o), messages, tools: [...META_TOOLS, ...o.tools.values()] };
  const id = await o.bridge.send(request);
  o.control.requestId = id;
  const assembler = new AnthropicStreamAssembler();
  for (;;) {
    if (o.control.cancelled) {
      void o.bridge.cancel(id).catch(() => {});
      throw new Error("cancelled");
    }
    const batch = await o.bridge.poll(id);
    for (const event of batch.events) {
      const text = assembler.push(event);
      if (text) o.emit({ type: "delta", text });
    }
    if (batch.done) break;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  const result = assembler.result();
  if (result.error) throw new Error(result.error);
  return { blocks: result.blocks, stopReason: result.stopReason };
}

/**
 * Runs one user turn to the end (the model may call tools several times) and returns the conversation
 * including it. Reports progress through `emit` with the same events the host AI's stream uses, so the
 * chat draws both the same way. On failure it emits `error` and returns the history unchanged.
 */
export async function runClaudeTurn(o: ClaudeTurnOptions): Promise<ClaudeMessage[]> {
  const messages: ClaudeMessage[] = [...o.history, { role: "user", content: o.userText }];
  const toolsUsed: string[] = [];
  let visible = "";
  const emit = o.emit;
  const collecting: ClaudeTurnOptions = { ...o, emit: (event) => { if (event.type === "delta") visible += event.text; emit(event); } };
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const answer = await ask(collecting, messages);
      messages.push({ role: "assistant", content: answer.blocks as Array<Record<string, unknown>> });
      const calls = answer.blocks.filter((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use");
      if (calls.length === 0) break;
      const results: Array<Record<string, unknown>> = [];
      for (const call of calls) {
        emit({ type: "tool_start", id: call.id, tool: call.name, input: call.input });
        const started = Date.now();
        let outcome: { success: boolean; output: Record<string, unknown> };
        try {
          outcome = await runTool(o, call.name, call.input);
        } catch (error) {
          outcome = { success: false, output: { error: error instanceof Error ? error.message : String(error) } };
        }
        toolsUsed.push(call.name);
        emit({ type: "tool_done", id: call.id, tool: call.name, success: outcome.success, durationMs: Date.now() - started, input: call.input, output: outcome.output });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(outcome.output).slice(0, MAX_RESULT_CHARS), ...(outcome.success ? {} : { is_error: true }) });
      }
      messages.push({ role: "user", content: results });
      if (step === MAX_STEPS - 1) visible += "\n\n…";
    }
  } catch (error) {
    if (o.control.cancelled) return o.history;
    emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    return o.history;
  }
  // conversationId is the server's; a local conversation has none, so the caller keeps whatever it had.
  emit({ type: "done", text: visible, conversationId: "", toolsUsed: [...new Set(toolsUsed)] });
  return messages;
}
