import assert from 'node:assert/strict';
import test from 'node:test';

import { KQL_FUNCTIONS, KQL_SYNTAX_GUIDE, KqlError, closestName, describeKqlSources, filterCards, kqlFunctionName, parseKqlFilter, runKql, type KqlCard, type KqlContext, type KqlData } from './kql.ts';

// Wednesday 2026-03-18 (weeks start on Monday).
const NOW = new Date('2026-03-18T12:00:00Z');
const ctx: KqlContext = {
  now: NOW,
  me: 'ana',
  users: [
    { id: 'ana', name: 'Ana Ruiz', email: 'ana@labroe.com' },
    { id: 'luis', name: 'Luis Pérez', email: 'luis@labroe.com' },
    { id: 'pedro', name: 'Pedro Gómez', alias: 'Pepe', email: 'pedro@labroe.com' },
  ],
  groups: [{ id: 'g-ti', slug: 'ti', name: 'TI', memberIds: ['luis', 'pedro'] }],
};

const cards: KqlCard[] = [
  { id: 'c1', title: 'Login con enlace', list: 'Resuelto', done: true, assignees: ['ana'], tags: ['auth', 'backend'], due: '2026-03-01', completed: '2026-03-10', created: '2026-02-20', points: 5, priority: 'Alta' },
  { id: 'c2', title: 'Recuperar contraseña', list: 'Resuelto', done: true, assignees: ['luis', 'ana'], tags: ['auth'], due: '2026-03-12', completed: '2026-03-17', created: '2026-03-02', points: 3, priority: 'Alta' },
  { id: 'c3', title: 'Kanban drag', list: 'En curso', assignees: ['luis'], tags: ['kanban', 'UX'], due: '2026-03-20', created: '2026-03-05', points: 8, priority: 'Media' },
  { id: 'c4', title: 'Bug acordeón', list: 'En curso', assignees: [], tags: ['bug'], due: '2026-03-10', created: '2026-03-09', points: 3, priority: 'Alta' },
  { id: 'c5', title: 'Bug mesh', list: 'Por hacer', assignees: ['pedro'], groupIds: ['g-ti'], tags: ['bug', 'mesh'], created: '2026-03-12', priority: 'Media' },
  { id: 'c6', title: 'Docs WHITE-LABEL', list: 'Por hacer', assignees: ['ana'], tags: [], created: '2025-12-01', fields: { Cliente: 'ACME', Horas: 4 } },
  { id: 'c7', title: 'Old done', list: 'Resuelto', done: true, assignees: ['pedro'], completed: '2025-12-20', created: '2025-11-01', points: 2, fields: { Cliente: 'Beta', Horas: 6 } },
];

const run = (source: string) => runKql(source, cards, ctx);
const rows = (source: string) => run(source)[0].result.rows.map((r) => [...r.labels, ...r.values].join('|'));
const count = (source: string) => run(source)[0].result.matched;
const cell = (source: string) => run(source)[0].result.rows[0].cells[0];
/** The value of one expression on card c3 ("Kanban drag", 8 points, due 2026-03-20, created 2026-03-05, tags kanban + UX). */
const on = (id: string, expr: string) => cell(`cards where id = "${id}" select ${expr} as "x"`);
const c3 = (expr: string) => on('c3', expr);
const fails = (q: string, re: RegExp) => assert.throws(() => run(q), (e: unknown) => e instanceof KqlError && re.test(e.message), `${q} -> expected ${re}`);

test('text functions', () => {
  assert.equal(c3('contains(title, "KANBAN")'), 'true');
  assert.equal(c3('contains(title, "zzz")'), 'false');
  assert.equal(c3('startswith(title, "kan")'), 'true');
  assert.equal(c3('endswith(title, "drag")'), 'true');
  assert.equal(c3('match(title, /^K\\w+/)'), 'true');
  assert.equal(c3('match(title, /^k\\w+/)'), 'false', 'a /regex/ literal is case-sensitive unless it has the i flag');
  assert.equal(c3('match(title, "^kan")'), 'true', 'a text pattern ignores case like ~ does');
  assert.equal(c3('extract(title, /(\\w+) (\\w+)/, 2)'), 'drag');
  assert.equal(c3('extract(title, /^(\\w+)/, 1)'), 'Kanban');
  assert.equal(c3('extract(title, /\\d+/)'), '', 'no match is empty');
  assert.equal(c3('padleft(points, 3, "0")'), '008');
  assert.equal(c3('pad(title, 13, ".")'), 'Kanban drag..');
  assert.equal(c3('pad("ab", 4)'), 'ab  ');
  assert.equal(c3('repeat("ab", 3)'), 'ababab');
  assert.equal(c3('reverse(title)'), 'gard nabnaK');
  assert.equal(c3('words(title)'), '2');
  assert.equal(c3('words("  uno, dos   tres ")'), '3');
  assert.equal(c3('title("hELLO wORLD")'), 'Hello World');
  assert.equal(c3('proper(lower(title))'), 'Kanban Drag');
  assert.equal(c3('join(reverse(tag), "|")'), 'UX|kanban');
});

test('number functions', () => {
  assert.equal(c3('ceil(div(points, 3))'), '3');
  assert.equal(c3('floor(div(points, 3))'), '2');
  assert.equal(c3('least(points, 5, 9)'), '5');
  assert.equal(c3('greatest(points, 5)'), '8');
  assert.equal(c3('min2(points, 3)'), '3');
  assert.equal(c3('max2(points, 10)'), '10');
  assert.equal(c3('pow(points, 2)'), '64');
  assert.equal(c3('mod(points, 3)'), '2');
  assert.equal(c3('mod(-1, 3)'), '2', 'mod follows the sign of the divisor');
  assert.equal(c3('mod(points, 0)'), '', 'dividing by zero gives no value');
  assert.equal(c3('sign(sub(points, 10))'), '-1');
  assert.equal(c3('percent(points, 16)'), '50');
  assert.equal(c3('percent(points, 0)'), '');
  assert.equal(on('c5', 'greatest(points, 1)'), '1', 'a missing number is ignored');
});

test('date functions', () => {
  assert.equal(c3('addDays(due, 5)'), '2026-03-25');
  assert.equal(c3('addDays(due, -20)'), '2026-02-28');
  assert.equal(c3('addMonths("2026-01-31", 1)'), '2026-02-28', 'the day is clamped to the month');
  assert.equal(c3('addMonths(due, 12)'), '2027-03-20');
  assert.equal(c3('diffDays(due, created)'), '15');
  assert.equal(c3('weekday(due)'), 'Friday');
  assert.equal(c3('dow(due)'), '5');
  assert.equal(c3('monthname(due)'), 'March');
  assert.equal(c3('startofweek(due)'), '2026-03-16');
  assert.equal(c3('startofmonth(due)'), '2026-03-01');
  assert.equal(c3('week_of(due)'), '2026-03-16');
  assert.equal(c3('month_of(due)'), '2026-03');
  assert.equal(c3('age(created)'), '13');
  assert.equal(c3('quarter(due)'), '1');
  assert.equal(c3('isoweek(due)'), '12');
  assert.equal(c3('isoweek("2026-01-01")'), '1');
  assert.equal(c3('isoweek("2024-12-30")'), '1', 'the ISO year can start in December');
  assert.equal(c3('isoweek("2021-01-03")'), '53');
  assert.equal(c3('today()'), '2026-03-18');
  assert.ok(c3('now()').startsWith('2026-03-18T12:00'));
  assert.equal(on('c5', 'weekday(due)'), '', 'no date, no value');
  assert.equal(c3('addDays(due, 99999999999)'), '', 'out-of-range dates give no value');
  assert.equal(count('cards where due < addDays(today(), 3)'), 4);
  assert.equal(count('cards where diffDays(due, created) > 10'), 1);
  assert.equal(count('cards where diffDays(due, created) >= 10'), 2);
  assert.equal(count('cards where weekday(due) = "Friday"'), 1);
  assert.deepEqual(rows('cards group by month_of(created) order by key count').slice(0, 2), ['2025-11|1', '2025-12|1']);
});

test('list functions and boolean helpers usable in where', () => {
  assert.equal(on('c1', 'count(tag)'), '2');
  assert.equal(on('c6', 'count(tag)'), '0');
  assert.equal(on('c1', 'has(tag, "AUTH")'), 'true');
  assert.equal(on('c1', 'first(tag)'), 'auth');
  assert.equal(on('c1', 'last(tag)'), 'backend');
  assert.equal(c3('join(sort(tag), "|")'), 'kanban|UX');
  assert.equal(on('c1', 'join(unique(tag), "|")'), 'auth|backend');
  assert.equal(on('c6', 'first(tag)'), '');
  assert.equal(count('cards where has(tag, "bug")'), 2);
  assert.equal(count('cards where not has(tag, "bug") and count(tag) >= 2'), 2);
  assert.equal(count('cards where has(tag, "bug") = false'), 5);
  assert.equal(count('cards where has(tag, "auth") and not done'), 0);
  assert.equal(count('cards where match(title, /^bug/i)'), 2);
  assert.equal(count('cards where contains(lower(title), "bug")'), 2);
  assert.equal(count('cards where startswith(title, "bug")'), 2);
  assert.equal(count('cards where endswith(title, "mesh") or isnull(due)'), 3);
  assert.equal(count('cards where isnull(due)'), 3);
  assert.equal(count('cards where not isnull(due)'), 4);
  assert.equal(count('cards where match(title, /o/gi)'), 5, 'a g flag does not make results depend on the previous card');
  assert.equal(filterCards('has(tag, "bug") and not done', cards, ctx).length, 2, 'works in filter boxes too');
  assert.ok(parseKqlFilter('has(tag, "x")'));
});

test('conditionals: if / iif with comparison conditions', () => {
  assert.deepEqual(rows('cards group by if(points > 4, "big", "small") count'), ['small|5', 'big|2']);
  assert.equal(cell('cards sum(if(done, points, 0))'), '10');
  assert.equal(cell('cards sum(iif(done and points > 2, points, 0))'), '8');
  assert.equal(cell('cards sum(if(has(tag, "auth"), 1, 0))'), '2');
  assert.equal(on('c1', 'if(points > 6, "L", if(points > 2, "M", "S"))'), 'M');
  assert.equal(on('c5', 'if(isnull(due), "none", date(due, "MM"))'), 'none');
  assert.equal(c3('if(isnull(due), "none", date(due, "MM"))'), '03');
  assert.equal(count('cards where if(done, 1, 0) = 1'), 3);
  assert.equal(run('cards select if(points > 4, "big", "small")')[0].result.columns[0].label, 'if(points > 4, "big", "small")');
  fails('cards select if(points, 1, 2)', /Expected a comparison/);
  fails('cards select if(points > 1, 2)', /if\(\) takes 3 arguments, not 2/);
});

test('between and comparisons accept calculations on both sides', () => {
  assert.equal(count('cards where due between addDays(today(), -10) and addDays(today(), 3)'), 3);
  assert.equal(count('cards where len(title) between 8 and add(4, 4)'), 2);
  assert.equal(count('cards where created > addDays(today(), -7)'), 1);
  assert.equal(count('cards where points >= add(2, 3)'), 2);
  assert.equal(count('cards where title = lower("BUG MESH")'), 1);
  assert.equal(count('cards where due in (addDays(today(), 2), "2026-03-01")'), 2);
});

test('built-in derived fields: age, cycle, overdue_days, title_len, tag_count, assignee_count', () => {
  assert.equal(count('cards where age > 60'), 2);
  assert.equal(cell('cards where done avg(cycle)'), '27.33');
  assert.equal(count('cards where cycle > 20'), 1);
  assert.equal(count('cards where overdue_days > 5'), 1);
  assert.equal(count('cards where overdue_days is empty'), 6);
  assert.equal(cell('cards where overdue select overdue_days'), '8');
  assert.equal(count('cards where title_len >= 20'), 1);
  assert.equal(count('cards where tag_count = 0'), 2);
  assert.equal(count('cards where tag_count >= 2'), 3);
  assert.equal(count('cards where assignee_count > 1'), 1);
  assert.deepEqual(rows('cards group by assignee_count count'), ['1|5', '0|1', '2|1']);
  assert.equal(cell('cards max(age)'), '137');
  assert.equal(count('cards where age between 10 and 30'), 3);
  assert.equal(count('cards where edad > 60'), 2, 'Spanish alias');
});

test('having filters groups by their metrics', () => {
  assert.deepEqual(rows('cards group by list having count > 2'), ['Resuelto|3']);
  assert.deepEqual(rows('cards group by list having count >= 2 order by key'), ['En curso|2', 'Por hacer|2', 'Resuelto|3']);
  assert.deepEqual(rows('cards group by list having sum(points) >= 8'), ['Resuelto|3', 'En curso|2'], 'the metric used by having is not an extra column');
  assert.equal(run('cards group by list having sum(points) >= 8')[0].result.columns.length, 2);
  assert.deepEqual(rows('cards group by list having avg(points) > 3'), ['Resuelto|3', 'En curso|2']);
  assert.deepEqual(rows('cards group by list having count between 3 and 5 or sum(points) = 0'), ['Resuelto|3', 'Por hacer|2']);
  assert.deepEqual(rows('cards group by list having not count < 3'), ['Resuelto|3']);
  assert.deepEqual(rows('cards group by list having (count > 2 or count = 2) and sum(points) > 9'), ['Resuelto|3', 'En curso|2']);
  assert.deepEqual(rows('cards group by list\nhaving count > 2'), ['Resuelto|3'], 'a new line continues the query');
  assert.deepEqual(rows('cards agrupar por lista teniendo count > 2'), ['Resuelto|3'], 'Spanish: teniendo');
  assert.deepEqual(rows('cards group by list having count > 99'), []);
  assert.deepEqual(rows('cards count having count > 3'), ['7']);
  fails('cards select title having count > 1', /cannot be combined/);
  fails('cards group by list having join(title) > 1', /gives text/);
  fails('cards group by list having count > "a"', /Expected a number/);
  fails('cards group by list having count', /Expected a comparison/);
  fails('cards group by list having count > 1 having count < 5', /Only one "having"/);
});

test('offset, limit, top / bottom, distinct', () => {
  assert.deepEqual(rows('cards group by list order by key offset 1 limit 1'), ['Por hacer|2']);
  assert.deepEqual(rows('cards group by list order by key offset 2'), ['Resuelto|3']);
  assert.deepEqual(run('cards select title order by title offset 5').map((o) => o.result.rows.map((r) => r.cells[0]))[0], ['Old done', 'Recuperar contraseña']);
  assert.deepEqual(run('cards select title order by title saltar 5 limit 1')[0].result.rows.map((r) => r.cells[0]), ['Old done'], 'Spanish: saltar');
  assert.deepEqual(rows('cards group by list top 2 by count'), ['Resuelto|3', 'En curso|2']);
  assert.deepEqual(rows('cards group by list top 1'), ['Resuelto|3'], 'top N alone ranks by the first metric');
  assert.deepEqual(rows('cards group by assignee top 1 by sum(points)'), ['Luis Pérez|2|11']);
  assert.deepEqual(rows('cards group by assignee bottom 2 by sum(points)'), ['Pepe|2|2', '(unassigned)|1|3']);
  assert.deepEqual(run('cards select title top 3 by points')[0].result.rows.map((r) => r.cells[0]), ['Kanban drag', 'Login con enlace', 'Recuperar contraseña']);
  assert.deepEqual(run('cards select title bottom 1 by points')[0].result.rows.map((r) => r.cells[0]), ['Old done']);
  assert.deepEqual(rows('cards group by list primeros 1 by count'), ['Resuelto|3'], 'Spanish: primeros');
  fails('cards select title top 3', /say what to rank by/);
  fails('cards group by list order by count top 2', /either "top" or "order by"/);
  fails('cards group by list top 0 by count', /whole number/);
  fails('cards select title offset -1', /whole number/);

  assert.deepEqual(run('cards select distinct list')[0].result.rows.map((r) => r.cells[0]), ['Resuelto', 'En curso', 'Por hacer']);
  assert.deepEqual(run('cards distinct list order by list')[0].result.rows.map((r) => r.cells[0]), ['En curso', 'Por hacer', 'Resuelto']);
  assert.deepEqual(run('cards select distinct list order by list offset 1 limit 1')[0].result.rows.map((r) => r.cells[0]), ['Por hacer']);
  assert.deepEqual(run('cards seleccionar distintos lista')[0].result.rows.length, 3, 'Spanish: distintos');
  assert.equal(run('cards select distinct list, priority')[0].result.rows.length, 6);
  assert.equal(run('cards select list')[0].result.rows.length, 7, 'without distinct nothing is dropped');
  fails('cards select distinct list distinct title', /not both/);
  fails('cards select title distinct list', /not both/);
  assert.deepEqual(rows('let a = cards select distinct list\nshow a count'), ['3'], 'a let holds any result');
  assert.deepEqual(rows('let a = cards where done offset 1\nshow a count'), ['0']);
  assert.deepEqual(rows('let a = cards group by list having count > 1\nshow a count'), ['3']);
});

test('count(distinct x) and count unique(x)', () => {
  const direct = run('cards count(distinct assignee)')[0].result;
  assert.equal(direct.rows[0].values[0], 3);
  assert.equal(direct.columns.length, 1, 'one metric, not two');
  assert.equal(direct.columns[0].label, 'count(distinct assignee)');
  assert.equal(run('cards count unique(assignee)')[0].result.columns.length, 1);
  assert.deepEqual(rows('cards group by list count unique(assignee)'), ['Resuelto|3', 'Por hacer|2', 'En curso|1']);
  assert.deepEqual(rows('cards group by list count(distinct assignee) order by count(distinct assignee) asc limit 1'), ['En curso|1']);
  assert.deepEqual(rows('cards group by list count, unique(assignee)'), ['Resuelto|3|3', 'En curso|2|1', 'Por hacer|2|2'], 'with a comma they stay two metrics');
  assert.equal(cell('cards unique(tag)'), '6');
  fails('cards count(assignee)', /count takes no field/);
});

test('more aggregations: median, stddev, percentile, count_if, sum_if, ratio', () => {
  assert.equal(cell('cards median(points)'), '3');
  assert.equal(cell('cards median(points) where done'), '3');
  assert.equal(cell('cards percentile(points, 90)'), '6.8');
  assert.equal(cell('cards percentile(points, 0)'), '2');
  assert.equal(cell('cards percentile(points, 100)'), '8');
  assert.equal(cell('cards stddev(points)'), '2.14');
  assert.equal(cell('cards count_if(done)'), '3');
  assert.equal(cell('cards count_if(done and points > 2)'), '2');
  assert.deepEqual(rows('cards group by list count_if(points > 3)'), ['En curso|1', 'Resuelto|1', 'Por hacer|0']);
  assert.equal(cell('cards sum_if(points, done)'), '10');
  assert.equal(cell('cards sum_if(points, list = "En curso")'), '11');
  assert.equal(cell('cards ratio(points, cf.Horas)'), '2.1');
  assert.equal(cell('cards ratio(points, comments)'), '0', 'a zero denominator gives 0');
  assert.deepEqual(rows('cards group by list median(points), count'), ['En curso|5.5|2', 'Resuelto|3|3', 'Por hacer|0|2']);
  assert.equal(run('cards count_if(points > 3)')[0].result.columns[0].label, 'count_if(points > 3)');
  assert.equal(run('cards sum_if(points, done)')[0].result.columns[0].label, 'sum_if(points, done)');
  assert.equal(cell('cards mediana(points)'), '3', 'Spanish: mediana');
  assert.equal(cell('cards where done avg(cycle)'), '27.33');
  fails('cards percentile(points, 150)', /0 to 100/);
  fails('cards percentile(points)', /needs the percentile/);
  fails('cards median(title)', /needs a number field/);
  fails('cards sum_if(points)', /needs a condition/);
  fails('cards ratio(points)', /needs two fields/);
  fails('cards count_if(nope = 1)', /Unknown field "nope"/);
});

test('"Did you mean" for functions, fields, keywords and names', () => {
  fails('cards where lowr(title) contains "x"', /Unknown function "lowr"\. Did you mean "lower"\?/);
  fails('cards select addDay(due, 1)', /Unknown function "addDay"\. Did you mean "addDays"\?/);
  fails('cards group by list summ(points)', /Unexpected "summ"\. Did you mean "sum"\?/);
  fails('cards group by list, summ(points)', /Unknown function "summ"\. Did you mean "sum"\?/);
  fails('cards select zzzzzz(title)', /Unknown function "zzzzzz"\.$/);
  fails('cards where titel = "x"', /Unknown field "titel"\. Did you mean "title"\?/);
  fails('cards group by priorty', /Unknown field "priorty"\. Did you mean "priority"\?/);
  fails('cards select cf.Horaz', /Unknown field "Horaz"\. Did you mean "Horas"\?/);
  fails('cards wher done', /Unexpected "wher"\. Did you mean "where"\?/);
  fails('cards group by list cuont', /Unexpected "cuont"\. Did you mean "count"\?/);
  fails('cards group by list order by count limt 3', /Unexpected "limt"\. Did you mean "limit"\?/);
  fails('cards group by list havng count > 1', /Unexpected "havng"\. Did you mean "having"\?/);
  fails('let mine = cards where done\nfrom mien count', /Unknown name "mien"\. Did you mean "mine"\?/);
  fails('from cardz count', /Unknown name "cardz"\. Did you mean "cards"\?/);
  assert.throws(() => parseKqlFilter('done adn assignee = me'), /Unexpected "adn"\. Did you mean "and"\?/);
  assert.equal(closestName('lowr', ['lower', 'upper']), 'lower');
  assert.equal(closestName('titel', ['title']), 'title');
  assert.equal(closestName('zzzzzz', ['lower']), null);
  assert.equal(closestName('ab', ['abc']), null, 'very short words are never guessed');
  assert.equal(closestName('LÓWER', ['lower']), 'lower', 'case and accents are ignored');
  // an ordinary word before a parenthesis that is a keyword is not a function
  assert.equal(count('cards where list in ("En curso", "Resuelto") and (done or not done)'), 5);
  assert.equal(count('cards where assignee = me and (points > 3 or points = 0)'), 1);
});

test('function table: arities and display names', () => {
  assert.equal(kqlFunctionName('adddays'), 'addDays');
  assert.equal(kqlFunctionName('lower'), 'lower');
  for (const name of ['contains', 'match', 'extract', 'pad', 'padleft', 'repeat', 'reverse', 'words', 'title', 'proper', 'ceil', 'floor', 'least', 'greatest', 'min2', 'max2', 'pow', 'mod', 'sign', 'percent',
    'adddays', 'addmonths', 'diffdays', 'weekday', 'monthname', 'startofweek', 'startofmonth', 'age', 'quarter', 'isoweek', 'today', 'now', 'count', 'has', 'first', 'last', 'sort', 'unique', 'if', 'iif', 'isnull']) {
    assert.ok(KQL_FUNCTIONS[name], name);
  }
  fails('cards select today(1)', /today\(\) takes 0 arguments, not 1/);
  fails('cards select match(title)', /match\(\) takes 2 arguments, not 1/);
  fails('cards select extract(title, /a/, 1, 2)', /extract\(\) takes 2 to 3 arguments, not 4/);
  fails('cards select least(points)', /least\(\) takes 2 to 20 arguments, not 1/);
});

test('safety: regex functions, bounded text, nesting', () => {
  fails('cards where match(title, /(a+)+$/)', /nested repetitions/);
  fails('cards select extract(title, "(a+)+")', /nested repetitions/);
  fails('cards where match(title, "(")', /Invalid regular expression/);
  fails(`cards where match(title, /${'a'.repeat(1001)}/)`, /too long/);
  assert.equal(c3('len(pad("x", 100000))'), '200', 'pad is capped');
  assert.equal(c3('len(padleft("x", 1000000, "ab"))'), '200');
  assert.equal(c3('len(repeat("abc", 100000))'), '150', 'repeat is capped at 50 copies');
  assert.equal(c3('len(repeat(repeat("x", 50), 50))'), '1000', 'and at 1000 characters');
  assert.equal(c3('pow(10, 1000)'), '', 'an overflowing power has no value instead of Infinity');
  assert.throws(() => run(`cards select ${'abs('.repeat(20)}points${')'.repeat(20)}`), /nested too deeply/);
  assert.throws(() => run(`cards where ${'not '.repeat(30)}done`), /nested too deeply/);
  const big = Array.from({ length: 50 }, (_, i): KqlCard => ({ id: `b${i}`, title: 'a'.repeat(50_000) }));
  const t0 = Date.now();
  runKql('cards where match(title, /b/) or words(title) > 100000 select extract(title, /a{3}/)', big, ctx);
  assert.ok(Date.now() - t0 < 5000, 'regex input is clipped, so huge text stays fast');
});

test('composition: let, from and the new clauses together', () => {
  const out = run('let late = cards where overdue_days > 0 or (not done and due < today)\nshow from late select title, overdue_days as "Days late"\nfrom late count');
  assert.deepEqual(out[0].result.rows.map((r) => r.cells.join('/')), ['Bug acordeón/8']);
  assert.equal(out[1].result.rows[0].values[0], 1);
  assert.deepEqual(rows('let mine = cards where assignee = me\nfrom mine group by list having count >= 1 top 1 by sum(points)'), ['Resuelto|2|8']);
  assert.deepEqual(rows('let open = cards where not done\nfrom open where has(tag, "bug") group by priority count_if(points > 2), percentile(points, 50)'), ['Alta|1|3', 'Media|0|0']);
});

test('the AI guide mentions the new language', () => {
  for (const word of ['having', 'offset', 'distinct', 'top', 'median(', 'percentile(', 'count_if(', 'sum_if(', 'ratio(', 'age', 'cycle', 'overdue_days', 'title_len', 'tag_count', 'assignee_count', 'addDays', 'diffDays', 'extract(', 'if(', 'teniendo', 'saltar', 'distintos']) {
    assert.ok(KQL_SYNTAX_GUIDE.includes(word), `the guide does not mention ${word}`);
  }
  for (const line of KQL_SYNTAX_GUIDE.split('\n')) assert.ok(line.length <= 175, `guide line too long (${line.length}): ${line.slice(0, 60)}`);
});

// ── joins and union ──────────────────────────────────────────────────────────

const members: KqlCard[] = [
  { id: 'ana', title: 'Ana Ruiz', fields: { email: 'ana@labroe.com', role: 'dev' } },
  { id: 'luis', title: 'Luis Pérez', fields: { email: 'luis@labroe.com', role: 'ops' } },
  { id: 'pedro', title: 'Pedro Gómez', fields: { email: 'pedro@labroe.com', role: 'dev' } },
];
const ventas: KqlCard[] = [
  { id: 'v1', title: 'v1', fields: { Cliente: 'ACME', Monto: 100 } },
  { id: 'v2', title: 'v2', fields: { Cliente: 'beta ', Monto: 50 } },
  { id: 'v3', title: 'v3', fields: { Cliente: 'Acmé', Monto: 25 } },
  { id: 'v4', title: 'v4', fields: { Cliente: 'Zeta', Monto: 10 } },
];
const clientes: KqlCard[] = [
  { id: 'k1', title: 'k1', fields: { Nombre: 'acme', Pais: 'Chile' } },
  { id: 'k2', title: 'k2', fields: { Nombre: 'Beta', Pais: 'Peru' } },
];
const joinData: KqlData = {
  cards,
  tables: [
    { id: 't1', title: 'Ventas', kind: 'table', columns: ['Cliente', 'Monto'], rows: ventas },
    { id: 't2', title: 'Clientes', kind: 'table', columns: ['Nombre', 'Pais'], rows: clientes },
  ],
  sources: {
    members,
    timers: [{ id: 't1', title: 'timer', fields: { card: 'c4', minutes: 30 } }, { id: 't2', title: 'timer', fields: { card: 'c4', minutes: 15 } }],
    sa: [{ id: 'a1', title: 'A', fields: { x: 1 } }],
    sb: [{ id: 'b1', title: 'B', fields: { y: 2 } }],
  },
};
const runJ = (source: string) => runKql(source, joinData, ctx);
const rowsJ = (source: string) => runJ(source)[0].result.rows.map((r) => [...r.labels, ...r.values].join('|'));
const cellsJ = (source: string) => runJ(source)[0].result.rows.map((r) => r.cells.join('/'));
const failsJ = (q: string, re: RegExp) => assert.throws(() => runJ(q), (e: unknown) => e instanceof KqlError && re.test(e.message), `${q} -> expected ${re}`);

test('join: a list-valued key (assignees) matches any element, fields come as alias.field', () => {
  assert.deepEqual(rowsJ('cards join members on assignee = id group by members.title count'), ['Ana Ruiz|3', 'Luis Pérez|2', 'Pedro Gómez|2']);
  assert.deepEqual(rowsJ('cards join members on assignee = id group by members.name count'), ['Ana Ruiz|3', 'Luis Pérez|2', 'Pedro Gómez|2'], 'built-in names work under the alias');
  assert.deepEqual(rowsJ('cards join members on assignee = id where members.role = "dev" and done group by members.email count'), ['ana@labroe.com|2', 'pedro@labroe.com|1']);
  assert.deepEqual(rowsJ('cards join members on assignee = id group by members.role count, sum(points)'), ['dev|5|10', 'ops|2|11']);
  assert.equal(runJ('cards join members on assignee = id count')[0].result.rows[0].values[0], 7, 'c4 has no assignee: dropped by the inner join');
  assert.deepEqual(rowsJ('cards unir members on assignee = id where done count'), ['4'], 'Spanish: unir');
  assert.deepEqual(rowsJ('cards join members as m on assignee = m.id group by m.role count'), ['dev|5', 'ops|2'], 'custom alias');
  assert.deepEqual(rowsJ('cards join members as m on m.id = assignee group by m.role count'), ['dev|5', 'ops|2'], 'sides can be swapped');
  assert.deepEqual(cellsJ('cards join members on assignee = id select title, members.email order by title limit 2'), ['Bug mesh/pedro@labroe.com', 'Docs WHITE-LABEL/ana@labroe.com']);
  assert.deepEqual(rowsJ('cards join members on assignee = id\nwhere done\ngroup by members.role count'), ['dev|3', 'ops|1'], 'a new line continues the query');
});

test('join: left keeps unmatched records, keys ignore case, accents and spaces', () => {
  assert.deepEqual(rowsJ('cards join members on assignee = id left group by members.title count'), ['Ana Ruiz|3', 'Luis Pérez|2', 'Pedro Gómez|2', '(none)|1']);
  assert.deepEqual(rowsJ('rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombre group by c.Pais count, sum(Monto)'), ['Chile|2|125', 'Peru|1|50']);
  assert.deepEqual(rowsJ('rows of "Ventas" join rows of "Clientes" as c on c.Nombre = Cliente left group by c.Pais sum(Monto)'), ['Chile|125', 'Peru|50', '(none)|10']);
  assert.deepEqual(cellsJ('rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombre select Cliente, c.Pais order by Monto desc'), ['ACME/Chile', 'beta /Peru', 'Acmé/Chile']);
  assert.deepEqual(cellsJ('rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombre left where c.Pais is empty select Cliente'), ['Zeta']);
});

test('join: a let selection and a source, chained, with filters on the right side', () => {
  assert.deepEqual(cellsJ('let slow = cards where overdue\nfrom slow join timers on id = card select title, timers.minutes order by timers.minutes'), ['Bug acordeón/15', 'Bug acordeón/30']);
  assert.deepEqual(rowsJ('let slow = cards where overdue\nfrom slow join timers on id = card sum(timers.minutes)'), ['45']);
  assert.deepEqual(rowsJ('cards join members on assignee = id left join timers on id = card count'), ['2']);
  failsJ('cards join members on assignee = id join timers on id = card join sa on id = id count', /at most 2 joins/);
  failsJ('cards join members', /needs "on <field> = <field>"/);
  failsJ('cards join members on assignee id', /compares two fields/);
  failsJ('cards join nada on id = id count', /Unknown name "nada"/);
  assert.equal(runJ('cards join(title, "|")')[0].result.rows[0].cells[0].split('|').length, 7, 'join( ... ) is still the metric');
});

test('join: errors name the real columns, rows are capped', () => {
  failsJ('rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombre group by c.Pias count', /Unknown column "c\.Pias"\. Did you mean "c\.Pais"\?/);
  failsJ('rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombr count', /Unknown column "Nombr"\. Did you mean "Nombre"\?/);
  failsJ('rows of "Ventas" join rows of "Clientes" as c on Clinte = c.Nombre count', /Unknown column "Clinte"\. Did you mean "Cliente"\?/);
  failsJ('cards join members on assignee = id where members.rol = "dev"', /Unknown field "members\.rol"\. Did you mean "members\.role"\?/);
  const many = (n: number): KqlCard[] => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, title: `m${i}`, fields: { k: 'x' } }));
  assert.throws(() => runKql('cards join other on cf.k = k count', { cards: many(350), sources: { other: many(300) } }, ctx), /would produce more than 100000 rows/);
  assert.equal(runKql('cards join other on cf.k = k count', { cards: many(100), sources: { other: many(100) } }, ctx)[0].result.rows[0].values[0], 10000);
});

test('describeKqlSources reports joined and unioned sources', () => {
  assert.deepEqual(describeKqlSources('cards join members on assignee = id'), { cards: true, sources: ['members'], tables: [] });
  assert.deepEqual(describeKqlSources('rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombre'), { cards: false, sources: [], tables: ['Ventas', 'Clientes'] });
  assert.deepEqual(describeKqlSources('documents join cards on id = id union items'), { cards: true, sources: ['documents', 'items'], tables: [] });
  assert.deepEqual(describeKqlSources('let a = cards where done\nfrom a join timers on id = card'), { cards: true, sources: ['timers'], tables: [] });
});

test('union of two selections: same records count once, missing columns are empty', () => {
  assert.deepEqual(rowsJ('let a = cards where done\nlet b = cards where tag = bug\nfrom a union b count'), ['5']);
  assert.deepEqual(rowsJ('let a = cards where done\nlet b = cards where list = "Resuelto"\nfrom a union b count'), ['3'], 'a card in both counts once');
  assert.deepEqual(cellsJ('from sa union sb select x, y order by title'), ['1/', '/2']);
  assert.deepEqual(rowsJ('from sa\nunion sb count'), ['2'], 'a new line continues the query');
  assert.deepEqual(rowsJ('let a = cards where done\nfrom a union cards count'), ['7']);
  failsJ('from sa union', /Expected a source after "union"/);
});
