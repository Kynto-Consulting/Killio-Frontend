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

export const KQL_LIMITS = { maxSource: 6000, maxTokens: 1200, maxDepth: 12, maxRegex: 200, maxRows: 100_000, maxGroups: 5000, maxStatements: 30 };

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
export interface KqlData { cards?: KqlCard[]; sources?: Record<string, KqlCard[]>; tables?: KqlTable[] }

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

type TokType = 'word' | 'str' | 'num' | 'dur' | 'date' | 'regex' | 'ident' | 'op' | '(' | ')' | ',' | '|' | ';' | 'nl' | 'mention' | 'hashtag' | 'eof';
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

/** Spanish keywords are accepted as aliases of the English ones. */
const KEYWORD_ALIASES: Record<string, string> = {
  donde: 'where', y: 'and', o: 'or', en: 'in', agrupar: 'group', por: 'by', ordenar: 'order', limite: 'limit',
  ultimos: 'last', ultimas: 'last', proximos: 'next', proximas: 'next', este: 'this', esta: 'this',
  hoy: 'today', ayer: 'yesterday', manana: 'tomorrow', contiene: 'contains', vacio: 'empty', vacia: 'empty',
  entre: 'between', antes: 'before', despues: 'after', mostrar: 'show', como: 'as', desde: 'from',
  tarjetas: 'cards', filas: 'rows', tabla: 'table', de: 'of', seleccionar: 'select', cuenta: 'count', suma: 'sum', promedio: 'avg', minimo: 'min', maximo: 'max',
  si: 'true', verdadero: 'true', falso: 'false',
};
const UNIT_ALIASES: Record<string, 'h' | 'd' | 'w' | 'm' | 'y'> = {
  h: 'h', hour: 'h', hours: 'h', hora: 'h', horas: 'h',
  d: 'd', day: 'd', days: 'd', dia: 'd', dias: 'd',
  w: 'w', week: 'w', weeks: 'w', semana: 'w', semanas: 'w',
  m: 'm', month: 'm', months: 'm', mes: 'm', meses: 'm',
  y: 'y', year: 'y', years: 'y', ano: 'y', anos: 'y',
};

function tokenize(source: string): Tok[] {
  if (source.length > KQL_LIMITS.maxSource) throw new KqlError(`The query is too long (max ${KQL_LIMITS.maxSource} characters).`);
  const toks: Tok[] = [];
  const push = (tok: Tok) => {
    if (toks.length >= KQL_LIMITS.maxTokens) throw new KqlError('The query is too complex.', tok.pos);
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
    const w = /^[\p{L}_][\p{L}\p{N}_.\-]*/u.exec(source.slice(i));
    if (w) {
      const text = w[0].replace(/[.\-]+$/, '');
      push({ t: 'word', v: text, pos: i });
      i += text.length;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<>', '>=', '<=', '!~'].includes(two)) { push({ t: 'op', v: two === '==' ? '=' : two === '<>' ? '!=' : two, pos: i }); i += 2; continue; }
    if (['=', '<', '>', '~'].includes(c)) { push({ t: 'op', v: c, pos: i }); i++; continue; }
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
  | 'custom';

/** `f(a, b)` — a text / number / date transformation. Its result behaves like a column, so it works anywhere a field does. */
export interface Call { fn: string; args: Arg[] }
export interface RegexLit { k: 'regex'; v: string; flags: string }
export type Arg = { t: 'field'; field: Field } | { t: 'lit'; value: Value | RegexLit };
/**
 * A column of the records. Built-in names (title, due, assignee...), a named column of a table (`custom`), or a
 * computed value (`call`). `raw` keeps what was typed so a table's own column can take over a built-in alias.
 */
export interface Field { name: FieldName; custom?: string; raw?: string; call?: Call }

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
  | { k: 'bool'; v: boolean };

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
  | { t: 'text'; value: string };

export type Bucket = 'day' | 'week' | 'month' | 'year';
export type Dimension =
  | { by: 'list' | 'board' | 'assignee' | 'group' | 'tag' | 'priority'; raw?: string }
  | { by: 'field'; field: Field; label: string }
  | { by: 'date'; field: Field; bucket: Bucket };
export type MetricFn = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'percent' | 'join' | 'first' | 'last' | 'unique';
export interface Metric { fn: MetricFn; field?: Field; sep?: string; label: string }
export interface Projection { field: Field; alias: string }
export type Order =
  | { by: 'key' | 'label'; dir: 'asc' | 'desc' }
  | { by: 'metric'; metric?: number; dir: 'asc' | 'desc' }
  | { by: 'expr'; field: Field; dir: 'asc' | 'desc' };
// A query orders by one or more keys, e.g. `order by rank("Prioridad"), due desc`.

/** Where the records come from: the cards, the rows of a table/database brick, or a named source / saved selection. */
export type SourceRef = { kind: 'cards' } | { kind: 'rows'; ref: string } | { kind: 'name'; name: string };

export interface Query {
  source: SourceRef;
  where: Expr | null;
  group: Dimension[];
  /** Instead of aggregating, list one row per record with these values. */
  select: Projection[] | null;
  metrics: Metric[];
  order: Order[];
  limit: number | null;
}
export type Statement = { kind: 'let'; name: string; query: Query } | { kind: 'show'; query: Query; title: string | null };

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
const NUMBER_FIELDS = new Set<FieldName>(['points', 'comments', 'progress']);
const AGG_COUNTING = new Set(['count', 'percent']);
const AGG_OF_FIELD = new Set(['sum', 'avg', 'min', 'max', 'join', 'first', 'last', 'unique']);
const METRICS = new Set([...AGG_COUNTING, ...AGG_OF_FIELD]);
const CLAUSE_WORDS = new Set(['where', 'group', 'select', 'order', 'limit', 'count', 'sum', 'avg', 'min', 'max', 'percent', 'unique', 'join']);

/** Transformations usable anywhere a field is: [min, max] number of arguments. */
export const KQL_FUNCTIONS: Record<string, [number, number]> = {
  strip: [1, 1], trim: [1, 1], lower: [1, 1], upper: [1, 1], capitalize: [1, 1], initials: [1, 1], slug: [1, 1],
  replace: [3, 3], substr: [2, 3], left: [2, 2], right: [2, 2], truncate: [2, 2], split: [3, 3],
  len: [1, 1], concat: [1, 20], coalesce: [1, 20], join: [1, 2],
  number: [1, 1], round: [1, 2], abs: [1, 1], add: [2, 2], sub: [2, 2], mul: [2, 2], div: [2, 2],
  date: [2, 2], days: [1, 1], rank: [1, 1],
};

export function fieldLabel(field: Field): string {
  if (field.call) return `${field.call.fn}(${field.call.args.map(argLabel).join(', ')})`;
  return field.custom ?? field.raw ?? field.name;
}
function argLabel(a: Arg): string {
  if (a.t === 'field') return fieldLabel(a.field);
  const v = a.value;
  return v.k === 'regex' ? `/${v.v}/${v.flags}` : v.k === 'str' ? JSON.stringify(v.v) : valueText(v);
}

class Parser {
  private i = 0;
  private depth = 0;
  private toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
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

  parseScript(): Statement[] {
    const out: Statement[] = [];
    this.skipSeparators();
    while (!this.atEnd()) {
      if (out.length >= KQL_LIMITS.maxStatements) throw new KqlError(`A script can have at most ${KQL_LIMITS.maxStatements} statements.`);
      out.push(this.parseStatement());
      this.skipSeparators();
    }
    if (out.length === 0) throw new KqlError('The query is empty.');
    return out;
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
    if (t.t !== ';' && t.t !== 'nl' && t.t !== 'eof') throw new KqlError(`Unexpected "${t.v}".`, t.pos);
  }

  /** A newline continues the query when the next token is a clause or connector word. */
  private skipContinuation(): void {
    while (this.peek().t === 'nl') {
      const k = this.kw(1);
      const t1 = this.peek(1);
      const continues = (k && (CLAUSE_WORDS.has(k) || ['and', 'or', 'by', 'not', 'in', 'between', 'is', 'contains', 'as'].includes(k))) || t1.t === '|' || t1.t === ',' || t1.t === ')';
      if (!continues) return;
      this.i++;
    }
  }

  private startsMetric(): boolean {
    const k = this.kw();
    if (!k || !METRICS.has(k)) return false;
    if (AGG_COUNTING.has(k)) return this.peek(1).t !== 'op';
    return this.peek(1).t === '(';
  }

  parseQuery(): Query {
    const q: Query = { source: { kind: 'cards' }, where: null, group: [], select: null, metrics: [], order: [], limit: null };
    let explicitMetrics = false;
    if (this.eatKw('cards')) {
      /* default source */
    } else if (this.isKw('rows') || this.isKw('table') || this.isKw('database') || this.isKw('db')) {
      // rows of "Sales" / table "Sales" / database [Task tracker]
      this.next();
      this.eatKw('of');
      const ref = this.next();
      if (ref.t !== 'str' && ref.t !== 'ident' && ref.t !== 'word' && ref.t !== 'num') throw new KqlError('Expected the table\'s title or id after "rows of", e.g. rows of "Sales".', ref.pos);
      q.source = { kind: 'rows', ref: ref.v };
    } else if (this.eatKw('from')) {
      const name = this.next();
      if (name.t !== 'word' && name.t !== 'str' && name.t !== 'ident') throw new KqlError('Expected a name after "from".', name.pos);
      q.source = { kind: 'name', name: strip(name.v) };
    } else if (this.peek().t === 'word' && !CLAUSE_WORDS.has(this.kw() ?? '') && !this.isKw('cards')) {
      // `show mine group by list`, `documents where ...`: a name defined with "let", or a data source
      q.source = { kind: 'name', name: strip(this.next().v) };
    }
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
        q.select = this.parseProjections();
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
        const n = this.next();
        if (n.t !== 'num' || n.n! < 1 || !Number.isInteger(n.n)) throw new KqlError('"limit" needs a whole number.', n.pos);
        q.limit = Math.min(n.n!, 10_000);
      } else break;
    }
    if (q.select && (q.group.length > 0 || explicitMetrics)) throw new KqlError('"select" lists records; it cannot be combined with "group by" or metrics.', this.peek().pos);
    // No metric written in the query: count. A metric that appeared only inside "order by" is an extra column.
    if (!explicitMetrics && !q.select) {
      q.metrics.unshift({ fn: 'count', label: 'count' });
      for (const o of q.order) if (o.by === 'metric') o.metric = (o.metric ?? -1) + 1;
    }
    for (const o of q.order) if (o.by === 'metric' && o.metric === undefined) o.metric = 0;
    return q;
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
    return tok.t === 'word' && this.peek(1).t === '(' && Object.prototype.hasOwnProperty.call(KQL_FUNCTIONS, strip(tok.v));
  }

  private tryField(): Field | null {
    const tok = this.peek();
    if (tok.t !== 'word') return null;
    const cf = /^(cf|field|fields|campo|col|column|columna)\.(.+)$/i.exec(tok.v);
    if (cf) return { name: 'custom', custom: cf[2], raw: cf[2] };
    const name = FIELD_ALIASES[strip(tok.v)];
    return name ? { name, raw: tok.v } : null;
  }

  /**
   * A field in a place where one is expected: a built-in name, `[Column name]`, "Column name", a function call, or
   * any other word, which names a column of the table being queried.
   */
  parseOperand(): Field {
    const tok = this.peek();
    if (this.isCallAhead()) return { name: 'custom', call: this.parseCall() };
    if (tok.t === 'ident' || tok.t === 'str') { this.next(); return { name: 'custom', custom: tok.v, raw: tok.v }; }
    if (tok.t === 'word') {
      const known = this.tryField();
      this.next();
      return known ?? { name: 'custom', custom: tok.v, raw: tok.v };
    }
    throw new KqlError(`Expected a field but found "${tok.v || 'end of query'}".`, tok.pos);
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
      args.push(this.parseArg());
      if (this.peek().t === ',') this.next();
      else break;
    }
    this.leave();
    const close = this.next();
    if (close.t !== ')') throw new KqlError(`Expected ")" to close ${fn}(...).`, close.pos);
    if (args.length < min || args.length > max) throw new KqlError(`${fn}() takes ${min === max ? min : `${min} to ${max}`} argument${max === 1 ? '' : 's'}, not ${args.length}.`, nameTok.pos);
    return { fn, args };
  }

  private parseArg(): Arg {
    const tok = this.peek();
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
        if (this.isCallAhead()) return { t: 'field', field: this.parseOperand() };
        const k = KEYWORD_ALIASES[strip(tok.v)] ?? strip(tok.v);
        if (k === 'true' || k === 'yes') { this.next(); return { t: 'lit', value: { k: 'bool', v: true } }; }
        if (k === 'false') { this.next(); return { t: 'lit', value: { k: 'bool', v: false } }; }
        if (k === 'me') { this.next(); return { t: 'lit', value: { k: 'me' } }; }
        if (k === 'today' || k === 'yesterday' || k === 'tomorrow' || k === 'now') { this.next(); return { t: 'lit', value: { k: 'day', v: k } }; }
        return { t: 'field', field: this.parseOperand() };
      }
      default: throw new KqlError(`Unexpected "${tok.v || 'end of query'}" in the arguments.`, tok.pos);
    }
  }

  private parseProjections(): Projection[] {
    const out: Projection[] = [];
    for (;;) {
      const field = this.parseOperand();
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
    const field = this.parseOperand();
    return { by: 'field', field, label: fieldLabel(field) };
  }

  private parseMetrics(): Metric[] {
    const out: Metric[] = [];
    for (;;) {
      const tok = this.next();
      const fn = (KEYWORD_ALIASES[strip(tok.v)] ?? strip(tok.v)) as MetricFn;
      if (fn === 'count' || fn === 'percent') {
        if (this.peek().t === '(') { this.next(); if (this.peek().t === ')') this.next(); else throw new KqlError(`${fn} takes no field.`, this.peek().pos); }
        out.push({ fn, label: fn });
      } else {
        const open = this.next();
        if (open.t !== '(') throw new KqlError(`${fn} needs a field, e.g. ${fn}(points).`, open.pos);
        const field = this.parseOperand();
        let sep: string | undefined;
        if (fn === 'join' && this.peek().t === ',') { this.next(); const s = this.next(); if (s.t !== 'str') throw new KqlError('join(field, "separator") needs the separator as text.', s.pos); sep = s.v; }
        const close = this.next();
        if (close.t !== ')') throw new KqlError('Expected ")".', close.pos);
        if (['sum', 'avg', 'min', 'max'].includes(fn) && field.name !== 'custom' && !NUMBER_FIELDS.has(field.name)) throw new KqlError(`${fn}() needs a number field (points, comments, progress, a number column or a calculation).`, open.pos);
        out.push({ fn, field, sep, label: `${fn}(${fieldLabel(field)})` });
      }
      if (this.peek().t === ',' && this.kw(1) && METRICS.has(this.kw(1)!)) { this.i++; continue; }
      break;
    }
    return out;
  }

  private parseOrder(q: Query): Order {
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
      return { by: 'metric', metric: index, dir: dir ?? 'desc' };
    }
    const field = this.parseOperand();
    readDir();
    return { by: 'expr', field, dir: dir ?? 'asc' };
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

  private parseAtom(): Expr {
    const tok = this.peek();
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
    if (tok.t !== 'word') throw new KqlError(`Unexpected "${tok.v || 'end of query'}" in the condition.`, tok.pos);

    if (this.isCallAhead()) return this.parsePredicate(this.parseOperand(), tok);

    const word = strip(tok.v);
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
      this.expectKw('empty');
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
    const tok = this.next();
    switch (tok.t) {
      case 'str': return { k: 'str', v: tok.v };
      case 'num': return { k: 'num', v: tok.n! };
      case 'date': return { k: 'date', v: tok.v };
      case 'hashtag': return { k: 'tag', v: tok.v };
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
        if (DATE_FIELDS.has(field.name) || NUMBER_FIELDS.has(field.name)) throw new KqlError(`Unexpected "${tok.v}": expected a ${DATE_FIELDS.has(field.name) ? 'date' : 'number'}.`, tok.pos);
        return { k: 'word', v: tok.v };
      }
      default:
        throw new KqlError(`Expected a value but found "${tok.v || 'end of query'}".`, tok.pos);
    }
  }
}

export function parseKqlScript(source: string): Statement[] {
  return new Parser(tokenize(source)).parseScript();
}

/** A condition only (what a filter box accepts): `done and assignee = me`. */
export function parseKqlFilter(source: string): Expr {
  const parser = new Parser(tokenize(source));
  parser.eatKw('where');
  const expr = parser.parseExpr();
  if (!parser.atEnd()) throw new KqlError(`Unexpected "${parser.peek().v}".`, parser.peek().pos);
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
    const s = st.query.source;
    if (s.kind === 'cards') cards = true;
    else if (s.kind === 'rows') tables.add(s.ref);
    else if (!defined.has(s.name)) sources.add(s.name);
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

function safeRegex(pattern: string, flags: string, caseInsensitiveByDefault = true): RegExp {
  if (pattern.length > KQL_LIMITS.maxRegex) throw new KqlError(`The pattern is too long (max ${KQL_LIMITS.maxRegex} characters).`);
  // Nested quantifiers such as (a+)+ or (.*)* can take exponential time on crafted input.
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
  return { now: ctx.now ?? new Date(), ctx, groupsByKey, usersByKey, userGroups, regexCache: new Map(), actorCache: new Map(), groupCache: new Map() };
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

function numberOf(card: KqlCard, field: Field): number | null {
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
    return re.test(candidate);
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

function evalCmp(card: KqlCard, field: Field, op: CmpOp, v: Value | { k: 'regex'; v: string; flags: string }, rt: Runtime): boolean {
  const negated = op === '!=' || op === '!~' || op === 'not contains';
  if (DATE_FIELDS.has(field.name) || (field.name === 'custom' && ['date', 'rel', 'day'].includes(v.k))) {
    const d = dateOf(card, field);
    const target = valueToTime(v as Value, rt);
    if (target === null) throw new KqlError(`"${valueText(v)}" is not a valid date.`);
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
    if (!Number.isFinite(target)) throw new KqlError(`"${valueText(v)}" is not a number.`);
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
  const candidates = stringsOf(card, field, rt);
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
      if (NUMBER_FIELDS.has(e.field.name) || e.a.k === 'num') return evalCmp(card, e.field, '>=', e.a, rt) && evalCmp(card, e.field, '<=', e.b, rt);
      const d = dateOf(card, e.field);
      const a = valueToTime(e.a, rt);
      let b = valueToTime(e.b, rt);
      if (a === null || b === null) throw new KqlError('"between" needs two dates or two numbers.');
      if (e.b.k === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(e.b.v)) b += DAY - 1; // inclusive end day
      return !!d && d.getTime() >= a && d.getTime() <= b;
    }
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

function argValue(arg: Arg, card: KqlCard): Cell | RegExp {
  if (arg.t === 'field') return valueOfField(card, arg.field);
  const v = arg.value;
  switch (v.k) {
    case 'regex': return safeRegex(v.v, v.flags, false);
    case 'num': return v.v;
    case 'bool': return v.v;
    case 'rel': return shift(runtimeNow(), v.n, v.unit).toISOString();
    case 'day': return (v.v === 'now' ? runtimeNow() : v.v === 'today' ? startOfDay(runtimeNow()) : v.v === 'yesterday' ? addDays(startOfDay(runtimeNow()), -1) : addDays(startOfDay(runtimeNow()), 1)).toISOString();
    case 'me': return activeRuntime?.ctx.me ?? null;
    default: return v.v;
  }
}

function evalCall(call: Call, card: KqlCard): Cell {
  const a = call.args.map((x) => argValue(x, card));
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
      return pattern instanceof RegExp ? s(0).replace(pattern, s(2)) : s(0).split(cellText(pattern)).join(s(2));
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
      const pieces = a[1] instanceof RegExp ? s(0).split(a[1]) : s(0).split(cellText(a[1]));
      const idx = n(2) ?? 1;
      const piece = idx > 0 ? pieces[idx - 1] : pieces[pieces.length + idx];
      return piece === undefined ? null : piece.trim();
    }
    case 'len': return Array.isArray(a[0]) ? a[0].length : s(0).length;
    case 'concat': return a.map(cellText).join('');
    case 'coalesce': return (a.find((x) => !cellEmpty(x)) as Cell | undefined) ?? null;
    case 'join': return Array.isArray(a[0]) ? a[0].join(call.args.length > 1 ? s(1) : ', ') : s(0);
    case 'number': return num(n(0));
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
    default: throw new KqlError(`Unknown function ${call.fn}().`);
  }
}

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

interface Base { records: KqlCard[]; kind: 'cards' | 'rows' | 'source' }

function* walkFields(q: Query): Generator<Field> {
  function* inArg(a: Arg): Generator<Field> { if (a.t === 'field') yield* inField(a.field); }
  function* inField(f: Field): Generator<Field> { yield f; if (f.call) for (const a of f.call.args) yield* inArg(a); }
  function* inExpr(e: Expr): Generator<Field> {
    switch (e.t) {
      case 'and': case 'or': yield* inExpr(e.l); yield* inExpr(e.r); break;
      case 'not': yield* inExpr(e.e); break;
      case 'cmp': case 'in': case 'between': case 'empty': case 'window': yield* inField(e.field); break;
      default: break;
    }
  }
  if (q.where) yield* inExpr(q.where);
  for (const d of q.group) if (d.by === 'field' || d.by === 'date') yield* inField(d.field);
  for (const p of q.select ?? []) yield* inField(p.field);
  for (const m of q.metrics) if (m.field) yield* inField(m.field);
  for (const o of q.order) if (o.by === 'expr') yield* inField(o.field);
}

/**
 * Binds the names typed in the query to the records' columns. A table's own column wins over a built-in alias
 * ("Estado" is a column, not the list); a name that matches nothing is an error that lists what exists.
 */
function bindFields(q: Query, base: Base): void {
  const columns = new Map<string, string>();
  for (const r of base.records.slice(0, 2000)) for (const k of Object.keys(r.fields ?? {})) if (!columns.has(norm(k))) columns.set(norm(k), k);
  // `order by Importe` where Importe is the name given in select
  const aliases = new Map((q.select ?? []).map((p) => [norm(p.alias), p.field]));
  q.order = q.order.map((o) => (o.by === 'expr' && !o.field.call && aliases.has(norm(o.field.custom ?? o.field.raw ?? '')) ? { ...o, field: aliases.get(norm(o.field.custom ?? o.field.raw ?? ''))! } : o));
  // `group by Responsable` over a table that has a Responsable column groups by the column, not by assignee
  if (base.kind !== 'cards') {
    q.group = q.group.map((d) => {
      const column = 'raw' in d && d.raw ? columns.get(norm(d.raw)) : undefined;
      return column && d.by !== 'field' && d.by !== 'date' ? { by: 'field', field: { name: 'custom', custom: column, raw: d.raw }, label: column } : d;
    });
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
        throw new KqlError(`Unknown ${base.kind === 'cards' ? 'field' : 'column'} "${f.custom}".${known.length ? ` Available: ${known.join(', ')}.` : base.kind === 'cards' ? ' Built-in fields: title, list, assignee, tag, due, done, points...' : ''}`);
      }
    }
  }
}

function runQuery(q: Query, base: Base, rt: Runtime): { result: KqlResult; matched: KqlCard[] } {
  const cards = base.records;
  if (cards.length > KQL_LIMITS.maxRows) throw new KqlError(`Too many records to analyse (max ${KQL_LIMITS.maxRows}).`);
  bindFields(q, base);
  const matched = q.where ? cards.filter((c) => evalExpr(q.where!, c, rt)) : cards;

  // ── Projection: one row per record ──
  if (q.select) {
    let list = matched;
    if (q.order.length > 0) {
      if (q.order.some((o) => o.by === 'metric')) throw new KqlError('"order by" a metric needs "group by" or metrics; with "select" order by a field.');
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
    if (q.limit) list = list.slice(0, q.limit);
    const table = list.map((c) => q.select!.map((p) => valueOfField(c, p.field)));
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
    const nums = group.cards.map((c) => numberOf(c, m.field!)).filter((n): n is number => n !== null);
    if (nums.length === 0) return { value: 0, text: '0' };
    const v = m.fn === 'sum' ? round(nums.reduce((x, y) => x + y, 0)) : m.fn === 'avg' ? round(nums.reduce((x, y) => x + y, 0) / nums.length) : m.fn === 'min' ? Math.min(...nums) : Math.max(...nums);
    return { value: v, text: fmt(v) };
  };

  let rows: KqlResultRow[] = [...groups.values()].map((g) => {
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
  if (q.limit) rows = rows.slice(0, q.limit);

  const columns: KqlResultColumn[] = [
    ...q.group.map((d): KqlResultColumn => ({ key: dimLabel(d), label: dimLabel(d), kind: 'dim' })),
    ...q.metrics.map((m): KqlResultColumn => ({ key: m.label, label: m.label, kind: isTextMetric(m) ? 'text' : 'metric' })),
  ];
  return {
    matched,
    result: { columns, rows, shape: q.group.length === 0 && q.metrics.length === 1 ? 'scalar' : columns.length === 1 ? 'list' : 'table', matched: matched.length, total: cards.length },
  };
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
  if (src.kind === 'cards') return { records: data.cards ?? [], kind: 'cards' };
  if (src.kind === 'rows') return { records: findTable(src.ref, data).rows, kind: 'rows' };
  const saved = variables.get(src.name);
  if (saved) return saved;
  const named = data.sources?.[src.name];
  if (named) return { records: named, kind: 'source' };
  const tableHit = (data.tables ?? []).find((t) => norm(t.title) === src.name || t.id === src.name);
  if (tableHit) return { records: tableHit.rows, kind: 'rows' };
  const available = Object.keys(data.sources ?? {});
  throw new KqlError(`Unknown name "${src.name}". Define it first with: let ${src.name} = cards where ...${available.length ? ` · sources: ${available.join(', ')}` : ''}`);
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
      const base = resolveBase(st.query.source, input, variables);
      const { result, matched } = runQuery(st.query, base, rt);
      if (st.kind === 'let') {
        if (st.query.group.length > 0 || st.query.select || st.query.metrics.some((m) => m.label !== 'count') || st.query.limit) {
          throw new KqlError(`"let ${st.name}" must be a plain selection (where ...), without group by, select, metrics or limit.`);
        }
        variables.set(st.name, { records: matched, kind: base.kind });
      } else {
        outputs.push({ title: st.title, result });
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
  <source> [where <condition>] [group by <dim>[, <dim>] | select <expr> [as "Name"][, ...]] [<metric>[, <metric>]] [order by ...] [limit N]
  let name = cards where ...        -- save a selection;  later: from name group by ...
  show <query> as "Title"           -- label a result (a bare query is also shown)
Sources: cards (default) · rows of "Table title" (rows of a database / table brick; also: table "x", database "x") ·
  documents, bricks, items (checklist items), boards, lists, members, groups, activity, scripts · a saved name (let).
  A table's own columns are its fields: rows of "Ventas" where Estado = "Pagado" group by Responsable sum(Monto).
  Columns with spaces: [Fecha de entrega] or "Fecha de entrega". Unknown fields/columns are an error that lists the real ones.
Conditions: and / or / not / ( ). Flags: done, open, overdue, assigned, unassigned, archived.
  field = value | != | ~ /regex/ | ~ "text" | contains | startswith | endswith | < <= > >= | in ("a","b") | not in (...)
  field between A and B | field is empty | field is not empty | "free text" (title/description/tags) | #tag | @name | @[group:ID:Name]
Fields (cards): title, description, list (status/column), board, assignee (person: id, name or email; "me"; @group = any member), group,
  tag, priority, due, start, created, updated, done (completion date), points, comments, progress (0-100), cf.<custom field>.
Dates: 2026-03-01, today, yesterday, tomorrow, now, +7d / -30d (d,w,m,y,h), and windows:
  field in last 30d | next 2w | today | this week | this month | last month | this year   (weeks start on Monday)
Transformations — usable anywhere a field is (conditions, select, group by, metrics, order by):
  Text: strip(x) (removes markdown, HTML and mention tokens) trim lower upper capitalize initials slug  replace(x, "a", "b") | replace(x, /regex/g, "b")
        substr(x, start[, len]) left(x, n) right(x, n) truncate(x, n) split(x, "-", 2) concat(a, b, ...) coalesce(a, b) join(list, ", ") len(x)
  Numbers: number("$1,234.50") round(x, 2) abs add sub mul div     Dates: date(due, "yyyy-MM-dd" | "dd MMM" | "HH:mm") days(due) (days from today)
  Tag groups: rank("Group name") = position of the card's best tag in that group (lower first), for order by.
  Examples: lower(title) contains "bug" · len(strip(description)) > 200 · replace(title, /^\\[[^\\]]*\\]\\s*/, "") · date(created, "yyyy-MM")
Select (list records instead of counting): cards where overdue select title, date(due, "dd MMM") as "Vence", join(assignee, ", ") order by due limit 20
Group by: list, board, assignee, group, tag, priority, any column or calculation, day|week|month|year(<date field>) e.g. week(done), month(created).
  A record counts once per assignee / tag / group / list value it has; unassigned and untagged cards get their own row.
Metrics: count (default), percent, sum(x), avg(x), min(x), max(x), unique(x) (distinct values), join(x[, "sep"]), first(x), last(x).
Spanish keywords work too (donde, y, o, agrupar por, últimos, hoy, esta semana, lista, asignado, vence, filas de, seleccionar...). Functions are in English.
Examples:
  cards where done in last 30d group by assignee count            -- resolved tasks per person
  cards where done in last 30d group by group count               -- resolved tasks per user group
  cards where overdue and assignee = @TI group by assignee count
  cards where tag ~ /^bug/ group by week(created) count
  cards where list = "En QA" and due in next 7d group by priority count, sum(points)
  cards where done select strip(title) as "Hecho", date(done, "dd MMM") as "Cuándo" order by done desc limit 10
  documents group by month(created) count
  items where not done group by document count
  members select title, email, assigned, resolved order by resolved desc
  rows of "Ventas" where Estado = "Pagado" group by Responsable sum(Monto), count`;
