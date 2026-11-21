import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyBotRoomStates, botBody, buildHelloCommand, commandOptionIssues, isBotScriptTriggerType, botHue, botRoomStates, botStatus, buildHelloScriptGraph, canManageBots, commandsPayload, normalizeBotList,
  normalizeCommandName, normalizeComposerCommands, readOverrides, sameStates, scriptEditorHref, validateBotForm, validateCommands,
} from "./model.ts";

test("normalizeBotList reads the manager shape and tolerates garbage", () => {
  const l = normalizeBotList({
    canManage: true,
    quota: { executed: 3, limit: 10, remaining: 7, exhausted: false },
    bots: [
      { id: "b1", userId: "u1", name: "Ayuda", isActive: true, commands: [{ name: "hola", description: "Saluda", usage: null }, { nope: 1 }], scriptId: "s1", scriptActive: false, roles: [{ id: "r1", name: "Bot", color: "#fff", position: 1 }] },
      { name: "sin id" },
      null,
    ],
  });
  assert.equal(l.canManage, true);
  assert.equal(l.quota?.remaining, 7);
  assert.equal(l.bots.length, 1);
  assert.deepEqual(l.bots[0].commands, [{ name: "hola", description: "Saluda", usage: null, options: [] }]);
  assert.deepEqual(l.bots[0].roleIds, ["r1"]);
  assert.equal(l.limits.maxBotsPerTeam, 20);
});

test("normalizeBotList: member view (public fields only) and bare arrays", () => {
  const l = normalizeBotList([{ id: "b", userId: "u", name: "X", isActive: false, commands: [] }]);
  assert.equal(l.canManage, false);
  assert.equal(l.quota, null);
  assert.equal(l.bots[0].scriptId, null);
  assert.equal(l.bots[0].isActive, false);
  assert.equal(normalizeBotList(null).bots.length, 0);
});

test("normalizeComposerCommands maps the flat commands answer", () => {
  const rows = normalizeComposerCommands([{ botId: "b", botUserId: "u", botName: "Ayuda", avatarUrl: "https://x/y.png", name: "hola", description: "d", usage: "/hola" }, { x: 1 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].botAvatarUrl, "https://x/y.png");
  assert.deepEqual(normalizeComposerCommands({}), []);
});

test("commands carry their typed options through the readers and the PUT body", () => {
  const options = [{ name: "nombre", description: "Quien", type: "string", required: true, maxLength: 40 }, { name: "x", type: "bogus" }];
  const bot = normalizeBotList([{ id: "b", userId: "u", name: "X", commands: [{ name: "hola", description: "d", options }] }]).bots[0];
  assert.equal(bot.commands[0].options.length, 1);
  assert.equal(bot.commands[0].options[0].maxLength, 40);
  const flat = normalizeComposerCommands([{ botId: "b", botName: "X", name: "hola", description: "", options: [{ name: "t", type: "string", choices: [{ name: "A", value: "a" }] }] }]);
  assert.equal(flat[0].options[0].choices?.[0].value, "a");
  const body = commandsPayload([{ name: "/Hola", description: "d", usage: "", options: [{ name: " Nombre ", description: "", type: "string", required: true, min: 5 }] }]);
  assert.deepEqual(body.commands[0], { name: "hola", description: "d", usage: null, options: [{ name: "nombre", description: "", type: "string", required: true }] });
  assert.deepEqual(commandsPayload([{ name: "viejo", description: "", usage: "/viejo" }]).commands[0].options, []);
});

test("the example command is accepted by the backend rules and survives the PUT body untouched", () => {
  const cmd = buildHelloCommand({ description: "Saluda", name: "Nombre", tone: "Tono", formal: "Formal", casual: "Casual" });
  assert.equal(cmd.name, "hola");
  assert.equal(commandOptionIssues([cmd]).size, 0);
  const body = commandsPayload([cmd]).commands[0];
  assert.deepEqual(body.options.map((o) => [o.name, o.type, o.required ?? false]), [["nombre", "string", true], ["tono", "string", false]]);
  assert.deepEqual(body.options[1].choices, [{ name: "Formal", value: "formal" }, { name: "Casual", value: "casual" }]);
  assert.equal(body.usage, null);
});

test("option problems are reported per command row", () => {
  const issues = commandOptionIssues([
    { name: "a", description: "", options: [{ name: "ok", description: "", type: "string" }] },
    { name: "b", description: "", options: [{ name: "x", description: "", type: "string" }, { name: "y", description: "", type: "string", required: true }] },
  ]);
  assert.equal(issues.has(0), false);
  assert.equal(issues.get(1)?.[0].code, "required_order");
});

test("only scripts with a bot trigger can be bound to a bot", () => {
  for (const t of ["room_message", "command", "interaction", "reaction_added", "message_edited", "message_deleted", "member_join", "schedule"]) assert.equal(isBotScriptTriggerType(t), true, t);
  for (const t of ["manual", "webhook", "github.commit", "whatsapp_incoming"]) assert.equal(isBotScriptTriggerType(t), false, t);
});

test("command names are normalised and validated like the backend", () => {
  assert.equal(normalizeCommandName("  /Hola "), "hola");
  const issues = validateCommands([{ name: "hola", description: "" }, { name: "/HOLA", description: "" }, { name: "con espacio", description: "" }, { name: "ok_1-x", description: "" }, { name: "", description: "" }]);
  assert.equal(issues.get(0), undefined);
  assert.equal(issues.get(1), "duplicate");
  assert.equal(issues.get(2), "invalid");
  assert.equal(issues.get(3), undefined);
  assert.equal(issues.get(4), "invalid");
  assert.equal(validateCommands(Array.from({ length: 51 }, (_, i) => ({ name: `c${i}`, description: "" }))).get(50), "limit");
  assert.equal(validateCommands([{ name: "a".repeat(33), description: "" }]).get(0), "invalid");
});

test("commandsPayload trims, clamps and nulls an empty usage", () => {
  const p = commandsPayload([{ name: "/Hola", description: ` ${"x".repeat(300)} `, usage: "  " }]);
  assert.equal(p.commands[0].name, "hola");
  assert.equal(p.commands[0].description.length, 200);
  assert.equal(p.commands[0].usage, null);
});

test("bot form validation: name, description and https avatar", () => {
  assert.deepEqual(validateBotForm({ name: "Ayuda", description: "", avatarUrl: "" }), []);
  assert.deepEqual(validateBotForm({ name: "  ", description: "", avatarUrl: "" }), ["name_required"]);
  assert.deepEqual(validateBotForm({ name: "x".repeat(81), description: "y".repeat(501), avatarUrl: "http://a/b.png" }), ["name_long", "description_long", "avatar_invalid"]);
  assert.deepEqual(botBody({ name: " A ", description: " ", avatarUrl: "" }), { name: "A", description: null, avatarUrl: null });
  assert.equal(botBody({ name: "A", description: "", avatarUrl: "", allowBotTriggers: true }).allowBotTriggers, true);
});

test("botHue is stable and in range; canManageBots; botStatus", () => {
  assert.equal(botHue("Ayuda"), botHue("Ayuda"));
  assert.ok(botHue("zzz") >= 0 && botHue("zzz") < 360);
  assert.equal(canManageBots(() => false, true), true);
  assert.equal(canManageBots((p) => p === "bots.manage", false), true);
  assert.equal(canManageBots(() => false, false), false);
  assert.equal(botStatus({ isActive: false, scriptId: "s", scriptActive: true }), "paused");
  assert.equal(botStatus({ isActive: true, scriptId: null, scriptActive: null }), "script_missing");
  assert.equal(botStatus({ isActive: true, scriptId: "s", scriptActive: false }), "script_inactive");
  assert.equal(botStatus({ isActive: true, scriptId: "s", scriptActive: true }), "active");
});

test("room permissions of a bot: read, change only its keys, keep everything else", () => {
  const raw = readOverrides({
    overrides: [
      { subjectType: "everyone", subjectId: null, allow: [], deny: ["room.post"] },
      { subjectType: "member", subjectId: "bot-u", allow: ["room.view", "room.future_key"], deny: ["room.react"] },
      { subjectType: "role", subjectId: "r", allow: ["room.pin"], deny: [] },
    ],
  });
  const s = botRoomStates(raw, "bot-u");
  assert.deepEqual(s, { "room.view": "allow", "room.post": "inherit", "room.react": "deny" });
  const next = applyBotRoomStates(raw, "bot-u", { ...s, "room.post": "allow", "room.react": "inherit" });
  assert.equal(next.length, 3);
  const mine = next.find((o) => o.subjectId === "bot-u")!;
  assert.deepEqual([...mine.allow].sort(), ["room.future_key", "room.post", "room.view"]);
  assert.deepEqual(mine.deny, []);
  assert.deepEqual(next.find((o) => o.subjectType === "role")!.allow, ["room.pin"]);
  const clear = applyBotRoomStates(readOverrides([{ subjectType: "member", subjectId: "bot-u", allow: ["room.view"], deny: [] }]), "bot-u", { "room.view": "inherit", "room.post": "inherit", "room.react": "inherit" });
  assert.deepEqual(clear, []);
  assert.equal(sameStates(s, { ...s }), true);
  assert.equal(sameStates(s, { ...s, "room.post": "deny" }), false);
  assert.equal(applyBotRoomStates([], "x", { "room.view": "allow", "room.post": "inherit", "room.react": "inherit" })[0].subjectType, "member");
});

test("example script: one command trigger wired to one reply, only allowed kinds", () => {
  let n = 0;
  const g = buildHelloScriptGraph("s1", () => `id${++n}`, "Hola {options.nombre}");
  assert.deepEqual(g.nodes.map((x) => x.nodeKind), ["killio.trigger.command", "killio.room.reply"]);
  assert.equal(g.nodes[0].config.command, "hola");
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].sourceNodeId, g.nodes[0].id);
  assert.equal(g.edges[0].targetNodeId, g.nodes[1].id);
  assert.ok(g.nodes.every((x) => x.scriptId === "s1"));
  assert.equal(scriptEditorHref("a b"), "/scripts?script=a%20b");
});

test("example script: edge uses the backend handles and no node is left orphan", () => {
  // Handles as declared by the backend node definitions (scripts/node-definitions.ts).
  const defs: Record<string, { inputHandles: string[]; outputHandles: string[] }> = {
    "killio.trigger.command": { inputHandles: [], outputHandles: ["output"] },
    "killio.room.reply": { inputHandles: ["input"], outputHandles: ["output"] },
  };
  let n = 0;
  const g = buildHelloScriptGraph("s1", () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, "Hola");
  const [edge] = g.edges;
  const source = g.nodes.find((x) => x.id === edge.sourceNodeId)!;
  const target = g.nodes.find((x) => x.id === edge.targetNodeId)!;
  assert.equal(source.nodeKind, "killio.trigger.command");
  assert.equal(target.nodeKind, "killio.room.reply");
  assert.ok(defs[source.nodeKind].outputHandles.includes(edge.sourceHandle as string));
  assert.ok(defs[target.nodeKind].inputHandles.includes(edge.targetHandle as string));
  assert.equal(edge.scriptId, "s1");
  const touched = new Set(g.edges.flatMap((e) => [e.sourceNodeId, e.targetNodeId]));
  assert.ok(g.nodes.every((x) => touched.has(x.id)), "orphan node");
  assert.equal(new Set(g.nodes.map((x) => x.id).concat(g.edges.map((e) => e.id))).size, 3, "ids must be unique");
  // /hola is answered because the command trigger filters by the registered command name (the dispatcher routes it to the bot that owns it).
  assert.equal(g.nodes[0].config.command, "hola");
  assert.equal(g.nodes[1].config.text, "Hola");
});
