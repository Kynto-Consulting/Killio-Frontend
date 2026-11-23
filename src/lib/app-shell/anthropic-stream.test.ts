import assert from "node:assert/strict";
import test from "node:test";

import { AnthropicStreamAssembler } from "./anthropic-stream.ts";

const feed = (events: unknown[]) => {
  const assembler = new AnthropicStreamAssembler();
  const visible = events.map((e) => assembler.push(e)).join("");
  return { visible, ...assembler.result() };
};

test("text arrives in pieces and is returned piece by piece and whole", () => {
  const out = feed([
    { type: "message_start", message: {} },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Ho" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "la" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
    { type: "message_stop" },
  ]);
  assert.equal(out.visible, "Hola");
  assert.deepEqual(out.blocks, [{ type: "text", text: "Hola" }]);
  assert.equal(out.stopReason, "end_turn");
  assert.equal(out.error, null);
});

test("a tool call's arguments are joined and parsed; text before it is kept in order", () => {
  const out = feed([
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Busco." } },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu_1", name: "tool_search", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"que' } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'ry":"board"}' } },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
  ]);
  assert.equal(out.visible, "Busco.");
  assert.deepEqual(out.blocks, [
    { type: "text", text: "Busco." },
    { type: "tool_use", id: "tu_1", name: "tool_search", input: { query: "board" } },
  ]);
  assert.equal(out.stopReason, "tool_use");
});

test("a tool call with no arguments gets an empty object", () => {
  const out = feed([{ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_2", name: "device_info" } }]);
  assert.deepEqual(out.blocks, [{ type: "tool_use", id: "tu_2", name: "device_info", input: {} }]);
});

test("arguments cut off mid-way are an error, never a call with half its input", () => {
  const out = feed([
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_3", name: "card_delete" } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"cardId":"ab' } },
  ]);
  assert.deepEqual(out.blocks, []);
  assert.match(out.error ?? "", /card_delete/);
});

test("an error event is reported; thinking blocks and junk are ignored", () => {
  const out = feed([
    null,
    "junk",
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "secret" } },
    { type: "error", error: { message: "plan rate limit" } },
  ]);
  assert.equal(out.visible, "");
  assert.deepEqual(out.blocks, []);
  assert.equal(out.error, "plan rate limit");
});
