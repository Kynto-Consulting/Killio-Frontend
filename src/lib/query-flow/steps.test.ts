import assert from 'node:assert/strict';
import test from 'node:test';

import { compileFlow } from './compile.ts';
import { makeNode, newCondition, uid } from './defaults.ts';
import { diagnoseFlow } from './diagnose.ts';
import { autoLayout } from './layout.ts';
import { buildOp, OPS, opsForColumn, UNSUPPORTED_OPS } from './ops.ts';
import {
  addQuery, chainAround, chainTo, describeStep, duplicateBranch, insertAfter, insertionPoint, moveStep, referenceQuery, removeQuery, removeStep, renameQuery, renameStep,
  summarize, terminalOfQuery, toggleDisabled,
} from './steps.ts';
import { FLOW_TEMPLATES } from './templates.ts';
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from './types.ts';

const node = (type: NodeType, data: Record<string, unknown> = {}, extra: Partial<FlowNode> = {}) => makeNode(type, { x: 0, y: 0 }, data, extra);
function chain(...nodes: FlowNode[]): FlowGraph {
  const edges: FlowEdge[] = nodes.slice(1).map((n, i) => ({ id: uid('e'), source: nodes[i].id, target: n.id, targetHandle: 'in' }));
  return { nodes, edges };
}
const filterDone = () => node('filter', { conditions: [newCondition({ field: 'done', op: 'flag', value: 'done' })] });
const ids = (g: FlowGraph, id: string) => chainAround(g, id).map((n) => n.type);

test('insert in the middle, delete and reconnect', () => {
  const src = node('source', { kind: 'cards' });
  const grp = node('group', { dimensions: [{ id: 'd', field: 'list', bucket: 'none' }], metrics: [] });
  const out = node('output', { title: 'T' });
  let g = chain(src, grp, out);
  const flt = filterDone();
  g = insertAfter(g, src.id, flt);
  assert.deepEqual(ids(g, src.id), ['source', 'filter', 'group', 'output']);
  assert.equal(compileFlow(g).script, 'show cards where done group by list as "T"');
  assert.ok(g.nodes.find((n) => n.id === out.id)!.position.x >= 0);
  g = removeStep(g, flt.id);
  assert.deepEqual(ids(g, src.id), ['source', 'group', 'output']);
  assert.equal(compileFlow(g).script, 'show cards group by list as "T"');
  assert.equal(removeStep(g, 'zzz'), g);
});

test('reorder keeps the source first and the output last', () => {
  const src = node('source', { kind: 'cards' });
  const a = filterDone();
  const b = node('sort', { keys: [{ id: 'k', field: 'title', dir: 'asc' }] });
  const out = node('output', {});
  let g = chain(src, a, b, out);
  g = moveStep(g, a.id, 1);
  assert.deepEqual(chainAround(g, src.id).map((n) => n.id), [src.id, b.id, a.id, out.id]);
  assert.equal(moveStep(g, src.id, 1), g);
  assert.equal(moveStep(g, b.id, -1), g);
  const g2 = moveStep(g, a.id, 1);
  assert.equal(g2, g);
  assert.equal(compileFlow(g).errors.length, 0);
});

test('disable, rename and describe do not touch the data', () => {
  const src = node('source', { kind: 'cards' });
  const f = filterDone();
  let g = chain(src, f);
  g = toggleDisabled(g, f.id);
  assert.equal(compileFlow(g).script, 'show cards');
  assert.equal(toggleDisabled(g, src.id), g);
  g = toggleDisabled(g, f.id);
  assert.equal(compileFlow(g).script, 'show cards where done');
  g = renameStep(g, f.id, '  Only done ');
  g = describeStep(g, f.id, 'why');
  assert.equal(g.nodes.find((n) => n.id === f.id)!.label, 'Only done');
  assert.equal(g.nodes.find((n) => n.id === f.id)!.note, 'why');
  assert.equal(renameStep(g, f.id, '').nodes.find((n) => n.id === f.id)!.label, undefined);
});

test('insertion point and chains', () => {
  const src = node('source', { kind: 'cards' });
  const f = filterDone();
  const out = node('output', {});
  const g = chain(src, f, out);
  assert.equal(insertionPoint(g, out.id)!.id, f.id);
  assert.equal(insertionPoint(g, src.id)!.id, src.id);
  assert.equal(insertionPoint(g, null)!.id, f.id);
  assert.deepEqual(chainTo(g, f.id).map((n) => n.id), [src.id, f.id]);
  assert.equal(terminalOfQuery(g, 'q1')!.id, f.id);
  const cyc: FlowGraph = { nodes: [src, f], edges: [{ id: '1', source: src.id, target: f.id }, { id: '2', source: f.id, target: src.id }] };
  assert.equal(chainTo(cyc, f.id).length, 2);
  assert.ok(chainAround(cyc, f.id).length <= 2);
});

test('queries: add, reference, rename, remove', () => {
  const src = node('source', { kind: 'cards' });
  let g: FlowGraph = chain(src);
  const added = addQuery(g);
  g = added.graph;
  assert.equal(g.queries!.length, 2);
  assert.equal(g.nodes[0].query, g.queries![0].id);
  const ref = referenceQuery(g, g.queries![0].id);
  g = ref.graph;
  assert.equal(g.queries!.length, 3);
  const compiled = compileFlow(g);
  assert.equal(compiled.errors.length, 0, JSON.stringify(compiled.errors));
  g = renameQuery(g, g.queries![0].id, 'Base');
  assert.equal(g.queries![0].name, 'Base');
  assert.equal(renameQuery(g, g.queries![0].id, '  ').queries![0].name, 'Base');
  g = removeQuery(g, g.queries![0].id);
  assert.equal(g.queries!.length, 2);
  const orphan = g.nodes.find((n) => n.id === ref.sourceId)!;
  assert.equal((orphan.data as { kind: string }).kind, 'cards');
  assert.equal(removeQuery({ nodes: [], edges: [], queries: [{ id: 'a', name: 'A' }] }, 'a').queries!.length, 1);
});

test('duplicate a branch copies the steps up to a node', () => {
  const src = node('source', { kind: 'cards' });
  const f = filterDone();
  const g = chain(src, f);
  const r = duplicateBranch(g, f.id);
  assert.equal(r.graph.nodes.length, 4);
  assert.equal(r.graph.edges.length, 2);
  assert.ok(r.copyId && r.copyId !== f.id);
  assert.equal(compileFlow(r.graph, { upTo: r.copyId! }).script, 'show cards where done');
  assert.equal(duplicateBranch(g, 'nope').copyId, null);
});

test('summaries are short and defensive', () => {
  assert.equal(summarize(node('source', { kind: 'rows', name: 'Ventas' })), 'Ventas');
  assert.equal(summarize(node('group', { dimensions: [{ id: 'd', field: 'assignee', bucket: 'week' }], metrics: [{ id: 'm', fn: 'sum', field: 'points', field2: '', arg: '' }] })), 'week(assignee) · sum(points)');
  assert.equal(summarize(node('limit', { limit: 5, offset: 2 })), 'skip 2, keep 5');
  assert.equal(summarize({ id: 'x', type: 'filter', position: { x: 0, y: 0 }, data: {} as never }), '');
});

test('ribbon operations build steps that compile', () => {
  const columns = ['Cliente', 'Monto', 'Estado'];
  const base = (extra: FlowNode[]) => chain(node('source', { kind: 'rows', name: 'Ventas' }), ...extra);
  const columnsOf = (s: { kind: string }) => (s.kind === 'rows' ? columns : null);
  const run = (id: string, ctx: { column?: string; params?: Record<string, string>; values?: string[] }) => {
    const spec = buildOp(id, { columns, params: {}, ...ctx });
    assert.ok(spec, id);
    const n = node(spec!.type, spec!.data);
    const r = compileFlow(base([n]), { columnsOf });
    assert.deepEqual(r.errors, [], id);
    return r.script;
  };
  assert.equal(run('trim', { column: 'Cliente' }), 'show rows of "Ventas" select trim(Cliente) as "Cliente", Monto, Estado'.replace('select trim(Cliente) as "Cliente", Monto, Estado', 'select trim(Cliente) as "Cliente", Monto, Estado'));
  assert.ok(run('replace', { column: 'Cliente', params: { find: 'a', with: 'b' } }).includes('replace(Cliente, "a", "b")'));
  assert.ok(run('split', { column: 'Cliente', params: { delimiter: ' ', piece: '1', name: 'Nombre' } }).includes('split(Cliente, " ", 1) as "Nombre"'));
  assert.ok(run('merge', { params: { columns: 'Cliente, Estado', separator: '-', name: 'Ambos' } }).includes('Cliente & "-" & [Estado] as "Ambos"'));
  assert.ok(run('customColumn', { params: { name: 'Doble', expr: 'mul(Monto, 2)' } }).includes('mul(Monto, 2) as "Doble"'));
  assert.equal(run('keepTop', { params: { n: '3' } }), 'show rows of "Ventas" select Cliente, Monto, Estado limit 3');
  assert.equal(run('removeTop', { params: { n: '2' } }), 'show rows of "Ventas" select Cliente, Monto, Estado offset 2');
  assert.ok(run('removeDuplicates', { column: 'Estado' }).includes('select distinct Estado'));
  assert.ok(run('removeDuplicates', {}).includes('select distinct Cliente, Monto, Estado'));
  assert.ok(run('removeEmpty', { column: 'Monto' }).includes('where Monto is not empty'));
  assert.ok(run('removeEmpty', {}).includes('where (Cliente is not empty or Monto is not empty or Estado is not empty)'));
  assert.ok(run('filterValues', { column: 'Estado', values: ['Pagado'] }).includes('where Estado = "Pagado"'));
  assert.ok(run('filterValues', { column: 'Estado', values: ['Pagado', 'Pendiente'] }).includes('Estado in ("Pagado", "Pendiente")'));
  assert.ok(run('filterCompare', { column: 'Monto', params: { op: '>', value: '5' } }).includes('where Monto > 5'));
  assert.ok(run('sortDesc', { column: 'Monto' }).includes('order by Monto desc'));
  assert.ok(run('removeColumn', { column: 'Monto' }).endsWith('select Cliente, Estado'));
  assert.ok(run('keepColumns', { params: { columns: 'Estado, Cliente' } }).endsWith('select Estado, Cliente'));
  assert.ok(run('renameColumn', { column: 'Cliente', params: { name: 'Quien' } }).endsWith('select Cliente as "Quien", Monto, Estado'));
  assert.ok(run('duplicateColumn', { column: 'Cliente' }).endsWith('select Cliente, Cliente as "Cliente - Copy", Monto, Estado'));
  assert.ok(run('moveRight', { column: 'Cliente' }).endsWith('select Monto, Cliente, Estado'));
  assert.ok(run('groupBy', { column: 'Estado' }).endsWith('group by Estado count'));
  assert.ok(run('round', { column: 'Monto', params: { digits: '1' } }).includes('round(Monto, 1)'));
  assert.ok(run('toDate', { column: 'Cliente', params: { format: 'dd MMM' } }).includes('date(Cliente, "dd MMM")'));
  assert.equal(buildOp('trim', { columns, params: {} }), null);
  assert.equal(buildOp('moveLeft', { column: 'Cliente', columns, params: {} }), null);
  // columns not known: `select * except (...)`
  assert.deepEqual(buildOp('removeColumn', { column: 'Monto', columns: [], params: {} })!.data, { columns: [], star: true, except: ['Monto'] });
  assert.equal(buildOp('removeColumn', { selected: [], columns: ['a'], params: {} }), null);
  assert.equal(buildOp('nope', { columns, params: {} }), null);
  assert.ok(!(UNSUPPORTED_OPS as readonly string[]).includes('pivot'));
  assert.ok((UNSUPPORTED_OPS as readonly string[]).includes('useFirstRowAsHeaders'));
  assert.ok(opsForColumn('text').some((o) => o.id === 'trim'));
  assert.ok(!opsForColumn('number').some((o) => o.id === 'trim'));
  assert.ok(opsForColumn('number').some((o) => o.id === 'round'));
  assert.ok(OPS.every((o) => o.id));
});

test('templates compile and parse', () => {
  for (const tpl of FLOW_TEMPLATES) {
    const g = tpl.build('Title');
    const d = diagnoseFlow(g);
    assert.deepEqual(d.result.errors, [], tpl.id);
    assert.equal(d.engineError, null, tpl.id);
    assert.deepEqual(d.issues, {}, tpl.id);
    assert.ok(d.result.script.endsWith('as "Title"'));
  }
  assert.equal(FLOW_TEMPLATES[0].build('x').nodes.length, 4);
});

test('diagnose marks the first node the engine rejects, once', () => {
  const src = node('source', { kind: 'cards' });
  const bad = node('filter', { conditions: [], advanced: 'title ??? 3' });
  const later = node('limit', { limit: 3 });
  const g = chain(src, bad, later);
  const d = diagnoseFlow(g);
  assert.deepEqual(Object.keys(d.issues), [bad.id]);
  assert.equal(d.issues[bad.id].kind, 'engine');
  assert.ok(d.engineError);
  const lonely = diagnoseFlow(chain(node('group', {})));
  assert.equal(Object.values(lonely.issues)[0].kind, 'compile');
});

test('auto layout places steps left to right without overlap', () => {
  const src = node('source', { kind: 'cards' });
  const a = filterDone();
  const out = node('output', {});
  const clientes = node('source', { kind: 'members' });
  const join = node('join', { leftKey: 'a', rightKey: 'b' });
  const g: FlowGraph = {
    nodes: [src, a, clientes, join, out],
    edges: [{ id: '1', source: src.id, target: a.id }, { id: '2', source: a.id, target: join.id }, { id: '3', source: clientes.id, target: join.id, targetHandle: 'right' }, { id: '4', source: join.id, target: out.id }],
  };
  const laid = autoLayout(g);
  const pos = (id: string) => laid.nodes.find((n) => n.id === id)!.position;
  assert.ok(pos(src.id).x < pos(a.id).x && pos(a.id).x < pos(join.id).x && pos(join.id).x < pos(out.id).x);
  assert.notDeepEqual(pos(clientes.id), pos(src.id));
  const seen = new Set(laid.nodes.map((n) => `${n.position.x},${n.position.y}`));
  assert.equal(seen.size, laid.nodes.length);
  assert.doesNotThrow(() => autoLayout({ nodes: [src, a], edges: [{ id: '1', source: src.id, target: a.id }, { id: '2', source: a.id, target: src.id }] }));
});
