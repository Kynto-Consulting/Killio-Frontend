import assert from 'node:assert/strict';
import test from 'node:test';

import { KQL_SYNTAX_GUIDE, KqlError, cellErrors, classifyCell, filterCards, runKql, type KqlCard, type KqlContext, type KqlData, type KqlTable } from './kql.ts';

const ctx: KqlContext = { now: new Date('2026-03-18T12:00:00Z') };

const table = (title: string, rows: Array<Record<string, string | number | null>>): KqlTable => ({
  id: `t-${title}`,
  title,
  kind: 'table',
  columns: [...new Set(rows.flatMap((r) => Object.keys(r)))],
  rows: rows.map((fields, i): KqlCard => ({ id: `${title[0].toLowerCase()}${i + 1}`, title: String(Object.values(fields)[0] ?? ''), fields })),
});

const datos = table('Datos', [
  { Cliente: 'A', Region: 'N', Monto: 10 },
  { Cliente: null, Region: 'N', Monto: 20 },
  { Cliente: 'B', Region: 'S', Monto: 30 },
  { Cliente: null, Region: 'S', Monto: 40 },
  { Cliente: null, Region: 'N', Monto: 50 },
]);
const ventas = table('Ventas', [
  { Responsable: 'Ana', Estado: 'Pagado', Monto: 100 },
  { Responsable: 'Ana', Estado: 'Pendiente', Monto: 50 },
  { Responsable: 'Luis', Estado: 'Pagado', Monto: 30 },
  { Responsable: 'Ana', Estado: 'Pagado', Monto: 20 },
  { Responsable: 'Luis', Estado: 'Pagado', Monto: 10 },
]);
const notas = table('Notas', [
  { Cliente: 'A', Q1: 5, Q2: 6, Q3: 7 },
  { Cliente: 'B', Q1: 8, Q2: null, Q3: 9 },
]);
const sucia = table('Sucia', [{ Monto: '12' }, { Monto: '$1,200.50' }, { Monto: 'abc' }, { Monto: '' }, { Monto: null }, { Monto: 'n/a' }]);
const fechas = table('Fechas', [{ Fecha: '2026-03-01' }, { Fecha: 'not a date' }, { Fecha: '' }]);
const muchos = (n: number) => table(`Muchos${n}`, Array.from({ length: n }, (_, i) => ({ g: i % 2 === 0 ? 'x' : 'y', v: `v${i}` })));

const cards: KqlCard[] = [
  { id: 'c1', title: 'Login con enlace', created: '2026-02-20', points: 5, list: 'Resuelto', priority: 'Alta' },
  { id: 'c2', title: 'Recuperar contraseña', created: '2026-03-02', points: 3, list: 'Resuelto', priority: 'Alta' },
  { id: 'c3', title: 'Kanban drag', created: '2026-03-05', points: 8, list: 'En curso', priority: 'Media' },
  { id: 'c4', title: 'Bug acordeón', created: '2026-03-09', points: null, list: 'En curso' },
];

const data: KqlData = {
  cards,
  tables: [datos, ventas, notas, sucia, fechas, muchos(60), muchos(50), muchos(201),
    table('Ancha', [Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`c${i}`, i]))]),
    table('Enorme', Array.from({ length: 60_000 }, (_, i) => ({ a: i, b: i }))),
  ],
};
const run = (q: string) => runKql(q, data, ctx);
const result = (q: string) => run(q)[0].result;
const cells = (q: string) => result(q).rows.map((r) => r.cells.join('/'));
const col = (q: string, i = 0) => result(q).rows.map((r) => r.cells[i]);
const fails = (q: string, re: RegExp) => assert.throws(() => run(q), (e: unknown) => e instanceof KqlError && re.test(e.message), `${q} -> expected ${re}`);

test('rownum: before and after order by, after where, in where / order by / group by', () => {
  assert.deepEqual(col('rows of "Datos" select rownum() as "n"'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(col('rows of "Datos" select rownum(0)'), ['0', '1', '2', '3', '4']);
  assert.deepEqual(col('rows of "Datos" select indice()'), ['1', '2', '3', '4', '5'], 'Spanish: indice');
  assert.deepEqual(cells('rows of "Datos" select Monto, rownum() as "n" order by Monto desc'), ['50/1', '40/2', '30/3', '20/4', '10/5'], 'the position follows order by');
  assert.deepEqual(cells('rows of "Datos" where Monto > 20 select Monto, rownum()'), ['30/1', '40/2', '50/3'], 'and renumbers after where');
  assert.deepEqual(col('rows of "Datos" where rownum() > 3 select Monto'), ['40', '50'], 'in where it is the position in the source');
  assert.deepEqual(col('rows of "Datos" select Monto order by rownum() desc'), ['50', '40', '30', '20', '10']);
  assert.deepEqual(result('rows of "Datos" group by rownum() count').rows.map((r) => r.labels[0]), ['1', '2', '3', '4', '5']);
  assert.deepEqual(col('rows of "Datos" select fill_down(rownum())'), ['1', '2', '3', '4', '5'], 'window functions nest');
  assert.deepEqual(col('cards select rownum() order by points desc limit 2'), ['1', '2']);
});

test('fill_down / fill_up with and without a partition', () => {
  assert.deepEqual(col('rows of "Datos" select fill_down(Cliente)'), ['A', 'A', 'B', 'B', 'B']);
  assert.deepEqual(col('rows of "Datos" select fill_down(Cliente, Region)'), ['A', 'A', 'B', 'B', 'A'], 'each region keeps its own last value');
  assert.deepEqual(col('rows of "Datos" select fill_up(Cliente)'), ['A', 'B', 'B', '', ''], 'nothing below: stays empty');
  assert.deepEqual(col('rows of "Datos" select fill_up(Cliente, Region)'), ['A', '', 'B', '', '']);
  assert.deepEqual(col('cards select fill_down(points) order by created'), ['5', '3', '8', '8']);
});

test('lag, lead, running_sum, running_count', () => {
  assert.deepEqual(col('rows of "Datos" select lag(Monto)'), ['', '10', '20', '30', '40']);
  assert.deepEqual(col('rows of "Datos" select lag(Monto, 2)'), ['', '', '10', '20', '30']);
  assert.deepEqual(col('rows of "Datos" select lead(Monto)'), ['20', '30', '40', '50', '']);
  assert.deepEqual(col('rows of "Datos" select lead(Monto, 9)'), ['', '', '', '', '']);
  assert.deepEqual(col('rows of "Datos" select running_sum(Monto)'), ['10', '30', '60', '100', '150']);
  assert.deepEqual(col('rows of "Datos" select cumsum(Monto)'), ['10', '30', '60', '100', '150']);
  assert.deepEqual(col('rows of "Datos" select running_count()'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(cells('rows of "Datos" select Monto, running_sum(Monto) order by Monto desc'), ['50/50', '40/90', '30/120', '20/140', '10/150'], 'running over the ordered rows');
  assert.deepEqual(col('rows of "Datos" select sub(Monto, lag(Monto))'), ['', '10', '10', '10', '10']);
  fails('rows of "Datos" where lag(Monto) > 1 select Monto', /needs "select" or "group by"/);
  fails('rows of "Datos" select Monto order by running_sum(Monto)', /needs "select" or "group by"/);
  assert.throws(() => filterCards('lag(Monto) > 1', [datos.rows[0]], ctx), /works over the ordered rows/);
});

test('tail / droplast compose with offset, limit, distinct and top', () => {
  const base = 'rows of "Datos" select Monto order by Monto';
  assert.deepEqual(col(`${base} tail 2`), ['40', '50']);
  assert.deepEqual(col(`${base} droplast 2`), ['10', '20', '30']);
  assert.deepEqual(col(`${base} offset 1 droplast 1`), ['20', '30', '40']);
  assert.deepEqual(col(`${base} limit 4 tail 2`), ['30', '40'], 'limit first, then tail');
  assert.deepEqual(col(`${base} offset 1 limit 3 tail 1`), ['40']);
  assert.deepEqual(col(`${base} tail 99`), ['10', '20', '30', '40', '50']);
  assert.deepEqual(col(`${base} droplast 99`), []);
  assert.deepEqual(col('rows of "Datos" select Monto top 4 by Monto tail 2'), ['30', '20']);
  assert.deepEqual(col('rows of "Datos" select distinct Region order by Region droplast 1'), ['N']);
  assert.deepEqual(col('rows of "Datos" select distinct Region order by Region tail 1'), ['S']);
  assert.deepEqual(result('rows of "Datos" group by Region count order by key tail 1').rows.map((r) => r.labels[0]), ['S']);
  assert.deepEqual(col(`${base} cola 2`), ['40', '50'], 'Spanish: cola');
  assert.deepEqual(col(`${base} quitarultimas 2`), ['10', '20', '30'], 'Spanish: quitarultimas');
  assert.deepEqual(col('rows of "Datos" select Monto, rownum() order by Monto droplast 3'), ['10', '20'], 'row numbers see the whole table first');
  fails(`${base} tail 0`, /whole number/);
  fails(`${base} droplast -1`, /whole number/);
});

test('pivot: sum, count, avg, missing combinations, order, Spanish', () => {
  const r = result('rows of "Ventas" group by Responsable pivot Estado sum(Monto)');
  assert.deepEqual(r.columns.map((c) => c.label), ['Responsable', 'Pagado', 'Pendiente']);
  assert.deepEqual(r.rows.map((x) => x.cells.join('/')), ['Ana/120/50', 'Luis/40/0']);
  assert.deepEqual(r.rows[1].values, [40, 0], 'a missing sum is 0');
  assert.deepEqual(cells('rows of "Ventas" group by Responsable pivot Estado count'), ['Ana/2/1', 'Luis/2/0']);
  assert.deepEqual(cells('rows of "Ventas" group by Responsable pivot Estado avg(Monto)'), ['Ana/60/50', 'Luis/20/'], 'a missing average is empty');
  assert.deepEqual(cells('rows of "Ventas" group by Responsable pivot Estado sum(Monto) order by key desc'), ['Luis/40/0', 'Ana/120/50']);
  assert.deepEqual(cells('rows of "Ventas" group by Responsable pivot Estado sum(Monto) limit 1'), ['Ana/120/50']);
  assert.deepEqual(cells('rows of "Ventas" agrupar por Responsable pivotar Estado sum(Monto)'), ['Ana/120/50', 'Luis/40/0']);
  assert.equal(result('rows of "Ventas" group by Responsable pivot Estado sum(Monto)').shape, 'table');
  assert.deepEqual(cells('cards group by list pivot priority count'), ['En curso/0/1/1', 'Resuelto/2/0/0']);
  assert.deepEqual(cells('rows of "Ventas" where Estado = "Pagado" group by Responsable pivot Estado sum(Monto)'), ['Ana/120', 'Luis/40']);
  fails('rows of "Ventas" group by Responsable pivot Estado sum(Monto) having count > 1', /cannot be combined with "pivot"/);
  fails('rows of "Ventas" group by Responsable pivot Estado sum(Monto), count', /exactly one metric/);
  fails('rows of "Ventas" pivot Estado count', /needs "group by" first/);
  fails('rows of "Ventas" group by Responsable pivot Estado sum(Monto) order by sum(Monto)', /"key" or "label" only/);
  fails('rows of "Ventas" select Monto group by Responsable', /cannot be combined/);
  fails('rows of "Ventas" group by Responsable pivt Estado count', /Unexpected "pivt"\. Did you mean "pivot"\?/);
});

test('pivot: at most 50 columns', () => {
  assert.equal(result('rows of "Muchos50" group by g pivot v count').columns.length, 51, '50 values are fine');
  fails('rows of "Muchos60" group by g pivot v count', /would create 60 columns \(max 50\)/);
});

test('unpivot: explicit list, except, defaults, filters, cards', () => {
  const r = result('rows of "Notas" unpivot Q1, Q2, Q3 as "Trimestre", "Nota"');
  assert.deepEqual(r.columns.map((c) => c.label), ['Cliente', 'Trimestre', 'Nota']);
  assert.deepEqual(r.rows.map((x) => x.cells.join('/')), ['A/Q1/5', 'A/Q2/6', 'A/Q3/7', 'B/Q1/8', 'B/Q2/', 'B/Q3/9']);
  assert.deepEqual(result('rows of "Notas" unpivot Q1, Q2').columns.map((c) => c.label), ['Cliente', 'Q3', 'Attribute', 'Value'], 'defaults; the other columns stay');
  assert.deepEqual(result('rows of "Notas" unpivot except Cliente').columns.map((c) => c.label), ['Cliente', 'Attribute', 'Value']);
  assert.deepEqual(cells('rows of "Notas" unpivot except Cliente as "T", "N" where N > 5 select Cliente, T, N'), ['A/Q2/6', 'A/Q3/7', 'B/Q1/8', 'B/Q3/9']);
  assert.deepEqual(result('rows of "Notas" unpivot Q1, Q2, Q3 as "T", "N" group by T sum(N)').rows.map((x) => [...x.labels, ...x.values].join('|')), ['Q3|16', 'Q1|13', 'Q2|6']);
  assert.deepEqual(cells('rows of "Notas" despivotar Q1 as "T", "N" select Cliente, N'), ['A/5', 'B/8'], 'Spanish: despivotar');
  assert.deepEqual(cells('let largo = rows of "Notas" unpivot Q1, Q2 as "T", "N"\nfrom largo where N > 5 select Cliente, T'), ['A/Q2', 'B/Q1'], 'works with let');
  assert.deepEqual(cells('cards unpivot points, comments as "K", "V" where title = "Kanban drag" select title, K, V'), ['Kanban drag/points/8', 'Kanban drag/comments/']);
  fails('cards unpivot except title count', /needs a table source/);
  fails('rows of "Notas" unpivot Q9 count', /Unknown column "Q9"/);
  fails('rows of "Notas" unpivot Q1 as', /Expected a column name/);
  fails('rows of "Enorme" unpivot a, b count', /more than 100000 rows/);
});

test('transpose: with and without header, caps', () => {
  const pivoted = 'rows of "Ventas" group by Responsable pivot Estado sum(Monto)';
  const plain = result(`${pivoted} transpose`);
  assert.deepEqual(plain.columns.map((c) => c.label), ['Field', 'Column1', 'Column2']);
  assert.deepEqual(plain.rows.map((r) => r.cells.join('/')), ['Responsable/Ana/Luis', 'Pagado/120/40', 'Pendiente/50/0']);
  const header = result(`${pivoted} transpose header`);
  assert.deepEqual(header.columns.map((c) => c.label), ['Field', 'Ana', 'Luis']);
  assert.deepEqual(header.rows.map((r) => r.cells.join('/')), ['Pagado/120/40', 'Pendiente/50/0']);
  assert.deepEqual(cells(`${pivoted} transponer encabezado`), ['Pagado/120/40', 'Pendiente/50/0'], 'Spanish: transponer encabezado');
  const sel = result('cards select title, points limit 2 transpose header');
  assert.deepEqual(sel.columns.map((c) => c.label), ['Field', 'Login con enlace', 'Recuperar contraseña']);
  assert.deepEqual(sel.rows.map((r) => r.cells.join('/')), ['points/5/3']);
  assert.ok(sel.columns.every((c) => c.kind === 'text'));
  fails('rows of "Muchos201" select title transpose', /at most 200 rows \(this has 201\)/);
  const cols = Array.from({ length: 51 }, (_, i) => `c${i}`).join(', ');
  fails(`rows of "Ancha" select ${cols} transpose`, /at most 50 columns \(this has 51\)/);
  assert.equal(result('rows of "Muchos201" select title limit 200 transpose').columns.length, 201, 'limit brings it under the cap');
});

test('iserror / try on number, date, round and arithmetic; blank is never an error', () => {
  assert.deepEqual(cells('rows of "Sucia" select Monto, iserror(number(Monto)) as "e"'), ['12/false', '$1,200.50/false', 'abc/true', '/false', '/false', 'n/a/true']);
  assert.deepEqual(col('rows of "Sucia" select try(number(Monto), 0)'), ['12', '1200.5', '0', '', '', '0']);
  assert.deepEqual(result('rows of "Sucia" where not iserror(number(Monto)) count').rows[0].values, [4]);
  assert.deepEqual(result('rows of "Sucia" where iserror(number(Monto)) count').rows[0].values, [2]);
  assert.deepEqual(result('rows of "Sucia" sum(try(number(Monto), 0))').rows[0].values, [1212.5]);
  assert.deepEqual(result('rows of "Sucia" where iserror(round(number(Monto), 1)) count').rows[0].values, [2], 'errors propagate through nested calls');
  assert.deepEqual(result('rows of "Sucia" where iserror(add(Monto, 1)) count').rows[0].values, [2], 'arithmetic on text');
  assert.deepEqual(result('rows of "Sucia" where iserror(Monto) count').rows[0].values, [0], 'a plain field is never an error');
  assert.deepEqual(col('rows of "Sucia" select number(Monto)'), ['12', '1200.5', '', '', '', ''], 'number() still returns null for text');
  assert.deepEqual(col('rows of "Fechas" select iserror(date(Fecha, "yyyy"))'), ['false', 'true', 'false']);
  assert.deepEqual(col('rows of "Fechas" select try(date(Fecha, "yyyy"), "n/a")'), ['2026', 'n/a', '']);
  assert.deepEqual(col('rows of "Fechas" select iserror(weekday(Fecha))'), ['false', 'true', 'false']);
  fails('rows of "Sucia" select iserror(1, 2)', /iserror\(\) takes 1 argument, not 2/);
  fails('rows of "Sucia" select try(number(Monto))', /try\(\) takes 2 arguments, not 1/);
});

test('cellErrors and classifyCell use the same rule as iserror', () => {
  assert.deepEqual(cellErrors(sucia.rows, 'Monto'), { valid: 2, error: 2, empty: 2, total: 6, errorRows: ['s3', 's6'] });
  assert.deepEqual(cellErrors(sucia.rows, 'monto').error, 2, 'column names ignore case');
  assert.deepEqual(cellErrors(fechas.rows, 'Fecha', 'date'), { valid: 1, error: 1, empty: 1, total: 3, errorRows: ['f2'] });
  assert.deepEqual(cellErrors(sucia.rows, 'Monto', (raw) => (/^\d+$/.test(raw) ? 1 : null)), { valid: 1, error: 3, empty: 2, total: 6, errorRows: ['s2', 's3', 's6'] });
  assert.equal(cellErrors(sucia.rows, 'Monto').error, result('rows of "Sucia" where iserror(number(Monto)) count').rows[0].values[0]);
  assert.equal(classifyCell('  '), 'empty');
  assert.equal(classifyCell(null), 'empty');
  assert.equal(classifyCell([]), 'empty');
  assert.equal(classifyCell(0), 'valid');
  assert.equal(classifyCell('x'), 'error');
  assert.equal(classifyCell('2026-01-01', 'date'), 'valid');
});

test('names, limits and the guide', () => {
  fails('rows of "Datos" select runing_sum(Monto)', /Unknown function "runing_sum"\. Did you mean "running_sum"\?/);
  fails('rows of "Datos" select fill_dwn(Cliente)', /Did you mean "fill_down"\?/);
  fails('rows of "Datos" select Monto transpse', /Unexpected "transpse"\. Did you mean "transpose"\?/);
  fails('rows of "Datos" select lag()', /lag\(\) takes 1 to 2 arguments, not 0/);
  fails('rows of "Datos" select rownum(1, 2)', /rownum\(\) takes 0 to 1 argument, not 2/);
  assert.deepEqual(col('rows of "Datos" select lag(Monto, -5)'), ['10', '20', '30', '40', '50'], 'a negative step counts as 0');
  assert.equal(col('rows of "Datos" select rownum(1000000000)')[0], '1000000000');
  const big = Array.from({ length: 20_000 }, (_, i): KqlCard => ({ id: `b${i}`, title: `t${i}`, points: i }));
  const t0 = Date.now();
  const out = runKql('cards select rownum(), fill_down(points), lag(points), running_sum(points) order by points desc tail 3', big, ctx);
  assert.equal(out[0].result.rows.length, 3);
  assert.ok(Date.now() - t0 < 5000, 'window functions are linear');
  for (const word of ['rownum', 'fill_down', 'lag(', 'running_sum', 'tail N', 'droplast', 'pivot', 'unpivot', 'transpose', 'iserror', 'try(', 'pivotar', 'despivotar', 'transponer', 'indice', 'cola']) {
    assert.ok(KQL_SYNTAX_GUIDE.includes(word), `the guide does not mention ${word}`);
  }
  for (const line of KQL_SYNTAX_GUIDE.split('\n')) assert.ok(line.length <= 175, `guide line too long (${line.length}): ${line.slice(0, 60)}`);
});

test('declared columns: an empty source or table still validates its columns', () => {
  const empty: KqlData = {
    sources: { comments: [], timers: [{ id: 't1', title: 't', fields: { minutes: 3 } }] },
    columns: { comments: ['text', 'author', 'card'], timers: ['minutes', 'card'] },
    tables: [{ id: 'e1', title: 'Vacia', kind: 'table', columns: ['Cliente', 'Monto'], rows: [] }],
  };
  const go = (q: string) => runKql(q, empty, ctx)[0].result;
  const r = go('comments select text, author limit 5');
  assert.deepEqual(r.rows, []);
  assert.deepEqual(r.columns.map((c) => c.label), ['text', 'author']);
  assert.deepEqual(go('comments where author = "ana" select text').rows, []);
  assert.deepEqual(go('comments group by author count').rows, []);
  assert.deepEqual(go('comments count').rows[0].values, [0]);
  assert.deepEqual(go('rows of "Vacia" select Cliente, Monto').columns.map((c) => c.label), ['Cliente', 'Monto']);
  assert.deepEqual(go('rows of "Vacia" group by Cliente sum(Monto)').rows, []);
  assert.deepEqual(go('timers select card, minutes').rows.map((x) => x.cells.join('/')), ['/3'], 'a declared column no record has is empty, not an error');
  assert.deepEqual(go('let c = comments where author = "x"\nfrom c select text').columns.map((x) => x.label), ['text']);
  assert.throws(() => go('comments select txt'), (e: unknown) => e instanceof KqlError && /Unknown column "txt"\. Did you mean "text"\? Available: text, author, card/.test(e.message));
  assert.throws(() => go('rows of "Vacia" select Clientes'), /Unknown column "Clientes"\. Did you mean "Cliente"\?/);
  assert.throws(() => runKql('comments select text', { sources: { comments: [] } }, ctx), /Unknown field|Unknown column "text"/, 'without declared columns an empty source cannot know them');
  const cardsEmpty = runKql('cards select title, checklist_total where checklist_total > 2', { cards: [], columns: { cards: ['title', 'checklist_total'] } }, ctx)[0].result;
  assert.deepEqual(cardsEmpty.columns.map((c) => c.label), ['title', 'checklist_total']);
});

test('select *: tables, empty tables, except, extra expressions, clauses, let, union, transpose, Spanish', () => {
  const labels = (q: string) => result(q).columns.map((c) => c.label);
  assert.deepEqual(labels('rows of "Ventas" select * limit 2'), ['Responsable', 'Estado', 'Monto']);
  assert.deepEqual(cells('rows of "Ventas" select * limit 2'), ['Ana/Pagado/100', 'Ana/Pendiente/50']);
  assert.deepEqual(labels('rows of "Ventas" select * except (Estado, Monto)'), ['Responsable']);
  assert.deepEqual(labels('rows of "Ventas" select * except Estado limit 1'), ['Responsable', 'Monto']);
  assert.deepEqual(labels('rows of "Ventas" select *, upper(Responsable) as "R", rownum() limit 1'), ['Responsable', 'Estado', 'Monto', 'R', 'rownum()']);
  assert.deepEqual(cells('rows of "Ventas" select *, upper(Responsable) as "R", rownum() limit 1'), ['Ana/Pagado/100/ANA/1']);
  assert.deepEqual(cells('rows of "Ventas" where Monto > 20 select * order by Monto desc offset 1 limit 2').map((c) => c.split('/')[2]), ['50', '30']);
  assert.deepEqual(cells('rows of "Ventas" select * tail 1'), ['Luis/Pagado/10']);
  assert.equal(result('rows of "Ventas" select * droplast 4').rows.length, 1);
  assert.deepEqual(labels('let v = rows of "Ventas" where Estado = "Pagado"\nfrom v select * limit 1'), ['Responsable', 'Estado', 'Monto']);
  assert.deepEqual(labels('rows of "Ventas" seleccionar * limit 1'), ['Responsable', 'Estado', 'Monto'], 'Spanish alias');
  assert.deepEqual(result('rows of "Ventas" select * limit 2 transpose header').rows.map((r) => r.cells[0]), ['Estado', 'Monto']);
  assert.equal(result('rows of "Ventas" where Responsable ~ /A.*/ count').rows[0].values[0], 3, 'a * inside a regex is untouched');

  const local: KqlData = {
    tables: [
      { id: 'e', title: 'Vacia', kind: 'table', columns: ['A', 'B'], rows: [] },
      { id: 'd', title: 'Dup', kind: 'table', columns: ['A'], rows: [{ id: '1', title: '1', fields: { A: 1 } }, { id: '2', title: '2', fields: { A: 1 } }, { id: '3', title: '3', fields: { A: 2 } }] },
    ],
    sources: { sa: [{ id: 'a1', title: 'A', fields: { x: 1 } }], sb: [{ id: 'b1', title: 'B', fields: { y: 2 } }], vacio: [] },
    columns: { sa: ['x'], sb: ['y'], vacio: ['text', 'author'] },
  };
  const go = (q: string) => runKql(q, local, ctx)[0].result;
  const empty = go('rows of "Vacia" select *');
  assert.deepEqual(empty.columns.map((c) => c.label), ['A', 'B']);
  assert.deepEqual(empty.rows, [], 'an empty table keeps its headers');
  assert.equal(go('rows of "Dup" select distinct *').rows.length, 2);
  assert.deepEqual(go('vacio select *').columns.map((c) => c.label), ['title', 'text', 'author'], 'named sources: title + declared columns');
  assert.deepEqual(go('from sa union sb select *').columns.map((c) => c.label), ['title', 'x', 'y']);
  assert.deepEqual(go('from sa union sb select * except title').rows.map((r) => r.cells.join('/')), ['1/', '/2']);
});

test('select *: cards and joined aliases', () => {
  const labels = (q: string) => result(q).columns.map((c) => c.label);
  const star = ['title', 'list', 'board', 'assignee', 'tag', 'priority', 'due', 'start', 'created', 'updated', 'done', 'points', 'comments', 'progress'];
  assert.deepEqual(labels('cards select * limit 1'), star);
  assert.equal(result('cards select * limit 1').rows[0].cells[0], 'Login con enlace');
  assert.deepEqual(labels('cards select * except (start, created, updated, comments, progress, board)'), ['title', 'list', 'assignee', 'tag', 'priority', 'due', 'done', 'points']);
  const joined: KqlData = {
    cards: [{ id: 'c1', title: 'T', list: 'L', assignees: ['ana'] }],
    sources: { members: [{ id: 'ana', title: 'Ana', fields: { role: 'dev' } }] },
  };
  const go = (q: string) => runKql(q, joined, ctx)[0].result;
  assert.deepEqual(go('cards join members on assignee = id select members.*').columns.map((c) => c.label), ['members.id', 'members.title', 'members.role']);
  assert.deepEqual(go('cards join members on assignee = id select members.* except title').columns.map((c) => c.label), ['members.id', 'members.role']);
  assert.deepEqual(go('cards join members on assignee = id select *, members.role').columns.map((c) => c.label), [...star, 'members.role'], 'left columns, then the extra ones');
  assert.deepEqual(go('cards join members on assignee = id select members.role, *').columns.map((c) => c.label).slice(0, 2), ['members.role', 'title']);
  assert.deepEqual(go('cards join members as m on assignee = id select m.* except (id, title)').rows[0].cells, ['dev']);
  assert.throws(() => go('cards select nada.*'), /"nada\.\*" needs a joined source/);
  assert.throws(() => go('cards join members on assignee = id select zz.*'), /Joined: members/);
});

test('count(*) and the places where * is not allowed', () => {
  assert.deepEqual(result('rows of "Ventas" count(*)').rows[0].values, [5]);
  assert.deepEqual(result('rows of "Ventas" group by Responsable count(*)').rows.map((r) => [...r.labels, ...r.values].join('|')), ['Ana|3', 'Luis|2']);
  assert.equal(result('rows of "Ventas" group by Responsable count(*)').columns[1].label, 'count');
  const only = /"\*" only works in select and in count\(\*\)/;
  fails('rows of "Ventas" group by *', only);
  fails('rows of "Ventas" sum(*)', only);
  fails('rows of "Ventas" where * = 1', only);
  fails('rows of "Ventas" where Monto = *', only);
  fails('rows of "Ventas" select upper(*)', only);
  fails('rows of "Ventas" select Monto order by *', only);
  assert.deepEqual(col('rows of "Ventas" select Monto * 2 limit 2'), ['200', '100'], 'between two values * multiplies');
});

test('the guide documents select *', () => {
  assert.ok(KQL_SYNTAX_GUIDE.includes('select *') && KQL_SYNTAX_GUIDE.includes('count(*)') && KQL_SYNTAX_GUIDE.includes('except'));
});
