import type { CondOp, MetricKind, TransformFn, ValueType, BucketKind } from './types.ts';

/** Translation keys (`cond.ops.<key>`) of the condition operators. */
export const COND_OP_KEYS: Record<CondOp, string> = {
  '=': 'eq', '!=': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte', '~': 'regex', '!~': 'notRegex',
  contains: 'contains', 'not contains': 'notContains', startswith: 'startswith', endswith: 'endswith',
  in: 'in', 'not in': 'notIn', between: 'between', empty: 'empty', notempty: 'notEmpty', window: 'window', flag: 'flag',
};
export const FLAG_NAMES = ['done', 'open', 'overdue', 'unassigned', 'assigned', 'archived'] as const;
export const VALUE_TYPES: ValueType[] = ['auto', 'text', 'number', 'raw', 'regex'];
export const BUCKETS: BucketKind[] = ['none', 'day', 'week', 'month', 'year'];
export const METRIC_NEEDS_FIELD: Record<MetricKind, boolean> = {
  count: false, percent: false, count_if: false, sum: true, avg: true, min: true, max: true, median: true, stddev: true, unique: true,
  count_distinct: true, first: true, last: true, join: true, percentile: true, sum_if: true, ratio: true,
};
export const TRANSFORM_KINDS = ['custom', 'fn', 'split', 'merge', 'conditional'] as const;
export const FN_ARGS: Record<TransformFn, { a?: string; b?: string }> = {
  trim: {}, clean: {}, lower: {}, upper: {}, proper: {}, capitalize: {}, number: {}, text: {}, abs: {}, ceil: {}, floor: {},
  replace: { a: 'find', b: 'with' }, left: { a: 'length' }, right: { a: 'length' }, substr: { a: 'start', b: 'length' },
  extract: { a: 'pattern', b: 'group' }, date: { a: 'format' }, round: { a: 'digits' },
  fill_down: { a: 'partition' }, fill_up: { a: 'partition' }, lag: { a: 'rows' }, lead: { a: 'rows' }, running_sum: {},
  try_number: { a: 'fallback' }, try_date: { a: 'fallback' },
  date_year: {}, date_month: {}, date_day: {}, weekday: {}, age: {},
  len: {}, whole: {}, datetime: {}, n_add: { a: 'value' }, n_sub: { a: 'value' }, n_mul: { a: 'value' }, n_div: { a: 'value' }, n_mod: { a: 'value' }, n_percent: { a: 'value' },
  month_name: {}, quarter: {}, week: {}, day_name: {}, days_until: {}, list_join: { a: 'separator' }, list_count: {}, list_first: {},
  to_date: {}, to_datetime: {}, to_bool: {}, not_bool: {}, text_before: { a: 'delimiter', b: 'occurrence' }, text_after: { a: 'delimiter', b: 'occurrence' }, text_between: { a: 'delimiter', b: 'delimiter2' },
};

/** Fields of the cards (what KQL knows without data): suggested when a flow starts from cards. */
export const CARD_FIELDS = ['title', 'description', 'list', 'board', 'priority', 'assignee', 'group', 'tag', 'due', 'start', 'created', 'updated', 'done', 'points', 'comments', 'progress', 'age', 'cycle', 'overdue_days', 'title_len', 'tag_count', 'assignee_count'];
