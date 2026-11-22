/**
 * Catalog of the room / bot nodes of the script editor: every trigger and action the backend runs for bots, with its ports,
 * default configuration, property fields, the payload variables it emits, the validation of its configuration and the
 * validation of a whole bot graph. Pure (no React, no icons: `icon` is a name the UI maps), tested in room-nodes.test.ts.
 * Contract: Killio-Backend/src/modules/scripts/node-definitions.ts, nodes/bot-event-trigger.nodes.ts, nodes/room-bot-action.node.ts,
 * nodes/command-trigger.node.ts, nodes/interaction-trigger.node.ts, bot-script-policy.ts, bots/bot-schedule.ts.
 * Nothing here invents a parameter: a field exists only where the backend's configSchema has it.
 */
import { validateComponents, validateModal, type ComponentIssue, type ModalIssue } from "./components.ts";
import { validateBlocks, type BlockIssue } from "./rich.ts";
import type { CommandOption } from "./options.ts";
import { isValueType } from "./options.ts";

export const ROOM_TRIGGER_KINDS = [
  "killio.trigger.room_message",
  "killio.trigger.command",
  "killio.trigger.interaction",
  "killio.trigger.reaction_added",
  "killio.trigger.message_edited",
  "killio.trigger.message_deleted",
  "killio.trigger.member_join",
  "killio.trigger.scheduled",
] as const;

export const ROOM_ACTION_KINDS = [
  "killio.room.send_message",
  "killio.room.reply",
  "killio.room.edit_message",
  "killio.room.delete_message",
  "killio.room.pin_message",
  "killio.room.create_thread",
  "killio.room.react",
  "killio.room.unreact",
  "killio.room.send_dm",
  "killio.room.respond_interaction",
  "killio.team.assign_self_role",
  "killio.team.remove_self_role",
  "killio.moderation.mute_member",
  "killio.moderation.kick_member",
  "killio.room.count_recent_messages",
  "killio.team.member_info",
  "core.condition.text_match_list",
  "core.transform.count_matches",
] as const;

export type RoomTriggerKind = (typeof ROOM_TRIGGER_KINDS)[number];
export type RoomActionKind = (typeof ROOM_ACTION_KINDS)[number];
export type RoomNodeKind = RoomTriggerKind | RoomActionKind;

export type FieldKind =
  | "room"        // channel picker (or a variable)
  | "user"        // person picker (or a variable)
  | "line"        // one-line template
  | "template"    // multi-line template with variable autocomplete
  | "boolean"
  | "select"
  | "number"
  | "emoji"
  | "command"     // one of the commands of the bot (or free text)
  | "subcommand"
  | "lines"       // list of texts, one per line (stored as an array)
  | "weekdays"
  | "blocks"      // rich content editor
  | "components"  // buttons / toggles / selects editor
  | "modal";      // modal a script opens (respond_interaction mode "modal")

export interface RoomField {
  key: string;
  kind: FieldKind;
  /** Values of a `select` (translated under `canvas.room.fields.<key>.options.<value>`). */
  options?: readonly string[];
  /** Show only while another field has one of these values (compared as text). */
  showWhen?: { key: string; isIn: readonly string[] };
  /** The field is required for the node to run. */
  required?: boolean;
  /** Components only: an EMPTY list means "remove the message's components" (edit / respond), different from leaving the key out ("unchanged"). */
  clearable?: boolean;
}

export interface PayloadVar {
  /** Name usable in a template (`{name}` / `{{ name }}`), dotted for nested values. */
  name: string;
  /** Translated under `canvas.room.vars.<name with "." -> "_">`; dynamic option variables carry their own text. */
  text?: string;
}

export type NodeRole = "trigger" | "action";

export interface RoomNodeSpec {
  kind: RoomNodeKind;
  role: NodeRole;
  /** Key under `integrations.canvas.nodes` (title) and `canvas.room.nodes` (description). */
  labelKey: string;
  /** Lucide icon name, mapped by the UI. */
  icon: string;
  /** Header colour classes (literal so Tailwind keeps them). */
  color: string;
  ring: string;
  hasInput: boolean;
  /** Output ports (default: just `output`). */
  outputs?: readonly string[];
  /** Config a node dropped from the palette starts with. */
  defaults: Record<string, unknown>;
  fields: readonly RoomField[];
  /** Variables the node adds to the item (triggers: the payload; actions: the result key). */
  emits: readonly PayloadVar[];
  searchTerms: readonly string[];
  /** The backend refuses a bot script without this being the only node of its kind. */
  oncePerScript: boolean;
}

const V = (...names: string[]): PayloadVar[] => names.map((name) => ({ name }));

const COMMON_TRIGGER = ["roomId", "receivedAt"];
const PERSON = ["invokedBy", "invokedByName", "authorUserId", "authorName", "authorIsBot"];

const contentFields = (clearComponents = false, showWhen?: RoomField["showWhen"]): RoomField[] => [
  { key: "text", kind: "template", ...(showWhen ? { showWhen } : {}) },
  { key: "blocks", kind: "blocks", ...(showWhen ? { showWhen } : {}) },
  { key: "blocksFrom", kind: "line", ...(showWhen ? { showWhen } : {}) },
  { key: "components", kind: "components", ...(clearComponents ? { clearable: true } : {}), ...(showWhen ? { showWhen } : {}) },
  { key: "componentsFrom", kind: "line", ...(showWhen ? { showWhen } : {}) },
  { key: "expiresInMinutes", kind: "number", ...(showWhen ? { showWhen } : {}) },
];
const CONTENT_FIELDS: RoomField[] = contentFields();

const TRIGGER_COLOR = "bg-sky-700";
const ACTION_COLOR = "bg-sky-600";

const trigger = (p: Omit<RoomNodeSpec, "role" | "hasInput" | "color" | "ring" | "oncePerScript">): RoomNodeSpec => ({ ...p, role: "trigger", hasInput: false, color: TRIGGER_COLOR, ring: "border-sky-500", oncePerScript: true });
const action = (p: Omit<RoomNodeSpec, "role" | "hasInput" | "color" | "ring" | "oncePerScript">): RoomNodeSpec => ({ ...p, role: "action", hasInput: true, color: ACTION_COLOR, ring: "border-sky-500", oncePerScript: false });

export const ROOM_NODE_SPECS: Readonly<Record<RoomNodeKind, RoomNodeSpec>> = {
  "killio.trigger.room_message": trigger({
    kind: "killio.trigger.room_message", labelKey: "roomMessageTrigger", icon: "MessageSquareText",
    defaults: { commandPrefix: "", matchMode: "all" },
    fields: [
      { key: "commandPrefix", kind: "line" },
      { key: "requireMention", kind: "boolean" },
      { key: "matchMode", kind: "select", options: ["all", "any"] },
      { key: "roomId", kind: "room" },
    ],
    emits: V("text", "message", "command", "args", "authorUserId", "authorName", "authorIsBot", "mentionsBot", ...COMMON_TRIGGER, "messageId"),
    searchTerms: ["room", "sala", "bot", "chat", "mensaje", "message", "prefix", "prefijo"],
  }),
  "killio.trigger.command": trigger({
    kind: "killio.trigger.command", labelKey: "roomCommandTrigger", icon: "SquareSlash",
    defaults: { command: "" },
    fields: [
      { key: "command", kind: "command" },
      { key: "subcommand", kind: "subcommand" },
      { key: "roomId", kind: "room" },
    ],
    emits: V("command", "subcommandGroup", "subcommand", "options", "invokedBy", "invokedByName", "authorUserId", "authorName", "authorIsBot", "text", "args", "messageId", ...COMMON_TRIGGER),
    searchTerms: ["command", "comando", "slash", "bot", "options", "argumentos", "opciones"],
  }),
  "killio.trigger.interaction": trigger({
    kind: "killio.trigger.interaction", labelKey: "roomInteractionTrigger", icon: "MousePointerClick",
    defaults: { customId: "" },
    fields: [{ key: "customId", kind: "line" }, { key: "roomId", kind: "room" }],
    emits: V("customId", "values", "value", "componentType", "invokedBy", "invokedByName", "authorUserId", "authorName", "authorIsBot", "messageId", "botMessageId", "interactionId", ...COMMON_TRIGGER),
    searchTerms: ["interaction", "interaccion", "button", "boton", "select", "component", "componente", "click"],
  }),
  "killio.trigger.reaction_added": trigger({
    kind: "killio.trigger.reaction_added", labelKey: "roomReactionTrigger", icon: "SmilePlus",
    defaults: {},
    fields: [{ key: "emoji", kind: "emoji" }, { key: "onlyOwnMessages", kind: "boolean" }, { key: "roomId", kind: "room" }],
    emits: V("messageId", "emoji", ...PERSON, "messageAuthorUserId", "messageText", ...COMMON_TRIGGER),
    searchTerms: ["reaction", "reaccion", "emoji", "bot"],
  }),
  "killio.trigger.message_edited": trigger({
    kind: "killio.trigger.message_edited", labelKey: "roomEditedTrigger", icon: "PencilLine",
    defaults: {},
    fields: [{ key: "roomId", kind: "room" }],
    emits: V("messageId", "text", "authorUserId", "authorName", "invokedBy", "authorIsBot", ...COMMON_TRIGGER),
    searchTerms: ["edited", "editado", "edit", "message", "mensaje"],
  }),
  "killio.trigger.message_deleted": trigger({
    kind: "killio.trigger.message_deleted", labelKey: "roomDeletedTrigger", icon: "Trash2",
    defaults: {},
    fields: [{ key: "roomId", kind: "room" }],
    emits: V("messageId", "previousText", "authorUserId", "deletedBy", "deletedByName", "invokedBy", "authorIsBot", ...COMMON_TRIGGER),
    searchTerms: ["deleted", "borrado", "delete", "message", "mensaje"],
  }),
  "killio.trigger.member_join": trigger({
    kind: "killio.trigger.member_join", labelKey: "roomMemberJoinTrigger", icon: "UserPlus",
    defaults: {},
    fields: [{ key: "roomId", kind: "room", required: true }],
    emits: V("teamId", "userId", "userName", "invokedBy", "authorUserId", "authorName", "authorIsBot", "joinedAt", ...COMMON_TRIGGER),
    searchTerms: ["join", "member", "miembro", "welcome", "bienvenida", "alta"],
  }),
  "killio.trigger.scheduled": trigger({
    kind: "killio.trigger.scheduled", labelKey: "roomScheduledTrigger", icon: "CalendarClock",
    defaults: { everyMinutes: 60 },
    fields: [
      { key: "roomId", kind: "room", required: true },
      { key: "scheduleMode", kind: "select", options: ["every", "daily"] },
      { key: "everyMinutes", kind: "number", showWhen: { key: "scheduleMode", isIn: ["every"] } },
      { key: "dailyAt", kind: "line", showWhen: { key: "scheduleMode", isIn: ["daily"] } },
      { key: "weekdays", kind: "weekdays", showWhen: { key: "scheduleMode", isIn: ["daily"] } },
    ],
    emits: V("scheduledFor", "lastRunAt", ...COMMON_TRIGGER),
    searchTerms: ["scheduled", "programado", "cron", "timer", "daily", "diario", "every", "cada"],
  }),

  "killio.room.send_message": action({
    kind: "killio.room.send_message", labelKey: "roomSendMessage", icon: "Send",
    defaults: { text: "" },
    fields: [{ key: "roomId", kind: "room" }, ...CONTENT_FIELDS, { key: "ephemeral", kind: "boolean" }],
    emits: V("roomSendResult", "botMessageId"),
    searchTerms: ["send", "enviar", "message", "mensaje", "room", "sala", "bot", "post"],
  }),
  "killio.room.reply": action({
    kind: "killio.room.reply", labelKey: "roomReply", icon: "Reply",
    defaults: { text: "" },
    fields: [{ key: "messageId", kind: "line" }, { key: "roomId", kind: "room" }, ...CONTENT_FIELDS, { key: "ephemeral", kind: "boolean" }, { key: "inThread", kind: "boolean" }],
    emits: V("roomSendResult", "botMessageId"),
    searchTerms: ["reply", "responder", "respuesta", "thread", "hilo", "bot"],
  }),
  "killio.room.edit_message": action({
    kind: "killio.room.edit_message", labelKey: "roomEditMessage", icon: "Pencil",
    defaults: { text: "" },
    fields: [{ key: "messageId", kind: "line" }, { key: "roomId", kind: "room" }, ...contentFields(true)],
    emits: V("roomEditResult"),
    searchTerms: ["edit", "editar", "message", "mensaje", "update", "actualizar"],
  }),
  "killio.room.delete_message": action({
    kind: "killio.room.delete_message", labelKey: "roomDeleteMessage", icon: "Trash2",
    defaults: {},
    fields: [{ key: "messageId", kind: "line" }, { key: "roomId", kind: "room" }, { key: "moderate", kind: "boolean" }],
    emits: V("roomDeleteResult"),
    searchTerms: ["delete", "borrar", "eliminar", "message", "mensaje"],
  }),
  "killio.room.pin_message": action({
    kind: "killio.room.pin_message", labelKey: "roomPinMessage", icon: "Pin",
    defaults: {},
    fields: [
      { key: "messageId", kind: "line" },
      { key: "roomId", kind: "room" },
      { key: "unpin", kind: "boolean" },
      { key: "expiresInMinutes", kind: "number", showWhen: { key: "unpin", isIn: ["", "false"] } },
      { key: "replaceOldest", kind: "boolean", showWhen: { key: "unpin", isIn: ["", "false"] } },
    ],
    emits: V("roomPinResult"),
    searchTerms: ["pin", "anclar", "fijar", "unpin", "desanclar"],
  }),
  "killio.room.create_thread": action({
    kind: "killio.room.create_thread", labelKey: "roomCreateThread", icon: "MessagesSquare",
    defaults: { text: "" },
    fields: [{ key: "messageId", kind: "line" }, { key: "roomId", kind: "room" }, ...CONTENT_FIELDS],
    emits: V("roomThreadResult", "botMessageId"),
    searchTerms: ["thread", "hilo", "create", "crear", "reply"],
  }),
  "killio.room.react": action({
    kind: "killio.room.react", labelKey: "roomReact", icon: "SmilePlus",
    defaults: { emoji: "👍" },
    fields: [{ key: "emoji", kind: "emoji", required: true }, { key: "messageId", kind: "line" }, { key: "roomId", kind: "room" }],
    emits: V("roomReactResult"),
    searchTerms: ["room", "sala", "bot", "emoji", "reaction", "reaccion"],
  }),
  "killio.room.unreact": action({
    kind: "killio.room.unreact", labelKey: "roomUnreact", icon: "Eraser",
    defaults: { emoji: "👍" },
    fields: [{ key: "emoji", kind: "emoji", required: true }, { key: "messageId", kind: "line" }, { key: "roomId", kind: "room" }],
    emits: V("roomReactResult"),
    searchTerms: ["unreact", "quitar", "reaction", "reaccion", "remove"],
  }),
  "killio.room.send_dm": action({
    kind: "killio.room.send_dm", labelKey: "roomSendDm", icon: "Mail",
    defaults: { text: "" },
    fields: [{ key: "userId", kind: "user" }, ...CONTENT_FIELDS],
    emits: V("roomDmResult"),
    searchTerms: ["dm", "direct", "directo", "privado", "private", "message", "mensaje"],
  }),
  "killio.team.assign_self_role": action({
    kind: "killio.team.assign_self_role", labelKey: "teamAssignSelfRole", icon: "UserPlus",
    defaults: {},
    fields: [{ key: "roleId", kind: "line", required: true }, { key: "userId", kind: "user" }],
    emits: V("selfRoleResult"),
    searchTerms: ["role", "rol", "assign", "asignar", "self", "autoasignable", "reaction", "reaccion"],
  }),
  "killio.team.remove_self_role": action({
    kind: "killio.team.remove_self_role", labelKey: "teamRemoveSelfRole", icon: "Eraser",
    defaults: {},
    fields: [{ key: "roleId", kind: "line", required: true }, { key: "userId", kind: "user" }],
    emits: V("selfRoleResult"),
    searchTerms: ["role", "rol", "remove", "quitar", "self", "autoasignable"],
  }),
  "killio.moderation.mute_member": action({
    kind: "killio.moderation.mute_member", labelKey: "modMuteMember", icon: "Pin",
    defaults: { minutes: 10 },
    fields: [{ key: "userId", kind: "line", required: true }, { key: "minutes", kind: "number" }, { key: "reason", kind: "line" }],
    emits: V("moderationResult"),
    searchTerms: ["mute", "silenciar", "moderation", "moderacion"],
  }),
  "killio.moderation.kick_member": action({
    kind: "killio.moderation.kick_member", labelKey: "modKickMember", icon: "Trash2",
    defaults: {},
    fields: [{ key: "userId", kind: "line", required: true }, { key: "reason", kind: "line" }],
    emits: V("moderationResult"),
    searchTerms: ["kick", "expulsar", "moderation", "moderacion"],
  }),
  "killio.room.count_recent_messages": action({
    kind: "killio.room.count_recent_messages", labelKey: "roomCountRecent", icon: "MessagesSquare",
    defaults: { windowSeconds: 10, outputPath: "recentMessages" },
    fields: [{ key: "roomId", kind: "room" }, { key: "userId", kind: "user" }, { key: "windowSeconds", kind: "number" }, { key: "outputPath", kind: "line" }],
    emits: V("recentMessages"),
    searchTerms: ["count", "contar", "spam", "recent", "recientes", "flood"],
  }),
  "killio.team.member_info": action({
    kind: "killio.team.member_info", labelKey: "teamMemberInfo", icon: "UserPlus",
    defaults: { newMemberHours: 24 },
    fields: [{ key: "userId", kind: "user" }, { key: "roleIds", kind: "lines" }, { key: "newMemberHours", kind: "number" }],
    emits: V("member"),
    searchTerms: ["member", "miembro", "info", "new", "nuevo", "exempt", "exento"],
  }),
  "core.condition.text_match_list": action({
    kind: "core.condition.text_match_list", labelKey: "condTextMatchList", icon: "SquareSlash",
    defaults: { field: "text", mode: "word", caseInsensitive: true, ignoreAccents: true },
    fields: [
      { key: "field", kind: "line" },
      { key: "words", kind: "lines" },
      { key: "wordsFrom", kind: "line" },
      { key: "mode", kind: "select", options: ["word", "contains", "exact"] },
      { key: "caseInsensitive", kind: "boolean" },
      { key: "ignoreAccents", kind: "boolean" },
    ],
    outputs: ["match_true", "match_false"],
    emits: V("__matched", "matchedWords"),
    searchTerms: ["match", "words", "palabras", "filter", "filtro", "automod", "list"],
  }),
  "core.transform.count_matches": action({
    kind: "core.transform.count_matches", labelKey: "transCountMatches", icon: "Pencil",
    defaults: { field: "text", preset: "mentions", outputPath: "matchCount" },
    fields: [
      { key: "field", kind: "line" },
      { key: "preset", kind: "select", options: ["mentions", "links", "custom"] },
      { key: "pattern", kind: "line", showWhen: { key: "preset", isIn: ["custom"] } },
      { key: "outputPath", kind: "line" },
    ],
    emits: V("matchCount"),
    searchTerms: ["count", "contar", "mentions", "menciones", "links", "enlaces", "regex"],
  }),
  "killio.room.respond_interaction": action({
    kind: "killio.room.respond_interaction", labelKey: "roomRespondInteraction", icon: "MessageSquareReply",
    defaults: { mode: "update_message", text: "" },
    fields: [
      { key: "mode", kind: "select", options: ["update_message", "ephemeral", "message", "modal"] },
      { key: "modal", kind: "modal", showWhen: { key: "mode", isIn: ["modal"] } },
      ...contentFields(true, { key: "mode", isIn: ["", "update_message", "ephemeral", "message"] }),
    ],
    emits: V("roomInteractionResult"),
    searchTerms: ["respond", "responder", "interaction", "interaccion", "button", "boton", "update", "ephemeral"],
  }),
};

export const isRoomNodeKind = (kind: string | null | undefined): kind is RoomNodeKind => !!kind && Object.prototype.hasOwnProperty.call(ROOM_NODE_SPECS, kind);
export const isRoomTriggerKind = (kind: string | null | undefined): kind is RoomTriggerKind => isRoomNodeKind(kind) && ROOM_NODE_SPECS[kind].role === "trigger";
export const specOf = (kind: string): RoomNodeSpec | null => (isRoomNodeKind(kind) ? ROOM_NODE_SPECS[kind] : null);

/** The palette section "Rooms and bots": triggers first, then actions, each group in the catalog order. */
export function roomPaletteSections(): Array<{ role: NodeRole; specs: RoomNodeSpec[] }> {
  const all = Object.values(ROOM_NODE_SPECS);
  return [
    { role: "trigger", specs: all.filter((s) => s.role === "trigger") },
    { role: "action", specs: all.filter((s) => s.role === "action") },
  ];
}

/* ───────────── payload variables ───────────── */

export interface VariableContext {
  /** Commands of the bot this script is bound to (their options feed `options.<name>`). */
  commands?: ReadonlyArray<{ name: string; options: readonly CommandOption[] }>;
}

export const varI18nKey = (name: string) => name.replace(/\./g, "_");

/** Leaf options of a command (optionally of one subcommand), flattened. */
export function leafOptions(options: readonly CommandOption[], subcommand?: string): CommandOption[] {
  const out: CommandOption[] = [];
  const walk = (list: readonly CommandOption[]) => {
    for (const o of list) {
      if (isValueType(o.type)) out.push(o);
      else if (o.type === "subcommand") {
        if (!subcommand || o.name === subcommand) walk(o.options ?? []);
      } else walk(o.options ?? []);
    }
  };
  walk(options);
  const seen = new Set<string>();
  return out.filter((o) => (seen.has(o.name) ? false : (seen.add(o.name), true)));
}

/** Subcommand names (leaf level) of a command, for the trigger's filter. */
export function subcommandNames(options: readonly CommandOption[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly CommandOption[]) => {
    for (const o of list) {
      if (o.type === "subcommand") out.push(o.name);
      else if (o.type === "subcommand_group") walk(o.options ?? []);
    }
  };
  walk(options);
  return [...new Set(out)];
}

const normCmd = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/^\//, "");

/** Variables a trigger node puts in the item. For a command trigger, one `options.<name>` per declared option. */
export function triggerVariables(kind: RoomTriggerKind, config: Record<string, unknown> = {}, ctx: VariableContext = {}): PayloadVar[] {
  const base = ROOM_NODE_SPECS[kind].emits.map((v) => ({ ...v }));
  if (kind !== "killio.trigger.command") return base;
  const wanted = normCmd(config.command);
  const cmds = (ctx.commands ?? []).filter((c) => !wanted || c.name.toLowerCase() === wanted);
  const sub = normCmd(config.subcommand) || undefined;
  const seen = new Set<string>();
  for (const c of cmds) {
    for (const o of leafOptions(c.options, sub)) {
      const name = `options.${o.name}`;
      if (seen.has(name)) continue;
      seen.add(name);
      base.push({ name, text: o.description || o.type });
    }
  }
  return base;
}

export interface GraphNodeLike { id: string; type?: string | null; nodeKind?: string | null; config?: Record<string, unknown> | null; data?: { config?: Record<string, unknown> } | null }
export interface GraphEdgeLike { source?: string; target?: string; sourceNodeId?: string; targetNodeId?: string }

const kindOf = (n: GraphNodeLike) => String(n.nodeKind ?? n.type ?? "");
const configOf = (n: GraphNodeLike): Record<string, unknown> => (n.config ?? n.data?.config ?? {}) as Record<string, unknown>;
const srcOf = (e: GraphEdgeLike) => String(e.sourceNodeId ?? e.source ?? "");
const dstOf = (e: GraphEdgeLike) => String(e.targetNodeId ?? e.target ?? "");

/**
 * Variables available to a node: those of every room trigger upstream (any path) plus the result keys of the room actions upstream.
 * Order: nearest results first would be nicer for people, but a stable order (triggers, then actions as found) keeps the list predictable.
 */
export function availableVariables(nodeId: string, nodes: readonly GraphNodeLike[], edges: readonly GraphEdgeLike[], ctx: VariableContext = {}): PayloadVar[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    const list = parents.get(dstOf(e)) ?? [];
    list.push(srcOf(e));
    parents.set(dstOf(e), list);
  }
  const seen = new Set<string>();
  const upstream: GraphNodeLike[] = [];
  const stack = [...(parents.get(nodeId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || id === nodeId) continue;
    seen.add(id);
    const n = byId.get(id);
    if (n) upstream.push(n);
    stack.push(...(parents.get(id) ?? []));
  }
  const out: PayloadVar[] = [];
  const names = new Set<string>();
  const push = (v: PayloadVar) => names.has(v.name) || (names.add(v.name), out.push(v));
  for (const n of upstream.filter((x) => isRoomTriggerKind(kindOf(x)))) triggerVariables(kindOf(n) as RoomTriggerKind, configOf(n), ctx).forEach(push);
  for (const n of upstream.filter((x) => isRoomNodeKind(kindOf(x)) && !isRoomTriggerKind(kindOf(x)))) ROOM_NODE_SPECS[kindOf(n) as RoomNodeKind].emits.forEach(push);
  return out;
}

/** Variables when the trigger of the node cannot be traced (a node not connected yet): the union of every trigger present. */
export function fallbackVariables(nodes: readonly GraphNodeLike[], ctx: VariableContext = {}): PayloadVar[] {
  const out: PayloadVar[] = [];
  const names = new Set<string>();
  for (const n of nodes.filter((x) => isRoomTriggerKind(kindOf(x)))) {
    for (const v of triggerVariables(kindOf(n) as RoomTriggerKind, configOf(n), ctx)) if (!names.has(v.name)) { names.add(v.name); out.push(v); }
  }
  return out;
}

/** An example payload for the "payload preview" of a trigger (strings are placeholders, ids are valid-looking uuids). */
export function samplePayload(kind: RoomTriggerKind, config: Record<string, unknown> = {}, ctx: VariableContext = {}): { externalKey: string; data: Record<string, unknown> } {
  const room = "00000000-0000-4000-8000-000000000002";
  const msg = "00000000-0000-4000-8000-000000000001";
  const user = "00000000-0000-4000-8000-000000000003";
  const now = "2026-01-01T09:00:00.000Z";
  const person = { invokedBy: user, invokedByName: "Ana", authorUserId: user, authorName: "Ana", authorIsBot: false };
  switch (kind) {
    case "killio.trigger.room_message":
      return { externalKey: msg, data: { roomId: room, messageId: msg, text: "/hola mundo", message: "/hola mundo", command: "hola", args: "mundo", authorUserId: user, authorName: "Ana", authorIsBot: false, mentionsBot: false, receivedAt: now } };
    case "killio.trigger.command": {
      const opts: Record<string, unknown> = {};
      for (const v of triggerVariables(kind, config, ctx)) if (v.name.startsWith("options.")) opts[v.name.slice(8)] = `<${v.name.slice(8)}>`;
      return { externalKey: msg, data: { roomId: room, messageId: msg, command: normCmd(config.command) || "hola", subcommandGroup: null, subcommand: normCmd(config.subcommand) || null, options: opts, ...person, text: "/hola", args: "", receivedAt: now } };
    }
    case "killio.trigger.interaction":
      return { externalKey: "interaction-1", data: { roomId: room, messageId: msg, botMessageId: msg, interactionId: "interaction-1", customId: String(config.customId ?? "").replace(/\*$/, "") || "vote:yes", componentType: "button", values: [], value: "", ...person, receivedAt: now } };
    case "killio.trigger.reaction_added":
      return { externalKey: `${msg}:👍`, data: { roomId: room, messageId: msg, emoji: String(config.emoji ?? "") || "👍", ...person, messageAuthorUserId: user, messageText: "Hola", receivedAt: now } };
    case "killio.trigger.message_edited":
      return { externalKey: `${msg}:edit`, data: { roomId: room, messageId: msg, text: "Texto nuevo", authorUserId: user, authorName: "Ana", invokedBy: user, authorIsBot: false, receivedAt: now } };
    case "killio.trigger.message_deleted":
      return { externalKey: `${msg}:delete`, data: { roomId: room, messageId: msg, previousText: "Texto anterior", authorUserId: user, deletedBy: user, deletedByName: "Ana", invokedBy: user, authorIsBot: false, receivedAt: now } };
    case "killio.trigger.member_join":
      return { externalKey: `join:${user}`, data: { roomId: room, teamId: "00000000-0000-4000-8000-000000000004", userId: user, userName: "Ana", ...person, joinedAt: now, receivedAt: now } };
    case "killio.trigger.scheduled":
      return { externalKey: `schedule:${now}`, data: { roomId: room, scheduledFor: now, lastRunAt: "2026-01-01T08:00:00.000Z", receivedAt: now } };
  }
}

/* ───────────── template autocomplete (`{` / `{{`) ───────────── */

export interface TemplateTrigger {
  /** Index of the first `{`. */
  start: number;
  /** Text typed after the braces (the filter). */
  query: string;
  /** `{{` expression or `{` field. */
  style: "{" | "{{";
}

/** If the caret sits inside an unclosed `{` / `{{`, what is being typed; otherwise null. */
export function templateTrigger(text: string, caret: number): TemplateTrigger | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("{");
  if (open < 0) return null;
  const tail = before.slice(open);
  if (tail.includes("}")) return null;
  const double = open > 0 && before[open - 1] === "{";
  const start = double ? open - 1 : open;
  const query = tail.slice(1).trim();
  if (/[\s()+*/<>=!&|?:'"`,;[\]]/.test(query)) return null; // an expression, not a name being typed
  return { start, query, style: double ? "{{" : "{" };
}

export interface TemplateEdit {
  text: string;
  caret: number;
}

/** Inserts `name` replacing the open braces (the closing ones are added, or reused when they already follow the caret). */
export function applyTemplateVariable(text: string, caret: number, trig: TemplateTrigger | null, name: string): TemplateEdit {
  const token = trig?.style === "{{" ? `{{ ${name} }}` : `{${name}}`;
  const start = trig ? trig.start : caret;
  let end = caret;
  if (trig) {
    const after = text.slice(caret);
    const close = trig.style === "{{" ? /^\s*\}\}/.exec(after) : /^\s*\}/.exec(after);
    if (close) end = caret + close[0].length;
  }
  const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
  return { text: next, caret: start + token.length };
}

/**
 * Single-brace tokens of a text that do not name a variable available here. The backend replaces EVERY `{...}` with the value of that
 * field (empty when there is none), so a typo, or literal braces such as a JSON snippet, silently disappear. `{{ expr }}` is an
 * expression (not checked). A dotted name is checked by its first segment (`options.nombre` -> `options`).
 */
export function unknownVariables(text: string, known: readonly PayloadVar[]): string[] {
  if (!text.includes("{")) return [];
  const roots = new Set(known.map((v) => v.name.split(".")[0]));
  const out: string[] = [];
  // Drop the `{{ ... }}` expressions first: what remains with braces is a plain `{field}` the backend will interpolate.
  const plain = text.replace(/\{\{[\s\S]*?\}\}/g, " ");
  for (const m of plain.matchAll(/\{([^{}]+)\}/g)) {
    const name = m[1].trim();
    if (!roots.has(name.split(".")[0]) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Variables whose name contains the query (prefix first). */
export function filterVariables(vars: readonly PayloadVar[], query: string, limit = 8): PayloadVar[] {
  const q = query.trim().toLowerCase();
  if (!q) return vars.slice(0, limit);
  const rank = (v: PayloadVar) => (v.name.toLowerCase().startsWith(q) ? 0 : v.name.toLowerCase().includes(q) ? 1 : -1);
  return vars
    .map((v, i) => ({ v, r: rank(v), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.v);
}

/* ───────────── validation of one node ───────────── */

export type NodeIssueCode =
  | "role_required" | "user_required" | "room_required" | "emoji_required" | "content_required" | "schedule_one" | "every_range" | "daily_format" | "weekdays_range" | "weekdays_need_daily"
  | "expires_range" | "command_name" | "message_id_uuid" | "room_uuid" | "blocks_invalid" | "components_invalid" | "modal_invalid" | "custom_id_pattern";

export interface NodeIssue {
  field: string;
  code: NodeIssueCode;
  blocks?: BlockIssue[];
  components?: ComponentIssue[];
  modal?: ModalIssue[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hasTpl = (v: unknown) => typeof v === "string" && /\{[^{}]*\}/.test(v);
const present = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
const NEEDS_CONTENT = new Set<RoomNodeKind>(["killio.room.send_message", "killio.room.reply", "killio.room.edit_message", "killio.room.create_thread", "killio.room.send_dm", "killio.room.respond_interaction"]);

/** The schedule mode a config implies (the UI keeps no extra key: it is derived). */
export const scheduleModeOf = (c: Record<string, unknown>): "every" | "daily" => (present(c.dailyAt) ? "daily" : "every");

/** Problems of one node's config, as the backend would reject or silently ignore them. Empty = fine. */
export function validateRoomNode(kind: RoomNodeKind, config: Record<string, unknown> = {}): NodeIssue[] {
  const out: NodeIssue[] = [];
  const c = config;
  if (kind === "killio.trigger.member_join" || kind === "killio.trigger.scheduled") {
    if (!present(c.roomId)) out.push({ field: "roomId", code: "room_required" });
  }
  if ((kind === "killio.team.assign_self_role" || kind === "killio.team.remove_self_role") && !present(c.roleId)) out.push({ field: "roleId", code: "role_required" });
  if ((kind === "killio.moderation.mute_member" || kind === "killio.moderation.kick_member") && !present(c.userId)) out.push({ field: "userId", code: "user_required" });
  if (kind === "killio.trigger.command" && present(c.command) && !/^[a-z0-9_-]{1,32}$/.test(normCmd(c.command))) out.push({ field: "command", code: "command_name" });
  if (kind === "killio.trigger.interaction" && present(c.customId) && !/^[A-Za-z0-9_.:\-/]{1,99}\*?$/.test(String(c.customId))) out.push({ field: "customId", code: "custom_id_pattern" });
  if (kind === "killio.trigger.scheduled") {
    const hasEvery = present(c.everyMinutes);
    const hasDaily = present(c.dailyAt);
    if (hasEvery === hasDaily) out.push({ field: "everyMinutes", code: "schedule_one" });
    else if (hasEvery) {
      const n = Number(c.everyMinutes);
      if (!Number.isInteger(n) || n < 5 || n > 7 * 24 * 60) out.push({ field: "everyMinutes", code: "every_range" });
    } else if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(String(c.dailyAt).trim())) out.push({ field: "dailyAt", code: "daily_format" });
    if (Array.isArray(c.weekdays)) {
      if (!hasDaily) out.push({ field: "weekdays", code: "weekdays_need_daily" });
      else if (c.weekdays.length === 0 || c.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) out.push({ field: "weekdays", code: "weekdays_range" });
    }
  }
  if (!isRoomTriggerKind(kind)) {
    if (present(c.roomId) && !hasTpl(c.roomId) && !UUID.test(String(c.roomId).trim())) out.push({ field: "roomId", code: "room_uuid" });
    if (present(c.messageId) && !hasTpl(c.messageId) && !UUID.test(String(c.messageId).trim())) out.push({ field: "messageId", code: "message_id_uuid" });
    if ((kind === "killio.room.react" || kind === "killio.room.unreact") && !present(c.emoji)) out.push({ field: "emoji", code: "emoji_required" });
    if (kind === "killio.room.respond_interaction" && c.mode === "modal") {
      const mi = validateModal(c.modal ?? undefined);
      if (!c.modal) out.push({ field: "modal", code: "modal_invalid", modal: [{ at: [], code: "custom_id_required" }] });
      else if (mi.length) out.push({ field: "modal", code: "modal_invalid", modal: mi });
    } else if (NEEDS_CONTENT.has(kind)) {
      const hasBlocks = (Array.isArray(c.blocks) && c.blocks.length > 0) || present(c.blocksFrom);
      if (!present(c.text) && !hasBlocks) out.push({ field: "text", code: "content_required" });
      if (Array.isArray(c.blocks) && c.blocks.length > 0) {
        const bi = validateBlocks(c.blocks);
        if (bi.length) out.push({ field: "blocks", code: "blocks_invalid", blocks: bi });
      }
      if (Array.isArray(c.components) && c.components.length > 0) {
        const ci = validateComponents(c.components, c.expiresInMinutes, Array.isArray(c.blocks) ? c.blocks : undefined);
        if (ci.length) out.push({ field: "components", code: "components_invalid", components: ci });
      }
    }
    if (kind === "killio.room.pin_message" && present(c.expiresInMinutes) && !(Number(c.expiresInMinutes) >= 1)) out.push({ field: "expiresInMinutes", code: "expires_range" });
  }
  return out;
}

/* ───────────── validation of a whole bot graph ───────────── */

export type GraphIssueCode = "no_trigger" | "duplicate_trigger" | "node_kind_not_allowed" | "unreachable" | "edge_dangling" | "trigger_has_input" | "node_invalid";

export interface GraphIssue {
  code: GraphIssueCode;
  nodeId?: string;
  kind?: string;
  /** For `node_invalid`: the first field problem. */
  field?: string;
}

const ALLOWED_PREFIXES = ["core.transform.", "core.condition.", "core.logic.", "core.filter."];
const ALLOWED_EXACT = new Set<string>([...ROOM_TRIGGER_KINDS, ...ROOM_ACTION_KINDS, "core.action.delay", "core.action.http_request", "core.action.js_code", "core.action.ai_response"]);

/** Same rule as the backend's bot-script-policy: which nodes a script bound to a bot may hold. */
export const isBotScriptNodeKind = (kind: string): boolean => ALLOWED_EXACT.has(kind) || ALLOWED_PREFIXES.some((p) => kind.startsWith(p));

/**
 * Checks a bot graph the way the backend will when saving or running it (allowed kinds, at least one trigger, one of each kind) and
 * what the backend only finds at run time (a node no trigger reaches never runs; an invalid config fails silently into an item).
 */
export function validateBotGraph(nodes: readonly GraphNodeLike[], edges: readonly GraphEdgeLike[]): GraphIssue[] {
  const out: GraphIssue[] = [];
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    if (!isBotScriptNodeKind(kindOf(n))) out.push({ code: "node_kind_not_allowed", nodeId: n.id, kind: kindOf(n) });
  }
  const triggers = nodes.filter((n) => isRoomTriggerKind(kindOf(n)));
  if (nodes.length > 0) {
    if (triggers.length === 0) out.push({ code: "no_trigger" });
    const seen = new Set<string>();
    for (const t of triggers) {
      if (seen.has(kindOf(t))) out.push({ code: "duplicate_trigger", nodeId: t.id, kind: kindOf(t) });
      seen.add(kindOf(t));
    }
  }
  for (const e of edges) {
    if (!ids.has(srcOf(e)) || !ids.has(dstOf(e))) out.push({ code: "edge_dangling" });
    else if (isRoomTriggerKind(kindOf(nodes.find((n) => n.id === dstOf(e))!))) out.push({ code: "trigger_has_input", nodeId: dstOf(e) });
  }
  const reached = new Set<string>(triggers.map((t) => t.id));
  const queue = [...reached];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges) if (srcOf(e) === id && ids.has(dstOf(e)) && !reached.has(dstOf(e))) { reached.add(dstOf(e)); queue.push(dstOf(e)); }
  }
  for (const n of nodes) if (!reached.has(n.id)) out.push({ code: "unreachable", nodeId: n.id, kind: kindOf(n) });
  for (const n of nodes) {
    const k = kindOf(n);
    if (!isRoomNodeKind(k)) continue;
    const first = validateRoomNode(k, configOf(n))[0];
    if (first) out.push({ code: "node_invalid", nodeId: n.id, kind: k, field: first.field });
  }
  return out;
}
