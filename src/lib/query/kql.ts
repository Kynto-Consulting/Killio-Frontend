/**
 * KQL — Killio Query Language. A small, safe language to filter, classify and measure cards:
 *
 *   cards where list = "Resuelto" and done in last 30d group by assignee count
 *   cards where assignee = @TI and overdue group by week(due) count, sum(points)
 *   let mine = cards where assignee = me and not done
 *   show mine group by list as "Mis tareas por lista"
 *
 * No `eval`, no dependencies: a hand-written tokenizer, a recursive-descent parser and an interpreter over plain
 * objects. It is the same file in the backend and the frontend (keep both copies identical).
 * `KQL_SYNTAX_GUIDE` (bottom) is the reference given to the AI so it can write queries.
 */

export class KqlError extends Error {
  position: number;
  constructor(message: string, position = 0) {
    super(message);
    this.name = 'KqlError';
    this.position = position;
  }
}

export const KQL_LIMITS = { maxSource: 6000, maxTokens: 1200, maxDepth: 12, maxRegex: 1000, maxRegexInput: 10_000, maxRegexGroups: 20, maxRegexTests: 2_000_000, maxRows: 100_000, maxGroups: 5000, maxStatements: 30, maxValuesSource: 400_000, maxValuesTokens: 200_000, maxFnDepth: 8, maxFnCalls: 40, maxFnQuery: 2000 };

/** A script with an inline table (`values (...)`) may be longer: the table itself is capped at 1000 rows x 50 columns. */
export const kqlMaxSource = (source: string): number => (/\b(?:values|valores)\s*\(/i.test(source) ? KQL_LIMITS.maxValuesSource : KQL_LIMITS.maxSource);

// ── Data model ───────────────────────────────────────────────────────────────

export interface KqlUser {
  id: string;
  name?: string | null;
  alias?: string | null;
  email?: string | null;
}

export interface KqlGroup {
  id: string;
  slug: string;
  name: string;
  memberIds: string[];
}

export interface KqlCard {
  id: string;
  title: string;
  description?: string | null;
  board?: string | null;
  list?: string | null;
  /** Resolved by the caller (e.g. the card sits in a "done" list or has a completion date). */
  done?: boolean;
  archived?: boolean;
  /** User ids. */
  assignees?: string[];
  /** Groups that own the card because of where it is (e.g. the list is assigned to a group). */
  groupIds?: string[];
  tags?: string[];
  due?: string | null;
  start?: string | null;
  created?: string | null;
  updated?: string | null;
  completed?: string | null;
  priority?: string | null;
  points?: number | null;
  comments?: number | null;
  /** 0-100 */
  progress?: number | null;
  /** Source-specific columns (table columns, document properties...). A list value is a multi-select / tags-like cell. */
  fields?: Record<string, string | number | boolean | string[] | null>;
}

/** Rows of a table / database brick as records. Column names are the records' `fields`. */
export interface KqlTable { id: string; title: string; kind: string; columns: string[]; rows: KqlCard[] }

/** Everything a script may read. `sources` are named collections (documents, members, activity...) keyed by lower-case name. */
export interface KqlData {
  cards?: KqlCard[];
  sources?: Record<string, KqlCard[]>;
  tables?: KqlTable[];
  /**
   * The DECLARED columns of each named source (same lower-case keys as `sources`, plus `cards`). They validate column names
   * even when a source has no rows yet; `KqlTable.columns` does the same for tables.
   */
  columns?: Record<string, string[]>;
  /**
   * Every board and list the caller can see (empty ones too, they have no cards), so `cards in board "X"` can be validated and
   * disambiguated. Boards and lists found in the card records are added automatically.
   */
  scopes?: { boards: Array<{ id: string; name: string }>; lists: Array<{ id: string; name: string; boardId?: string }> };
}

export interface KqlContext {
  now?: Date;
  /** Named, ordered groups of tags: `rank("Priority")` is a tag's position in the group (lower first). */
  tagGroups?: Array<{ id: string; name: string; tags: string[] }>;
  /** The current user's id, for `me`. */
  me?: string;
  users?: KqlUser[];
  groups?: KqlGroup[];
}

// ── Tokens ───────────────────────────────────────────────────────────────────

type TokType = 'word' | 'str' | 'num' | 'dur' | 'date' | 'regex' | 'ident' | 'op' | '(' | ')' | ',' | '|' | ';' | 'nl' | 'mention' | 'hashtag' | 'star' | 'arith' | 'param' | 'eof';
interface Tok {
  t: TokType;
  v: string;
  n?: number;
  unit?: string;
  flags?: string;
  /** For `@[kind:id:label]` mentions. */
  kind?: string;
  id?: string;
  pos: number;
}

const strip = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Edit distance (adjacent swaps count as one), giving up above `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push([i]);
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) { rows[0][j] = j; continue; }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
      rows[i][j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** The candidate closest to `word` (case and accents ignored) when it is near enough to be a typo; null otherwise. */
export function closestName(word: string, candidates: Iterable<string>): string | null {
  const w = strip(word);
  if (w.length < 3) return null;
  const limit = w.length <= 4 ? 1 : 2;
  let best: string | null = null;
  let bestDistance = limit + 1;
  for (const c of candidates) {
    const sc = strip(c);
    const d = editDistance(w, sc, limit);
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  return best;
}

/** ` Did you mean "x"?` (with a leading space) or an empty string. */
function didYouMean(word: string, candidates: Iterable<string>): string {
  const near = closestName(word, candidates);
  return near ? ` Did you mean "${near}"?` : '';
}

/** Spanish keywords are accepted as aliases of the English ones. */
const KEYWORD_ALIASES: Record<string, string> = {
  donde: 'where', y: 'and', o: 'or', en: 'in', agrupar: 'group', por: 'by', ordenar: 'order', limite: 'limit',
  ultimos: 'last', ultimas: 'last', proximos: 'next', proximas: 'next', este: 'this', esta: 'this',
  hoy: 'today', ayer: 'yesterday', manana: 'tomorrow', contiene: 'contains', vacio: 'empty', vacia: 'empty',
  entre: 'between', antes: 'before', despues: 'after', mostrar: 'show', como: 'as', desde: 'from',
  tarjetas: 'cards', filas: 'rows', tabla: 'table', de: 'of', seleccionar: 'select', cuenta: 'count', suma: 'sum', promedio: 'avg', minimo: 'min', maximo: 'max',
  si: 'true', verdadero: 'true', falso: 'false',
  parametro: 'param', funcion: 'fn', valores: 'values', unir: 'join', pivotar: 'pivot', despivotar: 'unpivot', transponer: 'transpose', encabezado: 'header', excepto: 'except', cola: 'tail', quitarultimas: 'droplast', quitarultimos: 'droplast', teniendo: 'having', saltar: 'offset', distintos: 'distinct', distinto: 'distinct', primeros: 'top',
  mediana: 'median', percentil: 'percentile', desviacion: 'stddev',
};
const UNIT_ALIASES: Record<string, 'h' | 'd' | 'w' | 'm' | 'y'> = {
  h: 'h', hour: 'h', hours: 'h', hora: 'h', horas: 'h',
  d: 'd', day: 'd', days: 'd', dia: 'd', dias: 'd',
  w: 'w', week: 'w', weeks: 'w', semana: 'w', semanas: 'w',
  m: 'm', month: 'm', months: 'm', mes: 'm', meses: 'm',
  y: 'y', year: 'y', years: 'y', ano: 'y', anos: 'y',
};

function tokenize(source: string): Tok[] {
  if (source.length > kqlMaxSource(source)) throw new KqlError(`The query is too long (max ${kqlMaxSource(source)} characters).`);
  const maxTokens = kqlMaxSource(source) === KQL_LIMITS.maxSource ? KQL_LIMITS.maxTokens : KQL_LIMITS.maxValuesTokens;
  const toks: Tok[] = [];
  const push = (tok: Tok) => {
    if (toks.length >= maxTokens) throw new KqlError('The query is too complex.', tok.pos);
    toks.push(tok);
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const prev = toks[toks.length - 1];
    if (c === '\n') {
      if (prev && prev.t !== 'nl') push({ t: 'nl', v: '\n', pos: i });
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    // comments: "// ..." (not a regex: those only follow ~)
    if (c === '/' && source[i + 1] === '/' && !(prev && ((prev.t === 'op' && (prev.v === '~' || prev.v === '!~')) || prev.t === '(' || prev.t === ','))) {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = '';
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\' && j + 1 < source.length) {
          const n = source[j + 1];
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          j += 2;
        } else out += source[j++];
      }
      if (j >= source.length) throw new KqlError('Unterminated string.', i);
      push({ t: 'str', v: out, pos: i });
      i = j + 1;
      continue;
    }
    const regexAllowed = !!prev && ((prev.t === 'op' && (prev.v === '~' || prev.v === '!~')) || prev.t === '(' || prev.t === ',');
    if (c === '/' && regexAllowed) {
      let j = i + 1;
      let pattern = '';
      while (j < source.length && source[j] !== '/') {
        if (source[j] === '\\' && j + 1 < source.length) { pattern += source[j] + source[j + 1]; j += 2; } else pattern += source[j++];
      }
      if (j >= source.length) throw new KqlError('Unterminated regular expression.', i);
      j++;
      let flags = '';
      while (j < source.length && /[a-z]/i.test(source[j])) flags += source[j++];
      push({ t: 'regex', v: pattern, flags, pos: i });
      i = j;
      continue;
    }
    if (c === '[') {
      const close = source.indexOf(']', i + 1);
      if (close < 0) throw new KqlError('Unterminated [column name].', i);
      push({ t: 'ident', v: source.slice(i + 1, close).trim(), pos: i });
      i = close + 1;
      continue;
    }
    if (c === '@') {
      const m = /^@\[([a-z]+):([^:\]]+):([^\]]*)\]/i.exec(source.slice(i));
      if (m) { push({ t: 'mention', v: m[3], kind: m[1].toLowerCase(), id: m[2], pos: i }); i += m[0].length; continue; }
      const w = /^@([\p{L}\p{N}_][\p{L}\p{N}_.\-]*)/u.exec(source.slice(i));
      if (!w) throw new KqlError('Expected a name after @.', i);
      push({ t: 'mention', v: w[1].replace(/[.\-]+$/, ''), kind: 'name', pos: i });
      i += w[0].replace(/[.\-]+$/, '').length;
      continue;
    }
    if (c === '#') {
      const w = /^#([\p{L}\p{N}_][\p{L}\p{N}_\-]*)/u.exec(source.slice(i));
      if (!w) throw new KqlError('Expected a tag name after #.', i);
      push({ t: 'hashtag', v: w[1], pos: i });
      i += w[0].length;
      continue;
    }
    // An unquoted email (ana@labroe.com) is one value, not a word followed by a mention.
    const email = /^[\p{L}\p{N}_.+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u.exec(source.slice(i));
    if (email) {
      push({ t: 'word', v: email[0], pos: i });
      i += email[0].length;
      continue;
    }
    const date = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?Z?)?/.exec(source.slice(i));
    if (date && !/[\p{L}_]/u.test(source[i + date[0].length] ?? '')) {
      push({ t: 'date', v: date[0], pos: i });
      i += date[0].length;
      continue;
    }
    const signed = (c === '+' || c === '-') && /\d/.test(source[i + 1] ?? '') && (!prev || prev.t === 'op' || prev.t === '(' || prev.t === ',' || prev.t === 'word');
    if (/\d/.test(c) || signed) {
      const m = /^[+-]?\d+(?:\.\d+)?/.exec(source.slice(i))!;
      let j = i + m[0].length;
      const unitMatch = /^[\p{L}]+/u.exec(source.slice(j));
      if (unitMatch) {
        const unit = UNIT_ALIASES[strip(unitMatch[0])];
        if (!unit) throw new KqlError(`Unknown unit "${unitMatch[0]}" (use h, d, w, m, y).`, j);
        push({ t: 'dur', v: m[0] + unitMatch[0], n: Number(m[0]), unit, pos: i });
        j += unitMatch[0].length;
      } else push({ t: 'num', v: m[0], n: Number(m[0]), pos: i });
      i = j;
      continue;
    }
    if (c === '$') {
      const pm = /^\$([\p{L}_][\p{L}\p{N}_]*)/u.exec(source.slice(i));
      if (!pm) throw new KqlError('Expected a parameter name after $, e.g. $minimo.', i);
      push({ t: 'param', v: pm[1], pos: i });
      i += pm[0].length;
      continue;
    }
    const qstar = /^([\p{L}_][\p{L}\p{N}_\-]*(?:\.[\p{L}\p{N}_\-]+)*)\.\*/u.exec(source.slice(i));
    if (qstar) { push({ t: 'star', v: qstar[1], pos: i }); i += qstar[0].length; continue; } // alias.*
    const w = /^[\p{L}_][\p{L}\p{N}_.\-]*/u.exec(source.slice(i));
    if (w) {
      const text = w[0].replace(/[.\-]+$/, '');
      // Power Query names (Text.Upper(...)): a name followed by "(" is a call; without it `a.b` is a joined field
      const mAlias = text.includes('.') && /^\s*\(/.test(source.slice(i + text.length)) ? M_ALIAS_BY_NAME[text.toLowerCase()] : undefined;
      push({ t: 'word', v: mAlias ?? text, pos: i });
      i += text.length;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<>', '>=', '<=', '!~'].includes(two)) { push({ t: 'op', v: two === '==' ? '=' : two === '<>' ? '!=' : two, pos: i }); i += 2; continue; }
    if (['=', '<', '>', '~'].includes(c)) { push({ t: 'op', v: c, pos: i }); i++; continue; }
    if (c === '*') {
      // `*` is the star of `select *` / `count(*)` where a value cannot come before it; between two values it multiplies
      const starWords = ['select', 'distinct', 'except', 'by', 'where', 'and', 'or', 'not', 'having', 'on', 'as', 'seleccionar', 'distintos', 'distinto', 'excepto', 'teniendo', 'y', 'o'];
      const asStar = !prev || ['(', ',', 'op', 'nl', ';', '|', 'arith', 'star'].includes(prev.t) || (prev.t === 'word' && starWords.includes(strip(prev.v)));
      push(asStar ? { t: 'star', v: '*', pos: i } : { t: 'arith', v: '*', pos: i });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '/' || c === '%' || c === '&') { push({ t: 'arith', v: c, pos: i }); i++; continue; }
    if (c === '(' || c === ')' || c === ',' || c === '|' || c === ';') { push({ t: c as TokType, v: c, pos: i }); i++; continue; }
    throw new KqlError(`Unexpected character "${c}".`, i);
  }
  push({ t: 'eof', v: '', pos: source.length });
  return toks;
}

// ── AST ──────────────────────────────────────────────────────────────────────

export type FieldName =
  | 'title' | 'description' | 'list' | 'board' | 'priority' | 'id'
  | 'assignee' | 'group' | 'tag'
  | 'due' | 'start' | 'created' | 'updated' | 'completed'
  | 'points' | 'comments' | 'progress'
  | 'age' | 'cycle' | 'overdue_days' | 'title_len' | 'tag_count' | 'assignee_count'
  | 'path'
  | 'custom';

/** `f(a, b)` — a text / number / date transformation. Its result behaves like a column, so it works anywhere a field does. */
/** `infix`: the call was written as an operator (`a + b`, `-a`, `a & b`), for labels. */
export interface Call { fn: string; args: Arg[]; infix?: string; /** Column label of a condition used as a value. */ label?: string; /** A bare word on the right of a comparison that names a column. */ colref?: boolean }
export interface RegexLit { k: 'regex'; v: string; flags: string }
/** A `cond` argument is a whole condition (`if(points > 5, "big", "small")`); `text` is what was typed, for labels. */
export type Arg = { t: 'field'; field: Field } | { t: 'lit'; value: Value | RegexLit } | { t: 'cond'; expr: Expr; text: string };
/**
 * A column of the records. Built-in names (title, due, assignee...), a named column of a table (`custom`), or a
 * computed value (`call`). `raw` keeps what was typed so a table's own column can take over a built-in alias.
 */
export interface Field { name: FieldName; custom?: string; raw?: string; call?: Call; /** A parameter of a user function (only inside a body, replaced when the function is called). */ param?: string }

export type Value =
  | { k: 'str'; v: string }
  | { k: 'num'; v: number }
  | { k: 'date'; v: string }
  | { k: 'rel'; n: number; unit: 'h' | 'd' | 'w' | 'm' | 'y' }
  | { k: 'word'; v: string }
  | { k: 'day'; v: 'today' | 'yesterday' | 'tomorrow' | 'now' }
  | { k: 'me' }
  | { k: 'mention'; v: string; kind: string; id?: string }
  | { k: 'tag'; v: string }
  | { k: 'bool'; v: boolean }
  /** A calculation on the right of a comparison: `due < addDays(today(), 7)`. Evaluated per record. */
  | { k: 'call'; call: Call };

export type TimeWindow =
  | { w: 'rolling'; dir: 'last' | 'next'; n: number; unit: 'h' | 'd' | 'w' | 'm' | 'y' }
  | { w: 'calendar'; which: 'this' | 'last' | 'next'; unit: 'd' | 'w' | 'm' | 'y' }
  | { w: 'day'; which: 'today' | 'yesterday' | 'tomorrow' };

export type CmpOp = '=' | '!=' | '<' | '<=' | '>' | '>=' | '~' | '!~' | 'contains' | 'not contains' | 'startswith' | 'endswith';

export type Expr =
  | { t: 'and' | 'or'; l: Expr; r: Expr }
  | { t: 'not'; e: Expr }
  | { t: 'cmp'; field: Field; op: CmpOp; value: Value | RegexLit }
  | { t: 'in'; field: Field; values: Value[]; negate: boolean }
  | { t: 'between'; field: Field; a: Value; b: Value }
  | { t: 'empty'; field: Field; negate: boolean }
  | { t: 'window'; field: Field; window: TimeWindow }
  | { t: 'flag'; name: 'done' | 'open' | 'overdue' | 'unassigned' | 'assigned' | 'archived' }
  /** A calculation used as a condition on its own: `has(tag, "bug")`, `match(title, /^fix/)`. */
  | { t: 'truthy'; field: Field }
  | { t: 'text'; value: string };

export type Bucket = 'day' | 'week' | 'month' | 'year';
export type Dimension =
  | { by: 'list' | 'board' | 'assignee' | 'group' | 'tag' | 'priority'; raw?: string }
  | { by: 'field'; field: Field; label: string }
  | { by: 'date'; field: Field; bucket: Bucket };
export type MetricFn =
  | 'count' | 'sum' | 'avg' | 'min' | 'max' | 'percent' | 'join' | 'first' | 'last' | 'unique'
  | 'median' | 'stddev' | 'percentile' | 'count_if' | 'sum_if' | 'ratio';
export interface Metric {
  fn: MetricFn;
  field?: Field;
  sep?: string;
  /** `count_if(cond)` / `sum_if(x, cond)`. */
  cond?: Expr;
  /** `ratio(a, b)`: the denominator. */
  field2?: Field;
  /** `percentile(x, 90)`. */
  p?: number;
  label: string;
}
/** A condition on the metrics of a group: `having count > 5 and avg(points) < 3`. */
export type Having =
  | { t: 'and' | 'or'; l: Having; r: Having }
  | { t: 'not'; e: Having }
  | { t: 'cmp'; metric: Metric; op: '=' | '!=' | '<' | '<=' | '>' | '>='; value: number }
  | { t: 'between'; metric: Metric; a: number; b: number };
/** `star`: `*` / `alias.*` (optionally `except (a, b)`), expanded to the real columns when the query runs. */
export interface Projection { field: Field; alias: string; star?: { qualifier?: string; except: string[] } }
export type Order =
  | { by: 'key' | 'label'; dir: 'asc' | 'desc' }
  | { by: 'metric'; metric?: number; dir: 'asc' | 'desc' }
  | { by: 'expr'; field: Field; dir: 'asc' | 'desc' };
// A query orders by one or more keys, e.g. `order by rank("Prioridad"), due desc`.

/** Where the records come from: the cards, the rows of a table/database brick, or a named source / saved selection. */
export type SourceRef =
  | { kind: 'cards' }
  | { kind: 'rows'; ref: string }
  | { kind: 'name'; name: string }
  /** `values ("A", "B") (1, 2)`: an inline table, the first group is the header. */
  | { kind: 'values'; columns: string[]; rows: Cell[][] };

/** `join members as m on assignee = id [left]`: `left` is the key of the query's records, `right` the key of the joined ones. */
export interface Join { source: SourceRef; alias: string; left: Field; right: Field; kind: 'inner' | 'left' }

/** `unpivot Q1, Q2 as "Quarter", "Score"`: each listed column becomes a row (`except`: every column but the listed ones). */
export interface Unpivot { columns: Field[]; except: boolean; attribute: string; value: string }

/** `cards in board "A", "B" list "X"` / `cards in "A / X"` / `cards in list id "..."`: narrows the cards before anything else. */
export interface ScopeQualifier { kind: 'board' | 'list' | 'path'; by: 'name' | 'id'; values: string[] }

export interface Query {
  source: SourceRef;
  scope: ScopeQualifier[];
  /** `from a union b`: more records of the same kind of source (a record in both counts once). */
  unions: SourceRef[];
  joins: Join[];
  where: Expr | null;
  group: Dimension[];
  /** Instead of aggregating, list one row per record with these values. */
  select: Projection[] | null;
  metrics: Metric[];
  /** Keeps only the groups whose metrics satisfy it (aggregations only). */
  having: Having | null;
  order: Order[];
  /** `select distinct`: drop repeated rows. */
  distinct: boolean;
  offset: number | null;
  limit: number | null;
  /** Keep the last N rows / remove the last N rows (after offset, before limit). */
  tail: number | null;
  droplast: number | null;
  /** `group by a pivot b sum(x)`: one column per value of b. */
  pivot: Dimension | null;
  unpivot: Unpivot | null;
  /** Rows become columns; `header`: the first column's values name the new columns. */
  transpose: 'plain' | 'header' | null;
  /** `unpivot` without select/group/metrics shows every column. */
  implicitSelect: boolean;
}
/** `via`: a `let` the parser added to run one call of a table function (its name is `fn#n`). */
export type Statement = { kind: 'let'; name: string; query: Query; via?: { fn: string; params: string[]; tables: string[] } } | { kind: 'show'; query: Query; title: string | null };

// ── Parser ───────────────────────────────────────────────────────────────────

const FIELD_ALIASES: Record<string, FieldName> = {
  title: 'title', name: 'title', titulo: 'title', nombre: 'title',
  description: 'description', desc: 'description', descripcion: 'description',
  list: 'list', status: 'list', column: 'list', lista: 'list', estado: 'list', columna: 'list',
  board: 'board', tablero: 'board',
  priority: 'priority', urgency: 'priority', prioridad: 'priority', urgencia: 'priority',
  id: 'id',
  assignee: 'assignee', assignees: 'assignee', owner: 'assignee', user: 'assignee', person: 'assignee', responsable: 'assignee', asignado: 'assignee', asignada: 'assignee', persona: 'assignee', usuario: 'assignee',
  group: 'group', team: 'group', grupo: 'group', equipo: 'group',
  tag: 'tag', tags: 'tag', label: 'tag', labels: 'tag', etiqueta: 'tag', etiquetas: 'tag',
  due: 'due', deadline: 'due', vence: 'due', vencimiento: 'due', fecha_limite: 'due',
  start: 'start', inicio: 'start',
  created: 'created', creado: 'created', creada: 'created',
  updated: 'updated', modified: 'updated', actualizado: 'updated', modificado: 'updated',
  done: 'completed', completed: 'completed', resolved: 'completed', closed: 'completed', resuelto: 'completed', resuelta: 'completed', completado: 'completed', completada: 'completed', cerrado: 'completed', hecho: 'completed', hecha: 'completed',
  points: 'points', point: 'points', effort: 'points', estimate: 'points', puntos: 'points', esfuerzo: 'points', estimacion: 'points',
  comments: 'comments', comentarios: 'comments',
  progress: 'progress', avance: 'progress', progreso: 'progress',
  age: 'age', edad: 'age', cycle: 'cycle', cycle_time: 'cycle', ciclo: 'cycle', overdue_days: 'overdue_days', dias_vencido: 'overdue_days',
  title_len: 'title_len', tag_count: 'tag_count', assignee_count: 'assignee_count',
  path: 'path', ruta: 'path',
};
const FLAGS: Record<string, 'done' | 'open' | 'overdue' | 'unassigned' | 'assigned' | 'archived'> = {
  done: 'done', resolved: 'done', closed: 'done', hecho: 'done', hecha: 'done', resuelto: 'done', resuelta: 'done', completado: 'done', completada: 'done', cerrado: 'done',
  open: 'open', abierto: 'open', abierta: 'open', pendiente: 'open', pending: 'open',
  overdue: 'overdue', vencido: 'overdue', vencida: 'overdue', atrasado: 'overdue', atrasada: 'overdue',
  unassigned: 'unassigned', sinasignar: 'unassigned', sin_asignar: 'unassigned',
  assigned: 'assigned', asignado: 'assigned', asignada: 'assigned',
  archived: 'archived', archivado: 'archived', archivada: 'archived',
};
const DATE_FIELDS = new Set<FieldName>(['due', 'start', 'created', 'updated', 'completed']);
/** Numbers computed from the card itself (no data needed beyond the existing fields). */
const DERIVED_FIELDS = new Set<FieldName>(['age', 'cycle', 'overdue_days', 'title_len', 'tag_count', 'assignee_count']);
const NUMBER_FIELDS = new Set<FieldName>(['points', 'comments', 'progress', ...DERIVED_FIELDS]);
const AGG_COUNTING = new Set(['count', 'percent']);
const AGG_OF_FIELD = new Set(['sum', 'avg', 'min', 'max', 'join', 'first', 'last', 'unique', 'median', 'stddev', 'percentile', 'count_if', 'sum_if', 'ratio']);
const METRICS = new Set([...AGG_COUNTING, ...AGG_OF_FIELD]);
const CLAUSE_WORDS = new Set(['where', 'group', 'select', 'order', 'limit', 'offset', 'having', 'distinct', 'top', 'bottom', 'tail', 'droplast', 'pivot', 'unpivot', 'transpose', ...METRICS]);
/** Words that may be followed by "(" without being a function call. */
const PAREN_WORDS = new Set(['in', 'and', 'or', 'not', 'where', 'having', 'by', 'select', 'distinct', 'as', 'between', 'is', 'contains', 'startswith', 'endswith', 'of', 'from', 'rows', 'table', 'database', 'db', 'show', 'let', 'limit', 'offset', 'top', 'bottom', 'then']);
/** Keywords a mistyped word is compared with for "Did you mean ...?". */
const KEYWORD_NAMES = ['where', 'group', 'select', 'distinct', 'order', 'limit', 'offset', 'having', 'top', 'bottom', 'tail', 'droplast', 'pivot', 'unpivot', 'transpose', 'header', 'except', 'show', 'let', 'from', 'join', 'union', 'on', 'left', 'and', 'or', 'not', 'by', 'as', 'in', 'between', 'is', 'empty', 'contains', 'startswith', 'endswith', 'asc', 'desc', 'cards', 'rows', ...METRICS];

/** Transformations usable anywhere a field is: [min, max] number of arguments. */
export const KQL_FUNCTIONS: Record<string, [number, number]> = {
  strip: [1, 1], trim: [1, 1], lower: [1, 1], upper: [1, 1], capitalize: [1, 1], initials: [1, 1], slug: [1, 1],
  replace: [3, 3], substr: [2, 3], left: [2, 2], right: [2, 2], truncate: [2, 2], split: [2, 3],
  len: [1, 1], concat: [1, 20], coalesce: [1, 20], join: [1, 2],
  number: [1, 1], round: [1, 2], abs: [1, 1], add: [2, 2], sub: [2, 2], mul: [2, 2], div: [2, 2],
  date: [2, 2], days: [1, 1], rank: [1, 1],
  // text
  contains: [2, 2], startswith: [2, 2], endswith: [2, 2], match: [2, 2], extract: [2, 3], pad: [2, 3], padleft: [2, 3], repeat: [2, 2],
  reverse: [1, 1], words: [1, 1], title: [1, 1], proper: [1, 1],
  // numbers
  ceil: [1, 1], floor: [1, 1], least: [2, 20], greatest: [2, 20], min2: [2, 2], max2: [2, 2], pow: [2, 2], mod: [2, 2], sign: [1, 1], percent: [2, 2],
  // dates
  adddays: [2, 2], addmonths: [2, 2], diffdays: [2, 2], weekday: [1, 1], dow: [1, 1], monthname: [1, 1], startofweek: [1, 1], startofmonth: [1, 1],
  week_of: [1, 1], month_of: [1, 1], age: [1, 1], quarter: [1, 1], isoweek: [1, 1], today: [0, 0], now: [0, 0],
  // lists
  count: [1, 1], has: [2, 2], first: [1, 1], last: [1, 1], sort: [1, 1], unique: [1, 1],
  // conditionals
  if: [3, 3], iif: [3, 3], isnull: [1, 1],
  // errors: iserror(number(x)) / try(number(x), 0)
  iserror: [1, 1], try: [2, 2],
  // types: text(x) int(x) decimal(x) bool(x) datetime(x) typeof(x)
  textbefore: [2, 3], textafter: [2, 3], intdiv: [2, 2], year: [1, 1], month: [1, 1], day: [1, 1], todate: [1, 1],
  list_sum: [1, 1], list_avg: [1, 1], list_min: [1, 1], list_max: [1, 1],
  text: [1, 1], int: [1, 1], whole: [1, 1], decimal: [1, 1], bool: [1, 1], datetime: [1, 1], typeof: [1, 1], neg: [1, 1],
  // over the ordered rows (select / group by): rownum() fill_down(x[, partition]) lag(x[, n]) running_sum(x)...
  rownum: [0, 1], indice: [0, 1], fill_down: [1, 2], fill_up: [1, 2], lag: [1, 2], lead: [1, 2], running_sum: [1, 1], cumsum: [1, 1], running_count: [0, 0],
};
/** How a function is written (the table above is keyed by the lower-case name the parser matches). */
export const KQL_FUNCTION_DISPLAY: Record<string, string> = { adddays: 'addDays', addmonths: 'addMonths', diffdays: 'diffDays' };
export const kqlFunctionName = (fn: string): string => KQL_FUNCTION_DISPLAY[fn] ?? fn;

// ── Function catalog (what a Custom Column dialog lists) and Power Query M names ──

export type KqlFunctionCategory = 'Text' | 'Number' | 'Date & Time' | 'List' | 'Logical' | 'Conversion' | 'Aggregation' | 'Row' | 'Value';
export type KqlReturnType = 'text' | 'number' | 'bool' | 'date' | 'list' | 'any';
export interface KqlFunctionInfo {
  name: string;
  category: KqlFunctionCategory;
  /** `replace(text, find, replacement)`: the argument names. */
  signature: string;
  description: string;
  /** A runnable expression: `select <example> as "x"`. */
  example: string;
  /** Other names of the same function: Power Query M names (`Text.Upper`) and short synonyms. */
  aliases?: string[];
  returns: KqlReturnType;
}

/** Power Query M names accepted wherever a function is called; they resolve to the KQL function (same results). */
export const KQL_M_ALIASES: Array<[string, string]> = [
  ['Text.Upper', 'upper'], ['Text.Lower', 'lower'], ['Text.Trim', 'trim'], ['Text.Clean', 'trim'], ['Text.Length', 'len'], ['Text.Start', 'left'], ['Text.End', 'right'],
  ['Text.Middle', 'substr'], ['Text.Replace', 'replace'], ['Text.Contains', 'contains'], ['Text.StartsWith', 'startswith'], ['Text.EndsWith', 'endswith'],
  ['Text.PadStart', 'padleft'], ['Text.PadEnd', 'pad'], ['Text.Reverse', 'reverse'], ['Text.Proper', 'title'], ['Text.Split', 'split'], ['Text.Combine', 'join'],
  ['Text.From', 'text'], ['Text.BeforeDelimiter', 'textbefore'], ['Text.AfterDelimiter', 'textafter'],
  ['Number.Round', 'round'], ['Number.RoundUp', 'ceil'], ['Number.RoundDown', 'floor'], ['Number.Abs', 'abs'], ['Number.Power', 'pow'], ['Number.Mod', 'mod'],
  ['Number.Sign', 'sign'], ['Number.From', 'number'], ['Number.ToText', 'text'], ['Number.IntegerDivide', 'intdiv'],
  ['Date.Year', 'year'], ['Date.Month', 'month'], ['Date.Day', 'day'], ['Date.DayOfWeek', 'weekday'], ['Date.MonthName', 'monthname'], ['Date.QuarterOfYear', 'quarter'],
  ['Date.WeekOfYear', 'isoweek'], ['Date.AddDays', 'adddays'], ['Date.AddMonths', 'addmonths'], ['Date.StartOfWeek', 'startofweek'], ['Date.StartOfMonth', 'startofmonth'],
  ['Date.From', 'todate'], ['Date.ToText', 'date'], ['DateTime.LocalNow', 'now'], ['DateTime.FixedLocalNow', 'now'], ['DateTime.From', 'datetime'],
  ['List.Sum', 'list_sum'], ['List.Average', 'list_avg'], ['List.Min', 'list_min'], ['List.Max', 'list_max'], ['List.Count', 'count'], ['List.First', 'first'],
  ['List.Last', 'last'], ['List.Distinct', 'unique'], ['List.Sort', 'sort'], ['List.Contains', 'has'],
];
const M_ALIAS_BY_NAME: Record<string, string> = Object.fromEntries(KQL_M_ALIASES.map(([m, k]) => [m.toLowerCase(), k]));

function buildCatalog(): KqlFunctionInfo[] {
  const e = (name: string, category: KqlFunctionCategory, signature: string, description: string, example: string, returns: KqlReturnType, aliases: string[] = []): KqlFunctionInfo => ({
    name, category, signature, description, example, returns,
    aliases: [...aliases, ...KQL_M_ALIASES.filter(([, k]) => k === name).map(([m]) => m)],
  });
  return [
    // Text
    e('strip', 'Text', 'strip(text)', 'Removes markdown, HTML and mention tokens.', 'strip(description)', 'text'),
    e('trim', 'Text', 'trim(text)', 'Removes spaces at both ends.', 'trim(title)', 'text'),
    e('lower', 'Text', 'lower(text)', 'Converts to lower case.', 'lower(title)', 'text'),
    e('upper', 'Text', 'upper(text)', 'Converts to upper case.', 'upper(title)', 'text'),
    e('capitalize', 'Text', 'capitalize(text)', 'First letter upper case, the rest lower case.', 'capitalize(title)', 'text'),
    e('title', 'Text', 'title(text)', 'Each word starts with an upper case letter.', 'title(lower(title))', 'text', ['proper']),
    e('initials', 'Text', 'initials(text)', 'First letters of the first three words.', 'initials(title)', 'text'),
    e('slug', 'Text', 'slug(text)', 'Lower case, accents removed, dashes between words.', 'slug(title)', 'text'),
    e('replace', 'Text', 'replace(text, find, replacement)', 'Replaces text, or a /regex/.', 'replace(title, "a", "b")', 'text'),
    e('substr', 'Text', 'substr(text, start[, length])', 'A piece of the text (start counts from 1).', 'substr(title, 1, 3)', 'text'),
    e('left', 'Text', 'left(text, count)', 'The first characters.', 'left(title, 3)', 'text'),
    e('right', 'Text', 'right(text, count)', 'The last characters.', 'right(title, 3)', 'text'),
    e('truncate', 'Text', 'truncate(text, length)', 'Cuts the text and adds an ellipsis when longer.', 'truncate(title, 10)', 'text'),
    e('split', 'Text', 'split(text, separator[, position])', 'The piece at `position` (negative counts from the end), or the list of pieces without it.', 'split(title, " ", 1)', 'any'),
    e('len', 'Text', 'len(text)', 'Number of characters (or of items of a list).', 'len(title)', 'number'),
    e('pad', 'Text', 'pad(text, width[, fill])', 'Pads on the right up to `width` (max 200).', 'pad(title, 20, ".")', 'text'),
    e('padleft', 'Text', 'padleft(text, width[, fill])', 'Pads on the left, e.g. leading zeros.', 'padleft(points, 3, "0")', 'text'),
    e('repeat', 'Text', 'repeat(text, times)', 'Repeats the text (max 50 times, 1000 characters).', 'repeat("ab", 3)', 'text'),
    e('reverse', 'Text', 'reverse(text)', 'Reverses the text (or a list).', 'reverse(title)', 'any'),
    e('words', 'Text', 'words(text)', 'Number of words.', 'words(title)', 'number'),
    e('contains', 'Text', 'contains(text, part)', 'True when the text includes the part (ignores case and accents).', 'contains(title, "bug")', 'bool'),
    e('startswith', 'Text', 'startswith(text, prefix)', 'True when the text starts with the prefix.', 'startswith(title, "bug")', 'bool'),
    e('endswith', 'Text', 'endswith(text, suffix)', 'True when the text ends with the suffix.', 'endswith(title, "bug")', 'bool'),
    e('match', 'Text', 'match(text, /regex/)', 'True when the text matches the pattern.', 'match(title, /^bug/i)', 'bool'),
    e('extract', 'Text', 'extract(text, /regex/[, group])', 'The text of a capture group (0 = whole match).', 'extract(title, /#(\\d+)/, 1)', 'text'),
    e('textbefore', 'Text', 'textbefore(text, delimiter[, occurrence])', 'Text before the first (or nth, negative from the end) delimiter.', 'textbefore(title, " ")', 'text'),
    e('textafter', 'Text', 'textafter(text, delimiter[, occurrence])', 'Text after the first (or nth, negative from the end) delimiter.', 'textafter(title, " ")', 'text'),
    // Number
    e('round', 'Number', 'round(number[, digits])', 'Rounds to the given decimals.', 'round(div(points, 3), 1)', 'number'),
    e('abs', 'Number', 'abs(number)', 'Absolute value.', 'abs(sub(points, 5))', 'number'),
    e('ceil', 'Number', 'ceil(number)', 'Rounds up.', 'ceil(div(points, 3))', 'number'),
    e('floor', 'Number', 'floor(number)', 'Rounds down.', 'floor(div(points, 3))', 'number'),
    e('pow', 'Number', 'pow(base, exponent)', 'Power.', 'pow(points, 2)', 'number'),
    e('mod', 'Number', 'mod(number, divisor)', 'Remainder (sign of the divisor); empty when the divisor is 0.', 'mod(points, 3)', 'number'),
    e('sign', 'Number', 'sign(number)', '-1, 0 or 1.', 'sign(sub(points, 5))', 'number'),
    e('percent', 'Number', 'percent(part, total)', 'part / total * 100, 2 decimals.', 'percent(points, 10)', 'number'),
    e('least', 'Number', 'least(a, b, ...)', 'The smallest number (empty values ignored).', 'least(points, 5, 9)', 'number', ['min2']),
    e('greatest', 'Number', 'greatest(a, b, ...)', 'The largest number (empty values ignored).', 'greatest(points, 5)', 'number', ['max2']),
    e('add', 'Number', 'add(a, b)', 'a + b.', 'add(points, 1)', 'number'),
    e('sub', 'Number', 'sub(a, b)', 'a - b.', 'sub(points, 1)', 'number'),
    e('mul', 'Number', 'mul(a, b)', 'a * b.', 'mul(points, 2)', 'number'),
    e('div', 'Number', 'div(a, b)', 'a / b; empty when b is 0.', 'div(points, 2)', 'number'),
    e('intdiv', 'Number', 'intdiv(a, b)', 'Whole part of a / b; empty when b is 0.', 'intdiv(points, 2)', 'number'),
    e('neg', 'Number', 'neg(number)', '-number.', 'neg(points)', 'number'),
    // Date & Time
    e('date', 'Date & Time', 'date(date, format)', 'Formats a date: yyyy, yy, MMM, MM, dd, HH, mm, ss.', 'date(created, "yyyy-MM-dd")', 'text'),
    e('days', 'Date & Time', 'days(date)', 'Days from today to the date.', 'days(due)', 'number'),
    e('age', 'Date & Time', 'age(date)', 'Days from the date to today.', 'age(created)', 'number'),
    e('adddays', 'Date & Time', 'addDays(date, days)', 'Adds days to a date.', 'addDays(due, 7)', 'date'),
    e('addmonths', 'Date & Time', 'addMonths(date, months)', 'Adds months, keeping the day when possible.', 'addMonths(due, 1)', 'date'),
    e('diffdays', 'Date & Time', 'diffDays(a, b)', 'Days from b to a.', 'diffDays(due, created)', 'number'),
    e('weekday', 'Date & Time', 'weekday(date)', 'Name of the day of the week.', 'weekday(due)', 'text'),
    e('dow', 'Date & Time', 'dow(date)', 'Day of the week, 1 = Monday ... 7 = Sunday.', 'dow(due)', 'number'),
    e('monthname', 'Date & Time', 'monthname(date)', 'Name of the month.', 'monthname(due)', 'text'),
    e('startofweek', 'Date & Time', 'startofweek(date)', 'The Monday of that week.', 'startofweek(due)', 'date'),
    e('startofmonth', 'Date & Time', 'startofmonth(date)', 'The first day of that month.', 'startofmonth(due)', 'date'),
    e('week_of', 'Date & Time', 'week_of(date)', 'The Monday of that week (to group by week).', 'week_of(due)', 'date'),
    e('month_of', 'Date & Time', 'month_of(date)', 'The month as yyyy-MM (to group by month).', 'month_of(due)', 'text'),
    e('quarter', 'Date & Time', 'quarter(date)', 'Quarter of the year, 1 to 4.', 'quarter(due)', 'number'),
    e('isoweek', 'Date & Time', 'isoweek(date)', 'ISO week number.', 'isoweek(due)', 'number'),
    e('year', 'Date & Time', 'year(date)', 'The year.', 'year(due)', 'number'),
    e('month', 'Date & Time', 'month(date)', 'The month, 1 to 12.', 'month(due)', 'number'),
    e('day', 'Date & Time', 'day(date)', 'The day of the month.', 'day(due)', 'number'),
    e('todate', 'Date & Time', 'todate(value)', 'The date part (yyyy-MM-dd) of a date or date-time.', 'todate(now())', 'date'),
    e('today', 'Date & Time', 'today()', 'Today as yyyy-MM-dd.', 'today()', 'date'),
    e('now', 'Date & Time', 'now()', 'The current date and time.', 'now()', 'date'),
    // List
    e('count', 'List', 'count(list)', 'Number of items of a list (tags, assignees...).', 'count(tag)', 'number'),
    e('has', 'List', 'has(list, value)', 'True when the list has the value.', 'has(tag, "bug")', 'bool'),
    e('first', 'List', 'first(list)', 'The first item.', 'first(tag)', 'any'),
    e('last', 'List', 'last(list)', 'The last item.', 'last(tag)', 'any'),
    e('sort', 'List', 'sort(list)', 'The list in order.', 'sort(tag)', 'list'),
    e('unique', 'List', 'unique(list)', 'The list without repeated items.', 'unique(tag)', 'list'),
    e('join', 'List', 'join(list[, separator])', 'Items as one text.', 'join(tag, ", ")', 'text'),
    e('rank', 'List', 'rank("Tag group")', 'Position of the best tag of the card in a tag group (lower first).', 'rank("Prioridad")', 'number'),
    // Aggregation (of the items of one list, per row)
    e('list_sum', 'Aggregation', 'list_sum(list)', 'Sum of the numbers of a list.', 'list_sum(tag)', 'number'),
    e('list_avg', 'Aggregation', 'list_avg(list)', 'Average of the numbers of a list.', 'list_avg(tag)', 'number'),
    e('list_min', 'Aggregation', 'list_min(list)', 'Smallest number of a list.', 'list_min(tag)', 'number'),
    e('list_max', 'Aggregation', 'list_max(list)', 'Largest number of a list.', 'list_max(tag)', 'number'),
    // Logical
    e('if', 'Logical', 'if(condition, then, else)', 'One value or the other. Also: if cond then a else b.', 'if(points > 5, "big", "small")', 'any', ['iif']),
    e('isnull', 'Logical', 'isnull(value)', 'True when the value is empty.', 'isnull(due)', 'bool'),
    e('iserror', 'Logical', 'iserror(calculation)', 'True when a calculation was given text it cannot read, e.g. iserror(number(x)).', 'iserror(number(title))', 'bool'),
    e('try', 'Logical', 'try(calculation, fallback)', 'The calculation, or the fallback when it is an error.', 'try(number(title), 0)', 'any'),
    // Conversion
    e('text', 'Conversion', 'text(value)', 'Converts to text (a list is joined); empty stays empty.', 'text(points)', 'text'),
    e('number', 'Conversion', 'number(value)', 'Converts to a number ("$1,234.50", "12,5"); empty when it cannot.', 'number(title)', 'number', ['decimal']),
    e('int', 'Conversion', 'int(value)', 'Converts to a whole number (rounded).', 'int(points)', 'number', ['whole']),
    e('bool', 'Conversion', 'bool(value)', 'true / false / yes / no / si / 1 / 0 to a boolean.', 'bool(title)', 'bool'),
    e('datetime', 'Conversion', 'datetime(value)', 'Converts to a date-time.', 'datetime(created)', 'date'),
    e('typeof', 'Conversion', 'typeof(value)', 'text, number, bool, date, list or null.', 'typeof(points)', 'text'),
    // Row (over the rows in order)
    e('rownum', 'Row', 'rownum([start])', 'Position of the row (1, 2, 3...).', 'rownum()', 'number', ['indice']),
    e('fill_down', 'Row', 'fill_down(value[, partition])', 'Empty values take the previous one.', 'fill_down(points)', 'any'),
    e('fill_up', 'Row', 'fill_up(value[, partition])', 'Empty values take the next one.', 'fill_up(points)', 'any'),
    e('lag', 'Row', 'lag(value[, rows])', 'The value of the previous row.', 'lag(points)', 'any'),
    e('lead', 'Row', 'lead(value[, rows])', 'The value of the next row.', 'lead(points)', 'any'),
    e('running_sum', 'Row', 'running_sum(number)', 'Running total down the rows.', 'running_sum(points)', 'number', ['cumsum']),
    e('running_count', 'Row', 'running_count()', 'Rows so far.', 'running_count()', 'number'),
    // Value
    e('coalesce', 'Value', 'coalesce(a, b, ...)', 'The first value that is not empty.', 'coalesce(due, created)', 'any'),
    e('concat', 'Value', 'concat(a, b, ...)', 'Joins values as text (also a & b).', 'concat(title, " - ", list)', 'text'),
  ];
}

/** Every function with its category, signature, description and a runnable example (for a Custom Column dialog). */
export const KQL_FUNCTION_CATALOG: KqlFunctionInfo[] = buildCatalog();

/** Argument positions that hold a whole condition instead of a value. */
const COND_ARGS: Record<string, number[]> = { if: [0], iif: [0] };
/** Longest text a regex function looks at, and the caps on text it builds. */
const MAX_BUILT_TEXT = 1000;

export function fieldLabel(field: Field): string {
  if (field.call?.label) return field.call.label;
  if (field.call?.infix) {
    const c = field.call;
    const wrap = (a: Arg) => (a.t === 'field' && a.field.call?.infix && a.field.call.args.length === 2 ? `(${argLabel(a)})` : argLabel(a));
    return c.args.length === 1 ? `${c.infix}${wrap(c.args[0])}` : `${wrap(c.args[0])} ${c.infix} ${wrap(c.args[1])}`;
  }
  if (field.call) return `${field.call.fn}(${field.call.args.map(argLabel).join(', ')})`;
  return field.custom ?? field.raw ?? field.name;
}
function argLabel(a: Arg): string {
  if (a.t === 'field') return fieldLabel(a.field);
  if (a.t === 'cond') return a.text || 'condition';
  const v = a.value;
  return v.k === 'regex' ? `/${v.v}/${v.flags}` : v.k === 'str' ? JSON.stringify(v.v) : valueText(v);
}

// ── User functions and parameters: expanded while parsing ───────────────────

type FnParamKind = 'table' | 'value';
/** A scalar function keeps its expression `body`; a table function keeps the tokens of its query and is parsed again, with the arguments bound, at each call. */
interface FnDef { name: string; args: string[]; argNames: string[]; body: Arg | null; text: string; depth: number; kind: 'scalar' | 'table'; kinds: FnParamKind[]; toks: Tok[] }
type Binding = { kind: 'table'; source: SourceRef } | { kind: 'value'; arg: Arg };
/** One declared function, for the visual editor's function dialog. */
export interface KqlFunctionDefinition {
  name: string;
  /** `table`: used as `from t` / `join t` / `union t` (or passed on to a table parameter); `value`: any other use. */
  params: Array<{ name: string; kind: FnParamKind }>;
  body: string;
  /** `scalar`: returns a value (used in expressions); `table`: returns a table (used as a source). */
  kind: 'scalar' | 'table';
  signature: string;
  /** The whole declaration as written. */
  declaration: string;
}
interface ParamDef { value: Arg; text: string }
export interface KqlDeclarations { params: Array<{ name: string; value: string }>; functions: Array<{ name: string; args: string[]; body: string }> }
const MAX_PARAMS = 20;
const MAX_FUNCTIONS = 20;
const MAX_FN_BODY = 500;
const MAX_EXPANDED_NODES = 2000;
const argToField = (a: Arg): Field => {
  if (a.t === 'field') return a.field;
  if (a.t === 'lit') return { name: 'custom', call: { fn: 'coalesce', args: [a] } };
  throw new KqlError('A condition cannot be used here as a value; wrap it in if(...).');
};
const valueFromArg = (a: Arg): Value | RegexLit => {
  if (a.t === 'lit') return a.value;
  if (a.t === 'field') return { k: 'call', call: a.field.call ?? { fn: 'coalesce', args: [a] } };
  throw new KqlError('A condition cannot be used here as a value; wrap it in if(...).');
};

/** Replaces the parameters of a function body by the arguments of one call. */
function expandBody(body: Arg, map: Map<string, Arg>): Arg {
  const budget = { n: 0 };
  const tick = () => { if (++budget.n > MAX_EXPANDED_NODES) throw new KqlError('This function call expands to too much; simplify the function or its arguments.'); };
  const arg = (a: Arg): Arg => {
    tick();
    if (a.t === 'field') {
      if (a.field.param) return structuredClone(map.get(a.field.param)!);
      return { t: 'field', field: field(a.field) };
    }
    if (a.t === 'cond') return { t: 'cond', expr: expr(a.expr), text: a.text };
    return structuredClone(a);
  };
  const call = (c: Call): Call => ({ ...c, args: c.args.map(arg) });
  const field = (f: Field): Field => {
    tick();
    if (f.param) return argToField(structuredClone(map.get(f.param)!));
    return f.call ? { ...f, call: call(f.call) } : structuredClone(f);
  };
  const value = (v: Value | RegexLit): Value | RegexLit => (v.k === 'call' ? { k: 'call', call: call(v.call) } : structuredClone(v));
  const expr = (e: Expr): Expr => {
    tick();
    switch (e.t) {
      case 'and': case 'or': return { ...e, l: expr(e.l), r: expr(e.r) };
      case 'not': return { t: 'not', e: expr(e.e) };
      case 'cmp': return { ...e, field: field(e.field), value: value(e.value) };
      case 'in': return { ...e, field: field(e.field), values: e.values.map((v) => value(v) as Value) };
      case 'between': return { ...e, field: field(e.field), a: value(e.a) as Value, b: value(e.b) as Value };
      case 'empty': case 'window': case 'truthy': return { ...e, field: field(e.field) };
      default: return structuredClone(e);
    }
  };
  return arg(body);
}

class Parser {
  private params = new Map<string, ParamDef>();
  private fns = new Map<string, FnDef>();
  private fnParams = new Set<string>();
  private currentFn: string | null = null;
  private bodyDepth = 0;
  declarations: KqlDeclarations = { params: [], functions: [] };
  private i = 0;
  private depth = 0;
  private toks: Tok[];
  private source: string;
  /** While a table function's query is parsed again for one call: its arguments (null while it is only being declared or checked). */
  private bindings: Map<string, Binding> | null = null;
  /** Parameters used as a table while a table function is declared. */
  private tableUse = new Set<string>();
  /** The `let`s that run table-function calls of the statement being parsed (they go right before it). */
  private hidden: Statement[] = [];
  private fnCalls = 0;
  private expandDepth = 0;
  /** The name a joined table function / table parameter is called by (`join t` is read as t.field). */
  private sourceAlias: string | null = null;
  definitions: KqlFunctionDefinition[] = [];
  /** Functions declared anywhere in the script (token index of the name), to explain a call to one declared further down. */
  private declaredAt = new Map<string, number>();
  private declarationsOnly = false;
  constructor(toks: Tok[], source = '', declarationsOnly = false) {
    this.toks = toks;
    this.source = source;
    this.declarationsOnly = declarationsOnly;
    for (let j = 0; j < toks.length - 2; j++) {
      const t = toks[j];
      if (t.t === 'word' && (KEYWORD_ALIASES[strip(t.v)] ?? strip(t.v)) === 'fn' && toks[j + 1].t === 'word' && toks[j + 2].t === '(' && (j === 0 || toks[j - 1].t === ';' || toks[j - 1].t === 'nl') && !this.declaredAt.has(strip(toks[j + 1].v))) {
        this.declaredAt.set(strip(toks[j + 1].v), j + 1);
      }
    }
  }

  peek(offset = 0): Tok { return this.toks[Math.min(this.i + offset, this.toks.length - 1)]; }
  next(): Tok { return this.toks[this.i < this.toks.length - 1 ? this.i++ : this.i]; }
  atEnd(): boolean { return this.peek().t === 'eof'; }

  /** The keyword of a word token ("donde" -> "where"), or null for other tokens. */
  kw(offset = 0): string | null {
    const tok = this.peek(offset);
    if (tok.t !== 'word') return null;
    const k = strip(tok.v).replace(/\./g, '');
    return KEYWORD_ALIASES[k] ?? k;
  }
  isKw(word: string, offset = 0): boolean { return this.kw(offset) === word; }
  eatKw(word: string): boolean { if (this.isKw(word)) { this.i++; return true; } return false; }
  expectKw(word: string): void {
    if (!this.eatKw(word)) throw new KqlError(`Expected "${word}" but found "${this.peek().v || 'end of query'}".`, this.peek().pos);
  }

  // Statements: separated by ";" or by a line break that does not continue the previous line.
  skipSeparators(): void { while (this.peek().t === ';' || this.peek().t === 'nl') this.i++; }

  parseScript(allowEmpty = false): Statement[] {
    const out: Statement[] = [];
    this.skipSeparators();
    let written = 0;
    while (!this.atEnd()) {
      if (this.tryDeclaration()) { this.skipSeparators(); continue; }
      if (this.declarationsOnly) {
        // the function dialog only wants the declarations: a query that does not parse is skipped
        const from = this.i;
        try { this.hidden = []; this.parseStatement(); } catch (e) {
          if (!(e instanceof KqlError)) throw e;
          while (!this.atEnd() && this.peek().t !== ';' && !(this.peek().t === 'nl' && !this.continuesAfterNl(this.i))) this.i++;
          if (this.i === from) this.i++;
        }
        this.hidden = [];
        this.skipSeparators();
        continue;
      }
      if (written >= KQL_LIMITS.maxStatements) throw new KqlError(`A script can have at most ${KQL_LIMITS.maxStatements} statements.`);
      this.hidden = [];
      const st = this.parseStatement();
      out.push(...this.hidden, st);
      this.hidden = [];
      written++;
      this.skipSeparators();
    }
    if (out.length === 0 && !allowEmpty) throw new KqlError(this.declarations.params.length + this.declarations.functions.length > 0 ? 'The script declares parameters / functions but has no query.' : 'The query is empty.');
    return out;
  }

  /** `param minimo = 100` and `fn conigv(x) = x * 1.18`: no output, they are expanded wherever they are used. */
  private tryDeclaration(): boolean {
    if (this.isKw('param') && this.peek(1).t === 'word' && this.peek(2).t === 'op' && this.peek(2).v === '=') {
      this.next();
      const nameTok = this.next();
      this.next();
      const key = strip(nameTok.v);
      if (this.params.size >= MAX_PARAMS) throw new KqlError(`A script can have at most ${MAX_PARAMS} parameters.`, nameTok.pos);
      if (this.params.has(key)) throw new KqlError(`Parameter "$${nameTok.v}" is already declared.`, nameTok.pos);
      const start = this.peek();
      const value = this.parseConcat(false);
      const text = this.source.slice(start.pos, this.peek().pos).trim();
      const nonConst = (a: Arg): string | null => {
        if (a.t === 'cond') return 'a condition';
        if (a.t === 'lit') return null;
        if (!a.field.call) return `the column "${fieldLabel(a.field)}"`;
        for (const x of a.field.call.args) { const bad = nonConst(x); if (bad) return bad; }
        return null;
      };
      const bad = nonConst(value);
      if (bad) throw new KqlError(`A parameter must be a constant (text, number, true / false, a date, today, -7d or a calculation of those), not ${bad}.`, start.pos);
      this.params.set(key, { value, text });
      this.declarations.params.push({ name: nameTok.v, value: text });
      this.expectStatementEnd();
      return true;
    }
    if (this.isKw('fn') && this.peek(1).t === 'word' && this.peek(2).t === '(') {
      const declStart = this.peek().pos;
      this.next();
      const nameTok = this.next();
      this.next();
      const key = strip(nameTok.v);
      const canonical = KEYWORD_ALIASES[key] ?? key;
      if (Object.prototype.hasOwnProperty.call(KQL_FUNCTIONS, key) || METRICS.has(canonical) || PAREN_WORDS.has(canonical)) throw new KqlError(`"${nameTok.v}" is a built-in name; a function cannot reuse it. Try "my_${key}".`, nameTok.pos);
      if (this.fns.has(key)) throw new KqlError(`Function "${nameTok.v}" is already declared.`, nameTok.pos);
      if (this.fns.size >= MAX_FUNCTIONS) throw new KqlError(`A script can have at most ${MAX_FUNCTIONS} functions.`, nameTok.pos);
      const args: string[] = [];
      const argNames: string[] = [];
      while (this.peek().t !== ')') {
        const a = this.next();
        if (a.t !== 'word') throw new KqlError('Expected a parameter name, e.g. fn double(x) = x * 2.', a.pos);
        if (args.includes(strip(a.v))) throw new KqlError(`The parameter "${a.v}" is repeated.`, a.pos);
        args.push(strip(a.v));
        argNames.push(a.v);
        if (this.peek().t === ',') this.next();
        else break;
      }
      const close = this.next();
      if (close.t !== ')') throw new KqlError('Expected ")" after the parameters.', close.pos);
      if (args.length > 10) throw new KqlError('A function takes at most 10 parameters.', nameTok.pos);
      const eq = this.next();
      if (eq.t !== 'op' || eq.v !== '=') throw new KqlError(`Expected "=" and the body: fn ${nameTok.v}(${args.join(', ')}) = ...`, eq.pos);
      if (this.looksLikeQuery(args)) return this.declareTableFn(nameTok, key, args, argNames, declStart);
      const start = this.peek();
      this.fnParams = new Set(args);
      this.currentFn = key;
      this.bodyDepth = 0;
      this.bindings = null;
      let body: Arg;
      try {
        body = this.parseBoolOperand(false);
      } finally {
        this.fnParams = new Set();
        this.currentFn = null;
      }
      const text = this.source.slice(start.pos, this.peek().pos).trim();
      if (text.length > MAX_FN_BODY) throw new KqlError(`The body of "${nameTok.v}" is too long (max ${MAX_FN_BODY} characters).`, start.pos);
      const depth = this.bodyDepth + 1;
      if (depth > KQL_LIMITS.maxFnDepth) throw new KqlError(`"${nameTok.v}" nests user functions more than ${KQL_LIMITS.maxFnDepth} levels deep.`, nameTok.pos);
      this.fns.set(key, { name: nameTok.v, args, argNames, body, text, depth, kind: 'scalar', kinds: args.map(() => 'value'), toks: [] });
      this.declarations.functions.push({ name: nameTok.v, args, body: text });
      this.definitions.push({ name: nameTok.v, params: argNames.map((name) => ({ name, kind: 'value' as const })), body: text, kind: 'scalar', signature: `${nameTok.v}(${argNames.join(', ')})`, declaration: this.source.slice(declStart, this.peek().pos).trim() });
      this.expectStatementEnd();
      return true;
    }
    return false;
  }

  /** After `fn name(a, b) =`: does a query follow (a table function) rather than an expression? */
  private looksLikeQuery(args: string[]): boolean {
    const k = this.kw();
    if (!k) return false;
    const next = this.peek(1);
    if (k === 'from' || k === 'cards') return true;
    if (k === 'values') return next.t === '(';
    if (k === 'rows' || k === 'table' || k === 'database' || k === 'db') return next.t !== 'op' && next.t !== 'arith' && next.t !== ')' && next.t !== ',';
    // `fn f(t) = t where ...`: a table parameter used as the source
    const nk = this.kw(1);
    return args.includes(strip(this.peek().v)) && !!nk && (CLAUSE_WORDS.has(nk) || nk === 'join' || nk === 'union');
  }

  /** `fn limpiar(t, minimo) = from t where Monto >= minimo select Cliente, Monto`: a query that returns a table. */
  private declareTableFn(nameTok: Tok, key: string, args: string[], argNames: string[], declStart: number): true {
    const start = this.peek();
    const startIdx = this.i;
    this.fnParams = new Set(args);
    this.currentFn = key;
    this.bodyDepth = 0;
    this.bindings = null;
    this.tableUse = new Set();
    try {
      this.parseQuery();
    } finally {
      this.fnParams = new Set();
      this.currentFn = null;
    }
    const used = this.tableUse;
    this.tableUse = new Set();
    const end = this.peek();
    const text = this.source.slice(start.pos, end.pos).trim();
    if (text.length > KQL_LIMITS.maxFnQuery) throw new KqlError(`The body of "${nameTok.v}" is too long (max ${KQL_LIMITS.maxFnQuery} characters).`, start.pos);
    const depth = this.bodyDepth + 1;
    if (depth > KQL_LIMITS.maxFnDepth) throw new KqlError(`"${nameTok.v}" nests user functions more than ${KQL_LIMITS.maxFnDepth} levels deep.`, nameTok.pos);
    const kinds: FnParamKind[] = args.map((a) => (used.has(a) ? 'table' : 'value'));
    const toks: Tok[] = [...this.toks.slice(startIdx, this.i), { t: 'eof', v: '', pos: end.pos }];
    this.fns.set(key, { name: nameTok.v, args, argNames, body: null, text, depth, kind: 'table', kinds, toks });
    this.declarations.functions.push({ name: nameTok.v, args, body: text });
    const params = argNames.map((name, i) => ({ name, kind: kinds[i] }));
    this.definitions.push({ name: nameTok.v, params, body: text, kind: 'table', signature: `${nameTok.v}(${params.map((p) => (p.kind === 'table' ? `${p.name}: table` : p.name)).join(', ')})`, declaration: this.source.slice(declStart, end.pos).trim() });
    this.expectStatementEnd();
    return true;
  }

  private parseStatement(): Statement {
    if (this.isKw('let')) {
      this.next();
      const name = this.next();
      if (name.t !== 'word') throw new KqlError('Expected a name after "let".', name.pos);
      const eq = this.next();
      if (eq.t !== 'op' || eq.v !== '=') throw new KqlError('Expected "=" after the name.', eq.pos);
      const query = this.parseQuery();
      this.expectStatementEnd();
      return { kind: 'let', name: strip(name.v), query };
    }
    this.eatKw('show');
    const query = this.parseQuery();
    let title: string | null = null;
    if (this.eatKw('as')) {
      const t = this.next();
      if (t.t !== 'str' && t.t !== 'word') throw new KqlError('Expected a title after "as".', t.pos);
      title = t.v;
    }
    this.expectStatementEnd();
    return { kind: 'show', query, title };
  }

  private expectStatementEnd(): void {
    const t = this.peek();
    if (t.t !== ';' && t.t !== 'nl' && t.t !== 'eof') throw new KqlError(`Unexpected "${t.v}".${t.t === 'word' ? didYouMean(t.v, KEYWORD_NAMES) : ''}`, t.pos);
  }

  /** A newline continues the query when the next token is a clause or connector word. */
  private skipContinuation(): void {
    while (this.peek().t === 'nl') {
      if (!this.continuesAfterNl(this.i)) return;
      this.i++;
    }
  }

  /** Does the line after the line break at token index `at` continue the statement? */
  private continuesAfterNl(at: number): boolean {
    const last = this.toks.length - 1;
    const t1 = this.toks[Math.min(at + 1, last)];
    let k: string | null = null;
    if (t1.t === 'word') { const s = strip(t1.v).replace(/\./g, ''); k = KEYWORD_ALIASES[s] ?? s; }
    return !!(k && (CLAUSE_WORDS.has(k) || ['and', 'or', 'by', 'not', 'in', 'between', 'is', 'contains', 'as', 'union', 'on', 'left'].includes(k))) || t1.t === '|' || t1.t === ',' || t1.t === ')';
  }

  private startsMetric(): boolean {
    const k = this.kw();
    if (!k || !METRICS.has(k)) return false;
    if (AGG_COUNTING.has(k)) return this.peek(1).t !== 'op';
    return this.peek(1).t === '(';
  }

  parseQuery(): Query {
    const q: Query = { source: { kind: 'cards' }, scope: [], unions: [], joins: [], where: null, group: [], select: null, metrics: [], having: null, order: [], distinct: false, offset: null, limit: null, tail: null, droplast: null, pivot: null, unpivot: null, transpose: null, implicitSelect: false };
    let explicitMetrics = false;
    if (this.eatKw('cards')) {
      /* default source */
    } else if (this.isKw('rows') || this.isKw('table') || this.isKw('database') || this.isKw('db')) {
      q.source = this.parseSourceRef('rows of');
    } else if (this.isKw('values') && this.peek(1).t === '(') {
      q.source = this.parseValuesSource();
    } else if (this.eatKw('from')) {
      if (this.isKw('values') && this.peek(1).t === '(') q.source = this.parseValuesSource();
      else if (this.isCallInSource()) q.source = this.parseTableCall();
      else {
        const name = this.next();
        if (name.t !== 'word' && name.t !== 'str' && name.t !== 'ident') throw new KqlError('Expected a name after "from".', name.pos);
        q.source = this.nameSource(name);
      }
    } else if (this.isTableCallAhead()) {
      // `limpiar(rows of "Ventas", 500) group by Cliente sum(Monto)`: a table function as the source
      q.source = this.parseTableCall();
    } else if (this.peek().t === 'word' && !CLAUSE_WORDS.has(this.kw() ?? '') && !this.isKw('cards')) {
      // `show mine group by list`, `documents where ...`: a name defined with "let", or a data source
      q.source = this.nameSource(this.next());
    }
    this.skipContinuation();
    if (q.source.kind === 'cards' && this.isKw('in')) q.scope = this.parseScope();
    this.parseCombinations(q);
    for (;;) {
      this.skipContinuation();
      if (this.peek().t === '|') { this.i++; continue; }
      if (this.isKw('where')) {
        this.next();
        if (q.where) throw new KqlError('Only one "where" is allowed (join conditions with "and").', this.peek().pos);
        q.where = this.parseExpr();
      } else if (this.isKw('group')) {
        this.next();
        this.expectKw('by');
        q.group = this.parseDimensions();
      } else if (this.isKw('select')) {
        this.next();
        if (this.eatKw('distinct')) q.distinct = true;
        q.select = this.parseProjections();
      } else if (this.isKw('distinct')) {
        // `distinct title, list` = `select distinct title, list`
        this.next();
        if (q.select) throw new KqlError('Write "select distinct a, b" (or "distinct a, b"), not both "select" and "distinct".', this.peek().pos);
        q.distinct = true;
        q.select = this.parseProjections();
      } else if (this.isKw('having')) {
        this.next();
        if (q.having) throw new KqlError('Only one "having" is allowed (join conditions with "and").', this.peek().pos);
        q.having = this.parseHaving();
      } else if (this.startsMetric()) {
        q.metrics.push(...this.parseMetrics());
        explicitMetrics = true;
      } else if (this.isKw('order')) {
        this.next();
        this.expectKw('by');
        q.order = [this.parseOrder(q)];
        while (this.peek().t === ',') { this.i++; q.order.push(this.parseOrder(q)); }
      } else if (this.isKw('limit')) {
        this.next();
        const n = this.nextNumber();
        if (n.t !== 'num' || n.n! < 1 || !Number.isInteger(n.n)) throw new KqlError('"limit" needs a whole number.', n.pos);
        q.limit = Math.min(n.n!, 10_000);
      } else if (this.isKw('offset')) {
        this.next();
        const n = this.nextNumber();
        if (n.t !== 'num' || n.n! < 0 || !Number.isInteger(n.n)) throw new KqlError('"offset" needs a whole number (0 or more).', n.pos);
        q.offset = Math.min(n.n!, 1_000_000);
      } else if (this.isKw('tail') || this.isKw('droplast')) {
        const word = this.kw()!;
        this.next();
        const n = this.nextNumber();
        if (n.t !== 'num' || n.n! < (word === 'tail' ? 1 : 0) || !Number.isInteger(n.n)) throw new KqlError(`"${word}" needs a whole number, e.g. ${word} 5.`, n.pos);
        if (word === 'tail') q.tail = Math.min(n.n!, 1_000_000);
        else q.droplast = Math.min(n.n!, 1_000_000);
      } else if (this.isKw('pivot')) {
        const at = this.next();
        if (q.pivot) throw new KqlError('Only one "pivot" is allowed.', at.pos);
        q.pivot = this.parseDimension();
      } else if (this.isKw('transpose')) {
        this.next();
        q.transpose = this.eatKw('header') ? 'header' : 'plain';
      } else if (this.isKw('top') || this.isKw('bottom')) {
        // `top 5 by sum(points)` = `order by sum(points) desc limit 5`; `bottom` is ascending
        const dir: 'asc' | 'desc' = this.kw() === 'top' ? 'desc' : 'asc';
        const word = this.next().v;
        const n = this.nextNumber();
        if (n.t !== 'num' || n.n! < 1 || !Number.isInteger(n.n)) throw new KqlError(`"${word}" needs a whole number, e.g. ${word} 5 by count.`, n.pos);
        if (q.order.length > 0) throw new KqlError(`Use either "${word}" or "order by", not both.`, n.pos);
        q.limit = Math.min(n.n!, 10_000);
        if (this.eatKw('by')) q.order = [this.parseOrder(q, dir)];
        else if (q.select) throw new KqlError(`With "select", say what to rank by: ${word} ${n.v} by points.`, this.peek().pos);
        else q.order = [{ by: 'metric', dir }];
      } else break;
    }
    if (q.select && (q.group.length > 0 || explicitMetrics)) throw new KqlError('"select" lists records; it cannot be combined with "group by" or metrics.', this.peek().pos);
    if (q.select && q.having) throw new KqlError('"having" filters groups; it cannot be combined with "select" (use "where").', this.peek().pos);
    // No metric written in the query: count. A metric that appeared only inside "order by" is an extra column.
    // (`order by count` / `top 3 by count` already added it: do not repeat the column)
    if (q.unpivot && !q.select && q.group.length === 0 && !explicitMetrics && !q.pivot) q.implicitSelect = true;
    if (!explicitMetrics && !q.select && !q.implicitSelect && !q.metrics.some((m) => m.label === 'count')) {
      q.metrics.unshift({ fn: 'count', label: 'count' });
      for (const o of q.order) if (o.by === 'metric') o.metric = (o.metric ?? -1) + 1;
    }
    for (const o of q.order) if (o.by === 'metric' && o.metric === undefined) o.metric = 0;
    if (q.pivot) {
      if (q.group.length === 0) throw new KqlError('"pivot" needs "group by" first: group by Responsable pivot Estado sum(Monto).', this.peek().pos);
      if (q.select) throw new KqlError('"pivot" works on a grouped result; it cannot be combined with "select".', this.peek().pos);
      if (q.having) throw new KqlError('"having" cannot be combined with "pivot" (filter with "where" before grouping).', this.peek().pos);
      if (q.metrics.length !== 1) throw new KqlError(`"pivot" takes exactly one metric (count, sum(x)...), not ${q.metrics.length}.`, this.peek().pos);
    }
    return q;
  }

  // Sources to combine: union, join -----------------------------------------------

  /** `cards`, `rows of "Table"` (also table / database), or a name (a `let` selection or a data source). */
  /** `values ("Cliente", "Monto") ("ACME", 120) ("Beta", 80)`: the first group names the columns. */
  private parseValuesSource(): SourceRef {
    const at = this.next();
    const skipNl = () => { while (this.peek().t === 'nl') this.i++; };
    const groups: Cell[][] = [];
    for (;;) {
      let j = 0;
      while (this.peek(j).t === 'nl') j++;
      if (this.peek(j).t !== '(') break;
      skipNl();
      this.next();
      const row: Cell[] = [];
      for (;;) {
        skipNl();
        if (this.peek().t === ')') break;
        const t = this.next();
        const k = t.t === 'word' ? strip(t.v) : '';
        if (t.t === 'str' || t.t === 'date') row.push(t.v);
        else if (t.t === 'num') row.push(t.n!);
        else if (k === 'true' || k === 'yes' || k === 'verdadero') row.push(true);
        else if (k === 'false' || k === 'falso') row.push(false);
        else if (k === 'null' || k === 'nulo') row.push(null);
        else throw new KqlError(`Unexpected "${t.v || 'end of query'}" in values: text goes in quotes, e.g. ("ACME", 120).`, t.pos);
        skipNl();
        if (this.peek().t === ',') this.i++;
        else break;
      }
      skipNl();
      const close = this.next();
      if (close.t !== ')') throw new KqlError('Expected ")" to close the row.', close.pos);
      groups.push(row);
      if (groups.length > 1001) throw new KqlError('values accepts at most 1000 rows.', at.pos);
    }
    if (groups.length === 0) throw new KqlError('values needs a header and rows: values ("Cliente", "Monto") ("ACME", 120).', at.pos);
    if (groups[0].some((h) => typeof h !== 'string')) throw new KqlError('The first group of values is the header: write the column names in quotes, e.g. values ("Cliente", "Monto") ("ACME", 120).', at.pos);
    const columns = groups[0].map((h) => String(h ?? ''));
    if (columns.length > 50) throw new KqlError('values accepts at most 50 columns.', at.pos);
    if (columns.some((c) => c === '') || new Set(columns.map((c) => norm(c))).size !== columns.length) throw new KqlError('The header of values needs a different, non-empty name per column.', at.pos);
    const rows = groups.slice(1);
    rows.forEach((r, ri) => { if (r.length !== columns.length) throw new KqlError(`Row ${ri + 1} of values has ${r.length} cells but the header has ${columns.length}.`, at.pos); });
    // one type per column: all numbers, all true / false, else text
    columns.forEach((_, ci) => {
      const cellsOf = rows.map((r) => r[ci]).filter((x) => x !== null);
      const all = (t: string) => cellsOf.length > 0 && cellsOf.every((x) => typeof x === t);
      if (!all('number') && !all('boolean')) for (const r of rows) if (r[ci] !== null) r[ci] = String(r[ci]);
    });
    return { kind: 'values', columns, rows };
  }

  // Table functions: `from limpiar(rows of "Ventas", 500)` --------------------------

  private isCallInSource(): boolean {
    const t = this.peek();
    return t.t === 'word' && this.peek(1).t === '(' && !this.isKw('values');
  }

  private isTableCallAhead(): boolean {
    const t = this.peek();
    return t.t === 'word' && this.peek(1).t === '(' && this.fns.get(strip(t.v))?.kind === 'table';
  }

  /** A source written as a bare name: a table parameter of the function being read, or a `let` / data source name. */
  private nameSource(tok: Tok): SourceRef {
    const key = strip(tok.v);
    if (tok.t === 'word' && this.fnParams.has(key)) {
      this.sourceAlias = tok.v;
      const b = this.bindings?.get(key);
      if (b) {
        if (b.kind !== 'table') throw new KqlError(`"${tok.v}" holds a value, not a table.`, tok.pos);
        return structuredClone(b.source);
      }
      if (!this.bindings) this.tableUse.add(key);
    }
    return { kind: 'name', name: key };
  }

  /** The user function behind a call, or a clear error (recursion, declared further down, built-in, unknown). */
  private userFnFor(tok: Tok): FnDef {
    const k = strip(tok.v);
    if (this.currentFn === k) throw new KqlError(`"${tok.v}" calls itself: recursion is not allowed in functions.`, tok.pos);
    const def = this.fns.get(k);
    if (def) return def;
    this.assertNotDeclaredBelow(tok);
    const canonical = KEYWORD_ALIASES[k] ?? k;
    if (Object.prototype.hasOwnProperty.call(KQL_FUNCTIONS, k) || METRICS.has(canonical) || PAREN_WORDS.has(canonical)) {
      throw new KqlError(`${tok.v}() is a built-in that returns a value. A source needs a table: a table function (fn name(t) = from t ...), rows of "Table", cards or a name saved with let.`, tok.pos);
    }
    const tables = [...this.fns.entries()].filter(([, f]) => f.kind === 'table').map(([n]) => n);
    throw new KqlError(`Unknown function "${tok.v}".${didYouMean(k, tables)}${tables.length ? ` Table functions: ${tables.join(', ')}.` : ' Declare it first: fn name(t) = from t where ...'}`, tok.pos);
  }

  /** A function that is declared below the place that calls it: explain the rule (it also rules out recursion, direct or mutual). */
  private assertNotDeclaredBelow(tok: Tok): void {
    const k = strip(tok.v);
    if (this.fns.has(k) || !this.declaredAt.has(k)) return;
    const mutual = this.currentFn !== null && this.bodyMentions(k, this.currentFn);
    throw new KqlError(`Unknown function "${tok.v}". ${mutual ? `"${tok.v}" and "${this.currentFn}" call each other: mutual recursion is not allowed. ` : ''}It is declared further down: a function can only call functions declared above it (so recursion, direct or mutual, is impossible).`, tok.pos);
  }

  /** Does the declaration of `owner` call `target(`? */
  private bodyMentions(owner: string, target: string): boolean {
    const from = this.declaredAt.get(owner);
    if (from === undefined) return false;
    for (let j = from + 1; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.t === ';' || t.t === 'eof') break;
      if (t.t === 'nl' && !this.continuesAfterNl(j)) break;
      if (t.t === 'word' && strip(t.v) === target && this.toks[j + 1]?.t === '(') return true;
    }
    return false;
  }

  /** `name(table, value, ...)` used as a source: the call is run by a `let` that goes right before the statement. */
  private parseTableCall(): SourceRef {
    const nameTok = this.peek();
    const def = this.userFnFor(nameTok);
    if (def.kind !== 'table') throw new KqlError(`${nameTok.v}() returns a value, not a table: use it inside an expression (select ${nameTok.v}(...), where ...). A source needs a table function.`, nameTok.pos);
    this.next();
    this.next(); // (
    const binds: Binding[] = [];
    this.enter();
    while (this.peek().t !== ')') {
      if (this.atEnd()) throw new KqlError(`Expected ")" to close ${nameTok.v}(...).`, this.peek().pos);
      const idx = binds.length;
      if (def.kinds[idx] !== 'table' && idx < def.args.length) this.assertNotATable(nameTok.v, def.argNames[idx]);
      binds.push(def.kinds[idx] === 'table' ? { kind: 'table', source: this.parseTableArg(nameTok.v, def.argNames[idx]) } : { kind: 'value', arg: this.parseArg() });
      if (this.peek().t === ',') this.next();
      else break;
    }
    this.leave();
    const close = this.next();
    if (close.t !== ')') throw new KqlError(`Expected ")" to close ${nameTok.v}(...).`, close.pos);
    if (binds.length !== def.args.length) {
      const sig = def.argNames.map((n, i) => (def.kinds[i] === 'table' ? `table ${n}` : n)).join(', ');
      throw new KqlError(`${nameTok.v}() takes ${def.args.length} argument${def.args.length === 1 ? '' : 's'} (${sig}), not ${binds.length}.`, nameTok.pos);
    }
    this.bodyDepth = Math.max(this.bodyDepth, def.depth);
    const source = this.expandTableCall(def, binds, nameTok);
    this.sourceAlias = def.name;
    return source;
  }

  /** A table passed where the function takes a value: its body never uses that parameter as a source. */
  private assertNotATable(fnName: string, param: string): void {
    const t = this.peek();
    const k = this.kw();
    const next = this.peek(1);
    const table = (k === 'rows' && this.isKw('of', 1)) || k === 'cards' || k === 'from' || (k === 'values' && next.t === '(') || this.isTableCallAhead();
    if (table) throw new KqlError(`Argument "${param}" of ${fnName}() is a value: its body never uses "${param}" as a table (from ${param} / join ${param} / union ${param}), so it cannot take rows of ..., cards or another table.`, t.pos);
  }

  /** An argument that is a table: `rows of "T"`, `cards`, `values (...)`, a `let` name, a table parameter or another table function call. */
  private parseTableArg(fnName: string, param: string): SourceRef {
    this.eatKw('from');
    const t = this.peek();
    if (t.t !== 'word' && t.t !== 'str' && t.t !== 'ident') {
      throw new KqlError(`Argument "${param}" of ${fnName}() is a table: write rows of "Table", cards, values (...), a name saved with let, or another table function. Found "${t.v || 'end of query'}".`, t.pos);
    }
    return this.parseSourceRef(`${fnName}(`);
  }

  /** Runs one call: the function's query is read again with the arguments bound, saved by a hidden `let`, and that name is the source. */
  private expandTableCall(def: FnDef, binds: Binding[], at: Tok): SourceRef {
    if (this.currentFn !== null && this.bindings === null) return { kind: 'name', name: `${def.name}#` }; // only checking a declaration
    if (++this.fnCalls > KQL_LIMITS.maxFnCalls) throw new KqlError(`This script runs more than ${KQL_LIMITS.maxFnCalls} table-function calls (nested calls count); call fewer functions, or keep a result with let and reuse it.`, at.pos);
    if (this.expandDepth >= KQL_LIMITS.maxFnDepth) throw new KqlError(`Table functions are nested more than ${KQL_LIMITS.maxFnDepth} levels deep.`, at.pos);
    const saved = { toks: this.toks, i: this.i, fnParams: this.fnParams, bindings: this.bindings, currentFn: this.currentFn, depth: this.depth, alias: this.sourceAlias };
    this.toks = def.toks;
    this.i = 0;
    this.fnParams = new Set(def.args);
    this.bindings = new Map(def.args.map((a, i) => [a, binds[i]]));
    this.currentFn = strip(def.name);
    this.depth = 0;
    this.expandDepth++;
    let query: Query;
    try {
      query = this.parseQuery();
    } finally {
      this.toks = saved.toks;
      this.i = saved.i;
      this.fnParams = saved.fnParams;
      this.bindings = saved.bindings;
      this.currentFn = saved.currentFn;
      this.depth = saved.depth;
      this.sourceAlias = saved.alias;
      this.expandDepth--;
    }
    const name = `${def.name}#${this.fnCalls}`;
    this.hidden.push({ kind: 'let', name, query, via: { fn: def.name, params: def.argNames, tables: binds.flatMap((b) => (b.kind === 'table' && b.source.kind === 'name' ? [b.source.name] : [])) } });
    return { kind: 'name', name };
  }

  private parseSourceRef(what: string): SourceRef {
    if (this.isKw('values') && this.peek(1).t === '(') return this.parseValuesSource();
    if (this.isCallInSource()) return this.parseTableCall();
    if (this.eatKw('cards')) return { kind: 'cards' };
    if (this.isKw('rows') || this.isKw('table') || this.isKw('database') || this.isKw('db')) {
      // rows of "Sales" / table "Sales" / database [Task tracker]
      this.next();
      this.eatKw('of');
      const ref = this.next();
      if (ref.t !== 'str' && ref.t !== 'ident' && ref.t !== 'word' && ref.t !== 'num') throw new KqlError('Expected the table\'s title or id after "rows of", e.g. rows of "Sales".', ref.pos);
      return { kind: 'rows', ref: ref.v };
    }
    const name = this.next();
    if (name.t !== 'word' && name.t !== 'str' && name.t !== 'ident') throw new KqlError(`Expected a source after "${what}", e.g. ${what} members.`, name.pos);
    return this.nameSource(name);
  }

  private parseCombinations(q: Query): void {
    for (;;) {
      this.skipContinuation();
      if (this.isKw('union')) {
        const at = this.next();
        if (q.unions.length >= 5) throw new KqlError('A query can union at most 5 sources.', at.pos);
        q.unions.push(this.parseSourceRef('union'));
      } else if (this.isKw('join') && this.peek(1).t !== '(') {
        q.joins.push(this.parseJoin(q.joins.length));
      } else if (this.isKw('unpivot')) {
        const at = this.next();
        if (q.unpivot) throw new KqlError('Only one "unpivot" is allowed.', at.pos);
        q.unpivot = this.parseUnpivot();
      } else break;
    }
  }

  /** `in board "A", "B" list "X"`, `in "A / X"`, `in list id "uuid"` (Spanish: en tablero ... lista ...). */
  private parseScope(): ScopeQualifier[] {
    this.next(); // in
    const out: ScopeQualifier[] = [];
    const value = (): string => {
      const t = this.next();
      if (t.t !== 'str' && t.t !== 'word' && t.t !== 'ident' && t.t !== 'num') throw new KqlError('Expected a name (in quotes) after "in board" / "in list".', t.pos);
      return t.v;
    };
    for (;;) {
      const t = this.peek();
      const k = t.t === 'word' ? strip(t.v) : '';
      const kind = k === 'board' || k === 'tablero' ? 'board' : k === 'list' || k === 'lista' ? 'list' : t.t === 'str' ? 'path' : null;
      if (!kind) break;
      let by: 'name' | 'id' = 'name';
      if (kind !== 'path') {
        this.next();
        const n = this.peek();
        if (n.t === 'word' && strip(n.v) === 'id' && ['str', 'word', 'ident', 'num'].includes(this.peek(1).t)) { this.next(); by = 'id'; }
      }
      const values = [value()];
      while (this.peek().t === ',' && ['str', 'word', 'ident', 'num'].includes(this.peek(1).t)) { this.i++; values.push(value()); }
      out.push({ kind, by, values });
    }
    if (out.length === 0) throw new KqlError('Expected board, list or a "Board / List" path after "in", e.g. cards in board "Tablero QA" list "En QA".', this.peek().pos);
    return out;
  }

  private parseUnpivot(): Unpivot {
    const except = this.eatKw('except');
    const columns: Field[] = [];
    for (;;) {
      columns.push(this.parseOperand());
      if (this.peek().t === ',') { this.i++; continue; }
      break;
    }
    let attribute = 'Attribute';
    let value = 'Value';
    const name = (): string => {
      const t = this.next();
      if (t.t !== 'str' && t.t !== 'word' && t.t !== 'ident') throw new KqlError('Expected a column name after "as", e.g. unpivot Q1, Q2 as "Quarter", "Score".', t.pos);
      return t.v;
    };
    if (this.eatKw('as')) {
      attribute = name();
      if (this.peek().t === ',') { this.i++; value = name(); }
    }
    return { columns, except, attribute, value };
  }

  private parseJoin(already: number): Join {
    const at = this.next();
    if (already >= 2) throw new KqlError('A query can have at most 2 joins.', at.pos);
    this.sourceAlias = null;
    const source = this.parseSourceRef('join');
    let alias = this.sourceAlias ?? (source.kind === 'cards' ? 'cards' : source.kind === 'rows' ? source.ref : source.kind === 'values' ? 'values' : source.name);
    if (this.eatKw('as')) {
      const a = this.next();
      if (a.t !== 'word' && a.t !== 'str' && a.t !== 'ident') throw new KqlError('Expected a name after "as".', a.pos);
      alias = a.v;
    }
    const example = 'join members on assignee = id';
    if (!(this.eatKw('on') || this.eatKw('in'))) throw new KqlError(`A join needs "on <field> = <field>", e.g. ${example}.`, this.peek().pos);
    let left = this.parseOperand();
    const eq = this.next();
    if (eq.t !== 'op' || eq.v !== '=') throw new KqlError(`A join compares two fields with "=", e.g. ${example}.`, eq.pos);
    let right = this.parseOperand();
    // either side may be written alias.field; the one with the alias is the joined source's
    const prefix = norm(alias) + '.';
    const owned = (f: Field) => f.name === 'custom' && !f.call && !!f.custom && f.custom.length > alias.length + 1 && norm(f.custom.slice(0, alias.length + 1)) === prefix;
    if (owned(left) && !owned(right)) [left, right] = [right, left];
    if (owned(right)) {
      const rest = right.custom!.slice(alias.length + 1);
      const builtin = FIELD_ALIASES[strip(rest)];
      right = builtin ? { name: builtin, raw: rest } : { name: 'custom', custom: rest, raw: rest };
    }
    let kind: 'inner' | 'left' = 'inner';
    if (this.eatKw('left')) kind = 'left';
    else this.eatKw('inner');
    return { source, alias, left, right, kind };
  }

  // Fields, calls, dimensions, metrics ------------------------------------------

  private followedByOperator(offset: number): boolean {
    const n = this.peek(offset);
    if (n.t === 'op') return true;
    const k = this.kw(offset);
    return !!k && ['in', 'between', 'is', 'contains', 'startswith', 'endswith', 'before', 'after', 'not'].includes(k);
  }

  private isCallAhead(): boolean {
    const tok = this.peek();
    return tok.t === 'word' && this.peek(1).t === '(' && (Object.prototype.hasOwnProperty.call(KQL_FUNCTIONS, strip(tok.v)) || this.fns.has(strip(tok.v)));
  }

  /** `lowr(title)`: a word that is called like a function but is not one. Fails with the closest real name. */
  private assertKnownCall(): void {
    const tok = this.peek();
    if (tok.t !== 'word' || this.peek(1).t !== '(') return;
    const k = strip(tok.v);
    const canonical = KEYWORD_ALIASES[k] ?? k;
    if (this.currentFn === k) throw new KqlError(`"${tok.v}" calls itself: recursion is not allowed in functions.`, tok.pos);
    this.assertNotDeclaredBelow(tok);
    if (this.fns.has(k) || Object.prototype.hasOwnProperty.call(KQL_FUNCTIONS, k) || PAREN_WORDS.has(canonical) || METRICS.has(canonical) || UNIT_ALIASES[k] || this.fnParams.has(k)) return;
    const names = [...Object.keys(KQL_FUNCTIONS).map(kqlFunctionName), ...KQL_M_ALIASES.map(([m]) => m), ...this.fns.keys(), ...METRICS, 'day', 'week', 'month', 'year'];
    throw new KqlError(`Unknown function "${tok.v}".${didYouMean(k, names)}`, tok.pos);
  }

  private tryField(): Field | null {
    const tok = this.peek();
    if (tok.t !== 'word') return null;
    const cf = /^(cf|field|fields|campo|col|column|columna)\.(.+)$/i.exec(tok.v);
    if (cf) return { name: 'custom', custom: cf[2], raw: cf[2] };
    const name = FIELD_ALIASES[strip(tok.v)];
    return name ? { name, raw: tok.v } : null;
  }

  /** After an expression: does a comparison / and / or follow, so the whole thing is a condition used as a value? */
  private condFollows(): boolean {
    const t = this.peek();
    if (t.t === 'op') return true;
    const k = this.kw();
    if (!k) return false;
    if (['and', 'or', 'in', 'between', 'is', 'contains', 'startswith', 'endswith', 'before', 'after'].includes(k)) return true;
    return k === 'not' && (this.isKw('in', 1) || this.isKw('contains', 1));
  }

  /** An expression, or a condition (`Monto > 700`, `a > 1 and b = 2`) that yields true / false. */
  private parseBoolOperand(operand: boolean): Arg {
    const start = this.i;
    const negated = this.isKw('not') && !['op', ',', ')', 'eof', 'nl'].includes(this.peek(1).t);
    if (!negated) {
      const first = this.parseConcat(operand);
      if (!this.condFollows()) return first;
      this.i = start;
    }
    const { expr, text } = this.parseCondText();
    return { t: 'field', field: { name: 'custom', call: { fn: 'if', args: [{ t: 'cond', expr, text }, { t: 'lit', value: { k: 'bool', v: true } }, { t: 'lit', value: { k: 'bool', v: false } }], label: text } } };
  }

  /** A field of select / group by / order by: a column, a calculation or a true / false condition. */
  private parseValueOperand(): Field {
    return argToField(this.parseBoolOperand(true));
  }

  /** The next token; a `$parameter` holding a number counts as that number (limit $n, top $n...). */
  private nextNumber(): Tok {
    const t = this.peek();
    const key = strip(t.v);
    if ((t.t === 'word' || t.t === 'param') && this.fnParams.has(key) && !(t.t === 'param' && this.params.has(key))) {
      // `limit n` / `top $n` where n is a parameter of the table function being read
      this.next();
      if (!this.bindings) return { t: 'num', v: '1', n: 1, pos: t.pos };
      const b = this.bindings.get(key);
      if (b?.kind === 'value' && b.arg.t === 'lit' && b.arg.value.k === 'num') return { t: 'num', v: String(b.arg.value.v), n: b.arg.value.v, pos: t.pos };
      throw new KqlError(`${t.v} must hold a number here.`, t.pos);
    }
    if (t.t === 'param') {
      const a = this.expandParam();
      if (a.t === 'lit' && a.value.k === 'num') return { t: 'num', v: String(a.value.v), n: a.value.v, pos: t.pos };
      throw new KqlError(`$${t.v} must hold a number here.`, t.pos);
    }
    return this.next();
  }

  /** A parameter of the function being read: its argument when the function is called, a placeholder while it is declared. */
  private paramArg(key: string, tok: Tok): Arg {
    const b = this.bindings?.get(key);
    if (!b) return { t: 'field', field: { name: 'custom', param: key } };
    if (b.kind === 'table') throw new KqlError(`"${tok.v}" is a table parameter: use it as a source (from ${tok.v}), not as a value.`, tok.pos);
    return structuredClone(b.arg);
  }

  private expandParam(): Arg {
    const tok = this.next();
    if (this.fnParams.has(strip(tok.v)) && !this.params.has(strip(tok.v))) return this.paramArg(strip(tok.v), tok);
    const def = this.params.get(strip(tok.v));
    if (!def) {
      const near = closestName(tok.v, [...this.params.keys()]);
      const declared = [...this.params.keys()];
      throw new KqlError(`Unknown parameter "$${tok.v}".${near ? ` Did you mean "$${near}"?` : ''}${declared.length ? ` Declared: ${declared.map((d) => `$${d}`).join(', ')}.` : ` Declare it first: param ${tok.v} = value.`}`, tok.pos);
    }
    return structuredClone(def.value);
  }

  // Expressions: & (text), + -, * / %, unary minus, parentheses. `operand` mode reads quoted words as columns. -----

  /**
   * A field in a place where one is expected: a built-in name, `[Column name]`, "Column name", a function call, or
   * any other word, which names a column of the table being queried; or an arithmetic expression over those.
   */
  parseOperand(): Field {
    return argToField(this.parseConcat(true));
  }

  private binary(fn: string, op: string, l: Arg, r: Arg): Arg {
    return { t: 'field', field: { name: 'custom', call: { fn, args: [l, r], infix: op } } };
  }

  private parseConcat(operand: boolean): Arg {
    let left = this.parseAdditive(operand);
    while (this.peek().t === 'arith' && this.peek().v === '&') {
      this.next();
      left = this.binary('concat', '&', left, this.parseAdditive(false));
    }
    return left;
  }

  private parseAdditive(operand: boolean): Arg {
    let left = this.parseMultiplicative(operand);
    for (;;) {
      const t = this.peek();
      if (t.t === 'arith' && (t.v === '+' || t.v === '-')) {
        this.next();
        left = this.binary(t.v === '+' ? 'add' : 'sub', t.v, left, this.parseMultiplicative(false));
      } else if (t.t === 'num' && /^[+-]/.test(t.v)) {
        // `Monto -1`: the sign belongs to the operator
        this.next();
        left = this.binary(t.n! < 0 ? 'sub' : 'add', t.n! < 0 ? '-' : '+', left, { t: 'lit', value: { k: 'num', v: Math.abs(t.n!) } });
      } else break;
    }
    return left;
  }

  private parseMultiplicative(operand: boolean): Arg {
    let left = this.parseUnary(operand);
    for (;;) {
      const t = this.peek();
      if (t.t === 'arith' && (t.v === '*' || t.v === '/' || t.v === '%')) {
        this.next();
        left = this.binary(t.v === '*' ? 'mul' : t.v === '/' ? 'div' : 'mod', t.v, left, this.parseUnary(false));
      } else break;
    }
    return left;
  }

  private parseUnary(operand: boolean): Arg {
    const t = this.peek();
    if (t.t === 'arith' && (t.v === '-' || t.v === '+')) {
      this.next();
      this.enter();
      const inner = this.parseUnary(operand);
      this.leave();
      return t.v === '+' ? inner : { t: 'field', field: { name: 'custom', call: { fn: 'neg', args: [inner], infix: '-' } } };
    }
    return this.parseAtomArg(operand);
  }

  /** A call to a built-in (kept as a call) or to a user function (expanded in place). */
  private parseCallArg(): Arg {
    const nameTok = this.peek();
    const key = strip(nameTok.v);
    const user = this.fns.get(key);
    if (!user || Object.prototype.hasOwnProperty.call(KQL_FUNCTIONS, key)) return { t: 'field', field: { name: 'custom', call: this.parseCall() } };
    if (user.kind === 'table') throw new KqlError(`${nameTok.v}() returns a table, so it goes where a table goes: from ${nameTok.v}(...), join ${nameTok.v}(...) or let x = ${nameTok.v}(...); not inside an expression.`, nameTok.pos);
    this.next();
    this.next(); // (
    const args: Arg[] = [];
    this.enter();
    while (this.peek().t !== ')') {
      if (this.atEnd()) throw new KqlError('Expected ")".', this.peek().pos);
      args.push(this.parseArg());
      if (this.peek().t === ',') this.next();
      else break;
    }
    this.leave();
    const close = this.next();
    if (close.t !== ')') throw new KqlError(`Expected ")" to close ${nameTok.v}(...).`, close.pos);
    if (args.length !== user.args.length) throw new KqlError(`${nameTok.v}() takes ${user.args.length} argument${user.args.length === 1 ? '' : 's'} (${user.args.join(', ')}), not ${args.length}.`, nameTok.pos);
    this.bodyDepth = Math.max(this.bodyDepth, user.depth);
    return expandBody(user.body!, new Map(user.args.map((a, i) => [a, args[i]])));
  }

  /** Power Query's own form: `if points > 5 then "big" else "small"` (same as if(points > 5, "big", "small")). */
  private parseIfThenElse(): Arg {
    this.next();
    const { expr, text } = this.parseCondText();
    if (!this.eatKw('then')) throw new KqlError('Expected "then" after the condition: if cond then a else b.', this.peek().pos);
    const whenTrue = this.parseConcat(false);
    if (!this.eatKw('else')) throw new KqlError('Expected "else": if cond then a else b.', this.peek().pos);
    const whenFalse = this.parseConcat(false);
    return { t: 'field', field: { name: 'custom', call: { fn: 'if', args: [{ t: 'cond', expr, text }, whenTrue, whenFalse] } } };
  }

  private fieldAtom(): Arg {
    const tok = this.peek();
    if (tok.t === 'ident' || tok.t === 'str') { this.next(); return { t: 'field', field: { name: 'custom', custom: tok.v, raw: tok.v } }; }
    if (tok.t === 'word') {
      const key = strip(tok.v);
      if (this.fnParams.has(key)) { this.next(); return this.paramArg(key, tok); }
      const known = this.tryField();
      this.next();
      return { t: 'field', field: known ?? { name: 'custom', custom: tok.v, raw: tok.v } };
    }
    if (tok.t === 'star') throw new KqlError('"*" only works in select and in count(*).', tok.pos);
    throw new KqlError(`Expected a field but found "${tok.v || 'end of query'}".`, tok.pos);
  }

  private parseAtomArg(operand: boolean): Arg {
    const tok = this.peek();
    if (tok.t === '(') {
      this.next();
      this.enter();
      const inner = this.parseConcat(operand);
      this.leave();
      const close = this.next();
      if (close.t !== ')') throw new KqlError('Expected ")".', close.pos);
      return inner;
    }
    if (tok.t === 'param') return this.expandParam();
    if (tok.t === 'word' && strip(tok.v) === 'if' && this.peek(1).t !== '(') return this.parseIfThenElse();
    this.assertKnownCall();
    if (operand) {
      if (this.isCallAhead()) return this.parseCallArg();
      switch (tok.t) {
        case 'num': this.next(); return { t: 'lit', value: { k: 'num', v: tok.n! } };
        case 'date': this.next(); return { t: 'lit', value: { k: 'date', v: tok.v } };
        case 'dur': this.next(); return { t: 'lit', value: { k: 'rel', n: tok.n!, unit: tok.unit as 'd' } };
        default: return this.fieldAtom();
      }
    }
    return this.parseArgToken(tok);
  }

  private parseCall(): Call {
    const nameTok = this.next();
    const fn = strip(nameTok.v);
    const [min, max] = KQL_FUNCTIONS[fn];
    this.next(); // (
    const args: Arg[] = [];
    this.enter();
    while (this.peek().t !== ')') {
      if (this.atEnd()) throw new KqlError('Expected ")".', this.peek().pos);
      if ((COND_ARGS[fn] ?? []).includes(args.length)) args.push({ t: 'cond', ...this.parseCondText() });
      else args.push(this.parseArg());
      if (this.peek().t === ',') this.next();
      else break;
    }
    this.leave();
    const close = this.next();
    if (close.t !== ')') throw new KqlError(`Expected ")" to close ${fn}(...).`, close.pos);
    if (args.length < min || args.length > max) throw new KqlError(`${fn}() takes ${min === max ? min : `${min} to ${max}`} argument${max === 1 ? '' : 's'}, not ${args.length}.`, nameTok.pos);
    return { fn, args };
  }

  /** A condition inside parentheses plus the text it was written as (for column labels). */
  private parseCondText(): { expr: Expr; text: string } {
    const start = this.peek();
    const expr = this.parseExpr();
    const text = this.source ? this.source.slice(start.pos, this.peek().pos).trim() : '';
    return { expr, text };
  }

  private parseArg(): Arg {
    return this.parseBoolOperand(false);
  }

  private parseArgToken(tok: Tok): Arg {
    switch (tok.t) {
      case 'str': this.next(); return { t: 'lit', value: { k: 'str', v: tok.v } };
      case 'num': this.next(); return { t: 'lit', value: { k: 'num', v: tok.n! } };
      case 'date': this.next(); return { t: 'lit', value: { k: 'date', v: tok.v } };
      case 'dur': this.next(); return { t: 'lit', value: { k: 'rel', n: tok.n!, unit: tok.unit as 'd' } };
      case 'regex': this.next(); return { t: 'lit', value: { k: 'regex', v: tok.v, flags: tok.flags ?? '' } };
      case 'hashtag': this.next(); return { t: 'lit', value: { k: 'tag', v: tok.v } };
      case 'mention': this.next(); return { t: 'lit', value: { k: 'mention', v: tok.v, kind: tok.kind ?? 'name', id: tok.id } };
      case 'ident': this.next(); return { t: 'field', field: { name: 'custom', custom: tok.v, raw: tok.v } };
      case 'word': {
        if (this.isCallAhead()) return this.parseCallArg();
        if (this.fnParams.has(strip(tok.v))) return this.fieldAtom();
        const k = KEYWORD_ALIASES[strip(tok.v)] ?? strip(tok.v);
        if (k === 'true' || k === 'yes') { this.next(); return { t: 'lit', value: { k: 'bool', v: true } }; }
        if (k === 'false') { this.next(); return { t: 'lit', value: { k: 'bool', v: false } }; }
        if (k === 'null') { this.next(); return { t: 'lit', value: { k: 'str', v: '' } }; }
        if (k === 'me') { this.next(); return { t: 'lit', value: { k: 'me' } }; }
        if (k === 'today' || k === 'yesterday' || k === 'tomorrow' || k === 'now') { this.next(); return { t: 'lit', value: { k: 'day', v: k } }; }
        return this.fieldAtom();
      }
      case 'star': throw new KqlError('"*" only works in select and in count(*).', tok.pos);
      default: throw new KqlError(`Unexpected "${tok.v || 'end of query'}" in the arguments.`, tok.pos);
    }
  }

  private parseProjections(): Projection[] {
    const out: Projection[] = [];
    for (;;) {
      const star = this.peek();
      if (star.t === 'star') {
        this.next();
        const except: string[] = [];
        const name = (): string => {
          const t = this.next();
          if (t.t !== 'word' && t.t !== 'str' && t.t !== 'ident') throw new KqlError('Expected a column name after "except".', t.pos);
          return t.v;
        };
        if (this.eatKw('except')) {
          if (this.peek().t === '(') {
            this.next();
            for (;;) { except.push(name()); if (this.peek().t === ',') { this.i++; continue; } break; }
            this.expectClose();
          } else except.push(name());
        }
        out.push({ field: { name: 'custom', custom: '*' }, alias: '*', star: { qualifier: star.v === '*' ? undefined : star.v, except } });
        if (this.peek().t === ',') { this.i++; continue; }
        break;
      }
      const field = this.parseValueOperand();
      let alias = fieldLabel(field);
      if (this.eatKw('as')) {
        const a = this.next();
        if (a.t !== 'str' && a.t !== 'word' && a.t !== 'ident') throw new KqlError('Expected a name after "as".', a.pos);
        alias = a.v;
      }
      out.push({ field, alias });
      if (this.peek().t === ',') { this.i++; continue; }
      break;
    }
    return out;
  }

  private parseDimensions(): Dimension[] {
    const dims: Dimension[] = [];
    for (;;) {
      dims.push(this.parseDimension());
      if (this.peek().t === ',' && this.isDimensionStart(1)) { this.i++; continue; }
      break;
    }
    return dims;
  }

  private isDimensionStart(offset: number): boolean {
    const tok = this.peek(offset);
    if (tok.t === 'ident' || tok.t === 'str') return true;
    if (tok.t !== 'word') return false;
    const k = KEYWORD_ALIASES[strip(tok.v)] ?? strip(tok.v);
    if (METRICS.has(k)) return AGG_OF_FIELD.has(k) ? this.peek(offset + 1).t !== '(' : false;
    return true;
  }

  private parseDimension(): Dimension {
    const tok = this.peek();
    if (tok.t === 'word') {
      const k = strip(tok.v);
      const unit = UNIT_ALIASES[k];
      if (unit && ['d', 'w', 'm', 'y'].includes(unit) && this.peek(1).t === '(') {
        this.next();
        this.next();
        const field = this.parseOperand();
        const close = this.next();
        if (close.t !== ')') throw new KqlError('Expected ")".', close.pos);
        if (field.name !== 'custom' && !DATE_FIELDS.has(field.name)) throw new KqlError('A time bucket needs a date field: due, created, updated, done, start (or a date column).', tok.pos);
        return { by: 'date', field, bucket: ({ d: 'day', w: 'week', m: 'month', y: 'year' } as const)[unit as 'd'] };
      }
      const name = FIELD_ALIASES[k];
      if (name === 'list' || name === 'board' || name === 'assignee' || name === 'group' || name === 'tag' || name === 'priority') {
        this.next();
        return { by: name, raw: tok.v };
      }
      if (name && DATE_FIELDS.has(name)) { this.next(); return { by: 'date', field: { name, raw: tok.v }, bucket: 'day' }; }
    }
    const field = this.parseValueOperand();
    return { by: 'field', field, label: fieldLabel(field) };
  }

  private parseMetrics(): Metric[] {
    const out: Metric[] = [];
    for (;;) {
      out.push(this.parseOneMetric());
      if (this.peek().t === ',' && this.kw(1) && METRICS.has(this.kw(1)!)) { this.i++; continue; }
      break;
    }
    return out;
  }

  private expectClose(): void {
    const close = this.next();
    if (close.t !== ')') throw new KqlError('Expected ")".', close.pos);
  }

  private expectComma(message: string): void {
    const comma = this.next();
    if (comma.t !== ',') throw new KqlError(message, comma.pos);
  }

  private parseOneMetric(): Metric {
    const tok = this.next();
    const fn = (KEYWORD_ALIASES[strip(tok.v)] ?? strip(tok.v)) as MetricFn;
    if (!METRICS.has(fn)) throw new KqlError(`Expected a metric (count, sum(x), avg(x)...) but found "${tok.v || 'end of query'}".${didYouMean(tok.v, METRICS)}`, tok.pos);
    if (fn === 'count' || fn === 'percent') {
      const distinct = (field: Field): Metric => ({ fn: 'unique', field, label: `count(distinct ${fieldLabel(field)})` });
      if (this.peek().t === '(') {
        this.next();
        if (this.peek().t === ')') this.next();
        else if (fn === 'count' && this.peek().t === 'star' && this.peek().v === '*') { this.next(); this.expectClose(); } // count(*) = count
        else if (fn === 'count' && this.isKw('distinct')) {
          this.next();
          const field = this.parseOperand();
          this.expectClose();
          return distinct(field);
        } else throw new KqlError(`${fn} takes no field${fn === 'count' ? ' (for distinct values write count(distinct x) or unique(x))' : ''}.`, this.peek().pos);
      } else if (fn === 'count' && this.isKw('unique') && this.peek(1).t === '(') {
        // `count unique(assignee)`: how many different values
        this.next();
        this.next();
        const field = this.parseOperand();
        this.expectClose();
        return distinct(field);
      }
      return { fn, label: fn };
    }
    const open = this.next();
    if (open.t !== '(') throw new KqlError(`${fn} needs a field, e.g. ${fn}(points).`, open.pos);
    if (fn === 'count_if') {
      const { expr, text } = this.parseCondText();
      this.expectClose();
      return { fn, cond: expr, label: `count_if(${text})` };
    }
    const field = this.parseOperand();
    const numeric = ['sum', 'avg', 'min', 'max', 'median', 'stddev', 'percentile', 'sum_if', 'ratio'];
    const needsNumber = (f: Field) => {
      if (numeric.includes(fn) && f.name !== 'custom' && !NUMBER_FIELDS.has(f.name)) throw new KqlError(`${fn}() needs a number field (points, comments, progress, age, a number column or a calculation).`, open.pos);
    };
    needsNumber(field);
    if (fn === 'sum_if') {
      this.expectComma('sum_if(field, condition) needs a condition, e.g. sum_if(points, done).');
      const { expr, text } = this.parseCondText();
      this.expectClose();
      return { fn, field, cond: expr, label: `sum_if(${fieldLabel(field)}, ${text})` };
    }
    if (fn === 'ratio') {
      this.expectComma('ratio(a, b) needs two fields, e.g. ratio(points, comments).');
      const field2 = this.parseOperand();
      needsNumber(field2);
      this.expectClose();
      return { fn, field, field2, label: `ratio(${fieldLabel(field)}, ${fieldLabel(field2)})` };
    }
    if (fn === 'percentile') {
      this.expectComma('percentile(field, 90) needs the percentile (0-100).');
      const p = this.next();
      if (p.t !== 'num' || p.n! < 0 || p.n! > 100) throw new KqlError('The percentile must be a number from 0 to 100.', p.pos);
      this.expectClose();
      return { fn, field, p: p.n!, label: `percentile(${fieldLabel(field)}, ${p.n})` };
    }
    let sep: string | undefined;
    if (fn === 'join' && this.peek().t === ',') { this.next(); const sp = this.next(); if (sp.t !== 'str') throw new KqlError('join(field, "separator") needs the separator as text.', sp.pos); sep = sp.v; }
    this.expectClose();
    return { fn, field, sep, label: `${fn}(${fieldLabel(field)})` };
  }

  // having: a condition over the metrics of each group ----------------------------

  private parseHaving(): Having {
    this.enter();
    let left = this.parseHavingAnd();
    for (;;) {
      this.skipContinuation();
      if (!this.isKw('or')) break;
      this.next();
      left = { t: 'or', l: left, r: this.parseHavingAnd() };
    }
    this.leave();
    return left;
  }

  private parseHavingAnd(): Having {
    let left = this.parseHavingAtom();
    for (;;) {
      this.skipContinuation();
      if (!this.isKw('and')) break;
      this.next();
      left = { t: 'and', l: left, r: this.parseHavingAtom() };
    }
    return left;
  }

  private parseHavingAtom(): Having {
    if (this.isKw('not')) {
      this.next();
      this.enter();
      const e = this.parseHavingAtom();
      this.leave();
      return { t: 'not', e };
    }
    if (this.peek().t === '(') {
      this.next();
      const e = this.parseHaving();
      this.expectClose();
      return e;
    }
    const at = this.peek();
    const metric = this.parseOneMetric();
    if (['join', 'first', 'last'].includes(metric.fn)) throw new KqlError(`"having" compares numbers; ${metric.fn}() gives text.`, at.pos);
    const number = (): number => {
      const n = this.next();
      if (n.t !== 'num') throw new KqlError(`Expected a number after "having ${metric.label}", e.g. having ${metric.label} > 5.`, n.pos);
      return n.n!;
    };
    if (this.eatKw('between')) {
      const a = number();
      this.expectKw('and');
      return { t: 'between', metric, a, b: number() };
    }
    const op = this.next();
    if (op.t !== 'op' || !['=', '!=', '<', '<=', '>', '>='].includes(op.v)) throw new KqlError(`Expected a comparison after "having ${metric.label}" (>, >=, <, <=, =, != or between).`, op.pos);
    return { t: 'cmp', metric, op: op.v as '=', value: number() };
  }

  private parseOrder(q: Query, forced?: 'asc' | 'desc'): Order {
    let dir: 'asc' | 'desc' | null = null;
    const readDir = () => { if (this.eatKw('asc')) dir = 'asc'; else if (this.eatKw('desc')) dir = 'desc'; };
    const k = this.kw();
    if (k === 'key' || k === 'label') {
      this.next();
      readDir();
      return { by: k, dir: dir ?? 'asc' };
    }
    if (this.startsMetric()) {
      const metrics = this.parseMetrics();
      readDir();
      const wanted = metrics[0].label;
      let index = q.metrics.findIndex((m) => m.label === wanted);
      if (index < 0) { q.metrics.push(metrics[0]); index = q.metrics.length - 1; }
      return { by: 'metric', metric: index, dir: forced ?? dir ?? 'desc' };
    }
    const field = this.parseValueOperand();
    readDir();
    return { by: 'expr', field, dir: forced ?? dir ?? 'asc' };
  }

  // Expressions ----------------------------------------------------------------

  private enter(): void { if (++this.depth > KQL_LIMITS.maxDepth) throw new KqlError('The condition is nested too deeply.', this.peek().pos); }
  private leave(): void { this.depth--; }

  parseExpr(): Expr {
    this.enter();
    let left = this.parseAnd();
    for (;;) {
      this.skipContinuation();
      if (!this.isKw('or')) break;
      this.next();
      left = { t: 'or', l: left, r: this.parseAnd() };
    }
    this.leave();
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    for (;;) {
      this.skipContinuation();
      if (!this.isKw('and')) break;
      this.next();
      left = { t: 'and', l: left, r: this.parseNot() };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isKw('not') && !(this.kw(1) && ['in', 'contains'].includes(this.kw(1)!))) {
      this.next();
      this.enter();
      const e = this.parseNot();
      this.leave();
      return { t: 'not', e };
    }
    return this.parseAtom();
  }

  /** Is the parenthesis ahead part of an expression that is compared (`(a - b) > 3`) rather than a group of conditions? */
  private parenIsOperand(): boolean {
    let depth = 0;
    let j = this.i;
    for (; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.t === '(') depth++;
      else if (t.t === ')') { depth--; if (depth === 0) break; } else if (t.t === 'eof') return false;
    }
    const next = this.toks[j + 1];
    if (!next) return false;
    if (next.t === 'op' || next.t === 'arith') return true;
    const k = next.t === 'word' ? (KEYWORD_ALIASES[strip(next.v)] ?? strip(next.v)) : null;
    return !!k && ['in', 'between', 'is', 'contains', 'startswith', 'endswith', 'before', 'after'].includes(k);
  }

  private parseAtom(): Expr {
    const tok = this.peek();
    if (tok.t === '(' && this.parenIsOperand()) return this.parsePredicate(this.parseOperand(), tok);
    if (tok.t === 'param' || tok.t === 'num' || (tok.t === 'arith' && tok.v === '-')) {
      const f = this.parseOperand();
      return this.followedByOperator(0) ? this.parsePredicate(f, tok) : { t: 'truthy', field: f };
    }
    if (tok.t === '(') {
      this.next();
      const e = this.parseExpr();
      const close = this.next();
      if (close.t !== ')') throw new KqlError('Expected ")".', close.pos);
      return e;
    }
    if (tok.t === 'str') {
      // "Fecha de entrega" > 2026-01-01 names a column; a lone "text" is a free-text search
      if (this.followedByOperator(1)) return this.parsePredicate(this.parseOperand(), tok);
      this.next();
      return { t: 'text', value: tok.v };
    }
    if (tok.t === 'ident') return this.parsePredicate(this.parseOperand(), tok);
    if (tok.t === 'hashtag') { this.next(); return { t: 'cmp', field: { name: 'tag' }, op: '=', value: { k: 'tag', v: tok.v } }; }
    if (tok.t === 'mention') {
      this.next();
      return { t: 'cmp', field: { name: tok.kind === 'group' ? 'group' : 'assignee' }, op: '=', value: { k: 'mention', v: tok.v, kind: tok.kind ?? 'name', id: tok.id } };
    }
    if (tok.t === 'star') throw new KqlError('"*" only works in select and in count(*).', tok.pos);
    if (tok.t !== 'word') throw new KqlError(`Unexpected "${tok.v || 'end of query'}" in the condition.`, tok.pos);

    this.assertKnownCall();
    if (this.isCallAhead()) {
      const call = this.parseOperand();
      // `has(tag, "x")` alone is a yes/no condition; `len(title) > 5` compares
      return this.followedByOperator(0) ? this.parsePredicate(call, tok) : { t: 'truthy', field: call };
    }

    const word = strip(tok.v);
    if (this.fnParams.has(word) || this.peek(1).t === 'arith') {
      const f = this.parseOperand();
      return this.followedByOperator(0) ? this.parsePredicate(f, tok) : { t: 'truthy', field: f };
    }
    const field = this.tryField();
    // `done`, `overdue`, `asignado`... alone are flags; followed by an operator they are fields ("done in last 30d").
    if (FLAGS[word] && !(field && this.followedByOperator(1))) {
      this.next();
      return { t: 'flag', name: FLAGS[word] };
    }
    if (field) {
      this.next();
      return this.parsePredicate(field, tok);
    }
    // Any other word followed by an operator names a column (Estado = "Pagado"); alone it is a text search.
    if (this.followedByOperator(1)) return this.parsePredicate(this.parseOperand(), tok);
    this.next();
    return { t: 'text', value: tok.v };
  }

  private parsePredicate(field: Field, fieldTok: Tok): Expr {
    // field is [not] empty
    if (this.isKw('is')) {
      this.next();
      const negate = this.eatKw('not');
      if (!this.eatKw('null')) this.expectKw('empty');
      return { t: 'empty', field, negate };
    }
    if (this.isKw('between')) {
      this.next();
      const a = this.parseValue(field);
      this.expectKw('and');
      return { t: 'between', field, a, b: this.parseValue(field) };
    }
    if (this.isKw('not') && (this.isKw('in', 1) || this.isKw('contains', 1))) {
      this.next();
      if (this.eatKw('contains')) return { t: 'cmp', field, op: 'not contains', value: this.parseValue(field) };
      this.next();
      return this.parseIn(field, true);
    }
    if (this.isKw('in')) {
      this.next();
      const win = this.tryWindow();
      if (win) {
        if (!DATE_FIELDS.has(field.name) && field.name !== 'custom') throw new KqlError(`"${fieldTok.v}" is not a date field, so it has no time window.`, fieldTok.pos);
        return { t: 'window', field, window: win };
      }
      return this.parseIn(field, false);
    }
    if (this.isKw('before') || this.isKw('after')) {
      const op: CmpOp = this.kw() === 'before' ? '<' : '>';
      this.next();
      return { t: 'cmp', field, op, value: this.parseValue(field) };
    }
    if (this.isKw('contains') || this.isKw('startswith') || this.isKw('endswith')) {
      const op = this.kw() as CmpOp;
      this.next();
      return { t: 'cmp', field, op, value: this.parseValue(field) };
    }
    const opTok = this.peek();
    if (opTok.t === 'op') {
      this.next();
      const op = opTok.v as CmpOp;
      if (op === '~' || op === '!~') {
        const rx = this.next();
        if (rx.t === 'regex') return { t: 'cmp', field, op, value: { k: 'regex', v: rx.v, flags: rx.flags ?? '' } };
        if (rx.t === 'str' || rx.t === 'word') return { t: 'cmp', field, op, value: { k: 'regex', v: rx.v, flags: '' } };
        throw new KqlError('Expected a pattern after ~ (e.g. /^bug/ or "bug").', rx.pos);
      }
      if ((op === '=' || op === '!=') && this.peek().t === 'word' && strip(this.peek().v) === 'null') { this.next(); return { t: 'empty', field, negate: op === '!=' }; }
      // `due = today`, `due < today`, `due = last 30d` read naturally
      const win = op === '=' ? this.tryWindow() : null;
      if (win) return { t: 'window', field, window: win };
      const value = this.parseValue(field);
      if (field.name === 'completed' && value.k === 'bool' && (op === '=' || op === '!=')) {
        const isDone: Expr = { t: 'flag', name: 'done' };
        return (op === '=') === value.v ? isDone : { t: 'not', e: isDone };
      }
      return { t: 'cmp', field, op, value };
    }
    // `[Activo]` / a column alone: true when it holds a true-ish value
    if (field.name === 'custom' && !field.call) return { t: 'truthy', field };
    // `done` / `due` alone as a field: "has a value"
    if (field.name === 'completed') return { t: 'flag', name: 'done' };
    throw new KqlError(`Expected a comparison after "${fieldTok.v}" (=, !=, ~, contains, in, between, is empty...).`, this.peek().pos);
  }

  private parseIn(field: Field, negate: boolean): Expr {
    const open = this.next();
    if (open.t !== '(') throw new KqlError('Expected a list in parentheses after "in", e.g. in ("a", "b").', open.pos);
    const values: Value[] = [];
    while (this.peek().t !== ')') {
      if (this.atEnd()) throw new KqlError('Expected ")".', this.peek().pos);
      values.push(this.parseValue(field));
      if (this.peek().t === ',') this.next();
    }
    this.next();
    if (values.length === 0) throw new KqlError('The list is empty.', open.pos);
    return { t: 'in', field, values, negate };
  }

  private tryWindow(): TimeWindow | null {
    const k = this.kw();
    if (k === 'today' || k === 'yesterday' || k === 'tomorrow') { this.next(); return { w: 'day', which: k }; }
    if (k === 'last' || k === 'next') {
      const nextTok = this.peek(1);
      if (nextTok.t === 'dur') { this.next(); this.next(); return { w: 'rolling', dir: k, n: Math.abs(nextTok.n!), unit: nextTok.unit as 'd' }; }
      if (nextTok.t === 'num' && this.peek(2).t === 'word' && UNIT_ALIASES[strip(this.peek(2).v)]) {
        this.next(); this.next(); const u = this.next();
        return { w: 'rolling', dir: k, n: Math.abs(nextTok.n!), unit: UNIT_ALIASES[strip(u.v)] };
      }
      const unit = nextTok.t === 'word' ? UNIT_ALIASES[strip(nextTok.v)] : undefined;
      if (unit && unit !== 'h') { this.next(); this.next(); return { w: 'calendar', which: k, unit }; }
      return null;
    }
    if (k === 'this') {
      const nextTok = this.peek(1);
      const unit = nextTok.t === 'word' ? UNIT_ALIASES[strip(nextTok.v)] : undefined;
      if (unit && unit !== 'h') { this.next(); this.next(); return { w: 'calendar', which: 'this', unit }; }
    }
    return null;
  }

  parseValue(field: Field): Value {
    const first = this.peek();
    if (first.t === '(' || (first.t === 'arith' && first.v === '-')) return valueFromArg(this.parseConcat(false)) as Value;
    const start = this.i;
    const v = this.parseValueCore(field);
    if (this.peek().t === 'arith') { this.i = start; return valueFromArg(this.parseConcat(false)) as Value; } // `Monto > Costo * 2`
    return v;
  }

  private parseValueCore(field: Field): Value {
    this.assertKnownCall();
    if (this.peek().t === 'param') return valueFromArg(this.expandParam()) as Value;
    if (this.isCallAhead()) return valueFromArg(this.parseCallArg()) as Value;
    const t0 = this.peek();
    if (t0.t === 'word' && this.fnParams.has(strip(t0.v))) {
      this.next();
      const a = this.paramArg(strip(t0.v), t0);
      // a table function is read again with its arguments: a value argument is used as written
      return this.bindings ? (valueFromArg(a) as Value) : { k: 'call', call: { fn: 'coalesce', args: [a] } };
    }
    const tok = this.next();
    switch (tok.t) {
      case 'str': return { k: 'str', v: tok.v };
      case 'num': return { k: 'num', v: tok.n! };
      case 'date': return { k: 'date', v: tok.v };
      case 'hashtag': return { k: 'tag', v: tok.v };
      case 'ident': return { k: 'call', call: { fn: 'coalesce', args: [{ t: 'field', field: { name: 'custom', custom: tok.v, raw: tok.v } }], colref: true } }; // [Costo] is always a column
      case 'mention': return { k: 'mention', v: tok.v, kind: tok.kind ?? 'name', id: tok.id };
      case 'dur': {
        if (!/^[+-]/.test(tok.v)) throw new KqlError(`Use a sign for a relative date: +${tok.v} (future) or -${tok.v} (past). For ranges write "in last ${tok.v}".`, tok.pos);
        return { k: 'rel', n: tok.n!, unit: tok.unit as 'd' };
      }
      case 'word': {
        const k = KEYWORD_ALIASES[strip(tok.v)] ?? strip(tok.v);
        if (k === 'me' || k === 'yo' || k === 'mi') return { k: 'me' };
        if (k === 'today' || k === 'yesterday' || k === 'tomorrow' || k === 'now') return { k: 'day', v: k };
        if (k === 'true' || k === 'yes') return { k: 'bool', v: true };
        if (k === 'false') return { k: 'bool', v: false };
        return { k: 'word', v: tok.v };
      }
      default:
        throw new KqlError(tok.t === 'star' ? '"*" only works in select and in count(*).' : `Expected a value but found "${tok.v || 'end of query'}".`, tok.pos);
    }
  }
}

/** The parameters and functions a script declares, for a UI that lists them. */
export function describeKqlDeclarations(source: string): KqlDeclarations {
  const parser = new Parser(tokenize(source), source);
  parser.parseScript(true);
  return parser.declarations;
}

/**
 * Every `fn` a script declares, for the visual editor's function dialog: name, parameters (a parameter used as a source
 * is a `table`, any other a `value`), body, `scalar` (returns a value) or `table` (returns a table) and the declaration as written.
 * Queries of the script are not run; one that does not parse is skipped, but a broken `fn` is an error with its position.
 */
export function parseFunctionDefinitions(script: string): KqlFunctionDefinition[] {
  const parser = new Parser(tokenize(script), script, true);
  parser.parseScript(true);
  return parser.definitions;
}

/** Runnable examples of table functions (the guide shows the same ones). */
export const KQL_FUNCTION_EXAMPLES: Array<{ title: string; script: string }> = [
  { title: 'Clean one table with a threshold', script: 'fn limpiar(t, minimo) = from t where Monto >= minimo select Cliente, Monto;\nfrom limpiar(rows of "Ventas", 500) select * order by Monto desc' },
  { title: 'Cross two sources', script: 'fn cruzar(a, b) = from a join b as b on Cliente = b.Nombre select Cliente, b.Pais as "Pais", Monto;\nfrom cruzar(rows of "Ventas", rows of "Clientes") select * order by Cliente' },
  { title: 'Group a cleaned table, then join', script: 'fn limpiar(t, minimo) = from t where Monto >= minimo select Cliente, Monto;\nlet pagadas = rows of "Ventas" where Estado = "Pagado"\nfrom limpiar(pagadas, 100) join rows of "Clientes" as c on Cliente = c.Nombre select Cliente, c.Pais, Monto' },
  { title: 'Nested calls', script: 'fn limpiar(t, minimo) = from t where Monto >= minimo select Cliente, Monto;\nfn top2(t) = from t select * order by Monto desc limit 2;\nfrom top2(limpiar(rows of "Ventas", 100)) select *' },
];

export function parseKqlScript(source: string): Statement[] {
  return new Parser(tokenize(source), source).parseScript();
}

/** A condition only (what a filter box accepts): `done and assignee = me`. */
export function parseKqlFilter(source: string): Expr {
  const parser = new Parser(tokenize(source), source);
  parser.eatKw('where');
  const expr = parser.parseExpr();
  if (!parser.atEnd()) throw new KqlError(`Unexpected "${parser.peek().v}".${parser.peek().t === 'word' ? didYouMean(parser.peek().v, ['and', 'or', 'not', 'in', 'between', 'contains', 'startswith', 'endswith', 'empty']) : ''}`, parser.peek().pos);
  return expr;
}

/** Which data a script needs, so a caller can load only that: the cards, named sources, tables (rows of ...). */
export function describeKqlSources(source: string | Statement[]): { cards: boolean; sources: string[]; tables: string[] } {
  const statements = typeof source === 'string' ? parseKqlScript(source) : source;
  const defined = new Set<string>();
  const sources = new Set<string>();
  const tables = new Set<string>();
  let cards = false;
  for (const st of statements) {
    for (const s of [st.query.source, ...st.query.unions, ...st.query.joins.map((j) => j.source)]) {
      if (s.kind === 'cards') cards = true;
      else if (s.kind === 'rows') tables.add(s.ref);
      else if (s.kind === 'name' && !defined.has(s.name)) sources.add(s.name);
    }
    if (st.kind === 'let') defined.add(st.name);
  }
  return { cards, sources: [...sources], tables: [...tables] };
}

// ── Dates ────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
/** Monday as the first day of the week. */
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getUTCDay() + 6) % 7));
const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const startOfYear = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));

function shift(d: Date, n: number, unit: 'h' | 'd' | 'w' | 'm' | 'y'): Date {
  if (unit === 'h') return new Date(d.getTime() + n * 3_600_000);
  if (unit === 'd') return addDays(d, n);
  if (unit === 'w') return addDays(d, n * 7);
  if (unit === 'm') return addMonths(d, n);
  return addMonths(d, n * 12);
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isFinite(t) ? new Date(t) : null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function bucketKey(d: Date, bucket: Bucket): string {
  if (bucket === 'day') return isoDay(d);
  if (bucket === 'week') return isoDay(startOfWeek(d));
  if (bucket === 'month') return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  return String(d.getUTCFullYear());
}

function windowRange(w: TimeWindow, now: Date): [number, number] {
  const today = startOfDay(now);
  if (w.w === 'day') {
    const start = w.which === 'today' ? today : w.which === 'yesterday' ? addDays(today, -1) : addDays(today, 1);
    return [start.getTime(), start.getTime() + DAY - 1];
  }
  if (w.w === 'rolling') return w.dir === 'last' ? [shift(now, -w.n, w.unit).getTime(), now.getTime()] : [now.getTime(), shift(now, w.n, w.unit).getTime()];
  const offset = w.which === 'this' ? 0 : w.which === 'last' ? -1 : 1;
  if (w.unit === 'd') { const s = addDays(today, offset); return [s.getTime(), s.getTime() + DAY - 1]; }
  if (w.unit === 'w') { const s = addDays(startOfWeek(now), offset * 7); return [s.getTime(), s.getTime() + 7 * DAY - 1]; }
  if (w.unit === 'm') { const s = addMonths(startOfMonth(now), offset); return [s.getTime(), addMonths(s, 1).getTime() - 1]; }
  const s = addMonths(startOfYear(now), offset * 12);
  return [s.getTime(), addMonths(s, 12).getTime() - 1];
}

// ── Evaluation ───────────────────────────────────────────────────────────────

const norm = (s: unknown) => strip(String(s ?? '')).replace(/\s+/g, ' ').trim();

let activeWarnings: string[] | null = null;
const warn = (message: string): void => { if (activeWarnings && !activeWarnings.includes(message)) activeWarnings.push(message); };

/** One regular-expression execution of the budget; the query aborts above KQL_LIMITS.maxRegexTests. */
function regexTick(): void {
  const rt = activeRuntime;
  if (rt && ++rt.regexTests > KQL_LIMITS.maxRegexTests) throw new KqlError(`This query ran more than ${KQL_LIMITS.maxRegexTests} regular-expression tests; narrow it with where or simplify the pattern.`);
}

/** The text a regex looks at: at most KQL_LIMITS.maxRegexInput characters (longer values are cut, with a warning). */
function clipForRegex(text: string): string {
  if (text.length <= KQL_LIMITS.maxRegexInput) return text;
  warn(`A value longer than ${KQL_LIMITS.maxRegexInput} characters was cut for matching.`);
  return text.slice(0, KQL_LIMITS.maxRegexInput);
}

function safeRegex(pattern: string, flags: string, caseInsensitiveByDefault = true): RegExp {
  if (pattern.length > KQL_LIMITS.maxRegex) throw new KqlError(`The pattern is too long (max ${KQL_LIMITS.maxRegex} characters).`);
  // Heuristics against patterns that can take exponential time: backreferences, nested repetitions such as (a+)+ or (.*){20},
  // more than N repeated groups, and repeated groups whose alternatives overlap such as (a|aa)+.
  if (/\\[1-9]|\\k</.test(pattern)) throw new KqlError('Backreferences (\\1) are not allowed in patterns.');
  if ((pattern.match(/\)(?:[+*?]|\{\d)/g) ?? []).length > KQL_LIMITS.maxRegexGroups) throw new KqlError(`That pattern repeats too many groups (max ${KQL_LIMITS.maxRegexGroups}).`);
  for (const m of pattern.matchAll(/\(((?:\?:)?(?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*)\)(?:[+*]|\{\d*,\})/g)) {
    const starts = m[1].replace(/^\?:/, '').split('|').map((b) => (b.startsWith('\\') ? b.slice(0, 2) : b.charAt(0)));
    if (starts.some((x) => x === '.' || x === '[' || x === '') || new Set(starts).size < starts.length) throw new KqlError('That pattern repeats alternatives that overlap, such as (a|aa)+, which can hang the search.');
  }
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*]|\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\{\d*,?\d*\}/.test(pattern)) {
    throw new KqlError('That pattern has nested repetitions, which are not allowed (they can hang the search).');
  }
  const clean = [...new Set((caseInsensitiveByDefault ? flags + 'i' : flags).split(''))].filter((f) => 'imsug'.includes(f)).join('');
  try {
    return new RegExp(pattern, clean);
  } catch {
    throw new KqlError(`Invalid regular expression: ${pattern}`);
  }
}

interface Runtime {
  now: Date;
  ctx: KqlContext;
  groupsByKey: Map<string, KqlGroup>;
  usersByKey: Map<string, KqlUser>;
  userGroups: Map<string, string[]>;
  regexCache: Map<string, RegExp>;
  /** Regex executions of the query being run (budget: KQL_LIMITS.maxRegexTests). */
  regexTests: number;
  actorCache: Map<Value, Set<string>>;
  groupCache: Map<Value, Set<string>>;
}

function buildRuntime(ctx: KqlContext): Runtime {
  const groupsByKey = new Map<string, KqlGroup>();
  const userGroups = new Map<string, string[]>();
  for (const g of ctx.groups ?? []) {
    for (const key of [g.id, norm(g.slug), norm(g.name)]) groupsByKey.set(key, g);
    for (const m of g.memberIds) userGroups.set(m, [...(userGroups.get(m) ?? []), g.id]);
  }
  const usersByKey = new Map<string, KqlUser>();
  for (const u of ctx.users ?? []) for (const key of [u.id, norm(u.name), norm(u.alias), norm(u.email)]) if (key) usersByKey.set(key, u);
  return { now: ctx.now ?? new Date(), ctx, groupsByKey, usersByKey, userGroups, regexCache: new Map(), regexTests: 0, actorCache: new Map(), groupCache: new Map() };
}

function valueText(v: Value | { k: 'regex'; v: string; flags: string }): string {
  switch (v.k) {
    case 'str': case 'word': case 'tag': case 'date': case 'regex': return v.v;
    case 'num': return String(v.v);
    case 'mention': return v.v;
    case 'bool': return v.v ? 'true' : 'false';
    case 'me': return 'me';
    case 'day': return v.v;
    case 'rel': return `${v.n}${v.unit}`;
    case 'call': return fieldLabel({ name: 'custom', call: v.call });
  }
}

/** The people a value points at: `me`, a user mention, a name/email, or every member of a group. */
function actorIds(v: Value, rt: Runtime): Set<string> {
  const cached = rt.actorCache.get(v);
  if (cached) return cached;
  const ids = new Set<string>();
  if (v.k === 'me') { if (rt.ctx.me) ids.add(rt.ctx.me); }
  else if (v.k === 'mention' && v.id && v.kind === 'user') ids.add(v.id);
  else if (v.k === 'mention' && v.id && v.kind === 'group') rt.groupsByKey.get(v.id)?.memberIds.forEach((m) => ids.add(m));
  else {
    const key = norm(valueText(v));
    const user = rt.usersByKey.get(key) ?? rt.usersByKey.get(valueText(v));
    if (user) ids.add(user.id);
    else if (!/^@/.test(key)) {
      const group = rt.groupsByKey.get(key) ?? rt.groupsByKey.get(valueText(v));
      if (group && (v.k === 'mention' || v.k === 'word' || v.k === 'str')) group.memberIds.forEach((m) => ids.add(m));
      if (!group && !user) ids.add(valueText(v)); // maybe the raw id
    }
  }
  rt.actorCache.set(v, ids);
  return ids;
}

function groupIdsOf(v: Value, rt: Runtime): Set<string> {
  const cached = rt.groupCache.get(v);
  if (cached) return cached;
  const ids = new Set<string>();
  const group = (v.k === 'mention' && v.id && rt.groupsByKey.get(v.id)) || rt.groupsByKey.get(norm(valueText(v))) || rt.groupsByKey.get(valueText(v));
  if (group) ids.add(group.id);
  rt.groupCache.set(v, ids);
  return ids;
}

function cardGroupIds(card: KqlCard, rt: Runtime): string[] {
  const out = new Set<string>(card.groupIds ?? []);
  for (const a of card.assignees ?? []) for (const g of rt.userGroups.get(a) ?? []) out.add(g);
  return [...out];
}

function userLabel(id: string, rt: Runtime): string {
  const u = rt.usersByKey.get(id);
  return (u && (u.alias || u.name || u.email)) || id;
}

function customValue(card: KqlCard, field: Field): string | number | boolean | string[] | null {
  if (field.call) return evalCall(field.call, card);
  const fields = card.fields ?? {};
  const key = Object.keys(fields).find((k) => norm(k) === norm(field.custom));
  return key === undefined ? null : fields[key];
}

/** Numbers computed from the card itself: age (days since created), cycle (created -> completed), overdue_days... */
function derivedNumber(card: KqlCard, name: FieldName): number | null {
  const now = runtimeNow().getTime();
  const days = (from: number, to: number) => Math.floor((to - from) / DAY);
  switch (name) {
    case 'age': { const d = parseDate(card.created); return d ? Math.max(0, days(d.getTime(), now)) : null; }
    case 'cycle': {
      const a = parseDate(card.created);
      const b = parseDate(card.completed);
      return a && b && b.getTime() >= a.getTime() ? days(a.getTime(), b.getTime()) : null;
    }
    case 'overdue_days': {
      const due = parseDate(card.due);
      return due && !card.done && due.getTime() < now ? days(due.getTime(), now) : null;
    }
    case 'title_len': return String(card.title ?? '').length;
    case 'tag_count': return (card.tags ?? []).length;
    case 'assignee_count': return (card.assignees ?? []).length;
    default: return null;
  }
}

/** "Board / List": a readable way to tell apart lists with the same name. */
function cardPath(card: KqlCard): string | null {
  if (card.board && card.list) return `${card.board} / ${card.list}`;
  return card.list || card.board || null;
}

function numberOf(card: KqlCard, field: Field): number | null {
  if (DERIVED_FIELDS.has(field.name)) return derivedNumber(card, field.name);
  const raw = field.name === 'custom' ? customValue(card, field) : card[field.name as 'points' | 'comments' | 'progress'];
  if (raw === null || raw === undefined || raw === '' || Array.isArray(raw)) return null;
  return toNumber(raw);
}

function dateOf(card: KqlCard, field: Field): Date | null {
  if (field.name === 'custom') return parseDate(String(customValue(card, field) ?? ''));
  return parseDate(card[field.name as 'due'] as string | null | undefined);
}

function stringsOf(card: KqlCard, field: Field, rt: Runtime): string[] {
  switch (field.name) {
    case 'tag': return card.tags ?? [];
    case 'assignee': return (card.assignees ?? []).flatMap((id) => { const u = rt.usersByKey.get(id); return [id, userLabel(id, rt), u?.email ?? ''].filter(Boolean); });
    case 'group': return cardGroupIds(card, rt).flatMap((id) => { const g = rt.groupsByKey.get(id); return g ? [g.id, g.slug, g.name] : [id]; });
    case 'custom': { const v = customValue(card, field); return v === null ? [] : (Array.isArray(v) ? v.map(String) : [String(v)]).filter((x) => x !== ''); }
    case 'path': { const p = cardPath(card); return p ? [p] : []; }
    default: { const v = card[field.name as 'title']; return v === null || v === undefined || v === '' ? [] : [String(v)]; }
  }
}

function valueToTime(v: Value, rt: Runtime): number | null {
  switch (v.k) {
    case 'date': return parseDate(v.v)?.getTime() ?? null;
    case 'rel': return shift(rt.now, v.n, v.unit).getTime();
    case 'day': return (v.v === 'now' ? rt.now : v.v === 'today' ? startOfDay(rt.now) : v.v === 'yesterday' ? addDays(startOfDay(rt.now), -1) : addDays(startOfDay(rt.now), 1)).getTime();
    case 'str': case 'word': return parseDate(v.v)?.getTime() ?? null;
    default: return null;
  }
}

function compareNumbers(a: number, op: CmpOp, b: number): boolean {
  switch (op) {
    case '=': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    default: throw new KqlError(`The operator "${op}" does not work on numbers or dates.`);
  }
}

function matchesString(candidate: string, op: CmpOp, v: Value | { k: 'regex'; v: string; flags: string }, rt: Runtime): boolean {
  if (op === '~' || op === '!~') {
    const rx = v as { v: string; flags: string };
    const key = `${rx.v}/${(rx as { flags?: string }).flags ?? ''}`;
    let re = rt.regexCache.get(key);
    if (!re) { re = safeRegex(rx.v, (rx as { flags?: string }).flags ?? ''); rt.regexCache.set(key, re); }
    regexTick();
    re.lastIndex = 0;
    return re.test(clipForRegex(candidate));
  }
  const a = norm(candidate);
  const b = norm(valueText(v));
  switch (op) {
    case '=': case '!=': return a === b;
    case 'contains': case 'not contains': return a.includes(b);
    case 'startswith': return a.startsWith(b);
    case 'endswith': return a.endsWith(b);
    default: throw new KqlError(`The operator "${op}" does not work on text. Use =, !=, contains, startswith, endswith or ~.`);
  }
}

/** A calculation on the right of a comparison becomes a plain value for this record (null: it has no value). */
function resolveValue(v: Value | RegexLit, card: KqlCard): Value | RegexLit | null {
  if (v.k !== 'call') return v;
  const cell = evalCall(v.call, card);
  if (cell === null) return null;
  if (typeof cell === 'number') return { k: 'num', v: cell };
  if (typeof cell === 'boolean') return { k: 'bool', v: cell };
  const text = Array.isArray(cell) ? cell.join(', ') : cell;
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? { k: 'date', v: text } : { k: 'str', v: text };
}

function evalCmp(card: KqlCard, field: Field, op: CmpOp, raw: Value | { k: 'regex'; v: string; flags: string }, rt: Runtime): boolean {
  if (raw.k === 'call' && raw.call.colref) return compareColumns(card, field, op, evalCall(raw.call, card));
  const negated = op === '!=' || op === '!~' || op === 'not contains';
  const resolved = resolveValue(raw, card);
  if (!resolved) return negated;
  const v = resolved;
  if (DATE_FIELDS.has(field.name) || (field.name === 'custom' && ['date', 'rel', 'day'].includes(v.k))) {
    const d = dateOf(card, field);
    const target = valueToTime(v as Value, rt);
    if (target === null) throw new KqlError(v.k === 'word' ? `Unexpected "${v.v}": expected a date.` : `"${valueText(v)}" is not a valid date.`);
    if (!d) return negated;
    if (op === '=' || op === '!=') {
      const sameDay = startOfDay(d).getTime() === startOfDay(new Date(target)).getTime();
      return op === '=' ? sameDay : !sameDay;
    }
    return compareNumbers(d.getTime(), op, target);
  }
  if (NUMBER_FIELDS.has(field.name) || (field.name === 'custom' && v.k === 'num')) {
    const n = numberOf(card, field);
    const target = v.k === 'num' ? v.v : Number(valueText(v));
    if (!Number.isFinite(target)) throw new KqlError(v.k === 'word' ? `Unexpected "${v.v}": expected a number.` : `"${valueText(v)}" is not a number.`);
    if (n === null) return op === '!=';
    return compareNumbers(n, op, target);
  }
  if (field.name === 'assignee' && (op === '=' || op === '!=')) {
    const targets = actorIds(v as Value, rt);
    const hit = (card.assignees ?? []).some((id) => targets.has(id));
    return op === '=' ? hit : !hit;
  }
  if (field.name === 'group' && (op === '=' || op === '!=')) {
    const targets = groupIdsOf(v as Value, rt);
    const hit = cardGroupIds(card, rt).some((id) => targets.has(id));
    return op === '=' ? hit : !hit;
  }
  if (field.name === 'custom' && v.k === 'bool') {
    const raw = customValue(card, field);
    const truthy = raw === true || /^(true|yes|si|sí|1|x)$/i.test(String(raw ?? ''));
    return op === '!=' ? truthy !== v.v : truthy === v.v;
  }
  // `list = "Tablero QA / En QA"`: the qualified path picks one board's list; a plain name keeps matching any list with it
  const qualified = field.name === 'list' && !field.call && (op === '=' || op === '!=') && valueText(v).includes('/');
  const candidates = qualified ? [...stringsOf(card, field, rt), ...(cardPath(card) ? [cardPath(card)!] : [])] : stringsOf(card, field, rt);
  if (candidates.length === 0) return negated;
  const any = candidates.some((c) => matchesString(c, negated ? (op === '!=' ? '=' : op === '!~' ? '~' : 'contains') : op, v, rt));
  return negated ? !any : any;
}

function evalExpr(e: Expr, card: KqlCard, rt: Runtime): boolean {
  switch (e.t) {
    case 'and': return evalExpr(e.l, card, rt) && evalExpr(e.r, card, rt);
    case 'or': return evalExpr(e.l, card, rt) || evalExpr(e.r, card, rt);
    case 'not': return !evalExpr(e.e, card, rt);
    case 'cmp': return evalCmp(card, e.field, e.op, e.value, rt);
    case 'in': {
      const hit = e.values.some((v) => evalCmp(card, e.field, '=', v, rt));
      return e.negate ? !hit : hit;
    }
    case 'between': {
      const lo = resolveValue(e.a, card) as Value | null;
      const hi = resolveValue(e.b, card) as Value | null;
      if (!lo || !hi) return false;
      if (NUMBER_FIELDS.has(e.field.name) || lo.k === 'num') return evalCmp(card, e.field, '>=', lo, rt) && evalCmp(card, e.field, '<=', hi, rt);
      const d = dateOf(card, e.field);
      const a = valueToTime(lo, rt);
      let b = valueToTime(hi, rt);
      if (a === null || b === null) throw new KqlError('"between" needs two dates or two numbers.');
      if (hi.k === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(hi.v)) b += DAY - 1; // inclusive end day
      return !!d && d.getTime() >= a && d.getTime() <= b;
    }
    case 'truthy': return truthyCell(valueOfField(card, e.field));
    case 'empty': {
      let empty: boolean;
      if (DATE_FIELDS.has(e.field.name)) empty = !dateOf(card, e.field);
      else if (NUMBER_FIELDS.has(e.field.name)) empty = numberOf(card, e.field) === null;
      else empty = stringsOf(card, e.field, rt).length === 0;
      return e.negate ? !empty : empty;
    }
    case 'window': {
      const d = dateOf(card, e.field);
      if (!d) return false;
      const [from, to] = windowRange(e.window, rt.now);
      return d.getTime() >= from && d.getTime() <= to;
    }
    case 'flag': {
      switch (e.name) {
        case 'done': return !!card.done;
        case 'open': return !card.done;
        case 'overdue': { const d = dateOf(card, { name: 'due' }); return !card.done && !!d && d.getTime() < rt.now.getTime(); }
        case 'unassigned': return (card.assignees ?? []).length === 0;
        case 'assigned': return (card.assignees ?? []).length > 0;
        case 'archived': return !!card.archived;
      }
      return false;
    }
    case 'text': {
      const needle = norm(e.value);
      return [card.title, card.description, ...(card.tags ?? [])].some((s) => norm(s).includes(needle));
    }
  }
}

// ── Calls: text, number and date transformations ─────────────────────────────

export type Cell = string | number | boolean | string[] | null;

let activeRuntime: Runtime | null = null;
function withRuntime<T>(rt: Runtime, fn: () => T): T {
  const previous = activeRuntime;
  activeRuntime = rt;
  try {
    return fn();
  } finally {
    activeRuntime = previous;
  }
}
const runtimeNow = () => activeRuntime?.now ?? new Date();

const cellText = (c: unknown): string => (c === null || c === undefined ? '' : Array.isArray(c) ? c.join(', ') : c instanceof RegExp ? c.source : String(c));
const cellEmpty = (c: unknown): boolean => c === null || c === undefined || c === '' || (Array.isArray(c) && c.length === 0);

/** "$1,234.50", "1.234,50", "12,5", "1 200" -> number. Anything without digits -> null. */
export function parseLooseNumber(raw: string): number | null {
  let s = raw.replace(/[^\d.,\-+]/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length !== 3 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (s.split('.').length > 2) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toNumber(c: unknown): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  if (typeof c === 'boolean') return c ? 1 : 0;
  if (c === null || c === undefined || Array.isArray(c) || c instanceof RegExp) return null;
  return parseLooseNumber(String(c));
}

/** Removes markdown, KQL/Killio mention tokens and HTML: "**Hola** @[user:1:Ana] [x](http://y)" -> "Hola Ana x". */
export function stripText(input: string): string {
  return input
    .replace(/@\[[a-z]+:[^:\]]+:([^\]]*)\]/gi, '$1')
    .replace(/[$#]\[[^\]]*\]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[`*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(c: unknown, format: string): string | null {
  const d = c instanceof Date ? c : parseDate(cellText(c));
  if (!d) return null;
  return format.replace(/yyyy|yy|MMM|MM|dd|HH|mm|ss/g, (t) => {
    switch (t) {
      case 'yyyy': return String(d.getUTCFullYear());
      case 'yy': return String(d.getUTCFullYear()).slice(2);
      case 'MMM': return MONTHS[d.getUTCMonth()];
      case 'MM': return pad(d.getUTCMonth() + 1);
      case 'dd': return pad(d.getUTCDate());
      case 'HH': return pad(d.getUTCHours());
      case 'mm': return pad(d.getUTCMinutes());
      default: return pad(d.getUTCSeconds());
    }
  });
}

/** Compiles a pattern once per run (same safety checks as `~`). */
function cachedRegex(pattern: string, flags: string, caseInsensitive: boolean): RegExp {
  const key = `${caseInsensitive ? 'i' : 'c'}:${flags}:${pattern}`;
  const hit = activeRuntime?.regexCache.get(key);
  if (hit) return hit;
  const re = safeRegex(pattern, flags, caseInsensitive);
  activeRuntime?.regexCache.set(key, re);
  return re;
}

function truthyCell(c: unknown): boolean {
  if (typeof c === 'boolean') return c;
  if (typeof c === 'number') return c !== 0;
  if (Array.isArray(c)) return c.length > 0;
  if (c === null || c === undefined) return false;
  const t = String(c).trim();
  return t !== '' && !/^(false|no|0|null)$/i.test(t);
}

function argValue(arg: Arg, card: KqlCard): Cell | RegExp {
  if (arg.t === 'field') return valueOfField(card, arg.field);
  if (arg.t === 'cond') return evalExpr(arg.expr, card, activeRuntime!);
  const v = arg.value;
  switch (v.k) {
    case 'regex': return cachedRegex(v.v, v.flags, false);
    case 'call': return evalCall(v.call, card);
    case 'num': return v.v;
    case 'bool': return v.v;
    case 'rel': return shift(runtimeNow(), v.n, v.unit).toISOString();
    case 'day': return (v.v === 'now' ? runtimeNow() : v.v === 'today' ? startOfDay(runtimeNow()) : v.v === 'yesterday' ? addDays(startOfDay(runtimeNow()), -1) : addDays(startOfDay(runtimeNow()), 1)).toISOString();
    case 'me': return activeRuntime?.ctx.me ?? null;
    default: return v.v;
  }
}

// ── Window functions (computed once per query over the ordered records) ──────

const WINDOW_FNS = new Set(['rownum', 'indice', 'fill_down', 'fill_up', 'lag', 'lead', 'running_sum', 'cumsum', 'running_count']);
let activeWindows: Map<Call, Map<KqlCard, Cell>> | null = null;

function windowValue(call: Call, card: KqlCard): Cell {
  const map = activeWindows?.get(call);
  if (!map || !map.has(card)) throw new KqlError(`${call.fn}() works over the ordered rows: use it in select, group by${call.fn === 'rownum' || call.fn === 'indice' ? ', where or order by' : ''}.`);
  return map.get(card) ?? null;
}

/** The value of a window function for every record of `list`, in order (O(n)). */
function computeWindow(call: Call, list: KqlCard[]): Map<KqlCard, Cell> {
  const out = new Map<KqlCard, Cell>();
  const fn = call.fn;
  const values = (i: number): Cell[] => list.map((c) => { const v = argValue(call.args[i], c); return v instanceof RegExp ? v.source : v; });
  const literal = (i: number, fallback: number): number => (call.args.length > i && list.length > 0 ? toNumber(argValue(call.args[i], list[0])) ?? fallback : fallback);
  if (fn === 'rownum' || fn === 'indice') {
    const start = literal(0, 1);
    list.forEach((c, i) => out.set(c, start + i));
  } else if (fn === 'running_count') {
    list.forEach((c, i) => out.set(c, i + 1));
  } else if (fn === 'fill_down' || fn === 'fill_up') {
    const v = values(0);
    const part = call.args.length > 1 ? values(1).map((p) => norm(cellText(p))) : null;
    const last = new Map<string, Cell>();
    const visit = (i: number) => {
      const key = part ? part[i] : '';
      if (cellEmpty(v[i])) out.set(list[i], last.get(key) ?? null);
      else { last.set(key, v[i]); out.set(list[i], v[i]); }
    };
    if (fn === 'fill_down') for (let i = 0; i < list.length; i++) visit(i);
    else for (let i = list.length - 1; i >= 0; i--) visit(i);
  } else if (fn === 'lag' || fn === 'lead') {
    const v = values(0);
    const step = Math.max(0, Math.trunc(literal(1, 1)));
    list.forEach((c, i) => out.set(c, v[fn === 'lag' ? i - step : i + step] ?? null));
  } else {
    const v = values(0);
    let acc = 0;
    list.forEach((c, i) => { acc += toNumber(v[i]) ?? 0; out.set(c, Math.round(acc * 1e9) / 1e9); });
  }
  return out;
}

/** Computes the window functions found in `fields`. Inner calls first, so `fill_down(rownum())` works. */
function prepareWindows(fields: Iterable<Field>, list: KqlCard[], stage: 'source' | 'result'): void {
  if (!activeWindows) return;
  const calls = [...fields].filter((f) => f.call && WINDOW_FNS.has(f.call.fn)).map((f) => f.call!).reverse();
  for (const call of calls) {
    if (stage === 'source' && call.fn !== 'rownum' && call.fn !== 'indice') throw new KqlError(`${call.fn}() needs "select" or "group by": it works over the ordered rows, not inside where / order by.`);
    activeWindows.set(call, computeWindow(call, list));
  }
}

// ── Errors: iserror(number(x)), try(number(x), 0) and the shared valid / error / empty rule ──

export type CellClass = 'valid' | 'error' | 'empty';
/** A parser name, or a function that returns null / undefined for text it cannot read. */
export type CellParser = 'number' | 'date' | 'bool' | ((raw: string) => unknown);

/**
 * The rule behind iserror(), try() and the editor's column profile: a blank cell is `empty`; a non-blank cell the parser
 * can read is `valid`; any other non-blank cell is an `error`.
 */
export function classifyCell(raw: unknown, parser: CellParser = 'number'): CellClass {
  if (cellEmpty(raw) || (typeof raw === 'string' && raw.trim() === '')) return 'empty';
  let ok: boolean;
  if (typeof parser === 'function') { const r = parser(cellText(raw)); ok = r !== null && r !== undefined; }
  else if (parser === 'number') ok = toNumber(raw) !== null;
  else if (parser === 'bool') ok = parseBoolCell(raw) !== null;
  else ok = parseDate(cellText(raw)) !== null;
  return ok ? 'valid' : 'error';
}

/** Counts valid / error / empty cells of a column of table rows with `classifyCell` (the same rule as iserror). */
export function cellErrors(rows: KqlCard[], column: string, parser: CellParser = 'number'): { valid: number; error: number; empty: number; total: number; errorRows: string[] } {
  const out = { valid: 0, error: 0, empty: 0, total: rows.length, errorRows: [] as string[] };
  const wanted = norm(column);
  for (const row of rows) {
    const key = Object.keys(row.fields ?? {}).find((k) => norm(k) === wanted);
    const raw = key !== undefined ? row.fields![key] : (row as unknown as Record<string, unknown>)[column];
    const kind = classifyCell(raw, parser);
    out[kind]++;
    if (kind === 'error' && out.errorRows.length < 50) out.errorRows.push(row.id);
  }
  return out;
}

/** true / false / yes / no / si / 1 / 0 (any case); null for anything else. */
function parseBoolCell(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : null;
  const t = cellText(raw).trim().toLowerCase();
  if (['true', 'yes', 'si', 'sí', '1', 'verdadero'].includes(t)) return true;
  if (['false', 'no', '0', 'falso'].includes(t)) return false;
  return null;
}

const NUMERIC_INPUTS: Record<string, number[] | 'all'> = {
  int: [0], whole: [0], decimal: [0], neg: [0], intdiv: [0, 1],
  number: [0], round: [0], abs: [0], ceil: [0], floor: [0], sign: [0], add: [0, 1], sub: [0, 1], mul: [0, 1], div: [0, 1], pow: [0, 1], mod: [0, 1], percent: [0, 1],
  least: 'all', greatest: 'all', min2: 'all', max2: 'all',
};
const DATE_INPUTS: Record<string, number[]> = {
  date: [0], days: [0], adddays: [0], addmonths: [0], diffdays: [0, 1], weekday: [0], dow: [0], monthname: [0], startofweek: [0], startofmonth: [0],
  week_of: [0], month_of: [0], age: [0], quarter: [0], isoweek: [0], datetime: [0], year: [0], month: [0], day: [0], todate: [0],
};
const BOOL_INPUTS: Record<string, number[]> = { bool: [0] };

/** True when a calculation was given text it cannot read (or contains such a calculation). */
function callIsError(call: Call, card: KqlCard): boolean {
  for (const arg of call.args) if (arg.t === 'field' && arg.field.call && callIsError(arg.field.call, card)) return true;
  const numeric = NUMERIC_INPUTS[call.fn];
  const date = DATE_INPUTS[call.fn];
  const bool = BOOL_INPUTS[call.fn];
  const kind = numeric ? 'number' : date ? 'date' : bool ? 'bool' : null;
  if (!kind) return false;
  const indexes = numeric === 'all' ? call.args.map((_, i) => i) : (numeric ?? date ?? bool)!;
  return indexes.some((i) => {
    const arg = call.args[i];
    if (!arg || arg.t === 'cond') return false;
    const v = argValue(arg, card);
    return classifyCell(v instanceof RegExp ? v.source : v, kind) === 'error';
  });
}

const ARITHMETIC_FNS = new Set(['add', 'sub', 'mul', 'div', 'mod', 'neg', 'intdiv']);

function evalCall(call: Call, card: KqlCard): Cell {
  if (WINDOW_FNS.has(call.fn)) return windowValue(call, card);
  const a = call.args.map((x) => argValue(x, card));
  if (ARITHMETIC_FNS.has(call.fn)) for (const v of a) if (Array.isArray(v)) throw new KqlError(`${call.infix ? `"${call.infix}"` : `${call.fn}()`} needs numbers, not a list: use first(x), count(x) or join(x, ", ") to get one value.`);
  const s = (i: number) => cellText(a[i]);
  const n = (i: number) => toNumber(a[i]);
  const num = (x: number | null): Cell => (x === null || !Number.isFinite(x) ? null : x);
  switch (call.fn) {
    case 'strip': return stripText(s(0));
    case 'trim': return s(0).trim();
    case 'lower': return s(0).toLowerCase();
    case 'upper': return s(0).toUpperCase();
    case 'capitalize': return s(0).charAt(0).toUpperCase() + s(0).slice(1).toLowerCase();
    case 'initials': return s(0).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase()).join('');
    case 'slug': return norm(s(0)).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    case 'replace': {
      const pattern = a[1];
      if (pattern instanceof RegExp) {
        regexTick();
        const text = s(0);
        const head = clipForRegex(text);
        return head.replace(pattern, s(2)) + text.slice(head.length); // the part past the limit is kept as it is
      }
      return s(0).split(cellText(pattern)).join(s(2));
    }
    case 'substr': {
      const start = Math.max(1, n(1) ?? 1);
      const len = call.args.length > 2 ? Math.max(0, n(2) ?? 0) : undefined;
      return len === undefined ? s(0).slice(start - 1) : s(0).slice(start - 1, start - 1 + len);
    }
    case 'left': return s(0).slice(0, Math.max(0, n(1) ?? 0));
    case 'right': { const k = Math.max(0, n(1) ?? 0); return k === 0 ? '' : s(0).slice(-k); }
    case 'truncate': { const k = Math.max(1, n(1) ?? 1); return s(0).length > k ? s(0).slice(0, k - 1) + '…' : s(0); }
    case 'split': {
      if (a[1] instanceof RegExp) regexTick();
      const pieces = a[1] instanceof RegExp ? clipForRegex(s(0)).split(a[1]) : s(0).split(cellText(a[1]));
      if (call.args.length < 3) return pieces.map((x) => x.trim()); // the list of pieces
      const idx = n(2) ?? 1;
      const piece = idx > 0 ? pieces[idx - 1] : pieces[pieces.length + idx];
      return piece === undefined ? null : piece.trim();
    }
    case 'len': return Array.isArray(a[0]) ? a[0].length : s(0).length;
    case 'concat': return a.map(cellText).join('');
    case 'coalesce': return (a.find((x) => !cellEmpty(x)) as Cell | undefined) ?? null;
    case 'join': return Array.isArray(a[0]) ? a[0].join(call.args.length > 1 ? s(1) : ', ') : s(0);
    case 'number': case 'decimal': return num(n(0));
    case 'int': case 'whole': { const x = n(0); return x === null ? null : Math.round(x); }
    case 'intdiv': { const x = n(0), y = n(1); return x === null || y === null || y === 0 ? null : Math.trunc(x / y); }
    case 'year': { const d = parseDate(s(0)); return d ? d.getUTCFullYear() : null; }
    case 'month': { const d = parseDate(s(0)); return d ? d.getUTCMonth() + 1 : null; }
    case 'day': { const d = parseDate(s(0)); return d ? d.getUTCDate() : null; }
    case 'todate': { const d = parseDate(s(0)); return d ? isoDay(d) : null; }
    case 'textbefore': case 'textafter': {
      const text = s(0), delimiter = s(1);
      const nth = Math.trunc(n(2) ?? 1);
      if (delimiter === '' || nth === 0) return null;
      const at: number[] = [];
      for (let k = text.indexOf(delimiter); k >= 0 && at.length < 1000; k = text.indexOf(delimiter, k + delimiter.length)) at.push(k);
      const hit = nth > 0 ? at[nth - 1] : at[at.length + nth];
      if (hit === undefined) return null;
      return call.fn === 'textbefore' ? text.slice(0, hit) : text.slice(hit + delimiter.length);
    }
    case 'list_sum': case 'list_avg': case 'list_min': case 'list_max': {
      const nums = (Array.isArray(a[0]) ? a[0] : [a[0]]).map(toNumber).filter((x): x is number => x !== null);
      if (nums.length === 0) return null;
      if (call.fn === 'list_min') return Math.min(...nums);
      if (call.fn === 'list_max') return Math.max(...nums);
      const sum = nums.reduce((x, y) => x + y, 0);
      return call.fn === 'list_sum' ? sum : sum / nums.length;
    }
    case 'neg': { const x = n(0); return x === null ? null : -x; }
    case 'text': return cellEmpty(a[0]) || s(0).trim() === '' ? null : Array.isArray(a[0]) ? a[0].join(', ') : s(0);
    case 'bool': return parseBoolCell(a[0]);
    case 'datetime': { const d = parseDate(s(0)); return d ? d.toISOString() : null; }
    case 'typeof': {
      const v = a[0];
      if (Array.isArray(v)) return 'list';
      if (cellEmpty(v) || (typeof v === 'string' && v.trim() === '')) return 'null';
      if (typeof v === 'boolean') return 'bool';
      if (typeof v === 'number') return 'number';
      return /^\d{4}-\d{2}-\d{2}/.test(cellText(v)) && parseDate(cellText(v)) ? 'date' : 'text';
    }
    case 'round': { const x = n(0); const d = call.args.length > 1 ? (n(1) ?? 0) : 0; return x === null ? null : num(Math.round(x * 10 ** d) / 10 ** d); }
    case 'abs': { const x = n(0); return x === null ? null : Math.abs(x); }
    case 'add': { const x = n(0), y = n(1); return x === null || y === null ? null : num(x + y); }
    case 'sub': { const x = n(0), y = n(1); return x === null || y === null ? null : num(x - y); }
    case 'mul': { const x = n(0), y = n(1); return x === null || y === null ? null : num(x * y); }
    case 'div': { const x = n(0), y = n(1); return x === null || y === null || y === 0 ? null : num(x / y); }
    case 'date': return formatDate(a[0], s(1));
    case 'days': {
      const d = parseDate(s(0));
      return d ? Math.floor((startOfDay(d).getTime() - startOfDay(runtimeNow()).getTime()) / DAY) : null;
    }
    case 'rank': {
      const wanted = norm(s(0));
      const group = (activeRuntime?.ctx.tagGroups ?? []).find((g) => norm(g.name) === wanted || g.id === s(0));
      if (!group) throw new KqlError(`Unknown tag group "${s(0)}".${(activeRuntime?.ctx.tagGroups ?? []).length ? ` Available: ${(activeRuntime?.ctx.tagGroups ?? []).map((g) => g.name).join(', ')}` : ' This workspace has no tag groups yet.'}`);
      const order = group.tags.map(norm);
      const best = (card.tags ?? []).map((t) => order.indexOf(norm(t))).filter((i) => i >= 0);
      return best.length ? Math.min(...best) : 9999;
    }
    // text
    case 'contains': return norm(s(0)).includes(norm(s(1)));
    case 'startswith': return norm(s(0)).startsWith(norm(s(1)));
    case 'endswith': return norm(s(0)).endsWith(norm(s(1)));
    case 'match': {
      const re = regexArg(a[1]);
      re.lastIndex = 0;
      regexTick();
      return re.test(clipForRegex(s(0)));
    }
    case 'extract': {
      const re = regexArg(a[1]);
      re.lastIndex = 0;
      regexTick();
      const m = re.exec(clipForRegex(s(0)));
      const group = Math.max(0, Math.trunc(n(2) ?? 0));
      return m ? (m[group] ?? null) : null;
    }
    case 'pad': case 'padleft': {
      const width = Math.min(200, Math.max(0, Math.trunc(n(1) ?? 0)));
      const text = s(0).slice(0, MAX_BUILT_TEXT);
      const fill = (call.args.length > 2 ? s(2) : ' ').charAt(0) || ' ';
      const gap = fill.repeat(Math.max(0, width - text.length));
      return call.fn === 'pad' ? text + gap : gap + text;
    }
    case 'repeat': return s(0).slice(0, MAX_BUILT_TEXT).repeat(Math.min(50, Math.max(0, Math.trunc(n(1) ?? 0)))).slice(0, MAX_BUILT_TEXT);
    case 'reverse': return Array.isArray(a[0]) ? [...a[0]].reverse() : [...s(0).slice(0, MAX_BUILT_TEXT)].reverse().join('');
    case 'words': return (clipForRegex(s(0)).match(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu) ?? []).length;
    case 'title': case 'proper': return s(0).toLowerCase().replace(/(^|[\s\-_/(])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
    // numbers
    case 'ceil': { const x = n(0); return x === null ? null : Math.ceil(x); }
    case 'floor': { const x = n(0); return x === null ? null : Math.floor(x); }
    case 'least': case 'greatest': case 'min2': case 'max2': {
      const nums = a.map(toNumber).filter((x): x is number => x !== null);
      if (nums.length === 0) return null;
      return call.fn === 'least' || call.fn === 'min2' ? Math.min(...nums) : Math.max(...nums);
    }
    case 'pow': { const x = n(0), y = n(1); return x === null || y === null ? null : num(x ** y); }
    case 'mod': { const x = n(0), y = n(1); return x === null || y === null || y === 0 ? null : num(x - y * Math.floor(x / y)); }
    case 'sign': { const x = n(0); return x === null ? null : Math.sign(x); }
    case 'percent': { const x = n(0), y = n(1); return x === null || y === null || y === 0 ? null : num(Math.round((x / y) * 10_000) / 100); }
    // dates
    case 'adddays': case 'addmonths': {
      const d = parseDate(s(0));
      const k = n(1);
      if (!d || k === null) return null;
      const out = call.fn === 'adddays' ? addDays(d, Math.trunc(k)) : addMonthsClamped(d, Math.trunc(k));
      if (!Number.isFinite(out.getTime()) || Math.abs(out.getUTCFullYear()) > 9999) return null;
      return /^\d{4}-\d{2}-\d{2}$/.test(s(0).trim()) ? isoDay(out) : out.toISOString();
    }
    case 'diffdays': {
      const x = parseDate(s(0)), y = parseDate(s(1));
      return x && y ? Math.floor((startOfDay(x).getTime() - startOfDay(y).getTime()) / DAY) : null;
    }
    case 'weekday': { const d = parseDate(s(0)); return d ? WEEKDAYS[d.getUTCDay()] : null; }
    case 'dow': { const d = parseDate(s(0)); return d ? ((d.getUTCDay() + 6) % 7) + 1 : null; }
    case 'monthname': { const d = parseDate(s(0)); return d ? MONTH_NAMES[d.getUTCMonth()] : null; }
    case 'startofweek': case 'week_of': { const d = parseDate(s(0)); return d ? isoDay(startOfWeek(d)) : null; }
    case 'startofmonth': { const d = parseDate(s(0)); return d ? isoDay(startOfMonth(d)) : null; }
    case 'month_of': { const d = parseDate(s(0)); return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}` : null; }
    case 'age': { const d = parseDate(s(0)); return d ? Math.floor((startOfDay(runtimeNow()).getTime() - startOfDay(d).getTime()) / DAY) : null; }
    case 'quarter': { const d = parseDate(s(0)); return d ? Math.floor(d.getUTCMonth() / 3) + 1 : null; }
    case 'isoweek': { const d = parseDate(s(0)); return d ? isoWeek(d) : null; }
    case 'today': return isoDay(runtimeNow());
    case 'now': return runtimeNow().toISOString();
    // lists (a single value counts as a list of one)
    case 'count': return Array.isArray(a[0]) ? a[0].length : cellEmpty(a[0]) ? 0 : 1;
    case 'has': {
      const needle = norm(s(1));
      return (Array.isArray(a[0]) ? a[0] : [a[0]]).some((x) => !cellEmpty(x) && norm(cellText(x)) === needle);
    }
    case 'first': return Array.isArray(a[0]) ? (a[0][0] ?? null) : (a[0] as Cell);
    case 'last': return Array.isArray(a[0]) ? (a[0][a[0].length - 1] ?? null) : (a[0] as Cell);
    case 'sort': return listOf(a[0]).sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }));
    case 'unique': { const seen = new Set<string>(); return listOf(a[0]).filter((x) => { const k = norm(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
    // conditionals
    case 'if': case 'iif': return (a[0] ? a[1] : a[2]) as Cell;
    case 'isnull': return cellEmpty(a[0]);
    case 'iserror': { const arg = call.args[0]; return arg.t === 'field' && !!arg.field.call && callIsError(arg.field.call, card); }
    case 'try': { const arg = call.args[0]; return (arg.t === 'field' && arg.field.call && callIsError(arg.field.call, card) ? a[1] : a[0]) as Cell; }
    default: throw new KqlError(`Unknown function ${call.fn}().${didYouMean(call.fn, Object.keys(KQL_FUNCTIONS).map(kqlFunctionName))}`);
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Adds months keeping the day when the month has it, else its last day (Jan 31 + 1 month = Feb 28). */
function addMonthsClamped(d: Date, n: number): Date {
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d.getUTCDate(), last));
  return first;
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // the Thursday of this week decides the year
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** A pattern argument: a /regex/ literal, or text taken as a pattern (checked like `~`). */
function regexArg(x: Cell | RegExp): RegExp {
  return x instanceof RegExp ? x : cachedRegex(cellText(x), '', true);
}

const listOf = (x: Cell | RegExp): string[] => (Array.isArray(x) ? x.map(String) : cellEmpty(x) ? [] : [cellText(x)]);

/** The value of any field of a record as plain data (what select / group by / calls work with). */
function valueOfField(card: KqlCard, field: Field): Cell {
  const rt = activeRuntime!;
  if (field.call) return evalCall(field.call, card);
  switch (field.name) {
    case 'custom': return customValue(card, field);
    case 'assignee': return (card.assignees ?? []).map((id) => userLabel(id, rt));
    case 'group': return cardGroupIds(card, rt).map((id) => rt.groupsByKey.get(id)?.name ?? id);
    case 'tag': return card.tags ?? [];
    case 'due': case 'start': case 'created': case 'updated': case 'completed': return card[field.name] ?? null;
    case 'points': case 'comments': case 'progress': return card[field.name] ?? null;
    case 'age': case 'cycle': case 'overdue_days': case 'title_len': case 'tag_count': case 'assignee_count': return derivedNumber(card, field.name);
    case 'path': return cardPath(card);
    default: return (card[field.name as 'title'] as string | null | undefined) ?? null;
  }
}

// ── Running queries ──────────────────────────────────────────────────────────

export interface KqlResultColumn { key: string; label: string; kind: 'dim' | 'metric' | 'text' }
export interface KqlResultRow {
  keys: string[];
  /** Display text of the dimension columns. */
  labels: string[];
  /** Numbers of the metric columns (in column order, text columns skipped). */
  values: number[];
  /** Display text of every column (dimensions, metrics and text columns), ready to render. */
  cells: string[];
}
export interface KqlResult {
  columns: KqlResultColumn[];
  rows: KqlResultRow[];
  /** scalar: one number/text · list: one column · table: several. */
  shape: 'scalar' | 'list' | 'table';
  /** Records that passed `where`. */
  matched: number;
  /** Records the query started from. */
  total: number;
  /** What the query read, for the pill / graph: "Tablero QA / En QA · 12 cards". */
  scope?: KqlScope;
  /** Things worth knowing: a bare word compared as a column, text cut for regex matching... */
  warnings?: string[];
}
export interface KqlScope {
  /** `cards`, a source name or a table title. */
  source: string;
  /** Readable: the qualifiers ("Tablero QA / En QA"), "whole team", the source name or the table title. */
  label: string;
  /** Records in scope (before `where`). */
  cards: number;
  qualifiers: Array<{ kind: 'board' | 'list'; name: string; id?: string }>;
}
export interface KqlOutput { title: string | null; result: KqlResult }

const NONE = '(none)';
const fmt = (n: number) => String(Math.round(n * 100) / 100);

function dimLabel(dim: Dimension): string {
  if (dim.by === 'date') return `${dim.bucket}(${dim.field.name === 'completed' && !dim.field.custom ? 'done' : fieldLabel(dim.field)})`;
  if (dim.by === 'field') return dim.label;
  return dim.by;
}

function dimKeys(card: KqlCard, dim: Dimension, rt: Runtime): string[] {
  switch (dim.by) {
    case 'list': return [card.list || NONE];
    case 'board': return [card.board || NONE];
    case 'priority': return [card.priority || NONE];
    case 'assignee': return (card.assignees ?? []).length ? [...new Set(card.assignees)] : [NONE];
    case 'group': { const g = cardGroupIds(card, rt); return g.length ? g : [NONE]; }
    case 'tag': return (card.tags ?? []).length ? [...new Set(card.tags)] : [NONE];
    case 'date': { const d = dateOf(card, dim.field); return [d ? bucketKey(d, dim.bucket) : NONE]; }
    case 'field': {
      const v = valueOfField(card, dim.field);
      const parts = (Array.isArray(v) ? v : [v]).filter((x) => !cellEmpty(x)).map(cellText);
      return parts.length ? [...new Set(parts)] : [NONE];
    }
  }
}

function keyLabel(dim: Dimension, key: string, rt: Runtime): string {
  if (key === NONE) return dim.by === 'assignee' ? '(unassigned)' : dim.by === 'group' ? '(no group)' : dim.by === 'tag' ? '(no tag)' : NONE;
  if (dim.by === 'assignee') return userLabel(key, rt);
  if (dim.by === 'group') return rt.groupsByKey.get(key)?.name ?? key;
  return key;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Compares two cells for ordering: numbers numerically, text naturally; empty values always last. */
function compareCells(a: Cell, b: Cell, dir: 'asc' | 'desc'): number {
  const ea = cellEmpty(a), eb = cellEmpty(b);
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  const sign = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  return cellText(a).localeCompare(cellText(b), undefined, { numeric: true, sensitivity: 'base' }) * sign;
}

/** Linear interpolation between the closest ranks (like a spreadsheet's PERCENTILE). */
function percentileOf(nums: number[], p: number): number {
  const sorted = [...nums].sort((x, y) => x - y);
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

interface Base { records: KqlCard[]; kind: 'cards' | 'rows' | 'source'; /** Declared columns (valid even with no rows). */ declared?: string[] }

function* walkFields(q: Query, part: 'all' | 'where' | 'order' | 'rest' = 'all', visit?: (e: Expr) => void): Generator<Field> {
  function* inArg(a: Arg): Generator<Field> {
    if (a.t === 'field') yield* inField(a.field);
    else if (a.t === 'cond') yield* inExpr(a.expr);
  }
  function* inField(f: Field): Generator<Field> { yield f; if (f.call) for (const a of f.call.args) yield* inArg(a); }
  function* inValue(v: Value | RegexLit): Generator<Field> { if (v.k === 'call') for (const a of v.call.args) yield* inArg(a); }
  function* inHaving(h: Having): Generator<Field> {
    switch (h.t) {
      case 'and': case 'or': yield* inHaving(h.l); yield* inHaving(h.r); break;
      case 'not': yield* inHaving(h.e); break;
      default: yield* inMetric(h.metric);
    }
  }
  function* inMetric(m: Metric): Generator<Field> {
    if (m.field) yield* inField(m.field);
    if (m.field2) yield* inField(m.field2);
    if (m.cond) yield* inExpr(m.cond);
  }
  function* inExpr(e: Expr): Generator<Field> {
    visit?.(e);
    switch (e.t) {
      case 'and': case 'or': yield* inExpr(e.l); yield* inExpr(e.r); break;
      case 'not': yield* inExpr(e.e); break;
      case 'cmp': yield* inField(e.field); yield* inValue(e.value); break;
      case 'in': yield* inField(e.field); for (const v of e.values) yield* inValue(v); break;
      case 'between': yield* inField(e.field); yield* inValue(e.a); yield* inValue(e.b); break;
      case 'empty': case 'window': case 'truthy': yield* inField(e.field); break;
      default: break;
    }
  }
  if (q.where && (part === 'all' || part === 'where')) yield* inExpr(q.where);
  if (part === 'all' || part === 'rest') {
    for (const d of q.group) if (d.by === 'field' || d.by === 'date') yield* inField(d.field);
    if (q.pivot && (q.pivot.by === 'field' || q.pivot.by === 'date')) yield* inField(q.pivot.field);
    for (const p of q.select ?? []) yield* inField(p.field);
    for (const m of q.metrics) yield* inMetric(m);
    if (q.having) yield* inHaving(q.having);
  }
  if (part === 'all' || part === 'order') for (const o of q.order) if (o.by === 'expr') yield* inField(o.field);
}

// ── A bare word on the right of a comparison may be a column: Monto > Costo ──

const VOCAB_FIELDS = new Set<FieldName>(['tag', 'list', 'board', 'priority', 'assignee', 'group']);
const CARD_COLUMN_WORDS = new Set(['title', 'description', 'due', 'start', 'created', 'updated', 'done', 'completed', 'points', 'comments', 'progress', 'age', 'cycle', 'overdue_days', 'title_len', 'tag_count', 'assignee_count', 'id', 'path']);

/**
 * Returns a visitor that turns `field = word` into a column comparison when `word` names a column of the source.
 * Fields whose bare words are value vocabularies (tag, list, board, priority, assignee, group) keep them as text, and so does
 * everything that is not a known column; quoted text never changes and [Name] is always a column.
 */
function bareColumnBinder(columns: Map<string, string>, kind: Base['kind'], note: (m: string) => void): (e: Expr) => void {
  return (e) => {
    if (e.t !== 'cmp' || e.value.k !== 'word' || !['=', '!=', '<', '<=', '>', '>='].includes(e.op)) return;
    if (!e.field.call && VOCAB_FIELDS.has(e.field.name)) return;
    const word = e.value.v;
    const lower = word.toLowerCase();
    const column = columns.get(norm(word));
    let target: Field | null = null;
    if (kind === 'cards') {
      if (CARD_COLUMN_WORDS.has(lower)) target = { name: FIELD_ALIASES[lower], raw: word };
      else if (column && !FIELD_ALIASES[strip(word)]) target = { name: 'custom', custom: column, raw: word };
    } else if (column) target = { name: 'custom', custom: column, raw: word };
    if (!target) return;
    if (kind !== 'cards' && target.name === 'custom' && !e.field.call && e.field.name === 'custom' && (e.op === '=' || e.op === '!=')) {
      note(`"${fieldLabel(e.field)} ${e.op} ${word}" compares with the column "${word}"; write "${word}" in quotes to compare with the text.`);
    }
    e.value = { k: 'call', call: { fn: 'coalesce', args: [{ t: 'field', field: target }], colref: true } };
  };
}

/** Compares a field with another column of the same record: numbers when both read as numbers, dates, else text. */
function compareColumns(card: KqlCard, field: Field, op: CmpOp, right: Cell): boolean {
  const flat = (c: Cell): Cell => (Array.isArray(c) ? c.join(', ') : c);
  const l = flat(valueOfField(card, field));
  const r = flat(right);
  if (cellEmpty(l) || cellEmpty(r)) return op === '!=';
  const ln = toNumber(l);
  const rn = toNumber(r);
  if (ln !== null && rn !== null) return compareNumbers(ln, op, rn);
  const dateLike = (x: Cell) => /^\d{4}-\d{2}-\d{2}/.test(cellText(x)) && parseDate(cellText(x)) !== null;
  if (dateLike(l) && dateLike(r)) {
    const a = parseDate(cellText(l))!, b = parseDate(cellText(r))!;
    if (op === '=' || op === '!=') { const same = startOfDay(a).getTime() === startOfDay(b).getTime(); return op === '=' ? same : !same; }
    return compareNumbers(a.getTime(), op, b.getTime());
  }
  const a = norm(cellText(l)), b = norm(cellText(r));
  if (op === '=') return a === b;
  if (op === '!=') return a !== b;
  return compareNumbers(a.localeCompare(b, undefined, { numeric: true }), op, 0);
}

/**
 * Binds the names typed in the query to the records' columns. A table's own column wins over a built-in alias
 * ("Estado" is a column, not the list); a name that matches nothing is an error that lists what exists.
 */
function bindFields(q: Query, base: Base): void {
  const columns = new Map<string, string>();
  for (const d of base.declared ?? []) if (!columns.has(norm(d))) columns.set(norm(d), d);
  for (const r of base.records.slice(0, 2000)) for (const k of Object.keys(r.fields ?? {})) if (!columns.has(norm(k))) columns.set(norm(k), k);
  // `order by Importe` where Importe is the name given in select
  const aliases = new Map((q.select ?? []).map((p) => [norm(p.alias), p.field]));
  q.order = q.order.map((o) => (o.by === 'expr' && !o.field.call && aliases.has(norm(o.field.custom ?? o.field.raw ?? '')) ? { ...o, field: aliases.get(norm(o.field.custom ?? o.field.raw ?? ''))! } : o));
  // `group by Responsable` over a table that has a Responsable column groups by the column, not by assignee
  if (base.kind !== 'cards') {
    const mapDim = (d: Dimension): Dimension => {
      const column = 'raw' in d && d.raw ? columns.get(norm(d.raw)) : undefined;
      return column && d.by !== 'field' && d.by !== 'date' ? { by: 'field', field: { name: 'custom', custom: column, raw: d.raw }, label: column } : d;
    };
    q.group = q.group.map(mapDim);
    if (q.pivot) q.pivot = mapDim(q.pivot);
  }
  // `members.name` -> the joined source's `title`: its built-in names work under the alias too
  if (q.joins.length > 0) {
    const joinAliases = new Set(q.joins.map((j) => norm(j.alias)));
    for (const f of walkFields(q)) {
      if (f.call || f.name !== 'custom' || !f.custom) continue;
      const m = /^([^.]+)\.(.+)$/.exec(f.custom);
      if (!m || !joinAliases.has(norm(m[1])) || columns.has(norm(f.custom))) continue;
      const builtin = FIELD_ALIASES[strip(m[2])];
      if (builtin && columns.has(norm(`${m[1]}.${builtin}`))) f.custom = `${m[1]}.${builtin}`;
    }
  }
  for (const f of walkFields(q)) {
    if (f.call) continue;
    const typed = f.raw ?? f.custom;
    const column = typed ? columns.get(norm(typed)) : undefined;
    if (base.kind !== 'cards' && f.name !== 'custom' && column) {
      f.name = 'custom';
      f.custom = column;
    } else if (f.name === 'custom') {
      const hit = columns.get(norm(f.custom));
      if (hit) f.custom = hit;
      else if (!(typed && f.name === 'custom' && column)) {
        const known = [...columns.values()].slice(0, 25);
        throw new KqlError(`Unknown ${base.kind === 'cards' ? 'field' : 'column'} "${f.custom}".${didYouMean(f.custom ?? '', [...columns.values(), ...Object.keys(FIELD_ALIASES)])}${known.length ? ` Available: ${known.join(', ')}.` : base.kind === 'cards' ? ' Built-in fields: title, list, assignee, tag, due, done, points...' : ''}`);
      }
    }
  }
  // `Monto > Costo`: after the names are bound (a table's own column wins over a built-in alias such as Estado = list)
  for (const _f of walkFields(q, 'all', bareColumnBinder(columns, base.kind, warn))) void _f; // `Monto > Costo`
}

/** offset, droplast, limit, tail — in that order — on rows already in their final order. */
function pageRows<T>(rows: T[], q: Query): T[] {
  let out = rows;
  if (q.offset) out = out.slice(q.offset);
  if (q.droplast) out = out.slice(0, Math.max(0, out.length - q.droplast));
  if (q.limit) out = out.slice(0, q.limit);
  if (q.tail) out = out.slice(-q.tail);
  return out;
}

/** Rows become columns. `header`: the first column's values name the new columns; either way the old column names form a "Field" column. */
function transposeResult(r: KqlResult, header: boolean): KqlResult {
  if (r.rows.length > 200) throw new KqlError(`"transpose" works on at most 200 rows (this has ${r.rows.length}); filter or add "limit".`);
  if (r.columns.length > 50) throw new KqlError(`"transpose" works on at most 50 columns (this has ${r.columns.length}); select fewer.`);
  const grid = r.rows.map((row) => row.cells);
  const labels = r.columns.map((c) => c.label);
  const heads = header ? grid.map((row) => row[0] ?? '') : grid.map((_, i) => `Column${i + 1}`);
  const columns: KqlResultColumn[] = [{ key: 'Field', label: 'Field', kind: 'text' }, ...heads.map((h): KqlResultColumn => ({ key: h, label: h, kind: 'text' }))];
  const rows: KqlResultRow[] = [];
  for (let i = header ? 1 : 0; i < labels.length; i++) rows.push({ keys: [labels[i]], labels: [], values: [], cells: [labels[i], ...grid.map((row) => row[i] ?? '')] });
  return { columns, rows, shape: 'table', matched: r.matched, total: r.total };
}

function runQuery(q: Query, base: Base, rt: Runtime): { result: KqlResult; matched: KqlCard[] } {
  const previous = activeWindows;
  const previousWarnings = activeWarnings;
  activeWindows = new Map();
  activeWarnings = [];
  rt.regexTests = 0;
  try {
    const out = runQueryCore(q, base, rt);
    if (q.transpose) out.result = transposeResult(out.result, q.transpose === 'header');
    if (activeWarnings.length > 0) out.result.warnings = [...activeWarnings];
    return out;
  } finally {
    activeWindows = previous;
    activeWarnings = previousWarnings;
  }
}

/** `group by a pivot b metric`: aggregates by (a, b) and spreads the values of b into columns. */
function runPivot(q: Query, base: Base, rt: Runtime): { result: KqlResult; matched: KqlCard[] } {
  const pivot = q.pivot!;
  const metric = q.metrics[0];
  const inner: Query = { ...q, group: [...q.group, pivot], pivot: null, order: [], limit: null, offset: null, tail: null, droplast: null, having: null, transpose: null };
  const { result, matched } = runQueryCore(inner, base, rt);
  const seen = new Set<string>();
  const pivotKeys: string[] = [];
  for (const card of matched) for (const k of dimKeys(card, pivot, rt)) if (!seen.has(k)) { seen.add(k); pivotKeys.push(k); }
  if (pivotKeys.length > 50) throw new KqlError(`"pivot" would create ${pivotKeys.length} columns (max 50). Filter with "where" or pivot a column with fewer values.`);
  if (q.order.some((o) => o.by !== 'key' && o.by !== 'label')) throw new KqlError('With "pivot" the rows can be ordered by "key" or "label" only.');
  const textMetric = metric.fn === 'join' || metric.fn === 'first' || metric.fn === 'last';
  const zeroWhenMissing = ['count', 'percent', 'sum', 'sum_if', 'count_if', 'unique'].includes(metric.fn);
  const g = q.group.length;
  type Cellv = { value: number; text: string };
  const table = new Map<string, { keys: string[]; labels: string[]; cells: Map<string, Cellv> }>();
  for (const row of result.rows) {
    const rowKeys = row.keys.slice(0, g);
    const id = rowKeys.join('\u0000');
    let entry = table.get(id);
    if (!entry) { entry = { keys: rowKeys, labels: row.labels.slice(0, g), cells: new Map() }; table.set(id, entry); }
    entry.cells.set(row.keys[g], { value: textMetric ? 0 : row.values[0], text: row.cells[row.cells.length - 1] });
  }
  const orders: Order[] = q.order.length > 0 ? q.order : [{ by: 'key', dir: 'asc' }];
  let entries = [...table.values()].sort((x, y) => {
    for (const o of orders) {
      const l = o.by === 'label' ? x.labels.join(' ') : x.keys.join(' ');
      const r = o.by === 'label' ? y.labels.join(' ') : y.keys.join(' ');
      const cmp = l.localeCompare(r, undefined, { numeric: true, sensitivity: 'base' }) * (o.dir === 'asc' ? 1 : -1);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  entries = pageRows(entries, q);
  const columns: KqlResultColumn[] = [
    ...q.group.map((d): KqlResultColumn => ({ key: dimLabel(d), label: dimLabel(d), kind: 'dim' })),
    ...pivotKeys.map((k): KqlResultColumn => ({ key: keyLabel(pivot, k, rt), label: keyLabel(pivot, k, rt), kind: textMetric ? 'text' : 'metric' })),
  ];
  const rows: KqlResultRow[] = entries.map((e) => {
    const cellsOf = pivotKeys.map((k): Cellv => e.cells.get(k) ?? (zeroWhenMissing ? { value: 0, text: '0' } : { value: 0, text: '' }));
    return { keys: e.keys, labels: e.labels, values: textMetric ? [] : cellsOf.map((c) => c.value), cells: [...e.labels, ...cellsOf.map((c) => c.text)] };
  });
  return { matched, result: { columns, rows, shape: 'table', matched: matched.length, total: result.total } };
}

/** Every column of the records, as a projection (what `unpivot` shows when nothing else is selected). */
function implicitProjection(base: Base): Projection[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of base.records.slice(0, 2000)) for (const k of Object.keys(r.fields ?? {})) if (!seen.has(norm(k))) { seen.add(norm(k)); keys.push(k); }
  const out: Projection[] = base.kind === 'cards' ? [{ field: { name: 'title', raw: 'title' }, alias: 'title' }] : [];
  for (const k of keys) out.push({ field: { name: 'custom', custom: k, raw: k }, alias: k });
  return out;
}

/** The columns `select *` shows for cards: the readable ones; ids and other helper fields stay reachable by name. */
const CARD_STAR_COLUMNS = ['title', 'list', 'board', 'assignee', 'tag', 'priority', 'due', 'start', 'created', 'updated', 'done', 'points', 'comments', 'progress'];

/** Replaces `*` / `alias.*` by the real columns, in their natural order (declared columns first, so empty sources work). */
function expandStars(q: Query, base: Base): void {
  if (!q.select || !q.select.some((p) => p.star)) return;
  const joinAliases = q.joins.map((j) => norm(j.alias));
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const k of base.declared ?? []) if (!seen.has(norm(k))) { seen.add(norm(k)); keys.push(k); }
  for (const r of base.records.slice(0, 2000)) for (const k of Object.keys(r.fields ?? {})) if (!seen.has(norm(k))) { seen.add(norm(k)); keys.push(k); }
  const aliasOf = (k: string) => { const m = /^([^.]+)\./.exec(k); return m && joinAliases.includes(norm(m[1])) ? norm(m[1]) : null; };
  const out: Projection[] = [];
  for (const p of q.select) {
    if (!p.star) { out.push(p); continue; }
    const skip = new Set(p.star.except.map(norm));
    const qualifier = p.star.qualifier ? norm(p.star.qualifier) : null;
    let names: string[];
    if (qualifier) {
      names = keys.filter((k) => aliasOf(k) === qualifier);
      if (names.length === 0) throw new KqlError(`"${p.star.qualifier}.*" needs a joined source called "${p.star.qualifier}" (join ... as ${p.star.qualifier} on ...).${joinAliases.length ? ` Joined: ${q.joins.map((j) => j.alias).join(', ')}.` : ''}`);
    } else if (base.kind === 'cards') names = CARD_STAR_COLUMNS;
    else names = [...(base.kind === 'source' && !seen.has('title') ? ['title'] : []), ...keys.filter((k) => !aliasOf(k))];
    for (const name of names) {
      const bare = qualifier ? name.slice(name.indexOf('.') + 1) : name;
      if (skip.has(norm(name)) || skip.has(norm(bare))) continue;
      const builtin = FIELD_ALIASES[strip(name)];
      const inFields = base.records.some((r) => Object.keys(r.fields ?? {}).some((k) => norm(k) === norm(name)));
      const asBuiltin = !qualifier && !!builtin && (base.kind === 'cards' || (base.kind === 'source' && (name === 'title' || (!inFields && base.records.length > 0))));
      out.push(asBuiltin ? { field: { name: builtin, raw: name }, alias: name } : { field: { name: 'custom', custom: name, raw: name }, alias: name });
    }
  }
  q.select = out;
}

function runQueryCore(q: Query, base: Base, rt: Runtime): { result: KqlResult; matched: KqlCard[] } {
  const cards = base.records;
  if (cards.length > KQL_LIMITS.maxRows) throw new KqlError(`Too many records to analyse (max ${KQL_LIMITS.maxRows}).`);
  if (q.implicitSelect && !q.select) q.select = implicitProjection(base);
  expandStars(q, base);
  bindFields(q, base);
  if (q.pivot) return runPivot(q, base, rt);
  prepareWindows(walkFields(q, 'where'), cards, 'source');
  const matched = q.where ? cards.filter((c) => evalExpr(q.where!, c, rt)) : cards;

  // ── Projection: one row per record ──
  if (q.select) {
    let list = matched;
    if (q.order.length > 0) {
      if (q.order.some((o) => o.by === 'metric')) throw new KqlError('"order by" a metric needs "group by" or metrics; with "select" order by a field.');
      prepareWindows(walkFields(q, 'order'), matched, 'source');
      const keyOf = (c: KqlCard, o: Order): Cell => (o.by === 'expr' ? valueOfField(c, o.field) : valueOfField(c, q.select![0].field));
      const keyed = list.map((c) => ({ c, v: q.order.map((o) => keyOf(c, o)) }));
      keyed.sort((x, y) => {
        for (let i = 0; i < q.order.length; i++) {
          const diff = compareCells(x.v[i], y.v[i], q.order[i].dir);
          if (diff !== 0) return diff;
        }
        return 0;
      });
      list = keyed.map((k) => k.c);
    }
    prepareWindows(walkFields(q, 'rest'), list, 'result');
    let table: Cell[][];
    if (q.distinct) {
      // drop repeated rows (first one wins) before paging
      const seen = new Set<string>();
      const kept: KqlCard[] = [];
      const keptRows: Cell[][] = [];
      for (const c of list) {
        const row = q.select.map((p) => valueOfField(c, p.field));
        const key = row.map((x) => norm(cellText(x))).join('\u0000');
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push(c);
        keptRows.push(row);
      }
      const index = pageRows(kept.map((_, i) => i), q);
      list = index.map((i) => kept[i]);
      table = index.map((i) => keptRows[i]);
    } else {
      list = pageRows(list, q);
      table = list.map((c) => q.select!.map((p) => valueOfField(c, p.field)));
    }
    const numeric = q.select.map((_, i) => table.length > 0 && table.every((r) => cellEmpty(r[i]) || typeof r[i] === 'number'));
    return {
      matched,
      result: {
        columns: q.select.map((p, i): KqlResultColumn => ({ key: p.alias, label: p.alias, kind: numeric[i] ? 'metric' : 'text' })),
        rows: list.map((c, ri) => ({
          keys: [c.id],
          labels: [],
          values: table[ri].flatMap((cell, i) => (numeric[i] ? [typeof cell === 'number' ? cell : 0] : [])),
          cells: table[ri].map((cell) => (typeof cell === 'number' ? fmt(cell) : cellText(cell))),
        })),
        shape: q.select.length === 1 ? 'list' : 'table',
        matched: matched.length,
        total: cards.length,
      },
    };
  }

  // ── Aggregation: one row per combination of dimension keys (a record counts once per key) ──
  prepareWindows(walkFields(q, 'rest'), matched, 'result');
  type Acc = { keys: string[]; cards: KqlCard[] };
  const groups = new Map<string, Acc>();
  if (q.group.length === 0) groups.set('', { keys: [], cards: matched });
  else {
    for (const card of matched) {
      let combos: string[][] = [[]];
      for (const dim of q.group) combos = combos.flatMap((prefix) => dimKeys(card, dim, rt).map((k) => [...prefix, k]));
      for (const keys of combos) {
        const id = keys.join('\u0000');
        const acc = groups.get(id);
        if (acc) acc.cards.push(card);
        else {
          if (groups.size >= KQL_LIMITS.maxGroups) throw new KqlError(`Too many groups (max ${KQL_LIMITS.maxGroups}). Narrow the query or group by something coarser.`);
          groups.set(id, { keys, cards: [card] });
        }
      }
    }
  }

  const isTextMetric = (m: Metric) => m.fn === 'join' || m.fn === 'first' || m.fn === 'last';
  const metricCell = (m: Metric, group: Acc): { value: number; text: string } => {
    if (m.fn === 'count') return { value: group.cards.length, text: String(group.cards.length) };
    if (m.fn === 'percent') { const p = matched.length ? Math.round((group.cards.length / matched.length) * 1000) / 10 : 0; return { value: p, text: String(p) }; }
    if (isTextMetric(m) || m.fn === 'unique') {
      const seen = new Set<string>();
      const parts: string[] = [];
      for (const c of group.cards) {
        const v = valueOfField(c, m.field!);
        for (const x of Array.isArray(v) ? v : [v]) {
          if (cellEmpty(x)) continue;
          const t = cellText(x);
          const key = norm(t);
          if (!seen.has(key)) { seen.add(key); parts.push(t); }
        }
      }
      if (m.fn === 'unique') return { value: parts.length, text: String(parts.length) };
      if (m.fn === 'first') return { value: 0, text: parts[0] ?? '' };
      if (m.fn === 'last') return { value: 0, text: parts[parts.length - 1] ?? '' };
      const sep = m.sep ?? ', ';
      return { value: 0, text: parts.length > 50 ? `${parts.slice(0, 50).join(sep)}${sep}… +${parts.length - 50}` : parts.join(sep) };
    }
    if (m.fn === 'count_if') { const v = group.cards.filter((c) => evalExpr(m.cond!, c, rt)).length; return { value: v, text: String(v) }; }
    const source = m.fn === 'sum_if' ? group.cards.filter((c) => evalExpr(m.cond!, c, rt)) : group.cards;
    if (m.fn === 'ratio') {
      const top = source.reduce((t, c) => t + (numberOf(c, m.field!) ?? 0), 0);
      const bottom = source.reduce((t, c) => t + (numberOf(c, m.field2!) ?? 0), 0);
      const v = bottom === 0 ? 0 : round(top / bottom);
      return { value: v, text: fmt(v) };
    }
    const nums = source.map((c) => numberOf(c, m.field!)).filter((n): n is number => n !== null);
    if (nums.length === 0) return { value: 0, text: '0' };
    const sum = nums.reduce((x, y) => x + y, 0);
    let v: number;
    switch (m.fn) {
      case 'sum': case 'sum_if': v = round(sum); break;
      case 'avg': v = round(sum / nums.length); break;
      case 'min': v = Math.min(...nums); break;
      case 'max': v = Math.max(...nums); break;
      case 'median': v = round(percentileOf(nums, 50)); break;
      case 'percentile': v = round(percentileOf(nums, m.p ?? 50)); break;
      default: { const mean = sum / nums.length; v = round(Math.sqrt(nums.reduce((t, x) => t + (x - mean) ** 2, 0) / nums.length)); } // stddev (population)
    }
    return { value: v, text: fmt(v) };
  };
  const havingHolds = (h: Having, group: Acc): boolean => {
    switch (h.t) {
      case 'and': return havingHolds(h.l, group) && havingHolds(h.r, group);
      case 'or': return havingHolds(h.l, group) || havingHolds(h.r, group);
      case 'not': return !havingHolds(h.e, group);
      case 'between': { const v = metricCell(h.metric, group).value; return v >= h.a && v <= h.b; }
      case 'cmp': return compareNumbers(metricCell(h.metric, group).value, h.op, h.value);
    }
  };

  let rows: KqlResultRow[] = [...groups.values()].filter((g) => !q.having || havingHolds(q.having, g)).map((g) => {
    const cells = q.metrics.map((m) => metricCell(m, g));
    const labels = g.keys.map((k, i) => keyLabel(q.group[i], k, rt));
    return {
      keys: g.keys,
      labels,
      values: q.metrics.flatMap((m, i) => (isTextMetric(m) ? [] : [cells[i].value])),
      cells: [...labels, ...cells.map((c) => c.text)],
    };
  });
  // metric index (in q.metrics) -> position inside `values`
  const valuePos = (metric: number) => q.metrics.slice(0, metric).filter((m) => !isTextMetric(m)).length;

  const dateFirst = q.group.length > 0 && q.group[0].by === 'date';
  const orders: Order[] = q.order.length > 0 ? q.order : [dateFirst ? { by: 'key', dir: 'asc' } : { by: 'metric', metric: 0, dir: 'desc' }];
  if (orders.some((o) => o.by === 'expr')) throw new KqlError('To order groups use "order by key", "order by label" or a metric such as "order by count". Ordering by a field needs "select".');
  rows.sort((a, b) => {
    for (const order of orders) {
      const sign = order.dir === 'asc' ? 1 : -1;
      if (order.by === 'metric') {
        const idx = order.metric ?? 0;
        if (!isTextMetric(q.metrics[idx])) {
          const diff = (a.values[valuePos(idx)] - b.values[valuePos(idx)]) * sign;
          if (diff !== 0) return diff;
        }
      } else {
        const left = order.by === 'label' ? a.labels.join(' ') : a.keys.join(' ');
        const right = order.by === 'label' ? b.labels.join(' ') : b.keys.join(' ');
        const cmp = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }) * sign;
        if (cmp !== 0) return cmp;
      }
    }
    return a.keys.join(' ').localeCompare(b.keys.join(' '), undefined, { numeric: true, sensitivity: 'base' });
  });
  rows = pageRows(rows, q);

  const columns: KqlResultColumn[] = [
    ...q.group.map((d): KqlResultColumn => ({ key: dimLabel(d), label: dimLabel(d), kind: 'dim' })),
    ...q.metrics.map((m): KqlResultColumn => ({ key: m.label, label: m.label, kind: isTextMetric(m) ? 'text' : 'metric' })),
  ];
  return {
    matched,
    result: { columns, rows, shape: q.group.length === 0 && q.metrics.length === 1 ? 'scalar' : columns.length === 1 ? 'list' : 'table', matched: matched.length, total: cards.length },
  };
}

// ── Unions and joins ─────────────────────────────────────────────────────────

/** The values a record offers as a join key, normalised; a list (assignees, tags) offers each element. */
function joinKeys(card: KqlCard, field: Field, rt: Runtime): string[] {
  let raw: unknown[];
  if (!field.call && (field.name === 'assignee' || field.name === 'group')) raw = stringsOf(card, field, rt);
  else { const v = valueOfField(card, field); raw = Array.isArray(v) ? v : [v]; }
  const out = new Set<string>();
  for (const x of raw) {
    if (cellEmpty(x)) continue;
    const k = norm(cellText(x));
    if (k) out.add(k);
  }
  return [...out];
}

/** Every value of a joined record, named as the query will see it (before the `alias.` prefix). */
function joinedEntries(r: KqlCard, rt: Runtime): Array<[string, Cell]> {
  const out: Array<[string, Cell]> = [['id', r.id], ['title', r.title]];
  for (const k of ['description', 'board', 'list', 'priority', 'due', 'start', 'created', 'updated', 'completed', 'points', 'comments', 'progress'] as const) {
    const v = r[k];
    if (v !== null && v !== undefined) out.push([k, v]);
  }
  if ((r.assignees ?? []).length > 0) out.push(['assignee', r.assignees!.map((id) => userLabel(id, rt))]);
  if ((r.tags ?? []).length > 0) out.push(['tag', r.tags!]);
  for (const [k, v] of Object.entries(r.fields ?? {})) out.push([k, v]);
  return out;
}

/** Checks a join key against the columns of the records it reads (same errors as any field). */
function bindJoinKey(field: Field, base: Base, where: string, rt: Runtime): void {
  const probe: Query = { source: { kind: 'cards' }, scope: [], unions: [], joins: [], where: { t: 'truthy', field }, group: [], select: null, metrics: [], having: null, order: [], distinct: false, offset: null, limit: null, tail: null, droplast: null, pivot: null, unpivot: null, transpose: null, implicitSelect: false };
  try {
    bindFields(probe, base);
  } catch (e) {
    if (e instanceof KqlError) throw new KqlError(`${e.message} (${where})`, e.position);
    throw e;
  }
  void rt;
}

function joinOnce(j: Join, left: Base, right: Base, rt: Runtime): Base {
  const max = KQL_LIMITS.maxRows;
  if (left.records.length > max || right.records.length > max) throw new KqlError(`Too many records to join (max ${max}).`);
  bindJoinKey(j.left, left, 'join key of the query', rt);
  bindJoinKey(j.right, right, `join key of "${j.alias}"`, rt);
  const index = new Map<string, KqlCard[]>();
  for (const r of right.records) for (const k of joinKeys(r, j.right, rt)) { const list = index.get(k); if (list) list.push(r); else index.set(k, [r]); }
  const columns: string[] = [];
  const seenColumns = new Set<string>();
  for (const k of ['id', 'title', ...(right.declared ?? [])]) if (right.declared && !seenColumns.has(k)) { seenColumns.add(k); columns.push(k); }
  for (const r of right.records.slice(0, 2000)) for (const [k] of joinedEntries(r, rt)) if (!seenColumns.has(k)) { seenColumns.add(k); columns.push(k); }
  const merge = (l: KqlCard, r: KqlCard | null): KqlCard => {
    const values = new Map(r ? joinedEntries(r, rt) : []);
    const fields: Record<string, Cell> = { ...(l.fields ?? {}) };
    for (const c of columns) fields[`${j.alias}.${c}`] = values.get(c) ?? null;
    return { ...l, fields };
  };
  const out: KqlCard[] = [];
  const push = (card: KqlCard) => {
    if (out.length >= max) throw new KqlError(`The join with "${j.alias}" would produce more than ${max} rows (each record matches many). Filter first or join on a more specific key.`);
    out.push(card);
  };
  for (const l of left.records) {
    const hits = new Set<KqlCard>();
    for (const k of joinKeys(l, j.left, rt)) for (const r of index.get(k) ?? []) hits.add(r);
    if (hits.size === 0) { if (j.kind === 'left') push(merge(l, null)); continue; }
    for (const r of hits) push(merge(l, r));
  }
  return { records: out, kind: left.kind, declared: left.declared || right.declared ? [...(left.declared ?? []), ...columns.map((c) => `${j.alias}.${c}`)] : undefined };
}

function unpivotBase(u: Unpivot, base: Base, rt: Runtime): Base {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of base.records.slice(0, 2000)) for (const k of Object.keys(r.fields ?? {})) if (!seen.has(norm(k))) { seen.add(norm(k)); keys.push(k); }
  for (const f of u.columns) bindJoinKey(f, base, 'column of "unpivot"', rt);
  const nameOf = (f: Field) => f.custom ?? f.raw ?? fieldLabel(f);
  let fields: Field[];
  if (u.except) {
    if (base.kind === 'cards') throw new KqlError('"unpivot except" needs a table source (rows of "..."); for cards list the columns: unpivot points, comments.');
    const skip = new Set(u.columns.map((f) => norm(nameOf(f))));
    fields = keys.filter((k) => !skip.has(norm(k))).map((k): Field => ({ name: 'custom', custom: k, raw: k }));
  } else fields = u.columns;
  if (fields.length === 0) throw new KqlError('"unpivot" has no columns to turn into rows.');
  if (fields.length * base.records.length > KQL_LIMITS.maxRows) throw new KqlError(`"unpivot" would produce more than ${KQL_LIMITS.maxRows} rows.`);
  const moved = new Set(fields.filter((f) => f.name === 'custom').map((f) => norm(f.custom)));
  const out: KqlCard[] = [];
  for (const r of base.records) {
    const kept: Record<string, Cell> = {};
    for (const [k, v] of Object.entries(r.fields ?? {})) if (!moved.has(norm(k))) kept[k] = v;
    for (const f of fields) {
      const label = nameOf(f);
      out.push({ ...r, id: `${r.id}:${label}`, fields: { ...kept, [u.attribute]: label, [u.value]: valueOfField(r, f) } });
    }
  }
  return { records: out, kind: base.kind };
}

/** Applies `union`, `join` and `unpivot` to the records the query starts from. */
function applyCombinations(q: Query, base: Base, data: KqlData, variables: Map<string, Base>, rt: Runtime): Base {
  let current = base;
  if (q.unions.length > 0) {
    const seen = new Set<KqlCard>(current.records);
    const records = [...current.records];
    let kind = current.kind;
    for (const ref of q.unions) {
      const other = resolveBase(ref, data, variables);
      if (other.kind !== kind) kind = 'source';
      for (const r of other.records) {
        if (seen.has(r)) continue;
        seen.add(r);
        records.push(r);
        if (records.length > KQL_LIMITS.maxRows) throw new KqlError(`Too many records to analyse (max ${KQL_LIMITS.maxRows}).`);
      }
    }
    current = { records, kind, declared: [...new Set([...(current.declared ?? []), ...q.unions.flatMap((ref) => resolveBase(ref, data, variables).declared ?? [])])] };
  }
  for (const j of q.joins) current = joinOnce(j, current, resolveBase(j.source, data, variables), rt);
  if (q.unpivot) current = unpivotBase(q.unpivot, current, rt);
  return current;
}

function findTable(ref: string, data: KqlData): KqlTable {
  const tables = data.tables ?? [];
  const wanted = norm(ref);
  const hits = tables.filter((t) => t.id === ref || norm(t.title) === wanted);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new KqlError(`There are ${hits.length} tables called "${ref}". Use the id of the one you want: ${hits.slice(0, 5).map((t) => t.id).join(', ')}.`);
  const known = tables.slice(0, 15).map((t) => `"${t.title}"`).join(', ');
  throw new KqlError(`No table "${ref}" found.${known ? ` Tables: ${known}.` : ' There are no tables to read here.'}`);
}

function resolveBase(src: SourceRef, data: KqlData, variables: Map<string, Base>): Base {
  if (src.kind === 'cards') return { records: data.cards ?? [], kind: 'cards', declared: data.columns?.cards };
  if (src.kind === 'rows') { const t = findTable(src.ref, data); return { records: t.rows, kind: 'rows', declared: t.columns }; }
  if (src.kind === 'values') {
    const records = src.rows.map((row, i): KqlCard => ({ id: `v${i + 1}`, title: cellText(row[0]), fields: Object.fromEntries(src.columns.map((c, ci) => [c, row[ci] ?? null])) }));
    return { records, kind: 'rows', declared: src.columns };
  }
  const saved = variables.get(src.name);
  if (saved) return saved;
  const named = data.sources?.[src.name];
  if (named) return { records: named, kind: 'source', declared: data.columns?.[src.name] };
  const tableHit = (data.tables ?? []).find((t) => norm(t.title) === src.name || t.id === src.name);
  if (tableHit) return { records: tableHit.rows, kind: 'rows', declared: tableHit.columns };
  const available = Object.keys(data.sources ?? {});
  const near = didYouMean(src.name, [...variables.keys(), ...available, 'cards', ...(data.tables ?? []).map((t) => norm(t.title))]);
  throw new KqlError(`Unknown name "${src.name}".${near} Define it first with: let ${src.name} = cards where ...${available.length ? ` · sources: ${available.join(', ')}` : ''}`);
}

// ── Scope: cards in board / list ─────────────────────────────────────────────

interface ScopeBoard { id?: string; name: string }
interface ScopeList { id?: string; name: string; boardId?: string; boardName?: string }

const fieldText = (c: KqlCard, key: string): string | undefined => { const v = c.fields?.[key]; return typeof v === 'string' && v ? v : undefined; };

/** Boards and lists known to the query: the declared `scopes` plus whatever the card records say. */
function scopeUniverse(data: KqlData): { boards: ScopeBoard[]; lists: ScopeList[] } {
  const boards = new Map<string, ScopeBoard>();
  const lists = new Map<string, ScopeList>();
  const boardKey = (b: ScopeBoard) => b.id ?? `n:${norm(b.name)}`;
  const listKey = (l: ScopeList) => l.id ?? `n:${norm(l.boardName ?? '')}/${norm(l.name)}`;
  for (const b of data.scopes?.boards ?? []) boards.set(boardKey(b), { id: b.id, name: b.name });
  const names = new Map([...boards.values()].filter((b) => b.id).map((b) => [b.id!, b.name]));
  for (const l of data.scopes?.lists ?? []) lists.set(listKey(l), { id: l.id, name: l.name, boardId: l.boardId, boardName: l.boardId ? names.get(l.boardId) : undefined });
  for (const c of data.cards ?? []) {
    const bid = fieldText(c, 'board_id');
    const lid = fieldText(c, 'list_id');
    if (c.board) { const b = { id: bid, name: c.board }; if (!boards.has(boardKey(b))) boards.set(boardKey(b), b); }
    if (c.list) { const l = { id: lid, name: c.list, boardId: bid, boardName: c.board ?? undefined }; if (!lists.has(listKey(l))) lists.set(listKey(l), l); }
  }
  return { boards: [...boards.values()], lists: [...lists.values()] };
}

const describeBoard = (b: ScopeBoard) => `board "${b.name}"${b.id ? ` (id ${b.id})` : ''}`;
const describeList = (l: ScopeList) => `list "${l.name}"${l.boardName ? ` of board "${l.boardName}"` : ''}${l.id ? ` (id ${l.id})` : ''}`;

/**
 * Turns the qualifiers of `cards in ...` into a card filter, failing on unknown names (with suggestions) and on names that
 * match more than one board / list (listing every candidate with its parent and id).
 */
function resolveScope(qualifiers: ScopeQualifier[], data: KqlData): { keep: (c: KqlCard) => boolean; label: string; resolved: KqlScope['qualifiers'] } {
  const universe = scopeUniverse(data);
  const boards: ScopeBoard[] = [];
  const lists: ScopeList[] = [];
  const pick = <T extends { id?: string; name: string }>(kind: 'board' | 'list', value: string, pool: T[], describe: (x: T) => string, hint: (x: T) => string): T => {
    const hits = pool.filter((x) => norm(x.name) === norm(value));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      const example = hit0(hits[0]);
      throw new KqlError(`"${value}" is ambiguous: ${hits.slice(0, 8).map(describe).join(', ')}. Use ${example}${hits[0].id ? ` or cards in ${kind} id "${hits[0].id}"` : ''}.`);
    }
    const names = [...new Set(pool.map((x) => x.name))];
    throw new KqlError(`Unknown ${kind} "${value}".${didYouMean(value, names)}${names.length ? ` Available ${kind}s: ${names.slice(0, 15).map((n) => `"${n}"`).join(', ')}${names.length > 15 ? '...' : ''}.` : ` There are no ${kind}s to read here.`}`);
    function hit0(x: T): string { return hint(x); }
  };
  const byId = <T extends { id?: string }>(kind: string, id: string, pool: T[]): T => {
    const hit = pool.find((x) => x.id === id);
    if (!hit) throw new KqlError(`Unknown ${kind} id "${id}".`);
    return hit;
  };
  const boardsFirst = [...qualifiers].sort((a, b) => (a.kind === 'board' ? 0 : 1) - (b.kind === 'board' ? 0 : 1));
  const boardQualified = qualifiers.some((q) => q.kind === 'board');
  for (const q of boardsFirst) {
    for (const value of q.values) {
      if (q.kind === 'board') boards.push(q.by === 'id' ? byId('board', value, universe.boards) : pick('board', value, universe.boards, describeBoard, (b) => `cards in board id "${b.id ?? '...'}"`));
      else if (q.kind === 'list' && !(q.by === 'name' && value.includes('/'))) {
        const parents = new Set(boards.map((b) => b.id ?? norm(b.name)));
        const pool = universe.lists.filter((l) => !boardQualified || parents.has(l.boardId ?? '') || parents.has(norm(l.boardName ?? '')));
        lists.push(q.by === 'id' ? byId('list', value, universe.lists) : pick('list', value, pool, describeList, (l) => `cards in board "${l.boardName ?? '...'}" list "${l.name}"`));
      } else {
        const parts = value.split('/').map((x) => x.trim()).filter(Boolean);
        if (parts.length === 2) {
          const board = pick('board', parts[0], universe.boards, describeBoard, (b) => `cards in board id "${b.id ?? '...'}"`);
          const inBoard = universe.lists.filter((l) => (board.id && l.boardId ? l.boardId === board.id : norm(l.boardName ?? '') === norm(board.name)));
          lists.push(pick('list', parts[1], inBoard, describeList, (l) => `cards in list id "${l.id ?? '...'}"`));
        } else if (parts.length === 1) {
          if (universe.boards.some((b) => norm(b.name) === norm(parts[0]))) boards.push(pick('board', parts[0], universe.boards, describeBoard, (b) => `cards in board id "${b.id ?? '...'}"`));
          else lists.push(pick('list', parts[0], universe.lists, describeList, (l) => `cards in board "${l.boardName ?? '...'}" list "${l.name}"`));
        } else throw new KqlError(`A scope path is "Board / List", not "${value}".`);
      }
    }
  }
  const sameBoard = (c: KqlCard, b: ScopeBoard) => { const id = fieldText(c, 'board_id'); return b.id && id ? b.id === id : norm(b.name) === norm(c.board ?? ''); };
  const sameList = (c: KqlCard, l: ScopeList) => {
    const id = fieldText(c, 'list_id');
    if (l.id && id) return l.id === id;
    return norm(l.name) === norm(c.list ?? '') && (!l.boardName || norm(l.boardName) === norm(c.board ?? ''));
  };
  const keep = (c: KqlCard) => (boards.length === 0 || boards.some((b) => sameBoard(c, b))) && (lists.length === 0 || lists.some((l) => sameList(c, l)));
  const label = lists.length > 0 ? lists.map((l) => (l.boardName ? `${l.boardName} / ${l.name}` : l.name)).join(' + ') : boards.map((b) => b.name).join(' + ');
  const resolved: KqlScope['qualifiers'] = [
    ...boards.map((b) => ({ kind: 'board' as const, name: b.name, ...(b.id ? { id: b.id } : {}) })),
    ...lists.map((l) => ({ kind: 'list' as const, name: l.name, ...(l.id ? { id: l.id } : {}) })),
  ];
  return { keep, label, resolved };
}

/** A result saved by `let`: one record per row, the column labels as fields (metrics as numbers). */
function materialize(result: KqlResult, name: string): Base {
  const labels: string[] = [];
  for (const c of result.columns) {
    let label = c.label || 'Column';
    for (let n = 2; labels.some((l) => norm(l) === norm(label)); n++) label = `${c.label} ${n}`;
    labels.push(label);
  }
  const records = result.rows.slice(0, KQL_LIMITS.maxRows).map((row, i): KqlCard => {
    const fields: Record<string, Cell> = {};
    let v = 0;
    result.columns.forEach((col, ci) => {
      if (col.kind === 'metric') fields[labels[ci]] = row.values[v++] ?? null;
      else fields[labels[ci]] = row.cells[ci] === '' || row.cells[ci] === undefined ? null : row.cells[ci];
    });
    return { id: `${name}:${i + 1}`, title: row.cells[0] ?? '', fields };
  });
  return { records, kind: 'rows', declared: labels };
}

/** Runs a script (one or many statements) over cards, named sources and tables. */
export function runKql(source: string | Statement[], data: KqlCard[] | KqlData, ctx: KqlContext = {}): KqlOutput[] {
  // A copy: binding columns edits the tree, and a parsed script may be reused.
  const statements: Statement[] = typeof source === 'string' ? parseKqlScript(source) : structuredClone(source);
  const input: KqlData = Array.isArray(data) ? { cards: data } : data;
  const rt = buildRuntime(ctx);
  return withRuntime(rt, () => {
    const variables = new Map<string, Base>();
    const outputs: KqlOutput[] = [];
    for (const st of statements) {
     try {
      let first = resolveBase(st.query.source, input, variables);
      const sourceRef = st.query.source;
      let label = sourceRef.kind === 'cards' ? 'whole team' : sourceRef.kind === 'rows' ? sourceRef.ref : sourceRef.kind === 'values' ? 'values' : sourceRef.name;
      let qualifiers: KqlScope['qualifiers'] = [];
      if (st.query.source.kind === 'rows') { try { label = findTable(st.query.source.ref, input).title; } catch { /* resolveBase already failed */ } }
      if (st.query.scope.length > 0) {
        const scope = resolveScope(st.query.scope, input);
        first = { ...first, records: first.records.filter(scope.keep) };
        label = scope.label;
        qualifiers = scope.resolved;
      }
      const scoped = first.records.length;
      const base = applyCombinations(st.query, first, input, variables, rt);
      const { result, matched } = runQuery(st.query, base, rt);
      result.scope = { source: st.query.source.kind === 'cards' ? 'cards' : label, label, cards: scoped, qualifiers };
      if (st.kind === 'let') {
        const q = st.query;
        const plain = q.group.length === 0 && !(q.select && !q.implicitSelect) && q.metrics.every((m) => m.label === 'count') && !q.limit && !q.offset && !q.having && !q.distinct && !q.tail && !q.droplast && !q.pivot && !q.transpose;
        // a plain selection keeps the records (cards stay cards); anything else is saved as a table with declared columns
        variables.set(st.name, plain ? { records: matched, kind: base.kind, declared: base.declared } : materialize(result, st.name));
      } else {
        outputs.push({ title: st.title, result });
      }
     } catch (e) {
      if (e instanceof KqlError && st.kind === 'let' && st.via) {
        const unknown = /^Unknown name "([^"]+)"/.exec(e.message);
        const hint = unknown && !st.via.tables.includes(unknown[1]) ? ` Inside a function a table comes in as a parameter: fn ${st.via.fn}(${[...st.via.params, unknown[1]].join(', ')}) = ...` : '';
        throw new KqlError(`In ${st.via.fn}(${st.via.params.join(', ')}): ${e.message}${hint}`, e.position);
      }
      throw e;
     }
    }
    if (outputs.length === 0) throw new KqlError('The script has no result: finish with a query such as "cards group by list count".');
    return outputs;
  });
}

/** Cards that satisfy a filter box expression. An empty expression keeps everything. */
export function filterCards(expression: string, cards: KqlCard[], ctx: KqlContext = {}): KqlCard[] {
  if (!expression.trim()) return cards;
  const expr = parseKqlFilter(expression);
  const rt = buildRuntime(ctx);
  const columns = new Map<string, string>();
  for (const c of cards.slice(0, 2000)) for (const k of Object.keys(c.fields ?? {})) if (!columns.has(norm(k))) columns.set(norm(k), k);
  const probe: Query = { source: { kind: 'cards' }, scope: [], unions: [], joins: [], where: expr, group: [], select: null, metrics: [], having: null, order: [], distinct: false, offset: null, limit: null, tail: null, droplast: null, pivot: null, unpivot: null, transpose: null, implicitSelect: false };
  for (const _f of walkFields(probe, 'where', bareColumnBinder(columns, 'cards', () => {}))) void _f;
  return withRuntime(rt, () => cards.filter((c) => evalExpr(expr, c, rt)));
}

/** `{ name, <metric>: value }` rows for a chart: non-numeric columns form the X label, each numeric column is a series. */
export function toChartData(result: KqlResult): Array<Record<string, string | number>> {
  const hasDims = result.columns.some((c) => c.kind === 'dim');
  const labelCols = result.columns.map((c, i) => ({ c, i })).filter(({ c }) => (hasDims ? c.kind === 'dim' : c.kind === 'text'));
  const metricCols = result.columns.filter((c) => c.kind === 'metric');
  return result.rows.map((row) => {
    const name = labelCols.length === 0 ? 'total' : labelCols.map(({ i }) => row.cells[i]).join(' · ');
    const out: Record<string, string | number> = { name };
    metricCols.forEach((c, i) => { out[c.label] = row.values[i]; });
    return out;
  });
}

// ── Reference for the AI ─────────────────────────────────────────────────────

export const KQL_SYNTAX_GUIDE = `KQL (Killio Query Language) — filter, transform, classify and measure anything queryable. One statement per line (or ";").
  <source> [where <condition>] [group by <dim>[, <dim>] | select [distinct] <expr> [as "Name"][, ...]] [<metric>[, <metric>]]
      [having <metric condition>] [order by ... | top N by <metric> | bottom N by <metric>] [offset N] [limit N]
  let name = cards where ...        -- save a selection;  later: from name group by ...
  show <query> as "Title"           -- label a result (a bare query is also shown)
Sources: cards (default) · rows of "Table title" (rows of a database / table brick; also: table "x", database "x") ·
  documents, bricks, items (checklist items), boards, lists, members, groups, activity, scripts · a saved name (let).
  A table's own columns are its fields: rows of "Ventas" where Estado = "Pagado" group by Responsable sum(Monto).
  Columns with spaces: [Fecha de entrega] or "Fecha de entrega". Unknown fields/columns are an error that lists the real ones.
Conditions: and / or / not / ( ). Flags: done, open, overdue, assigned, unassigned, archived.
  field = value | != | ~ /regex/ | ~ "text" | contains | startswith | endswith | < <= > >= | in ("a","b") | not in (...)
  field between A and B | field is empty | field is not empty | "free text" (title/description/tags) | #tag | @name | @[group:ID:Name]
  A value may be a calculation: due < addDays(today(), 7) · due between today() and addDays(today(), 3)
Fields (cards): title, description, list (status/column), board, assignee (person: id, name or email; "me"; @group = any member), group,
  tag, priority, due, start, created, updated, done (completion date), points, comments, progress (0-100), cf.<custom field>.
  Derived numbers: age (days since created), cycle (days created to done), overdue_days (days late; open cards only),
  title_len, tag_count, assignee_count. e.g. cards where age > 30 and tag_count = 0
Dates: 2026-03-01, today, yesterday, tomorrow, now, +7d / -30d (d,w,m,y,h), and windows:
  field in last 30d | next 2w | today | this week | this month | last month | this year   (weeks start on Monday)
Transformations — usable anywhere a field is (conditions, select, group by, metrics, order by, right side of a comparison):
  Text: strip(x) (removes markdown, HTML and mention tokens) trim lower upper capitalize title initials slug reverse words(x) len(x)
        replace(x, "a", "b") | replace(x, /regex/g, "b")  substr(x, start[, len]) left(x, n) right(x, n) truncate(x, n) split(x, "-", 2)
        concat(a, b, ...) coalesce(a, b) join(list, ", ") pad(x, n[, ch]) padleft(x, n[, ch]) repeat(x, n)  (pad and repeat are capped)
        extract(x, /id-(\\d+)/, 1) (a capture group, or the whole match when omitted)
  Yes/no (also usable alone as a condition): contains(x, "a") startswith(x, "a") endswith(x, "a") match(x, /re/i) has(list, "x") isnull(x)
  Numbers: number("$1,234.50") round(x, 2) abs ceil floor sign add sub mul div pow mod least(a, b, ...) greatest(a, b, ...) percent(a, b)
  Dates: date(due, "yyyy-MM-dd" | "dd MMM" | "HH:mm") days(due) (days from today) age(created) (days up to today) diffDays(a, b) (a minus b)
        addDays(d, n) addMonths(d, n) weekday(d) dow(d) (1=Mon) monthname(d) startofweek(d) startofmonth(d) week_of(d) month_of(d)
        quarter(d) isoweek(d) today() now()
  Lists (tag, assignee, group, multi-select columns): count(tag) first(tag) last(tag) sort(tag) unique(tag) has(tag, "bug")
  Conditional: if(points > 5, "big", "small") (also iif); any condition fits, e.g. if(done and has(tag, "bug"), 1, 0)
  Tag groups: rank("Group name") = position of the card's best tag in that group (lower first), for order by.
  Examples: lower(title) contains "bug" · len(strip(description)) > 200 · replace(title, /^\\[[^\\]]*\\]\\s*/, "") · date(created, "yyyy-MM")
Select (list records instead of counting): cards where overdue select title, date(due, "dd MMM") as "Vence", join(assignee, ", ") order by due limit 20
  select distinct list, priority drops repeated rows ("distinct list" alone works too).
Group by: list, board, assignee, group, tag, priority, any column or calculation, day|week|month|year(<date field>) e.g. week(done), month(created).
  A record counts once per assignee / tag / group / list value it has; unassigned and untagged cards get their own row.
Metrics: count (default), percent, sum(x), avg(x), min(x), max(x), median(x), stddev(x), percentile(x, 90), unique(x) (distinct values),
  count(distinct x), join(x[, "sep"]), first(x), last(x), count_if(<condition>), sum_if(x, <condition>), ratio(a, b) (= sum(a) / sum(b)).
After the metrics: having <metric condition> keeps some groups (having count > 5 and avg(points) < 3), top N by <metric> (bottom N: ascending)
  ranks and limits, offset N skips rows (paging with limit).
Join / union (right after the source): <query> join <source | let name | rows of "T"> [as x] on <left field> = <right field> [left]   (unir = join)
  The joined fields are x.field (x defaults to the source name). Keys ignore case and accents; a list key (assignee, tag) matches any element.
  Inner by default, "left" keeps unmatched rows (their x.fields are empty). At most 2 joins. from a union b = two selections or sources together.
  e.g. rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombre group by c.Pais sum(Monto)
Scope (after cards, before join / where; "total" = cards in scope): cards in board "Tablero QA" list "En QA" (or: cards in "Tablero QA / En QA",
  cards in board id "<uuid>", cards in list id "<uuid>", several values: cards in board "A", "B"; Spanish: cards en tablero "A" lista "B").
  A name that matches several boards / lists is an error listing each with its board and id: qualify it. Plain where list = "En QA" matches any list
  with that name; where list = "Tablero QA / En QA" (the path) only that board's. path = "Board / List" is a field: group by path, select path.
Select *: every column in its natural order (tables / files: their own columns, also when empty; named sources: title + declared columns; cards: title, list,
  board, assignee, tag, priority, due, start, created, updated, done, points, comments, progress).
  Also: select * except (Estado, Fecha) | select *, upper(x) as "X", rownum() | select distinct * | select c.* (a joined alias).
  count(*) = count. Anywhere else "*" is an error.
Parameters, functions and expressions (declare them first, one per line; they are expanded when the script is read):
  param minimo = 100 | param estado = "Pagado" | param corte = addDays(today, -30)  -> $minimo, $estado, $corte anywhere; also limit $n, offset $n, top $n
  fn conigv(x) = x * 1.18 | fn bucket(m, corte) = if(m > corte, "alto", "bajo")  -> called like built-ins: select conigv(Monto), bucket(Monto, $minimo)
  A function is one expression over its parameters: built-ins and earlier functions only (no recursion; 8 levels, 500 characters, 20 functions, 20 params).
Table functions (Power Query style: they take tables and values and RETURN A TABLE; declare them above the queries, reuse them with any source):
  fn limpiar(t, minimo) = from t where Monto >= minimo select Cliente, Monto;   -- body = a query; a parameter used as from / join / union is a table
  fn cruzar(a, b) = from a join b as b on Cliente = b.Nombre select Cliente, b.Pais as "Pais", Monto;   -- two tables in, one out (the others are values)
  Call it where a table goes: from limpiar(rows of "Ventas", 500) | limpiar(porCliente, 100) group by Cliente sum(Monto) | join limpiar(t, 1) as x on ...
    | let x = limpiar(...) | nested: from top2(limpiar(rows of "Ventas", 100)). A table argument is rows of "T", cards, values (...), a let name, from <name> or a call.
  Value parameters are bare names in the body (Monto >= minimo, limit n; $minimo also works). A function sees only its parameters and the script's param values.
  Rules: functions are declared above where they are used (so recursion, direct or mutual, is an error); at most 8 levels of nested functions, 40 calls per
    script (KQL_LIMITS.maxFnCalls), 2000 characters per body, 20 functions. A table function cannot be used inside an expression and a scalar one cannot be a source.
  Examples: KQL_FUNCTION_EXAMPLES. For a dialog: parseFunctionDefinitions(script) -> [{ name, params: [{ name, kind: "table" | "value" }], body, kind: "scalar" | "table" }].
  Arithmetic: + - * / % and & (text) with parentheses and unary minus: select Monto * 1.18 as "Con IGV" | where Importe - Costo > 100 | sum(Monto * Cantidad)
    Write spaces around "-" (a-b is one name). Text is read like number("$1,200.50"); unreadable text is an error cell (iserror), x / 0 is empty.
    A quoted name after an operator is text: write [Column] for columns there.
  Power Query style: if cond then a else b, null, and M names: Text.Upper(x) Text.Start(x, 3) Number.Round(x, 2) Date.AddDays(d, 7) List.Sum(x) (same results as
    the KQL names); textbefore(x, "-") textafter(x, "-", -1) intdiv(a, b) year(d) month(d) day(d) todate(x) list_sum(x) list_avg(x) list_min(x) list_max(x).
  Types: text(x) int(x) (whole) decimal(x) bool(x) datetime(x) typeof(x) = text | number | bool | date | list | null. A non-blank value that cannot be converted
    is an error for iserror / try; a blank one stays empty.
  Conditions are values too: select Cliente, Monto > 700 as "Alto" | select a > 1 and b = 2 | group by Monto > 700 count | fn alto(m) = m > 700
    (a comparison with an empty or unreadable value is false). A column alone is true-ish in where: where [Activo].
  Two columns: Monto > Costo | Fin >= Inicio | Monto > c.Limite compare columns when the bare word on the right is a column of the source.
    On cards tag / list / board / priority / assignee / group keep bare words as text (tag = urgente). "Costo" is always text, [Costo] always a column.
  Regex limits: patterns up to 1000 characters; backreferences, nested repetitions, more than 20 repeated groups and repeated overlapping alternatives
    such as (a|aa)+ are rejected; values are cut at 10000 characters when matched (a warning says so); a query may run 2 million regex tests.
  Inline table: values ("Cliente", "Monto") ("ACME", 120) ("Beta", 80)  (first group = header; at most 1000 rows x 50 columns; also after join / union / from).
  let keeps any result (grouped, pivoted, joined...): let g = cards group by list, then from g select list, count | from g join h on ... | from g union h.
  Spanish: parametro, funcion, valores. The catalog of functions is KQL_FUNCTION_CATALOG (category, signature, example).
Row operations (over the rows in their final order, after where and order by):
  rownum([start]) (indice) fill_down(x[, partition]) fill_up(x[, partition]) lag(x[, n]) lead(x[, n]) running_sum(x) (cumsum) running_count()
  rownum() also works in where / order by; the others need select or group by. They see every row before offset / limit / distinct trim the result.
  tail N keeps the last N rows, droplast N removes the last N (cola, quitarultimas). Order applied: offset, droplast, limit, tail.
  group by a pivot b <metric>: one column per value of b (first appearance; more than 50 is an error); one metric; no having; order by key or label.
    A missing cell is 0 for count / sum / count_if / sum_if / unique / percent and empty for avg, min, max, median...
  <source> unpivot Q1, Q2 as "Quarter", "Score" turns columns into rows (names default to Attribute, Value); unpivot except Cliente = all other columns
    (tables only: for cards list them). Without select / group by it shows every column. Write it right after the source, before where.
  transpose [header] (last clause): rows become columns; with header the first column's values name them; old column names go in "Field". Max 200 x 50.
  iserror(number(x)) is true when x is non-blank text number() cannot read (same for date, round, add...); try(number(x), 0) returns the fallback then.
    A blank cell is never an error: where not iserror(number(Monto)) drops the bad rows. Spanish: pivotar, despivotar, transponer, indice.
Spanish keywords work too (donde, y, o, agrupar por, teniendo, saltar, distintos, primeros, últimos, hoy, esta semana, lista, asignado, vence,
  filas de, seleccionar...). Functions are in English.
Examples:
  cards where done in last 30d group by assignee count            -- resolved tasks per person
  cards where done in last 30d group by group count               -- resolved tasks per user group
  cards where overdue and assignee = @TI group by assignee count
  cards where tag ~ /^bug/ group by week(created) count
  cards where list = "En QA" and due in next 7d group by priority count, sum(points)
  cards where overdue_days > 7 group by assignee count, percentile(age, 90)
  cards group by list having count > 2 top 3 by count
  cards where done group by month(done) median(cycle), count_if(points > 3)
  cards group by assignee count(distinct list), sum_if(points, done) top 5 by sum_if(points, done)
  cards where done select strip(title) as "Hecho", date(done, "dd MMM") as "Cuándo" order by done desc limit 10
  cards where has(tag, "bug") and not isnull(due) select title, if(overdue, "late", "ok") as "State", weekday(due) as "Day"
  cards select distinct list order by list offset 1 limit 5
  members join cards on id = assignee group by title count, sum(cards.points)
  cards select rownum() as "#", title, running_sum(points) as "Total" order by created limit 10
  cards select title, lag(points) as "Before", fill_down(points) as "Filled" order by created
  cards select title order by created offset 1 droplast 1
  cards select title order by created tail 3
  cards group by list pivot priority count
  cards unpivot points, comments as "Metric", "Value" select title, Metric, Value limit 5
  cards select title, iserror(number(title)) as "Bad", try(number(title), 0) as "Safe" limit 3
  rows of "Ventas" group by Responsable pivot Estado sum(Monto) transpose header
  rows of "Ventas" unpivot except Cliente as "Campo", "Valor" select Cliente, Campo, Valor limit 6
  rows of "Ventas" where not iserror(number(Monto)) sum(try(number(Monto), 0))
  cards group by path count
  cards select * except (start, created, updated) order by due limit 5
  cards select *, rownum() as "#" limit 3
  rows of "Ventas" select * except Notas limit 5
  rows of "Ventas" group by Responsable count(*)
  cards select title, points * 2 as "Doble", if points > 4 then "big" else "small" as "Size" limit 5
  cards select Text.Upper(title), Date.Year(created), typeof(points), text(points) & "!" limit 3
  rows of "Ventas" select Monto * 1.18 as "Con IGV" limit 3
  rows of "Ventas" where not iserror(Monto + 0) sum(Monto * 2)
  show values ("Cliente", "Monto") ("ACME", 120) ("Beta", 80) group by Cliente sum(Monto * 1.18)
  cards select title, points > 4 as "Alto" limit 3
  cards group by points > 4 count
  cards where points > comments count
  rows of "Ventas" select Cliente, Monto > 700 as "Alto" limit 3
  rows of "Ventas" where Estado = Responsable count
  documents group by month(created) count
  items where not done group by document count
  members select title, email, assigned, resolved order by resolved desc
  rows of "Ventas" where Estado = "Pagado" group by Responsable sum(Monto), count`;
