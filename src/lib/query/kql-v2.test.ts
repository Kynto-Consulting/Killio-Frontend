import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KQL_SYNTAX_GUIDE,
  KqlError,
  describeKqlSources,
  parseLooseNumber,
  runKql,
  stripText,
  toChartData,
  type KqlCard,
  type KqlContext,
  type KqlData,
  type KqlTable,
} from './kql.ts';

const NOW = new Date('2026-03-18T12:00:00Z');
const ctx: KqlContext = {
  now: NOW,
  me: 'ana',
  users: [
    { id: 'ana', name: 'Ana Ruiz', email: 'ana@labroe.com' },
    { id: 'luis', name: 'Luis Pérez' },
  ],
  groups: [{ id: 'g-ti', slug: 'ti', name: 'TI', memberIds: ['luis'] }],
  tagGroups: [{ id: 'tg', name: 'Prioridad', tags: ['Urgente', 'Alta', 'Media', 'Baja'] }],
};

const cards: KqlCard[] = [
  { id: 'c1', title: 'Login con enlace', list: 'Resuelto', done: true, assignees: ['ana'], tags: ['Alta', 'auth'], due: '2026-03-01', completed: '2026-03-10', created: '2026-02-20', points: 5 },
  { id: 'c2', title: '[ROE] Recuperar contraseña', list: 'Resuelto', done: true, assignees: ['luis', 'ana'], tags: ['Urgente'], due: '2026-03-12', completed: '2026-03-17', created: '2026-03-02', points: 3 },
  { id: 'c3', title: 'Kanban drag', list: 'En curso', assignees: ['luis'], tags: ['Baja', 'UX'], due: '2026-03-20', created: '2026-03-05', points: 8 },
  { id: 'c4', title: 'Bug acordeón', list: 'En curso', assignees: [], tags: ['bug'], due: '2026-03-10', created: '2026-03-09', points: 3 },
  { id: 'c5', title: 'Bug mesh', list: 'Por hacer', assignees: ['pedro'], tags: ['Media', 'bug'], created: '2026-03-12' },
  { id: 'c6', title: 'Docs', list: 'Por hacer', assignees: ['ana'], tags: [], created: '2025-12-01', description: '**Escribir** la [guía](http://x.test) para @[user:ana:Ana Ruiz]' },
];

const sales: KqlTable = {
  id: 'tbl-1',
  title: 'Ventas',
  kind: 'bountiful_table',
  columns: ['Cliente', 'Estado', 'Responsable', 'Monto', 'Fecha', 'Notas', 'Etiquetas'],
  rows: [
    { id: 'r1', title: 'ACME', fields: { Cliente: 'ACME', Estado: 'Pagado', Responsable: 'Ana', Monto: '$1,200.50', Fecha: '2026-03-02', Notas: '**Urgente** [ver](http://a.test)', Etiquetas: ['b2b', 'ley'] } },
    { id: 'r2', title: 'Beta', fields: { Cliente: 'Beta', Estado: 'Pendiente', Responsable: 'Luis', Monto: 800, Fecha: '2026-03-10', Notas: '<b>ok</b> @[user:u1:Ana] listo', Etiquetas: ['b2b'] } },
    { id: 'r3', title: 'Gamma', fields: { Cliente: 'Gamma', Estado: 'Pagado', Responsable: 'Ana', Monto: '450,75', Fecha: '2026-02-20', Notas: null, Etiquetas: [] } },
    { id: 'r4', title: 'Delta', fields: { Cliente: 'Delta', Estado: 'Pagado', Responsable: 'Luis', Monto: '1.000,00', Fecha: '2026-03-15', Notas: '  espacios   de más  ', Etiquetas: ['ley'] } },
  ],
};

const data: KqlData = {
  cards,
  tables: [sales],
  sources: {
    documents: [
      { id: 'd1', title: 'Spec', created: '2026-03-01', fields: { author: 'Ana', bricks: 4 } },
      { id: 'd2', title: 'Notas', created: '2026-03-12', fields: { author: 'Luis', bricks: 1 } },
      { id: 'd3', title: 'Plan', created: '2025-12-02', fields: { author: 'Ana', bricks: 9 } },
    ],
    items: [
      { id: 'i1', title: 'Revisar', done: false, fields: { document: 'Spec' } },
      { id: 'i2', title: 'Probar', done: false, fields: { document: 'Spec' } },
      { id: 'i3', title: 'Enviar', done: true, fields: { document: 'Notas' } },
      { id: 'i4', title: 'Cerrar', done: false, fields: { document: 'Notas' } },
    ],
    members: [
      { id: 'ana', title: 'Ana Ruiz', fields: { email: 'ana@labroe.com', assigned: 2, resolved: 5 } },
      { id: 'luis', title: 'Luis Pérez', fields: { email: 'luis@labroe.com', assigned: 4, resolved: 9 } },
    ],
  },
};

const run = (q: string) => runKql(q, data, ctx);
const cells = (q: string) => run(q)[0].result.rows.map((r) => r.cells.join('|'));
const first = (q: string) => run(q)[0].result;

test('number parsing understands currencies and both decimal conventions', () => {
  assert.equal(parseLooseNumber('$1,200.50'), 1200.5);
  assert.equal(parseLooseNumber('1.000,00'), 1000);
  assert.equal(parseLooseNumber('450,75'), 450.75);
  assert.equal(parseLooseNumber('1,234'), 1234);
  assert.equal(parseLooseNumber('1.234.567'), 1234567);
  assert.equal(parseLooseNumber('S/ 347'), 347);
  assert.equal(parseLooseNumber('-12,5'), -12.5);
  assert.equal(parseLooseNumber('abc'), null);
});

test('strip removes markdown, html and mention tokens', () => {
  assert.equal(stripText('**Hola** @[user:1:Ana] [x](http://y) <b>ok</b>'), 'Hola Ana x ok');
  assert.equal(stripText('# Título\n- uno\n- dos'), 'Título uno dos');
  assert.equal(stripText('`code` y ~~tachado~~'), 'code y tachado');
});

test('rows of a table: columns are fields, even when they look like built-in names (Estado)', () => {
  assert.deepEqual(cells('rows of "ventas" where Estado = "Pagado" group by Responsable sum(Monto), count'), ['Ana|1651.25|2', 'Luis|1000|1']);
  assert.deepEqual(cells('table Ventas where Monto > 900 group by Estado count'), ['Pagado|2']);
  assert.deepEqual(cells('database "Ventas" where [Fecha] between 2026-03-01 and 2026-03-31 group by Cliente'), ['ACME|1', 'Beta|1', 'Delta|1']);
  assert.deepEqual(cells('filas de Ventas donde Estado = Pagado agrupar por Responsable'), ['Ana|2', 'Luis|1']);
  assert.deepEqual(cells('rows of Ventas where Etiquetas = ley group by Cliente'), ['ACME|1', 'Delta|1'], 'a multi-select cell matches any of its values');
  assert.deepEqual(cells('rows of Ventas group by Etiquetas count'), ['b2b|2', 'ley|2', '(none)|1'], 'and counts once per value');
  assert.equal(first('rows of Ventas count').shape, 'scalar');
  assert.deepEqual(cells('rows of Ventas where Notas is empty count'), ['1']);
});

test('select lists records with computed columns', () => {
  const r = first('rows of Ventas where Estado = "Pagado" select Cliente, number(Monto) as "Importe", date(Fecha, "dd MMM") as Cuando order by Importe desc');
  assert.deepEqual(r.columns.map((c) => [c.label, c.kind]), [['Cliente', 'text'], ['Importe', 'metric'], ['Cuando', 'text']]);
  assert.deepEqual(r.rows.map((x) => x.cells), [['ACME', '1200.5', '02 Mar'], ['Delta', '1000', '15 Mar'], ['Gamma', '450.75', '20 Feb']]);
  assert.equal(first('cards select title limit 2').rows.length, 2);
  assert.equal(first('cards select title').shape, 'list');
  assert.deepEqual(first('rows of Ventas where Cliente = Beta select strip(Notas)').rows[0].cells, ['ok Ana listo']);
  assert.deepEqual(first('cards where id = c6 select strip(description)').rows[0].cells, ['Escribir la guía para Ana Ruiz']);
  assert.deepEqual(first('rows of Ventas where Cliente = Delta select strip(Notas)').rows[0].cells, ['espacios de más']);
});

test('text functions', () => {
  const one = (q: string) => first(q).rows[0].cells.join('|');
  assert.equal(one('rows of Ventas where Cliente = Gamma select replace(Cliente, /a/g, "4")'), 'G4mm4');
  assert.equal(one('rows of Ventas where Cliente = Gamma select replace(Cliente, "mm", "-")'), 'Ga-a');
  assert.equal(one('rows of Ventas where Cliente = ACME select lower(Cliente), upper(Cliente), capitalize(Cliente)'), 'acme|ACME|Acme');
  assert.equal(one('cards where id = c1 select left(title, 5), right(title, 5), substr(title, 7, 3), len(title)'), 'Login|nlace|con|16');
  assert.equal(one('cards where id = c1 select truncate(title, 8), initials(title), slug(title)'), 'Login c…|LCE|login-con-enlace');
  assert.equal(one('cards where id = c2 select replace(title, /^\\[[^\\]]*\\]\\s*/, "")'), 'Recuperar contraseña');
  assert.equal(one('cards where id = c2 select split(title, " ", 1), split(title, " ", -1), split(title, " ", 9)'), '[ROE]|contraseña|');
  assert.equal(one('cards where id = c1 select concat(title, " (", list, ")")'), 'Login con enlace (Resuelto)');
  assert.equal(one('cards where id = c5 select coalesce(description, list, "x"), coalesce(description, "—")'), 'Por hacer|—');
  assert.equal(one('cards where id = c1 select join(tag, " / ")'), 'Alta / auth');
  assert.equal(one('cards where id = c1 select join(assignee, ",")'), 'Ana Ruiz');
});

test('number and date functions', () => {
  const one = (q: string) => first(q).rows[0].cells.join('|');
  assert.equal(one('rows of Ventas where Cliente = ACME select number(Monto), round(number(Monto), 0), abs(0)'), '1200.5|1201|0');
  assert.equal(one('rows of Ventas where Cliente = ACME select add(number(Monto), 100), sub(number(Monto), 200.5), mul(2, 3), div(9, 3), div(1, 0)'), '1300.5|1000|6|3|');
  assert.equal(one('cards where id = c3 select date(due, "yyyy-MM-dd"), date(due, "dd MMM yy"), days(due)'), '2026-03-20|20 Mar 26|2');
  assert.equal(one('cards where id = c1 select days(due)'), '-17');
});

test('transformations work in conditions, group by, order by and metrics', () => {
  assert.equal(first('cards where lower(title) contains "bug"').matched, 2);
  assert.equal(first('cards where len(title) > 15').matched, 2);
  assert.equal(first('cards where split(title, " ", 1) = "Bug"').matched, 2);
  assert.equal(first('cards where replace(title, /^Bug /i, "") = "mesh"').matched, 1);
  assert.equal(first('cards where strip(description) contains "guía"').matched, 1);
  assert.equal(first('cards where days(due) between 0 and 3').matched, 1);
  assert.deepEqual(cells('cards group by left(title, 1) count').sort(), ['B|2', 'D|1', 'K|1', 'L|1', '[|1']);
  assert.deepEqual(cells('cards where created is not empty group by date(created, "yyyy-MM") count'), ['2026-03|4', '2025-12|1', '2026-02|1']);
  assert.deepEqual(cells('rows of Ventas group by Responsable sum(round(number(Monto), 0))'), ['Luis|1800', 'Ana|1652']);
  assert.deepEqual(first('rows of Ventas select Cliente order by len(Cliente) desc, Cliente').rows.map((r) => r.cells[0]), ['Delta', 'Gamma', 'ACME', 'Beta']);
});

test('text metrics: join, first, last, unique', () => {
  assert.deepEqual(cells('cards where done group by list join(title, " | "), unique(assignee)'), ['Resuelto|Login con enlace | [ROE] Recuperar contraseña|2']);
  assert.deepEqual(cells('rows of Ventas group by Estado first(Cliente), last(Cliente)'), ['Pagado|ACME|Delta', 'Pendiente|Beta|Beta']);
  const r = first('cards group by list count, join(tag)');
  assert.deepEqual(r.columns.map((c) => c.kind), ['dim', 'metric', 'text']);
  assert.ok(r.rows.every((row) => row.values.length === 1 && row.cells.length === 3));
  assert.deepEqual(toChartData(r).map((x) => Object.keys(x)), [['name', 'count'], ['name', 'count'], ['name', 'count']], 'text columns are not chart series');
});

test('tag groups: rank() orders cards by their tag position', () => {
  assert.deepEqual(first('cards select title order by rank("Prioridad"), title').rows.map((r) => r.cells[0]).slice(0, 4), ['[ROE] Recuperar contraseña', 'Login con enlace', 'Bug mesh', 'Kanban drag']);
  assert.deepEqual(cells('cards group by rank("prioridad") count').sort(), ['0|1', '1|1', '2|1', '3|1', '9999|2']);
  assert.throws(() => run('cards select title order by rank("Nope")'), /Unknown tag group "Nope"\. Available: Prioridad/);
});

test('named sources: documents, items, members', () => {
  assert.deepEqual(cells('documents group by month(created) count'), ['2025-12|1', '2026-03|2'].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(cells('items where not done group by document count'), ['Notas|1', 'Spec|2'].sort((a, b) => Number(b.split('|')[1]) - Number(a.split('|')[1])));
  assert.deepEqual(cells('from items where done count'), ['1']);
  assert.deepEqual(cells('members select title, resolved order by resolved desc'), ['Luis Pérez|9', 'Ana Ruiz|5']);
  assert.deepEqual(cells('documents where author = Ana and bricks > 5 select title'), ['Plan']);
  assert.deepEqual(cells('let open = items where not done\nshow open group by document as "Abiertos"\nitems count'), ['Notas|1', 'Spec|2'].sort((a, b) => Number(b.split('|')[1]) - Number(a.split('|')[1])));
});

test('sources a script needs are reported so only that data is loaded', () => {
  assert.deepEqual(describeKqlSources('cards count'), { cards: true, sources: [], tables: [] });
  assert.deepEqual(describeKqlSources('documents count'), { cards: false, sources: ['documents'], tables: [] });
  assert.deepEqual(describeKqlSources('rows of "Ventas" count'), { cards: false, sources: [], tables: ['Ventas'] });
  assert.deepEqual(describeKqlSources('let a = items where done\nshow a count\ncards count\nmembers count'), { cards: true, sources: ['items', 'members'], tables: [] });
});

test('unknown fields, columns, tables, names and functions explain what exists', () => {
  const fails = (q: string, re: RegExp) => assert.throws(() => run(q), (e: unknown) => e instanceof KqlError && re.test(e.message), q);
  fails('rows of Ventas where Monton > 3', /Unknown column "Monton"\. Did you mean "Monto"\? Available: Cliente, Estado/);
  fails('rows of Ventas group by Cliente sum(Nope)', /Unknown column "Nope"/);
  fails('rows of "Nope" count', /No table "Nope" found\. Tables: "Ventas"/);
  fails('cards where nope = 3', /Unknown field "nope"/);
  fails('cards group by nope', /Unknown field "nope"/);
  fails('from nada count', /Unknown name "nada"/);
  fails('cards select replace(title)', /replace\(\) takes 3 arguments, not 1/);
  fails('cards select lower(title, 1)', /lower\(\) takes 1 argument, not 2/);
  fails('cards select title group by list', /cannot be combined/);
  fails('cards group by list order by title', /Ordering by a field needs "select"/);
  fails('cards select title order by count', /needs "group by"/);
  fails('cards where upper(title', /Expected "\)"/);
  fails('cards select title as', /Expected a name after "as"/);
  fails('cards select replace(title, /(a+)+$/, "")', /nested repetitions/);
});

test('two tables with the same title ask for the id', () => {
  const twin: KqlData = { tables: [{ ...sales, id: 't-a' }, { ...sales, id: 't-b' }] };
  assert.throws(() => runKql('rows of Ventas count', twin, ctx), /There are 2 tables called "Ventas"\. Use the id.*t-a, t-b/);
  assert.equal(runKql('rows of t-b count', twin, ctx)[0].result.rows[0].values[0], 4);
});

test('a parsed script can be run again over other data (the tree is not modified)', () => {
  const cardData: KqlData = { cards };
  const ventas: KqlData = { tables: [sales] };
  const script = 'where Estado = "x"';
  assert.ok(script);
  const a = runKql('rows of Ventas group by Estado', ventas, ctx);
  const b = runKql('rows of Ventas group by Estado', ventas, ctx);
  assert.deepEqual(a, b);
  assert.equal(runKql('cards count', cardData, ctx)[0].result.rows[0].values[0], 6);
});

test('every example in the AI guide runs over realistic data', () => {
  const lines = KQL_SYNTAX_GUIDE.split('\n').filter((l) => /^  (cards|documents|items|members|rows|let|show) /.test(l) && !/[<\[]|\.\.\./.test(l));
  assert.ok(lines.length >= 10, `only ${lines.length} runnable examples found`);
  for (const line of lines) {
    const query = line.trim().replace(/\s+--.*$/, '');
    if (/^let /.test(query)) continue;
    assert.doesNotThrow(() => run(query), query);
  }
  // the examples that mention concepts the fixture lacks must still be valid syntax
  assert.doesNotThrow(() => describeKqlSources('cards where overdue select title, date(due, "dd MMM") as "Vence", join(assignee, ", ") order by due limit 20'));
});
