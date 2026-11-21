import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KQL_FUNCTIONS,
  KQL_FUNCTION_CATALOG,
  KQL_M_ALIASES,
  KQL_SYNTAX_GUIDE,
  KqlError,
  describeKqlDeclarations,
  describeKqlSources,
  parseKqlScript,
  runKql,
  type KqlCard,
  type KqlContext,
  type KqlData,
  type KqlTable,
} from './kql.ts';

const ctx: KqlContext = { now: new Date('2026-03-18T12:00:00Z'), me: 'ana', users: [{ id: 'ana', name: 'Ana' }] };

const table = (title: string, rows: Array<Record<string, string | number | boolean | null>>): KqlTable => ({
  id: `t-${title}`,
  title,
  kind: 'table',
  columns: [...new Set(rows.flatMap((r) => Object.keys(r)))],
  rows: rows.map((fields, i): KqlCard => ({ id: `${title[0].toLowerCase()}${i + 1}`, title: String(Object.values(fields)[0] ?? ''), fields })),
});

const cards: KqlCard[] = [
  { id: 'c1', title: 'Login', list: 'A', done: true, priority: 'High', created: '2026-03-10', points: 5, tags: ['x', 'y'], assignees: ['ana'] },
  { id: 'c2', title: 'Logout', list: 'A', priority: 'Low', created: '2026-02-01', points: 3, tags: ['x'] },
  { id: 'c3', title: 'Kanban', list: 'B', priority: 'High', created: '2026-03-12', points: 8, tags: [] },
];
const data: KqlData = {
  cards,
  tables: [
    table('Ventas', [
      { Cliente: 'A', Responsable: 'Ana', Monto: 100, Cantidad: 2, Costo: 60, Texto: '12' },
      { Cliente: 'B', Responsable: 'Luis', Monto: 50, Cantidad: 1, Costo: 70, Texto: '$1,200.50' },
      { Cliente: 'C', Responsable: 'Ana', Monto: 30, Cantidad: 3, Costo: 10, Texto: 'abc' },
    ]),
    table('Tipos', [{ Valor: '12.7', Fecha: '2026-03-01' }, { Valor: 'abc', Fecha: 'xx' }, { Valor: '', Fecha: '' }, { Valor: null, Fecha: null }, { Valor: 'true', Fecha: '2026-03-02' }, { Valor: '2026-03-01', Fecha: '2026-03-03' }]),
  ],
  sources: { members: [{ id: 'ana', title: 'Ana', fields: { role: 'dev', upper: 'U' } }] },
};
const run = (q: string) => runKql(q, data, ctx);
const result = (q: string) => run(q)[0].result;
const col = (q: string, i = 0) => result(q).rows.map((r) => r.cells[i]);
const cells = (q: string) => result(q).rows.map((r) => r.cells.join('/'));
const num = (q: string) => result(q).rows[0].values[0];
const fails = (q: string, re: RegExp) => assert.throws(() => run(q), (e: unknown) => e instanceof KqlError && re.test(e.message), `${q} -> expected ${re}`);
const V = 'rows of "Ventas"';

test('arithmetic: precedence, parentheses, unary minus, % and division by zero', () => {
  assert.deepEqual(col(`${V} select Monto * 1.18 as "x"`), ['118', '59', '35.4']);
  assert.deepEqual(col(`${V} select 2 + 3 * 4 limit 1`), ['14']);
  assert.deepEqual(col(`${V} select (2 + 3) * 4 limit 1`), ['20']);
  assert.deepEqual(col(`${V} select 10 - 4 - 3 limit 1`), ['3'], 'left to right');
  assert.deepEqual(col(`${V} select 100 / 5 / 2 limit 1`), ['10']);
  assert.deepEqual(col(`${V} select -Monto`), ['-100', '-50', '-30']);
  assert.deepEqual(col(`${V} select 10 - -3 limit 1`), ['13']);
  assert.deepEqual(col(`${V} select -(Monto - 10) limit 1`), ['-90']);
  assert.deepEqual(col(`${V} select Monto % 7`), ['2', '1', '2']);
  assert.deepEqual(col(`${V} select Monto / 0`), ['', '', ''], 'division by zero is empty');
  assert.deepEqual(col(`${V} select Monto -1 limit 1`), ['99'], 'a glued sign still subtracts');
  assert.deepEqual(col(`${V} select Monto * Cantidad + Costo limit 1`), ['260']);
  assert.equal(result(`${V} select Monto * 2`).columns[0].label, 'Monto * 2', 'the label shows the expression');
  assert.equal(result(`${V} select (Monto + 1) * 2`).columns[0].label, '(Monto + 1) * 2');
});

test('arithmetic everywhere: where, group by, metrics, order by, arguments', () => {
  assert.equal(num(`${V} where Monto - Costo > 10 count`), 2);
  assert.equal(num(`${V} where (Monto - Costo) > 10 count`), 2, 'parentheses before the comparison');
  assert.equal(num(`${V} where Monto > Costo * 2 count`), 1, 'an expression on the right');
  assert.equal(num(`${V} where Monto between Costo * 1 and Costo * 2 count`), 1);
  assert.equal(num(`${V} where (Monto > 40 and Costo < 65) count`), 1, 'a group of conditions still works');
  assert.deepEqual(result(`${V} group by Cantidad * 2 count`).rows.map((r) => r.labels[0]), ['2', '4', '6']);
  assert.equal(num(`${V} sum(Monto * Cantidad)`), 340);
  assert.deepEqual(col(`${V} select Cliente order by Monto * Cantidad desc`), ['A', 'C', 'B']);
  assert.deepEqual(col(`${V} select round(Monto / 3, 1) limit 1`), ['33.3']);
  assert.deepEqual(col(`${V} select max2(Monto - Costo, 0)`), ['40', '0', '20']);
  assert.deepEqual(col(`${V} select upper(Cliente) & "-" & Responsable`), ['A-Ana', 'B-Luis', 'C-Ana']);
  assert.deepEqual(col(`${V} select Cliente & Monto + 1 limit 1`), ['A101'], '& binds looser than +');
});

test('arithmetic on text and lists, and * as the star', () => {
  assert.deepEqual(col(`${V} select Texto + 1`), ['13', '1201.5', ''], 'loose numbers; unreadable text is an error cell');
  assert.deepEqual(col(`${V} select iserror(Texto + 1)`), ['false', 'false', 'true']);
  assert.deepEqual(col(`${V} select try(Texto * 2, 0)`), ['24', '2401', '0']);
  assert.throws(() => run('cards select tag + 1'), /needs numbers, not a list/);
  assert.throws(() => run('cards select -tag'), /needs numbers, not a list/);
  assert.deepEqual(result(`${V} select *, Monto * 2 as "d" limit 1`).columns.map((c) => c.label), ['Cliente', 'Responsable', 'Monto', 'Cantidad', 'Costo', 'Texto', 'd']);
  assert.deepEqual(result(`${V} count(*)`).rows[0].values, [3]);
  assert.deepEqual(col(`${V} select * except (Texto, Costo) limit 1`, 2), ['100']);
});

test('type functions: text, int / whole, decimal, bool, datetime, typeof and the error rule', () => {
  const T = 'rows of "Tipos"';
  assert.deepEqual(col(`${T} select text(Valor)`), ['12.7', 'abc', '', '', 'true', '2026-03-01']);
  assert.deepEqual(col(`${T} select int(Valor)`), ['13', '', '', '', '', '']);
  assert.deepEqual(col(`${T} select whole(Valor)`), ['13', '', '', '', '', ''], 'whole = int');
  assert.deepEqual(col(`${T} select decimal(Valor)`), ['12.7', '', '', '', '', ''], 'decimal = number');
  assert.deepEqual(col(`${T} select bool(Valor)`), ['', '', '', '', 'true', '']);
  assert.deepEqual(col(`${T} select iserror(bool(Valor))`), ['true', 'true', 'false', 'false', 'false', 'true']);
  assert.deepEqual(col(`${T} select iserror(int(Valor))`), ['false', 'true', 'false', 'false', 'true', 'true']);
  assert.deepEqual(col(`${T} select try(int(Valor), -1)`), ['13', '-1', '', '', '-1', '-1']);
  assert.deepEqual(col(`${T} select datetime(Fecha)`), ['2026-03-01T00:00:00.000Z', '', '', '', '2026-03-02T00:00:00.000Z', '2026-03-03T00:00:00.000Z']);
  assert.deepEqual(col(`${T} select iserror(datetime(Fecha))`), ['false', 'true', 'false', 'false', 'false', 'false']);
  assert.deepEqual(col(`${T} select typeof(Valor)`), ['text', 'text', 'null', 'null', 'text', 'date']);
  assert.deepEqual(col(`${V} select typeof(Monto) limit 1`), ['number']);
  assert.deepEqual(col('cards select typeof(tag) limit 1'), ['list']);
  assert.deepEqual(col(`${V} select typeof(true) limit 1`), ['bool']);
  assert.deepEqual(col(`${V} select bool("yes"), bool(1), bool("no"), bool(0) limit 1`, 1), ['true']);
  assert.deepEqual(col(`${V} select text(Monto) & "!" limit 1`), ['100!']);
});

test('parameters: in expressions, comparisons and clause arguments', () => {
  assert.equal(num(`param minimo = 50\n${V} where Monto >= $minimo count`), 2);
  assert.equal(num(`param estado = "B"\n${V} where Cliente = $estado count`), 1);
  assert.equal(num(`param a = "A"\nparam b = "C"\n${V} where Cliente in ($a, $b) count`), 2);
  assert.deepEqual(col(`param factor = 1.5\n${V} select Monto * $factor limit 1`), ['150']);
  assert.deepEqual(col(`param base = 10 * 5\n${V} select $base + 1 limit 1`), ['51'], 'a constant expression');
  assert.equal(num(`param corte = addDays(today, -10)\ncards where created > $corte count`), 2);
  assert.equal(num('param d = -30d\ncards where created > $d count'), 2);
  assert.deepEqual(col(`param n = 2\n${V} select Cliente limit $n`), ['A', 'B']);
  assert.deepEqual(col(`param n = 1\n${V} select Cliente order by Cliente offset $n limit 1`), ['B']);
  assert.deepEqual(col(`param n = 2\n${V} select Cliente top $n by Monto`), ['A', 'B']);
  assert.deepEqual(col(`param n = 1\n${V} select Cliente order by Cliente tail $n`), ['C']);
  assert.deepEqual(col(`param n = 1\n${V} select Cliente order by Cliente droplast $n`), ['A', 'B']);
  assert.deepEqual(col(`parametro minimo = 50\n${V} donde Monto >= $minimo seleccionar Cliente`), ['A', 'B'], 'Spanish: parametro');
  assert.deepEqual(describeKqlDeclarations('param minimo = 100\nparam estado = "Pagado"\nfn conigv(x) = x * 1.18'), {
    params: [{ name: 'minimo', value: '100' }, { name: 'estado', value: '"Pagado"' }],
    functions: [{ name: 'conigv', args: ['x'], body: 'x * 1.18' }],
  });
  fails('param minimo = 1\ncards where points > $minmo', /Unknown parameter "\$minmo"\. Did you mean "\$minimo"\?/);
  fails('cards where points > $nada', /Unknown parameter "\$nada"\. Declare it first/);
  fails('param p = Monto\ncards count', /must be a constant/);
  fails('param p = 1\nparam p = 2\ncards count', /already declared/);
  fails('param n = "x"\ncards limit $n', /must hold a number/);
  fails('param p = 1', /declares parameters \/ functions but has no query/);
  fails(`${Array.from({ length: 21 }, (_, i) => `param p${i} = ${i}`).join('\n')}\ncards count`, /at most 20 parameters/);
});

test('user functions: expansion, nesting, limits and errors', () => {
  assert.deepEqual(col(`fn conigv(x) = x * 1.18\n${V} select conigv(Monto) limit 1`), ['118']);
  assert.deepEqual(col(`fn bucket(m, corte) = if(m > corte, "alto", "bajo")\n${V} select bucket(Monto, 60)`), ['alto', 'bajo', 'bajo']);
  assert.deepEqual(col(`fn bucket(m) = if m > 60 then "alto" else "bajo"\n${V} select bucket(Monto * 2)`), ['alto', 'alto', 'bajo']);
  assert.deepEqual(col(`fn a(x) = x + 1\nfn b(x) = a(x) * 2\n${V} select b(Monto) limit 1`), ['202'], 'a function may call earlier ones');
  assert.deepEqual(col(`param k = 3\nfn f(x) = x * $k\n${V} select f(Cantidad)`), ['6', '3', '9'], 'a body may use parameters');
  assert.equal(num(`fn conigv(x) = x * 1.18\n${V} where conigv(Monto) > 100 count`), 1);
  assert.deepEqual(col(`fn doble(x) = x * 2\n${V} select doble(doble(Cantidad)) limit 1`), ['8']);
  assert.deepEqual(col(`fn ok(t) = isnull(t)\n${V} select ok(Texto) limit 1`), ['false']);
  assert.deepEqual(col(`fn etiqueta(t, n) = left(upper(t), n) & "!"\n${V} select etiqueta(Responsable, 2) limit 1`), ['AN!']);
  assert.deepEqual(col(`funcion doble(x) = x * 2\n${V} select doble(Monto) limit 1`), ['200'], 'Spanish: funcion');
  assert.equal(result(`fn conigv(x) = x * 1.18\n${V} select conigv(Monto)`).columns[0].label, 'Monto * 1.18', 'it is expanded, so the label shows the body');
  fails('fn f(x) = f(x)\ncards count', /"f" calls itself: recursion is not allowed/);
  fails('fn a(x) = b(x)\nfn b(x) = x\ncards count', /Unknown function "b"/);
  fails('fn lower(x) = x\ncards count', /"lower" is a built-in name; a function cannot reuse it\. Try "my_lower"/);
  fails('fn sum(x) = x\ncards count', /built-in name/);
  fails('fn f(x) = x\nfn f(y) = y\ncards count', /already declared/);
  fails('fn f(x, x) = x\ncards count', /is repeated/);
  fails('fn f(x) = x\ncards select f(1, 2)', /f\(\) takes 1 argument \(x\), not 2/);
  fails('fn doble(x) = x\ncards select doblee(1)', /Unknown function "doblee"\. Did you mean "doble"\?/);
  fails(`fn big(x) = ${Array.from({ length: 200 }, () => 'x').join(' + ')}\ncards count`, /too long \(max 500 characters\)/);
  fails(`${Array.from({ length: 21 }, (_, i) => `fn f${i}(x) = x`).join('\n')}\ncards count`, /at most 20 functions/);
  const chain = (n: number) => ['fn f1(x) = x + 1', ...Array.from({ length: n - 1 }, (_, i) => `fn f${i + 2}(x) = f${i + 1}(x) + 1`)].join('\n');
  assert.deepEqual(col(`${chain(8)}\n${V} select f8(Monto) limit 1`), ['108'], 'depth 8 is fine');
  fails(`${chain(9)}\ncards count`, /more than 8 levels deep/);
  const fat = 'fn g1(x) = x + x + x + x\n' + Array.from({ length: 5 }, (_, i) => `fn g${i + 2}(x) = g${i + 1}(x) + g${i + 1}(x) + g${i + 1}(x) + g${i + 1}(x)`).join('\n');
  fails(`${fat}\ncards select g6(points)`, /expands to too much/);
});

test('inline tables: values (...) (...)', () => {
  const r = result('from values ("Cliente", "Monto") ("ACME", 120) ("Beta", 80) select *');
  assert.deepEqual(r.columns.map((c) => c.label), ['Cliente', 'Monto']);
  assert.deepEqual(r.rows.map((x) => x.cells.join('/')), ['ACME/120', 'Beta/80']);
  assert.equal(num('from values ("Cliente", "Monto") ("ACME", 120) ("Beta", 80) sum(Monto)'), 200, 'numbers are inferred per column');
  assert.deepEqual(col('values ("a") (1) ("x") select a'), ['1', 'x'], 'a mixed column is text');
  assert.deepEqual(col('values ("a", "b", "c") (null, true, 2026-01-01) select typeof(a), typeof(b), typeof(c)', 1), ['bool']);
  assert.deepEqual(result('values ("a", "b", "c") (null, true, 2026-01-01) select typeof(a), typeof(c)').rows[0].cells, ['null', 'date']);
  assert.equal(num('from values ("A", "B")\n("x", 1)\n("y", 2) count'), 2, 'groups may sit on their own lines');
  assert.equal(num('from values (\n"A",\n"B"\n)\n(\n"x", 1\n) count'), 1);
  assert.equal(num('valores ("a") (1) (2) count'), 2, 'Spanish: valores');
  assert.deepEqual(cells('from values ("A") ("x") ("y") where A = "y" select *'), ['y']);
  assert.deepEqual(cells('let t = values ("x", "y") (1, 2) (3, 4)\nfrom t select *'), ['1/2', '3/4']);
  assert.deepEqual(cells('from values ("a") (1) union values ("a") (2) select a'), ['1', '2'], 'as a union source');
  assert.deepEqual(cells('cards join values ("code", "name") ("c1", "Uno") ("c3", "Tres") as v on id = code select title, v.name'), ['Login/Uno', 'Kanban/Tres'], 'as a join source');
  assert.deepEqual(describeKqlSources('values ("a") (1)'), { cards: false, sources: [], tables: [] });
  assert.equal(result('values ("a") (1)  select *').scope!.label, 'values');
  fails('values ("A", "B") ("x")', /Row 1 of values has 1 cells but the header has 2/);
  fails('values ("A", "A") (1, 2)', /different, non-empty name/);
  fails('values (1)', /is the header/);
  fails('values ("A") (hola)', /text goes in quotes/);
  fails('values', /select|Expected|values/);
  fails(`values ("A") ${Array.from({ length: 1001 }, (_, i) => `(${i})`).join(' ')} count`, /at most 1000 rows/);
  fails(`values (${Array.from({ length: 51 }, (_, i) => `"c${i}"`).join(', ')}) count`, /at most 50 columns/);
  assert.equal(num(`values ("A") ${Array.from({ length: 1000 }, (_, i) => `(${i})`).join(' ')} count`), 1000);
});

test('let holds any result: grouped, selected, pivoted, joined, chained', () => {
  assert.deepEqual(cells('let g = cards group by list\nfrom g select list, count order by list'), ['A/2', 'B/1']);
  assert.deepEqual(cells('let g = cards group by list\nfrom g where count > 1 select list'), ['A']);
  assert.deepEqual(cells('let s = cards select title, points\nfrom s where points > 4 select title order by title'), ['Kanban', 'Login']);
  assert.deepEqual(result('let p = cards group by list pivot priority count\nfrom p select *').columns.map((c) => c.label), ['list', 'High', 'Low']);
  assert.deepEqual(cells('let p = cards group by list pivot priority count\nfrom p select *'), ['A/1/1', 'B/1/0']);
  assert.deepEqual(cells('let g = cards group by list\nlet h = cards where done group by list\nfrom g join h on list = list select list, count, h.count'), ['A/2/1']);
  assert.equal(num('let g = cards group by list\nlet h = cards where done group by list\nfrom g union h count'), 3);
  assert.deepEqual(cells('let t = cards select title, points limit 2\nfrom t select *'), ['Login/5', 'Logout/3']);
  assert.deepEqual(cells('let a = cards group by list sum(points)\nfrom a select list, [sum(points)] order by list'), ['A/8', 'B/8']);
  assert.equal(num('let a = cards where points > 0\nlet b = from a group by list\nlet c = from b where count > 0\nfrom c count'), 2, 'chains');
  const chain = ['let l0 = cards where points > 0', ...Array.from({ length: 24 }, (_, i) => `let l${i + 1} = from l${i} where points > 0`)].join('\n');
  assert.equal(num(`${chain}\nfrom l24 count`), 3, 'each let is evaluated once');
  assert.deepEqual(cells('let n = cards where list = "A"\nfrom n select title order by title'), ['Login', 'Logout'], 'a plain selection still keeps the cards');
});

test('Power Query names: every M name gives the same result as its KQL function', () => {
  const one: KqlData = {
    cards: [{ id: 'k', title: ' Kanban drag ', points: 8, due: '2026-03-20', created: '2026-03-05', tags: ['a', 'b'], fields: { Nums: ['1', '2', '2', '3'] } }],
  };
  const val = (e: string) => { const r = runKql(`cards select ${e} as "x"`, one, ctx)[0].result.rows[0]; return r.cells[0]; };
  const pairs: Array<[string, string]> = [
    ['Text.Upper(title)', 'upper(title)'], ['Text.Lower(title)', 'lower(title)'], ['Text.Trim(title)', 'trim(title)'], ['Text.Clean(title)', 'trim(title)'],
    ['Text.Length(title)', 'len(title)'], ['Text.Start(title, 3)', 'left(title, 3)'], ['Text.End(title, 3)', 'right(title, 3)'], ['Text.Middle(title, 2, 3)', 'substr(title, 2, 3)'],
    ['Text.Replace(title, "a", "o")', 'replace(title, "a", "o")'], ['Text.Contains(title, "an")', 'contains(title, "an")'], ['Text.StartsWith(trim(title), "Kan")', 'startswith(trim(title), "Kan")'],
    ['Text.EndsWith(trim(title), "drag")', 'endswith(trim(title), "drag")'], ['Text.PadStart(points, 3, "0")', 'padleft(points, 3, "0")'], ['Text.PadEnd(points, 3, "0")', 'pad(points, 3, "0")'],
    ['Text.Reverse(title)', 'reverse(title)'], ['Text.Proper(title)', 'title(title)'], ['join(Text.Split(trim(title), " "), "|")', 'join(split(trim(title), " "), "|")'],
    ['Text.Combine(tag, "|")', 'join(tag, "|")'], ['Text.From(points)', 'text(points)'], ['Text.BeforeDelimiter(trim(title), " ")', 'textbefore(trim(title), " ")'],
    ['Text.AfterDelimiter(trim(title), " ")', 'textafter(trim(title), " ")'],
    ['Number.Round(div(points, 3), 1)', 'round(div(points, 3), 1)'], ['Number.RoundUp(div(points, 3))', 'ceil(div(points, 3))'], ['Number.RoundDown(div(points, 3))', 'floor(div(points, 3))'],
    ['Number.Abs(sub(points, 10))', 'abs(sub(points, 10))'], ['Number.Power(points, 2)', 'pow(points, 2)'], ['Number.Mod(points, 3)', 'mod(points, 3)'], ['Number.Sign(sub(points, 10))', 'sign(sub(points, 10))'],
    ['Number.From("12")', 'number("12")'], ['Number.ToText(points)', 'text(points)'], ['Number.IntegerDivide(points, 3)', 'intdiv(points, 3)'],
    ['Date.Year(due)', 'year(due)'], ['Date.Month(due)', 'month(due)'], ['Date.Day(due)', 'day(due)'], ['Date.DayOfWeek(due)', 'weekday(due)'], ['Date.MonthName(due)', 'monthname(due)'],
    ['Date.QuarterOfYear(due)', 'quarter(due)'], ['Date.WeekOfYear(due)', 'isoweek(due)'], ['Date.AddDays(due, 5)', 'addDays(due, 5)'], ['Date.AddMonths(due, 2)', 'addMonths(due, 2)'],
    ['Date.StartOfWeek(due)', 'startofweek(due)'], ['Date.StartOfMonth(due)', 'startofmonth(due)'], ['Date.From(now())', 'todate(now())'], ['Date.ToText(due, "yyyy")', 'date(due, "yyyy")'],
    ['DateTime.LocalNow()', 'now()'], ['DateTime.FixedLocalNow()', 'now()'], ['Date.From(DateTime.LocalNow())', 'today()'], ['DateTime.From(due)', 'datetime(due)'],
    ['List.Sum(Nums)', 'list_sum(Nums)'], ['List.Average(Nums)', 'list_avg(Nums)'], ['List.Min(Nums)', 'list_min(Nums)'], ['List.Max(Nums)', 'list_max(Nums)'], ['List.Count(Nums)', 'count(Nums)'],
    ['List.First(Nums)', 'first(Nums)'], ['List.Last(Nums)', 'last(Nums)'], ['join(List.Distinct(Nums), ",")', 'join(unique(Nums), ",")'], ['join(List.Sort(tag), ",")', 'join(sort(tag), ",")'],
    ['List.Contains(Nums, "2")', 'has(Nums, "2")'],
  ];
  for (const [m, k] of pairs) assert.equal(val(m), val(k), `${m} vs ${k}`);
  assert.equal(val('Text.Upper(trim(title))'), 'KANBAN DRAG');
  assert.equal(val('text.upper(trim(title))'), 'KANBAN DRAG', 'case-insensitive');
  assert.equal(val('TEXT.UPPER(trim(title))'), 'KANBAN DRAG');
  assert.equal(val('Date.Year(due)'), '2026');
  assert.equal(val('List.Sum(Nums)'), '8');
  assert.equal(val('List.Average(Nums)'), '2');
  assert.equal(val('Text.BeforeDelimiter("a-b-c", "-")'), 'a');
  assert.equal(val('Text.AfterDelimiter("a-b-c", "-")'), 'b-c');
  assert.equal(val('textbefore("a-b-c", "-", 2)'), 'a-b', 'the nth occurrence');
  assert.equal(val('textafter("a-b-c", "-", -1)'), 'c', 'counting from the end');
  assert.equal(val('textbefore("abc", "-")'), '');
  assert.equal(val('Text.Split("a, b,c", ",")'), 'a, b, c', 'a list of pieces');
  assert.equal(val('Number.IntegerDivide(-7, 2)'), '-3');
  for (const [m] of KQL_M_ALIASES) assert.ok(KQL_FUNCTION_CATALOG.some((f) => f.aliases?.includes(m)), `${m} is listed in the catalog`);
  fails('cards select Text.Uper(title)', /Unknown function "Text\.Uper"\. Did you mean "Text\.Upper"\?/);
});

test('alias.column joined fields and dotted function names do not collide', () => {
  assert.deepEqual(cells('cards join members as text on assignee = id select text.upper, Text.Upper(title)'), ['U/LOGIN']);
  assert.deepEqual(cells('cards join members on assignee = id select members.role'), ['dev']);
  assert.deepEqual(cells('cards join members as m on assignee = id select m.upper'), ['U']);
});

test('if ... then ... else, null and the logical forms', () => {
  assert.deepEqual(col('cards select if points > 4 then "big" else "small" as "s" order by title'), ['big', 'big', 'small']);
  assert.deepEqual(col('cards select title, if points > 4 then "big" else "small" order by title', 1), ['big', 'big', 'small']);
  assert.deepEqual(col('cards select if points > 6 then "L" else if points > 4 then "M" else "S" order by title'), ['L', 'M', 'S']);
  assert.deepEqual(col('cards select if done and points > 2 then 1 else 0 order by title'), ['0', '1', '0']);
  assert.deepEqual(col('cards select if points > 4 then points * 2 else points + 1 order by title'), ['16', '10', '4']);
  assert.deepEqual(col('cards select iif(points > 4, "a", "b") order by title'), col('cards select if(points > 4, "a", "b") order by title'));
  assert.equal(result('cards select if points > 4 then "a" else "b"').columns[0].label, 'if(points > 4, "a", "b")');
  assert.equal(num('cards where created = null count'), 0);
  assert.equal(num('cards where assignee_count = 0 and priority != null count'), 2);
  assert.equal(num('cards where due is null count'), 3);
  assert.equal(num('cards where due is not null count'), 0);
  assert.deepEqual(col('cards select coalesce(null, points) order by title'), col('cards select points order by title'));
  fails('cards select if points > 4 "a"', /Expected "then"/);
  fails('cards select if points > 4 then "a"', /Expected "else"/);
});

test('catalog: every function is listed, with a runnable example', () => {
  const names = new Set(KQL_FUNCTION_CATALOG.flatMap((f) => [f.name, ...(f.aliases ?? [])].map((n) => n.toLowerCase())));
  for (const fn of Object.keys(KQL_FUNCTIONS)) assert.ok(names.has(fn), `${fn} has no catalog entry`);
  const categories = new Set(['Text', 'Number', 'Date & Time', 'List', 'Logical', 'Conversion', 'Aggregation', 'Row', 'Value']);
  const seen = new Set<string>();
  for (const f of KQL_FUNCTION_CATALOG) {
    assert.ok(categories.has(f.category), `${f.name}: category ${f.category}`);
    assert.ok(f.description.length > 5 && f.signature.toLowerCase().startsWith(f.name.toLowerCase()), `${f.name}: description / signature`);
    assert.ok(['text', 'number', 'bool', 'date', 'list', 'any'].includes(f.returns), f.name);
    assert.ok(!seen.has(f.name), `${f.name} is listed twice`);
    seen.add(f.name);
    assert.doesNotThrow(() => parseKqlScript(`cards select ${f.example} as "x"`), `${f.name}: ${f.example}`);
    assert.ok(KQL_FUNCTIONS[f.name], `${f.name} is not a function`);
  }
  for (const c of categories) assert.ok(KQL_FUNCTION_CATALOG.some((f) => f.category === c), `no function in ${c}`);
  assert.ok(KQL_FUNCTION_CATALOG.find((f) => f.name === 'upper')!.aliases!.includes('Text.Upper'));
  assert.equal(KQL_FUNCTION_CATALOG.find((f) => f.name === 'replace')!.signature, 'replace(text, find, replacement)');
  // the examples that need no special data also run
  const run1 = (e: string) => runKql(`cards select ${e} as "x" limit 1`, cards, ctx);
  for (const f of KQL_FUNCTION_CATALOG) if (!['rank'].includes(f.name)) assert.doesNotThrow(() => run1(f.example), `${f.name}: ${f.example}`);
});

test('the guide documents expressions, parameters, functions, values and the catalog names', () => {
  for (const word of ['Parameters, functions and expressions', 'param ', 'fn ', '$minimo', 'values (', 'typeof', 'if cond then', 'Text.Upper', 'parametro', 'funcion', 'valores', 'textbefore']) {
    assert.ok(KQL_SYNTAX_GUIDE.includes(word), `the guide does not mention ${word}`);
  }
  for (const line of KQL_SYNTAX_GUIDE.split('\n')) assert.ok(line.length <= 175, `guide line too long (${line.length}): ${line.slice(0, 60)}`);
});
