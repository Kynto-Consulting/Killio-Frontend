/**
 * Compiles a query flow (a graph of steps) into ONE KQL script. Pure: no React, no engine import.
 *
 * Steps run left to right. A chain of steps becomes one query; the inputs of a join / union that are more than
 * a bare source become `let` statements (KQL's `let` holds a plain selection: source, joins and `where`). Every
 * user value is quoted here, so a stray quote or bracket can never change the meaning of the script.
 *
 * The order of clauses inside one query is fixed by KQL (where -> shape -> sort -> offset/limit), so a step that cannot
 * come after the previous one (a filter after a group, anything after a limit) is reported as an error of that node.
 */
import { dataOf, DEFAULT_QUERY_ID } from './defaults.ts';
import { WORD_SOURCES } from './types.ts';
import { parseFunctionDefinitions } from '../query/kql.ts';
import { INLINE_MAX_COLUMNS, INLINE_MAX_ROWS } from './types.ts';
import type { FlowFunction, FlowParam, InlineTable } from './types.ts';
import type {
  CompileOptions, CompileResult, Condition, FilterData, FlowError, FlowGraph, FlowNode, GroupData, JoinData, LimitData,
  OutputData, SelectData, SortData, SourceData, TransformColumn, TransformData, ValueType, DistinctData, AdvancedData, UnpivotData, PivotData, TransposeData,
} from './types.ts';

// ── quoting ──────────────────────────────────────────────────────────────────

/** "text" with `\`, `"` and line breaks escaped the way the KQL tokenizer reads them. */
export function quoteString(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
}

/** `/pattern/flags`. A value already written as /.../flags is kept; otherwise it is the pattern and unescaped slashes are escaped. */
export function regexLiteral(source: string): string {
  const raw = source.trim();
  if (!raw) throw new Error('Write a pattern.');
  const written = /^\/([\s\S]+)\/([a-z]*)$/i.exec(raw);
  if (written) {
    let ok = true;
    for (let i = 0; i < written[1].length; i++) {
      if (written[1][i] === '\\') { i++; continue; }
      if (written[1][i] === '/') { ok = false; break; }
    }
    if (ok) return raw;
  }
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '\\' && i + 1 < raw.length) { out += c + raw[i + 1]; i++; } else if (c === '/') out += '\\/'; else if (c === '\n' || c === '\r') out += ' '; else out += c;
  }
  return `/${out}/`;
}

const RESERVED = new Set([
  'where', 'group', 'select', 'distinct', 'order', 'limit', 'offset', 'having', 'top', 'bottom', 'show', 'let', 'from', 'join', 'union', 'on', 'left', 'inner',
  'and', 'or', 'not', 'by', 'as', 'in', 'between', 'is', 'empty', 'contains', 'startswith', 'endswith', 'asc', 'desc', 'cards', 'rows', 'of', 'table', 'database', 'db',
  'count', 'sum', 'avg', 'min', 'max', 'percent', 'median', 'stddev', 'unique', 'first', 'last', 'join', 'percentile', 'count_if', 'sum_if', 'ratio',
  'true', 'false', 'today', 'yesterday', 'tomorrow', 'now', 'me', 'next', 'this', 'key', 'label',
  // Spanish keywords
  'donde', 'y', 'o', 'en', 'agrupar', 'por', 'ordenar', 'limite', 'ultimos', 'ultimas', 'proximos', 'proximas', 'este', 'esta', 'hoy', 'ayer', 'manana', 'contiene',
  'vacio', 'vacia', 'entre', 'antes', 'despues', 'mostrar', 'como', 'desde', 'tarjetas', 'filas', 'tabla', 'de', 'seleccionar', 'cuenta', 'suma', 'promedio', 'minimo',
  'maximo', 'si', 'verdadero', 'falso', 'unir', 'teniendo', 'saltar', 'distintos', 'primeros', 'mediana', 'percentil', 'desviacion',
]);
const foldKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** A column on the right of an operator is written [Column] (a plain word there would be read as text); calls, numbers and strings stay. */
export function rightOperand(x: string): string {
  const t = x.trim();
  if (/^\[.*\]$/.test(t) || /^[\p{L}_][\p{L}\p{N}_]*\(/u.test(t) || /^"/.test(t) || NUMBER_RE.test(t) || /^\$/.test(t)) return t;
  if (/^[\p{L}_][\p{L}\p{N}_.\-]*$/u.test(t)) return `[${t}]`;
  return t;
}

/** A column / field as KQL text: a plain word as is, an expression as typed, anything else as [Name]. */
export function quoteIdent(name: string): string {
  const t = name.trim();
  if (!t) throw new Error('Choose a field.');
  if (/^[\p{L}_][\p{L}\p{N}_.\-]*$/u.test(t) && !/[.\-]$/.test(t) && !RESERVED.has(foldKey(t))) return t;
  if (t.startsWith('[') && t.endsWith(']') && !t.slice(1, -1).includes(']')) return t;
  if (t.startsWith('"') && t.endsWith('"') && t.length > 1) return t;
  if (/^[\p{L}_][\p{L}\p{N}_]*\([\s\S]*\)$/u.test(t)) return t;
  if (t.includes(']')) return quoteString(t);
  return `[${t}]`;
}

const NUMBER_RE = /^[+-]?\d+(\.\d+)?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?Z?)?$/;
const RELATIVE_RE = /^[+-]\d+[hdwmy]$/i;
const DAY_WORDS = new Set(['today', 'yesterday', 'tomorrow', 'now']);

/** A value as KQL text. `auto` keeps numbers, dates, +7d and today bare and quotes the rest. */
export function literal(value: string, vtype: ValueType = 'auto'): string {
  const v = value.trim();
  switch (vtype) {
    case 'text': return quoteString(value);
    case 'number':
      if (!NUMBER_RE.test(v)) throw new Error(`"${value}" is not a number.`);
      return v;
    case 'raw':
      if (!v) throw new Error('Write a value.');
      return v;
    case 'regex': return regexLiteral(value);
    default:
      if (NUMBER_RE.test(v) || ISO_DATE_RE.test(v) || RELATIVE_RE.test(v) || DAY_WORDS.has(v.toLowerCase())) return v;
      // what the completion list inserts is already KQL: a quoted string, @name, @[group:id:Name], #tag, me
      if (/^\$[\p{L}_][\p{L}\p{N}_]*$/u.test(v)) return v; // a parameter
      if (/^"(?:[^"\\]|\\.)*"$/.test(v) || /^'(?:[^'\\]|\\.)*'$/.test(v) || /^@\[[a-z]+:[^:\]]+:[^\]]*\]$/i.test(v) || /^[@#][\p{L}\p{N}_][\p{L}\p{N}_.\-]*$/u.test(v) || v === 'me') return v;
      return quoteString(value);
  }
}

// ── state of one chain ───────────────────────────────────────────────────────

interface State {
  /** Source text including joins / unions: `cards`, `from b1`, `rows of "A" join ...`. */
  source: string;
  /** Text usable after `join` / `union` when this state is an untouched source. */
  bare: string | null;
  where: string[];
  cols: string[] | null;
  /** lower(column) -> KQL expression of a computed / renamed column. */
  defs: Record<string, string>;
  /** Computed column names in creation order (used when the base columns are unknown). */
  defOrder: string[];
  shaped: boolean;
  group: string | null;
  /** `select *`: every column minus `except` (columns not known statically). */
  star: { except: string[] } | null;
  /** The pieces of `group` (the Pivot step puts its clause between the dimensions and the metric). */
  groupParts: { dims: string[]; metrics: string[]; having: string } | null;
  pivot: string | null;
  tail: number | null;
  droplast: number | null;
  transpose: 'plain' | 'header' | null;
  unpivoted: boolean;
  distinct: boolean;
  distinctCols: string[] | null;
  order: string[];
  offset: number | null;
  limit: number | null;
  joined: number;
  /** Only source / filter / join steps so far: can be saved with `let`. */
  recordOnly: boolean;
  /** Source node the chain starts from (columns of a joined table). */
  rootSource: SourceData | null;
}

const cloneState = (s: State): State => ({ ...s, where: [...s.where], cols: s.cols ? [...s.cols] : null, defs: { ...s.defs }, defOrder: [...s.defOrder], order: [...s.order], distinctCols: s.distinctCols ? [...s.distinctCols] : null });

/** `values ("a", "b") ("x", 1)`: the header row first, numbers bare, the rest quoted. */
export function inlineTableText(table: InlineTable | undefined): string {
  if (!table || table.columns.length === 0) throw new Error('Add at least one column to the table.');
  const names = table.columns.map((c) => c.trim());
  if (names.some((c) => c === '')) throw new Error('Every column needs a name.');
  if (new Set(names.map(foldKey)).size !== names.length) throw new Error('Two columns have the same name.');
  if (table.rows.length === 0) throw new Error('Add at least one row.');
  if (names.length > INLINE_MAX_COLUMNS) throw new Error(`A table typed by hand has at most ${INLINE_MAX_COLUMNS} columns (this has ${names.length}).`);
  if (table.rows.length > INLINE_MAX_ROWS) throw new Error(`A table typed by hand has at most ${INLINE_MAX_ROWS} rows (this has ${table.rows.length}).`);
  const cell = (rowIndex: number, i: number, raw: string): string => {
    const v = raw.trim();
    const type = table.types?.[i] ?? 'auto';
    if (v === '') return 'null';
    const where = `Row ${rowIndex + 1}, column "${names[i]}"`;
    switch (type) {
      case 'text': return quoteString(raw);
      case 'number':
        if (!NUMBER_RE.test(v)) throw new Error(`${where}: "${raw}" is not a number.`);
        return v;
      case 'bool':
        if (/^(true|yes|si|sí|1)$/i.test(v)) return 'true';
        if (/^(false|no|0)$/i.test(v)) return 'false';
        throw new Error(`${where}: "${raw}" is not true or false.`);
      case 'date':
        if (!ISO_DATE_RE.test(v)) throw new Error(`${where}: "${raw}" is not a date (yyyy-MM-dd).`);
        return v;
      default:
        if (NUMBER_RE.test(v) || ISO_DATE_RE.test(v)) return v;
        if (/^(true|false)$/i.test(v)) return v.toLowerCase();
        return quoteString(raw);
    }
  };
  const row = (cells: string[], r: number) => `(${names.map((_, i) => cell(r, i, cells[i] ?? '')).join(', ')})`;
  return `values (${names.map(quoteString).join(', ')}) ${table.rows.map(row).join(' ')}`;
}

/** `cards`, or `cards in board "X" list "Y"` with the scope. */
function cardsText(s: SourceData): string {
  const board = s.scope?.board.trim() ?? '';
  const list = s.scope?.list.trim() ?? '';
  return `cards${board || list ? ' in' : ''}${board ? ` board ${quoteString(board)}` : ''}${list ? ` list ${quoteString(list)}` : ''}`;
}

function sourceTokens(s: SourceData): { primary: string; ref: string } {
  const name = s.name.trim();
  switch (s.kind) {
    case 'cards': {
      const text = cardsText(s);
      return { primary: text, ref: text };
    }
    case 'rows':
      if (!name) throw new Error('Choose a table.');
      return { primary: `rows of ${quoteString(name)}`, ref: `rows of ${quoteString(name)}` };
    case 'name': {
      if (!name) throw new Error('Write the name of the selection.');
      const word = /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) && !RESERVED.has(foldKey(name)) ? name : quoteString(name);
      return { primary: `from ${word}`, ref: word };
    }
    case 'query': throw new Error('Choose a query.');
    case 'inline': {
      const text = inlineTableText(s.table);
      return { primary: `from ${text}`, ref: text };
    }
    default:
      if ((WORD_SOURCES as string[]).includes(s.kind)) return { primary: s.kind, ref: s.kind };
      throw new Error('Unknown source.');
  }
}

function integer(raw: string, label: string, min: number): number {
  const t = raw.trim();
  if (!/^[+-]?\d+$/.test(t) || Number(t) < min) throw new Error(`${label} needs a whole number${min >= 0 ? ` (${min} or more)` : ''}.`);
  return Number(t);
}

const hasDef = (s: State, name: string) => Object.prototype.hasOwnProperty.call(s.defs, foldKey(name));

/** A field as KQL text, going through the computed columns of earlier steps. */
function resolve(s: State, text: string): string {
  const t = text.trim();
  if (!t) throw new Error('Choose a field.');
  const bracket = /^\[([^\]]+)\]$/.exec(t);
  const key = foldKey(bracket ? bracket[1] : t);
  if (Object.prototype.hasOwnProperty.call(s.defs, key)) return s.defs[key];
  return quoteIdent(t);
}

/** Free KQL typed by the user: [Name] of computed columns is replaced by their calculation. */
function expand(s: State, text: string): string {
  return text.trim().replace(/\[([^\]]+)\]/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(s.defs, foldKey(name)) ? s.defs[foldKey(name)] : m));
}

export function conditionText(c: Condition, resolveField: (field: string) => string = quoteIdent): string {
  if (c.op === 'flag') {
    const flag = c.value.trim();
    if (!flag) throw new Error('Choose a flag (done, open, overdue...).');
    return flag;
  }
  const f = resolveField(c.field);
  switch (c.op) {
    case 'empty': return `${f} is empty`;
    case 'notempty': return `${f} is not empty`;
    case 'window': {
      if (!c.value.trim()) throw new Error('Write a time window, e.g. last 30d.');
      return `${f} in ${c.value.trim()}`;
    }
    case 'between': return `${f} between ${literal(c.value, c.vtype)} and ${literal(c.value2, c.vtype)}`;
    case 'in': case 'not in': {
      const raw = c.values.length > 0 ? c.values : c.value.split(',').map((x) => x.trim()).filter((x) => x !== '');
      if (raw.length === 0) throw new Error('Add at least one value.');
      return `${f} ${c.op} (${raw.map((v) => literal(v, c.vtype === 'raw' || c.vtype === 'regex' ? 'auto' : c.vtype)).join(', ')})`;
    }
    case '~': case '!~': {
      const isRegex = c.vtype === 'regex' || (c.vtype === 'auto' && /^\/.+\/[a-z]*$/i.test(c.value.trim()));
      return `${f} ${c.op} ${isRegex ? regexLiteral(c.value) : literal(c.value, c.vtype === 'auto' ? 'text' : c.vtype)}`;
    }
    case 'contains': case 'not contains': case 'startswith': case 'endswith':
      return `${f} ${c.op} ${literal(c.value, c.vtype === 'auto' ? 'text' : c.vtype)}`;
    default:
      return `${f} ${c.op} ${literal(c.value, c.vtype)}`;
  }
}

function transformExpr(s: State, col: TransformColumn): { name: string; expr: string } {
  switch (col.kind) {
    case 'custom': {
      const name = col.alias.trim();
      if (!name) throw new Error('Name the new column.');
      if (!col.expr.trim()) throw new Error('Write the calculation.');
      return { name, expr: expand(s, col.expr) };
    }
    case 'fn': {
      if (!col.column.trim()) throw new Error('Choose a column.');
      const name = col.alias.trim() || col.column.trim();
      const b = resolve(s, col.column);
      const A = col.a;
      const B = col.b;
      let expr: string;
      switch (col.fn) {
        case 'trim': case 'lower': case 'upper': case 'proper': case 'capitalize': case 'abs': case 'ceil': case 'floor': case 'number':
          expr = `${col.fn}(${b})`; break;
        case 'clean': expr = `strip(${b})`; break;
        case 'text': expr = `text(${b})`; break;
        case 'replace': {
          if (A === '') throw new Error('Write the text to find.');
          const find = col.regex ? (/^\/[\s\S]+\/[a-z]*$/i.test(A.trim()) ? regexLiteral(A) : `${regexLiteral(A)}g`) : quoteString(A);
          expr = `replace(${b}, ${find}, ${quoteString(B)})`; break;
        }
        case 'left': case 'right': expr = `${col.fn}(${b}, ${integer(A, 'Length', 0)})`; break;
        case 'substr': expr = `substr(${b}, ${integer(A, 'Start', 0)}${B.trim() ? `, ${integer(B, 'Length', 0)}` : ''})`; break;
        case 'extract': expr = `extract(${b}, ${regexLiteral(A)}${B.trim() ? `, ${integer(B, 'Group', 0)}` : ''})`; break;
        case 'fill_down': case 'fill_up': expr = `${col.fn}(${b}${A.trim() ? `, ${resolve(s, A)}` : ''})`; break;
        case 'lag': case 'lead': expr = `${col.fn}(${b}${A.trim() ? `, ${integer(A, 'Rows', 1)}` : ''})`; break;
        case 'running_sum': expr = `running_sum(${b})`; break;
        case 'len': expr = `len(${b})`; break;
        case 'whole': expr = `int(${b})`; break;
        case 'datetime': expr = `date(${b}, "yyyy-MM-dd HH:mm")`; break;
        case 'to_date': expr = `todate(${b})`; break;
        case 'to_datetime': expr = `datetime(${b})`; break;
        case 'to_bool': expr = `bool(${b})`; break;
        case 'not_bool': expr = `if(${b}, false, true)`; break;
        case 'text_before': case 'text_after': expr = `${col.fn === 'text_before' ? 'textbefore' : 'textafter'}(${b}, ${quoteString(A)}${B.trim() ? `, ${integer(B, 'Occurrence', 1)}` : ''})`; if (A === '') throw new Error('Write the delimiter.'); break;
        case 'text_between': if (A === '' || B === '') throw new Error('Write both delimiters.'); expr = `textbefore(textafter(${b}, ${quoteString(A)}), ${quoteString(B)})`; break;
        case 'n_add': case 'n_sub': case 'n_mul': case 'n_div': case 'n_mod': case 'n_percent': {
          const operand = A.trim();
          if (!operand) throw new Error('Write the number, or the column, to use.');
          // a constant, or another column (written [Column] on the right of an operator)
          const rhs = NUMBER_RE.test(operand) ? operand : rightOperand(resolve(s, operand));
          const symbol = ({ n_add: '+', n_sub: '-', n_mul: '*', n_div: '/', n_mod: '%' } as Record<string, string>)[col.fn];
          expr = col.fn === 'n_percent' ? `percent(${b}, ${rhs})` : `${b} ${symbol} ${rhs}`;
          break;
        }
        case 'month_name': expr = `monthname(${b})`; break;
        case 'quarter': expr = `quarter(${b})`; break;
        case 'week': expr = `isoweek(${b})`; break;
        case 'day_name': expr = `date(${b}, "EEEE")`; break;
        case 'days_until': expr = `days(${b})`; break;
        case 'list_join': expr = `join(${b}, ${quoteString(A || ', ')})`; break;
        case 'list_count': expr = `count(${b})`; break;
        case 'list_first': expr = `first(${b})`; break;
        case 'date_year': expr = `year(${b})`; break;
        case 'date_month': expr = `month(${b})`; break;
        case 'date_day': expr = `day(${b})`; break;
        case 'weekday': case 'age': expr = `${col.fn}(${b})`; break;
        case 'try_number': expr = `try(number(${b}), ${literal(A.trim() || '0', 'number')})`; break;
        case 'try_date': expr = `try(date(${b}, "yyyy-MM-dd"), ${quoteString(A)})`; break;
        case 'round': expr = A.trim() ? `round(${b}, ${integer(A, 'Digits', 0)})` : `round(${b})`; break;
        case 'date': expr = `date(${b}, ${quoteString(A.trim() || 'yyyy-MM-dd')})`; break;
        default: throw new Error('Unknown transformation.');
      }
      return { name, expr };
    }
    case 'split': {
      if (!col.column.trim()) throw new Error('Choose a column.');
      if (col.delimiter === '') throw new Error('Write the delimiter.');
      const n = col.a.trim() ? integer(col.a, 'Piece', -99) : 1;
      if (n === 0) throw new Error('The piece is 1 or more (negative counts from the end).');
      const name = col.alias.trim() || `${col.column.trim()}.${n}`;
      return { name, expr: `split(${resolve(s, col.column)}, ${quoteString(col.delimiter)}, ${n})` };
    }
    case 'merge': {
      if (col.columns.length < 2) throw new Error('Choose at least two columns.');
      const parts: string[] = [];
      col.columns.forEach((c, i) => {
        if (i > 0 && col.separator !== '') parts.push(quoteString(col.separator));
        parts.push(i === 0 ? resolve(s, c) : rightOperand(resolve(s, c)));
      });
      return { name: col.alias.trim() || 'Merged', expr: parts.join(' & ') };
    }
    case 'conditional': {
      if (!col.alias.trim()) throw new Error('Name the new column.');
      if (col.clauses.length === 0) throw new Error('Add at least one condition.');
      const res = (f: string) => resolve(s, f);
      let expr = literal(col.otherwise, col.otherwiseType === 'raw' ? 'raw' : col.otherwiseType);
      for (let i = col.clauses.length - 1; i >= 0; i--) {
        const cl = col.clauses[i];
        expr = `if(${conditionText(cl.condition, res)}, ${literal(cl.then, cl.thenType)}, ${expr})`;
      }
      return { name: col.alias.trim(), expr };
    }
    default: throw new Error('Unknown column kind.');
  }
}

function metricText(s: State, m: GroupData['metrics'][number]): string {
  const f = () => resolve(s, m.field);
  switch (m.fn) {
    case 'count': return 'count';
    case 'percent': return 'percent';
    case 'count_distinct': return `count(distinct ${f()})`;
    case 'percentile': {
      const p = m.arg.trim();
      if (!NUMBER_RE.test(p) || Number(p) < 0 || Number(p) > 100) throw new Error('The percentile is a number from 0 to 100.');
      return `percentile(${f()}, ${p})`;
    }
    case 'join': return m.arg ? `join(${f()}, ${quoteString(m.arg)})` : `join(${f()})`;
    case 'count_if': {
      if (!m.arg.trim()) throw new Error('Write the condition of count_if.');
      return `count_if(${expand(s, m.arg)})`;
    }
    case 'sum_if': {
      if (!m.arg.trim()) throw new Error('Write the condition of sum_if.');
      return `sum_if(${f()}, ${expand(s, m.arg)})`;
    }
    case 'ratio': return `ratio(${f()}, ${resolve(s, m.field2)})`;
    default: return `${m.fn}(${f()})`;
  }
}

function groupText(parts: { dims: string[]; metrics: string[]; having: string }, pivot: string | null): string {
  const out: string[] = [];
  if (parts.dims.length > 0) out.push(`group by ${parts.dims.join(', ')}`);
  if (pivot) out.push(`pivot ${pivot}`);
  if (parts.metrics.length > 0) out.push(parts.metrics.join(', '));
  if (parts.having) out.push(`having ${parts.having}`);
  return out.join(' ');
}

function emit(s: State, plain = false): string {
  const parts: string[] = [s.source];
  if (s.where.length > 0) parts.push(`where ${s.where.join(' and ')}`);
  if (plain) return parts.join(' ');
  if (s.group !== null) parts.push(s.group);
  else {
    const names = s.cols ?? (s.defOrder.length > 0 ? s.defOrder : null);
    if (!s.cols && s.star) {
      const extra = s.defOrder.map((n) => `${s.defs[foldKey(n)]} as ${quoteString(n)}`);
      const except = s.star.except.length > 0 ? ` except (${s.star.except.map((e) => quoteIdent(e)).join(', ')})` : '';
      parts.push(`select *${except}${extra.length > 0 ? `, ${extra.join(', ')}` : ''}`);
    } else if (names && (s.shaped || s.cols)) {
      const list = names.map((n) => {
        const key = foldKey(n);
        if (Object.prototype.hasOwnProperty.call(s.defs, key)) return `${s.defs[key]} as ${quoteString(n)}`;
        return quoteIdent(n);
      });
      parts.push(`select ${s.distinct ? 'distinct ' : ''}${list.join(', ')}`);
    }
  }
  if (s.order.length > 0) parts.push(`order by ${s.order.join(', ')}`);
  // the engine applies them in this order: offset, droplast, limit, tail
  if (s.offset !== null) parts.push(`offset ${s.offset}`);
  if (s.droplast !== null) parts.push(`droplast ${s.droplast}`);
  if (s.limit !== null) parts.push(`limit ${s.limit}`);
  if (s.tail !== null) parts.push(`tail ${s.tail}`);
  if (s.transpose) parts.push(s.transpose === 'header' ? 'transpose header' : 'transpose');
  return parts.join(' ');
}

/** Visible columns of a step that does not group: its base columns or, when unknown, the computed ones. */
function visibleColumns(s: State): string[] | null {
  if (s.group !== null || s.transpose || (s.star && !s.cols)) return null;
  return s.cols ?? (s.defOrder.length > 0 ? s.defOrder : null);
}

const NEEDS_RECORDS = 'Add this step before the Group step.';

const IDENT_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

function paramLiteral(p: FlowParam): string {
  switch (p.type) {
    case 'number':
      if (!NUMBER_RE.test(p.value.trim())) throw new Error(`"${p.value}" is not a number.`);
      return p.value.trim();
    case 'bool': return p.value.trim().toLowerCase() === 'true' ? 'true' : 'false';
    case 'date': return ISO_DATE_RE.test(p.value.trim()) ? p.value.trim() : quoteString(p.value);
    default: return quoteString(p.value);
  }
}

/** `param name = value` and `fn name(a, b) = expression` statements, written before everything else. */
export function declarationLines(graph: FlowGraph, errors: FlowError[] = []): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const fail = (id: string, message: string) => errors.push({ nodeId: id, message });
  for (const p of graph.params ?? []) {
    const name = p.name.trim();
    if (!IDENT_RE.test(name)) { fail(`param:${p.id}`, `"${name}" is not a valid parameter name.`); continue; }
    if (seen.has(foldKey(name))) { fail(`param:${p.id}`, `The name "${name}" is used twice.`); continue; }
    try { lines.push(`param ${name} = ${paramLiteral(p)}`); seen.add(foldKey(name)); } catch (e) { fail(`param:${p.id}`, e instanceof Error ? e.message : String(e)); }
  }
  for (const f of graph.functions ?? [] as FlowFunction[]) {
    const name = f.name.trim();
    if (!IDENT_RE.test(name)) { fail(`fn:${f.id}`, `"${name}" is not a valid function name.`); continue; }
    if (seen.has(foldKey(name))) { fail(`fn:${f.id}`, `The name "${name}" is used twice.`); continue; }
    if (f.args.some((a) => !IDENT_RE.test(a.trim()))) { fail(`fn:${f.id}`, 'Argument names are plain words.'); continue; }
    if (!f.body.trim()) { fail(`fn:${f.id}`, 'Write the expression of the function.'); continue; }
    seen.add(foldKey(name));
    const line = `fn ${name}(${f.args.map((a) => a.trim()).join(', ')}) = ${f.body.trim()}`;
    // a body that is a whole query (a table function) ends with `;` so the next statement does not read as its continuation
    let tableBody = false;
    try { tableBody = parseFunctionDefinitions(`${line};`).some((d) => d.kind === 'table'); } catch { /* the engine reports it with the script */ }
    lines.push(tableBody ? `${line};` : line);
  }
  return lines;
}

export function compileFlow(graph: FlowGraph, options: CompileOptions = {}): CompileResult {
  const errors: FlowError[] = [];
  const errorKeys = new Set<string>();
  const nodes = new Map<string, FlowNode>();
  for (const n of graph.nodes ?? []) nodes.set(n.id, n);
  const edges = (graph.edges ?? []).filter((e) => nodes.has(e.source) && nodes.has(e.target));
  const defaultQuery = graph.queries?.[0]?.id ?? DEFAULT_QUERY_ID;
  const queryOf = (n: FlowNode) => n.query ?? defaultQuery;

  const fail = (node: FlowNode, message: string): null => {
    const key = `${node.id}\u0000${message}`;
    if (!errorKeys.has(key)) { errorKeys.add(key); errors.push({ nodeId: node.id, message }); }
    return null;
  };

  // inputs per node: handle -> source node id
  const inputs = new Map<string, Record<string, string>>();
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    const handle = e.targetHandle === 'right' || e.targetHandle === 'in2' ? e.targetHandle : 'in';
    const target = nodes.get(e.target)!;
    const slot = inputs.get(e.target) ?? {};
    if (slot[handle]) fail(target, 'This input accepts only one connection.');
    else slot[handle] = e.source;
    inputs.set(e.target, slot);
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e.target]);
  }

  const lets: Array<{ name: string; text: string }> = [];
  const letByText = new Map<string, string>();
  const usedNames = new Set<string>();
  const makeLet = (text: string, hint: string): string => {
    const known = letByText.get(text);
    if (known) return known;
    const base = (foldKey(hint).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'b').replace(/^(\d)/, 'b$1');
    let name = RESERVED.has(base) ? `${base}_1` : base;
    for (let i = 2; usedNames.has(name); i++) name = `${base}_${i}`;
    usedNames.add(name);
    lets.push({ name, text });
    letByText.set(text, name);
    return name;
  };

  const memo = new Map<string, State | null>();
  const visiting = new Set<string>();

  const terminalOf = (queryId: string): FlowNode | null => {
    const members = graph.nodes.filter((n) => queryOf(n) === queryId && n.type !== 'output' && n.type !== 'advanced');
    const terminals = members.filter((n) => !(outgoing.get(n.id) ?? []).some((t) => nodes.get(t)?.type !== 'output'));
    return terminals[terminals.length - 1] ?? null;
  };

  /** Text for `join X` / `union X` of the chain ending at `inputId`; null when it failed. */
  const branch = (consumer: FlowNode, inputId: string): { text: string; cols: string[] | null; root: SourceData | null } | null => {
    const input = nodes.get(inputId)!;
    const s = build(input);
    if (!s) return null;
    if (!s.recordOnly) return fail(consumer, 'The input of a join or union must be a plain selection (source and filter steps only).');
    if (s.bare) return { text: s.bare, cols: s.cols, root: s.rootSource };
    return { text: makeLet(emit(s, true), s.rootSource?.name || s.rootSource?.kind || 'b'), cols: s.cols, root: s.rootSource };
  };

  /** Moves a filtered chain into a `let`, so a join / union can follow it. */
  const wrapForCombine = (node: FlowNode, s: State): State | null => {
    if (s.where.length === 0 && s.joined === 0) return s;
    if (!s.recordOnly) return fail(node, 'Put this step right after the source (computed columns, selections and groups cannot be joined).');
    const name = makeLet(emit(s, true), s.rootSource?.name || s.rootSource?.kind || 'b');
    const next = cloneState(s);
    next.source = `from ${name}`;
    next.bare = name;
    next.where = [];
    next.joined = 0;
    return next;
  };

  function build(node: FlowNode): State | null {
    if (memo.has(node.id)) return memo.get(node.id)!;
    if (visiting.has(node.id)) return fail(node, 'This step is part of a cycle.');
    visiting.add(node.id);
    let result: State | null = null;
    try {
      result = buildNode(node);
    } catch (e) {
      result = fail(node, e instanceof Error ? e.message : String(e));
    }
    visiting.delete(node.id);
    memo.set(node.id, result);
    return result;
  }

  const inputState = (node: FlowNode, handle: 'in' | 'right' | 'in2' = 'in'): State | null => {
    const id = inputs.get(node.id)?.[handle];
    if (!id) return fail(node, handle === 'in' ? 'Connect an input to this step.' : 'Connect the second input to this step.');
    const upstream = nodes.get(id)!;
    if (upstream.type === 'advanced') return fail(node, 'An Advanced KQL step must be the last one.');
    if (upstream.type === 'output') return fail(node, 'An Output step cannot feed another step.');
    return build(upstream);
  };

  function buildNode(node: FlowNode): State | null {
    const type = node.type;
    if (node.disabled && type !== 'source' && type !== 'output' && type !== 'advanced') {
      const through = inputState(node);
      return through ? cloneState(through) : null;
    }
    if (type === 'source') {
      const d = dataOf<SourceData>(node);
      if (d.kind === 'query') {
        const target = d.name ? terminalOf(d.name) : null;
        if (!target || queryOf(node) === d.name) return fail(node, 'Choose another query of this flow.');
        const b = branch(node, target.id);
        if (!b) return null;
        return {
          source: b.text === 'cards' || b.text.startsWith('rows of') ? b.text : `from ${b.text}`, bare: b.text, where: [], cols: b.cols, defs: {}, defOrder: [], shaped: false,
          group: null, star: null, groupParts: null, pivot: null, tail: null, droplast: null, transpose: null, unpivoted: false, distinct: false, distinctCols: null, order: [], offset: null, limit: null, joined: 0, recordOnly: true, rootSource: b.root,
        };
      }
      const t = sourceTokens(d);
      return {
        source: t.primary, bare: d.kind === 'inline' || d.scope ? null : t.ref, where: [], cols: d.kind === 'inline' ? (d.table?.columns.map((c) => c.trim()) ?? null) : options.columnsOf?.(d) ?? null, defs: {}, defOrder: [], shaped: false,
        group: null, star: null, groupParts: null, pivot: null, tail: null, droplast: null, transpose: null, unpivoted: false, distinct: false, distinctCols: null, order: [], offset: null, limit: null, joined: 0, recordOnly: true, rootSource: d,
      };
    }
    if (type === 'advanced') return fail(node, 'An Advanced KQL step is a whole script: it cannot be followed by other steps.');
    if (type === 'output') {
      return inputState(node);
    }

    const prev = inputState(node);
    if (!prev) return null;
    const s = cloneState(prev);
    const closed = s.limit !== null || s.offset !== null || s.tail !== null || s.droplast !== null || s.transpose !== null;
    if (closed) return fail(node, 'Nothing can come after Keep / skip rows or Transpose: move this step before it.');

    switch (type) {
      case 'filter': {
        if (s.group !== null) return fail(node, `${NEEDS_RECORDS} (After a group, use the "having" box of the Group step.)`);
        const d = dataOf<FilterData>(node);
        const res = (f: string) => resolve(s, f);
        const parts = d.conditions.filter((c) => c.field.trim() !== '' || c.op === 'flag').map((c) => conditionText(c, res));
        if (d.advanced.trim()) parts.push(expand(s, d.advanced));
        if (parts.length === 0) return fail(node, 'Add at least one condition.');
        const hasOr = (t: string) => /(^|[\s)])or([\s(]|$)/i.test(t.replace(/"(?:[^"\\]|\\.)*"/g, '""'));
        if (d.combine === 'or') s.where.push(parts.length > 1 ? `(${parts.join(' or ')})` : parts[0]);
        else s.where.push(...parts.map((p) => (parts.length + s.where.length > 1 && hasOr(p) ? `(${p})` : p)));
        s.bare = null;
        return s;
      }
      case 'transform': {
        if (s.group !== null) return fail(node, NEEDS_RECORDS);
        const d = dataOf<TransformData>(node);
        if (d.columns.length === 0) return fail(node, 'Add at least one column.');
        for (const col of d.columns) {
          const { name, expr } = transformExpr(s, col);
          const key = foldKey(name);
          const existing = s.cols?.find((c) => foldKey(c) === key);
          s.defs[key] = expr;
          if (s.cols) { if (!existing) s.cols.push(name); } else if (!s.defOrder.some((c) => foldKey(c) === key)) s.defOrder.push(name);
        }
        s.shaped = true;
        s.recordOnly = false;
        s.bare = null;
        return s;
      }
      case 'select': {
        if (s.group !== null) return fail(node, NEEDS_RECORDS);
        const d = dataOf<SelectData>(node);
        if (d.star) {
          const except = (d.except ?? []).map((c) => c.trim()).filter((c) => c !== '');
          if (s.cols) s.cols = s.cols.filter((c) => !except.some((e) => foldKey(e) === foldKey(c)));
          else s.star = { except };
          s.shaped = true;
          s.recordOnly = false;
          s.bare = null;
          return s;
        }
        if (d.columns.length === 0) return fail(node, 'Choose at least one column.');
        s.star = null;
        const nextCols: string[] = [];
        const nextDefs: Record<string, string> = {};
        for (const c of d.columns) {
          if (!c.column.trim()) throw new Error('Choose a column.');
          const name = c.alias.trim() || c.column.trim().replace(/^\[(.*)\]$/, '$1');
          const expr = resolve(s, c.column);
          const key = foldKey(name);
          if (nextCols.some((x) => foldKey(x) === key)) throw new Error(`Two columns are named "${name}": rename one.`);
          nextCols.push(name);
          if (expr !== quoteIdent(name)) nextDefs[key] = expr;
        }
        s.cols = nextCols;
        s.defs = nextDefs;
        s.defOrder = [];
        s.shaped = true;
        s.recordOnly = false;
        s.bare = null;
        return s;
      }
      case 'distinct': {
        if (s.group !== null) return fail(node, NEEDS_RECORDS);
        const d = dataOf<DistinctData>(node);
        if (d.columns.length > 0) {
          const nextDefs: Record<string, string> = {};
          for (const c of d.columns) { const key = foldKey(c.replace(/^\[(.*)\]$/, '$1')); if (hasDef(s, c)) nextDefs[key] = resolve(s, c); }
          s.cols = d.columns.map((c) => c.replace(/^\[(.*)\]$/, '$1'));
          s.defs = nextDefs;
          s.defOrder = [];
        } else if (!visibleColumns(s)) return fail(node, 'Choose the columns that identify a duplicate (the columns of this source are not known).');
        s.distinct = true;
        s.shaped = true;
        s.recordOnly = false;
        s.bare = null;
        return s;
      }
      case 'join': {
        const d = dataOf<JoinData>(node);
        if (s.order.length > 0) return fail(node, 'Put the join before the sort.');
        const base = wrapForCombine(node, s);
        if (!base) return null;
        let right: { text: string; cols: string[] | null; root: SourceData | null };
        const rightId = inputs.get(node.id)?.right;
        if (rightId) {
          const b = branch(node, rightId);
          if (!b) return null;
          right = b;
        } else {
          if (d.rightSource.kind === 'query') {
            const target = d.rightSource.name ? terminalOf(d.rightSource.name) : null;
            if (!target) return fail(node, 'Choose the right source (or connect a step to the right input).');
            const b = branch(node, target.id);
            if (!b) return null;
            right = b;
          } else {
            const t = sourceTokens(d.rightSource);
            right = { text: t.ref, cols: options.columnsOf?.(d.rightSource) ?? null, root: d.rightSource };
          }
        }
        if (!d.leftKey.trim() || !d.rightKey.trim()) return fail(node, 'Choose the key of each side (on left = right).');
        const defaultAlias = right.root ? (right.root.kind === 'rows' || right.root.kind === 'name' ? right.root.name : right.root.kind) : right.text;
        const alias = d.alias.trim() || defaultAlias;
        base.source += ` join ${right.text}${d.alias.trim() ? ` as ${/^[\p{L}_][\p{L}\p{N}_]*$/u.test(alias) ? alias : quoteString(alias)}` : ''} on ${resolve(base, d.leftKey)} = ${quoteIdent(d.rightKey)}${d.kind === 'left' ? ' left' : ''}`;
        base.joined += 1;
        base.bare = null;
        if (base.cols && right.cols) {
          const keep = d.expand.length > 0 ? d.expand.filter((c) => right.cols!.includes(c)) : right.cols;
          base.cols = [...base.cols, ...keep.map((c) => `${alias}.${c}`)];
        }
        return base;
      }
      case 'union': {
        const base = wrapForCombine(node, s);
        if (!base) return null;
        const secondId = inputs.get(node.id)?.in2;
        if (!secondId) return fail(node, 'Connect the second input to this step.');
        const b = branch(node, secondId);
        if (!b) return null;
        base.source += ` union ${b.text}`;
        base.joined += 1;
        base.bare = null;
        return base;
      }
      case 'group': {
        if (s.group !== null) return fail(node, 'A query can have only one Group step.');
        if (s.order.length > 0) return fail(node, 'Put the sort after the group.');
        const d = dataOf<GroupData>(node);
        if (d.dimensions.length === 0 && d.metrics.length === 0) return fail(node, 'Add a dimension or a metric.');
        const dims = d.dimensions.map((dim) => {
          if (!dim.field.trim()) throw new Error('Choose the field of each dimension.');
          const f = resolve(s, dim.field);
          return dim.bucket && dim.bucket !== 'none' ? `${dim.bucket}(${f})` : f;
        });
        const metrics = d.metrics.map((m) => metricText(s, m));
        s.groupParts = { dims, metrics, having: d.having.trim() ? expand(s, d.having) : '' };
        s.group = groupText(s.groupParts, null);
        s.recordOnly = false;
        s.bare = null;
        return s;
      }
      case 'sort': {
        const d = dataOf<SortData>(node);
        const keys = d.keys.filter((k) => k.field.trim() !== '');
        if (keys.length === 0) return fail(node, 'Choose a column to sort by.');
        for (const k of keys) {
          const t = k.field.trim();
          if (s.pivot && !/^(key|label)$/i.test(t)) throw new Error('After a Pivot the rows can be sorted by key or label only.');
          const grouped = s.group !== null && (/\(/.test(t) || /^(count|percent|key|label)$/i.test(t));
          s.order.push(`${grouped ? t : resolve(s, t)} ${k.dir}`);
        }
        s.recordOnly = false;
        s.bare = null;
        return s;
      }
      case 'limit': {
        const d = dataOf<LimitData>(node);
        if (d.limit === null && d.offset === null && d.tail === null && d.droplast === null) return fail(node, 'Set a number of rows to keep or to skip.');
        if (d.tail !== null && (!Number.isInteger(d.tail) || d.tail < 1)) return fail(node, 'The last rows to keep are a whole number of 1 or more.');
        if (d.droplast !== null && (!Number.isInteger(d.droplast) || d.droplast < 0)) return fail(node, 'The last rows to remove are a whole number of 0 or more.');
        if (d.limit !== null && (!Number.isInteger(d.limit) || d.limit < 1)) return fail(node, 'The limit is a whole number of 1 or more.');
        if (d.offset !== null && (!Number.isInteger(d.offset) || d.offset < 0)) return fail(node, 'The offset is a whole number of 0 or more.');
        s.limit = d.limit;
        s.offset = d.offset;
        s.tail = d.tail;
        s.droplast = d.droplast;
        s.recordOnly = false;
        s.bare = null;
        return s;
      }
      case 'unpivot': {
        const d = dataOf<UnpivotData>(node);
        if (s.unpivoted) return fail(node, 'A query can have only one Unpivot step.');
        if (s.group !== null || s.order.length > 0 || !s.recordOnly) return fail(node, 'Put the Unpivot step right after the source (and its filters, joins and unions).');
        const base = s.where.length > 0 ? wrapForCombine(node, s) : s;
        if (!base) return null;
        const names = d.columns.map((c) => c.trim()).filter((c) => c !== '');
        if (names.length === 0) return fail(node, 'Choose the columns to turn into rows.');
        if (d.except && !base.cols && base.rootSource?.kind === 'cards') return fail(node, 'Unpivot "all but" needs a table: for cards list the columns.');
        const attribute = d.attribute.trim() || 'Attribute';
        const value = d.value.trim() || 'Value';
        base.source += ` unpivot ${d.except ? 'except ' : ''}${names.map((n) => quoteIdent(n)).join(', ')} as ${quoteString(attribute)}, ${quoteString(value)}`;
        base.unpivoted = true;
        base.bare = null;
        if (base.cols) {
          const listed = new Set(names.map(foldKey));
          const kept = base.cols.filter((c) => (d.except ? listed.has(foldKey(c)) : !listed.has(foldKey(c))));
          base.cols = [...kept, attribute, value];
        }
        return base;
      }
      case 'pivot': {
        const d = dataOf<PivotData>(node);
        if (s.group === null || !s.groupParts) return fail(node, 'Add a Group step before Pivot: group by the rows, then pivot the column.');
        if (s.pivot) return fail(node, 'A query can have only one Pivot step.');
        if (s.groupParts.dims.length === 0) return fail(node, 'The Group step needs a dimension to pivot.');
        if (s.groupParts.metrics.length > 1) return fail(node, 'Pivot takes exactly one metric: keep only one in the Group step.');
        if (s.groupParts.having) return fail(node, 'Pivot cannot be combined with "having": filter before grouping.');
        if (s.order.some((o) => !/^(key|label)\b/i.test(o))) return fail(node, 'After a Pivot the rows can be sorted by key or label only.');
        if (!d.column.trim()) return fail(node, 'Choose the column whose values become columns.');
        const f = resolve(s, d.column);
        s.pivot = d.bucket && d.bucket !== 'none' ? `${d.bucket}(${f})` : f;
        s.group = groupText(s.groupParts, s.pivot);
        s.bare = null;
        return s;
      }
      case 'transpose': {
        const d = dataOf<TransposeData>(node);
        s.transpose = d.header ? 'header' : 'plain';
        s.recordOnly = false;
        s.bare = null;
        return s;
      }
      default: return fail(node, 'Unknown step.');
    }
  }

  const loaded = (n: FlowNode) => graph.queries?.find((q) => q.id === queryOf(n))?.load !== false;
  // which nodes are written
  const relevant = (graph.nodes ?? []).filter((n) => !options.upTo || n.id === options.upTo);
  let targets: FlowNode[];
  if (options.upTo) {
    targets = nodes.has(options.upTo) ? [nodes.get(options.upTo)!] : [];
  } else {
    const outputs = relevant.filter((n) => n.type === 'output');
    const pick = (list: FlowNode[]) => list.filter(loaded);
    targets = outputs.length > 0 ? pick(outputs) : pick(relevant.filter((n) => !(outgoing.get(n.id) ?? []).length));
  }

  const pieces: string[] = [];
  let columns: string[] | null = null;
  for (const target of targets) {
    if (target.type === 'advanced') {
      const script = dataOf<AdvancedData>(target).script.trim();
      if (!script) fail(target, 'Write the KQL of this step.');
      else pieces.push(script);
      continue;
    }
    let state: State | null;
    let title = '';
    if (target.type === 'output') {
      const upstreamId = inputs.get(target.id)?.in;
      const upstream = upstreamId ? nodes.get(upstreamId) : null;
      if (upstream?.type === 'advanced') {
        const script = dataOf<AdvancedData>(upstream).script.trim();
        if (!script) fail(upstream, 'Write the KQL of this step.'); else pieces.push(script);
        continue;
      }
      state = build(target);
      title = dataOf<OutputData>(target).title.trim();
    } else {
      // a step that is not an output: its own query, no title
      state = build(target);
    }
    if (!state) continue;
    columns = visibleColumns(state);
    pieces.push(`show ${emit(state)}${title ? ` as ${quoteString(title)}` : ''}`);
  }

  const declarations = options.declarations ? declarationLines(graph, errors) : [];
  const statements = [...declarations, ...lets.map((l) => `let ${l.name} = ${l.text}`), ...pieces];
  return { script: statements.join('\n'), errors, columns };
}
