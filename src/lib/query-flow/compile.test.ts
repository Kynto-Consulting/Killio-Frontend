import assert from 'node:assert/strict';
import test from 'node:test';

import { compileFlow, literal, quoteIdent, quoteString, regexLiteral } from './compile.ts';
import { makeNode, newCondition, newTransformColumn, normalizeGraph, uid } from './defaults.ts';
import { parseKqlScript, runKql } from '../query/kql.ts';
import { tablesFromBricks } from '../query/tables.ts';
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from './types.ts';

function node(type: NodeType, data: Record<string, unknown>, extra: Partial<FlowNode> = {}): FlowNode {
  return makeNode(type, { x: 0, y: 0 }, data, extra);
}
function chain(...nodes: FlowNode[]): FlowGraph {
  const edges: FlowEdge[] = [];
  for (let i = 1; i < nodes.length; i++) edges.push({ id: uid('e'), source: nodes[i - 1].id, target: nodes[i].id });
  return { nodes, edges };
}
const cond = (field: string, op: string, value = '', extra: Record<string, unknown> = {}) => newCondition({ field, op: op as never, value, ...extra });
const metric = (fn: string, field = '', arg = '', field2 = '') => ({ id: uid('m'), fn, field, field2, arg });
const dim = (field: string, bucket = 'none') => ({ id: uid('d'), field, bucket });

const bricks = [{
  id: 'ventas', kind: 'table',
  content: { title: 'Ventas', rows: [['Cliente', 'Monto', 'Estado', 'Nota'], ['Ana', '10', 'Pagado', ' hola '], ['Beto', '20', 'Pagado', 'x'], ['Ana', '5', 'Pendiente', ''], ['Cira', '7', 'Pagado', 'y']] },
}, {
  id: 'clientes', kind: 'table',
  content: { title: 'Clientes', rows: [['Nombre', 'Pais'], ['Ana', 'AR'], ['Beto', 'UY'], ['Cira', 'AR']] },
}];
const tables = tablesFromBricks(bricks);
const columnsOf = (s: { kind: string; name: string }) => (s.kind === 'rows' ? tables.find((t) => t.title === s.name)?.columns ?? null : null);
const compile = (g: FlowGraph, upTo?: string) => compileFlow(g, { upTo, columnsOf });
const parses = (script: string) => parseKqlScript(script);

test('quoting helpers', () => {
  assert.equal(quoteString('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
  assert.equal(quoteIdent('title'), 'title');
  assert.equal(quoteIdent('Fecha de entrega'), '[Fecha de entrega]');
  assert.equal(quoteIdent('a]b'), '"a]b"');
  assert.equal(quoteIdent('count'), '[count]');
  assert.equal(quoteIdent('lower(title)'), 'lower(title)');
  assert.equal(regexLiteral('a/b'), '/a\\/b/');
  assert.equal(regexLiteral('/^bug/i'), '/^bug/i');
  assert.equal(literal('12'), '12');
  assert.equal(literal('2026-01-02'), '2026-01-02');
  assert.equal(literal('+7d'), '+7d');
  assert.equal(literal('Ana'), '"Ana"');
  assert.equal(literal('12', 'text'), '"12"');
  assert.throws(() => literal('x', 'number'));
  assert.throws(() => quoteIdent('  '));
});

test('every source kind compiles and parses', () => {
  const kinds: Array<[string, string, string]> = [
    ['cards', '', 'show cards'], ['rows', 'Ventas', 'show rows of "Ventas"'], ['documents', '', 'show documents'], ['bricks', '', 'show bricks'],
    ['items', '', 'show items'], ['boards', '', 'show boards'], ['lists', '', 'show lists'], ['members', '', 'show members'], ['groups', '', 'show groups'],
    ['activity', '', 'show activity'], ['scripts', '', 'show scripts'], ['name', 'mine', 'show from mine'], ['name', 'My sel', 'show from "My sel"'],
  ];
  for (const [kind, name, expected] of kinds) {
    const r = compileFlow(chain(node('source', { kind, name })));
    assert.deepEqual(r.errors, [], kind);
    assert.equal(r.script, expected);
    parses(r.script);
  }
  // comments / timers / tags / files are written as plain words: the engine may or may not know them
  for (const kind of ['comments', 'timers', 'tags', 'files']) assert.equal(compileFlow(chain(node('source', { kind, name: '' }))).script, `show ${kind}`);
  assert.equal(compileFlow(chain(node('source', { kind: 'rows', name: '' }))).errors.length, 1);
});

test('filter: operators, and/or, advanced text', () => {
  const g = chain(
    node('source', { kind: 'cards' }),
    node('filter', { combine: 'and', conditions: [cond('done', 'flag', 'done'), cond('completed', 'window', 'last 30d'), cond('points', '>=', '3'), cond('title', 'contains', 'bug'), cond('priority', 'in', '', { values: ['High', 'Low'] }), cond('due', 'between', '2026-01-01', { value2: '2026-02-01' }), cond('assignee', 'notempty')], advanced: 'has(tag, "x")' }),
  );
  const r = compile(g);
  assert.deepEqual(r.errors, []);
  assert.equal(r.script, 'show cards where done and completed in last 30d and points >= 3 and title contains "bug" and priority in ("High", "Low") and due between 2026-01-01 and 2026-02-01 and assignee is not empty and has(tag, "x")');
  parses(r.script);
  const or = compile(chain(node('source', { kind: 'cards' }), node('filter', { combine: 'or', conditions: [cond('list', '=', 'A'), cond('list', '=', 'B')], advanced: '' }), node('filter', { combine: 'and', conditions: [cond('done', 'flag', 'open')], advanced: '' })));
  assert.equal(or.script, 'show cards where (list = "A" or list = "B") and open');
  parses(or.script);
  assert.equal(compile(chain(node('source', { kind: 'cards' }), node('filter', { conditions: [] }))).errors.length, 1);
});

test('escaping survives a round trip through the engine parser', () => {
  const nasty = 'He said "hi" \\ and left\nnext';
  const r = compile(chain(node('source', { kind: 'cards' }), node('filter', { conditions: [cond('title', '=', nasty, { vtype: 'text' })] })));
  const st = parses(r.script);
  const where = st[0].query.where as { t: string; value: { v: string } };
  assert.equal(where.t, 'cmp');
  assert.equal(where.value.v, nasty);
  const rx = compile(chain(node('source', { kind: 'cards' }), node('filter', { conditions: [cond('title', '~', '^a/b\\d+', { vtype: 'regex' })] })));
  const w2 = parses(rx.script)[0].query.where as { value: { k: string; v: string } };
  assert.equal(w2.value.k, 'regex');
  const col = compile(chain(node('source', { kind: 'rows', name: 'Ventas' }), node('filter', { conditions: [cond('Fecha de entrega', '=', 'x')] })));
  assert.ok(col.script.includes('[Fecha de entrega]'));
  parses(col.script);
  const odd = compile(chain(node('source', { kind: 'rows', name: 'Ventas' }), node('filter', { conditions: [cond('a]b', 'notempty')] })));
  assert.ok(odd.script.includes('"a]b" is not empty'));
  parses(odd.script);
  const title = compile(chain(node('source', { kind: 'rows', name: 'Say "x"' })));
  assert.equal(parses(title.script)[0].query.source.kind, 'rows');
});

test('group: dimensions, buckets and metrics', () => {
  const g = chain(
    node('source', { kind: 'cards' }),
    node('filter', { conditions: [cond('done', 'window', 'last 30d')] }),
    node('group', { dimensions: [dim('assignee'), dim('created', 'week')], metrics: [metric('count'), metric('sum', 'points'), metric('avg', 'points'), metric('unique', 'list'), metric('count_distinct', 'list'), metric('percentile', 'age', '90'), metric('count_if', '', 'points > 3'), metric('sum_if', 'points', 'done'), metric('ratio', 'points', '', 'comments'), metric('join', 'title', ' | ')], having: 'count > 1' }),
    node('sort', { keys: [{ id: 'k', field: 'count', dir: 'desc' }] }),
    node('limit', { limit: 5, offset: 1 }),
    node('output', { kind: 'bar', title: 'Resolved "per" person' }),
  );
  const r = compile(g);
  assert.deepEqual(r.errors, []);
  assert.equal(r.script, 'show cards where done in last 30d group by assignee, week(created) count, sum(points), avg(points), unique(list), count(distinct list), percentile(age, 90), count_if(points > 3), sum_if(points, done), ratio(points, comments), join(title, " | ") having count > 1 order by count desc offset 1 limit 5 as "Resolved \\"per\\" person"');
  const st = parses(r.script);
  assert.equal(st[0].kind, 'show');
  assert.equal((st[0] as { title: string }).title, 'Resolved "per" person');
  assert.equal(compile(chain(node('source', { kind: 'cards' }), node('group', { dimensions: [], metrics: [] }))).errors.length, 1);
});

test('transform, select, distinct, sort and limit on a table', () => {
  const g = chain(
    node('source', { kind: 'rows', name: 'Ventas' }),
    node('transform', { columns: [newTransformColumn('fn', { column: 'Nota', fn: 'trim' })] }),
    node('transform', { columns: [newTransformColumn('fn', { column: 'Nota', fn: 'upper' })] }),
    node('transform', { columns: [newTransformColumn('custom', { alias: 'Doble', expr: 'mul([Monto], 2)' })] }),
    node('filter', { conditions: [cond('Estado', '=', 'Pagado')] }),
    node('sort', { keys: [{ id: 'k', field: 'Doble', dir: 'desc' }] }),
    node('limit', { limit: 2, offset: null }),
  );
  const r = compile(g);
  assert.deepEqual(r.errors, []);
  assert.equal(r.script, 'show rows of "Ventas" where Estado = "Pagado" select Cliente, Monto, Estado, upper(trim(Nota)) as "Nota", mul([Monto], 2) as "Doble" order by mul([Monto], 2) desc limit 2');
  parses(r.script);
  assert.deepEqual(r.columns, ['Cliente', 'Monto', 'Estado', 'Nota', 'Doble']);
  const out = runKql(r.script, { tables });
  assert.equal(out[0].result.rows.length, 2);
  assert.deepEqual(out[0].result.rows[0].cells.slice(0, 2), ['Beto', '20']);
  assert.equal(out[0].result.rows[0].cells[4], '40');
});

test('select renames, reorders and removes; distinct', () => {
  const g = chain(
    node('source', { kind: 'rows', name: 'Ventas' }),
    node('select', { columns: [{ id: 'a', column: 'Estado', alias: '' }, { id: 'b', column: 'Cliente', alias: 'Quien' }, { id: 'c', column: 'Cliente', alias: 'Copia' }] }),
    node('distinct', { columns: [] }),
  );
  const r = compile(g);
  assert.deepEqual(r.errors, []);
  assert.equal(r.script, 'show rows of "Ventas" select distinct Estado, Cliente as "Quien", Cliente as "Copia"');
  parses(r.script);
  const out = runKql(r.script, { tables });
  assert.equal(out[0].result.rows.length, 4);
  const noCols = compile(chain(node('source', { kind: 'cards' }), node('distinct', { columns: [] })));
  assert.equal(noCols.errors.length, 1);
  const withCols = compile(chain(node('source', { kind: 'cards' }), node('distinct', { columns: ['list', 'priority'] })));
  assert.equal(withCols.script, 'show cards select distinct list, priority');
  parses(withCols.script);
});

test('transform kinds: replace, split, merge, conditional, extract, types', () => {
  const t = (c: Record<string, unknown>) => node('transform', { columns: [newTransformColumn((c.kind as never) ?? 'fn', c)] });
  const steps = [
    t({ column: 'Nota', fn: 'replace', a: 'a"b', b: 'c', alias: 'N1' }),
    t({ column: 'Nota', fn: 'replace', a: '\\s+', b: ' ', regex: true, alias: 'N2' }),
    t({ column: 'Nota', fn: 'extract', a: '(\\d+)', b: '1', alias: 'N3' }),
    t({ column: 'Nota', fn: 'left', a: '3', alias: 'N4' }),
    t({ column: 'Monto', fn: 'number', alias: 'N5' }),
    t({ column: 'Monto', fn: 'round', a: '1', alias: 'N6' }),
    t({ column: 'Cliente', fn: 'date', a: 'dd MMM', alias: 'N7' }),
    t({ kind: 'split', column: 'Cliente', delimiter: ' - ', a: '2', alias: 'Parte' }),
    t({ kind: 'merge', columns: ['Cliente', 'Estado'], separator: ', ', alias: 'Ambos' }),
    t({ kind: 'conditional', alias: 'Tam', clauses: [{ id: 'c1', condition: cond('Monto', '>', '10'), then: 'grande', thenType: 'text' }, { id: 'c2', condition: cond('Monto', '>', '5'), then: 'medio', thenType: 'text' }], otherwise: 'chico', otherwiseType: 'text' }),
  ];
  const r = compile(chain(node('source', { kind: 'rows', name: 'Ventas' }), ...steps));
  assert.deepEqual(r.errors, []);
  assert.ok(r.script.includes('replace(Nota, "a\\"b", "c") as "N1"'));
  assert.ok(r.script.includes('replace(Nota, /\\s+/g, " ") as "N2"'));
  assert.ok(r.script.includes('extract(Nota, /(\\d+)/, 1) as "N3"'));
  assert.ok(r.script.includes('Cliente & ", " & [Estado] as "Ambos"'));
  assert.ok(r.script.includes('if(Monto > 10, "grande", if(Monto > 5, "medio", "chico")) as "Tam"'));
  const st = parses(r.script);
  assert.equal(st.length, 1);
  const out = runKql(r.script, { tables });
  assert.equal(out[0].result.rows.length, 4);
  const tamIndex = out[0].result.columns.findIndex((c) => c.label === 'Tam');
  assert.deepEqual(out[0].result.rows.map((row) => row.cells[tamIndex]), ['medio', 'grande', 'chico', 'medio']);
  assert.equal(compile(chain(node('source', { kind: 'cards' }), t({ column: '', fn: 'trim' }))).errors.length, 1);
  assert.equal(compile(chain(node('source', { kind: 'cards' }), t({ kind: 'merge', columns: ['a'], alias: 'x' }))).errors.length, 1);
});

test('transform without a known schema lists only the computed columns', () => {
  const r = compileFlow(chain(node('source', { kind: 'cards' }), node('transform', { columns: [newTransformColumn('custom', { alias: 'Dia', expr: 'date(created, "dd MMM")' }), newTransformColumn('fn', { column: 'title', fn: 'lower' })] })));
  assert.equal(r.script, 'show cards select date(created, "dd MMM") as "Dia", lower(title) as "title"');
  parses(r.script);
});

test('step order errors are reported on the node that cannot come there', () => {
  const grp = node('group', { dimensions: [dim('list')], metrics: [metric('count')] });
  const flt = node('filter', { conditions: [cond('done', 'flag', 'done')] });
  const r1 = compile(chain(node('source', { kind: 'cards' }), grp, flt));
  assert.deepEqual(r1.errors.map((e) => e.nodeId), [flt.id]);
  const lim = node('limit', { limit: 3 });
  const sort = node('sort', { keys: [{ id: 'k', field: 'title', dir: 'asc' }] });
  const r2 = compile(chain(node('source', { kind: 'cards' }), lim, sort));
  assert.deepEqual(r2.errors.map((e) => e.nodeId), [sort.id]);
  const g2 = node('group', { dimensions: [dim('list')], metrics: [] });
  const r3 = compile(chain(node('source', { kind: 'cards' }), grp, g2));
  assert.equal(r3.errors.length, 1);
  assert.equal(r3.errors[0].nodeId, g2.id);
});

test('missing input, cycles and a disabled step', () => {
  const lonely = node('filter', { conditions: [cond('done', 'flag', 'done')] });
  const out = node('output', { kind: 'table', title: '' });
  const r1 = compile({ nodes: [lonely, out], edges: [{ id: 'e', source: lonely.id, target: out.id }] });
  assert.deepEqual(r1.errors.map((e) => e.nodeId), [lonely.id]);
  assert.equal(r1.script, '');

  const a = node('filter', { conditions: [cond('done', 'flag', 'done')] });
  const b = node('filter', { conditions: [cond('done', 'flag', 'open')] });
  const o2 = node('output', {});
  const r2 = compile({ nodes: [a, b, o2], edges: [{ id: '1', source: a.id, target: b.id }, { id: '2', source: b.id, target: a.id }, { id: '3', source: b.id, target: o2.id }] });
  assert.ok(r2.errors.some((e) => /cycle/.test(e.message)));

  const src = node('source', { kind: 'cards' });
  const f = node('filter', { conditions: [cond('done', 'flag', 'done')] }, { disabled: true });
  const r3 = compile(chain(src, f));
  assert.equal(r3.script, 'show cards');
  const dup = node('filter', {});
  const r4 = compile({ nodes: [src, node('source', { kind: 'members' }), dup], edges: [{ id: '1', source: src.id, target: dup.id }, { id: '2', source: 'x', target: dup.id }] });
  assert.ok(r4.script.length > 0 || r4.errors.length > 0);
});

test('upTo compiles the chain until the selected step', () => {
  const src = node('source', { kind: 'cards' });
  const f = node('filter', { conditions: [cond('done', 'flag', 'done')] });
  const grp = node('group', { dimensions: [dim('assignee')], metrics: [metric('count')] });
  const out = node('output', { kind: 'bar', title: 'T' });
  const g = chain(src, f, grp, out);
  assert.equal(compile(g).script, 'show cards where done group by assignee count as "T"');
  assert.equal(compile(g, f.id).script, 'show cards where done');
  assert.equal(compile(g, grp.id).script, 'show cards where done group by assignee count');
  assert.equal(compile(g, 'nope').script, '');
});

test('join: inline right source, branch with let, left join and expand', () => {
  const left = node('source', { kind: 'rows', name: 'Ventas' });
  const join = node('join', { rightSource: { kind: 'rows', name: 'Clientes' }, alias: 'c', leftKey: 'Cliente', rightKey: 'Nombre', kind: 'inner', expand: ['Pais'] });
  const grp = node('group', { dimensions: [dim('c.Pais')], metrics: [metric('sum', 'Monto')] });
  const r = compile(chain(left, join, grp));
  assert.deepEqual(r.errors, []);
  assert.equal(r.script, 'show rows of "Ventas" join rows of "Clientes" as c on Cliente = Nombre group by c.Pais sum(Monto)');
  const st = parses(r.script);
  assert.equal(st[0].query.joins[0].alias, 'c');
  const res = runKql(r.script, { tables });
  assert.equal(res[0].result.rows.length, 2);

  // right input from a filtered branch -> let
  const clientes = node('source', { kind: 'rows', name: 'Clientes' });
  const onlyAR = node('filter', { conditions: [cond('Pais', '=', 'AR')] });
  const j2 = node('join', { alias: 'c', leftKey: 'Cliente', rightKey: 'Nombre', kind: 'left' });
  const g2: FlowGraph = {
    nodes: [left, clientes, onlyAR, j2],
    edges: [{ id: '1', source: left.id, target: j2.id }, { id: '2', source: clientes.id, target: onlyAR.id }, { id: '3', source: onlyAR.id, target: j2.id, targetHandle: 'right' }],
  };
  const r2 = compile(g2);
  assert.deepEqual(r2.errors, []);
  assert.equal(r2.script.split('\n')[0], 'let clientes = rows of "Clientes" where Pais = "AR"');
  assert.ok(r2.script.includes('show rows of "Ventas" join clientes as c on Cliente = Nombre left'));
  parses(r2.script);
  assert.equal(r2.columns?.[0], 'Cliente');
  assert.ok(r2.columns?.includes('c.Nombre'));

  // filtered left side is wrapped too
  const lf = node('filter', { conditions: [cond('Estado', '=', 'Pagado')] });
  const g3: FlowGraph = { nodes: [left, lf, join], edges: [{ id: '1', source: left.id, target: lf.id }, { id: '2', source: lf.id, target: join.id }] };
  const r3 = compile(g3);
  assert.deepEqual(r3.errors, []);
  assert.equal(r3.script.split('\n')[0], 'let ventas = rows of "Ventas" where Estado = "Pagado"');
  parses(r3.script);

  // a join needs keys, and a grouped input cannot feed it
  assert.equal(compile(chain(left, node('join', { rightSource: { kind: 'members', name: '' } }))).errors.length, 1);
  const badBranch: FlowGraph = {
    nodes: [left, clientes, grp, j2],
    edges: [{ id: '1', source: left.id, target: j2.id }, { id: '2', source: clientes.id, target: grp.id }, { id: '3', source: grp.id, target: j2.id, targetHandle: 'right' }],
  };
  assert.ok(compile(badBranch).errors.some((e) => e.nodeId === j2.id));
});

test('union of two sources and of two filtered branches', () => {
  const a = node('source', { kind: 'cards' });
  const b = node('source', { kind: 'name', name: 'mine' });
  const u = node('union', {});
  const g: FlowGraph = { nodes: [a, b, u], edges: [{ id: '1', source: a.id, target: u.id }, { id: '2', source: b.id, target: u.id, targetHandle: 'in2' }] };
  const r = compile(g);
  assert.deepEqual(r.errors, []);
  assert.equal(r.script, 'show cards union mine');
  parses(r.script);

  const f1 = node('filter', { conditions: [cond('done', 'flag', 'done')] });
  const f2 = node('filter', { conditions: [cond('overdue', 'flag', 'overdue')] });
  const grp = node('group', { dimensions: [dim('assignee')], metrics: [metric('count')] });
  const g2: FlowGraph = {
    nodes: [a, f1, b, f2, u, grp],
    edges: [{ id: '1', source: a.id, target: f1.id }, { id: '2', source: f1.id, target: u.id }, { id: '3', source: b.id, target: f2.id }, { id: '4', source: f2.id, target: u.id, targetHandle: 'in2' }, { id: '5', source: u.id, target: grp.id }],
  };
  const r2 = compile(g2);
  assert.deepEqual(r2.errors, []);
  const lines = r2.script.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('let cards = cards where done') || lines[0].startsWith('let cards_'));
  assert.ok(lines[2].endsWith('group by assignee count'));
  parses(r2.script);
  assert.equal(compile({ nodes: [a, u], edges: [{ id: '1', source: a.id, target: u.id }] }).errors.length, 1);
});

test('named queries: a source can reference another query', () => {
  const base = node('source', { kind: 'cards' }, { query: 'q1' });
  const flt = node('filter', { conditions: [cond('done', 'flag', 'done')] }, { query: 'q1' });
  const ref = node('source', { kind: 'query', name: 'q1' }, { query: 'q2' });
  const grp = node('group', { dimensions: [dim('assignee')], metrics: [metric('count')] }, { query: 'q2' });
  const out = node('output', { kind: 'pie', title: '' }, { query: 'q2' });
  const g: FlowGraph = {
    nodes: [base, flt, ref, grp, out],
    edges: [{ id: '1', source: base.id, target: flt.id }, { id: '2', source: ref.id, target: grp.id }, { id: '3', source: grp.id, target: out.id }],
    queries: [{ id: 'q1', name: 'Done' }, { id: 'q2', name: 'Per person' }],
  };
  const r = compile(g);
  assert.deepEqual(r.errors, []);
  assert.equal(r.script, 'let cards_1 = cards where done\nshow from cards_1 group by assignee count');
  parses(r.script);
  const selfRef = node('source', { kind: 'query', name: 'q2' }, { query: 'q2' });
  assert.equal(compile({ nodes: [selfRef], edges: [], queries: g.queries }).errors.length, 1);
});

test('advanced step is emitted verbatim and must be last', () => {
  const adv = node('advanced', { script: 'cards where done group by list count' });
  assert.equal(compile({ nodes: [adv], edges: [] }).script, 'cards where done group by list count');
  const src = node('source', { kind: 'cards' });
  const flt = node('filter', { conditions: [cond('done', 'flag', 'done')] });
  const r = compile({ nodes: [src, adv, flt], edges: [{ id: '1', source: src.id, target: adv.id }, { id: '2', source: adv.id, target: flt.id }] });
  assert.ok(r.errors.some((e) => e.nodeId === flt.id));
  assert.equal(compile({ nodes: [node('advanced', { script: '  ' })], edges: [] }).errors.length, 1);
});

test('several outputs make several show statements', () => {
  const src = node('source', { kind: 'cards' });
  const o1 = node('output', { title: 'A' });
  const o2 = node('output', { title: 'B' });
  const r = compile({ nodes: [src, o1, o2], edges: [{ id: '1', source: src.id, target: o1.id }, { id: '2', source: src.id, target: o2.id }] });
  assert.equal(r.script, 'show cards as "A"\nshow cards as "B"');
  parses(r.script);
});

test('malformed saved flows are repaired or rejected, never thrown', () => {
  assert.equal(normalizeGraph(null), null);
  assert.equal(normalizeGraph({ nodes: 'x' }), null);
  assert.equal(normalizeGraph({ nodes: [{ id: 'a', type: 'nope' }] }), null);
  const g = normalizeGraph({ nodes: [{ id: 'a', type: 'filter', data: { conditions: [null, { field: 3 }] }, position: { x: 'q' } }, { id: 'a', type: 'source' }], edges: [{ source: 'a', target: 'zz' }, null], queries: [{ id: 'q1' }] });
  assert.ok(g);
  assert.equal(g!.nodes.length, 1);
  assert.equal(g!.edges.length, 0);
  assert.equal(g!.nodes[0].position.x, 0);
  assert.doesNotThrow(() => compileFlow(g!));
  assert.doesNotThrow(() => compileFlow({ nodes: [{ id: 'z', type: 'group', position: { x: 0, y: 0 }, data: {} as never }], edges: [] }));
});

test('every generated script (without join/union) is accepted by the engine', () => {
  const scripts: FlowGraph[] = [
    chain(node('source', { kind: 'cards' }), node('output', { title: 'x' })),
    chain(node('source', { kind: 'cards' }), node('filter', { conditions: [cond('list', '=', 'En QA'), cond('due', 'window', 'next 7d')] }), node('group', { dimensions: [dim('priority')], metrics: [metric('count'), metric('sum', 'points')] })),
    chain(node('source', { kind: 'rows', name: 'Ventas' }), node('filter', { conditions: [cond('Monto', '>', '5')] }), node('group', { dimensions: [dim('Cliente')], metrics: [metric('sum', 'Monto')] }), node('sort', { keys: [{ id: 'k', field: 'sum(Monto)', dir: 'desc' }] })),
    chain(node('source', { kind: 'documents' }), node('group', { dimensions: [dim('created', 'month')], metrics: [metric('count')] })),
    chain(node('source', { kind: 'members' }), node('select', { columns: [{ id: 'a', column: 'title', alias: '' }, { id: 'b', column: 'email', alias: 'Mail' }] })),
  ];
  for (const g of scripts) {
    const r = compile(g);
    assert.deepEqual(r.errors, []);
    assert.doesNotThrow(() => parses(r.script), r.script);
  }
});
