import assert from "node:assert/strict";
import { test } from "node:test";

import { ROOM_NODE_SPECS, validateRoomNode } from "./room-nodes.ts";

const kind = "killio.room.respond_interaction";
const modal = { customId: "feedback", title: "Opinión", inputs: [{ customId: "a", label: "A", style: "short", required: true }] };

test("respond_interaction offers the modal mode and shows its editor only then", () => {
  const spec = ROOM_NODE_SPECS[kind];
  assert.ok(spec.fields.find((f) => f.key === "mode")!.options!.includes("modal"));
  const field = spec.fields.find((f) => f.key === "modal")!;
  assert.equal(field.kind, "modal");
  assert.deepEqual(field.showWhen, { key: "mode", isIn: ["modal"] });
  const text = spec.fields.find((f) => f.key === "text")!;
  assert.ok(!text.showWhen!.isIn.includes("modal"), "content fields are hidden in modal mode");
});

test("modal mode needs a valid modal and no text", () => {
  assert.deepEqual(validateRoomNode(kind, { mode: "modal", modal }), []);
  const missing = validateRoomNode(kind, { mode: "modal" });
  assert.deepEqual(missing.map((i) => i.code), ["modal_invalid"]);
  const bad = validateRoomNode(kind, { mode: "modal", modal: { ...modal, title: "" } });
  assert.deepEqual(bad.map((i) => i.code), ["modal_invalid"]);
  assert.deepEqual(bad[0].modal!.map((i) => i.code), ["title_required"]);
});

test("the other modes still need text or blocks", () => {
  assert.deepEqual(validateRoomNode(kind, { mode: "ephemeral" }).map((i) => i.code), ["content_required"]);
  assert.deepEqual(validateRoomNode(kind, { mode: "update_message", text: "hola" }), []);
});

test("blocks with an accessory button share customIds with the components", () => {
  const issues = validateRoomNode("killio.room.send_message", {
    blocks: [{ type: "section", text: "a", accessory: { type: "button", label: "x", style: "primary", customId: "dup" } }],
    components: [[{ type: "button", label: "y", style: "primary", customId: "dup" }]],
  });
  assert.deepEqual(issues.map((i) => i.code), ["components_invalid"]);
});
