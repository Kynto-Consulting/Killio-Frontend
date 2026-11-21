/**
 * Tab-completion and hints for KQL text boxes. Pure (no React) so it is unit-tested.
 *
 * `suggest()` looks at the text before the caret and offers what can come next: fields, flags, functions, keywords,
 * operators, dates and, for `tag = `, `list = `, `assignee = `... the real values found in the data (`KqlSchema`).
 * `findHints()` explains typos ("Unknown field status2 - did you mean status?") and values that match nothing
 * ("No card has the tag urgnte - did you mean urgente?") and can say how to fix them.
 */
import { KQL_FUNCTIONS, KQL_FUNCTION_CATALOG, KQL_M_ALIASES, kqlFunctionName } from './kql.ts';
import type { KqlCard, KqlContext, KqlData } from './kql.ts';

export interface KqlSchema {
  /** `filter` = one condition (the list/board filter); `script` = full statements (`group by`, `select`, `rows of`...). */
  mode: 'filter' | 'script';
  tags: string[];
  lists: string[];
  boards: string[];
  priorities: string[];
  /** People: names and aliases. */
  people: string[];
  groups: string[];
  /** Custom fields of the cards (`cf.<name>`) and the columns of the tables. */
  customFields: string[];
  tables: string[];
  columns: string[];
  sources: string[];
  /** Boards and lists the cards can be scoped to (`cards in board "X" list "Y"`). */
  boardScopes?: Array<{ name: string; id?: string }>;
  listScopes?: Array<{ name: string; board: string; id?: string }>;
}

export type SuggestionKind = 'field' | 'flag' | 'function' | 'keyword' | 'operator' | 'value' | 'date' | 'table' | 'source';

export interface Suggestion {
  /** What the list shows. */
  label: string;
  /** What replaces the word being typed. */
  insert: string;
  kind: SuggestionKind;
  detail?: string;
}

export interface Completion {
  /** The replaced range in the text. */
  from: number;
  to: number;
  items: Suggestion[];
}

export interface Hint {
  level: 'warn' | 'info';
  message: string;
  /** Applying the hint replaces `[from, to)` with `replacement`. */
  fix?: { from: number; to: number; replacement: string; label: string };
}

export const EMPTY_SCHEMA: KqlSchema = { mode: 'filter', tags: [], lists: [], boards: [], priorities: [], people: [], groups: [], customFields: [], tables: [], columns: [], sources: [] };

const FIELDS = ['title', 'description', 'list', 'board', 'path', 'assignee', 'group', 'tag', 'priority', 'due', 'start', 'created', 'updated', 'done', 'points', 'comments', 'progress',
  'age', 'cycle', 'overdue_days', 'title_len', 'tag_count', 'assignee_count'];
const FIELD_ALIASES = ['status', 'column', 'owner', 'deadline', 'completed', 'effort', 'name', 'label'];
/** Function names as they are written (addDays, not adddays). */
const FUNCTION_NAMES = Object.keys(KQL_FUNCTIONS).map(kqlFunctionName);

/** The `param` and `fn` declarations written so far in a script (for `$` and function completion). */
export function declarationsOf(text: string): { params: Array<{ name: string; value: string }>; functions: Array<{ name: string; args: string[] }> } {
  const params: Array<{ name: string; value: string }> = [];
  const functions: Array<{ name: string; args: string[] }> = [];
  for (const m of text.matchAll(/^[ \t]*(?:param|parametro)[ \t]+([\p{L}_][\p{L}\p{N}_]*)[ \t]*=[ \t]*(.+)$/gimu)) params.push({ name: m[1], value: m[2].trim() });
  for (const m of text.matchAll(/^[ \t]*(?:fn|funcion)[ \t]+([\p{L}_][\p{L}\p{N}_]*)[ \t]*\(([^)\n]*)\)[ \t]*=/gimu)) functions.push({ name: m[1], args: m[2].split(',').map((a) => a.trim()).filter(Boolean) });
  return { params, functions };
}

const catalogNames = new Set(KQL_FUNCTION_CATALOG.map((f) => f.name));
const CATALOG_ITEMS: Suggestion[] = KQL_FUNCTION_CATALOG.map((f) => ({ label: `${kqlFunctionName(f.name)}(`, insert: `${kqlFunctionName(f.name)}(`, kind: 'function' as const, detail: `${f.category} · ${f.signature}` }));
const PLAIN_FUNCTION_ITEMS: Suggestion[] = Object.keys(KQL_FUNCTIONS).filter((k) => !catalogNames.has(k)).map((k) => ({ label: `${kqlFunctionName(k)}(`, insert: `${kqlFunctionName(k)}(`, kind: 'function' as const }));
const M_ITEMS: Suggestion[] = KQL_M_ALIASES.map(([m, k]) => ({ label: `${m}(`, insert: `${m}(`, kind: 'function' as const, detail: `Power Query · ${KQL_FUNCTION_CATALOG.find((f) => f.name === k)?.signature ?? k}` }));

/** Built-in functions (with category and signature), user functions of the script, and Power Query names once the typed prefix matches one. */
function functionItems(prefix: string, text: string): Suggestion[] {
  const p = prefix.toLowerCase();
  const wantsM = p.length > 0 && M_ITEMS.some((i) => i.label.toLowerCase().startsWith(p));
  const mine = declarationsOf(text).functions.map((f): Suggestion => ({ label: `${f.name}(`, insert: `${f.name}(`, kind: 'function', detail: `your function · ${f.name}(${f.args.join(', ')})` }));
  return [...mine, ...CATALOG_ITEMS, ...PLAIN_FUNCTION_ITEMS, ...(wantsM ? M_ITEMS : [])];
}
const FLAGS = ['done', 'open', 'overdue', 'assigned', 'unassigned', 'archived'];
const DATE_FIELDS = new Set(['due', 'start', 'created', 'updated', 'done', 'completed', 'deadline']);
const SOURCES = ['cards', 'values', 'rows of', 'documents', 'bricks', 'items', 'boards', 'lists', 'members', 'groups', 'activity', 'scripts'];
const OPERATORS = ['=', '!=', '~', 'contains', 'startswith', 'endswith', 'in', 'not in', 'between', 'is empty', 'is not empty', '<', '<=', '>', '>=', '+', '-', '*', '/', '%', '&'];
const DIMENSIONS = ['list', 'board', 'assignee', 'group', 'tag', 'priority', 'day(', 'week(', 'month(', 'year('];
const METRICS = ['count', 'percent', 'sum(', 'avg(', 'min(', 'max(', 'median(', 'stddev(', 'percentile(', 'unique(', 'count(distinct ', 'count_if(', 'sum_if(', 'ratio(', 'join(', 'first(', 'last('];
const DATE_VALUES = ['today', 'yesterday', 'tomorrow', 'now', '+7d', '-30d', '+1w', '-1m'];
const DATE_WINDOWS = ['last 7d', 'last 30d', 'next 7d', 'next 2w', 'today', 'this week', 'this month', 'last month', 'this year'];
const KEYWORDS = ['where', 'and', 'or', 'not', 'group by', 'select', 'order by', 'limit', 'as', 'let', 'show', 'from', 'asc', 'desc', 'in', 'is', 'between', 'empty', 'last', 'next', 'rows', 'of',
  'having', 'offset', 'distinct', 'top', 'bottom', 'join', 'on', 'left', 'inner', 'union', 'pivot', 'unpivot', 'transpose', 'tail', 'droplast', 'header', 'except', 'path', 'param', 'fn', 'values', 'then', 'else', 'null'];
/** Clauses offered after a finished condition in a script. */
const CLAUSES = ['group by', 'select', 'select distinct', 'having', 'order by', 'top', 'bottom', 'offset', 'limit', 'tail', 'droplast', 'pivot', 'unpivot', 'transpose', 'join', 'union', 'left'];

const lower = (s: string) => s.toLowerCase();
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const fold = (s: string) => stripAccents(lower(s));

/** Levenshtein distance, early-exit above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** The candidate closest to `word` (case and accents ignored), if it is close enough to be a typo. */
export function closestMatch(word: string, candidates: string[]): string | null {
  const w = fold(word);
  if (w.length < 2) return null;
  const limit = w.length <= 4 ? 1 : 2;
  let best: string | null = null;
  let bestDist = limit + 1;
  for (const c of candidates) {
    const d = editDistance(w, fold(c), limit);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return best;
}

/** The aliases of the joins written so far: `join members` -> members, `join rows of "Clientes" as c` -> c. */
export function joinAliases(text: string): string[] {
  const out: string[] = [];
  const re = /\b(?:join|unir)\s+(?:(?:rows|table|database|db)\s+(?:of\s+)?)?("[^"]+"|\[[^\]]+\]|[\p{L}\p{N}_-]+)(?:\s+as\s+("[^"]+"|[\p{L}\p{N}_-]+))?/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = (m[2] ?? m[1]).replace(/^["[]|["\]]$/g, '');
    if (name && name.toLowerCase() !== 'on' && !out.includes(name)) out.push(name);
  }
  return out;
}

function allFields(schema: KqlSchema): string[] {
  return [...FIELDS, ...schema.customFields.map((f) => `cf.${f}`), ...schema.columns.map((c) => (/^[\w.]+$/.test(c) ? c : `[${c}]`))];
}

function rank(items: Suggestion[], prefix: string): Suggestion[] {
  const p = fold(prefix);
  const seen = new Set<string>();
  const out: Array<{ s: Suggestion; score: number }> = [];
  for (const s of items) {
    const key = `${s.kind}:${lower(s.insert)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = fold(s.label);
    if (p === '') { out.push({ s, score: 5 }); continue; }
    if (text === p) continue; // already typed in full
    if (text.startsWith(p)) out.push({ s, score: 0 });
    else if (text.split(/[\s._-]+/).some((w) => w.startsWith(p))) out.push({ s, score: 2 });
    else if (text.includes(p)) out.push({ s, score: 3 });
  }
  return out.sort((a, b) => a.score - b.score).map((x) => x.s);
}

const quoteScope = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
const quoteValue = (v: string) => (/^[\w.-]+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`);
const asValues = (list: string[], kind: SuggestionKind = 'value', detail?: string): Suggestion[] => list.map((v) => ({ label: v, insert: quoteValue(v), kind, detail }));

/** Values offered after `field =`, by field. */
/** Lists whose name is shared with another list: they need "Board / List" to be told apart. */
function sharedListPaths(schema: KqlSchema): Array<{ name: string; board: string; path: string }> {
  const lists = schema.listScopes ?? [];
  return lists.filter((l) => lists.filter((o) => fold(o.name) === fold(l.name)).length > 1).map((l) => ({ ...l, path: `${l.board} / ${l.name}` }));
}

function valuesFor(field: string, schema: KqlSchema): Suggestion[] {
  const f = lower(field);
  if (f === 'tag' || f === 'tags' || f === 'label' || f === 'labels' || f === 'etiqueta') return asValues(schema.tags, 'value', 'tag');
  if (['list', 'status', 'column', 'lista', 'estado'].includes(f)) return [...asValues(schema.lists, 'value', 'list'), ...sharedListPaths(schema).map((l) => ({ label: l.path, insert: quoteValue(l.path), kind: 'value' as const, detail: 'qualified list' }))];
  if (f === 'board' || f === 'tablero') return asValues(schema.boards, 'value', 'board');
  if (f === 'priority' || f === 'prioridad') return asValues(schema.priorities, 'value', 'priority');
  if (['assignee', 'owner', 'responsable', 'asignado'].includes(f)) return [{ label: 'me', insert: 'me', kind: 'value', detail: 'you' }, ...asValues(schema.people, 'value', 'person'), ...schema.groups.map((g) => ({ label: `@${g}`, insert: `@${g}`, kind: 'value' as const, detail: 'group' }))];
  if (f === 'group' || f === 'grupo') return asValues(schema.groups, 'value', 'group');
  if (DATE_FIELDS.has(f)) return DATE_VALUES.map((d) => ({ label: d, insert: d, kind: 'date' as const }));
  if (f.startsWith('cf.')) return [];
  return [];
}

/** The word under the caret and where it starts (letters, digits, `.`, `_`, and a leading `#`/`@`/quote/`[`). */
function wordBefore(text: string, caret: number): { word: string; from: number } {
  const m = /[#@"[$]?[\p{L}\p{N}_.+-]*$/u.exec(text.slice(0, caret));
  const word = m ? m[0] : '';
  return { word, from: caret - word.length };
}

/** What to offer at `caret`. Returns an empty list when nothing sensible follows. */
export function suggest(text: string, caret: number, schema: KqlSchema = EMPTY_SCHEMA): Completion {
  const { word, from } = wordBefore(text, caret);
  const before = text.slice(0, from);
  const to = caret;
  const done = (items: Suggestion[], prefix = word): Completion => ({ from, to, items: rank(items, prefix.replace(/^["[]/, '')).slice(0, 60) });
  const script = schema.mode === 'script';

  // inside a quoted string or a regex literal: only values make sense, and only right after an operator
  const quotes = (before.match(/"/g) ?? []).length;
  if (quotes % 2 === 1) {
    const opened = before.lastIndexOf('"');
    const head = before.slice(0, opened);
    const m = /([\p{L}\p{N}_.]+)\s*(?:=|!=|~|contains|startswith|endswith|in|not in)\s*\(?[^()]*$/iu.exec(head);
    if (m) return { from: opened + 1, to, items: rank(valuesFor(m[1], schema).map((s) => ({ ...s, insert: s.label })), text.slice(opened + 1, caret)).slice(0, 12) };
    return { from, to, items: [] };
  }

  // #tag and @person/@group shortcuts
  if (word.startsWith('$')) return done(declarationsOf(text).params.map((d) => ({ label: `$${d.name}`, insert: `$${d.name}`, kind: 'value' as const, detail: d.value })));
  if (word.startsWith('#')) return done(schema.tags.map((t) => ({ label: `#${t}`, insert: `#${quoteValue(t)}`, kind: 'value' as const, detail: 'tag' })));
  if (word.startsWith('@')) return done([...schema.groups.map((g) => ({ label: `@${g}`, insert: `@${g}`, kind: 'value' as const, detail: 'group' })), ...schema.people.map((p) => ({ label: `@${p}`, insert: `@${p}`, kind: 'value' as const, detail: 'person' }))]);

  // `alias.` after a join: the joined source's fields
  const dot = /^([\p{L}\p{N}_-]+)\.(.*)$/u.exec(word);
  if (script && dot && joinAliases(text).some((a) => a.toLowerCase() === dot[1].toLowerCase())) {
    const names = [...FIELDS, ...schema.customFields, ...schema.columns];
    return { from, to, items: rank(names.map((f) => ({ label: `${dot[1]}.${f}`, insert: `${dot[1]}.${/^[\w.]+$/.test(f) ? f : `[${f}]`}`, kind: 'field' as const, detail: 'joined field' })), word).slice(0, 60) };
  }

  // "rows of <table>"
  if (/\b(?:rows\s+of|table|database|db|filas\s+de)\s+$/i.test(before)) return done(schema.tables.map((t) => ({ label: t, insert: `"${t}"`, kind: 'table' as const })));
  // `select ` offers `*`; right after `*` come `except` and the clauses
  if (script && /\bselect\s+(?:distinct\s+)?(?:[^,]*,\s*)*\*\s+$/i.test(before)) return done([{ label: 'except', insert: 'except ', kind: 'keyword' }, ...CLAUSES.map((k) => ({ label: k, insert: `${k} `, kind: 'keyword' as const }))]);
  if (script && /\bselect\s+(?:distinct\s+)?$/i.test(before)) return done([{ label: '*', insert: '*', kind: 'field' }, { label: 'distinct', insert: 'distinct ', kind: 'keyword' }, ...allFields(schema).map((f) => ({ label: f, insert: f, kind: 'field' as const })), ...functionItems('', text)]);
  // `cards in ` / `cards in board ` / `cards in list `
  const scopeIn = /\bcards\s+(?:in|en)\s+(?:[^"\n]*?(?:"[^"]*"\s*,?\s*)*)$/i.test(before) && /\b(?:in|en)\s+(?:(?:board|tablero|list|lista)\s+(?:id\s+)?(?:"[^"]*"\s*,\s*)*|(?:(?:board|tablero|list|lista)\s+(?:id\s+)?"[^"]*"\s*)*)$/i.test(before);
  if (scopeIn) {
    const boardsHere = (schema.boardScopes ?? []).map((b) => ({ label: b.name, insert: quoteScope(b.name), kind: 'value' as const, detail: 'board' }));
    const listsHere = (schema.listScopes ?? []).map((l) => ({ label: `${l.name} — ${l.board}`, insert: quoteScope(`${l.board} / ${l.name}`), kind: 'value' as const, detail: 'list' }));
    const tail = /\b(board|tablero|list|lista)\s+(?:id\s+)?(?:"[^"]*"\s*,\s*)*$/i.exec(before)?.[1];
    if (tail && /^(board|tablero)$/i.test(tail)) return done(boardsHere);
    if (tail) return done(listsHere);
    return done([{ label: 'board', insert: 'board ', kind: 'keyword' }, { label: 'list', insert: 'list ', kind: 'keyword' }, ...boardsHere, ...listsHere]);
  }
  if (script && /\b(?:transpose|transponer)\s+$/i.test(before)) return done([{ label: 'header', insert: 'header', kind: 'keyword' }]);
  if (script && /\b(?:unpivot|despivotar)\s+$/i.test(before)) return done([{ label: 'except', insert: 'except ', kind: 'keyword' }, ...schema.columns.map((c) => ({ label: c, insert: /^[\w.]+$/.test(c) ? c : `[${c}]`, kind: 'field' as const, detail: 'column' }))]);
  if (script && /\b(?:pivot|pivotar)\s+$/i.test(before)) return done([...DIMENSIONS.map((d) => ({ label: d, insert: d, kind: 'field' as const })), ...allFields(schema).map((f) => ({ label: f, insert: f, kind: 'field' as const }))]);
  if (script && /\b(?:from|join|union|unir)\s+$/i.test(before)) return done(SOURCES.map((s) => ({ label: s, insert: s, kind: 'source' as const })));

  // `field <op> <value>` and `field in (a, b, <value>`
  const cmp = /([\p{L}\p{N}_.\]]+)\s*(?:=|!=|~|contains|startswith|endswith|not\s+in|in)\s*(?:\([^)]*,\s*|\(\s*)?$/iu.exec(before);
  if (cmp) {
    const items = valuesFor(cmp[1].replace(/[[\]]/g, ''), schema);
    if (DATE_FIELDS.has(lower(cmp[1])) && /\bin\s*$/i.test(before.trimEnd() + ' ')) return done(DATE_WINDOWS.map((d) => ({ label: d, insert: d, kind: 'date' as const })));
    if (items.length) return done(items);
  }

  // `group by a, b` and `order by`
  if (script && /\bgroup\s+by\s+(?:[^,]+,\s*)*$/i.test(before)) return done([...DIMENSIONS.map((d) => ({ label: d, insert: d, kind: 'field' as const })), ...allFields(schema).map((f) => ({ label: f, insert: f, kind: 'field' as const })), ...joinAliases(text).map((al) => ({ label: `${al}.`, insert: `${al}.`, kind: 'field' as const, detail: 'joined source' }))]);
  if (script && /\border\s+by\s+(?:[^,]+,\s*)*$/i.test(before)) return done([...allFields(schema).map((f) => ({ label: f, insert: f, kind: 'field' as const })), ...joinAliases(text).map((al) => ({ label: `${al}.`, insert: `${al}.`, kind: 'field' as const, detail: 'joined source' })), { label: 'count', insert: 'count', kind: 'keyword' }, { label: 'key', insert: 'key', kind: 'keyword' }, { label: 'rank("', insert: 'rank("', kind: 'function' }]);
  // after a finished clause word or a full field: operators / what follows
  const lastWord = /([\p{L}\p{N}_.\]]+)\s+$/u.exec(before);
  // operators only follow a field of a condition, not one of `group by` / `order by` / `select`
  const lastClause = [...before.matchAll(/\b(where|group\s+by|order\s+by|select|limit)\b/gi)].pop()?.[1].toLowerCase().replace(/\s+/g, ' ');
  const inCondition = !lastClause || lastClause === 'where';
  if (inCondition && lastWord && !word && !/\b(?:and|or|not|where|by|select|from|let|show|limit)\s*$/i.test(before)) {
    const prevWord = lastWord[1];
    const isField = [...FIELDS, ...FIELD_ALIASES, ...schema.customFields.map((f) => `cf.${f}`)].some((f) => lower(f) === lower(prevWord.replace(/[[\]]/g, '')));
    if (isField) return { from, to, items: OPERATORS.map((o) => ({ label: o, insert: o, kind: 'operator' as const })) };
  }

  const prefix = word.replace(/^["[]/, '');
  const startOfCondition = before.trim() === '' || /(?:\band\b|\bor\b|\bnot\b|\bwhere\b|\(|,|;)\s*$/i.test(before);
  const items: Suggestion[] = [];
  if (script && (before.trim() === '' || /(?:^|[\n;])[ \t]*$/.test(before))) items.push({ label: 'param', insert: 'param ', kind: 'keyword' }, { label: 'fn', insert: 'fn ', kind: 'keyword' });
  if (script && before.trim() === '') items.push(...SOURCES.map((s) => ({ label: s, insert: s, kind: 'source' as const })), { label: 'let', insert: 'let ', kind: 'keyword' }, { label: 'show', insert: 'show ', kind: 'keyword' });
  if (startOfCondition || prefix) {
    items.push(...FLAGS.map((f) => ({ label: f, insert: f, kind: 'flag' as const })));
    items.push({ label: 'not', insert: 'not ', kind: 'keyword' });
    items.push(...[...FIELDS, ...FIELD_ALIASES].map((f) => ({ label: f, insert: f, kind: 'field' as const })));
    items.push(...schema.customFields.map((f) => ({ label: `cf.${f}`, insert: `cf.${f}`, kind: 'field' as const, detail: 'custom field' })));
    items.push(...schema.columns.map((c) => ({ label: c, insert: /^[\w.]+$/.test(c) ? c : `[${c}]`, kind: 'field' as const, detail: 'column' })));
    items.push(...functionItems(prefix, text));
    if (script) items.push(...joinAliases(text).map((a) => ({ label: `${a}.`, insert: `${a}.`, kind: 'field' as const, detail: 'joined source' })));
  }
  if (!startOfCondition || prefix) {
    // a finished condition: how it can continue
    const tail: Suggestion[] = [{ label: 'and', insert: 'and ', kind: 'keyword' }, { label: 'or', insert: 'or ', kind: 'keyword' }];
    if (script) tail.push(...CLAUSES.map((k) => ({ label: k, insert: `${k} `, kind: 'keyword' as const })), ...METRICS.map((m) => ({ label: m, insert: m, kind: 'keyword' as const })));
    items.push(...tail);
  }
  return done(items, prefix);
}

/** Applies a suggestion and returns the new text and caret. */
export function applySuggestion(text: string, completion: Completion, item: Suggestion): { text: string; caret: number } {
  const next = text.slice(0, completion.from) + item.insert + text.slice(completion.to);
  const insideParens = item.insert.endsWith('(');
  const caret = completion.from + item.insert.length;
  return { text: next, caret: insideParens ? caret : caret };
}

// ── hints ────────────────────────────────────────────────────────────────────

const VALUE_FIELDS: Array<{ re: RegExp; label: string; pick: (s: KqlSchema) => string[] }> = [
  { re: /\b(?:tag|tags|label|labels|etiqueta|etiquetas)\s*(?:=|!=)\s*(?:#)?("(?:[^"\\]|\\.)*"|[\p{L}\p{N}_.-]+)/giu, label: 'tag', pick: (s) => s.tags },
  { re: /\b(?:list|status|column|lista|estado|columna)\s*(?:=|!=)\s*("(?:[^"\\]|\\.)*"|[\p{L}\p{N}_.-]+)/giu, label: 'list', pick: (s) => s.lists },
  { re: /\b(?:board|tablero)\s*(?:=|!=)\s*("(?:[^"\\]|\\.)*"|[\p{L}\p{N}_.-]+)/giu, label: 'board', pick: (s) => s.boards },
  { re: /\b(?:priority|prioridad)\s*(?:=|!=)\s*("(?:[^"\\]|\\.)*"|[\p{L}\p{N}_.-]+)/giu, label: 'priority', pick: (s) => s.priorities },
];

const unquote = (v: string) => (v.startsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v);

/**
 * Typos and values that match nothing. `engineMessage` is the parser error (if any) to enrich with a suggestion.
 * Hints never block anything: they only point.
 */
export function findHints(text: string, schema: KqlSchema = EMPTY_SCHEMA, engineMessage?: { message: string; position: number } | null): Hint[] {
  const hints: Hint[] = [];

  // 1) "Unknown field "x"": suggest the closest real one
  const unknown = engineMessage ? /Unknown (?:field|column|table|name|source|function)\s+"([^"]+)"/i.exec(engineMessage.message) : null;
  if (unknown) {
    const bad = unknown[1];
    const pool = [...allFields(schema), ...FIELD_ALIASES, ...FUNCTION_NAMES, ...schema.tables, ...schema.sources];
    const near = closestMatch(bad, pool);
    const at = text.toLowerCase().indexOf(bad.toLowerCase(), Math.max(0, (engineMessage?.position ?? 0) - 1));
    if (near && at >= 0) hints.push({ level: 'warn', message: `Unknown "${bad}" — did you mean ${near}?`, fix: { from: at, to: at + bad.length, replacement: near, label: near } });
  }

  // 2) a word that is almost a keyword / field / function / flag (e.g. "grup by", "overdu")
  // phrases ('order by', 'group by', 'select distinct') are checked word by word, so each of their words is known
  const words = (list: readonly string[]) => list.flatMap((x) => x.split(/\s+/));
  const known = new Set([...words(FIELDS), ...words(FIELD_ALIASES), ...words(FLAGS), ...words(KEYWORDS), ...words(CLAUSES), ...Object.keys(KQL_FUNCTIONS), ...METRICS.map((m) => m.replace(/[( ].*$/, '')), 'distinct', ...SOURCES.flatMap((src) => src.split(' ')), ...OPERATORS.join(' ').split(' '), ...schema.customFields.map((f) => `cf.${f}`), ...schema.columns.map(lower), ...schema.tables.map(lower), ...DATE_VALUES, 'me', 'last', 'next', 'this', 'week', 'month', 'year', 'true', 'false', 'null'].map(lower));
  const valueWords = new Set([...schema.tags, ...schema.lists, ...schema.boards, ...schema.priorities, ...schema.people, ...schema.groups].flatMap((v) => lower(v).split(/\s+/)));
  // blank out strings, regexes and numbers; what is left are the words in "word position"
  const masked = text.replace(/"(?:[^"\\]|\\.)*"|\/(?:[^/\\\n]|\\.)+\/[a-z]*|\[[^\]]*\]/g, (m) => ' '.repeat(m.length));
  const wordRe = /(?<![\p{L}\p{N}_.#@$-])[\p{L}_][\p{L}\p{N}_]*(?![\p{L}\p{N}_.(])/gu;
  let m: RegExpExecArray | null;
  const clause = /(=|!=|~|\bcontains\b|\bstartswith\b|\bendswith\b|\bin\b|\bnot\s+in\b)\s*\(?\s*[^\s)]*$/i;
  while ((m = wordRe.exec(masked)) !== null) {
    const w = m[0];
    const lw = lower(w);
    if (known.has(lw) || valueWords.has(lw) || /^\d/.test(w)) continue;
    if (clause.test(masked.slice(0, m.index + w.length))) continue; // a value position: checked below against the data
    const near = closestMatch(w, [...words(FIELDS), ...FIELD_ALIASES, ...words(FLAGS), ...words(KEYWORDS), ...FUNCTION_NAMES]);
    if (near && !hints.some((h) => h.fix && h.fix.from === m!.index)) hints.push({ level: 'warn', message: `"${w}" — did you mean ${near}?`, fix: { from: m.index, to: m.index + w.length, replacement: near, label: near } });
  }

  // 3) values that no card has: tag = urgnte → urgente
  for (const { re, label, pick } of VALUE_FIELDS) {
    const pool = pick(schema);
    if (!pool.length) continue;
    re.lastIndex = 0;
    let v: RegExpExecArray | null;
    while ((v = re.exec(text)) !== null) {
      const raw = unquote(v[1]);
      if (label === 'list' && (schema.listScopes ?? []).some((l) => fold(`${l.board} / ${l.name}`) === fold(raw))) continue;
      if (pool.some((p) => fold(p) === fold(raw))) {
        const twins = label === 'list' ? (schema.listScopes ?? []).filter((l) => fold(l.name) === fold(raw)) : [];
        if (twins.length > 1) {
          const others = twins.map((l) => l.board);
          hints.push({ level: 'info', message: `The list "${raw}" exists in ${others.length} boards (${others.slice(0, 4).join(', ')}); qualify it with "${twins[0].board} / ${twins[0].name}" to pick one.` });
        }
        continue;
      }
      const start = v.index + v[0].length - v[1].length;
      const near = closestMatch(raw, pool);
      hints.push({
        level: 'info',
        message: near ? `No card has the ${label} "${raw}" — did you mean ${near}?` : `No card has the ${label} "${raw}" here. Available: ${pool.slice(0, 6).join(', ')}${pool.length > 6 ? '…' : ''}`,
        fix: near ? { from: start, to: start + v[1].length, replacement: quoteValue(near), label: near } : undefined,
      });
    }
  }
  return hints.slice(0, 4);
}

// ── schema from data ─────────────────────────────────────────────────────────

const uniqueSorted = (values: Iterable<string | null | undefined>): string[] => [...new Set([...values].filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()))].sort((a, b) => a.localeCompare(b));

/** What the text box can complete, learned from the cards in view and the context (people, groups, tag groups). */
export function buildKqlSchema(input: { mode: KqlSchema['mode']; cards?: KqlCard[]; ctx?: KqlContext; tables?: Array<{ title: string; columns: string[] }>; scopes?: KqlData['scopes'] }): KqlSchema {
  const cards = input.cards ?? [];
  const ctx = input.ctx ?? {};
  const custom = new Set<string>();
  for (const c of cards.slice(0, 500)) for (const key of Object.keys(c.fields ?? {})) custom.add(key);
  const tables = input.tables ?? [];
  // boards and lists: the ones the server declared (empty ones too) plus those the cards sit in
  const boardMap = new Map<string, { name: string; id?: string }>();
  const listMap = new Map<string, { name: string; board: string; id?: string }>();
  const text = (c: KqlCard, key: string) => { const v = c.fields?.[key]; return typeof v === 'string' && v ? v : undefined; };
  const boardNames = new Map((input.scopes?.boards ?? []).map((b) => [b.id, b.name]));
  for (const b of input.scopes?.boards ?? []) boardMap.set(b.id, { name: b.name, id: b.id });
  for (const l of input.scopes?.lists ?? []) listMap.set(l.id, { name: l.name, board: (l.boardId && boardNames.get(l.boardId)) || '', id: l.id });
  for (const c of cards) {
    if (c.board && !boardMap.has(text(c, 'board_id') ?? `n:${c.board}`)) boardMap.set(text(c, 'board_id') ?? `n:${c.board}`, { name: c.board, id: text(c, 'board_id') });
    const lk = text(c, 'list_id') ?? `n:${c.board}/${c.list}`;
    if (c.list && !listMap.has(lk)) listMap.set(lk, { name: c.list, board: c.board ?? '', id: text(c, 'list_id') });
  }
  return {
    boardScopes: [...boardMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    listScopes: [...listMap.values()].filter((l) => l.board).sort((a, b) => a.board.localeCompare(b.board) || a.name.localeCompare(b.name)),
    mode: input.mode,
    tags: uniqueSorted([...cards.flatMap((c) => c.tags ?? []), ...(ctx.tagGroups ?? []).flatMap((g) => g.tags)]),
    lists: uniqueSorted(cards.map((c) => c.list)),
    boards: uniqueSorted(cards.map((c) => c.board)),
    priorities: uniqueSorted(cards.map((c) => c.priority)),
    people: uniqueSorted((ctx.users ?? []).flatMap((u) => [u.name, u.alias])),
    groups: uniqueSorted((ctx.groups ?? []).map((g) => g.slug || g.name)),
    customFields: input.mode === 'filter' ? [...custom].sort() : [],
    tables: uniqueSorted(tables.map((t) => t.title)),
    columns: uniqueSorted(tables.flatMap((t) => t.columns)),
    sources: SOURCES.filter((s) => s !== 'rows of'),
  };
}
