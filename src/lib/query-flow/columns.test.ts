import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildColumnMenu, entryBlock, fold, hasDuplicates, menuCommands, menuLabelIds, searchMenu, type MenuEntry,
} from './column-menu-config.ts';
import { compileFlow, declarationLines, inlineTableText } from './compile.ts';
import { makeNode, newTransformColumn, uid } from './defaults.ts';
import { COLUMN_TYPES, buildOp, detectTypeStep, opById, reorderColumns, typeSpec } from './ops.ts';
import { RIBBON, TAB_IDS, parseCommand } from './ribbon-config.ts';
import { COLLAPSED_WIDTH, fitGroups, groupFullWidth, pageScroll, scrollState, wheelToSideways } from './ribbon-fit.ts';
import { functionHints, signatureOf, validateExpression } from './expression.ts';
import { parseKqlScript, runKql } from '../query/kql.ts';
import { tablesFromBricks } from '../query/tables.ts';
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from './types.ts';

const node = (type: NodeType, data: Record<string, unknown> = {}, extra: Partial<FlowNode> = {}) => makeNode(type, { x: 0, y: 0 }, data, extra);
const chain = (...nodes: FlowNode[]): FlowGraph => ({ nodes, edges: nodes.slice(1).map((n, i): FlowEdge => ({ id: uid('e'), source: nodes[i].id, target: n.id, targetHandle: 'in' })) });
const tables = tablesFromBricks([{ id: 'v', kind: 'table', content: { title: 'Ventas', rows: [['Cliente', 'Monto', 'Fecha'], ['Ana', '10', '2026-01-03'], ['Beto', '20.5', '2026-02-10'], ['Cira', '7', '2026-03-15']] } }]);
const columnsOf = (s: { kind: string; name: string }) => (s.kind === 'rows' ? tables.find((t) => t.title === s.name)?.columns ?? null : null);
const src = () => node('source', { kind: 'rows', name: 'Ventas' });
const run = (g: FlowGraph) => {
  const r = compileFlow(g, { columnsOf });
  assert.deepEqual(r.errors, []);
  assert.doesNotThrow(() => parseKqlScript(r.script), r.script);
  return { script: r.script, out: runKql(r.script, { tables })[0].result };
};
const cellsOf = (out: ReturnType<typeof run>['out'], label: string) => { const i = out.columns.findIndex((c) => c.label === label); return out.rows.map((r) => r.cells[i]); };

// ── column menu ──────────────────────────────────────────────────────────────
test('the column menu per type has no duplicates and every command is a known one', () => {
  for (const type of ['text', 'number', 'date', 'boolean', 'empty'] as const) {
    const menu = buildColumnMenu({ type });
    assert.equal(hasDuplicates(menu), false, type);
    for (const command of menuCommands(menu)) {
      const { kind, id } = parseCommand(command);
      if (kind === 'op' || kind === 'dlg') assert.ok(opById(id), `${type}: ${command}`);
      else if (kind === 'new') assert.ok(opById(id) || ['customColumn', 'conditional'].includes(id), command);
      else if (kind === 'x') assert.ok(['chooseColumns', 'groupBy'].includes(id), command);
      else if (kind === 'col') assert.ok(['rename', 'copyName', 'clearSort', 'detectType'].includes(id), command);
      else if (kind === 'view') assert.ok(['profile', 'distribution'].includes(id), command);
      else assert.fail(command);
    }
  }
});

test('the menu offers the transform submenu of the column type', () => {
  const ids = (type: Parameters<typeof buildColumnMenu>[0]['type']) => menuLabelIds(buildColumnMenu({ type }));
  assert.ok(ids('text').includes('lower') && ids('text').includes('splitDelimiter') && ids('text').includes('textBefore'));
  assert.ok(!ids('text').includes('statSum'));
  assert.ok(ids('number').includes('statSum') && ids('number').includes('numAdd') && ids('number').includes('round'));
  assert.ok(!ids('number').includes('splitDelimiter'));
  assert.ok(ids('date').includes('monthName') && ids('date').includes('daysUntil') && ids('date').includes('fBetween') && ids('date').includes('fPreviousDays'));
  assert.ok(ids('boolean').includes('notBool'));
  assert.ok(ids('number').includes('removeErrors') && !ids('text').includes('removeErrors'));
  for (const id of ['sortAsc', 'sortDesc', 'clearSort', 'values', 'changeType', 'renameColumn', 'duplicateColumn', 'removeColumns', 'removeOtherColumns', 'removeDuplicates', 'removeBlank', 'replaceValues', 'fill', 'move', 'chooseColumns', 'copyName', 'mergeColumns', 'addFromThis', 'groupBy', 'unpivotColumns', 'pivotColumn', 'showProfile', 'showDistribution']) assert.ok(ids('text').includes(id), id);
});

test('engine-only entries are disabled; merge needs several columns; clear sort needs a sort', () => {
  const menu = buildColumnMenu({ type: 'text' });
  const find = (id: string): MenuEntry => { const walk = (list: MenuEntry[]): MenuEntry | undefined => { for (const e of list) { if (e.id === id) return e; const c = e.children && walk(e.children); if (c) return c; } return undefined; }; return walk(menu)!; };
  assert.equal(entryBlock(find('typeList'), { selectedCount: 1, sorted: false }), 'engine');
  assert.equal(entryBlock(find('typeBool'), { selectedCount: 1, sorted: false }), null);
  assert.equal(entryBlock(find('hideColumn'), { selectedCount: 1, sorted: false }), 'engine');
  assert.equal(entryBlock(find('mergeColumns'), { selectedCount: 1, sorted: false }), 'multi');
  assert.equal(entryBlock(find('mergeColumns'), { selectedCount: 2, sorted: false }), null);
  assert.equal(entryBlock(find('clearSort'), { selectedCount: 1, sorted: false }), 'nosort');
  assert.equal(entryBlock(find('clearSort'), { selectedCount: 1, sorted: true }), null);
  assert.equal(entryBlock(find('sortAsc'), { selectedCount: 1, sorted: false }), null);
});

test('searching the menu matches labels, parents and keywords, ignoring case and accents', () => {
  const menu = buildColumnMenu({ type: 'number' });
  const labels: Record<string, string> = { statSum: 'Suma', statistics: 'Estadísticas', transform: 'Transformar', numberFilters: 'Filtros de número', fGreaterThan: 'Mayor que', sortAsc: 'Ordenar ascendente' };
  const labelOf = (id: string) => labels[id] ?? id;
  const sum = searchMenu(menu, 'estadistica', labelOf);
  assert.ok(sum.some((m) => m.entry.id === 'statSum'), 'found through its parent label');
  assert.deepEqual(sum.find((m) => m.entry.id === 'statSum')!.path, ['Transformar', 'Estadísticas']);
  assert.ok(searchMenu(menu, 'MAYOR', labelOf).some((m) => m.entry.id === 'fGreaterThan'));
  assert.ok(searchMenu(menu, 'filter', labelOf).length > 3, 'keyword of the filters submenu');
  assert.deepEqual(searchMenu(menu, '   ', labelOf), []);
  assert.deepEqual(searchMenu(menu, 'zzzzzz', labelOf), []);
  assert.equal(fold('Ñandú'), 'nandu');
  assert.ok(!searchMenu(menu, 'values', (id) => id).some((m) => m.entry.values), 'the value list is not an action');
});

test('filter commands carry URL-encoded operators that parse back', () => {
  const menu = buildColumnMenu({ type: 'number' });
  const cmds = menuCommands(menu).filter((c) => c.startsWith('dlg:filterCompare'));
  const ops = cmds.map((c) => parseCommand(c).params.op).sort();
  assert.deepEqual(ops, ['!=', '<', '<=', '=', '>', '>=']);
  assert.equal(parseCommand('dlg:split?piece=-1').params.piece, '-1');
});

// ── ribbon ───────────────────────────────────────────────────────────────────
test('the ribbon keeps the Power Query tabs, groups stay short and no id repeats inside a menu', () => {
  assert.deepEqual(TAB_IDS, ['home', 'transform', 'addColumn', 'view', 'sources']);
  for (const tab of TAB_IDS) {
    for (const group of RIBBON[tab]) {
      assert.ok(group.items.length <= 9, `${tab}/${group.id}`);
      assert.ok(Number.isInteger(group.collapse));
      for (const item of group.items) {
        const ids = (item.menu ?? []).filter((m): m is { id: string; command: string } => 'id' in m).map((m) => `${m.id}|${m.command}`);
        assert.equal(new Set(ids).size, ids.length, `${tab}/${item.id}`);
      }
    }
  }
  const items = (tab: (typeof TAB_IDS)[number]) => RIBBON[tab].reduce((n, g) => n + g.items.length, 0);
  assert.ok(items('home') <= 18 && items('transform') <= 14);
  // column-only groups left the ribbon for the column menu
  const all = JSON.stringify(RIBBON);
  for (const gone of ['gTextColumn', 'gNumberColumn', 'gDateColumn']) assert.ok(!all.includes(gone), gone);
});

test('every operation is reachable from the ribbon or from a column menu', () => {
  const ribbon = new Set<string>();
  for (const groups of Object.values(RIBBON)) for (const g of groups) for (const item of g.items) {
    if (item.command) ribbon.add(item.command);
    for (const m of item.menu ?? []) if ('command' in m) ribbon.add(m.command);
  }
  const reachable = new Set<string>();
  for (const c of [...ribbon, ...['text', 'number', 'date', 'boolean', 'any'].flatMap((t) => menuCommands(buildColumnMenu({ type: t as never })))]) {
    const { kind, id } = parseCommand(c);
    if (kind === 'op' || kind === 'dlg' || kind === 'new') reachable.add(id);
    if (kind === 'x' && id === 'groupBy') reachable.add('groupBy');
  }
  // typed by the schema view / header: moveTo, keepColumns (Choose Columns), renameColumn (inline)
  const viaOtherUi = new Set(['moveTo', 'keepColumns', 'renameColumn', 'filterValues', 'merge']);
  const missing = ['trim', 'clean', 'lower', 'upper', 'proper', 'capitalize', 'replace', 'split', 'left', 'right', 'substr', 'extract', 'round', 'abs', 'ceil', 'floor', 'year', 'month', 'day', 'dayOfWeek', 'age', 'keepTop', 'keepBottom', 'keepRange', 'removeTop', 'removeBottom', 'removeDuplicates', 'removeEmpty', 'removeErrors', 'replaceErrors', 'filterCompare', 'filterBetween', 'filterWindow', 'filterEmpty', 'sortAsc', 'sortDesc', 'removeColumn', 'removeOtherColumns', 'duplicateColumn', 'moveLeft', 'moveRight', 'moveStart', 'moveEnd', 'groupBy', 'fillDown', 'fillUp', 'pivot', 'unpivotSelected', 'unpivotOther', 'transpose', 'reverseRows', 'countRows', 'customColumn', 'indexColumn', 'runningSum', 'lag', 'lead', 'changeType', 'length', 'numAdd', 'numSub', 'numMul', 'numDiv', 'numMod', 'numPercent', 'stat', 'monthName', 'quarter', 'week', 'dayName', 'daysUntil', 'listJoin', 'listCount', 'listFirst']
    .filter((id) => !reachable.has(id) && !viaOtherUi.has(id));
  assert.deepEqual(missing, []);
});

test('ribbon fit: groups collapse by priority until the width is enough', () => {
  const groups = [
    { id: 'a', items: 3, collapse: 0 }, { id: 'b', items: 4, collapse: 2 }, { id: 'c', items: 2, collapse: 5 }, { id: 'd', items: 1, collapse: 9 },
  ];
  const total = groups.reduce((n, g) => n + groupFullWidth(g.items), 0);
  assert.deepEqual(fitGroups(groups, total).collapsed, []);
  assert.deepEqual(fitGroups(groups, total - 1).collapsed, ['c'], 'the highest priority number with more than one button goes first');
  const tight = fitGroups(groups, total - (groupFullWidth(2) - COLLAPSED_WIDTH) - 1);
  assert.deepEqual(tight.collapsed, ['c', 'b']);
  const nothing = fitGroups(groups, 10);
  assert.equal(nothing.overflow, true);
  assert.ok(!nothing.collapsed.includes('d'), 'a single button gains nothing from collapsing');
  assert.deepEqual(nothing.collapsed.sort(), ['a', 'b', 'c']);
  assert.deepEqual(fitGroups([], 100), { collapsed: [], overflow: false, total: 0 });
  assert.deepEqual(fitGroups(groups, total - 1, { c: 500 }).collapsed, ['c'], 'measured widths win over estimates');
  // ties collapse the group on the right first
  const tie = fitGroups([{ id: 'x', items: 3, collapse: 1 }, { id: 'y', items: 3, collapse: 1 }], groupFullWidth(3) + COLLAPSED_WIDTH + 1);
  assert.deepEqual(tie.collapsed, ['y']);
});

test('ribbon scroll maths', () => {
  assert.deepEqual(scrollState(0, 500, 500), { canLeft: false, canRight: false });
  assert.deepEqual(scrollState(0, 500, 900), { canLeft: false, canRight: true });
  assert.deepEqual(scrollState(100, 500, 900), { canLeft: true, canRight: true });
  assert.deepEqual(scrollState(400, 500, 900), { canLeft: true, canRight: false });
  assert.equal(wheelToSideways(0, 40), 40);
  assert.equal(wheelToSideways(-30, 5), -30);
  assert.equal(wheelToSideways(0, 0), 0);
  assert.equal(pageScroll(0, 500, 900, 1), 350);
  assert.equal(pageScroll(350, 500, 900, 1), 400);
  assert.equal(pageScroll(100, 500, 900, -1), 0);
  assert.equal(pageScroll(0, 500, 300, 1), 0);
});

// ── columns ──────────────────────────────────────────────────────────────────
test('change type compiles through the engine; booleans and lists wait for the engine', () => {
  const spec = buildOp('changeType', { column: 'Monto', selected: ['Monto', 'Cliente'], columns: [], params: { type: 'text' } })!;
  assert.equal(spec.type, 'transform');
  assert.equal((spec.data.columns as unknown[]).length, 2);
  const whole = run(chain(src(), node(spec.type, buildOp('changeType', { column: 'Monto', columns: [], params: { type: 'whole' } })!.data)));
  assert.deepEqual(cellsOf(whole.out, 'Monto'), ['10', '21', '7']);
  const dec = run(chain(src(), node('transform', buildOp('changeType', { column: 'Monto', columns: [], params: { type: 'decimal' } })!.data)));
  assert.ok(dec.script.includes('number(Monto) as "Monto"'));
  assert.ok(whole.script.includes('int(Monto) as "Monto"'));
  assert.ok(run(chain(src(), node('transform', buildOp('changeType', { column: 'Fecha', columns: [], params: { type: 'datetime' } })!.data))).script.includes('datetime(Fecha)'));
  assert.ok(run(chain(src(), node('transform', buildOp('changeType', { column: 'Fecha', columns: [], params: { type: 'date' } })!.data))).script.includes('todate(Fecha)'));
  assert.ok(run(chain(src(), node('transform', buildOp('changeType', { column: 'Monto', columns: [], params: { type: 'text' } })!.data))).script.includes('text(Monto)'));
  assert.ok(run(chain(src(), node('transform', buildOp('changeType', { column: 'Monto', columns: [], params: { type: 'bool' } })!.data))).script.includes('bool(Monto)'));
  assert.equal(buildOp('changeType', { column: 'Monto', columns: [], params: { type: 'list' } }), null);
  assert.equal(typeSpec('any'), null);
  assert.deepEqual([...COLUMN_TYPES], ['any', 'text', 'whole', 'decimal', 'date', 'datetime', 'bool', 'list']);
});

test('detect data type converts the columns that read as numbers or dates', () => {
  const columns = ['Cliente', 'Monto', 'Fecha', 'Nota'];
  const rows = [['Ana', '10', '2026-01-03', 'x'], ['Beto', '20.5', '2026-02-10', 'y'], ['Cira', '7', '2026-03-15', '']];
  const spec = detectTypeStep(columns, rows)!;
  const converted = (spec.data.columns as Array<{ column: string; fn: string }>).map((c) => `${c.column}:${c.fn}`);
  assert.deepEqual(converted, ['Monto:number', 'Fecha:to_date']);
  assert.deepEqual((detectTypeStep(columns, rows, ['Cliente'])), null);
  assert.equal((detectTypeStep(columns, rows, ['Monto'])!.data.columns as unknown[]).length, 1);
  assert.equal(detectTypeStep(columns, [], []), null);
  assert.deepEqual(reorderColumns(['a', 'b', 'c'], 'c', 'start'), ['c', 'a', 'b']);
  assert.deepEqual(reorderColumns(['a', 'b', 'c'], 'a', 'end'), ['b', 'c', 'a']);
  assert.deepEqual(reorderColumns(['a', 'b', 'c'], 'b', 'left'), ['b', 'a', 'c']);
  assert.deepEqual(reorderColumns(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
  assert.equal(reorderColumns(['a', 'b'], 'a', 'left'), null);
  assert.equal(reorderColumns(['a', 'b'], 'zz', 'end'), null);
  const moved = buildOp('moveTo', { column: 'Fecha', columns: ['Cliente', 'Monto', 'Fecha'], params: { index: '0' } })!;
  assert.deepEqual((moved.data.columns as Array<{ column: string }>).map((c) => c.column), ['Fecha', 'Cliente', 'Monto']);
});

test('the transform submenus compile and run', () => {
  const t = (id: string, params: Record<string, string> = {}, column = 'Monto') => run(chain(src(), node('transform', buildOp(id, { column, columns: [], params })!.data)));
  assert.deepEqual(cellsOf(t('numAdd', { value: '5' }).out, 'Monto'), ['15', '25.5', '12']);
  assert.deepEqual(cellsOf(t('numMul', { value: '2' }).out, 'Monto'), ['20', '41', '14']);
  assert.equal(cellsOf(t('length', {}, 'Cliente').out, 'Cliente')[1], '4');
  assert.equal(cellsOf(t('monthName', {}, 'Fecha').out, 'Fecha').length, 3);
  assert.ok(t('quarter', {}, 'Fecha').script.includes('quarter(Fecha)'));
  assert.ok(t('week', {}, 'Fecha').script.includes('isoweek(Fecha)'));
  assert.ok(t('dayName', {}, 'Fecha').script.includes('"EEEE"'));
  assert.ok(t('daysUntil', {}, 'Fecha').script.includes('days(Fecha)'));
  assert.ok(t('listJoin', { separator: '; ' }, 'Cliente').script.includes('join(Cliente, "; ")'));
  assert.ok(t('listCount', {}, 'Cliente').script.includes('count(Cliente)'));
  assert.ok(t('listFirst', {}, 'Cliente').script.includes('first(Cliente)'));
  const stat = run(chain(src(), node('group', buildOp('stat', { column: 'Monto', columns: [], params: { fn: 'avg' } })!.data)));
  assert.equal(stat.script, 'show rows of "Ventas" avg(Monto)');
  assert.equal(compileFlow(chain(src(), node('transform', { columns: [newTransformColumn('fn', { column: 'Monto', fn: 'n_add', a: '' })] })), { columnsOf }).errors.length, 1);
});

test('filters by range, window and emptiness', () => {
  const f = (id: string, params: Record<string, string>, column = 'Monto') => run(chain(src(), node('filter', buildOp(id, { column, columns: [], params })!.data)));
  assert.equal(f('filterBetween', { from: '8', to: '15' }).out.rows.length, 1);
  assert.ok(f('filterWindow', { dir: 'next', n: '30', unit: 'd' }, 'Fecha').script.includes('Fecha in next 30d'));
  assert.ok(f('filterWindow', { dir: 'last', n: '2', unit: 'w' }, 'Fecha').script.includes('Fecha in last 2w'));
  assert.ok(f('filterEmpty', {}).script.includes('Monto is empty'));
});

// ── Enter data, declarations, load, expression ───────────────────────────────
test('Enter data compiles to an inline table with typed values and its known columns', () => {
  const table = { columns: ['Cliente', 'Monto'], rows: [['ACME', '120'], ['Say "x"', '3.5'], ['Zeta', '']] };
  assert.equal(inlineTableText(table), 'values ("Cliente", "Monto") ("ACME", 120) ("Say \\"x\\"", 3.5) ("Zeta", null)');
  const r = compileFlow(chain(node('source', { kind: 'inline', name: '', table }), node('filter', { conditions: [{ id: 'c', field: 'Monto', op: '>', value: '5', value2: '', vtype: 'auto', values: [] }], advanced: '' })));
  assert.deepEqual(r.errors, []);
  assert.ok(r.script.startsWith('show from values ("Cliente", "Monto")'));
  assert.deepEqual(compileFlow(chain(node('source', { kind: 'inline', name: '', table }))).columns, ['Cliente', 'Monto']);
  assert.throws(() => inlineTableText({ columns: [], rows: [] }));
  assert.throws(() => inlineTableText({ columns: ['a', 'A'], rows: [['1', '2']] }));
  assert.throws(() => inlineTableText({ columns: ['a'], rows: [] }));
  assert.equal(compileFlow(chain(node('source', { kind: 'inline', name: '', table: { columns: ['a'], rows: [] } }))).errors.length, 1);
  // used in a join / union it moves into a let
  const join = node('join', { rightSource: { kind: 'inline', name: '', table }, leftKey: 'Cliente', rightKey: 'Cliente', alias: 'x', kind: 'inner' });
  const j = compileFlow(chain(src(), join), { columnsOf });
  assert.deepEqual(j.errors, []);
});

test('parameters and functions are written first, only when the engine accepts them', () => {
  const graph: FlowGraph = {
    ...chain(src()),
    params: [{ id: 'p1', name: 'minimo', type: 'number', value: '100', description: '' }, { id: 'p2', name: 'pais', type: 'text', value: 'AR "x"', description: '' }, { id: 'p3', name: 'activo', type: 'bool', value: 'TRUE', description: '' }, { id: 'p4', name: 'desde', type: 'date', value: '2026-01-01', description: '' }],
    functions: [{ id: 'f1', name: 'conigv', args: ['x'], body: 'x * 1.18', description: '' }],
  };
  assert.equal(compileFlow(graph, { columnsOf }).script.includes('param'), false, 'left out until the engine has them');
  const on = compileFlow(graph, { columnsOf, declarations: true });
  assert.deepEqual(on.errors, []);
  assert.deepEqual(on.script.split('\n').slice(0, 5), ['param minimo = 100', 'param pais = "AR \\"x\\""', 'param activo = true', 'param desde = 2026-01-01', 'fn conigv(x) = x * 1.18']);
  assert.ok(on.script.split('\n')[5].startsWith('show rows of'));
  const errors: Array<{ nodeId: string; message: string }> = [];
  const lines = declarationLines({ nodes: [], edges: [], params: [{ id: 'a', name: '1bad', type: 'text', value: '', description: '' }, { id: 'b', name: 'n', type: 'number', value: 'abc', description: '' }, { id: 'c', name: 'n', type: 'text', value: 'x', description: '' }], functions: [{ id: 'd', name: 'f', args: ['x y'], body: 'x', description: '' }, { id: 'e', name: 'g', args: [], body: '  ', description: '' }] }, errors);
  assert.deepEqual(lines, ['param n = "x"']);
  assert.equal(errors.length, 4);
  assert.ok(errors.every((e) => /^(param|fn):/.test(e.nodeId)));
});

test('a query with Enable load off feeds others but is not written as an output', () => {
  const a = node('source', { kind: 'cards' }, { query: 'q1' });
  const b = node('source', { kind: 'members' }, { query: 'q2' });
  const g: FlowGraph = { nodes: [a, b], edges: [], queries: [{ id: 'q1', name: 'Cards' }, { id: 'q2', name: 'Members', load: false }] };
  assert.equal(compileFlow(g).script, 'show cards');
  const ref = node('source', { kind: 'query', name: 'q2' }, { query: 'q1' });
  const g2: FlowGraph = { nodes: [a, b, ref], edges: [], queries: g.queries };
  const r = compileFlow(g2);
  assert.ok(!r.script.includes('show members'));
  assert.equal(compileFlow({ ...g, queries: [{ id: 'q1', name: 'Cards' }, { id: 'q2', name: 'Members' }] }).script, 'show cards\nshow members');
});

test('the custom column editor: function hints and the syntax status line', () => {
  assert.equal(signatureOf('today', 0, 0), 'today()');
  assert.equal(signatureOf('lower', 1, 1), 'lower(a)');
  assert.equal(signatureOf('substr', 2, 3), 'substr(a, b, [c])');
  assert.equal(signatureOf('concat', 1, 20), 'concat(a, ...)');
  const hints = functionHints([{ id: 'f', name: 'conigv', args: ['x'], body: 'x', description: '' }]);
  assert.equal(hints[0].signature, 'conigv(x)');
  assert.ok(hints[0].user);
  assert.ok(hints.some((h) => h.name === 'addDays' && h.signature === 'addDays(a, b)'));
  assert.ok(hints.filter((h) => !h.user).every((h, i, all) => i === 0 || all[i - 1].name.localeCompare(h.name) <= 0));
  assert.deepEqual(validateExpression(''), { ok: false, message: '' });
  assert.equal(validateExpression('mul(points, 2)').ok, true);
  assert.equal(validateExpression('date(created, "dd MMM")').ok, true);
  const bad = validateExpression('lowr(title)');
  assert.equal(bad.ok, false);
  assert.ok(bad.message.length > 0);
  assert.equal(validateExpression('mul(points,').ok, false);
});
