import { DEFAULT_QUERY_ID, makeNode, newCondition, uid } from './defaults.ts';
import { NODE_GAP_X } from './steps.ts';
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from './types.ts';

function build(steps: Array<[NodeType, Record<string, unknown>]>): FlowGraph {
  const nodes: FlowNode[] = steps.map(([type, data], i) => makeNode(type, { x: i * NODE_GAP_X, y: 0 }, data, { query: DEFAULT_QUERY_ID }));
  const edges: FlowEdge[] = nodes.slice(1).map((n, i) => ({ id: uid('e'), source: nodes[i].id, target: n.id, targetHandle: 'in' }));
  return { nodes, edges, queries: [{ id: DEFAULT_QUERY_ID, name: 'Query1' }] };
}
const metric = (fn: string, field = '') => ({ id: uid('m'), fn, field, field2: '', arg: '' });
const dim = (field: string, bucket = 'none') => ({ id: uid('d'), field, bucket });
const cond = (field: string, op: string, value = '') => newCondition({ field, op: op as never, value });
const filter = (...conditions: ReturnType<typeof cond>[]): [NodeType, Record<string, unknown>] => ['filter', { combine: 'and', conditions, advanced: '' }];

export interface FlowTemplate { id: string; build: (title: string) => FlowGraph }

/** Ready-made graphs of the "Templates" menu. `title` is the (translated) title of the output. */
export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'resolvedPerPerson',
    build: (title) => build([['source', { kind: 'cards', name: '' }], filter(cond('completed', 'window', 'last 30d')), ['group', { dimensions: [dim('assignee')], metrics: [metric('count')], having: '' }], ['output', { kind: 'bar', title }]]),
  },
  {
    id: 'overdueByList',
    build: (title) => build([['source', { kind: 'cards', name: '' }], filter(cond('', 'flag', 'overdue')), ['group', { dimensions: [dim('list')], metrics: [metric('count')], having: '' }], ['output', { kind: 'bar', title }]]),
  },
  {
    id: 'openByPriority',
    build: (title) => build([['source', { kind: 'cards', name: '' }], filter(cond('', 'flag', 'open')), ['group', { dimensions: [dim('priority')], metrics: [metric('count'), metric('sum', 'points')], having: '' }], ['output', { kind: 'pie', title }]]),
  },
  {
    id: 'createdPerWeek',
    build: (title) => build([['source', { kind: 'cards', name: '' }], ['group', { dimensions: [dim('created', 'week')], metrics: [metric('count')], having: '' }], ['output', { kind: 'line', title }]]),
  },
  {
    id: 'topClosers',
    build: (title) => build([
      ['source', { kind: 'cards', name: '' }], filter(cond('completed', 'window', 'last 90d')),
      ['group', { dimensions: [dim('assignee')], metrics: [metric('count')], having: '' }],
      ['sort', { keys: [{ id: uid('k'), field: 'count', dir: 'desc' }] }], ['limit', { limit: 5, offset: null }], ['output', { kind: 'bar', title }],
    ]),
  },
];
