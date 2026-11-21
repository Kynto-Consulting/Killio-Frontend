import assert from 'node:assert/strict';
import test from 'node:test';

import { KQL_FUNCTION_EXAMPLES, KQL_LIMITS, KQL_SYNTAX_GUIDE, KqlError, describeKqlDeclarations, describeKqlSources, parseFunctionDefinitions, runKql, type KqlCard, type KqlContext, type KqlData, type KqlTable } from './kql.ts';

const ctx: KqlContext = { now: new Date('2026-03-18T12:00:00Z') };

const table = (title: string, rows: Array<Record<string, string | number | boolean | null>>): KqlTable => ({
  id: `t-${title}`,
  title,
  kind: 'table',
  columns: [...new Set(rows.flatMap((r) => Object.keys(r)))],
  rows: rows.map((fields, i): KqlCard => ({ id: `${title[0].toLowerCase()}${i + 1}`, title: String(Object.values(fields)[0] ?? ''), fields })),
});

const cards: KqlCard[] = [
  { id: 'c1', title: 'Login', list: 'open', points: 5 },
  { id: 'c2', title: 'Logout', list: 'done', points: 1 },
];
const data: KqlData = {
  cards,
  tables: [
    table('Ventas', [
      { Cliente: 'A', Estado: 'Pagado', Monto: 1000 },
      { Cliente: 'B', Estado: 'Pendiente', Monto: 500 },
      { Cliente: 'C', Estado: 'Pagado', Monto: 800 },
      { Cliente: 'A', Estado: 'Pagado', Monto: 300 },
    ]),
    table('Clientes', [{ Nombre: 'a', Pais: 'Peru' }, { Nombre: 'B', Pais: 'Chile' }, { Nombre: 'C', Pais: 'Peru' }]),
    table('Otras', [{ Cliente: 'D', Estado: 'Pagado', Monto: 900 }, { Cliente: 'E', Estado: 'Pagado', Monto: 50 }]),
  ],
};
const run = (q: string) => runKql(q, data, ctx);
const result = (q: string) => run(q)[0].result;
const cells = (q: string) => result(q).rows.map((r) => r.cells.join('/'));
const labels = (q: string) => result(q).columns.map((c) => c.label);
const fails = (q: string, re: RegExp) => assert.throws(() => run(q), (e: unknown) => e instanceof KqlError && re.test(e.message), `${q} -> expected ${re}`);
const LIMPIAR = 'fn limpiar(t, minimo) = from t where Monto >= minimo select Cliente, Monto;';

test('a table function with a value parameter: from limpiar(rows of "...", 500)', () => {
  assert.deepEqual(cells(`${LIMPIAR}\nfrom limpiar(rows of "Ventas", 500) select * order by Monto desc`), ['A/1000', 'C/800', 'B/500']);
  assert.deepEqual(labels(`${LIMPIAR}\nfrom limpiar(rows of "Ventas", 500) select *`), ['Cliente', 'Monto']);
  assert.deepEqual(cells(`${LIMPIAR}\nfrom limpiar(rows of "Ventas", 900) select *`), ['A/1000']);
  // the same function over another source
  assert.deepEqual(cells(`${LIMPIAR}\nfrom limpiar(rows of "Otras", 100) select *`), ['D/900']);
  // the result is a table: the rest of the query works on it
  assert.deepEqual(cells(`${LIMPIAR}\nfrom limpiar(rows of "Ventas", 500) group by Cliente sum(Monto) order by key`), ['A/1000', 'B/500', 'C/800']);
  assert.deepEqual(cells(`${LIMPIAR}\nlimpiar(rows of "Ventas", 500) where Cliente = "C" select Monto`), ['800'], 'also as the first word of a query');
  assert.deepEqual(cells(`${LIMPIAR}\nshow limpiar(rows of "Ventas", 900) select * as "Grandes"`), ['A/1000']);
  // $name and a declared param as the argument; limit with a parameter
  assert.deepEqual(cells(`param corte = 800\n${LIMPIAR}\nfrom limpiar(rows of "Ventas", $corte) select * order by Monto`), ['C/800', 'A/1000']);
  assert.deepEqual(cells('fn losprimeros(t, n) = from t select * order by Monto desc limit n;\nfrom losprimeros(rows of "Ventas", 2) select Cliente'), ['A', 'C']);
  // a text / date value parameter and `$name` inside the body
  assert.deepEqual(cells('fn deestado(t, e) = from t where Estado = $e select Cliente, Monto;\nfrom deestado(rows of "Ventas", "Pendiente") select *'), ['B/500']);
  assert.deepEqual(cells('fn deestado(t, e) = from t where Estado = e select Cliente, Monto;\nfrom deestado(rows of "Ventas", "Pendiente") select *'), ['B/500'], 'bare name in the body');
  // a function over cards, with no table parameter at all
  assert.deepEqual(cells('fn abiertas(n) = cards where points > n select title;\nfrom abiertas(2) select *'), ['Login']);
  assert.deepEqual(cells('fn todas() = cards select title order by title;\nfrom todas() select *'), ['Login', 'Logout']);
  // multi-line body, Spanish keyword
  assert.deepEqual(cells('funcion c2(t, m) = from t\n  where Monto >= m\n  select Cliente;\nfrom c2(rows of "Ventas", 900) select *'), ['A']);
});

test('a function over two tables: cross sources', () => {
  const cruzar = 'fn cruzar(a, b) = from a join b as b on Cliente = b.Nombre select Cliente, b.Pais as "Pais", Monto;';
  assert.deepEqual(cells(`${cruzar}\nfrom cruzar(rows of "Ventas", rows of "Clientes") select * order by Monto desc`), ['A/Peru/1000', 'C/Peru/800', 'B/Chile/500', 'A/Peru/300']);
  assert.deepEqual(labels(`${cruzar}\nfrom cruzar(rows of "Ventas", rows of "Clientes") select *`), ['Cliente', 'Pais', 'Monto']);
  // table arguments: let names, values (...), from <name>
  assert.deepEqual(cells(`${cruzar}\nlet v = rows of "Ventas" where Monto > 600\nlet c = rows of "Clientes"\nfrom cruzar(v, c) select * order by Cliente`), ['A/Peru/1000', 'C/Peru/800']);
  assert.deepEqual(cells(`${cruzar}\nfrom cruzar(values ("Cliente", "Monto") ("B", 5), from rows of "Clientes") select *`), ['B/Chile/5']);
  // join / union with a table function, the alias defaults to the function name
  assert.deepEqual(cells(`${LIMPIAR}\nrows of "Clientes" join limpiar(rows of "Ventas", 700) as v on Nombre = v.Cliente select Nombre, v.Monto order by v.Monto`), ['C/800', 'a/1000']);
  assert.deepEqual(cells(`${LIMPIAR}\nrows of "Clientes" join limpiar(rows of "Ventas", 700) on Nombre = limpiar.Cliente select Nombre, limpiar.Monto order by limpiar.Monto`), ['C/800', 'a/1000']);
  assert.deepEqual(cells('fn solo(t) = from t select Cliente, Monto;\nfrom solo(rows of "Ventas") union solo(rows of "Otras") select Cliente order by Cliente limit 3'), ['A', 'A', 'B']);
  // `join t` without an alias reads the table parameter's name
  assert.deepEqual(cells('fn x(a, b) = from a join b on Cliente = b.Nombre select Cliente, b.Pais;\nfrom x(rows of "Ventas", rows of "Clientes") where Cliente = "B" select *'), ['B/Chile']);
  // the function's tables are loaded by describeKqlSources
  const d = describeKqlSources(`${cruzar}\nfrom cruzar(rows of "Ventas", rows of "Clientes")`);
  assert.deepEqual(d.tables.sort(), ['Clientes', 'Ventas']);
});

test('nested calls, let and function calls', () => {
  const nested = `${LIMPIAR}\nfn top2(t) = from t select * order by Monto desc limit 2;\n`;
  assert.deepEqual(cells(`${nested}from top2(limpiar(rows of "Ventas", 400)) select *`), ['A/1000', 'C/800']);
  assert.deepEqual(cells(`${nested}from top2(limpiar(top2(rows of "Ventas"), 900)) select *`), ['A/1000']);
  assert.deepEqual(cells(`${LIMPIAR}\nfn resumen(t, m) = from limpiar(t, m) group by Cliente sum(Monto);\nfrom resumen(rows of "Ventas", 400) select * order by Cliente`), ['A/1000', 'B/500', 'C/800'], 'a function calls another with its own parameters');
  assert.deepEqual(cells(`${LIMPIAR}\nlet x = limpiar(rows of "Ventas", 500)\nfrom x group by Cliente sum(Monto) order by key`), ['A/1000', 'B/500', 'C/800']);
  assert.deepEqual(cells(`${LIMPIAR}\nlet x = limpiar(rows of "Ventas", 500)\nlet y = limpiar(x, 800)\nfrom y select Cliente order by Cliente`), ['A', 'C'], 'let + fn + let');
  // grouped let, then the function, then a join with another source
  const script = `${LIMPIAR}\nlet porCliente = rows of "Ventas" where Estado = "Pagado"\nfrom limpiar(porCliente, 700) join rows of "Clientes" as c on Cliente = c.Nombre select Cliente, c.Pais, Monto order by Cliente`;
  assert.deepEqual(cells(script), ['A/Peru/1000', 'C/Peru/800']);
  // a scalar function and a table function side by side
  assert.deepEqual(cells(`fn iva(x) = x * 1.18\n${LIMPIAR}\nfrom limpiar(rows of "Ventas", 900) select Cliente, iva(Monto)`), ['A/1180']);
  assert.deepEqual(cells('fn iva(x) = x * 1.18\nfn conigv(t) = from t select Cliente, iva(Monto) as "Total";\nfrom conigv(rows of "Ventas") where Cliente = "C" select *'), ['C/944']);
  // two statements, both shown; the hidden lets produce no output
  const out = run(`${LIMPIAR}\nfrom limpiar(rows of "Ventas", 900) as "uno"\nfrom limpiar(rows of "Otras", 100)`);
  assert.equal(out.length, 2);
});

test('the runnable examples and the guide', () => {
  assert.ok(KQL_FUNCTION_EXAMPLES.length >= 4);
  for (const ex of KQL_FUNCTION_EXAMPLES) {
    const out = run(ex.script);
    assert.ok(out[0].result.rows.length > 0, `${ex.title} returns rows`);
  }
  for (const word of ['Table functions', 'fn limpiar', 'fn cruzar', 'from limpiar(rows of "Ventas", 500)', 'parseFunctionDefinitions', 'mutual', 'maxFnCalls']) assert.ok(KQL_SYNTAX_GUIDE.includes(word), word);
  for (const line of KQL_SYNTAX_GUIDE.split('\n')) assert.ok(line.length <= 175, `guide line too long (${line.length}): ${line.slice(0, 60)}`);
});

test('recursion is an error, direct and mutual', () => {
  fails('fn f(t) = from f(t);\nfrom f(rows of "Ventas")', /"f" calls itself: recursion is not allowed/);
  fails('fn f(t) = from t join f(t) on Cliente = f.Cliente select Cliente;\nrows of "Ventas" count', /"f" calls itself/);
  fails('fn a(t) = from b(t);\nfn b(t) = from a(t);\nfrom a(rows of "Ventas")', /mutual recursion is not allowed/);
  fails('fn a(t) = from b(t);\nfn b(t) = from t;\nfrom a(rows of "Ventas")', /Unknown function "b"\. It is declared further down/);
  fails('from f(rows of "Ventas")\nfn f(t) = from t;', /Unknown function "f"\. It is declared further down/);
  fails('fn a(x) = b(x)\nfn b(x) = a(x)\ncards count', /mutual recursion/);
});

test('arity, argument and kind errors carry a position', () => {
  fails(`${LIMPIAR}\nfrom limpiar(rows of "Ventas")`, /limpiar\(\) takes 2 arguments \(table t, minimo\), not 1/);
  fails(`${LIMPIAR}\nfrom limpiar(rows of "Ventas", 1, 2)`, /limpiar\(\) takes 2 arguments \(table t, minimo\), not 3/);
  fails(`${LIMPIAR}\nfrom limpiar()`, /takes 2 arguments/);
  fails(`${LIMPIAR}\nfrom limpiar(5, 1)`, /Argument "t" of limpiar\(\) is a table: write rows of/);
  fails(`${LIMPIAR}\nfrom limpiar(rows of "Ventas", 1`, /Expected "\)" to close limpiar/);
  fails(`${LIMPIAR}\nfrom limpiarr(rows of "Ventas", 1)`, /Unknown function "limpiarr"\. Did you mean "limpiar"\?/);
  fails(`${LIMPIAR}\nfrom lower(rows of "Ventas")`, /lower\(\) is a built-in that returns a value/);
  fails(`${LIMPIAR}\nrows of "Ventas" select limpiar(Monto, 1)`, /limpiar\(\) returns a table, so it goes where a table goes/);
  fails('fn iva(x) = x * 1.18\nfrom iva(rows of "Ventas")', /iva\(\) returns a value, not a table/);
  fails(`${LIMPIAR}\nfrom limpiar(rows of "Nada", 1)`, /No table "Nada" found/);
  fails(`${LIMPIAR}\nfrom limpiar(sinnombre, 1)`, /In limpiar\(t, minimo\)|Unknown name "sinnombre"/);
  // a table that is not a parameter of the function: the error says how to fix it
  fails('fn mal(t) = from otra where Monto > 1;\nfrom mal(rows of "Ventas")', /Argument "t" of mal\(\) is a value: its body never uses "t" as a table/);
  fails('fn mal(t) = from t join otra on Cliente = otra.Cliente select Cliente;\nfrom mal(rows of "Ventas")', /In mal\(t\): Unknown name "otra".*fn mal\(t, otra\) = \.\.\./);
  fails('fn f(t, n) = from t select * limit n;\nfrom f(rows of "Ventas", "x")', /n must hold a number/);
  // the position points at the call
  try {
    run(`${LIMPIAR}\nfrom limpiar(rows of "Ventas")`);
    assert.fail('expected an error');
  } catch (e) {
    assert.ok(e instanceof KqlError);
    assert.equal(`${LIMPIAR}\nfrom limpiar(rows of "Ventas")`.slice(e.position, e.position + 7), 'limpiar');
  }
});

test('scalar functions work exactly as before', () => {
  assert.deepEqual(cells('fn conigv(x) = x * 1.18\nrows of "Ventas" select conigv(Monto) limit 1'), ['1180']);
  assert.deepEqual(cells('fn bucket(m, corte) = if(m > corte, "alto", "bajo")\nrows of "Ventas" select bucket(Monto, 600) limit 2'), ['alto', 'bajo']);
  assert.deepEqual(cells('fn a(x) = x + 1\nfn b(x) = a(x) * 2\nrows of "Ventas" select b(Monto) limit 1'), ['2002']);
  assert.deepEqual(cells('fn alto(m) = m > 700\nrows of "Ventas" where alto(Monto) select Cliente'), ['A', 'C']);
  assert.deepEqual(describeKqlDeclarations('param minimo = 100\nfn conigv(x) = x * 1.18'), { params: [{ name: 'minimo', value: '100' }], functions: [{ name: 'conigv', args: ['x'], body: 'x * 1.18' }] });
  fails('fn f(x) = f(x)\ncards count', /"f" calls itself: recursion is not allowed/);
  fails('fn a(x) = b(x)\nfn b(x) = x\ncards count', /Unknown function "b"/);
  fails('fn f(x) = x\ncards select f(1, 2)', /f\(\) takes 1 argument \(x\), not 2/);
  // a name that merely starts like a table keyword is still a scalar body
  assert.deepEqual(cells('fn grilla(x) = x + 1\nrows of "Ventas" select grilla(Monto) limit 1'), ['1001']);
});

test('parseFunctionDefinitions lists functions with their parameter kinds', () => {
  const script = [
    'param minimo = 100',
    'fn iva(x) = x * 1.18',
    LIMPIAR,
    'fn cruzar(a, b) = from a join b as b on Cliente = b.Nombre select Cliente, b.Pais;',
    'fn resumen(t, m) = from limpiar(t, m) group by Cliente sum(Monto);',
    'fn ninguna(n) = cards where points > n select title;',
    'rows of "Ventas" select this is not valid ((',
    'from limpiar(rows of "Ventas", 1)',
  ].join('\n');
  const defs = parseFunctionDefinitions(script);
  assert.deepEqual(defs.map((d) => [d.name, d.kind, d.params.map((p) => `${p.name}:${p.kind}`).join(',')]), [
    ['iva', 'scalar', 'x:value'],
    ['limpiar', 'table', 't:table,minimo:value'],
    ['cruzar', 'table', 'a:table,b:table'],
    ['resumen', 'table', 't:table,m:value'],
    ['ninguna', 'table', 'n:value'],
  ]);
  assert.equal(defs[1].body, 'from t where Monto >= minimo select Cliente, Monto');
  assert.equal(defs[1].signature, 'limpiar(t: table, minimo)');
  assert.equal(defs[0].declaration, 'fn iva(x) = x * 1.18');
  assert.deepEqual(parseFunctionDefinitions(''), []);
  assert.deepEqual(parseFunctionDefinitions('cards count'), []);
  assert.throws(() => parseFunctionDefinitions('fn f(t) = from f(t);'), /calls itself/);
  // declarations still list every function the old way
  assert.deepEqual(describeKqlDeclarations(script.replace(/\nrows of "Ventas" select this[^\n]*/, '')).functions.map((f) => f.name), ['iva', 'limpiar', 'cruzar', 'resumen', 'ninguna']);
});

test('limits: depth, calls, body size, statements', () => {
  // depth of nested functions (a chain of table functions)
  const chain = (n: number) => ['fn f1(t) = from t select Cliente, Monto;', ...Array.from({ length: n - 1 }, (_, i) => `fn f${i + 2}(t) = from f${i + 1}(t);`)].join('\n');
  assert.equal(result(`${chain(8)}\nfrom f8(rows of "Ventas") select *`).rows.length, 4, 'depth 8 is fine');
  fails(`${chain(9)}\nfrom f9(rows of "Ventas")`, /more than 8 levels deep/);
  const savedDepth = KQL_LIMITS.maxFnDepth;
  try {
    KQL_LIMITS.maxFnDepth = 3;
    assert.equal(result(`${chain(3)}\nfrom f3(rows of "Ventas") select *`).rows.length, 4);
    fails(`${chain(4)}\nfrom f4(rows of "Ventas")`, /more than 3 levels deep/);
  } finally {
    KQL_LIMITS.maxFnDepth = savedDepth;
  }
  // number of calls: every expansion counts, nested ones too
  const doubled = 'fn solo(t) = from t select Cliente, Monto;\nfn dos(t) = from solo(t) union solo(t);\nfn cuatro(t) = from dos(t) union dos(t);\nfn ocho(t) = from cuatro(t) union cuatro(t);\n';
  assert.equal(result(`${doubled}from ocho(rows of "Ventas") count`).rows[0].values[0], 32, "eight calls of four rows: each call is a table of its own");
  const savedCalls = KQL_LIMITS.maxFnCalls;
  try {
    KQL_LIMITS.maxFnCalls = 10;
    assert.ok(run(`${doubled}from cuatro(rows of "Ventas") count`).length === 1, '1 + 2 + 4 calls');
    fails(`${doubled}from ocho(rows of "Ventas") count`, /more than 10 table-function calls/);
  } finally {
    KQL_LIMITS.maxFnCalls = savedCalls;
  }
  try {
    KQL_LIMITS.maxFnCalls = 5;
    const lets = (n: number) => `${LIMPIAR}\n${Array.from({ length: n }, (_, i) => `let x${i} = limpiar(rows of "Ventas", ${i})`).join('\n')}\nfrom x0 select *`;
    assert.equal(run(lets(5)).length, 1);
    fails(lets(6), /more than 5 table-function calls/);
  } finally {
    KQL_LIMITS.maxFnCalls = savedCalls;
  }
  // the body of a table function
  fails(`fn big(t) = from t where ${Array.from({ length: 150 }, () => 'Monto > 1').join(' and ')};\nrows of "Ventas" count`, /too long \(max 2000 characters\)/);
  // rows cannot blow up: a function cannot join more rows than the row cap
  const saved = KQL_LIMITS.maxRows;
  try {
    KQL_LIMITS.maxRows = 4;
    const big = `values ("k") ${Array.from({ length: 5 }, () => '("x")').join(' ')}`;
    fails(`fn cruz(a, b) = from a join b as b on k = b.k select k;\nfrom cruz(${big}, ${big})`, /Too many records/);
  } finally {
    KQL_LIMITS.maxRows = saved;
  }
  // hidden lets do not use the statement budget
  const stmts = Array.from({ length: KQL_LIMITS.maxStatements - 1 }, () => `let z = limpiar(rows of "Ventas", 1)`);
  assert.equal(run(`${LIMPIAR}\n${stmts.join('\n')}\nfrom z`).length, 1);
});
