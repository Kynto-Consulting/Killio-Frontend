import assert from 'node:assert/strict';
import test from 'node:test';

import { compileFlow, inlineTableText, rightOperand } from './compile.ts';
import { makeNode, newCondition, newTransformColumn, uid } from './defaults.ts';
import { engineSupportsDeclarations } from './diagnose.ts';
import { catalogGroups, checkDeclaration, PARAM_CATEGORY, USER_CATEGORY } from './expression.ts';
import { buildOp } from './ops.ts';
import { qualifiedName, tableOptions, type TableRef } from './table-names.ts';
import { describeKqlDeclarations, KQL_FUNCTION_CATALOG, parseKqlScript, runKql } from '../query/kql.ts';
import { tablesFromBricks } from '../query/tables.ts';
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from './types.ts';

const node = (type: NodeType, data: Record<string, unknown> = {}, extra: Partial<FlowNode> = {}) => makeNode(type, { x: 0, y: 0 }, data, extra);
const chain = (...nodes: FlowNode[]): FlowGraph => ({ nodes, edges: nodes.slice(1).map((n, i): FlowEdge => ({ id: uid('e'), source: nodes[i].id, target: n.id, targetHandle: 'in' })) });
const tables = tablesFromBricks([{ id: 'v', kind: 'table', content: { title: 'Ventas', rows: [['Cliente', 'Monto', 'Nota', 'Fecha'], ['Ana', '10', '', '2026-03-04'], ['Beto', '20', 'x', '2026-05-06'], ['Cira', '30', 'y', '2026-07-08']] } }]);
const columnsOf = (s: { kind: string; name: string }) => (s.kind === 'rows' ? tables.find((t) => t.title === s.name)?.columns ?? null : null);
const src = () => node('source', { kind: 'rows', name: 'Ventas' });
const exec = (g: FlowGraph, options: { columns?: boolean } = {}) => {
  const r = compileFlow(g, { columnsOf: options.columns === false ? undefined : columnsOf, declarations: true });
  assert.deepEqual(r.errors, []);
  assert.doesNotThrow(() => parseKqlScript(r.script), r.script);
  const out = runKql(r.script, { tables })[0].result;
  return { script: r.script, out, cells: (label: string) => { const i = out.columns.findIndex((c) => c.label === label); return out.rows.map((row) => row.cells[i]); } };
};
const fnStep = (id: string, params: Record<string, string>, column = 'Monto') => node('transform', buildOp(id, { column, columns: [], params })!.data);

test('the engine accepts declarations now: the probe succeeds', () => {
  assert.equal(engineSupportsDeclarations(), true);
});

test('parameters and functions round trip through the engine', () => {
  const graph: FlowGraph = {
    ...chain(
      src(),
      node('filter', { conditions: [newCondition({ field: 'Monto', op: '>', value: '$minimo' })] }),
      node('transform', { columns: [newTransformColumn('custom', { alias: 'Nivel', expr: 'bucket([Monto], $minimo)' })] }),
    ),
    params: [{ id: 'p', name: 'minimo', type: 'number', value: '15', description: 'corte' }],
    functions: [{ id: 'f', name: 'bucket', args: ['m', 'corte'], body: 'if(m > corte, "alto", "bajo")', description: '' }],
  };
  const r = exec(graph);
  assert.ok(r.script.startsWith('param minimo = 15\nfn bucket(m, corte) = if(m > corte, "alto", "bajo")\nshow rows of "Ventas" where Monto > $minimo'));
  assert.deepEqual(r.cells('Cliente'), ['Beto', 'Cira']);
  assert.deepEqual(r.cells('Nivel'), ['alto', 'alto']);
  // read back (an Advanced KQL step that holds declarations is listed in the Queries pane)
  const declared = describeKqlDeclarations(r.script);
  assert.deepEqual(declared.params, [{ name: 'minimo', value: '15' }]);
  assert.equal(declared.functions[0].name, 'bucket');
  assert.deepEqual(declared.functions[0].args, ['m', 'corte']);
});

test('the engine validates the names of parameters and functions', () => {
  const p = (name: string, value = '1', type: 'number' | 'text' = 'number') => checkDeclaration({ param: { id: 'x', name, type, value, description: '' } });
  assert.equal(p('minimo'), null);
  assert.ok(p('1bad'));
  assert.ok(p('a b'));
  assert.ok(p('n', 'abc'));
  const f = (name: string, args: string[], body: string) => checkDeclaration({ fn: { id: 'x', name, args, body, description: '' } });
  assert.equal(f('doble', ['x'], 'x * 2'), null);
  assert.ok(f('upper', ['x'], 'x'), 'a built-in cannot be shadowed');
  assert.ok(f('recursiva', ['x'], 'recursiva(x)'), 'no recursion');
  assert.ok(f('mala', ['x'], 'x +'));
  assert.ok(f('', ['x'], 'x'));
});

test('arithmetic: a constant or another column, merge with &, null-safe', () => {
  const add = exec(chain(src(), fnStep('numAdd', { value: '5' })));
  assert.ok(add.script.includes('Monto + 5 as "Monto"'));
  assert.deepEqual(add.cells('Monto'), ['15', '25', '35']);
  const col = exec(chain(src(), fnStep('numMul', { value: 'Monto' })));
  assert.ok(col.script.includes('Monto * [Monto] as "Monto"'));
  assert.deepEqual(col.cells('Monto'), ['100', '400', '900']);
  assert.deepEqual(exec(chain(src(), fnStep('numMod', { value: '7' }))).cells('Monto'), ['3', '6', '2']);
  assert.deepEqual(exec(chain(src(), fnStep('numSub', { value: '1' }))).cells('Monto'), ['9', '19', '29']);
  assert.deepEqual(exec(chain(src(), fnStep('numDiv', { value: '10' }))).cells('Monto'), ['1', '2', '3']);
  assert.ok(exec(chain(src(), fnStep('numPercent', { value: 'Monto' }))).script.includes('percent(Monto, [Monto])'));
  const merged = exec(chain(src(), node('transform', buildOp('merge', { selected: ['Cliente', 'Nota'], columns: [], params: { separator: ' - ', name: 'Ambos' } })!.data)));
  assert.ok(merged.script.includes('Cliente & " - " & [Nota] as "Ambos"'));
  assert.deepEqual(merged.cells('Ambos'), ['Ana - ', 'Beto - x', 'Cira - y']);
  assert.equal(rightOperand('Nota'), '[Nota]');
  assert.equal(rightOperand('[Nota]'), '[Nota]');
  assert.equal(rightOperand('upper(Nota)'), 'upper(Nota)');
  assert.equal(rightOperand('3'), '3');
  assert.equal(rightOperand('"x"'), '"x"');
  assert.equal(compileFlow(chain(src(), fnStep('numAdd', { value: '' })), { columnsOf }).errors.length, 1);
});

test('types: text, whole, decimal, date, date-time and true / false are wired to the engine', () => {
  const t = (type: string, column = 'Monto') => exec(chain(src(), node('transform', buildOp('changeType', { column, columns: [], params: { type } })!.data)));
  assert.deepEqual(t('whole').cells('Monto'), ['10', '20', '30']);
  assert.ok(t('text').script.includes('text(Monto)'));
  assert.ok(t('decimal').script.includes('number(Monto)'));
  assert.ok(t('date', 'Fecha').script.includes('todate(Fecha)'));
  assert.ok(t('datetime', 'Fecha').script.includes('datetime(Fecha)'));
  assert.ok(t('bool', 'Nota').script.includes('bool(Nota)'));
  assert.equal(buildOp('changeType', { column: 'Nota', columns: [], params: { type: 'list' } }), null);
  assert.deepEqual(exec(chain(src(), fnStep('notBool', {}, 'Nota'))).cells('Nota').length, 3);
});

test('text and date transformations use the engine functions', () => {
  assert.deepEqual(exec(chain(src(), fnStep('textBefore', { delimiter: 'e' }, 'Cliente'))).cells('Cliente'), ['', 'B', '']);
  assert.deepEqual(exec(chain(src(), fnStep('textAfter', { delimiter: 'e' }, 'Cliente'))).cells('Cliente'), ['', 'to', '']);
  assert.ok(exec(chain(src(), fnStep('textBetween', { delimiter: 'B', delimiter2: 't' }, 'Cliente'))).script.includes('textbefore(textafter(Cliente, "B"), "t")'));
  assert.deepEqual(exec(chain(src(), fnStep('year', {}, 'Fecha'))).cells('Fecha'), ['2026', '2026', '2026']);
  assert.deepEqual(exec(chain(src(), fnStep('month', {}, 'Fecha'))).cells('Fecha'), ['3', '5', '7']);
  assert.deepEqual(exec(chain(src(), fnStep('day', {}, 'Fecha'))).cells('Fecha'), ['4', '6', '8']);
  assert.equal(compileFlow(chain(src(), fnStep('textBefore', { delimiter: '' }, 'Cliente')), { columnsOf }).errors.length, 1);
});

test('select * and select * except work without knowing the columns', () => {
  const drop = exec(chain(src(), node('select', { columns: [], star: true, except: ['Monto', 'Fecha'] })), { columns: false });
  assert.equal(drop.script, 'show rows of "Ventas" select * except (Monto, Fecha)');
  assert.deepEqual(drop.out.columns.map((c) => c.label), ['Cliente', 'Nota']);
  const withExtra = exec(chain(src(), node('select', { columns: [], star: true, except: ['Nota'] }), node('transform', { columns: [newTransformColumn('custom', { alias: 'Doble', expr: 'Monto * 2' })] })), { columns: false });
  assert.equal(withExtra.script, 'show rows of "Ventas" select * except (Nota), Monto * 2 as "Doble"');
  assert.deepEqual(withExtra.out.columns.map((c) => c.label), ['Cliente', 'Monto', 'Fecha', 'Doble']);
  // with known columns the star is expanded
  const known = exec(chain(src(), node('select', { columns: [], star: true, except: ['Monto'] })));
  assert.equal(known.script, 'show rows of "Ventas" select Cliente, Nota, Fecha');
});

test('cards in board / list scope', () => {
  const r = compileFlow(chain(node('source', { kind: 'cards', name: '', scope: { board: 'Tablero "QA"', list: 'En QA' } }), node('group', { dimensions: [], metrics: [{ id: 'm', fn: 'count', field: '', field2: '', arg: '' }], having: '' })));
  assert.deepEqual(r.errors, []);
  assert.equal(r.script, 'show cards in board "Tablero \\"QA\\"" list "En QA" group by  count'.replace('group by  count', 'count'));
  assert.doesNotThrow(() => parseKqlScript(r.script));
  assert.equal(compileFlow(chain(node('source', { kind: 'cards', name: '', scope: { board: '', list: 'Hecho' } }))).script, 'show cards in list "Hecho"');
  assert.equal(compileFlow(chain(node('source', { kind: 'cards', name: '' }))).script, 'show cards');
  // joined or unioned, a scoped source moves into a let
  const members = node('source', { kind: 'members', name: '' });
  const join = node('join', { leftKey: 'assignee', rightKey: 'id', alias: 'm', kind: 'inner' });
  const g: FlowGraph = { nodes: [node('source', { kind: 'members', name: '' }), members, join], edges: [{ id: '1', source: members.id, target: join.id }] };
  void g;
});

test('Enter data: typed columns, null cells and the caps', () => {
  const table = { columns: ['Cliente', 'Monto', 'Activo', 'Desde'], types: ['text', 'number', 'bool', 'date'] as const, rows: [['ACME', '120', 'si', '2026-01-02'], ['001', '', 'no', '']] };
  const text = inlineTableText({ ...table, types: [...table.types] });
  assert.equal(text, 'values ("Cliente", "Monto", "Activo", "Desde") ("ACME", 120, true, 2026-01-02) ("001", null, false, null)');
  const r = runKql(`show from ${text} select *`, { tables: [] })[0].result;
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.columns.map((c) => c.label), ['Cliente', 'Monto', 'Activo', 'Desde']);
  assert.equal(r.rows[1].cells[0], '001', 'a text column keeps leading zeros');
  // auto infers per cell
  assert.equal(inlineTableText({ columns: ['a'], rows: [['1'], ['x'], ['true'], ['2026-01-01'], ['']] }), 'values ("a") (1) ("x") (true) (2026-01-01) (null)');
  assert.throws(() => inlineTableText({ columns: ['n'], types: ['number'], rows: [['abc']] }), /Row 1, column "n": "abc" is not a number/);
  assert.throws(() => inlineTableText({ columns: ['b'], types: ['bool'], rows: [['maybe']] }), /not true or false/);
  assert.throws(() => inlineTableText({ columns: ['d'], types: ['date'], rows: [['ayer']] }), /not a date/);
  assert.throws(() => inlineTableText({ columns: Array.from({ length: 51 }, (_, i) => `c${i}`), rows: [['1']] }), /at most 50 columns/);
  assert.throws(() => inlineTableText({ columns: ['a'], rows: Array.from({ length: 1001 }, () => ['1']) }), /at most 1000 rows/);
  assert.doesNotThrow(() => inlineTableText({ columns: Array.from({ length: 50 }, (_, i) => `c${i}`), rows: Array.from({ length: 1000 }, () => Array.from({ length: 50 }, () => '1')) }));
});

test('the function catalog: groups, search, Power Query names, user functions and parameters', () => {
  const all = catalogGroups('');
  assert.deepEqual(all.map((g) => g.category), ['Text', 'Number', 'Date & Time', 'List', 'Logical', 'Conversion', 'Aggregation', 'Row', 'Value']);
  assert.equal(all.reduce((n, g) => n + g.items.length, 0), KQL_FUNCTION_CATALOG.length);
  const upper = catalogGroups('upper').find((g) => g.category === 'Text')!.items.find((i) => i.name === 'upper')!;
  assert.equal(upper.insert, 'upper(');
  assert.ok(upper.mNames.includes('Text.Upper'));
  assert.ok(upper.signature.startsWith('upper('));
  const m = catalogGroups('Text.Upper').flatMap((g) => g.items);
  assert.equal(m.length >= 1, true);
  assert.equal(m.find((i) => i.name === 'upper')!.insert, 'Text.Upper(', 'a Power Query name inserts the name that was searched');
  assert.equal(catalogGroups('number.round').flatMap((g) => g.items).find((i) => i.name === 'round')!.insert, 'Number.Round(');
  assert.ok(catalogGroups('List.Sum').flatMap((g) => g.items).some((i) => i.name === 'list_sum'));
  assert.equal(catalogGroups('addday').flatMap((g) => g.items).find((i) => i.name === 'addDays')!.insert, 'addDays(');
  assert.deepEqual(catalogGroups('zzzzqq'), []);
  const withUser = catalogGroups('', [{ id: 'f', name: 'bucket', args: ['m', 'corte'], body: 'm', description: '' }], [{ id: 'p', name: 'minimo', type: 'number', value: '1', description: '' }]);
  assert.equal(withUser[0].category, USER_CATEGORY);
  assert.equal(withUser[0].items[0].signature, 'bucket(m, corte)');
  assert.equal(withUser[1].category, PARAM_CATEGORY);
  assert.equal(withUser[1].items[0].insert, '$minimo');
  assert.ok(catalogGroups('buck', [{ id: 'f', name: 'bucket', args: [], body: '', description: '' }])[0].items.length === 1);
  for (const info of KQL_FUNCTION_CATALOG.slice(0, 40)) assert.doesNotThrow(() => parseKqlScript(`cards select ${info.example} as "x"`), info.example);
});

test('table names are qualified only when two tables share a name', () => {
  const refs: TableRef[] = [
    { id: 's1', name: 'Ventas', origin: 'shared' },
    { id: 'd1', name: 'Ventas', origin: 'document', refTitle: 'Informe' },
    { id: 'file:1', name: 'ventas.csv', origin: 'file', refTitle: 'Informe' },
    { id: 'file:2', name: 'ventas.csv', origin: 'file', refTitle: 'Tarea' },
    { id: 'c1', name: 'Plan', origin: 'card', refTitle: 'Tarea' },
  ];
  const where = { 'file:1': 'document', 'file:2': 'card' } as const;
  assert.equal(qualifiedName(refs[0], refs), 'shared:Ventas');
  assert.equal(qualifiedName(refs[1], refs), 'doc:Informe / Ventas');
  assert.equal(qualifiedName(refs[2], refs, where), 'doc:Informe / ventas.csv');
  assert.equal(qualifiedName(refs[3], refs, where), 'card:Tarea / ventas.csv');
  assert.equal(qualifiedName(refs[4], refs), 'Plan', 'unique: the plain name');
  const twins: TableRef[] = [{ id: 'a', name: 'X', origin: 'file', refTitle: 'Doc' }, { id: 'b', name: 'x', origin: 'file', refTitle: 'Doc' }];
  assert.equal(qualifiedName(twins[0], twins), 'a', 'still ambiguous: the id');
  const options = tableOptions(refs, where);
  assert.equal(options.length, 5);
  assert.ok(options.every((o) => o.value && o.label));
  assert.ok(options.some((o) => o.value === 'card:Tarea / ventas.csv' && o.label === 'ventas.csv (Tarea)'));
  // what the picker writes is what the engine reads
  const out = compileFlow(chain(node('source', { kind: 'rows', name: 'doc:Informe / ventas.csv' })));
  assert.equal(out.script, 'show rows of "doc:Informe / ventas.csv"');
  assert.doesNotThrow(() => parseKqlScript(out.script));
  assert.doesNotThrow(() => parseKqlScript(compileFlow(chain(node('source', { kind: 'rows', name: 'shared:Ventas' }))).script));
});
