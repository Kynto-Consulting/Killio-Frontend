import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHelloOptions, buildHelloScriptGraph, HELLO_COMMAND } from "./model.ts";
import { validateOptions, type CommandOption } from "./options.ts";
import {
  applyTemplateVariable, unknownVariables, availableVariables, fallbackVariables, filterVariables, isBotScriptNodeKind, isRoomNodeKind, isRoomTriggerKind, leafOptions, roomPaletteSections,
  ROOM_ACTION_KINDS, ROOM_NODE_SPECS, ROOM_TRIGGER_KINDS, samplePayload, scheduleModeOf, specOf, subcommandNames, templateTrigger, triggerVariables, validateBotGraph,
  validateRoomNode, type GraphEdgeLike, type GraphNodeLike, type RoomNodeKind,
} from "./room-nodes.ts";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const names = (v: Array<{ name: string }>) => v.map((x) => x.name);
const fields = (kind: RoomNodeKind, cfg: Record<string, unknown>) => validateRoomNode(kind, cfg).map((i) => `${i.field}:${i.code}`);

test("the catalog covers every trigger and action the backend runs, with the right ports", () => {
  assert.equal(ROOM_TRIGGER_KINDS.length, 8);
  assert.equal(ROOM_ACTION_KINDS.length, 18);
  for (const k of ROOM_TRIGGER_KINDS) {
    const s = ROOM_NODE_SPECS[k];
    assert.equal(s.role, "trigger");
    assert.equal(s.hasInput, false, `${k} has no input`);
    assert.equal(s.oncePerScript, true);
    assert.ok(s.emits.some((v) => v.name === "roomId"));
  }
  for (const k of ROOM_ACTION_KINDS) {
    const s = ROOM_NODE_SPECS[k];
    assert.equal(s.role, "action");
    assert.equal(s.hasInput, true, `${k} has an input`);
    assert.equal(s.oncePerScript, false);
    assert.ok(s.emits.length > 0);
  }
  assert.equal(isRoomNodeKind("killio.room.reply"), true);
  assert.equal(isRoomNodeKind("core.action.delay"), false);
  assert.equal(isRoomTriggerKind("killio.trigger.command"), true);
  assert.equal(isRoomTriggerKind("killio.room.reply"), false);
  assert.equal(specOf("nope"), null);
});

test("fields never use a key the backend schema does not have (only the virtual scheduleMode)", () => {
  const schema: Record<string, string[]> = {
    "killio.trigger.room_message": ["roomId", "commandPrefix", "requireMention", "matchMode"],
    "killio.trigger.command": ["command", "subcommand", "roomId"],
    "killio.trigger.interaction": ["customId", "roomId"],
    "killio.trigger.reaction_added": ["roomId", "emoji", "onlyOwnMessages"],
    "killio.trigger.message_edited": ["roomId"],
    "killio.trigger.message_deleted": ["roomId"],
    "killio.trigger.member_join": ["roomId"],
    "killio.trigger.scheduled": ["roomId", "everyMinutes", "dailyAt", "weekdays", "scheduleMode"],
    "killio.room.respond_interaction": ["mode", "modal", "text", "blocks", "blocksFrom", "components", "componentsFrom", "expiresInMinutes"],
    "killio.room.send_message": ["roomId", "text", "blocks", "blocksFrom", "components", "componentsFrom", "expiresInMinutes", "ephemeral"],
    "killio.room.reply": ["messageId", "roomId", "text", "blocks", "blocksFrom", "components", "componentsFrom", "expiresInMinutes", "ephemeral", "inThread"],
    "killio.room.edit_message": ["messageId", "roomId", "text", "blocks", "blocksFrom", "components", "componentsFrom", "expiresInMinutes"],
    "killio.room.delete_message": ["messageId", "roomId", "moderate"],
    "killio.team.assign_self_role": ["roleId", "userId"],
    "killio.team.remove_self_role": ["roleId", "userId"],
    "killio.moderation.mute_member": ["userId", "minutes", "reason"],
    "killio.moderation.kick_member": ["userId", "reason"],
    "killio.room.count_recent_messages": ["roomId", "userId", "windowSeconds", "outputPath"],
    "killio.team.member_info": ["userId", "roleIds", "newMemberHours"],
    "core.condition.text_match_list": ["field", "words", "wordsFrom", "mode", "caseInsensitive", "ignoreAccents"],
    "core.transform.count_matches": ["field", "preset", "pattern", "outputPath"],
    "killio.room.pin_message": ["messageId", "roomId", "unpin", "expiresInMinutes", "replaceOldest"],
    "killio.room.create_thread": ["messageId", "roomId", "text", "blocks", "blocksFrom", "components", "componentsFrom", "expiresInMinutes"],
    "killio.room.unreact": ["emoji", "messageId", "roomId"],
    "killio.room.send_dm": ["userId", "text", "blocks", "blocksFrom", "components", "componentsFrom", "expiresInMinutes"],
    "killio.room.react": ["emoji", "messageId", "roomId"],
  };
  for (const [kind, spec] of Object.entries(ROOM_NODE_SPECS)) {
    const allowed = new Set(schema[kind]);
    for (const f of spec.fields) assert.ok(allowed.has(f.key), `${kind}.${f.key} is not in the backend schema`);
    for (const k of Object.keys(spec.defaults)) assert.ok(allowed.has(k), `${kind} default ${k}`);
  }
  assert.equal(Object.keys(schema).length, Object.keys(ROOM_NODE_SPECS).length);
});

test("palette: triggers first, then actions, each in catalog order, nothing missing", () => {
  const sections = roomPaletteSections();
  assert.deepEqual(sections.map((s) => s.role), ["trigger", "action"]);
  assert.equal(sections[0].specs.length + sections[1].specs.length, 26);
  assert.equal(sections[0].specs[0].kind, "killio.trigger.room_message");
  assert.ok(sections[0].specs.every((s) => s.role === "trigger") && sections[1].specs.every((s) => s.role === "action"));
});

test("trigger variables match what the backend nodes emit", () => {
  assert.deepEqual(names(triggerVariables("killio.trigger.message_deleted")).sort(), ["roomId", "receivedAt", "messageId", "previousText", "authorUserId", "deletedBy", "deletedByName", "invokedBy", "authorIsBot"].sort());
  assert.ok(names(triggerVariables("killio.trigger.interaction")).includes("values"));
  assert.ok(names(triggerVariables("killio.trigger.member_join")).includes("userName"));
  assert.ok(names(triggerVariables("killio.trigger.scheduled")).includes("scheduledFor"));
  assert.ok(names(triggerVariables("killio.trigger.reaction_added")).includes("messageText"));
});

test("command trigger adds options.<name> from the commands of the bot, filtered by command and subcommand", () => {
  const sub = (name: string, options: CommandOption[]): CommandOption => ({ name, description: "", type: "subcommand", options });
  const ctx = {
    commands: [
      { name: "hola", options: [{ name: "nombre", description: "Quien", type: "string" as const }, { name: "tono", description: "", type: "string" as const }] },
      { name: "lista", options: [sub("add", [{ name: "item", description: "", type: "string" }]), sub("rm", [{ name: "pos", description: "", type: "integer" }])] },
    ],
  };
  assert.deepEqual(names(triggerVariables("killio.trigger.command", { command: "hola" }, ctx)).filter((n) => n.startsWith("options.")), ["options.nombre", "options.tono"]);
  assert.deepEqual(names(triggerVariables("killio.trigger.command", { command: "/Lista", subcommand: "rm" }, ctx)).filter((n) => n.startsWith("options.")), ["options.pos"]);
  assert.deepEqual(names(triggerVariables("killio.trigger.command", {}, ctx)).filter((n) => n.startsWith("options.")), ["options.nombre", "options.tono", "options.item", "options.pos"]);
  assert.deepEqual(names(triggerVariables("killio.trigger.command", { command: "hola" })).filter((n) => n.startsWith("options.")), []);
  assert.deepEqual(subcommandNames(ctx.commands[1].options), ["add", "rm"]);
  assert.deepEqual(leafOptions(ctx.commands[1].options, "add").map((o) => o.name), ["item"]);
});

const node = (id: string, kind: string, config: Record<string, unknown> = {}): GraphNodeLike => ({ id, nodeKind: kind, config });
const edge = (a: string, b: string): GraphEdgeLike => ({ sourceNodeId: a, targetNodeId: b });

test("available variables: only what is upstream of the node (triggers and earlier results)", () => {
  const nodes = [node("t", "killio.trigger.command", { command: "hola" }), node("r", "killio.room.reply"), node("e", "killio.room.edit_message"), node("other", "killio.trigger.member_join")];
  const edges = [edge("t", "r"), edge("r", "e")];
  const ctx = { commands: [{ name: "hola", options: [{ name: "nombre", description: "", type: "string" as const }] }] };
  const forEdit = names(availableVariables("e", nodes, edges, ctx));
  assert.ok(forEdit.includes("options.nombre") && forEdit.includes("invokedByName") && forEdit.includes("roomSendResult") && forEdit.includes("botMessageId"));
  assert.ok(!forEdit.includes("userName"), "a trigger that does not reach the node adds nothing");
  const forReply = names(availableVariables("r", nodes, edges, ctx));
  assert.ok(!forReply.includes("roomSendResult"), "a node does not see its own result");
  assert.deepEqual(availableVariables("t", nodes, edges, ctx), []);
  assert.ok(names(fallbackVariables(nodes, ctx)).includes("userName"));
});

test("sample payloads carry the declared variables", () => {
  for (const k of ROOM_TRIGGER_KINDS) {
    const p = samplePayload(k);
    assert.ok(p.externalKey);
    for (const v of ROOM_NODE_SPECS[k].emits) {
      if (k === "killio.trigger.command" && v.name === "options") continue;
      assert.ok(v.name in p.data, `${k} sample lacks ${v.name}`);
    }
  }
  const opts = (samplePayload("killio.trigger.command", { command: "hola" }, { commands: [{ name: "hola", options: [{ name: "nombre", description: "", type: "string" }] }] }).data.options) as Record<string, string>;
  assert.deepEqual(Object.keys(opts), ["nombre"]);
});

test("template autocomplete: opens inside an unclosed brace and applies a variable", () => {
  assert.deepEqual(templateTrigger("Hola {opt", 9), { start: 5, query: "opt", style: "{" });
  assert.deepEqual(templateTrigger("Hola {{ opt", 11), { start: 5, query: "opt", style: "{{" });
  assert.equal(templateTrigger("Hola {x} y", 10), null);
  assert.equal(templateTrigger("Hola", 4), null);
  assert.equal(templateTrigger("{{ a + b", 8), null, "an expression is not a name being typed");
  const t1 = templateTrigger("Hola {aut", 9);
  assert.deepEqual(applyTemplateVariable("Hola {aut", 9, t1, "authorName"), { text: "Hola {authorName}", caret: 17 });
  const t2 = templateTrigger("Hola {{ au }} fin", 10);
  assert.deepEqual(applyTemplateVariable("Hola {{ au }} fin", 10, t2, "options.nombre"), { text: "Hola {{ options.nombre }} fin", caret: 25 });
  assert.deepEqual(applyTemplateVariable("ab", 1, null, "x"), { text: "a{x}b", caret: 4 });
  assert.deepEqual(filterVariables([{ name: "authorName" }, { name: "invokedBy" }, { name: "text" }], "au").map((v) => v.name), ["authorName"]);
  assert.equal(filterVariables([{ name: "a" }, { name: "b" }], "", 1).length, 1);
});

test("unknown variables: the server replaces every single-brace token, so a typo or literal braces are flagged", () => {
  const known = [{ name: "authorName" }, { name: "options.nombre" }, { name: "roomSendResult" }];
  assert.deepEqual(unknownVariables("Hola {authorName}, {options.nombre} {options.otro}", known), []);
  assert.deepEqual(unknownVariables("Hola {autorName}", known), ["autorName"]);
  assert.deepEqual(unknownVariables('{ "ok": true }', known), ['"ok": true']);
  assert.deepEqual(unknownVariables("{{ options.nombre || 'x' }} {nope}", known), ["nope"], "expressions are not checked");
  assert.deepEqual(unknownVariables("{roomSendResult.id}", known), []);
  assert.deepEqual(unknownVariables("sin llaves", known), []);
  assert.deepEqual(unknownVariables("{a} {a}", known), ["a"]);
});

test("config validation: schedule needs exactly one of everyMinutes / dailyAt with the backend ranges", () => {
  const k = "killio.trigger.scheduled";
  assert.deepEqual(fields(k, { roomId: UUID, everyMinutes: 60 }), []);
  assert.deepEqual(fields(k, {}), ["roomId:room_required", "everyMinutes:schedule_one"]);
  assert.deepEqual(fields(k, { roomId: UUID, everyMinutes: 4 }), ["everyMinutes:every_range"]);
  assert.deepEqual(fields(k, { roomId: UUID, everyMinutes: 10081 }), ["everyMinutes:every_range"]);
  assert.deepEqual(fields(k, { roomId: UUID, dailyAt: "09:30", weekdays: [1, 2] }), []);
  assert.deepEqual(fields(k, { roomId: UUID, dailyAt: "25:00" }), ["dailyAt:daily_format"]);
  assert.deepEqual(fields(k, { roomId: UUID, dailyAt: "09:30", weekdays: [7] }), ["weekdays:weekdays_range"]);
  assert.deepEqual(fields(k, { roomId: UUID, everyMinutes: 10, dailyAt: "09:30" }), ["everyMinutes:schedule_one"]);
  assert.deepEqual(fields(k, { roomId: UUID, everyMinutes: 10, weekdays: [1] }), ["weekdays:weekdays_need_daily"]);
  assert.equal(scheduleModeOf({ dailyAt: "09:00" }), "daily");
  assert.equal(scheduleModeOf({ everyMinutes: 5 }), "every");
});

test("self-role and moderation nodes need their ids; the word list node has two outputs", () => {
  assert.deepEqual(fields("killio.team.assign_self_role", {}), ["roleId:role_required"]);
  assert.deepEqual(fields("killio.team.assign_self_role", { roleId: "r1" }), []);
  assert.deepEqual(fields("killio.moderation.mute_member", {}), ["userId:user_required"]);
  assert.deepEqual(fields("killio.moderation.kick_member", { userId: "u1" }), []);
  assert.deepEqual(ROOM_NODE_SPECS["core.condition.text_match_list"].outputs, ["match_true", "match_false"]);
  assert.equal(isBotScriptNodeKind("killio.team.assign_self_role"), true);
  assert.equal(isBotScriptNodeKind("killio.moderation.kick_member"), true);
});

test("config validation: member_join needs a room; command names; interaction ids", () => {
  assert.deepEqual(fields("killio.trigger.member_join", {}), ["roomId:room_required"]);
  assert.deepEqual(fields("killio.trigger.member_join", { roomId: UUID }), []);
  assert.deepEqual(fields("killio.trigger.command", { command: "/Hola" }), []);
  assert.deepEqual(fields("killio.trigger.command", { command: "ho la" }), ["command:command_name"]);
  assert.deepEqual(fields("killio.trigger.interaction", { customId: "vote:*" }), []);
  assert.deepEqual(fields("killio.trigger.interaction", { customId: "vote *" }), ["customId:custom_id_pattern"]);
});

test("config validation: actions need content, emoji, valid ids; blocks and components are checked with their own rules", () => {
  assert.deepEqual(fields("killio.room.reply", { text: "hola" }), []);
  assert.deepEqual(fields("killio.room.reply", {}), ["text:content_required"]);
  assert.deepEqual(fields("killio.room.reply", { blocks: [{ type: "text", text: "x" }] }), []);
  assert.deepEqual(fields("killio.room.reply", { blocksFrom: "myBlocks" }), []);
  assert.deepEqual(fields("killio.room.react", {}), ["emoji:emoji_required"]);
  assert.deepEqual(fields("killio.room.react", { emoji: "x", messageId: "nope" }), ["messageId:message_id_uuid"]);
  assert.deepEqual(fields("killio.room.react", { emoji: "x", messageId: "{{ messageId }}", roomId: UUID }), []);
  assert.deepEqual(fields("killio.room.send_message", { text: "x", roomId: "sala" }), ["roomId:room_uuid"]);
  assert.deepEqual(fields("killio.room.delete_message", {}), []);
  assert.deepEqual(fields("killio.room.pin_message", { expiresInMinutes: 0 }), ["expiresInMinutes:expires_range"]);
  const bad = validateRoomNode("killio.room.send_message", { text: "x", blocks: [{ type: "text", text: "" }], components: [{ components: [{ type: "button", label: "", style: "primary", customId: "a" }] }] });
  assert.deepEqual(bad.map((i) => i.code), ["blocks_invalid", "components_invalid"]);
  assert.equal(bad[0].blocks?.[0].code, "text_required");
  assert.equal(bad[1].components?.[0].code, "label_required");
});

test("only edit and respond can send an empty component list (remove) as opposed to leaving it out (unchanged)", () => {
  const clearable = Object.values(ROOM_NODE_SPECS).filter((s) => s.fields.some((f) => f.key === "components" && f.clearable)).map((s) => s.kind).sort();
  assert.deepEqual(clearable, ["killio.room.edit_message", "killio.room.respond_interaction"]);
  assert.deepEqual(fields("killio.room.respond_interaction", { text: "x", components: [] }), []);
});

test("bot script policy: allowed kinds follow the backend list", () => {
  for (const k of [...ROOM_TRIGGER_KINDS, ...ROOM_ACTION_KINDS, "core.action.delay", "core.action.http_request", "core.action.js_code", "core.action.ai_response", "core.transform.set_field", "core.logic.if_else", "core.filter.dedup", "core.condition.regex_match"]) {
    assert.equal(isBotScriptNodeKind(k), true, k);
  }
  for (const k of ["killio.action.create_card", "core.trigger.manual", "killio.table.write", "core.action.whatsapp_personal_send", "github.trigger.commit"]) assert.equal(isBotScriptNodeKind(k), false, k);
});

test("graph validation: a connected command -> reply graph is clean; the common mistakes are named", () => {
  const ok = [node("t", "killio.trigger.command", { command: "hola" }), node("r", "killio.room.reply", { text: "hola" })];
  assert.deepEqual(validateBotGraph(ok, [edge("t", "r")]), []);
  assert.deepEqual(validateBotGraph([], []), []);
  assert.deepEqual(validateBotGraph([node("r", "killio.room.reply", { text: "x" })], []).map((i) => i.code), ["no_trigger", "unreachable"]);
  assert.deepEqual(validateBotGraph([...ok, node("t2", "killio.trigger.command")], [edge("t", "r")]).map((i) => i.code), ["duplicate_trigger"]);
  assert.deepEqual(validateBotGraph([...ok, node("c", "killio.action.create_card")], [edge("t", "r"), edge("r", "c")]).map((i) => i.code), ["node_kind_not_allowed"]);
  assert.deepEqual(validateBotGraph(ok, []).map((i) => `${i.code}:${i.nodeId}`), ["unreachable:r"]);
  assert.deepEqual(validateBotGraph(ok, [edge("t", "r"), edge("t", "ghost")]).map((i) => i.code), ["edge_dangling"]);
  assert.deepEqual(validateBotGraph(ok, [edge("t", "r"), edge("r", "t")]).map((i) => i.code), ["trigger_has_input"]);
  const empty = validateBotGraph([node("t", "killio.trigger.command", {}), node("r", "killio.room.reply", {})], [edge("t", "r")]);
  assert.deepEqual(empty.map((i) => `${i.code}:${i.field}`), ["node_invalid:text"]);
  const twoTriggers = [node("a", "killio.trigger.command"), node("b", "killio.trigger.interaction"), node("r", "killio.room.reply", { text: "x" })];
  assert.deepEqual(validateBotGraph(twoTriggers, [edge("a", "r"), edge("b", "r")]), []);
});

test("graph with edges in the React Flow shape (source / target) is understood too", () => {
  const rf: GraphNodeLike[] = [{ id: "t", type: "killio.trigger.command", data: { config: { command: "hola" } } }, { id: "r", type: "killio.room.reply", data: { config: { text: "x" } } }];
  assert.deepEqual(validateBotGraph(rf, [{ source: "t", target: "r" }]), []);
});

test("the example template is a CONNECTED graph that the backend policy and this catalog accept", () => {
  let n = 0;
  const g = buildHelloScriptGraph("s1", () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, "Hola {options.nombre}");
  assert.deepEqual(g.nodes.map((x) => x.nodeKind), ["killio.trigger.command", "killio.room.reply"]);
  assert.equal(g.nodes[0].config.command, HELLO_COMMAND);
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].sourceNodeId, g.nodes[0].id);
  assert.equal(g.edges[0].targetNodeId, g.nodes[1].id);
  assert.equal(g.edges[0].sourceHandle, "output");
  assert.equal(g.edges[0].targetHandle, "input");
  assert.deepEqual(validateBotGraph(g.nodes, g.edges), []);
  const opts = buildHelloOptions({ name: "Nombre", tone: "Tono", formal: "Formal", casual: "Casual" });
  assert.deepEqual(validateOptions(opts), []);
  assert.equal(opts[0].required, true);
  const vars = names(availableVariables(g.nodes[1].id, g.nodes, g.edges, { commands: [{ name: HELLO_COMMAND, options: opts }] }));
  assert.ok(vars.includes("options.nombre") && vars.includes("options.tono"), "the reply text can use the declared options");
});

test("graph serialisation: the graph survives a JSON round trip and keeps ports and positions", () => {
  const g = buildHelloScriptGraph("s1", (() => { let i = 0; return () => `id${++i}`; })(), "x");
  const back = JSON.parse(JSON.stringify(g));
  assert.deepEqual(back, g);
  assert.ok(back.nodes.every((x: any) => Number.isFinite(x.positionX) && Number.isFinite(x.positionY)));
  assert.notEqual(back.nodes[0].positionX, back.nodes[1].positionX);
});
