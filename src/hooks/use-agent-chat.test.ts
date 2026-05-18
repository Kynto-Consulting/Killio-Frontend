import assert from "node:assert/strict";
import test from "node:test";
import { parseAiMarkup } from "@/lib/ai-markup";
import { parseInlineToolEvents, resolveToolCallRenderState } from "./use-agent-chat";

test("parseInlineToolEvents matches invoke, tool_status and tool_output by id", () => {
  const content = [
    `<batch_invoke><invoke id="tc-1" name="buscar_usuario"><parameters>{"id":"20233963"}</parameters></invoke><invoke name="buscar_cuenta" id="tc-2"><parameters>{"email":"demo@killio.ai"}</parameters></invoke></batch_invoke>`,
    `<tool_status id="tc-1" status="done" success="true" duration_ms="17" />`,
    `<tool_output id="tc-1" success="true" duration_ms="17">{"nombre":"Piero","status":"activo"}</tool_output>`,
    `<tool_status id="tc-2" status="waiting_for_approval" />`,
  ].join("\n");

  const events = parseInlineToolEvents(content);
  assert.equal(events.length, 2);

  const done = events.find((event) => event.tool === "buscar_usuario");
  assert.deepEqual(done, {
    id: "tc-1",
    tool: "buscar_usuario",
    input: { id: "20233963" },
    output: { nombre: "Piero", status: "activo" },
    success: true,
    durationMs: 17,
    phase: "done",
  });

  const waiting = events.find((event) => event.tool === "buscar_cuenta");
  assert.deepEqual(waiting, {
    id: "tc-2",
    tool: "buscar_cuenta",
    input: { email: "demo@killio.ai" },
    output: undefined,
    success: undefined,
    durationMs: undefined,
    phase: "waiting_for_approval",
  });
});

test("parseInlineToolEvents supports anthropic-style XML child parameters", () => {
  const content = [
    `<invoke id="tc-xml" name="buscar_usuario"><parameters><id>20233963</id><include_profile>true</include_profile><limit>3</limit></parameters></invoke>`,
    `<tool_output id="tc-xml" success="true" duration_ms="17">{"nombre":"Piero","status":"activo"}</tool_output>`,
  ].join("\n");

  const events = parseInlineToolEvents(content);
  assert.deepEqual(events[0], {
    id: "tc-xml",
    tool: "buscar_usuario",
    input: { id: 20233963, include_profile: true, limit: 3 },
    output: { nombre: "Piero", status: "activo" },
    success: true,
    durationMs: 17,
    phase: "done",
  });
});

test("parseAiMarkup keeps invoke batches as tool_call blocks and hides tool tags from visible text", () => {
  const content = [
    `Resultado listo`,
    `<batch_invoke><invoke id="tc-1" name="buscar_usuario"><parameters>{"id":"20233963"}</parameters></invoke></batch_invoke>`,
    `<tool_status id="tc-1" status="done" success="true" duration_ms="9" />`,
    `<tool_output id="tc-1" success="true" duration_ms="9">{"nombre":"Piero"}</tool_output>`,
  ].join("\n");

  const parsed = parseAiMarkup(content);
  assert.equal(parsed.visibleText, "Resultado listo");
  assert.ok(parsed.blocks.some((block) => block.tag === "batch_invoke"));
  assert.equal(parsed.blocks.some((block) => block.tag === "tool_status"), false);
  assert.equal(parsed.blocks.some((block) => block.tag === "tool_output"), false);
});

test("parseAiMarkup preserves invoke ids in normalized tool_call blocks", () => {
  const parsed = parseAiMarkup(
    `<invoke name="buscar_usuario" id="tc-77"><parameters>{"id":"20233963"}</parameters></invoke>`,
  );

  const toolCallBlock = parsed.blocks.find((block) => block.tag === "tool_call");
  assert.ok(toolCallBlock);
  assert.deepEqual(JSON.parse(toolCallBlock!.content), {
    id: "tc-77",
    name: "buscar_usuario",
    input: { id: "20233963" },
  });
});

test("parseAiMarkup parses anthropic-style XML child parameters", () => {
  const parsed = parseAiMarkup(
    `<invoke name="buscar_usuario" id="tc-88"><parameters><id>20233963</id><status>activo</status></parameters></invoke>`,
  );

  const toolCallBlock = parsed.blocks.find((block) => block.tag === "tool_call");
  assert.ok(toolCallBlock);
  assert.deepEqual(JSON.parse(toolCallBlock!.content), {
    id: "tc-88",
    name: "buscar_usuario",
    input: { id: 20233963, status: "activo" },
  });
});

test("parseInlineToolEvents treats running and approval statuses distinctly", () => {
  const content = [
    `<invoke id="tc-run" name="document_list"><parameters>{}</parameters></invoke>`,
    `<tool_status id="tc-run" status="running" />`,
    `<invoke id="tc-approve" name="script_execute"><parameters>{"scriptId":"s1"}</parameters></invoke>`,
    `<tool_status id="tc-approve" status="waiting_for_approval" />`,
  ].join("\n");

  const events = parseInlineToolEvents(content);
  assert.deepEqual(events.find((event) => event.tool === "document_list"), {
    id: "tc-run",
    tool: "document_list",
    input: {},
    output: undefined,
    success: undefined,
    durationMs: undefined,
    phase: "start",
  });
  assert.deepEqual(events.find((event) => event.tool === "script_execute"), {
    id: "tc-approve",
    tool: "script_execute",
    input: { scriptId: "s1" },
    output: undefined,
    success: undefined,
    durationMs: undefined,
    phase: "waiting_for_approval",
  });
});

test("resolveToolCallRenderState prefers id matching before tool-name occurrence", () => {
  const events = [
    { id: "tc-2", tool: "buscar_usuario", input: { id: "2" }, output: { nombre: "Dos" }, success: true, phase: "done" as const },
    { id: "tc-1", tool: "buscar_usuario", input: { id: "1" }, output: { nombre: "Uno" }, success: true, phase: "done" as const },
  ];

  const state = resolveToolCallRenderState({ id: "tc-1", name: "buscar_usuario", input: { id: "1" } }, events, 0);
  assert.equal(state.isDone, true);
  assert.equal(state.isError, false);
  assert.deepEqual(state.output, { nombre: "Uno" });
});

test("resolveToolCallRenderState falls back to tool-name occurrence for legacy entries without id", () => {
  const events = [
    { tool: "buscar_usuario", input: { id: "1" }, output: { nombre: "Uno" }, success: true, phase: "done" as const },
    { tool: "buscar_usuario", input: { id: "2" }, output: { nombre: "Dos" }, success: true, phase: "done" as const },
  ];

  const state = resolveToolCallRenderState({ name: "buscar_usuario" }, events, 1);
  assert.equal(state.isDone, true);
  assert.deepEqual(state.output, { nombre: "Dos" });
});

test("resolveToolCallRenderState surfaces waiting_for_approval and running states by id", () => {
  const waiting = resolveToolCallRenderState(
    { id: "tc-approve", name: "script_execute", input: { scriptId: "s1" } },
    [{ id: "tc-approve", tool: "script_execute", input: { scriptId: "s1" }, phase: "waiting_for_approval" }],
  );
  assert.equal(waiting.needsApproval, true);
  assert.equal(waiting.isRunning, false);

  const running = resolveToolCallRenderState(
    { id: "tc-run", name: "document_list", input: {} },
    [{ id: "tc-run", tool: "document_list", input: {}, phase: "start" }],
  );
  assert.equal(running.isRunning, true);
  assert.equal(running.isDone, false);
});
