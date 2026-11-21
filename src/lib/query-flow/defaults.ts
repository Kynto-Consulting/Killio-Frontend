import { NODE_TYPES, SOURCE_KINDS } from './types.ts';
import type { FlowFunction, FlowParam, InlineTable } from './types.ts';
import type {
  AdvancedData, Condition, DistinctData, FilterData, FlowEdge, FlowGraph, FlowNode, FlowQuery, GroupData, JoinData, LimitData,
  NodeType, OutputData, PivotData, SelectData, SortData, SourceData, TransformColumn, TransformData, TransformKind, TransposeData, UnionData, UnpivotData,
} from './types.ts';

let counter = 0;
export function uid(prefix = 'n'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function newCondition(partial: Partial<Condition> = {}): Condition {
  return { id: uid('c'), field: '', op: '=', value: '', value2: '', vtype: 'auto', values: [], ...partial };
}

export function newTransformColumn(kind: TransformKind = 'custom', partial: Partial<TransformColumn> = {}): TransformColumn {
  return {
    id: uid('t'), kind, alias: '', expr: '', column: '', fn: 'trim', a: '', b: '', regex: false,
    delimiter: ',', columns: [], separator: ' ', clauses: [], otherwise: '', otherwiseType: 'auto', ...partial,
  };
}

export function defaultData(type: NodeType): Record<string, unknown> {
  switch (type) {
    case 'source': return { kind: 'cards', name: '' } satisfies SourceData;
    case 'filter': return { combine: 'and', conditions: [newCondition()], advanced: '' } satisfies FilterData;
    case 'transform': return { columns: [newTransformColumn('custom')] } satisfies TransformData;
    case 'join': return { rightSource: { kind: 'members', name: '' }, alias: '', leftKey: '', rightKey: '', kind: 'inner', expand: [] } satisfies JoinData;
    case 'union': return {} satisfies UnionData;
    case 'group': return { dimensions: [], metrics: [{ id: uid('m'), fn: 'count', field: '', field2: '', arg: '' }], having: '' } satisfies GroupData;
    case 'select': return { columns: [] } satisfies SelectData;
    case 'distinct': return { columns: [] } satisfies DistinctData;
    case 'sort': return { keys: [{ id: uid('k'), field: '', dir: 'asc' }] } satisfies SortData;
    case 'limit': return { limit: 100, offset: null, tail: null, droplast: null } satisfies LimitData;
    case 'unpivot': return { columns: [], except: false, attribute: 'Attribute', value: 'Value' } satisfies UnpivotData;
    case 'pivot': return { column: '', bucket: 'none' } satisfies PivotData;
    case 'transpose': return { header: false } satisfies TransposeData;
    case 'output': return { kind: 'table', title: '' } satisfies OutputData;
    case 'advanced': return { script: '' } satisfies AdvancedData;
    default: return {};
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strArr = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function normCondition(raw: unknown): Condition {
  const r = isRecord(raw) ? raw : {};
  return newCondition({
    id: str(r.id) || uid('c'), field: str(r.field), op: (str(r.op, '=') as Condition['op']), value: str(r.value), value2: str(r.value2),
    vtype: (str(r.vtype, 'auto') as Condition['vtype']), values: strArr(r.values),
  });
}

function normTransformColumn(raw: unknown): TransformColumn {
  const r = isRecord(raw) ? raw : {};
  return newTransformColumn((str(r.kind, 'custom') as TransformKind), {
    id: str(r.id) || uid('t'), alias: str(r.alias), expr: str(r.expr), column: str(r.column), fn: (str(r.fn, 'trim') as TransformColumn['fn']),
    a: str(r.a), b: str(r.b), regex: r.regex === true, delimiter: str(r.delimiter, ','), columns: strArr(r.columns), separator: str(r.separator, ' '),
    clauses: arr(r.clauses).map((c) => {
      const cr = isRecord(c) ? c : {};
      return { id: str(cr.id) || uid('cl'), condition: normCondition(cr.condition), then: str(cr.then), thenType: (str(cr.thenType, 'auto') as Condition['vtype']) };
    }),
    otherwise: str(r.otherwise), otherwiseType: (str(r.otherwiseType, 'auto') as Condition['vtype']),
  });
}

function normSource(raw: unknown): SourceData {
  const r = isRecord(raw) ? raw : {};
  const kind = SOURCE_KINDS.includes(r.kind as never) ? (r.kind as SourceData['kind']) : 'cards';
  const out: SourceData = { kind, name: str(r.name) };
  if (isRecord(r.table)) {
    const columns = strArr(r.table.columns);
    const types = arr(r.table.types).map((x) => (['auto', 'text', 'number', 'bool', 'date'].includes(String(x)) ? String(x) : 'auto')) as NonNullable<InlineTable['types']>;
    out.table = { columns, rows: arr(r.table.rows).map((row) => arr(row).map((c) => (typeof c === 'string' ? c : typeof c === 'number' ? String(c) : ''))), ...(types.length ? { types } : {}) } satisfies InlineTable;
  }
  if (isRecord(r.scope) && (str(r.scope.board).trim() || str(r.scope.list).trim())) out.scope = { board: str(r.scope.board), list: str(r.scope.list) };
  return out;
}

/** Fills every field of a node's data (a malformed or old saved flow never reaches the compiler or the components with holes). */
export function normalizeData(type: NodeType, raw: unknown): Record<string, unknown> {
  const r = isRecord(raw) ? raw : {};
  switch (type) {
    case 'source': return { ...normSource(r) };
    case 'filter': return { combine: r.combine === 'or' ? 'or' : 'and', conditions: arr(r.conditions).map(normCondition), advanced: str(r.advanced) };
    case 'transform': return { columns: arr(r.columns).map(normTransformColumn) };
    case 'join': return {
      rightSource: normSource(r.rightSource), alias: str(r.alias), leftKey: str(r.leftKey), rightKey: str(r.rightKey),
      kind: r.kind === 'left' ? 'left' : 'inner', expand: strArr(r.expand),
    };
    case 'union': return {};
    case 'group': return {
      dimensions: arr(r.dimensions).map((d) => { const dr = isRecord(d) ? d : {}; return { id: str(dr.id) || uid('d'), field: str(dr.field), bucket: str(dr.bucket, 'none') }; }),
      metrics: arr(r.metrics).map((m) => { const mr = isRecord(m) ? m : {}; return { id: str(mr.id) || uid('m'), fn: str(mr.fn, 'count'), field: str(mr.field), field2: str(mr.field2), arg: str(mr.arg) }; }),
      having: str(r.having),
    };
    case 'select': return { columns: arr(r.columns).map((c) => { const cr = isRecord(c) ? c : {}; return { id: str(cr.id) || uid('s'), column: str(cr.column), alias: str(cr.alias) }; }), ...(r.star === true ? { star: true, except: strArr(r.except) } : {}) };
    case 'distinct': return { columns: strArr(r.columns) };
    case 'sort': return { keys: arr(r.keys).map((k) => { const kr = isRecord(k) ? k : {}; return { id: str(kr.id) || uid('k'), field: str(kr.field), dir: kr.dir === 'desc' ? 'desc' : 'asc' }; }) };
    case 'limit': return { limit: numOrNull(r.limit), offset: numOrNull(r.offset), tail: numOrNull(r.tail), droplast: numOrNull(r.droplast) };
    case 'unpivot': return { columns: strArr(r.columns), except: r.except === true, attribute: str(r.attribute, 'Attribute'), value: str(r.value, 'Value') };
    case 'pivot': return { column: str(r.column), bucket: ['none', 'day', 'week', 'month', 'year'].includes(str(r.bucket)) ? str(r.bucket) : 'none' };
    case 'transpose': return { header: r.header === true };
    case 'output': return { kind: ['table', 'bar', 'line', 'pie', 'area', 'value'].includes(str(r.kind)) ? str(r.kind) : 'table', title: str(r.title) };
    case 'advanced': return { script: str(r.script) };
    default: return {};
  }
}

export function makeNode(type: NodeType, position = { x: 0, y: 0 }, data?: Record<string, unknown>, extra: Partial<FlowNode> = {}): FlowNode {
  return { id: uid('n'), type, position, data: data ? normalizeData(type, data) : defaultData(type), ...extra };
}

/** Typed view of a node's data (always complete). */
export function dataOf<T>(node: FlowNode): T {
  return normalizeData(node.type, node.data) as unknown as T;
}

export const DEFAULT_QUERY_ID = 'q1';

/** Defensive loader of a saved `source.flow`: returns null when it has no usable nodes. Never throws. */
export function normalizeGraph(raw: unknown): FlowGraph | null {
  try {
    if (!isRecord(raw)) return null;
    const nodes: FlowNode[] = [];
    const seen = new Set<string>();
    for (const n of arr(raw.nodes)) {
      if (!isRecord(n)) continue;
      const type = n.type as NodeType;
      if (!NODE_TYPES.includes(type)) continue;
      const id = str(n.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const pos = isRecord(n.position) ? n.position : {};
      nodes.push({
        id, type,
        position: { x: typeof pos.x === 'number' && Number.isFinite(pos.x) ? pos.x : 0, y: typeof pos.y === 'number' && Number.isFinite(pos.y) ? pos.y : 0 },
        data: normalizeData(type, n.data),
        ...(typeof n.label === 'string' && n.label ? { label: n.label } : {}),
        ...(typeof n.note === 'string' && n.note ? { note: n.note } : {}),
        ...(n.disabled === true ? { disabled: true } : {}),
        ...(typeof n.query === 'string' && n.query ? { query: n.query } : {}),
      });
    }
    if (nodes.length === 0) return null;
    const edges: FlowEdge[] = [];
    const edgeIds = new Set<string>();
    for (const e of arr(raw.edges)) {
      if (!isRecord(e)) continue;
      const source = str(e.source);
      const target = str(e.target);
      if (!seen.has(source) || !seen.has(target) || source === target) continue;
      let id = str(e.id) || `${source}->${target}`;
      if (edgeIds.has(id)) id = uid('e');
      edgeIds.add(id);
      edges.push({ id, source, target, targetHandle: typeof e.targetHandle === 'string' ? e.targetHandle : null });
    }
    const queries: FlowQuery[] = [];
    for (const q of arr(raw.queries)) {
      if (!isRecord(q) || !str(q.id)) continue;
      queries.push({ id: str(q.id), name: str(q.name) || str(q.id), ...(q.load === false ? { load: false } : {}) });
    }
    const params: FlowParam[] = arr(raw.params).filter(isRecord).map((p) => ({ id: str(p.id) || uid('p'), name: str(p.name), type: (['text', 'number', 'bool', 'date'].includes(str(p.type)) ? str(p.type) : 'text') as FlowParam['type'], value: str(p.value), description: str(p.description) }));
    const functions: FlowFunction[] = arr(raw.functions).filter(isRecord).map((f) => ({ id: str(f.id) || uid('f'), name: str(f.name), args: strArr(f.args), body: str(f.body), description: str(f.description) }));
    const savedAt = typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : undefined;
    return { nodes, edges, ...(queries.length ? { queries } : {}), ...(params.length ? { params } : {}), ...(functions.length ? { functions } : {}), ...(savedAt !== undefined ? { savedAt } : {}) };
  } catch {
    return null;
  }
}

export function emptyGraph(): FlowGraph {
  return { nodes: [], edges: [], queries: [{ id: DEFAULT_QUERY_ID, name: 'Query1' }] };
}

/** A flow with one "Advanced KQL" step holding `script` (nothing is lost when a script cannot be drawn). */
export function advancedGraph(script: string): FlowGraph {
  return { nodes: [makeNode('advanced', { x: 0, y: 0 }, { script }, { query: DEFAULT_QUERY_ID })], edges: [], queries: [{ id: DEFAULT_QUERY_ID, name: 'Query1' }] };
}
