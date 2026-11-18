import assert from 'node:assert/strict';
import test from 'node:test';

import { KQL_SYNTAX_GUIDE, KqlError, filterCards, parseKqlFilter, runKql, toChartData, type KqlCard, type KqlContext } from './kql.ts';

// A fixed "now": Wednesday 2026-03-18. Weeks start on Monday (this week = 2026-03-16 .. 2026-03-22).
const NOW = new Date('2026-03-18T12:00:00Z');
const ctx: KqlContext = {
  now: NOW,
  me: 'ana',
  users: [
    { id: 'ana', name: 'Ana Ruiz', email: 'ana@labroe.com' },
    { id: 'luis', name: 'Luis Pérez', email: 'luis@labroe.com' },
    { id: 'pedro', name: 'Pedro Gómez', alias: 'Pepe', email: 'pedro@labroe.com' },
  ],
  groups: [
    { id: 'g-ti', slug: 'ti', name: 'TI', memberIds: ['luis', 'pedro'] },
    { id: 'g-dis', slug: 'diseno', name: 'Diseño', memberIds: ['ana'] },
  ],
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

test('resolved tasks per person and per group (the motivating questions)', () => {
  assert.deepEqual(rows('cards where done in last 30d group by assignee count'), ['Ana Ruiz|2', 'Luis Pérez|1']);
  assert.deepEqual(rows('cards where done in last 30d group by group count'), ['Diseño|2', 'TI|1'], 'a card counts once per group, whoever of the group did it');
});

test('assignment: me, names (any case/accents), emails, @group, mention tokens', () => {
  assert.equal(count('cards where assignee = me'), 3);
  assert.equal(count('cards where assignee = "luis perez"'), 2);
  assert.equal(count('cards where assignee = luis@labroe.com'), 2);
  assert.equal(count('cards where assignee = Pepe'), 2, 'aliases work');
  assert.equal(count('cards where assignee = @TI'), 4, '@group = any member of the group');
  assert.equal(count('cards where assignee = @[user:luis:Luis]'), 2);
  assert.equal(count('cards where group = @[group:g-ti:TI]'), 4);
  assert.equal(count('cards where group = TI'), 4, 'a list assigned to a group counts too (c5)');
  assert.equal(count('cards where unassigned'), 1);
  assert.equal(count('cards where assignee != me'), 4);
  assert.equal(count('cards where assigned and not assignee = me'), 3);
});

test('dates: windows, relative offsets, between (inclusive), empty', () => {
  assert.equal(count('cards where due in next 7d'), 1);
  assert.equal(count('cards where overdue'), 1, 'not done and past due (c1 and c2 are late but done)');
  assert.equal(count('cards where due < today'), 3);
  assert.equal(count('cards where due > +1d'), 1);
  assert.equal(count('cards where due between 2026-03-01 and 2026-03-10'), 2, 'the end day is included');
  assert.equal(count('cards where due is empty'), 3);
  assert.equal(count('cards where due is not empty'), 4);
  assert.equal(count('cards where done in this week'), 1);
  assert.equal(count('cards where created in this month'), 4);
  assert.equal(count('cards where created in last month'), 1, 'February 2026');
  assert.equal(count('cards where created before 2026-01-01'), 2);
  assert.equal(count('cards where created = 2026-03-12'), 1);
  assert.equal(count('cards where due in today'), 0);
  assert.equal(count('cards where due in last 7d'), 1);
});

test('status flags and text conditions', () => {
  assert.equal(count('cards where done'), 3);
  assert.equal(count('cards where done = false'), 4);
  assert.equal(count('cards where done = true'), 3);
  assert.equal(count('cards where open'), 4);
  assert.equal(count('cards where list = "resuelto"'), 3, 'case and accents do not matter');
  assert.equal(count('cards where list ~ /^en /'), 2);
  assert.equal(count('cards where title contains bug'), 2);
  assert.equal(count('cards where title startswith "bug"'), 2);
  assert.equal(count('cards where title ~ /white-label/'), 1);
  assert.equal(count('cards where "mesh"'), 1, 'free text searches title, description and tags');
  assert.equal(count('cards where desc is empty'), 7);
});

test('tags, lists of values, negation and boolean logic', () => {
  assert.equal(count('cards where tag ~ /^bug/'), 2);
  assert.equal(count('cards where tag = #bug'), 2);
  assert.equal(count('cards where #bug and #mesh'), 1);
  assert.equal(count('cards where tag != bug'), 5, 'cards without tags are "not bug" too');
  assert.equal(count('cards where tag is empty'), 2);
  assert.equal(count('cards where list in ("En curso", "Por hacer")'), 4);
  assert.equal(count('cards where list not in ("Resuelto")'), 4);
  assert.equal(count('cards where (priority = Alta or priority = Media) and not done'), 3);
  assert.equal(count('cards where not (done or overdue)'), 3);
  assert.equal(count('cards where priority = alta and points >= 5'), 1);
});

test('numbers and custom fields', () => {
  assert.equal(count('cards where points > 3'), 2);
  assert.equal(count('cards where points between 3 and 5'), 3);
  assert.equal(count('cards where points is empty'), 2);
  assert.equal(count('cards where cf.Cliente = acme'), 1);
  assert.equal(count('cards where cf.Horas >= 4'), 2);
  assert.deepEqual(rows('cards where cf.Horas is not empty count, sum(cf.Horas)'), ['2|10']);
});

test('group by: list, tag, priority, weeks, two dimensions; unassigned and untagged get a row', () => {
  assert.deepEqual(rows('cards group by list count, sum(points)'), ['Resuelto|3|10', 'En curso|2|11', 'Por hacer|2|0']);
  assert.deepEqual(rows('cards group by tag count').filter((r) => /\|2$/.test(r)).sort(), ['(no tag)|2', 'auth|2', 'bug|2']);
  assert.ok(rows('cards group by tag count').includes('(no tag)|2'));
  assert.ok(rows('cards group by assignee count').includes('(unassigned)|1'));
  assert.deepEqual(rows('cards where done group by week(done)'), ['2025-12-15|1', '2026-03-09|1', '2026-03-16|1'], 'weeks, oldest first');
  assert.deepEqual(rows('cards where done group by month(done)'), ['2025-12|1', '2026-03|2']);
  assert.deepEqual(rows('cards where done group by list, assignee'), ['Resuelto|Ana Ruiz|2', 'Resuelto|Luis Pérez|1', 'Resuelto|Pepe|1']);
  assert.deepEqual(rows('cards group by priority count').sort(), ['(none)|2', 'Alta|3', 'Media|2']);
  assert.equal(rows('cards where due is not empty group by day(due)').length, 4);
});

test('metrics, ordering and limit', () => {
  assert.deepEqual(rows('cards avg(points)'), ['4.2']);
  assert.deepEqual(rows('cards sum(points), min(points), max(points)'), ['21|2|8']);
  assert.deepEqual(rows('cards group by list percent'), ['Resuelto|42.9', 'En curso|28.6', 'Por hacer|28.6']);
  assert.deepEqual(rows('cards group by list count order by count asc'), ['En curso|2', 'Por hacer|2', 'Resuelto|3']);
  assert.deepEqual(rows('cards group by list count order by key desc'), ['Resuelto|3', 'Por hacer|2', 'En curso|2']);
  assert.deepEqual(rows('cards group by list count limit 1'), ['Resuelto|3']);
  assert.deepEqual(rows('cards group by list order by sum(points) desc'), ['En curso|2|11', 'Resuelto|3|10', 'Por hacer|2|0'], 'count stays; sum is an extra column');
});

test('scripts: let / from / show, titles, several results', () => {
  const out = run(`
    let mine = cards where assignee = me and not done
    show mine group by list as "Mis abiertas"
    cards where done group by assignee   // resolved by person
  `);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Mis abiertas');
  assert.deepEqual(out[0].result.rows.map((r) => r.labels.concat(String(r.values[0])).join('|')), ['Por hacer|1']);
  assert.deepEqual(out[1].result.rows.map((r) => `${r.labels[0]}|${r.values[0]}`), ['Ana Ruiz|2', 'Luis Pérez|1', 'Pepe|1']);
  assert.equal(runKql('let a = cards where done; from a where assignee = me group by list', cards, ctx)[0].result.matched, 2);
  assert.deepEqual(
    runKql('cards where done\n  and assignee = me\n  group by list\n  count', cards, ctx)[0].result.rows[0].values,
    [2],
    'a query can continue on the next lines',
  );
});

test('Spanish keywords and field names', () => {
  assert.deepEqual(rows('tarjetas donde hecho y asignado = yo agrupar por lista'), ['Resuelto|2']);
  assert.equal(count('tarjetas donde vence en próximos 7d'), 1);
  assert.equal(count('cards donde etiqueta = bug y lista = "En curso"'), 1);
  assert.equal(count('cards where vencido'), 1);
  assert.equal(count('cards where done en esta semana'), 1);
});

test('filter box expressions', () => {
  assert.deepEqual(filterCards('done and assignee = me', cards, ctx).map((c) => c.id), ['c1', 'c2']);
  assert.equal(filterCards('', cards, ctx).length, 7);
  assert.equal(filterCards('where overdue', cards, ctx).length, 1);
  assert.throws(() => parseKqlFilter('done and'), KqlError);
  assert.throws(() => parseKqlFilter('done group by list'), KqlError, 'only a condition is accepted');
});

test('chart data from a result', () => {
  const [{ result }] = run('cards group by list count, sum(points)');
  assert.deepEqual(toChartData(result), [
    { name: 'Resuelto', count: 3, 'sum(points)': 10 },
    { name: 'En curso', count: 2, 'sum(points)': 11 },
    { name: 'Por hacer', count: 2, 'sum(points)': 0 },
  ]);
  assert.deepEqual(toChartData(run('cards count')[0].result), [{ name: 'total', count: 7 }]);
});

test('errors are readable and carry a position', () => {
  const fails = (source: string, pattern: RegExp) => assert.throws(() => run(source), (e: unknown) => e instanceof KqlError && pattern.test(e.message), source);
  fails('cards where due < 7d', /sign/);
  fails('cards where title = "abc', /Unterminated/);
  fails('cards where due in last 3x', /Unknown unit/);
  fails('cards group by title', /Cannot group by/);
  fails('cards sum(title)', /number field/);
  fails('cards where', /condition|Unexpected|Expected/);
  fails('cards where nope = 3', /Unexpected/);
  fails('', /empty/);
  fails('from nobody group by list', /Unknown name "nobody"/);
  fails('let x = cards group by list\nfrom x', /plain selection/);
  fails('cards where title < "a"', /does not work on text/);
  fails('cards where points > "abc"', /not a number/);
  fails('cards where due = soon', /expected a date/);
  fails('cards where done in last 5y group by', /Expected what to group by/);
  fails('cards where (done', /Expected "\)"/);
  fails('let a = cards where done', /no result/);
  assert.throws(() => run('cards where title ~'), (e: unknown) => e instanceof KqlError && typeof e.position === 'number');
});

test('safety: oversized input, nested repetitions in a regex, too many statements, no code execution', () => {
  assert.throws(() => run('cards where title contains "' + 'a'.repeat(7000) + '"'), /too long/);
  assert.throws(() => run('cards where title ~ /(a+)+$/'), /nested repetitions/);
  assert.throws(() => run('cards where title ~ /(.*)*x/'), /nested repetitions/);
  assert.throws(() => run('cards where title ~ /(abc/'), /Invalid regular expression/);
  assert.throws(() => run('cards where title ~ "' + 'x'.repeat(250) + '"'), /too long/);
  assert.throws(() => run(Array.from({ length: 40 }, () => 'cards count').join('\n')), /at most/);
  assert.equal(count('cards where title contains "process.exit(1)"'), 0, 'text is only ever compared, never executed');
  assert.equal(count('cards where title ~ /^bug/'), 2);
  assert.throws(() => run('cards where ((((((((((((((done))))))))))))))'), /nested too deeply/);
});

test('every example in the AI guide parses and runs', () => {
  const lines = KQL_SYNTAX_GUIDE.split('\n').filter((l) => /^  (cards|let|show) /.test(l) && !/[<\[]|\.\.\./.test(l));
  assert.ok(lines.length >= 5);
  for (const line of lines) {
    const query = line.trim().replace(/\s+--.*$/, '');
    if (/^let /.test(query)) continue;
    assert.doesNotThrow(() => run(query), query);
  }
});
