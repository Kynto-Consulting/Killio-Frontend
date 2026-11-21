/**
 * Search box of the rooms: operators as chips, Discord style.
 *
 *   hola "frase exacta" -excluida from:ana in:general has:link before:2026-01-31 pinned:true is:bot
 *
 * The server parses the same grammar (room-search.parser.ts of the backend); this module mirrors it on the client so that
 *   - typed operators become removable chips and the rest stays free text (`parseQuery`),
 *   - the chips and the text serialise back to ONE `q` string (`serializeQuery`; operators travel inside `q`, the only
 *     place where negations such as `-from:x` exist),
 *   - the box suggests operators and values for the word under the caret (`suggest`),
 *   - what the server understood (`filters`, `warnings`) can be checked against the chips (`reconcileChips`).
 * Spanish aliases (de, menciona, en, tiene, antes, despues, durante, fijado, es, hilo) are accepted and normalised to the
 * English keys. Pure, tested in search-query.test.ts. Relative imports only.
 */

export const MAX_QUERY_LENGTH = 300;

export type OperatorKey = "from" | "mentions" | "in" | "has" | "before" | "after" | "during" | "pinned" | "is" | "thread";
export const OPERATOR_KEYS: readonly OperatorKey[] = ["from", "mentions", "in", "has", "before", "after", "during", "pinned", "is", "thread"];
/** Operators the user can negate with a leading `-`. */
export const NEGATABLE: ReadonlySet<OperatorKey> = new Set<OperatorKey>(["from", "mentions", "in", "has"]);

const OPERATOR_ALIASES: Record<string, OperatorKey> = {
  from: "from", de: "from", mentions: "mentions", menciona: "mentions", in: "in", en: "in", has: "has", tiene: "has",
  before: "before", antes: "before", after: "after", despues: "after", during: "during", durante: "during",
  pinned: "pinned", fijado: "pinned", is: "is", es: "is", thread: "thread", hilo: "thread",
};

export type HasKind = "link" | "file" | "image" | "embed" | "thread" | "reaction" | "pin";
export const HAS_KINDS: readonly HasKind[] = ["link", "file", "image", "embed", "thread", "reaction", "pin"];
const HAS_ALIASES: Record<string, HasKind> = {
  link: "link", links: "link", enlace: "link", enlaces: "link", url: "link",
  file: "file", files: "file", archivo: "file", archivos: "file",
  image: "image", images: "image", img: "image", imagen: "image", imagenes: "image",
  embed: "embed", embeds: "embed", incrustado: "embed",
  thread: "thread", threads: "thread", hilo: "thread", hilos: "thread",
  reaction: "reaction", reactions: "reaction", reaccion: "reaction", reacciones: "reaction",
  pin: "pin", pins: "pin", pinned: "pin", fijado: "pin", fijados: "pin",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REL = /^(\d{1,4})(min|mo|h|d|w|y)$/;
const MAX_VALUE_LENGTH = 100;

/** Lower case and accents out, like the server's fold. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export const canonicalOperator = (word: string): OperatorKey | null => OPERATOR_ALIASES[fold(word)] ?? null;
export const canonicalHas = (word: string): HasKind | null => HAS_ALIASES[fold(word)] ?? null;

// ── Tokens ─────────────────────────────────────────────────────────────────

export interface Token {
  /** Position in the input (the whole token, including `-`, the operator name and the quotes). */
  start: number;
  end: number;
  negated: boolean;
  /** Canonical operator when the token is `op:value` with a non-empty value; null for free text. */
  key: OperatorKey | null;
  /** The word before the colon, as typed (null for free text). */
  keyWord: string | null;
  value: string;
  quoted: boolean;
}

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);

/** Same rules as the server: "phrases", -negation, `key:value`, `key:"quoted value"`. `from:` followed by a space is plain text. */
export function tokenize(input: string): Token[] {
  const out: Token[] = [];
  const n = input.length;
  let i = 0;
  while (i < n) {
    while (i < n && isSpace(input[i])) i += 1;
    if (i >= n) break;
    const start = i;
    let negated = false;
    if (input[i] === "-" && i + 1 < n && !isSpace(input[i + 1])) {
      negated = true;
      i += 1;
    }
    if (input[i] === '"') {
      const close = input.indexOf('"', i + 1);
      const stop = close === -1 ? n : close;
      out.push({ start, end: close === -1 ? n : close + 1, negated, key: null, keyWord: null, value: input.slice(i + 1, stop), quoted: true });
      i = close === -1 ? n : close + 1;
      continue;
    }
    let j = i;
    while (j < n && !isSpace(input[j])) j += 1;
    const word = input.slice(i, j);
    const colon = word.indexOf(":");
    const keyWord = colon > 0 ? word.slice(0, colon) : null;
    const key = keyWord ? canonicalOperator(keyWord) : null;
    if (key && colon < word.length - 1) {
      let value = word.slice(colon + 1);
      let quoted = false;
      if (value.startsWith('"')) {
        const close = input.indexOf('"', i + colon + 2);
        const stop = close === -1 ? n : close;
        value = input.slice(i + colon + 2, stop);
        quoted = true;
        j = close === -1 ? n : close + 1;
      }
      out.push({ start, end: j, negated, key, keyWord, value, quoted });
    } else {
      out.push({ start, end: j, negated, key: null, keyWord: null, value: word, quoted: false });
    }
    i = j;
  }
  return out;
}

// ── Model ──────────────────────────────────────────────────────────────────

export interface SearchChip {
  key: OperatorKey;
  value: string;
  negated: boolean;
}

export interface SearchModel {
  /** Free text: words, "phrases" and -exclusions, as typed. */
  text: string;
  chips: SearchChip[];
}

export const emptyModel = (): SearchModel => ({ text: "", chips: [] });

const cleanValue = (v: string) => v.replace(/^[@#]+/, "").replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, MAX_VALUE_LENGTH);

/** Normalised chip (alias to canonical key, has kind to its canonical word), or null when there is nothing left. */
export function makeChip(keyWord: string, rawValue: string, negated = false): SearchChip | null {
  const key = canonicalOperator(keyWord);
  const value = cleanValue(rawValue);
  if (!key || !value) return null;
  if (key === "has") return { key, value: canonicalHas(value) ?? value, negated };
  if (key === "is") {
    const v = fold(value);
    const kind = v === "bot" || v === "bots" ? "bot" : ["human", "humano", "persona", "person"].includes(v) ? "human" : value;
    return { key, value: kind, negated };
  }
  if (key === "pinned") {
    const v = fold(value);
    return { key, value: ["true", "yes", "si", "1", "on"].includes(v) ? "true" : ["false", "no", "0", "off"].includes(v) ? "false" : value, negated };
  }
  return { key, value, negated };
}

export const sameChip = (a: SearchChip, b: SearchChip) => a.key === b.key && a.negated === b.negated && fold(a.value) === fold(b.value);

/** Quotes a value when it has spaces (or is empty of safe characters), as the server's tokenizer expects. */
export function quoteValue(value: string): string {
  const v = value.replace(/"/g, "");
  return /\s/.test(v) ? `"${v}"` : v;
}

export function serializeChip(c: SearchChip): string {
  return `${c.negated ? "-" : ""}${c.key}:${quoteValue(c.value)}`;
}

/** The `q` string: chips first, then the free text. */
export function serializeQuery(model: SearchModel): string {
  return [...model.chips.map(serializeChip), model.text.trim()].filter(Boolean).join(" ");
}

/** Characters the server would reject (`q` is capped). */
export const queryLength = (model: SearchModel) => serializeQuery(model).length;
export const isTooLong = (model: SearchModel) => queryLength(model) > MAX_QUERY_LENGTH;

const rawOf = (t: Token, input: string) => input.slice(t.start, t.end);

/**
 * Moves the operator tokens of `input` into chips (deduplicated) and keeps the rest as text. With `keepLast` the token
 * the user is still typing (the last one, when the input does not end in a space) stays in the text.
 */
export function absorb(input: string, base: SearchModel = emptyModel(), keepLast = false): SearchModel {
  const tokens = tokenize(input);
  const chips = [...base.chips];
  const text: string[] = [];
  const typing = keepLast && input.length > 0 && !isSpace(input[input.length - 1]) ? tokens.length - 1 : -1;
  tokens.forEach((t, i) => {
    if (t.key && i !== typing) {
      const chip = makeChip(t.key, t.value, t.negated);
      if (chip && !chips.some((c) => sameChip(c, chip))) chips.push(chip);
      return;
    }
    text.push(rawOf(t, input));
  });
  const kept = [base.text.trim(), ...text].filter(Boolean).join(" ");
  return { text: kept, chips };
}

/** Full parse of a `q` string (e.g. the one in a recent search). */
export const parseQuery = (q: string): SearchModel => absorb(q, emptyModel(), false);

export function removeChip(model: SearchModel, index: number): SearchModel {
  return { ...model, chips: model.chips.filter((_, i) => i !== index) };
}

export function toggleNegation(model: SearchModel, index: number): SearchModel {
  return {
    ...model,
    chips: model.chips.map((c, i) => (i === index && NEGATABLE.has(c.key) ? { ...c, negated: !c.negated } : c)),
  };
}

export const isEmptyModel = (m: SearchModel) => m.chips.length === 0 && m.text.trim() === "";

/** A query that only excludes or only filters is valid; this says whether there is anything at all to send. */
export const canSearch = (m: SearchModel) => !isEmptyModel(m) && !isTooLong(m);

// ── Validation of chips (client side, mirrors the server's warnings) ───────

export type ChipProblem = "invalid_date" | "unknown_has_kind" | "invalid_value" | "invalid_thread" | "ignored_in_room";

function validDateWord(raw: string): boolean {
  const v = fold(raw.trim());
  if (["today", "hoy", "yesterday", "ayer"].includes(v) || REL.test(v)) return true;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (day) {
    const [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
    if (y < 1970 || y > 2200) return false;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }
  const full = /^(\d{4})-(\d{2})-(\d{2})t(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(z|[+-]\d{2}:?\d{2})?$/.exec(v);
  return Boolean(full && Number(full[4]) <= 23 && Number(full[5]) <= 59 && Number(full[6] ?? 0) <= 59);
}

export function chipProblem(c: SearchChip, scope: "room" | "team"): ChipProblem | null {
  switch (c.key) {
    case "has": return canonicalHas(c.value) ? null : "unknown_has_kind";
    case "before": case "after": case "during": return validDateWord(c.value) ? null : "invalid_date";
    case "pinned": return c.value === "true" || c.value === "false" ? null : "invalid_value";
    case "is": return c.value === "bot" || c.value === "human" ? null : "invalid_value";
    case "thread": return UUID.test(c.value) ? null : "invalid_thread";
    case "in": return scope === "room" ? "ignored_in_room" : null;
    default: return null;
  }
}

// ── Server filters back to chips ───────────────────────────────────────────

export interface ServerFilters {
  from: { include: string[]; exclude: string[] };
  mentions: { include: string[]; exclude: string[] };
  in: { include: string[]; exclude: string[] };
  has: { include: string[]; exclude: string[] };
  after: string | null;
  before: string | null;
  pinned: boolean | null;
  is: "bot" | "human" | null;
  thread: string | null;
}

/** The chips the server understood (what its `filters` say), in the canonical form. Dates come back as instants. */
export function chipsFromFilters(f: ServerFilters): SearchChip[] {
  const out: SearchChip[] = [];
  for (const key of ["from", "mentions", "in", "has"] as const) {
    for (const v of f[key].include) out.push({ key, value: v, negated: false });
    for (const v of f[key].exclude) out.push({ key, value: v, negated: true });
  }
  if (f.after) out.push({ key: "after", value: f.after, negated: false });
  if (f.before) out.push({ key: "before", value: f.before, negated: false });
  if (f.pinned !== null) out.push({ key: "pinned", value: String(f.pinned), negated: false });
  if (f.is) out.push({ key: "is", value: f.is, negated: false });
  if (f.thread) out.push({ key: "thread", value: f.thread, negated: false });
  return out;
}

export interface ServerWarning {
  operator: string;
  value: string;
  code: string;
}

export interface ChipStatus {
  chip: SearchChip;
  /** null: the server (or the client check, before an answer) found nothing wrong. */
  problem: ChipProblem | "not_found" | "dropped" | null;
}

/**
 * Chips with what the server said about them: a warning that names the chip (`not_found`, `invalid_date`, ...) or a chip
 * the server's `filters` do not contain at all (dropped). Without a server answer only the client checks apply.
 */
export function reconcileChips(
  chips: readonly SearchChip[],
  scope: "room" | "team",
  server?: { filters: ServerFilters; warnings: readonly ServerWarning[] } | null,
): ChipStatus[] {
  return chips.map((chip) => {
    const own = chipProblem(chip, scope);
    if (own) return { chip, problem: own };
    if (!server) return { chip, problem: null };
    const w = server.warnings.find((x) => canonicalOperator(x.operator) === chip.key && (x.value === "" || fold(x.value) === fold(chip.value)));
    if (w) return { chip, problem: w.code === "not_found" ? "not_found" : (w.code as ChipProblem) };
    const f = server.filters;
    let understood = true;
    switch (chip.key) {
      case "from": case "mentions": case "in": case "has": {
        const list = chip.negated ? f[chip.key].exclude : f[chip.key].include;
        understood = list.some((v) => fold(v) === fold(chip.value));
        break;
      }
      case "before": understood = f.before !== null; break;
      case "after": understood = f.after !== null; break;
      case "during": understood = f.after !== null && f.before !== null; break;
      case "pinned": understood = f.pinned !== null; break;
      case "is": understood = f.is !== null; break;
      case "thread": understood = f.thread !== null; break;
    }
    return { chip, problem: understood ? null : "dropped" };
  });
}

// ── Suggestions ────────────────────────────────────────────────────────────

export interface SuggestionSources {
  scope: "room" | "team";
  members: ReadonlyArray<{ id: string; name: string; email?: string | null }>;
  roles: ReadonlyArray<{ id: string; name: string }>;
  rooms: ReadonlyArray<{ id: string; name: string; kind?: string }>;
  now?: Date;
}

export interface Suggestion {
  id: string;
  type: "operator" | "value";
  /** What the token becomes (operator suggestion: `from:`; value: `from:ana`). */
  insert: string;
  /** The suggestion completes a chip: the token is absorbed and a space follows. */
  commit: boolean;
  /** Main text and hint, resolved by the UI (labels are translated there), keyed by operator / value kind. */
  label: string;
  hint?: string;
  key: OperatorKey;
  valueKind?: "user" | "role" | "room" | "has" | "date" | "is" | "bool" | "me";
}

export function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Quick values for the date operators: words and offsets the server understands, plus today's date. */
export function quickDates(now: Date = new Date()): string[] {
  return ["today", "yesterday", "7d", "2w", "1mo", "1y", toIsoDay(now)];
}

/** The token under the caret (the whole word the user is editing), or an empty one at the caret. */
export function tokenAtCaret(input: string, caret: number): { start: number; end: number; text: string } {
  const at = Math.max(0, Math.min(caret, input.length));
  let s = at;
  let e = at;
  while (s > 0 && !isSpace(input[s - 1])) s -= 1;
  while (e < input.length && !isSpace(input[e])) e += 1;
  return { start: s, end: e, text: input.slice(s, e) };
}

const OPERATOR_HINT_ORDER: readonly OperatorKey[] = ["from", "in", "has", "mentions", "before", "after", "during", "pinned", "is"];

function matches(candidate: string, needle: string): boolean {
  if (!needle) return true;
  const c = fold(candidate);
  const n = fold(needle);
  return c.startsWith(n) || c.split(/\s+/).some((w) => w.startsWith(n)) || c.includes(n);
}

const mk = (key: OperatorKey, valueKind: Suggestion["valueKind"], value: string, negated: boolean, label: string, hint?: string): Suggestion => ({
  id: `${negated ? "-" : ""}${key}:${value}`,
  type: "value",
  insert: `${negated ? "-" : ""}${key}:${quoteValue(value)}`,
  commit: true,
  label,
  hint,
  key,
  valueKind,
});

/**
 * Suggestions for the word under the caret.
 *  - empty word: the operators;
 *  - a prefix of an operator name (or alias): the matching operators;
 *  - `op:partial`: values of that operator (users, roles, channels, kinds of `has`, dates, ...).
 */
export function suggest(input: string, caret: number, src: SuggestionSources, limit = 8): Suggestion[] {
  const word = tokenAtCaret(input, caret).text;
  const negated = word.startsWith("-") && word.length > 1;
  const body = negated ? word.slice(1) : word;
  const colon = body.indexOf(":");
  if (body.startsWith('"')) return [];
  const available = (k: OperatorKey) => !(k === "in" && src.scope === "room");

  if (colon === -1) {
    const needle = body;
    return OPERATOR_HINT_ORDER.filter((k) => available(k) && (!negated || NEGATABLE.has(k)))
      .filter((k) => !needle || [k, ...Object.keys(OPERATOR_ALIASES).filter((a) => OPERATOR_ALIASES[a] === k)].some((name) => fold(name).startsWith(fold(needle))))
      .map<Suggestion>((k) => ({
        id: `op:${k}`,
        type: "operator",
        insert: `${negated ? "-" : ""}${k}${k === "pinned" ? ":true" : ":"}`,
        commit: k === "pinned",
        label: `${negated ? "-" : ""}${k}:`,
        key: k,
      }))
      .slice(0, limit);
  }

  const key = canonicalOperator(body.slice(0, colon));
  if (!key || !available(key)) return [];
  const needle = body.slice(colon + 1).replace(/^["@#]+/, "");
  const now = src.now ?? new Date();
  const out: Suggestion[] = [];
  switch (key) {
    case "from":
    case "mentions": {
      if (matches("me", needle) || matches("yo", needle)) out.push(mk(key, "me", "me", negated, "me"));
      for (const m of src.members) if (matches(m.name, needle) || (m.email && matches(m.email.split("@")[0] ?? "", needle))) out.push(mk(key, "user", m.name, negated, m.name, m.email ?? undefined));
      if (key === "mentions") for (const r of src.roles) if (matches(r.name, needle)) out.push(mk(key, "role", r.name, negated, r.name));
      break;
    }
    case "in":
      for (const r of src.rooms) if (matches(r.name, needle)) out.push(mk(key, "room", r.name, negated, r.name));
      break;
    case "has":
      for (const k of HAS_KINDS) if (matches(k, needle)) out.push(mk(key, "has", k, negated, k));
      break;
    case "before": case "after": case "during":
      for (const d of quickDates(now)) if (matches(d, needle)) out.push(mk(key, "date", d, false, d));
      break;
    case "is":
      for (const v of ["bot", "human"]) if (matches(v, needle)) out.push(mk(key, "is", v, false, v));
      break;
    case "pinned":
      for (const v of ["true", "false"]) if (matches(v, needle)) out.push(mk(key, "bool", v, false, v));
      break;
    case "thread":
      break;
  }
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))).slice(0, limit);
}

/** Replaces the word under the caret with the suggestion; a committing one is followed by a space. */
export function applySuggestion(input: string, caret: number, s: Suggestion): { input: string; caret: number } {
  const t = tokenAtCaret(input, caret);
  const tail = input.slice(t.end);
  const insert = s.commit ? `${s.insert} ` : s.insert;
  const next = `${input.slice(0, t.start)}${insert}${s.commit && tail.startsWith(" ") ? tail.slice(1) : tail}`;
  return { input: next, caret: t.start + insert.length };
}

// ── Recent searches ────────────────────────────────────────────────────────

export const RECENT_KEY = "killio:rooms:recent-searches";
export const RECENT_MAX = 8;

export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= MAX_QUERY_LENGTH).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(list: readonly string[], q: string): string[] {
  const query = q.trim();
  if (!query || query.length > MAX_QUERY_LENGTH) return [...list];
  return [query, ...list.filter((x) => x !== query)].slice(0, RECENT_MAX);
}

export const removeRecent = (list: readonly string[], q: string): string[] => list.filter((x) => x !== q);

// ── What to send while the user is still typing ────────────────────────────

/**
 * The model to search with: finished operators are chips, and the word still being typed (the last one, with no space
 * after it) is left out when it looks like an operator, so `from:an` is not sent as `from:an` on its way to `from:ana`.
 */
export function committedModel(input: string, chips: readonly SearchChip[]): SearchModel {
  const tokens = tokenize(input);
  const typing = input.length > 0 && !isSpace(input[input.length - 1]) ? tokens[tokens.length - 1] : undefined;
  const cut = typing && typing.key ? input.slice(0, typing.start) : input;
  return absorb(cut, { text: "", chips: [...chips] }, false);
}
