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
  fields?: Record<string, string | number | boolean | null>;
}

export interface KqlContext {
  now?: Date;
  /** The current user's id, for `me`. */
  me?: string;
  users?: KqlUser[];
  groups?: KqlGroup[];
}

// ── Tokens ───────────────────────────────────────────────────────────────────

type TokType = 'word' | 'str' | 'num' | 'dur' | 'date' | 'regex' | 'op' | '(' | ')' | ',' | '|' | ';' | 'nl' | 'mention' | 'hashtag' | 'eof';
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
  tarjetas: 'cards', cuenta: 'count', suma: 'sum', promedio: 'avg', minimo: 'min', maximo: 'max',
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
    if (c === '/' && source[i + 1] === '/' && !(prev && prev.t === 'op' && (prev.v === '~' || prev.v === '!~'))) {
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
    if (c === '/' && prev && prev.t === 'op' && (prev.v === '~' || prev.v === '!~')) {
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
export interface Field { name: FieldName; custom?: string }

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
  | { t: 'cmp'; field: Field; op: CmpOp; value: Value | { k: 'regex'; v: string; flags: string } }
  | { t: 'in'; field: Field; values: Value[]; negate: boolean }
  | { t: 'between'; field: Field; a: Value; b: Value }
  | { t: 'empty'; field: Field; negate: boolean }
  | { t: 'window'; field: Field; window: TimeWindow }
  | { t: 'flag'; name: 'done' | 'open' | 'overdue' | 'unassigned' | 'assigned' | 'archived' }
  | { t: 'text'; value: string };

export type Bucket = 'day' | 'week' | 'month' | 'year';
export type Dimension = { by: 'list' | 'board' | 'assignee' | 'group' | 'tag' | 'priority' } | { by: 'date'; field: 'due' | 'start' | 'created' | 'updated' | 'completed'; bucket: Bucket };
export type MetricFn = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'percent';
export interface Metric { fn: MetricFn; field?: Field; label: string }
export interface Order { by: 'key' | 'label' | 'metric'; metric?: number; dir: 'asc' | 'desc' }

export interface Query {
  from: string | null;
  where: Expr | null;
  group: Dimension[];
  metrics: Metric[];
  order: Order | null;
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
const MULTI_FIELDS = new Set<FieldName>(['assignee', 'group', 'tag']);
const METRICS = new Set(['count', 'sum', 'avg', 'min', 'max', 'percent']);
const CLAUSE_WORDS = new Set(['where', 'group', 'order', 'limit', 'count', 'sum', 'avg', 'min', 'max', 'percent']);

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

  parseQuery(): Query {
    const q: Query = { from: null, where: null, group: [], metrics: [], order: null, limit: null };
    let explicitMetrics = false;
    if (this.eatKw('cards')) q.from = null;
    else if (this.eatKw('from')) {
      const name = this.next();
      if (name.t !== 'word') throw new KqlError('Expected a name after "from".', name.pos);
      q.from = strip(name.v);
    } else if (this.peek().t === 'word' && !CLAUSE_WORDS.has(this.kw() ?? '') && !this.isKw('cards')) {
      // `show mine group by list`: a name defined earlier with "let"
      q.from = strip(this.next().v);
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
      } else if (this.kw() && METRICS.has(this.kw()!) && this.peek(1).t !== 'op') {
        q.metrics.push(...this.parseMetrics());
        explicitMetrics = true;
      } else if (this.isKw('order')) {
        this.next();
        this.expectKw('by');
        q.order = this.parseOrder(q);
      } else if (this.isKw('limit')) {
        this.next();
        const n = this.next();
        if (n.t !== 'num' || n.n! < 1 || !Number.isInteger(n.n)) throw new KqlError('"limit" needs a whole number.', n.pos);
        q.limit = Math.min(n.n!, 10_000);
      } else break;
    }
    // No metric written in the query: count. A metric that appeared only inside "order by" is an extra column.
    if (!explicitMetrics) {
      q.metrics.unshift({ fn: 'count', label: 'count' });
      if (q.order?.by === 'metric') q.order.metric = (q.order.metric ?? -1) + 1;
    }
    if (q.order?.by === 'metric' && q.order.metric === undefined) q.order.metric = 0;
    return q;
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
    if (tok.t !== 'word') return false;
    const k = KEYWORD_ALIASES[strip(tok.v)] ?? strip(tok.v);
    if (['day', 'week', 'month', 'year', 'dia', 'semana', 'mes', 'ano'].includes(k)) return true;
    const f = FIELD_ALIASES[k];
    return !!f && !['title', 'description', 'id'].includes(f);
  }

  private parseDimension(): Dimension {
    const tok = this.next();
    if (tok.t !== 'word') throw new KqlError('Expected what to group by (list, assignee, group, tag, week(due)...).', tok.pos);
    const k = strip(tok.v);
    const unit = UNIT_ALIASES[k];
    if (unit && ['d', 'w', 'm', 'y'].includes(unit) && this.peek().t === '(') {
      this.next();
      const f = this.next();
      const fk = f.t === 'word' ? FIELD_ALIASES[strip(f.v)] : undefined;
      if (!fk || !DATE_FIELDS.has(fk)) throw new KqlError('A time bucket needs a date field: due, created, updated, done, start.', f.pos);
      const close = this.next();
      if (close.t !== ')') throw new KqlError('Expected ")".', close.pos);
      return { by: 'date', field: fk as 'due', bucket: ({ d: 'day', w: 'week', m: 'month', y: 'year' } as const)[unit as 'd'] };
    }
    const field = FIELD_ALIASES[k];
    if (field === 'list' || field === 'board' || field === 'assignee' || field === 'group' || field === 'tag' || field === 'priority') return { by: field };
    if (field && DATE_FIELDS.has(field)) return { by: 'date', field: field as 'due', bucket: 'day' };
    throw new KqlError(`Cannot group by "${tok.v}". Use list, board, assignee, group, tag, priority or day/week/month/year(date field).`, tok.pos);
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
        const f = this.parseField();
        const close = this.next();
        if (close.t !== ')') throw new KqlError('Expected ")".', close.pos);
        if (!NUMBER_FIELDS.has(f.name) && f.name !== 'custom') throw new KqlError(`${fn}() needs a number field (points, comments, progress or cf.name).`, open.pos);
        out.push({ fn, field: f, label: `${fn}(${f.custom ?? f.name})` });
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
    if (k === 'key' || k === 'label' || k === 'name') {
      this.next();
      readDir();
      return { by: k === 'key' ? 'key' : 'label', dir: dir ?? 'asc' };
    }
    if (k && METRICS.has(k)) {
      const metrics = this.parseMetrics();
      readDir();
      const wanted = metrics[0].label;
      let index = q.metrics.findIndex((m) => m.label === wanted);
      if (index < 0) { q.metrics.push(metrics[0]); index = q.metrics.length - 1; }
      return { by: 'metric', metric: index, dir: dir ?? 'desc' };
    }
    throw new KqlError('"order by" needs key, label or a metric such as count.', this.peek().pos);
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
    if (tok.t === 'str') { this.next(); return { t: 'text', value: tok.v }; }
    if (tok.t === 'hashtag') { this.next(); return { t: 'cmp', field: { name: 'tag' }, op: '=', value: { k: 'tag', v: tok.v } }; }
    if (tok.t === 'mention') {
      this.next();
      return { t: 'cmp', field: { name: tok.kind === 'group' ? 'group' : 'assignee' }, op: '=', value: { k: 'mention', v: tok.v, kind: tok.kind ?? 'name', id: tok.id } };
    }
    if (tok.t !== 'word') throw new KqlError(`Unexpected "${tok.v || 'end of query'}" in the condition.`, tok.pos);

    const word = strip(tok.v);
    const field = this.tryField();
    // `done`, `overdue`, `asignado`... alone are flags; followed by an operator they are fields ("done in last 30d").
    const followedByOperator = () => {
      const n = this.peek(1);
      if (n.t === 'op') return true;
      const k = this.kw(1);
      return !!k && ['in', 'between', 'is', 'contains', 'startswith', 'endswith', 'before', 'after', 'not'].includes(k);
    };
    if (FLAGS[word] && !(field && followedByOperator())) {
      this.next();
      return { t: 'flag', name: FLAGS[word] };
    }
    if (field) {
      this.parseField();
      return this.parsePredicate(field, tok);
    }
    // A bare word is a text search: urgente
    this.next();
    return { t: 'text', value: tok.v };
  }

  private tryField(): Field | null {
    const tok = this.peek();
    if (tok.t !== 'word') return null;
    const raw = tok.v;
    const cf = /^(cf|field|fields|campo)\.(.+)$/i.exec(raw);
    if (cf) return { name: 'custom', custom: cf[2] };
    const k = strip(raw);
    const name = FIELD_ALIASES[k];
    return name ? { name } : null;
  }

  private parseField(): Field {
    const f = this.tryField();
    if (!f) throw new KqlError(`Unknown field "${this.peek().v}".`, this.peek().pos);
    this.next();
    return f;
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

function safeRegex(pattern: string, flags: string): RegExp {
  if (pattern.length > KQL_LIMITS.maxRegex) throw new KqlError(`The pattern is too long (max ${KQL_LIMITS.maxRegex} characters).`);
  // Nested quantifiers such as (a+)+ or (.*)* can take exponential time on crafted input.
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*]|\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\{\d*,?\d*\}/.test(pattern)) {
    throw new KqlError('That pattern has nested repetitions, which are not allowed (they can hang the search).');
  }
  const clean = [...new Set((flags + 'i').split(''))].filter((f) => 'imsu'.includes(f)).join('');
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

function customValue(card: KqlCard, field: Field): string | number | boolean | null {
  const fields = card.fields ?? {};
  const key = Object.keys(fields).find((k) => norm(k) === norm(field.custom));
  return key === undefined ? null : fields[key];
}

function numberOf(card: KqlCard, field: Field): number | null {
  const raw = field.name === 'custom' ? customValue(card, field) : card[field.name as 'points' | 'comments' | 'progress'];
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
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
    case 'custom': { const v = customValue(card, field); return v === null ? [] : [String(v)]; }
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
      if (NUMBER_FIELDS.has(e.field.name)) return evalCmp(card, e.field, '>=', e.a, rt) && evalCmp(card, e.field, '<=', e.b, rt);
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

// ── Running queries ──────────────────────────────────────────────────────────

export interface KqlResultColumn { key: string; label: string; kind: 'dim' | 'metric' }
export interface KqlResultRow { keys: string[]; labels: string[]; values: number[] }
export interface KqlResult {
  columns: KqlResultColumn[];
  rows: KqlResultRow[];
  /** Cards that passed `where`. */
  matched: number;
  /** Cards the query started from. */
  total: number;
}
export interface KqlOutput { title: string | null; result: KqlResult }

const NONE = '(none)';

function dimLabel(dim: Dimension): string {
  return dim.by === 'date' ? `${dim.bucket}(${dim.field === 'completed' ? 'done' : dim.field})` : dim.by;
}

function dimKeys(card: KqlCard, dim: Dimension, rt: Runtime): string[] {
  switch (dim.by) {
    case 'list': return [card.list || NONE];
    case 'board': return [card.board || NONE];
    case 'priority': return [card.priority || NONE];
    case 'assignee': return (card.assignees ?? []).length ? [...new Set(card.assignees)] : [NONE];
    case 'group': { const g = cardGroupIds(card, rt); return g.length ? g : [NONE]; }
    case 'tag': return (card.tags ?? []).length ? [...new Set(card.tags)] : [NONE];
    case 'date': { const d = dateOf(card, { name: dim.field }); return [d ? bucketKey(d, dim.bucket) : NONE]; }
  }
}

function keyLabel(dim: Dimension, key: string, rt: Runtime): string {
  if (key === NONE) return dim.by === 'assignee' ? '(unassigned)' : dim.by === 'group' ? '(no group)' : dim.by === 'tag' ? '(no tag)' : NONE;
  if (dim.by === 'assignee') return userLabel(key, rt);
  if (dim.by === 'group') return rt.groupsByKey.get(key)?.name ?? key;
  return key;
}

function runQuery(q: Query, cards: KqlCard[], rt: Runtime): { result: KqlResult; matchedCards: KqlCard[] } {
  if (cards.length > KQL_LIMITS.maxRows) throw new KqlError(`Too many cards to analyse (max ${KQL_LIMITS.maxRows}).`);
  const matchedCards = q.where ? cards.filter((c) => evalExpr(q.where!, c, rt)) : cards;

  // Rows: one per combination of dimension keys (a card counts once per key, e.g. once per assignee).
  type Acc = { keys: string[]; cards: KqlCard[] };
  const groups = new Map<string, Acc>();
  if (q.group.length === 0) groups.set('', { keys: [], cards: matchedCards });
  else {
    for (const card of matchedCards) {
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

  const metricValue = (m: Metric, group: Acc): number => {
    if (m.fn === 'count') return group.cards.length;
    if (m.fn === 'percent') return matchedCards.length ? Math.round((group.cards.length / matchedCards.length) * 1000) / 10 : 0;
    const nums = group.cards.map((c) => numberOf(c, m.field!)).filter((n): n is number => n !== null);
    if (nums.length === 0) return 0;
    if (m.fn === 'sum') return round(nums.reduce((a, b) => a + b, 0));
    if (m.fn === 'avg') return round(nums.reduce((a, b) => a + b, 0) / nums.length);
    if (m.fn === 'min') return Math.min(...nums);
    return Math.max(...nums);
  };

  let rows: KqlResultRow[] = [...groups.values()].map((g) => ({
    keys: g.keys,
    labels: g.keys.map((k, i) => keyLabel(q.group[i], k, rt)),
    values: q.metrics.map((m) => metricValue(m, g)),
  }));

  const dateFirst = q.group.length > 0 && q.group[0].by === 'date';
  const order: Order = q.order ?? (dateFirst ? { by: 'key', dir: 'asc' } : { by: 'metric', metric: 0, dir: 'desc' });
  const dirSign = order.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (order.by === 'metric') {
      const diff = (a.values[order.metric ?? 0] - b.values[order.metric ?? 0]) * dirSign;
      if (diff !== 0) return diff;
    }
    const left = order.by === 'label' ? a.labels.join(' ') : a.keys.join(' ');
    const right = order.by === 'label' ? b.labels.join(' ') : b.keys.join(' ');
    const cmp = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
    return order.by === 'metric' ? cmp : cmp * dirSign;
  });
  if (q.limit) rows = rows.slice(0, q.limit);

  return {
    matchedCards,
    result: {
      columns: [
        ...q.group.map((d): KqlResultColumn => ({ key: dimLabel(d), label: dimLabel(d), kind: 'dim' })),
        ...q.metrics.map((m): KqlResultColumn => ({ key: m.label, label: m.label, kind: 'metric' })),
      ],
      rows,
      matched: matchedCards.length,
      total: cards.length,
    },
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Runs a script (one or many statements) over the given cards. */
export function runKql(source: string | Statement[], cards: KqlCard[], ctx: KqlContext = {}): KqlOutput[] {
  const statements = typeof source === 'string' ? parseKqlScript(source) : source;
  const rt = buildRuntime(ctx);
  const variables = new Map<string, KqlCard[]>();
  const outputs: KqlOutput[] = [];
  for (const st of statements) {
    const base = st.query.from === null ? cards : variables.get(st.query.from);
    if (!base) throw new KqlError(`Unknown name "${st.query.from}". Define it first with: let ${st.query.from} = cards where ...`);
    const { result, matchedCards } = runQuery(st.query, base, rt);
    if (st.kind === 'let') {
      if (st.query.group.length > 0 || st.query.metrics.some((m) => m.label !== 'count') || st.query.limit) {
        throw new KqlError(`"let ${st.name}" must be a plain selection of cards (where ...), without group by, metrics or limit.`);
      }
      variables.set(st.name, matchedCards);
    } else {
      outputs.push({ title: st.title, result });
    }
  }
  if (outputs.length === 0) throw new KqlError('The script has no result: finish with a query such as "cards group by list count".');
  return outputs;
}

/** Cards that satisfy a filter box expression. An empty expression keeps everything. */
export function filterCards(expression: string, cards: KqlCard[], ctx: KqlContext = {}): KqlCard[] {
  if (!expression.trim()) return cards;
  const expr = parseKqlFilter(expression);
  const rt = buildRuntime(ctx);
  return cards.filter((c) => evalExpr(expr, c, rt));
}

/** `{ name, value }` pairs for a chart (first dimension on the X axis, each metric a series). */
export function toChartData(result: KqlResult): Array<Record<string, string | number>> {
  const dims = result.columns.filter((c) => c.kind === 'dim').length;
  return result.rows.map((row) => {
    const out: Record<string, string | number> = { name: dims === 0 ? 'total' : row.labels.slice(0, dims).join(' · ') };
    result.columns.filter((c) => c.kind === 'metric').forEach((c, i) => { out[c.label] = row.values[i]; });
    return out;
  });
}

// ── Reference for the AI ─────────────────────────────────────────────────────

export const KQL_SYNTAX_GUIDE = `KQL (Killio Query Language) — filter, classify and measure cards. One statement per line (or ";").
  cards [where <condition>] [group by <dim>[, <dim>]] [<metric>[, <metric>]] [order by <key|label|metric> [asc|desc]] [limit N]
  let name = cards where ...        -- save a selection;  later: from name group by ...
  show <query> as "Title"           -- label a result (a bare query is also shown)
Conditions: and / or / not / ( ). Flags: done, open, overdue, assigned, unassigned, archived.
  field = value | != | ~ /regex/ | ~ "text" | contains | startswith | endswith | < <= > >= | in ("a","b") | not in (...)
  field between A and B | field is empty | field is not empty | "free text" (title/description/tags) | #tag | @name | @[group:ID:Name]
Fields: title, description, list (status/column), board, assignee (person: id, name or email; "me"; @group = any member), group,
  tag, priority, due, start, created, updated, done (completion date), points, comments, progress (0-100), cf.<custom field>.
Dates: 2026-03-01, today, yesterday, tomorrow, now, +7d / -30d (d,w,m,y,h), and windows:
  field in last 30d | next 2w | today | this week | this month | last month | this year   (weeks start on Monday)
Group by: list, board, assignee, group, tag, priority, day|week|month|year(<date field>) e.g. week(done), month(created).
  A card counts once per assignee / tag / group it has; unassigned and untagged cards get their own row.
Metrics: count (default), sum(points), avg(points), min(points), max(points), percent.
Spanish keywords work too (donde, y, o, agrupar por, últimos, hoy, esta semana, lista, asignado, vence...).
Examples:
  cards where done in last 30d group by assignee count            -- resolved tasks per person
  cards where done in last 30d group by group count               -- resolved tasks per user group
  cards where overdue and assignee = @TI group by assignee count
  cards where tag ~ /^bug/ group by week(created) count
  cards where list = "En QA" and due in next 7d group by priority count, sum(points)`;
