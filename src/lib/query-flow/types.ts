/**
 * Model of the visual query flow: a graph of steps that compiles to ONE KQL script (see compile.ts).
 * Plain JSON only (it is stored in `source.flow` of a graph brick). No enums, no parameter properties.
 */

export type SourceKind =
  | 'cards' | 'rows' | 'documents' | 'bricks' | 'items' | 'boards' | 'lists' | 'members' | 'groups'
  | 'activity' | 'scripts' | 'comments' | 'timers' | 'tags' | 'files' | 'name' | 'query' | 'inline';

/** Sources a node can read, in the order the palette lists them. `rows` = rows of a table; `name` = a saved selection / free name; `query` = another query of the flow. */
export const SOURCE_KINDS: SourceKind[] = [
  'cards', 'rows', 'documents', 'bricks', 'items', 'boards', 'lists', 'members', 'groups',
  'activity', 'scripts', 'comments', 'timers', 'tags', 'files', 'name', 'query', 'inline',
];

/** Sources written as one bare word in KQL. */
export const WORD_SOURCES: SourceKind[] = ['documents', 'bricks', 'items', 'boards', 'lists', 'members', 'groups', 'activity', 'scripts', 'comments', 'timers', 'tags', 'files'];

export type NodeType =
  | 'source' | 'filter' | 'transform' | 'join' | 'union' | 'unpivot' | 'group' | 'pivot' | 'select' | 'distinct' | 'sort' | 'limit' | 'transpose' | 'output' | 'advanced';

export const NODE_TYPES: NodeType[] = ['source', 'filter', 'transform', 'join', 'union', 'unpivot', 'group', 'pivot', 'select', 'distinct', 'sort', 'limit', 'transpose', 'output', 'advanced'];

/** Typed data typed by hand ("Enter data"): compiled to `from values ("a", "b") (1, 2)`. */
export type InlineType = 'auto' | 'text' | 'number' | 'bool' | 'date';
export const INLINE_TYPES: InlineType[] = ['auto', 'text', 'number', 'bool', 'date'];
export const INLINE_MAX_ROWS = 1000;
export const INLINE_MAX_COLUMNS = 50;
/** `types[i]` is the type of column i (missing = auto: numbers, true / false and dates are recognised). */
export interface InlineTable { columns: string[]; rows: string[][]; types?: InlineType[] }
/** `cards in board "X" list "Y"`. */
export interface CardScope { board: string; list: string }
export interface SourceData { kind: SourceKind; name: string; table?: InlineTable; scope?: CardScope }

export type ValueType = 'auto' | 'text' | 'number' | 'raw' | 'regex';
export type CondOp =
  | '=' | '!=' | '<' | '<=' | '>' | '>=' | '~' | '!~' | 'contains' | 'not contains' | 'startswith' | 'endswith'
  | 'in' | 'not in' | 'between' | 'empty' | 'notempty' | 'window' | 'flag';
export const COND_OPS: CondOp[] = ['=', '!=', '<', '<=', '>', '>=', '~', '!~', 'contains', 'not contains', 'startswith', 'endswith', 'in', 'not in', 'between', 'empty', 'notempty', 'window', 'flag'];

export interface Condition {
  id: string;
  field: string;
  op: CondOp;
  value: string;
  value2: string;
  vtype: ValueType;
  /** For `in` / `not in` (checkbox lists); when empty, `value` split by commas is used. */
  values: string[];
}
export interface FilterData { combine: 'and' | 'or'; conditions: Condition[]; advanced: string }

export type TransformFn =
  | 'trim' | 'clean' | 'lower' | 'upper' | 'proper' | 'capitalize'
  | 'replace' | 'left' | 'right' | 'substr' | 'extract'
  | 'number' | 'text' | 'date' | 'round' | 'abs' | 'ceil' | 'floor'
  | 'fill_down' | 'fill_up' | 'lag' | 'lead' | 'running_sum' | 'try_number' | 'try_date'
  | 'date_year' | 'date_month' | 'date_day' | 'weekday' | 'age'
  | 'len' | 'whole' | 'datetime' | 'n_add' | 'n_sub' | 'n_mul' | 'n_div' | 'n_mod' | 'n_percent'
  | 'month_name' | 'quarter' | 'week' | 'day_name' | 'days_until' | 'list_join' | 'list_count' | 'list_first'
  | 'to_date' | 'to_datetime' | 'to_bool' | 'not_bool' | 'text_before' | 'text_after' | 'text_between';
export const TRANSFORM_FNS: TransformFn[] = ['trim', 'clean', 'lower', 'upper', 'proper', 'capitalize', 'replace', 'left', 'right', 'substr', 'extract', 'number', 'text', 'date', 'round', 'abs', 'ceil', 'floor', 'fill_down', 'fill_up', 'lag', 'lead', 'running_sum', 'try_number', 'try_date', 'date_year', 'date_month', 'date_day', 'weekday', 'age', 'len', 'whole', 'datetime', 'n_add', 'n_sub', 'n_mul', 'n_div', 'n_mod', 'n_percent', 'month_name', 'quarter', 'week', 'day_name', 'days_until', 'list_join', 'list_count', 'list_first', 'to_date', 'to_datetime', 'to_bool', 'not_bool', 'text_before', 'text_after', 'text_between'];

export type TransformKind = 'custom' | 'fn' | 'split' | 'merge' | 'conditional';
export interface ConditionalClause { id: string; condition: Condition; then: string; thenType: ValueType }
export interface TransformColumn {
  id: string;
  kind: TransformKind;
  /** Name of the resulting column. For `fn` it defaults to the source column (the column is replaced). */
  alias: string;
  /** custom: a KQL expression ([Name] of an earlier step's column is replaced by its calculation). */
  expr: string;
  /** fn / split: the source column. */
  column: string;
  fn: TransformFn;
  /** fn arguments: replace(find, with) · left/right(n) · substr(start, len) · extract(regex, group) · round(digits) · date(format). */
  a: string;
  b: string;
  regex: boolean;
  /** split: delimiter and which piece (1-based, negative from the end). */
  delimiter: string;
  /** merge: columns and separator. */
  columns: string[];
  separator: string;
  /** conditional: if / else-if clauses and the else value. */
  clauses: ConditionalClause[];
  otherwise: string;
  otherwiseType: ValueType;
}
export interface TransformData { columns: TransformColumn[] }

export interface JoinData {
  /** Used when nothing is connected to the right input. */
  rightSource: SourceData;
  alias: string;
  leftKey: string;
  rightKey: string;
  kind: 'inner' | 'left';
  /** Right columns to keep ("expand"); empty = all of them. Only applied when the left columns are known (tables). */
  expand: string[];
}
export type UnionData = Record<string, never>;

export type BucketKind = 'none' | 'day' | 'week' | 'month' | 'year';
export interface GroupDimension { id: string; field: string; bucket: BucketKind }
export type MetricKind =
  | 'count' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'stddev' | 'unique' | 'count_distinct' | 'percent'
  | 'first' | 'last' | 'join' | 'percentile' | 'count_if' | 'sum_if' | 'ratio';
export const METRIC_KINDS: MetricKind[] = ['count', 'sum', 'avg', 'min', 'max', 'median', 'stddev', 'unique', 'count_distinct', 'percent', 'first', 'last', 'join', 'percentile', 'count_if', 'sum_if', 'ratio'];
export interface GroupMetric {
  id: string;
  fn: MetricKind;
  field: string;
  /** ratio: denominator. */
  field2: string;
  /** percentile: 0-100 · join: separator · count_if / sum_if: the condition. */
  arg: string;
}
export interface GroupData { dimensions: GroupDimension[]; metrics: GroupMetric[]; having: string }

export interface SelectColumn { id: string; column: string; alias: string }
/** `star`: `select *` (every column) minus `except`: it works without knowing the columns. */
export interface SelectData { columns: SelectColumn[]; star?: boolean; except?: string[] }
export interface DistinctData { columns: string[] }
export interface SortKey { id: string; field: string; dir: 'asc' | 'desc' }
export interface SortData { keys: SortKey[] }
export interface LimitData {
  limit: number | null;
  offset: number | null;
  /** Keep the last N rows. */
  tail: number | null;
  /** Remove the last N rows. */
  droplast: number | null;
}
export interface UnpivotData { columns: string[]; except: boolean; attribute: string; value: string }
/** The column whose values become columns; the metric comes from the Group step before it. */
export interface PivotData { column: string; bucket: BucketKind }
export interface TransposeData { header: boolean }
export type OutputKind = 'table' | 'bar' | 'line' | 'pie' | 'area' | 'value';
export const OUTPUT_KINDS: OutputKind[] = ['table', 'bar', 'line', 'pie', 'area', 'value'];
export interface OutputData { kind: OutputKind; title: string }
export interface AdvancedData { script: string }

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  /** Step name shown in the Applied steps pane (defaults to a generated one). */
  label?: string;
  /** Step description (tooltip). */
  note?: string;
  /** A disabled step passes its input through unchanged. */
  disabled?: boolean;
  /** Id of the named query this step belongs to (default: the first query). */
  query?: string;
}

/** Inputs: `in` (default), `right` (join), `in2` (union). */
export type InputHandle = 'in' | 'right' | 'in2';
export interface FlowEdge { id: string; source: string; target: string; targetHandle?: string | null }
export interface FlowQuery {
  id: string;
  name: string;
  /** false = "Enable load" is off: the query only feeds other queries and is left out of the script's own outputs. */
  load?: boolean;
}
export type ParamType = 'text' | 'number' | 'bool' | 'date';
/** `param minimo = 100`: used as `$minimo` in expressions. */
export interface FlowParam { id: string; name: string; type: ParamType; value: string; description: string }
/** `fn conigv(x) = x * 1.18`: one expression body. */
export interface FlowFunction { id: string; name: string; args: string[]; body: string; description: string }
export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  queries?: FlowQuery[];
  params?: FlowParam[];
  functions?: FlowFunction[];
  /** When Apply wrote this flow (ms): a draft older than it is never offered back. */
  savedAt?: number;
}

export interface FlowError { nodeId: string; message: string }
export interface CompileResult {
  script: string;
  errors: FlowError[];
  /** Columns of the compiled query when they are known statically (tables); null otherwise. */
  columns: string[] | null;
}
export interface CompileOptions {
  /** Compile only this node and what feeds it; the node becomes the (single) output. */
  upTo?: string;
  /** Columns a source offers (tables); null when unknown. */
  columnsOf?: (source: SourceData) => string[] | null;
  /** The engine accepts `param` / `fn` statements: they are written first. Without it they are left out of the script. */
  declarations?: boolean;
}
