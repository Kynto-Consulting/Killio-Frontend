import assert from 'node:assert/strict';
import test from 'node:test';

import { compileFlow } from './compile.ts';
import { makeNode, newCondition, newTransformColumn, uid } from './defaults.ts';
import { DEFAULT_UI_STATE, PANE_LIMITS, clampSize, clockText, loadUiState, parseUiState, pickMountMode, resizeFromDrag, saveUiState, serializeUiState, UI_STORAGE_KEY } from './layout-state.ts';
import { buildOp, notErrorCondition, OPS, UNSUPPORTED_OPS } from './ops.ts';
import { chainAround, deleteUntilEnd, duplicateQuery, extractPrevious } from './steps.ts';
import { KQL_SYNTAX_GUIDE, parseKqlScript, runKql } from '../query/kql.ts';
import { tablesFromBricks } from '../query/tables.ts';
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from './types.ts';

const node = (type: NodeType, data: Record<string, unknown> = {}, extra: Partial<FlowNode> = {}) => makeNode(type, { x: 0, y: 0 }, data, extra);
function chain(...nodes: FlowNode[]): FlowGraph {
  const edges: FlowEdge[] = nodes.slice(1).map((n, i) => ({ id: uid('e'), source: nodes[i].id, target: n.id, targetHandle: 'in' }));
  return { nodes, edges };
}
const bricks = [{
  id: 'v', kind: 'table',
  content: { title: 'Ventas', rows: [['Cliente', 'Monto', 'Estado', 'Fecha'], ['Ana', '10', 'Pagado', '2026-01-03'], ['Beto', 'abc', 'Pagado', 'nope'], ['Ana', '', '', '2026-02-10'], ['Cira', '7', 'Pendiente', '2026-03-15'], ['Dani', '20', '', '2026-04-01']] },
}];
const tables = tablesFromBricks(bricks);
const columnsOf = (s: { kind: string; name: string }) => (s.kind === 'rows' ? tables.find((t) => t.title === s.name)?.columns ?? null : null);
const src = () => node('source', { kind: 'rows', name: 'Ventas' });
const run = (g: FlowGraph) => {
  const r = compileFlow(g, { columnsOf });
  assert.deepEqual(r.errors, []);
  assert.doesNotThrow(() => parseKqlScript(r.script), r.script);
  return { script: r.script, out: runKql(r.script, { tables })[0].result };
};
const cellsOf = (out: ReturnType<typeof run>['out'], label: string) => { const i = out.columns.findIndex((c) => c.label === label); return out.rows.map((r) => r.cells[i]); };
const tr = (c: Record<string, unknown>) => node('transform', { columns: [newTransformColumn((c.kind as never) ?? 'fn', c)] });

test('the engine guide examples parse (fixtures of the compiler)', () => {
  const examples = KQL_SYNTAX_GUIDE.slice(KQL_SYNTAX_GUIDE.indexOf('\nExamples:\n') + 11).split('\n').map((l) => l.trim().replace(/\s+--.*$/, '').replace(/`$/, '')).filter(Boolean);
  assert.ok(examples.length > 20);
  for (const e of examples) assert.doesNotThrow(() => parseKqlScript(e), e);
});

test('index column, running sum, lag and fill down / up', () => {
  const idx = buildOp('indexColumn', { columns: [], params: { name: '#', start: '1' } })!;
  const g = chain(src(), node(idx.type, idx.data), tr({ column: 'Monto', fn: 'running_sum', alias: 'Total' }), tr({ column: 'Estado', fn: 'fill_down', alias: 'Estado' }), tr({ column: 'Cliente', fn: 'lag', a: '1', alias: 'Antes' }));
  const { script, out } = run(g);
  assert.ok(script.includes('rownum(1) as "#"'));
  assert.ok(script.includes('fill_down(Estado) as "Estado"'));
  assert.deepEqual(cellsOf(out, '#'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(cellsOf(out, 'Estado'), ['Pagado', 'Pagado', 'Pagado', 'Pendiente', 'Pendiente']);
  const up = run(chain(src(), tr({ column: 'Estado', fn: 'fill_up', alias: 'Estado' })));
  assert.equal(cellsOf(up.out, 'Estado')[2], 'Pendiente');
  const part = compileFlow(chain(src(), tr({ column: 'Estado', fn: 'fill_down', a: 'Cliente' })), { columnsOf });
  assert.ok(part.script.includes('fill_down(Estado, Cliente)'));
  assert.equal(compileFlow(chain(src(), tr({ column: 'Estado', fn: 'lag', a: 'x' })), { columnsOf }).errors.length, 1);
});

test('keep / remove bottom rows follow the engine order: offset, droplast, limit, tail', () => {
  const lim = (d: Record<string, unknown>) => node('limit', d);
  const bottom = run(chain(src(), lim({ limit: null, offset: null, tail: 2, droplast: null })));
  assert.ok(bottom.script.endsWith('tail 2'));
  assert.deepEqual(cellsOf(bottom.out, 'Cliente'), ['Cira', 'Dani']);
  const drop = run(chain(src(), lim({ limit: null, offset: 1, tail: null, droplast: 1 })));
  assert.ok(drop.script.endsWith('offset 1 droplast 1'));
  assert.equal(drop.out.rows.length, 3);
  const all = compileFlow(chain(src(), lim({ limit: 3, offset: 1, tail: 1, droplast: 1 })), { columnsOf });
  assert.ok(all.script.endsWith('offset 1 droplast 1 limit 3 tail 1'));
  assert.doesNotThrow(() => parseKqlScript(all.script));
  assert.equal(compileFlow(chain(src(), lim({ limit: null, offset: null, tail: 0, droplast: null })), { columnsOf }).errors.length, 1);
  assert.equal(compileFlow(chain(src(), lim({ limit: null, offset: null, tail: 2, droplast: null }), node('sort', { keys: [{ id: 'k', field: 'Cliente', dir: 'asc' }] })), { columnsOf }).errors.length, 1);
  const range = buildOp('keepRange', { columns: [], params: { first: '2', count: '2' } })!;
  assert.equal(run(chain(src(), node(range.type, range.data))).out.rows.length, 2);
});

test('pivot takes the metric of the Group step; unpivot goes right after the source; transpose is last', () => {
  const grp = node('group', { dimensions: [{ id: 'd', field: 'Cliente', bucket: 'none' }], metrics: [{ id: 'm', fn: 'count', field: '', field2: '', arg: '' }], having: '' });
  const piv = node('pivot', { column: 'Estado', bucket: 'none' });
  const p = run(chain(src(), grp, piv));
  assert.equal(p.script, 'show rows of "Ventas" group by Cliente pivot Estado count');
  assert.ok(p.out.columns.length >= 3);
  const noGroup = compileFlow(chain(src(), piv), { columnsOf });
  assert.equal(noGroup.errors.length, 1);
  const twoMetrics = node('group', { dimensions: [{ id: 'd', field: 'Cliente', bucket: 'none' }], metrics: [{ id: 'a', fn: 'count', field: '', field2: '', arg: '' }, { id: 'b', fn: 'sum', field: 'Monto', field2: '', arg: '' }], having: '' });
  assert.equal(compileFlow(chain(src(), twoMetrics, node('pivot', { column: 'Estado' })), { columnsOf }).errors.length, 1);
  const having = node('group', { dimensions: [{ id: 'd', field: 'Cliente', bucket: 'none' }], metrics: [], having: 'count > 1' });
  assert.equal(compileFlow(chain(src(), having, node('pivot', { column: 'Estado' })), { columnsOf }).errors.length, 1);
  const sorted = compileFlow(chain(src(), grp, piv, node('sort', { keys: [{ id: 'k', field: 'key', dir: 'asc' }] })), { columnsOf });
  assert.deepEqual(sorted.errors, []);
  assert.doesNotThrow(() => parseKqlScript(sorted.script));
  assert.equal(compileFlow(chain(src(), grp, piv, node('sort', { keys: [{ id: 'k', field: 'count', dir: 'asc' }] })), { columnsOf }).errors.length, 1);

  const un = run(chain(src(), node('unpivot', { columns: ['Cliente'], except: true, attribute: 'Campo', value: 'Valor' })));
  assert.equal(un.script, 'show rows of "Ventas" unpivot except Cliente as "Campo", "Valor" select Cliente, Campo, Valor');
  assert.equal(un.out.rows.length, 15);
  const some = run(chain(src(), node('unpivot', { columns: ['Monto', 'Fecha'], except: false, attribute: 'A', value: 'V' }), node('filter', { conditions: [newCondition({ field: 'A', op: '=', value: 'Monto' })] })));
  assert.ok(some.script.indexOf('unpivot') < some.script.indexOf('where'));
  assert.equal(some.out.rows.length, 5);
  // a filter BEFORE the unpivot moves into a let (the engine reads unpivot before where)
  const before = compileFlow(chain(src(), node('filter', { conditions: [newCondition({ field: 'Estado', op: '=', value: 'Pagado' })] }), node('unpivot', { columns: ['Cliente'], except: true })), { columnsOf });
  assert.deepEqual(before.errors, []);
  assert.ok(before.script.startsWith('let '));
  assert.doesNotThrow(() => parseKqlScript(before.script));
  assert.equal(compileFlow(chain(src(), node('unpivot', { columns: [] })), { columnsOf }).errors.length, 1);
  assert.equal(compileFlow(chain(node('source', { kind: 'cards' }), node('unpivot', { columns: ['points'], except: true })), { columnsOf }).errors.length, 1);
  assert.equal(compileFlow(chain(src(), tr({ column: 'Cliente', fn: 'upper' }), node('unpivot', { columns: ['Cliente'], except: true })), { columnsOf }).errors.length, 1);
  const cards = compileFlow(chain(node('source', { kind: 'cards' }), node('unpivot', { columns: ['points', 'comments'], except: false, attribute: 'Metric', value: 'Value' }), node('select', { columns: [{ id: 'a', column: 'title', alias: '' }, { id: 'b', column: 'Metric', alias: '' }] })));
  assert.deepEqual(cards.errors, []);
  assert.doesNotThrow(() => parseKqlScript(cards.script));

  const t = run(chain(src(), grp, piv, node('transpose', { header: true })));
  assert.ok(t.script.endsWith('transpose header'));
  assert.equal(compileFlow(chain(src(), node('transpose', {}), node('filter', { conditions: [newCondition({ field: 'Cliente', op: 'notempty' })] })), { columnsOf }).errors.length, 1);
  assert.ok(run(chain(src(), node('transpose', { header: false }))).script.endsWith('transpose'));
});

test('errors: keep the rows the parser can read, or replace them with a fallback', () => {
  const rm = buildOp('removeErrors', { column: 'Monto', columns: [], params: {} })!;
  const g = chain(src(), node(rm.type, rm.data));
  const r = run(g);
  assert.ok(r.script.includes('where not iserror(number(Monto))'));
  assert.deepEqual(cellsOf(r.out, 'Cliente'), ['Ana', 'Ana', 'Cira', 'Dani']);
  const dates = buildOp('removeErrors', { column: 'Fecha', columns: [], params: { parser: 'date' } })!;
  const d = run(chain(src(), node(dates.type, dates.data)));
  assert.ok(d.script.includes('not iserror(date(Fecha, "yyyy-MM-dd"))'));
  assert.equal(d.out.rows.length, 4);
  const rep = buildOp('replaceErrors', { column: 'Monto', columns: [], params: { fallback: '0' } })!;
  const e = run(chain(src(), node(rep.type, rep.data)));
  assert.ok(e.script.includes('try(number(Monto), 0) as "Monto"'));
  assert.equal(cellsOf(e.out, 'Monto')[1], '0');
  assert.equal(notErrorCondition('A b', 'number'), 'not iserror(number([A b]))');
});

test('Power Query operations of the ribbon compile', () => {
  const ctx = { columns: ['Cliente', 'Monto', 'Estado', 'Fecha'], params: {} as Record<string, string> };
  const one = (id: string, extra: Partial<typeof ctx> & { column?: string; selected?: string[] } = {}) => {
    const spec = buildOp(id, { ...ctx, ...extra })!;
    assert.ok(spec, id);
    return run(chain(src(), node(spec.type, spec.data)));
  };
  assert.deepEqual(cellsOf(one('year', { column: 'Fecha' }).out, 'Fecha')[0], '2026');
  assert.ok(one('dayOfWeek', { column: 'Fecha' }).script.includes('weekday(Fecha)'));
  assert.ok(one('age', { column: 'Fecha' }).script.includes('age(Fecha)'));
  assert.equal(one('reverseRows').out.rows[0].cells[0], 'Dani');
  assert.equal(one('countRows').out.rows[0].cells[0], '5');
  assert.ok(one('removeColumn', { column: 'Monto', selected: ['Monto', 'Fecha'] }).script.endsWith('select Cliente, Estado'));
  assert.ok(one('removeOtherColumns', { column: 'Monto', selected: ['Monto', 'Fecha'] }).script.endsWith('select Monto, Fecha'));
  assert.ok(one('groupBy', { column: 'Cliente', selected: ['Cliente', 'Estado'] }).script.endsWith('group by Cliente, Estado count'));
  assert.ok(one('removeEmpty', { column: 'Monto', selected: ['Monto', 'Estado'] }).script.includes('Monto is not empty and Estado is not empty'));
  assert.ok(one('transpose', { params: { header: 'yes' } }).script.endsWith('transpose header'));
  assert.ok(one('removeBottom', { params: { n: '2' } }).script.endsWith('droplast 2'));
  const asNew = buildOp('upper', { ...ctx, column: 'Cliente', params: { _new: '1' } })!;
  assert.ok(run(chain(src(), node(asNew.type, asNew.data))).script.includes('as "Cliente - upper"'));
  assert.ok(buildOp('pivot', { ...ctx, column: 'Estado' }));
  assert.ok(buildOp('unpivotOther', { ...ctx, column: 'Cliente' }));
  assert.equal(buildOp('unpivotOther', { ...ctx }), null);
  for (const id of ['removeAlternate', 'useFirstRowAsHeaders', 'convertToList', 'columnFromExamples']) assert.ok((UNSUPPORTED_OPS as readonly string[]).includes(id));
  for (const id of ['fillDown', 'fillUp', 'pivot', 'transpose', 'indexColumn', 'keepBottom', 'removeBottom', 'removeErrors']) assert.ok(OPS.some((o) => o.id === id), id);
});

test('step and query menus: delete until end, duplicate, extract previous', () => {
  const s = src();
  const f = node('filter', { conditions: [newCondition({ field: 'Estado', op: '=', value: 'Pagado' })] });
  const lim = node('limit', { limit: 2 });
  const out = node('output', {});
  const g = chain(s, f, lim, out);
  const cut = deleteUntilEnd(g, f.id);
  assert.deepEqual(cut.nodes.map((n) => n.type), ['source', 'output']);
  assert.equal(cut.edges.length, 0);

  const dup = duplicateQuery({ ...g, queries: [{ id: 'q1', name: 'Ventas' }] }, 'q1');
  assert.equal(dup.graph.queries!.length, 2);
  assert.equal(dup.graph.queries![1].name, 'Ventas (2)');
  assert.equal(dup.graph.nodes.length, 8);
  assert.ok(dup.graph.nodes.filter((n) => n.query === dup.id).every((n) => !g.nodes.some((o) => o.id === n.id)));
  assert.deepEqual(compileFlow(dup.graph, { columnsOf }).errors.map((e) => e.message), []);

  const ex = extractPrevious({ ...g, queries: [{ id: 'q1', name: 'Q' }] }, lim.id, 'Base')!;
  assert.equal(ex.graph.queries!.length, 2);
  const moved = ex.graph.nodes.filter((n) => n.query === ex.id).map((n) => n.type);
  assert.deepEqual(moved, ['source', 'filter']);
  const main = chainAround(ex.graph, lim.id).map((n) => n.type);
  assert.deepEqual(main, ['source', 'limit', 'output']);
  assert.equal(extractPrevious(g, s.id), null);
  const c = compileFlow({ ...ex.graph, nodes: ex.graph.nodes.map((n) => (n.query ? n : { ...n, query: 'q1' })) }, { columnsOf });
  assert.deepEqual(c.errors, []);
  assert.doesNotThrow(() => parseKqlScript(c.script));
});

test('layout state: clamping, dragging, persistence', () => {
  assert.equal(clampSize('leftWidth', 10), PANE_LIMITS.leftWidth.min);
  assert.equal(clampSize('leftWidth', 5000), PANE_LIMITS.leftWidth.max);
  assert.equal(clampSize('leftWidth', 5000, 250), 250);
  assert.equal(clampSize('leftWidth', 5000, 20), PANE_LIMITS.leftWidth.min);
  assert.equal(clampSize('rightWidth', Number.NaN), PANE_LIMITS.rightWidth.def);
  assert.equal(resizeFromDrag('leftWidth', 200, 40, 1), 240);
  assert.equal(resizeFromDrag('rightWidth', 300, 40, -1), 260);
  assert.equal(resizeFromDrag('diagramHeight', 260, -1000, 1), PANE_LIMITS.diagramHeight.min);
  assert.deepEqual(parseUiState(null), DEFAULT_UI_STATE);
  assert.deepEqual(parseUiState('{not json'), DEFAULT_UI_STATE);
  assert.deepEqual(parseUiState('[]'), DEFAULT_UI_STATE);
  const custom = { ...DEFAULT_UI_STATE, leftCollapsed: true, wholeProfile: true, sizes: { ...DEFAULT_UI_STATE.sizes, rightWidth: 400 } };
  assert.deepEqual(parseUiState(serializeUiState(custom)), custom);
  const repaired = parseUiState(JSON.stringify({ sizes: { leftWidth: 99999, rightWidth: 'x' }, leftCollapsed: 'yes', showQuality: false }));
  assert.equal(repaired.sizes.leftWidth, PANE_LIMITS.leftWidth.max);
  assert.equal(repaired.sizes.rightWidth, DEFAULT_UI_STATE.sizes.rightWidth);
  assert.equal(repaired.leftCollapsed, false);
  assert.equal(repaired.showQuality, false);
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  saveUiState(storage, custom);
  assert.ok(mem.has(UI_STORAGE_KEY));
  assert.deepEqual(loadUiState(storage), custom);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => saveUiState(broken, custom));
  assert.deepEqual(loadUiState(broken), DEFAULT_UI_STATE);
  assert.deepEqual(loadUiState(null), DEFAULT_UI_STATE);
  assert.equal(pickMountMode(true), 'slot');
  assert.equal(pickMountMode(false), 'fixed');
  assert.equal(clockText(new Date(2026, 0, 2, 9, 5)), '09:05');
});
