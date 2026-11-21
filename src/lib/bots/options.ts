/**
 * Options (arguments) of a bot slash command: types, the same validation the backend applies when the commands are registered,
 * reading what the server returns and the body of `PUT /teams/:t/bots/:b/commands`. Pure, tested in options.test.ts.
 * Contract: Killio-Backend/src/modules/bots/bot-commands.ts (validateCommandOptions, COMMAND_LIMITS, usageOf).
 *
 * The backend rejects the first problem it finds and names the option by path; this module reports EVERY problem with the
 * position of the option (`at`: index per level) so the editor can mark the right row. The rules are the backend's, not new ones.
 */

export const OPTION_TYPES = ["string", "integer", "number", "boolean", "user", "role", "channel", "attachment", "subcommand", "subcommand_group"] as const;
export type CommandOptionType = (typeof OPTION_TYPES)[number];
export const VALUE_OPTION_TYPES = ["string", "integer", "number", "boolean", "user", "role", "channel", "attachment"] as const;
const VALUE_TYPES = new Set<string>(VALUE_OPTION_TYPES);

export interface CommandChoice {
  name: string;
  value: string | number;
}

export interface CommandOption {
  name: string;
  description: string;
  type: CommandOptionType;
  required?: boolean;
  choices?: CommandChoice[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  /** Only for subcommand (value options) and subcommand_group (subcommands). */
  options?: CommandOption[];
}

export const COMMAND_LIMITS = {
  maxOptionsPerLevel: 25,
  maxChoices: 25,
  maxNameLength: 32,
  maxDescriptionLength: 100,
  maxChoiceNameLength: 100,
  maxChoiceValueLength: 100,
  maxStringValueLength: 4000,
} as const;

export const OPTION_NAME_RE = /^[a-z0-9_-]{1,32}$/;

export const isValueType = (type: string): boolean => VALUE_TYPES.has(type);
export const isChoiceType = (type: string): boolean => type === "string" || type === "integer" || type === "number";

export type OptionIssueCode =
  | "too_many"
  | "name_invalid"
  | "name_duplicate"
  | "description_long"
  | "sub_nesting"
  | "group_empty"
  | "group_only_subs"
  | "sub_only_values"
  | "choices_count"
  | "choices_exclusive"
  | "choice_name"
  | "choice_value"
  | "choice_integer"
  | "choice_duplicate"
  | "minmax_number"
  | "minmax_integer"
  | "min_gt_max"
  | "length_range"
  | "length_order"
  | "length_zero_max"
  | "required_order"
  | "mixed_levels";

export interface OptionIssue {
  /** Index of the option per level: `[]` = the command itself, `[2]` = third option, `[0, 1]` = second option inside the first group. */
  at: number[];
  /** Index of the choice, when the problem is in one. */
  choice?: number;
  code: OptionIssueCode;
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const has = (v: unknown) => v !== undefined && v !== null;

function checkLevel(list: readonly CommandOption[], at: number[], depth: 0 | 1 | 2, out: OptionIssue[]): void {
  if (list.length > COMMAND_LIMITS.maxOptionsPerLevel) out.push({ at, code: "too_many" });
  const seen = new Set<string>();
  list.forEach((opt, i) => {
    const here = [...at, i];
    const name = norm(opt.name);
    if (!OPTION_NAME_RE.test(name)) out.push({ at: here, code: "name_invalid" });
    else if (seen.has(name)) out.push({ at: here, code: "name_duplicate" });
    seen.add(name);
    if ((opt.description ?? "").trim().length > COMMAND_LIMITS.maxDescriptionLength) out.push({ at: here, code: "description_long" });

    if (opt.type === "subcommand" || opt.type === "subcommand_group") {
      if (depth !== 0 && !(depth === 1 && opt.type === "subcommand")) {
        out.push({ at: here, code: "sub_nesting" });
        return;
      }
      const children = opt.options ?? [];
      checkLevel(children, here, opt.type === "subcommand_group" ? 1 : 2, out);
      if (opt.type === "subcommand_group") {
        if (children.length === 0) out.push({ at: here, code: "group_empty" });
        else if (children.some((c) => c.type !== "subcommand")) out.push({ at: here, code: "group_only_subs" });
      } else if (children.some((c) => !VALUE_TYPES.has(c.type))) {
        out.push({ at: here, code: "sub_only_values" });
      }
      return;
    }

    if (opt.choices !== undefined) {
      const list2 = opt.choices;
      if (!isChoiceType(opt.type) || list2.length === 0 || list2.length > COMMAND_LIMITS.maxChoices) out.push({ at: here, code: "choices_count" });
      if (has(opt.min) || has(opt.max) || has(opt.minLength) || has(opt.maxLength)) out.push({ at: here, code: "choices_exclusive" });
      const values = new Set<string>();
      (isChoiceType(opt.type) ? list2 : []).forEach((c, k) => {
        const cn = (c.name ?? "").trim();
        if (!cn || cn.length > COMMAND_LIMITS.maxChoiceNameLength) out.push({ at: here, choice: k, code: "choice_name" });
        if (opt.type === "string") {
          if (typeof c.value !== "string" || !c.value || c.value.length > COMMAND_LIMITS.maxChoiceValueLength) out.push({ at: here, choice: k, code: "choice_value" });
        } else if (!isNum(c.value)) {
          out.push({ at: here, choice: k, code: "choice_value" });
        } else if (opt.type === "integer" && !Number.isSafeInteger(c.value)) {
          out.push({ at: here, choice: k, code: "choice_integer" });
        }
        const key = String(c.value);
        if (values.has(key) && key !== "") out.push({ at: here, choice: k, code: "choice_duplicate" });
        values.add(key);
      });
    }

    if (opt.type === "integer" || opt.type === "number") {
      for (const f of ["min", "max"] as const) {
        if (has(opt[f]) && !isNum(opt[f])) out.push({ at: here, code: "minmax_number" });
        else if (opt.type === "integer" && has(opt[f]) && !Number.isInteger(opt[f])) out.push({ at: here, code: "minmax_integer" });
      }
      if (isNum(opt.min) && isNum(opt.max) && opt.min > opt.max) out.push({ at: here, code: "min_gt_max" });
    }
    if (opt.type === "string") {
      for (const f of ["minLength", "maxLength"] as const) {
        const v = opt[f];
        if (has(v) && (!Number.isInteger(v) || (v as number) < 0 || (v as number) > COMMAND_LIMITS.maxStringValueLength)) out.push({ at: here, code: "length_range" });
      }
      if (isNum(opt.minLength) && isNum(opt.maxLength) && opt.minLength > opt.maxLength) out.push({ at: here, code: "length_order" });
      if (isNum(opt.maxLength) && opt.maxLength < 1) out.push({ at: here, code: "length_zero_max" });
    }
  });

  // Required options go first (the backend rejects the other order instead of silently reordering).
  let sawOptional = false;
  list.forEach((o, i) => {
    if (!VALUE_TYPES.has(o.type)) return;
    if (!o.required) sawOptional = true;
    else if (sawOptional) out.push({ at: [...at, i], code: "required_order" });
  });
  if (depth === 0) {
    const subs = list.filter((o) => !VALUE_TYPES.has(o.type)).length;
    if (subs > 0 && subs !== list.length) out.push({ at, code: "mixed_levels" });
  }
}

/** Every problem of the options of one command (empty = the backend accepts them). */
export function validateOptions(list: readonly CommandOption[]): OptionIssue[] {
  const out: OptionIssue[] = [];
  checkLevel(list, [], 0, out);
  return out;
}

export const issueKey = (at: readonly number[]) => at.join(".");

/** Issues of ONE option row (not of its children). */
export function issuesAt(issues: readonly OptionIssue[], at: readonly number[]): OptionIssue[] {
  const key = issueKey(at);
  return issues.filter((i) => issueKey(i.at) === key);
}

/** Reads the `options` a server answer carries (anything unknown is dropped, nothing throws). */
export function normalizeOptions(raw: unknown): CommandOption[] {
  if (!Array.isArray(raw)) return [];
  const out: CommandOption[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, any>;
    const type = String(x.type ?? "").toLowerCase().replace(/^room$/, "channel") as CommandOptionType;
    if (typeof x.name !== "string" || !(OPTION_TYPES as readonly string[]).includes(type)) continue;
    const opt: CommandOption = { name: x.name, description: typeof x.description === "string" ? x.description : "", type };
    if (x.required === true) opt.required = true;
    if (Array.isArray(x.choices)) {
      opt.choices = x.choices
        .filter((c: any) => c && typeof c.name === "string" && (typeof c.value === "string" || typeof c.value === "number"))
        .map((c: any) => ({ name: c.name, value: c.value }));
    }
    for (const f of ["min", "max", "minLength", "maxLength"] as const) if (isNum(x[f])) opt[f] = x[f];
    if (Array.isArray(x.options)) opt.options = normalizeOptions(x.options);
    out.push(opt);
  }
  return out;
}

/** Body of one option for the PUT: normalised names, only the fields that apply to its type, no empty values. */
export function optionPayload(opt: CommandOption): CommandOption {
  const out: CommandOption = { name: norm(opt.name), description: (opt.description ?? "").trim(), type: opt.type };
  if (opt.type === "subcommand" || opt.type === "subcommand_group") {
    out.options = (opt.options ?? []).map(optionPayload);
    return out;
  }
  if (opt.required) out.required = true;
  if (opt.choices !== undefined) {
    out.choices = opt.choices.map((c) => ({ name: c.name.trim(), value: typeof c.value === "string" ? c.value : c.value }));
    return out;
  }
  if (opt.type === "integer" || opt.type === "number") {
    if (isNum(opt.min)) out.min = opt.min;
    if (isNum(opt.max)) out.max = opt.max;
  }
  if (opt.type === "string") {
    if (isNum(opt.minLength)) out.minLength = opt.minLength;
    if (isNum(opt.maxLength)) out.maxLength = opt.maxLength;
  }
  return out;
}

export function optionsPayload(list: readonly CommandOption[]): CommandOption[] {
  return list.map(optionPayload);
}

/** A blank option of a type (what "Add" creates). */
export function blankOption(type: CommandOptionType = "string", index = 0): CommandOption {
  const base = type === "subcommand" ? "sub" : type === "subcommand_group" ? "group" : "option";
  const opt: CommandOption = { name: `${base}${index + 1}`, description: "", type };
  if (type === "subcommand" || type === "subcommand_group") opt.options = [];
  return opt;
}

/**
 * Changes the type of an option keeping what still makes sense: choices survive between string / integer / number only when
 * every value converts; limits that do not apply are dropped (the backend rejects them).
 */
export function changeOptionType(opt: CommandOption, type: CommandOptionType): CommandOption {
  if (opt.type === type) return opt;
  const next: CommandOption = { name: opt.name, description: opt.description, type };
  if (type === "subcommand" || type === "subcommand_group") {
    next.options = [];
    return next;
  }
  if (opt.required) next.required = true;
  if (opt.choices && isChoiceType(type)) {
    const converted = opt.choices.map((c) => ({ name: c.name, value: type === "string" ? String(c.value) : Number(c.value) }));
    const ok = type === "string" ? true : converted.every((c) => Number.isFinite(c.value as number) && (type !== "integer" || Number.isSafeInteger(c.value as number)));
    if (ok) next.choices = converted;
  } else {
    if ((type === "integer" || type === "number") && (opt.type === "integer" || opt.type === "number")) {
      if (isNum(opt.min)) next.min = opt.min;
      if (isNum(opt.max)) next.max = opt.max;
    }
  }
  return next;
}

/** Moves item `from` to `to` (immutable); out-of-range indexes return the same list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Updates the option at `at` (immutable). `fn` returns the new option, or null to remove it. */
export function updateAt(list: readonly CommandOption[], at: readonly number[], fn: (o: CommandOption) => CommandOption | null): CommandOption[] {
  if (at.length === 0) return [...list];
  const [head, ...rest] = at;
  const out: CommandOption[] = [];
  list.forEach((o, i) => {
    if (i !== head) return void out.push(o);
    if (rest.length === 0) {
      const r = fn(o);
      if (r) out.push(r);
    } else {
      out.push({ ...o, options: updateAt(o.options ?? [], rest, fn) });
    }
  });
  return out;
}

/** Appends `child` at the level `at` (`[]` = top). */
export function appendAt(list: readonly CommandOption[], at: readonly number[], child: CommandOption): CommandOption[] {
  if (at.length === 0) return [...list, child];
  return updateAt(list, at, (o) => ({ ...o, options: [...(o.options ?? []), child] }));
}

/** Moves the option at `at` one step among its siblings. */
export function moveAt(list: readonly CommandOption[], at: readonly number[], delta: -1 | 1): CommandOption[] {
  if (at.length === 0) return [...list];
  if (at.length === 1) return moveItem(list, at[0], at[0] + delta);
  const parent = at.slice(0, -1);
  const idx = at[at.length - 1];
  return updateAt(list, parent, (o) => ({ ...o, options: moveItem(o.options ?? [], idx, idx + delta) }));
}

export const optionAt = (list: readonly CommandOption[], at: readonly number[]): CommandOption | null => {
  let level: readonly CommandOption[] = list;
  let found: CommandOption | null = null;
  for (const i of at) {
    found = level[i] ?? null;
    if (!found) return null;
    level = found.options ?? [];
  }
  return found;
};

/** One-line usage, like the backend's: `/cmd group sub <required> [optional]`. */
export function usageOf(command: string, options: readonly CommandOption[], sub?: readonly string[]): string {
  const leaf = (list: readonly CommandOption[]) => list.filter((o) => VALUE_TYPES.has(o.type)).map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(" ");
  const head = `/${command}`;
  if (options.some((o) => !VALUE_TYPES.has(o.type))) {
    if (!sub || sub.length === 0) return `${head} ${options.map((o) => o.name).join("|")}`;
    let level: readonly CommandOption[] = options;
    for (const s of sub) level = level.find((o) => o.name === s)?.options ?? [];
    const more = level.some((o) => !VALUE_TYPES.has(o.type)) ? level.map((o) => o.name).join("|") : leaf(level);
    return `${head} ${sub.join(" ")} ${more}`.trim();
  }
  return `${head} ${leaf(options)}`.trim();
}

/** What the person sees in the autocomplete for one command: every invocable form with its arguments. */
export interface CommandPreviewLine {
  /** `/cmd group sub` (what is typed before the arguments). */
  path: string;
  args: Array<{ name: string; type: CommandOptionType; required: boolean; description: string; summary: string }>;
}

/** Short constraint text of an option for the preview ("1–10", "max 50 characters", "a | b"). Language-neutral symbols only. */
export function optionSummary(opt: CommandOption): string {
  if (opt.choices?.length) return opt.choices.map((c) => c.name).join(" | ");
  if (opt.type === "integer" || opt.type === "number") {
    if (isNum(opt.min) && isNum(opt.max)) return `${opt.min}–${opt.max}`;
    if (isNum(opt.min)) return `≥ ${opt.min}`;
    if (isNum(opt.max)) return `≤ ${opt.max}`;
  }
  if (opt.type === "string") {
    if (isNum(opt.minLength) && isNum(opt.maxLength)) return `${opt.minLength}–${opt.maxLength}`;
    if (isNum(opt.minLength)) return `≥ ${opt.minLength}`;
    if (isNum(opt.maxLength)) return `≤ ${opt.maxLength}`;
  }
  return "";
}

export function previewLines(command: string, options: readonly CommandOption[]): CommandPreviewLine[] {
  const args = (list: readonly CommandOption[]) =>
    list.filter((o) => VALUE_TYPES.has(o.type)).map((o) => ({ name: o.name, type: o.type, required: o.required === true, description: o.description, summary: optionSummary(o) }));
  if (!options.some((o) => !VALUE_TYPES.has(o.type))) return [{ path: `/${command}`, args: args(options) }];
  const lines: CommandPreviewLine[] = [];
  for (const o of options) {
    if (o.type === "subcommand") lines.push({ path: `/${command} ${o.name}`, args: args(o.options ?? []) });
    else if (o.type === "subcommand_group") for (const s of o.options ?? []) lines.push({ path: `/${command} ${o.name} ${s.name}`, args: args(s.options ?? []) });
  }
  return lines;
}
