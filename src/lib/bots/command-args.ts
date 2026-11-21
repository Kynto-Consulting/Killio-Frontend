/**
 * Arguments of a slash command in the composer: the same parser the backend runs when a bot command is invoked (so an invalid call
 * is shown BEFORE sending, with the backend's own rules), and the autocomplete of what comes next (subcommand, option, choice,
 * person, role, channel). Pure, tested in command-args.test.ts.
 * Contract: Killio-Backend/src/modules/bots/bot-commands.ts (tokenize, coerceOption, parseInvocation).
 *
 * The text handled here is the WIRE form (`@[Name](id)`), like the server reads it: callers convert the editor tokens with
 * toWireMentions() first.
 */
import { isValueType, usageOf, type CommandOption } from "./options.ts";

export const ARG_LIMITS = { maxTokens: 100, maxStringValueLength: 4000 } as const;

interface Token {
  value: string;
  quoted: boolean;
  start: number;
  key?: string;
}

const MENTION_AT = /^[@#]\[[^\]]*\]\([^)]*\)/;
const MENTION_PARTS = /^([@#])\[[^\]]*\]\(([^)]*)\)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAIN_ID = /^[A-Za-z0-9_-]{6,80}$/;

/** Splits on spaces; "..." and '...' keep spaces (backslash escapes the quote); `@[Name](id)` and `#[Name](id)` stay whole. */
export function tokenize(text: string, knownKeys: ReadonlySet<string> = new Set()): { tokens: Token[]; error?: "too_many" | "unclosed_quote" } {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (/\s/.test(text[i])) { i += 1; continue; }
    if (tokens.length >= ARG_LIMITS.maxTokens) return { tokens, error: "too_many" };
    const start = i;
    let key: string | undefined;
    const keyMatch = /^([a-z0-9_-]{1,32}):/i.exec(text.slice(i, i + 34));
    if (keyMatch && knownKeys.has(keyMatch[1].toLowerCase())) {
      key = keyMatch[1].toLowerCase();
      i += keyMatch[0].length;
    }
    const q = text[i];
    if (q === '"' || q === "'") {
      let value = "";
      i += 1;
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === "\\" && i + 1 < n && (text[i + 1] === q || text[i + 1] === "\\")) { value += text[i + 1]; i += 2; continue; }
        if (c === q) { closed = true; i += 1; break; }
        value += c; i += 1;
      }
      if (!closed) return { tokens, error: "unclosed_quote" };
      tokens.push({ value, quoted: true, start, key });
      continue;
    }
    const mention = MENTION_AT.exec(text.slice(i));
    if (mention) {
      tokens.push({ value: mention[0], quoted: false, start, key });
      i += mention[0].length;
      continue;
    }
    let value = "";
    while (i < n && !/\s/.test(text[i])) { value += text[i]; i += 1; }
    tokens.push({ value, quoted: false, start, key });
  }
  return { tokens };
}

export type OptionValue = string | number | boolean;

/** Codes the UI translates; `params` fills the placeholders. */
export type ArgErrorCode =
  | "required" | "unknown_option" | "given_twice" | "extra_argument" | "too_many" | "unclosed_quote" | "choose_one"
  | "min_length" | "max_length" | "integer" | "number" | "min" | "max" | "boolean" | "user" | "user_kind" | "role" | "channel" | "attachment" | "choice";

export interface ArgError {
  /** Name of the option (empty = the whole call). */
  option: string;
  code: ArgErrorCode;
  params?: Record<string, string | number>;
}

type Coerced = { value: OptionValue } | { error: ArgError };

const err = (option: string, code: ArgErrorCode, params?: Record<string, string | number>): { error: ArgError } => ({ error: { option, code, params } });

function pickChoice(opt: CommandOption, text: string): Coerced {
  const lower = text.toLowerCase();
  const list = opt.choices ?? [];
  const hit = list.find((c) => String(c.value).toLowerCase() === lower) ?? list.find((c) => c.name.toLowerCase() === lower);
  if (!hit) return err(opt.name, "choice", { list: list.map((c) => c.name).join(", ") });
  return { value: hit.value };
}

/** Converts the raw text of ONE option into its typed value, or the error. */
export function coerceOption(opt: CommandOption, raw: string): Coerced {
  const text = raw.trim();
  const n = opt.name;
  switch (opt.type) {
    case "string": {
      if (opt.choices) return pickChoice(opt, text);
      if (opt.minLength !== undefined && text.length < opt.minLength) return err(n, "min_length", { min: opt.minLength });
      const max = opt.maxLength ?? ARG_LIMITS.maxStringValueLength;
      if (text.length > max) return err(n, "max_length", { max });
      return { value: text };
    }
    case "integer":
    case "number": {
      if (opt.choices) return pickChoice(opt, text);
      const ok = opt.type === "integer" ? /^[+-]?\d+$/.test(text) : /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text);
      const num = Number(text);
      if (!ok || !Number.isFinite(num) || (opt.type === "integer" && !Number.isSafeInteger(num))) return err(n, opt.type);
      if (opt.min !== undefined && num < opt.min) return err(n, "min", { min: opt.min });
      if (opt.max !== undefined && num > opt.max) return err(n, "max", { max: opt.max });
      return { value: num };
    }
    case "boolean": {
      const t = text.toLowerCase();
      if (["true", "yes", "y", "si", "sí", "1", "on"].includes(t)) return { value: true };
      if (["false", "no", "n", "0", "off"].includes(t)) return { value: false };
      return err(n, "boolean");
    }
    case "user": {
      const m = MENTION_PARTS.exec(text);
      if (m && m[1] === "@") {
        const target = m[2].trim();
        if (target && target !== "everyone" && !target.startsWith("role:") && !target.startsWith("group:")) return { value: target };
        return err(n, "user_kind");
      }
      if (!m && PLAIN_ID.test(text) && !text.startsWith("role:")) return { value: text };
      return err(n, "user");
    }
    case "role": {
      const m = MENTION_PARTS.exec(text);
      const target = m && m[1] === "@" ? m[2].trim() : text;
      if (target.startsWith("role:") && target.length > 5) return { value: target.slice(5) };
      return err(n, "role");
    }
    case "channel": {
      const m = MENTION_PARTS.exec(text);
      const target = m && m[1] === "#" ? m[2].trim() : text;
      if (UUID.test(target)) return { value: target.toLowerCase() };
      return err(n, "channel");
    }
    case "attachment": {
      if (text.length <= 2048 && (/^https:\/\/[^\s]+$/i.test(text) || /^attachment:[A-Za-z0-9_-]{4,80}$/.test(text))) return { value: text };
      return err(n, "attachment");
    }
    default:
      return err(n, "unknown_option");
  }
}

export interface CommandInvocation {
  command: string;
  subcommandGroup: string | null;
  subcommand: string | null;
  options: Record<string, OptionValue>;
}

export type ParseOutcome = { ok: true; invocation: CommandInvocation } | { ok: false; errors: ArgError[]; usage: string };

/** Parses what follows the command name against its definitions. Never throws. */
export function parseInvocation(command: string, args: string, defs: readonly CommandOption[]): ParseOutcome {
  const hasSubs = defs.some((o) => !isValueType(o.type));
  const keys = new Set<string>();
  const collect = (list: readonly CommandOption[]) => {
    for (const o of list) {
      if (isValueType(o.type)) keys.add(o.name);
      else collect(o.options ?? []);
    }
  };
  collect(defs);

  const lexed = tokenize(args, keys);
  if (lexed.error) return { ok: false, errors: [{ option: "", code: lexed.error }], usage: usageOf(command, defs) };
  let tokens = lexed.tokens;

  let level: readonly CommandOption[] = defs;
  let group: string | null = null;
  let sub: string | null = null;
  const path: string[] = [];
  if (hasSubs) {
    const take = (): CommandOption | null => {
      const t = tokens[0];
      const hit = t && !t.key ? level.find((o) => o.name === t.value.toLowerCase() && !isValueType(o.type)) : undefined;
      if (hit) tokens = tokens.slice(1);
      return hit ?? null;
    };
    let picked = take();
    if (picked?.type === "subcommand_group") {
      group = picked.name; path.push(picked.name); level = picked.options ?? [];
      picked = take();
      if (picked) { sub = picked.name; path.push(picked.name); level = picked.options ?? []; }
      else return { ok: false, errors: [{ option: group, code: "choose_one", params: { list: level.map((o) => o.name).join(", ") } }], usage: usageOf(command, defs, path) };
    } else if (picked) {
      sub = picked.name; path.push(picked.name); level = picked.options ?? [];
    } else {
      return { ok: false, errors: [{ option: "", code: "choose_one", params: { list: level.map((o) => o.name).join(", ") } }], usage: usageOf(command, defs) };
    }
  }

  const values = level.filter((o) => isValueType(o.type));
  const byName = new Map(values.map((o) => [o.name, o]));
  const raw = new Map<string, string>();
  const errors: ArgError[] = [];
  const unassigned = () => values.find((o) => !raw.has(o.name));

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const t = tokens[idx];
    if (t.key) {
      const opt = byName.get(t.key);
      if (!opt) { errors.push({ option: t.key, code: "unknown_option" }); continue; }
      if (raw.has(opt.name)) { errors.push({ option: opt.name, code: "given_twice" }); continue; }
      raw.set(opt.name, t.value);
      continue;
    }
    const opt = unassigned();
    if (!opt) { errors.push({ option: "", code: "extra_argument", params: { value: t.value.slice(0, 40) } }); continue; }
    // The last declared string option takes the rest of the text (no quotes needed for a free message).
    const isLast = values[values.length - 1] === opt;
    if (isLast && opt.type === "string" && !opt.choices && !t.quoted) {
      const rest = args.slice(t.start).trim();
      const stillNamed = tokens.slice(idx + 1).some((x) => x.key);
      if (!stillNamed) {
        raw.set(opt.name, rest);
        break;
      }
    }
    raw.set(opt.name, t.value);
  }

  const options: Record<string, OptionValue> = {};
  for (const opt of values) {
    const text = raw.get(opt.name);
    if (text === undefined || text === "") {
      if (opt.required) errors.push({ option: opt.name, code: "required" });
      continue;
    }
    const res = coerceOption(opt, text);
    if ("error" in res) errors.push(res.error);
    else options[opt.name] = res.value;
  }
  if (errors.length > 0) return { ok: false, errors, usage: usageOf(command, defs, path) };
  return { ok: true, invocation: { command, subcommandGroup: group, subcommand: sub, options } };
}

/** `/name rest` -> `{ name, args }`; null when the text is not a slash command. */
export function splitSlash(text: string): { name: string; args: string } | null {
  const m = /^\/([a-z0-9_-]{1,32})(?:\s+([\s\S]*))?$/i.exec(text.trimStart());
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: m[2] ?? "" };
}

export interface CommandDef {
  name: string;
  options: readonly CommandOption[];
}

/**
 * Validates a typed `/command ...` against the registered definitions. Null when there is nothing to say: not a command, a command
 * without options (the old prefix commands take free text), an unknown name (the server decides) or valid arguments.
 */
export function checkSlashInput(text: string, defs: readonly CommandDef[]): { command: string; errors: ArgError[]; usage: string } | null {
  const s = splitSlash(text);
  if (!s) return null;
  const candidates = defs.filter((d) => d.name.toLowerCase() === s.name && d.options.length > 0);
  if (candidates.length === 0) return null;
  let first: Extract<ParseOutcome, { ok: false }> | null = null;
  for (const c of candidates) {
    const out = parseInvocation(s.name, s.args, c.options);
    if (out.ok) return null;
    first ??= out;
  }
  return first ? { command: s.name, errors: first.errors, usage: first.usage } : null;
}

/* ───────────── autocomplete of the next argument ───────────── */

export type SuggestionKind = "subcommand" | "option" | "choice" | "boolean" | "user" | "role" | "channel";

export interface ArgSuggestion {
  kind: SuggestionKind;
  /** Visible text. */
  label: string;
  /** Text that replaces the token being typed (a trailing space is added by the caller). */
  insert: string;
  /** Second line: description of the option, or the id kind. */
  hint?: string;
}

export interface ArgSources {
  users?: Array<{ id: string; name: string }>;
  roles?: Array<{ id: string; name: string }>;
  rooms?: Array<{ id: string; name: string }>;
}

export interface ArgAnalysis {
  usage: string;
  /** Subcommand path chosen so far. */
  path: string[];
  /** The option the next / current token fills, when there is one. */
  expecting: CommandOption | null;
  /** Characters at the END of the argument text that the chosen suggestion replaces. */
  partialLength: number;
  suggestions: ArgSuggestion[];
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const matches = (label: string, partial: string) => !partial || fold(label).includes(fold(partial));

/** What can be typed next, given the arguments typed so far (wire form). Never throws. */
export function analyzeArgs(command: string, defs: readonly CommandOption[], args: string, sources: ArgSources = {}, limit = 8): ArgAnalysis {
  const hasSubs = defs.some((o) => !isValueType(o.type));
  const keys = new Set<string>();
  const collect = (list: readonly CommandOption[]) => list.forEach((o) => (isValueType(o.type) ? keys.add(o.name) : collect(o.options ?? [])));
  collect(defs);

  const none = (path: string[] = [], expecting: CommandOption | null = null): ArgAnalysis => ({ usage: usageOf(command, defs, path), path, expecting, partialLength: 0, suggestions: [] });
  const lexed = tokenize(args, keys);
  if (lexed.error) return none();
  const endsSpace = args.length === 0 || /\s$/.test(args);
  const tokens = lexed.tokens;
  const partialTok = endsSpace ? null : tokens[tokens.length - 1];
  let consumed = partialTok ? tokens.slice(0, -1) : tokens;
  const partialLength = partialTok ? args.length - partialTok.start : 0;
  const partialText = partialTok && !partialTok.quoted ? partialTok.value : "";

  let level: readonly CommandOption[] = defs;
  const path: string[] = [];
  if (hasSubs) {
    const take = (): CommandOption | null => {
      const t = consumed[0];
      const hit = t && !t.key ? level.find((o) => o.name === t.value.toLowerCase() && !isValueType(o.type)) : undefined;
      if (hit) consumed = consumed.slice(1);
      return hit ?? null;
    };
    const first = take();
    if (first) {
      path.push(first.name);
      level = first.options ?? [];
      if (first.type === "subcommand_group") {
        const second = take();
        if (second) { path.push(second.name); level = second.options ?? []; }
      }
    }
    const stillChoosing = level.some((o) => !isValueType(o.type));
    if (stillChoosing) {
      const suggestions = level.filter((o) => matches(o.name, partialText)).slice(0, limit).map((o): ArgSuggestion => ({ kind: "subcommand", label: o.name, insert: o.name, hint: o.description || undefined }));
      return { usage: usageOf(command, defs, path), path, expecting: null, partialLength, suggestions };
    }
  }

  const values = level.filter((o) => isValueType(o.type));
  const byName = new Map(values.map((o) => [o.name, o]));
  const assigned = new Set<string>();
  for (const t of consumed) {
    if (t.key) assigned.add(t.key);
    else {
      const next = values.find((o) => !assigned.has(o.name));
      if (next) assigned.add(next.name);
    }
  }

  let expecting: CommandOption | null;
  let valuePart = partialText;
  let keyPrefix = "";
  if (partialTok?.key) {
    expecting = byName.get(partialTok.key) ?? null;
    valuePart = partialTok.quoted ? "" : partialTok.value;
    keyPrefix = `${partialTok.key}:`;
  } else {
    expecting = values.find((o) => !assigned.has(o.name)) ?? null;
  }
  if (!expecting) return { usage: usageOf(command, defs, path), path, expecting: null, partialLength, suggestions: [] };

  const out: ArgSuggestion[] = [];
  const add = (s: ArgSuggestion) => out.length < limit && out.push({ ...s, insert: `${keyPrefix}${s.insert}` });
  const o = expecting;
  if (o.choices) {
    for (const c of o.choices) if (matches(c.name, valuePart) || matches(String(c.value), valuePart)) add({ kind: "choice", label: c.name, insert: quoteIfNeeded(String(c.value)), hint: String(c.value) !== c.name ? String(c.value) : undefined });
  } else if (o.type === "boolean") {
    for (const v of ["true", "false"]) if (matches(v, valuePart)) add({ kind: "boolean", label: v, insert: v });
  } else if (o.type === "user") {
    for (const u of sources.users ?? []) if (matches(u.name, valuePart.replace(/^@/, ""))) add({ kind: "user", label: u.name, insert: `@[${cleanLabel(u.name)}](${u.id})` });
  } else if (o.type === "role") {
    for (const r of sources.roles ?? []) if (matches(r.name, valuePart.replace(/^@/, ""))) add({ kind: "role", label: r.name, insert: `@[${cleanLabel(r.name)}](role:${r.id})` });
  } else if (o.type === "channel") {
    for (const r of sources.rooms ?? []) if (matches(r.name, valuePart.replace(/^#/, ""))) add({ kind: "channel", label: r.name, insert: `#[${cleanLabel(r.name)}](${r.id})` });
  }
  // While the token is not yet `key:value`, the options that are still free can also be named (`name:`).
  if (!partialTok?.key) {
    for (const f of values) if (!assigned.has(f.name) && matches(f.name, valuePart) && (valuePart || f !== expecting)) add({ kind: "option", label: `${f.name}:`, insert: `${f.name}:`, hint: f.description || undefined });
  }
  // The token already IS one of the options: nothing left to complete.
  const typed = fold(valuePart.replace(/^["']|["']$/g, ''));
  const done = typed !== '' && out.some((s) => fold(s.insert.slice(keyPrefix.length).replace(/^"|"$/g, '')) === typed);
  return { usage: usageOf(command, defs, path), path, expecting, partialLength, suggestions: done ? [] : out };
}

function cleanLabel(name: string): string {
  return name.replace(/[\]\n\r]/g, " ").trim() || "?";
}

function quoteIfNeeded(v: string): string {
  return /\s|["']/.test(v) ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
}
