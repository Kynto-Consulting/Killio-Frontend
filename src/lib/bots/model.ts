/**
 * Pure model of the Bots tab: normalisers of the `/teams/:teamId/bots` answers, form/command validation, the per-room
 * tri-state of a bot and the example script. No I/O; tested in model.test.ts.
 * Contract: Killio-Backend/src/modules/bots (bots.controller.ts, bots.service.ts, bot-config.ts, bot-commands.ts).
 */
import { normalizeOptions, optionsPayload, validateOptions, type CommandOption, type OptionIssue } from "./options.ts";

export const BOT_LIMITS = { name: 80, description: 500, avatarUrl: 2048, commandsPerBot: 50, commandName: 32, commandDescription: 200, usage: 200 } as const;

/** Backend rule (bots.service COMMAND_NAME). */
export const COMMAND_NAME_RE = /^[a-z0-9_-]{1,32}$/;

export interface BotCommand {
  name: string;
  description: string;
  usage: string | null;
  /** Typed arguments (subcommands included). Empty for the old free-text commands. */
  options: CommandOption[];
}

export interface BotRoleRef {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

export interface Bot {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  isActive: boolean;
  commands: BotCommand[];
  /** Manager-only fields (null / empty when the caller cannot manage bots). */
  scriptId: string | null;
  scriptActive: boolean | null;
  allowBotTriggers: boolean;
  roleIds: string[];
  roles: BotRoleRef[];
}

export interface BotQuota {
  executed: number;
  limit: number | null;
  remaining: number | null;
  exhausted: boolean;
}

export interface BotLimits {
  maxBotsPerTeam: number;
  maxChainDepth: number;
  maxRunsPerBotPerMinute: number;
  maxBotMessagesPerRoomPerMinute: number;
}

export interface BotList {
  canManage: boolean;
  quota: BotQuota | null;
  limits: BotLimits;
  bots: Bot[];
}

export const DEFAULT_LIMITS: BotLimits = { maxBotsPerTeam: 20, maxChainDepth: 3, maxRunsPerBotPerMinute: 30, maxBotMessagesPerRoomPerMinute: 30 };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function normalizeCommand(raw: unknown): BotCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name) return null;
  return { name: r.name, description: typeof r.description === "string" ? r.description : "", usage: str(r.usage), options: normalizeOptions(r.options) };
}

export function normalizeBot(raw: unknown): Bot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  const roles: BotRoleRef[] = Array.isArray(r.roles)
    ? r.roles.filter((x: any) => x && typeof x.id === "string").map((x: any) => ({ id: x.id, name: String(x.name ?? ""), color: str(x.color), position: num(x.position, 0) }))
    : [];
  return {
    id: r.id,
    userId: typeof r.userId === "string" ? r.userId : "",
    name: r.name,
    avatarUrl: str(r.avatarUrl),
    description: str(r.description),
    isActive: r.isActive !== false,
    commands: (Array.isArray(r.commands) ? r.commands : []).map(normalizeCommand).filter((c: BotCommand | null): c is BotCommand => !!c),
    scriptId: str(r.scriptId),
    scriptActive: typeof r.scriptActive === "boolean" ? r.scriptActive : null,
    allowBotTriggers: r.allowBotTriggers === true,
    roleIds: Array.isArray(r.roleIds) ? r.roleIds.filter((x: unknown): x is string => typeof x === "string") : roles.map((x) => x.id),
    roles,
  };
}

/** `GET /teams/:id/bots`: `{ canManage, quota, limits, bots }` (a bare array from an older server is accepted too). */
export function normalizeBotList(raw: unknown): BotList {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, any>;
  const list: unknown[] = Array.isArray(raw) ? raw : Array.isArray(r.bots) ? r.bots : [];
  const q = r.quota && typeof r.quota === "object" ? r.quota : null;
  const l = r.limits && typeof r.limits === "object" ? r.limits : {};
  return {
    canManage: r.canManage === true,
    quota: q ? { executed: num(q.executed, 0), limit: typeof q.limit === "number" ? q.limit : null, remaining: typeof q.remaining === "number" ? q.remaining : null, exhausted: q.exhausted === true } : null,
    limits: {
      maxBotsPerTeam: num(l.maxBotsPerTeam, DEFAULT_LIMITS.maxBotsPerTeam),
      maxChainDepth: num(l.maxChainDepth, DEFAULT_LIMITS.maxChainDepth),
      maxRunsPerBotPerMinute: num(l.maxRunsPerBotPerMinute, DEFAULT_LIMITS.maxRunsPerBotPerMinute),
      maxBotMessagesPerRoomPerMinute: num(l.maxBotMessagesPerRoomPerMinute, DEFAULT_LIMITS.maxBotMessagesPerRoomPerMinute),
    },
    bots: list.map(normalizeBot).filter((b): b is Bot => !!b),
  };
}

/** Flat row of `GET /teams/:id/bots/commands` (active bots only) for the composer autocomplete. */
export interface ComposerBotCommand {
  botId: string;
  botUserId?: string;
  botName: string;
  botAvatarUrl?: string;
  name: string;
  description: string;
  usage?: string;
  options: CommandOption[];
}

export function normalizeComposerCommands(raw: unknown): ComposerBotCommand[] {
  if (!Array.isArray(raw)) return [];
  const out: ComposerBotCommand[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object" || typeof (c as any).name !== "string") continue;
    const x = c as Record<string, any>;
    out.push({
      botId: String(x.botId ?? x.botUserId ?? ""),
      botUserId: typeof x.botUserId === "string" ? x.botUserId : undefined,
      botName: String(x.botName ?? "Bot"),
      botAvatarUrl: typeof x.avatarUrl === "string" ? x.avatarUrl : undefined,
      name: x.name,
      description: typeof x.description === "string" ? x.description : "",
      usage: typeof x.usage === "string" ? x.usage : undefined,
      options: normalizeOptions(x.options),
    });
  }
  return out;
}

/** What the person typed -> what the backend stores: no leading "/", lower case, trimmed. */
export function normalizeCommandName(input: string): string {
  return input.trim().replace(/^\/+/, "").toLowerCase();
}

export type CommandIssue = "invalid" | "duplicate" | "limit";
export interface CommandDraft {
  name: string;
  description: string;
  usage?: string | null;
  options?: CommandOption[];
}

/** One issue code per row index (`limit` is reported on the rows that go over the cap). */
export function validateCommands(list: readonly CommandDraft[]): Map<number, CommandIssue> {
  const issues = new Map<number, CommandIssue>();
  const seen = new Set<string>();
  list.forEach((c, i) => {
    const name = normalizeCommandName(c.name);
    if (i >= BOT_LIMITS.commandsPerBot) issues.set(i, "limit");
    else if (!COMMAND_NAME_RE.test(name)) issues.set(i, "invalid");
    else if (seen.has(name)) issues.set(i, "duplicate");
    seen.add(name);
  });
  return issues;
}

/** Option problems per command row (the backend rejects the whole PUT on the first one, so the editor blocks saving on any). */
export function commandOptionIssues(list: readonly CommandDraft[]): Map<number, OptionIssue[]> {
  const out = new Map<number, OptionIssue[]>();
  list.forEach((c, i) => {
    const issues = validateOptions(c.options ?? []);
    if (issues.length) out.set(i, issues);
  });
  return out;
}

/** Body of `PUT /teams/:id/bots/:botId/commands`. */
export function commandsPayload(list: readonly CommandDraft[]): { commands: Array<{ name: string; description: string; usage: string | null; options: CommandOption[] }> } {
  return {
    commands: list.map((c) => ({
      name: normalizeCommandName(c.name),
      description: c.description.trim().slice(0, BOT_LIMITS.commandDescription),
      usage: c.usage?.trim() ? c.usage.trim().slice(0, BOT_LIMITS.usage) : null,
      options: optionsPayload(c.options ?? []),
    })),
  };
}

/** Trigger types the backend stores for a script whose trigger is a bot trigger (scripts.trigger_type): only these can be bound to a bot. */
export const BOT_SCRIPT_TRIGGER_TYPES: readonly string[] = ["room_message", "command", "interaction", "reaction_added", "message_edited", "message_deleted", "member_join", "schedule"];
export const isBotScriptTriggerType = (t: string): boolean => BOT_SCRIPT_TRIGGER_TYPES.includes(t);

export type BotFormIssue = "name_required" | "name_long" | "description_long" | "avatar_invalid";

export function validateBotForm(f: { name: string; description: string; avatarUrl: string }): BotFormIssue[] {
  const out: BotFormIssue[] = [];
  const name = f.name.trim();
  if (!name) out.push("name_required");
  else if (name.length > BOT_LIMITS.name) out.push("name_long");
  if (f.description.trim().length > BOT_LIMITS.description) out.push("description_long");
  const avatar = f.avatarUrl.trim();
  if (avatar && (!/^https:\/\/\S+$/i.test(avatar) || avatar.length > BOT_LIMITS.avatarUrl)) out.push("avatar_invalid");
  return out;
}

/** Body of POST/PATCH. Empty text sends `null` so a field can be cleared. */
export function botBody(f: { name: string; description: string; avatarUrl: string; allowBotTriggers?: boolean }) {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    avatarUrl: f.avatarUrl.trim() || null,
    ...(f.allowBotTriggers === undefined ? {} : { allowBotTriggers: f.allowBotTriggers }),
  };
}

/** The backend stores no colour for a bot: the placeholder avatar derives a stable hue from its name. */
export function botHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Only owners and people holding `bots.manage` (administrator passes through `can`). */
export function canManageBots(can: (permission: string) => boolean, isOwner: boolean): boolean {
  // TODO(backend): `bots.manage` is defined by the backend (permission catalog, group "bots"). The owner check is kept as an explicit backup for old snapshots.
  return isOwner || can("bots.manage");
}

export type BotStatus = "active" | "paused" | "script_missing" | "script_inactive";

/** A bot only runs while BOTH the bot and its script are active (BotAdminDto.scriptActive). */
export function botStatus(b: Pick<Bot, "isActive" | "scriptId" | "scriptActive">): BotStatus {
  if (!b.isActive) return "paused";
  if (!b.scriptId) return "script_missing";
  if (b.scriptActive === false) return "script_inactive";
  return "active";
}

/* ── per-room permissions of a bot (member subject on the room overrides) ── */

export const BOT_ROOM_KEYS = ["room.view", "room.post", "room.react"] as const;
export type BotRoomKey = (typeof BOT_ROOM_KEYS)[number];
export type TriState = "allow" | "deny" | "inherit";
export interface RawOverride {
  subjectType: string;
  subjectId: string | null;
  allow: string[];
  deny: string[];
  [extra: string]: unknown;
}

export function readOverrides(raw: unknown): RawOverride[] {
  const list: unknown = Array.isArray(raw) ? raw : (raw as any)?.overrides ?? (raw as any)?.data ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .filter((o) => o && typeof o === "object" && typeof (o as any).subjectType === "string")
    .map((o: any) => ({ ...o, subjectId: typeof o.subjectId === "string" ? o.subjectId : null, allow: Array.isArray(o.allow) ? o.allow.map(String) : [], deny: Array.isArray(o.deny) ? o.deny.map(String) : [] }));
}

export function botRoomStates(overrides: readonly RawOverride[], botUserId: string): Record<BotRoomKey, TriState> {
  const mine = overrides.find((o) => o.subjectType === "member" && o.subjectId === botUserId);
  const out = {} as Record<BotRoomKey, TriState>;
  for (const k of BOT_ROOM_KEYS) out[k] = mine?.deny.includes(k) ? "deny" : mine?.allow.includes(k) ? "allow" : "inherit";
  return out;
}

/**
 * New override list with ONLY the bot's three keys replaced. Every other subject and every other key of the bot's own row
 * (including keys this UI does not know) are kept verbatim, because the PUT replaces the whole list.
 */
export function applyBotRoomStates(overrides: readonly RawOverride[], botUserId: string, states: Record<BotRoomKey, TriState>): RawOverride[] {
  const known = new Set<string>(BOT_ROOM_KEYS);
  const others = overrides.filter((o) => !(o.subjectType === "member" && o.subjectId === botUserId));
  const mine = overrides.find((o) => o.subjectType === "member" && o.subjectId === botUserId);
  const allow = (mine?.allow ?? []).filter((k) => !known.has(k));
  const deny = (mine?.deny ?? []).filter((k) => !known.has(k));
  for (const k of BOT_ROOM_KEYS) {
    if (states[k] === "allow") allow.push(k);
    else if (states[k] === "deny") deny.push(k);
  }
  if (allow.length === 0 && deny.length === 0) return others;
  return [...others, { ...(mine ?? {}), subjectType: "member", subjectId: botUserId, allow, deny }];
}

export function sameStates(a: Record<BotRoomKey, TriState>, b: Record<BotRoomKey, TriState>): boolean {
  return BOT_ROOM_KEYS.every((k) => a[k] === b[k]);
}

/* ── example script ── */

export interface TemplateGraph {
  nodes: Array<{ id: string; scriptId: string; nodeKind: string; label: string | null; config: Record<string, unknown>; positionX: number; positionY: number }>;
  edges: Array<{ id: string; scriptId: string; sourceNodeId: string; targetNodeId: string; sourceHandle: string | null; targetHandle: string | null }>;
}

export const HELLO_COMMAND = "hola";

export interface HelloOptionTexts {
  name: string;
  tone: string;
  formal: string;
  casual: string;
}

/** Options of the example command: `/hola nombre:Ana tono:formal` (a required text and an optional choice, in the order the backend demands). */
export function buildHelloOptions(texts: HelloOptionTexts): CommandOption[] {
  return [
    { name: "nombre", description: texts.name.slice(0, 100), type: "string", required: true, maxLength: 40 },
    { name: "tono", description: texts.tone.slice(0, 100), type: "string", choices: [{ name: texts.formal.slice(0, 100), value: "formal" }, { name: texts.casual.slice(0, 100), value: "casual" }] },
  ];
}

/** The registered example command: `/hola` with its options. */
export function buildHelloCommand(texts: HelloOptionTexts & { description: string }): CommandDraft {
  return { name: HELLO_COMMAND, description: texts.description, usage: null, options: buildHelloOptions(texts) };
}

/**
 * Example: `/hola nombre:Ana` -> the bot answers with `reply`. A CONNECTED graph: `killio.trigger.command` (command "hola") ->
 * `killio.room.reply` (answers the message that invoked the command; `{options.nombre}` / `{options.tono}` come from the typed
 * arguments the trigger emits). A bot script must hold only allowed node kinds and one trigger per kind (bot-script-policy.ts).
 */
export function buildHelloScriptGraph(scriptId: string, newId: () => string, reply: string): TemplateGraph {
  const trigger = newId();
  const send = newId();
  return {
    nodes: [
      { id: trigger, scriptId, nodeKind: "killio.trigger.command", label: "Command", config: { command: HELLO_COMMAND }, positionX: 80, positionY: 120 },
      { id: send, scriptId, nodeKind: "killio.room.reply", label: "Reply", config: { text: reply }, positionX: 420, positionY: 120 },
    ],
    edges: [{ id: newId(), scriptId, sourceNodeId: trigger, targetNodeId: send, sourceHandle: "output", targetHandle: "input" }],
  };
}

/** Where the existing script editor opens a script (`?script=` is read by the scripts page). */
export function scriptEditorHref(scriptId: string): string {
  return `/scripts?script=${encodeURIComponent(scriptId)}`;
}
