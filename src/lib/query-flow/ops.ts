/**
 * One-click operations of the ribbon and of the column header menu (Power Query's Home / Transform / Add Column). Each one
 * builds the data of ONE step (a node) that compiles to KQL; none touches the graph (steps.ts inserts the node).
 */
import { quoteIdent } from './compile.ts';
import { newCondition, newTransformColumn, uid } from './defaults.ts';
import { inferType } from './profile.ts';
import type { Condition, NodeType, TransformFn } from './types.ts';

export type OpGroup = 'text' | 'number' | 'date' | 'rows' | 'columns' | 'add' | 'table' | 'unsupported';
export type ColumnKind = 'text' | 'number' | 'date' | 'boolean' | 'any';

export interface OpParam {
  key: string;
  kind: 'text' | 'number' | 'columns' | 'choice';
  default?: string;
  choices?: string[];
}
export interface OpDef {
  id: string;
  group: OpGroup;
  /** The operation works on the selected column(s). */
  needsColumn: boolean;
  /** Column types it is offered for in the header menu. */
  types: ColumnKind[];
  params: OpParam[];
}

const op = (id: string, group: OpGroup, needsColumn: boolean, types: ColumnKind[], params: OpParam[] = []): OpDef => ({ id, group, needsColumn, types, params });
const text = (key: string, def?: string): OpParam => ({ key, kind: 'text', ...(def !== undefined ? { default: def } : {}) });
const num = (key: string, def?: string): OpParam => ({ key, kind: 'number', ...(def !== undefined ? { default: def } : {}) });

/** Column types of the header menu (Power Query's data type list). Boolean and list conversions need the engine's bool() / list functions. */
export const COLUMN_TYPES = ['any', 'text', 'whole', 'decimal', 'date', 'datetime', 'bool', 'list'] as const;
export type ColumnTypeId = (typeof COLUMN_TYPES)[number];

export const OPS: OpDef[] = [
  // text
  op('trim', 'text', true, ['text']), op('clean', 'text', true, ['text']), op('lower', 'text', true, ['text']), op('upper', 'text', true, ['text']),
  op('proper', 'text', true, ['text']), op('capitalize', 'text', true, ['text']),
  op('replace', 'text', true, ['text', 'number', 'any'], [text('find'), text('with'), { key: 'regex', kind: 'choice', default: 'no', choices: ['no', 'yes'] }]),
  op('split', 'text', true, ['text'], [text('delimiter', ','), num('piece', '1'), text('name')]),
  op('left', 'text', true, ['text'], [num('n', '3')]), op('right', 'text', true, ['text'], [num('n', '3')]),
  op('substr', 'text', true, ['text'], [num('start', '0'), num('length')]), op('extract', 'text', true, ['text'], [text('pattern'), num('group')]),
  op('merge', 'text', false, ['any'], [{ key: 'columns', kind: 'columns' }, text('separator', ' '), text('name', 'Merged')]),
  // number
  op('round', 'number', true, ['number'], [num('digits', '0')]), op('abs', 'number', true, ['number']), op('ceil', 'number', true, ['number']), op('floor', 'number', true, ['number']),
  // types
  op('toNumber', 'number', true, ['text', 'any']), op('toText', 'text', true, ['number', 'date', 'boolean', 'any']), op('toDate', 'date', true, ['date', 'any'], [text('format', 'yyyy-MM-dd')]),
  // date parts
  op('year', 'date', true, ['date', 'any']), op('month', 'date', true, ['date', 'any']), op('day', 'date', true, ['date', 'any']),
  op('dayOfWeek', 'date', true, ['date', 'any']), op('age', 'date', true, ['date', 'any']),
  // rows
  op('keepTop', 'rows', false, ['any'], [num('n', '100')]), op('keepBottom', 'rows', false, ['any'], [num('n', '100')]),
  op('keepRange', 'rows', false, ['any'], [num('first', '1'), num('count', '10')]),
  op('removeTop', 'rows', false, ['any'], [num('n', '1')]), op('removeBottom', 'rows', false, ['any'], [num('n', '1')]),
  op('removeDuplicates', 'rows', false, ['any']), op('removeEmpty', 'rows', false, ['any']),
  op('removeErrors', 'rows', true, ['number', 'date'], [{ key: 'parser', kind: 'choice', default: 'number', choices: ['number', 'date'] }]),
  op('replaceErrors', 'columns', true, ['number', 'date'], [{ key: 'parser', kind: 'choice', default: 'number', choices: ['number', 'date'] }, text('fallback', '0')]),
  op('filterValues', 'rows', true, ['any'], [text('values')]),
  op('filterCompare', 'rows', true, ['any'], [{ key: 'op', kind: 'choice', default: '=', choices: ['=', '!=', '>', '>=', '<', '<=', 'contains', 'not contains', 'startswith', 'endswith'] }, text('value')]),
  op('filterBetween', 'rows', true, ['any'], [text('from'), text('to')]),
  op('filterWindow', 'rows', true, ['date', 'any'], [{ key: 'dir', kind: 'choice', default: 'last', choices: ['last', 'next'] }, num('n', '7'), { key: 'unit', kind: 'choice', default: 'd', choices: ['h', 'd', 'w', 'm', 'y'] }]),
  op('filterEmpty', 'rows', true, ['any']),
  op('sortAsc', 'rows', true, ['any']), op('sortDesc', 'rows', true, ['any']),
  // type, text / number / date / list transformations of the header menu
  op('changeType', 'columns', true, ['any'], [{ key: 'type', kind: 'choice', default: 'text', choices: [...COLUMN_TYPES] }]),
  op('length', 'text', true, ['text']),
  op('numAdd', 'number', true, ['number'], [text('value', '1')]), op('numSub', 'number', true, ['number'], [text('value', '1')]), op('numMul', 'number', true, ['number'], [text('value', '2')]),
  op('numDiv', 'number', true, ['number'], [text('value', '2')]), op('numMod', 'number', true, ['number'], [text('value', '2')]), op('numPercent', 'number', true, ['number'], [text('value', '100')]),
  op('stat', 'number', true, ['number'], [{ key: 'fn', kind: 'choice', default: 'sum', choices: ['sum', 'min', 'max', 'avg', 'median', 'stddev', 'count', 'count_distinct'] }]),
  op('monthName', 'date', true, ['date', 'any']), op('quarter', 'date', true, ['date', 'any']), op('week', 'date', true, ['date', 'any']), op('dayName', 'date', true, ['date', 'any']), op('daysUntil', 'date', true, ['date', 'any']),
  op('listJoin', 'columns', true, ['any'], [text('separator', ', ')]), op('listCount', 'columns', true, ['any']), op('listFirst', 'columns', true, ['any']),
  op('textBefore', 'text', true, ['text'], [text('delimiter'), num('occurrence', '1')]), op('textAfter', 'text', true, ['text'], [text('delimiter'), num('occurrence', '1')]), op('textBetween', 'text', true, ['text'], [text('delimiter'), text('delimiter2')]),
  op('notBool', 'columns', true, ['any']),
  op('moveStart', 'columns', true, ['any']), op('moveEnd', 'columns', true, ['any']),
  // columns
  op('removeColumn', 'columns', true, ['any']), op('removeOtherColumns', 'columns', true, ['any']),
  op('keepColumns', 'columns', false, ['any'], [{ key: 'columns', kind: 'columns' }]),
  op('renameColumn', 'columns', true, ['any'], [text('name')]), op('duplicateColumn', 'columns', true, ['any']),
  op('moveLeft', 'columns', true, ['any']), op('moveRight', 'columns', true, ['any']), op('groupBy', 'columns', true, ['any']),
  op('fillDown', 'columns', true, ['any'], [text('partition')]), op('fillUp', 'columns', true, ['any'], [text('partition')]),
  op('pivot', 'columns', true, ['any']), op('unpivotSelected', 'columns', true, ['any']), op('unpivotOther', 'columns', true, ['any']),
  // table
  op('transpose', 'table', false, ['any'], [{ key: 'header', kind: 'choice', default: 'no', choices: ['no', 'yes'] }]),
  op('reverseRows', 'table', false, ['any']), op('countRows', 'table', false, ['any']),
  // add column
  op('customColumn', 'add', false, ['any'], [text('name'), text('expr')]),
  op('indexColumn', 'add', false, ['any'], [text('name', 'Index'), num('start', '1')]),
  op('runningSum', 'add', true, ['number']), op('lag', 'add', true, ['any'], [num('rows', '1')]), op('lead', 'add', true, ['any'], [num('rows', '1')]),
];

/** Power Query operations KQL cannot express yet: listed (disabled, with a tooltip) in the ribbon so the engine can gain them. */
export const UNSUPPORTED_OPS = ['removeAlternate', 'useFirstRowAsHeaders', 'convertToList', 'columnFromExamples'] as const;

export const opById = (id: string): OpDef | undefined => OPS.find((o) => o.id === id);

export interface OpContext {
  /** The column the operation works on (the first selected one). */
  column?: string;
  /** All the selected columns (multi-select). */
  selected?: string[];
  /** Columns visible at the step the new one goes after (from the preview / compile). */
  columns: string[];
  params: Record<string, string>;
  /** filterValues: the chosen values. */
  values?: string[];
  /** Build the step even when a text the operation needs is still empty (the dialog / inspector finishes it; the step shows an error until then). */
  lenient?: boolean;
}
export interface StepSpec {
  type: NodeType;
  data: Record<string, unknown>;
  /** Translation key of the op (`ops.<id>`) and what to put in it (the column). */
  labelKey: string;
  labelArg: string;
}

const param = (ctx: OpContext, key: string, fallback = ''): string => ctx.params[key] ?? fallback;
const list = (raw: string): string[] => raw.split(',').map((x) => x.trim()).filter((x) => x !== '');
const select = (cols: Array<{ column: string; alias?: string }>) => ({ columns: cols.map((c) => ({ id: uid('s'), column: c.column, alias: c.alias ?? '' })) });
const selectedOf = (ctx: OpContext): string[] => (ctx.selected && ctx.selected.length > 0 ? ctx.selected : ctx.column ? [ctx.column] : []);
const whole = (v: string, fallback: number, min: number): number => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= min ? n : fallback; };

/** A step that changes one column in place (or adds a new one when `_new` is set: Add Column tab). */
const fnStep = (ctx: OpContext, id: string, fn: TransformFn, extra: Record<string, unknown> = {}): StepSpec | null => {
  if (!ctx.column) return null;
  const alias = ctx.params._new === '1' ? `${ctx.column} - ${id}` : '';
  return { type: 'transform', data: { columns: [newTransformColumn('fn', { column: ctx.column, fn, alias, ...extra })] }, labelKey: `ops.${id}`, labelArg: ctx.column };
};

/** KQL of "keep the rows whose column the parser can read" (Power Query: Remove Errors). */
export const notErrorCondition = (column: string, parser: string): string => (parser === 'date' ? `not iserror(date(${quoteIdent(column)}, "yyyy-MM-dd"))` : `not iserror(number(${quoteIdent(column)}))`);

/** Data of the step an operation adds, or null when something it needs is missing (no column, unknown columns, empty text). */
export function buildOp(id: string, ctx: OpContext): StepSpec | null {
  const col = ctx.column?.trim() ?? '';
  const sel = selectedOf(ctx);
  switch (id) {
    case 'trim': case 'clean': case 'lower': case 'upper': case 'proper': case 'capitalize': case 'abs': case 'ceil': case 'floor':
      return fnStep(ctx, id, id as TransformFn);
    case 'toNumber': return fnStep(ctx, id, 'number');
    case 'toText': return fnStep(ctx, id, 'text');
    case 'toDate': return fnStep(ctx, id, 'date', { a: param(ctx, 'format', 'yyyy-MM-dd') });
    case 'year': return fnStep(ctx, id, 'date_year');
    case 'month': return fnStep(ctx, id, 'date_month');
    case 'day': return fnStep(ctx, id, 'date_day');
    case 'dayOfWeek': return fnStep(ctx, id, 'weekday');
    case 'age': return fnStep(ctx, id, 'age');
    case 'round': return fnStep(ctx, id, 'round', { a: param(ctx, 'digits', '0') });
    case 'left': case 'right': return fnStep(ctx, id, id as TransformFn, { a: param(ctx, 'n', '3') });
    case 'substr': return fnStep(ctx, id, 'substr', { a: param(ctx, 'start', '0'), b: param(ctx, 'length') });
    case 'extract': return ctx.lenient || param(ctx, 'pattern') ? fnStep(ctx, id, 'extract', { a: param(ctx, 'pattern'), b: param(ctx, 'group') }) : null;
    case 'replace': return ctx.lenient || param(ctx, 'find') !== '' ? fnStep(ctx, id, 'replace', { a: param(ctx, 'find'), b: param(ctx, 'with'), regex: param(ctx, 'regex') === 'yes' }) : null;
    case 'fillDown': return fnStep(ctx, id, 'fill_down', { a: param(ctx, 'partition') });
    case 'fillUp': return fnStep(ctx, id, 'fill_up', { a: param(ctx, 'partition') });
    case 'runningSum': return fnStep(ctx, id, 'running_sum');
    case 'lag': return fnStep(ctx, id, 'lag', { a: param(ctx, 'rows', '1') });
    case 'lead': return fnStep(ctx, id, 'lead', { a: param(ctx, 'rows', '1') });
    case 'replaceErrors': {
      const date = param(ctx, 'parser', 'number') === 'date';
      return fnStep(ctx, id, date ? 'try_date' : 'try_number', { a: param(ctx, 'fallback', date ? '' : '0') });
    }
    case 'split':
      return col ? { type: 'transform', data: { columns: [newTransformColumn('split', { column: col, delimiter: param(ctx, 'delimiter', ','), a: param(ctx, 'piece', '1'), alias: param(ctx, 'name') })] }, labelKey: 'ops.split', labelArg: col } : null;
    case 'merge': {
      const columns = list(param(ctx, 'columns')).length > 0 ? list(param(ctx, 'columns')) : sel;
      return ctx.lenient || columns.length >= 2 ? { type: 'transform', data: { columns: [newTransformColumn('merge', { columns, separator: param(ctx, 'separator', ' '), alias: param(ctx, 'name', 'Merged') })] }, labelKey: 'ops.merge', labelArg: columns.join(', ') } : null;
    }
    case 'customColumn':
      return ctx.lenient || (param(ctx, 'name') && param(ctx, 'expr')) ? { type: 'transform', data: { columns: [newTransformColumn('custom', { alias: param(ctx, 'name'), expr: param(ctx, 'expr') })] }, labelKey: 'ops.customColumn', labelArg: param(ctx, 'name') } : null;
    case 'indexColumn': {
      const start = param(ctx, 'start', '1').trim();
      return { type: 'transform', data: { columns: [newTransformColumn('custom', { alias: param(ctx, 'name', 'Index') || 'Index', expr: start === '' ? 'rownum()' : `rownum(${start})` })] }, labelKey: 'ops.indexColumn', labelArg: param(ctx, 'name', 'Index') };
    }
    case 'keepTop': return { type: 'limit', data: { limit: whole(param(ctx, 'n', '100'), 100, 1), offset: null, tail: null, droplast: null }, labelKey: 'ops.keepTop', labelArg: param(ctx, 'n', '100') };
    case 'keepBottom': return { type: 'limit', data: { limit: null, offset: null, tail: whole(param(ctx, 'n', '100'), 100, 1), droplast: null }, labelKey: 'ops.keepBottom', labelArg: param(ctx, 'n', '100') };
    case 'keepRange': {
      const first = whole(param(ctx, 'first', '1'), 1, 1);
      return { type: 'limit', data: { limit: whole(param(ctx, 'count', '10'), 10, 1), offset: first - 1, tail: null, droplast: null }, labelKey: 'ops.keepRange', labelArg: `${first}, ${param(ctx, 'count', '10')}` };
    }
    case 'removeTop': return { type: 'limit', data: { limit: null, offset: whole(param(ctx, 'n', '1'), 0, 0), tail: null, droplast: null }, labelKey: 'ops.removeTop', labelArg: param(ctx, 'n', '1') };
    case 'removeBottom': return { type: 'limit', data: { limit: null, offset: null, tail: null, droplast: whole(param(ctx, 'n', '1'), 0, 0) }, labelKey: 'ops.removeBottom', labelArg: param(ctx, 'n', '1') };
    case 'removeDuplicates': return { type: 'distinct', data: { columns: sel }, labelKey: 'ops.removeDuplicates', labelArg: sel.join(', ') };
    case 'removeEmpty': {
      if (sel.length > 0) return { type: 'filter', data: { combine: 'and', conditions: sel.map((c) => newCondition({ field: c, op: 'notempty' })), advanced: '' }, labelKey: 'ops.removeEmpty', labelArg: sel.join(', ') };
      if (ctx.columns.length === 0) return null;
      return { type: 'filter', data: { combine: 'or', conditions: ctx.columns.map((c) => newCondition({ field: c, op: 'notempty' })), advanced: '' }, labelKey: 'ops.removeEmpty', labelArg: '' };
    }
    case 'removeErrors':
      return col ? { type: 'filter', data: { combine: 'and', conditions: [], advanced: notErrorCondition(col, param(ctx, 'parser', 'number')) }, labelKey: 'ops.removeErrors', labelArg: col } : null;
    case 'filterValues': {
      const values = ctx.values ?? list(param(ctx, 'values'));
      if (!col || (values.length === 0 && !ctx.lenient)) return null;
      const condition: Condition = values.length <= 1 ? newCondition({ field: col, op: '=', value: values[0] ?? '' }) : newCondition({ field: col, op: 'in', values });
      return { type: 'filter', data: { combine: 'and', conditions: [condition], advanced: '' }, labelKey: 'ops.filterValues', labelArg: col };
    }
    case 'filterCompare':
      return col && (ctx.lenient || param(ctx, 'value') !== '') ? { type: 'filter', data: { combine: 'and', conditions: [newCondition({ field: col, op: param(ctx, 'op', '=') as Condition['op'], value: param(ctx, 'value') })], advanced: '' }, labelKey: 'ops.filterCompare', labelArg: col } : null;
    case 'filterBetween':
      return col ? { type: 'filter', data: { combine: 'and', conditions: [newCondition({ field: col, op: 'between', value: param(ctx, 'from'), value2: param(ctx, 'to') })], advanced: '' }, labelKey: 'ops.filterBetween', labelArg: col } : null;
    case 'filterWindow': {
      const n = whole(param(ctx, 'n', '7'), 7, 1);
      return col ? { type: 'filter', data: { combine: 'and', conditions: [newCondition({ field: col, op: 'window', value: `${param(ctx, 'dir', 'last') === 'next' ? 'next' : 'last'} ${n}${param(ctx, 'unit', 'd')}` })], advanced: '' }, labelKey: 'ops.filterWindow', labelArg: col } : null;
    }
    case 'filterEmpty':
      return col ? { type: 'filter', data: { combine: 'and', conditions: [newCondition({ field: col, op: 'empty' })], advanced: '' }, labelKey: 'ops.filterEmpty', labelArg: col } : null;
    case 'sortAsc': case 'sortDesc':
      return col ? { type: 'sort', data: { keys: [{ id: uid('k'), field: col, dir: id === 'sortAsc' ? 'asc' : 'desc' }] }, labelKey: `ops.${id}`, labelArg: col } : null;
    case 'reverseRows':
      return { type: 'sort', data: { keys: [{ id: uid('k'), field: 'rownum()', dir: 'desc' }] }, labelKey: 'ops.reverseRows', labelArg: '' };
    case 'countRows':
      return { type: 'group', data: { dimensions: [], metrics: [{ id: uid('m'), fn: 'count', field: '', field2: '', arg: '' }], having: '' }, labelKey: 'ops.countRows', labelArg: '' };
    case 'groupBy':
      return sel.length > 0 ? { type: 'group', data: { dimensions: sel.map((c) => ({ id: uid('d'), field: c, bucket: 'none' })), metrics: [{ id: uid('m'), fn: 'count', field: '', field2: '', arg: '' }], having: '' }, labelKey: 'ops.groupBy', labelArg: sel.join(', ') } : null;
    case 'pivot':
      return col ? { type: 'pivot', data: { column: col, bucket: 'none' }, labelKey: 'ops.pivot', labelArg: col } : null;
    case 'unpivotSelected': case 'unpivotOther':
      return sel.length > 0 ? { type: 'unpivot', data: { columns: sel, except: id === 'unpivotOther', attribute: 'Attribute', value: 'Value' }, labelKey: `ops.${id}`, labelArg: sel.join(', ') } : null;
    case 'transpose':
      return { type: 'transpose', data: { header: param(ctx, 'header', 'no') === 'yes' }, labelKey: 'ops.transpose', labelArg: '' };
    case 'removeColumn': {
      // columns not known (cards...): `select * except (...)` still works
      if (sel.length > 0 && ctx.columns.length === 0) return { type: 'select', data: { columns: [], star: true, except: sel }, labelKey: 'ops.removeColumn', labelArg: sel.join(', ') };
      if (sel.length === 0 || ctx.columns.length === 0) return null;
      const rest = ctx.columns.filter((c) => !sel.includes(c));
      return rest.length > 0 ? { type: 'select', data: select(rest.map((c) => ({ column: c }))), labelKey: 'ops.removeColumn', labelArg: sel.join(', ') } : null;
    }
    case 'removeOtherColumns':
      return sel.length > 0 ? { type: 'select', data: select(sel.map((c) => ({ column: c }))), labelKey: 'ops.removeOtherColumns', labelArg: sel.join(', ') } : null;
    case 'keepColumns': {
      const chosen = list(param(ctx, 'columns')).length > 0 ? list(param(ctx, 'columns')) : sel;
      return ctx.lenient || chosen.length > 0 ? { type: 'select', data: select(chosen.map((c) => ({ column: c }))), labelKey: 'ops.keepColumns', labelArg: chosen.join(', ') } : null;
    }
    case 'renameColumn': {
      const to = param(ctx, 'name').trim();
      if (!col || (!to && !ctx.lenient) || ctx.columns.length === 0) return null;
      return { type: 'select', data: select(ctx.columns.map((c) => ({ column: c, alias: c === col ? to : '' }))), labelKey: 'ops.renameColumn', labelArg: `${col} → ${to}` };
    }
    case 'duplicateColumn': {
      if (!col || ctx.columns.length === 0) return null;
      const out: Array<{ column: string; alias?: string }> = [];
      for (const c of ctx.columns) { out.push({ column: c }); if (c === col) out.push({ column: c, alias: `${c} - Copy` }); }
      return { type: 'select', data: select(out), labelKey: 'ops.duplicateColumn', labelArg: col };
    }
    case 'moveLeft': case 'moveRight': case 'moveStart': case 'moveEnd': {
      const order = reorderColumns(ctx.columns, col, id === 'moveLeft' ? 'left' : id === 'moveRight' ? 'right' : id === 'moveStart' ? 'start' : 'end');
      return order ? { type: 'select', data: select(order.map((c) => ({ column: c }))), labelKey: `ops.${id}`, labelArg: col } : null;
    }
    case 'moveTo': {
      const order = reorderColumns(ctx.columns, col, whole(param(ctx, 'index', '0'), 0, 0));
      return order ? { type: 'select', data: select(order.map((c) => ({ column: c }))), labelKey: 'ops.moveTo', labelArg: col } : null;
    }
    case 'changeType': {
      const type = param(ctx, 'type', 'text') as ColumnTypeId;
      const spec = typeSpec(type);
      if (!spec || sel.length === 0) return null;
      return { type: 'transform', data: { columns: sel.map((c) => newTransformColumn('fn', { column: c, fn: spec.fn, a: spec.a })) }, labelKey: 'ops.changeType', labelArg: sel.join(', ') };
    }
    case 'length': return fnStep(ctx, id, 'len');
    case 'textBefore': return fnStep(ctx, id, 'text_before', { a: param(ctx, 'delimiter'), b: param(ctx, 'occurrence') });
    case 'textAfter': return fnStep(ctx, id, 'text_after', { a: param(ctx, 'delimiter'), b: param(ctx, 'occurrence') });
    case 'textBetween': return fnStep(ctx, id, 'text_between', { a: param(ctx, 'delimiter'), b: param(ctx, 'delimiter2') });
    case 'notBool': return fnStep(ctx, id, 'not_bool');
    case 'numAdd': case 'numSub': case 'numMul': case 'numDiv': case 'numMod': case 'numPercent': {
      const fn = ({ numAdd: 'n_add', numSub: 'n_sub', numMul: 'n_mul', numDiv: 'n_div', numMod: 'n_mod', numPercent: 'n_percent' } as const)[id];
      return fnStep(ctx, id, fn, { a: param(ctx, 'value', '1') });
    }
    case 'stat': {
      const fn = param(ctx, 'fn', 'sum');
      if (!col) return null;
      const metric = fn === 'count' ? { fn: 'count', field: '' } : { fn, field: col };
      return { type: 'group', data: { dimensions: [], metrics: [{ id: uid('m'), ...metric, field2: '', arg: '' }], having: '' }, labelKey: 'ops.stat', labelArg: `${fn}(${col})` };
    }
    case 'monthName': return fnStep(ctx, id, 'month_name');
    case 'quarter': return fnStep(ctx, id, 'quarter');
    case 'week': return fnStep(ctx, id, 'week');
    case 'dayName': return fnStep(ctx, id, 'day_name');
    case 'daysUntil': return fnStep(ctx, id, 'days_until');
    case 'listJoin': return fnStep(ctx, id, 'list_join', { a: param(ctx, 'separator', ', ') });
    case 'listCount': return fnStep(ctx, id, 'list_count');
    case 'listFirst': return fnStep(ctx, id, 'list_first');
    default: return null;
  }
}

/** Operations the header menu of a column of this type offers (any-type ones first). */
export function opsForColumn(kind: ColumnKind): OpDef[] {
  return OPS.filter((o) => o.needsColumn && (o.types.includes('any') || o.types.includes(kind)));
}

const cellsHaveTime = (rows: string[][], i: number): boolean => rows.slice(0, 1000).some((r) => /\d{2}:\d{2}/.test(r[i] ?? ''));

/** The function and argument a "Changed Type" step uses for a column type; null when KQL cannot convert to it yet. */
export function typeSpec(type: ColumnTypeId): { fn: TransformFn; a: string } | null {
  switch (type) {
    case 'text': return { fn: 'text', a: '' };
    case 'whole': return { fn: 'whole', a: '' };
    case 'decimal': return { fn: 'number', a: '' };
    case 'date': return { fn: 'to_date', a: '' };
    case 'datetime': return { fn: 'to_datetime', a: '' };
    case 'bool': return { fn: 'to_bool', a: '' };
    default: return null;
  }
}

export type MoveTarget = 'left' | 'right' | 'start' | 'end' | number;

/** The column order after moving `name` (null when nothing changes or the column is unknown). A number is the new index. */
export function reorderColumns(columns: string[], name: string, target: MoveTarget): string[] | null {
  const from = columns.indexOf(name);
  if (from < 0) return null;
  let to: number;
  if (target === 'left') to = from - 1;
  else if (target === 'right') to = from + 1;
  else if (target === 'start') to = 0;
  else if (target === 'end') to = columns.length - 1;
  else to = Math.max(0, Math.min(columns.length - 1, target));
  if (to < 0 || to >= columns.length || to === from) return null;
  const order = columns.filter((c) => c !== name);
  order.splice(to, 0, name);
  return order;
}

/**
 * "Detect Data Type": looks at the values of the chosen columns (all when none is chosen) and converts the ones that read as
 * numbers or dates. Returns null when nothing needs converting.
 */
export function detectTypeStep(columns: string[], rows: string[][], selected: string[] = []): StepSpec | null {
  const wanted = selected.length > 0 ? selected : columns;
  const converted: Array<{ column: string; fn: TransformFn; a: string }> = [];
  for (const name of wanted) {
    const i = columns.indexOf(name);
    if (i < 0) continue;
    const type = inferType(rows.slice(0, 1000).map((r) => r[i]));
    if (type === 'number') converted.push({ column: name, fn: 'number', a: '' });
    else if (type === 'date') converted.push({ column: name, fn: cellsHaveTime(rows, i) ? 'to_datetime' : 'to_date', a: '' });
    else if (type === 'boolean') converted.push({ column: name, fn: 'to_bool', a: '' });
  }
  if (converted.length === 0) return null;
  return { type: 'transform', data: { columns: converted.map((c) => newTransformColumn('fn', c)) }, labelKey: 'ops.detectTypes', labelArg: converted.map((c) => c.column).join(', ') };
}
