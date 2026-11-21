import assert from 'node:assert/strict';
import test from 'node:test';

import { KQL_LIMITS, KQL_SYNTAX_GUIDE, KqlError, filterCards, runKql, type KqlCard, type KqlContext, type KqlData, type KqlTable } from './kql.ts';

const ctx: KqlContext = { now: new Date('2026-03-18T12:00:00Z') };

const table = (title: string, rows: Array<Record<string, string | number | boolean | null>>): KqlTable => ({
  id: `t-${title}`,
  title,
  kind: 'table',
  columns: [...new Set(rows.flatMap((r) => Object.keys(r)))],
  rows: rows.map((fields, i): KqlCard => ({ id: `${title[0].toLowerCase()}${i + 1}`, title: String(Object.values(fields)[0] ?? ''), fields })),
});

const cards: KqlCard[] = [
  { id: 'c1', title: 'Login', list: 'open', tags: ['urgente'], priority: 'high', created: '2026-03-01', due: '2026-03-05', points: 5, comments: 2, fields: { Horas: 4 } },
  { id: 'c2', title: 'Logout', list: 'done', tags: [], priority: 'low', created: '2026-03-10', due: '2026-03-05', points: 1, comments: 3, fields: { Horas: 9 } },
  { id: 'c3', title: 'Kanban', list: 'open', tags: ['x'], created: '2026-03-02', due: '2026-03-09', points: 8, comments: 0, fields: { Horas: 2 } },
];
const data: KqlData = {
  cards,
  tables: [
    table('Ventas', [
      { Cliente: 'A', Estado: 'Pagado', Monto: 1000, Costo: 400, Texto: '12' },
      { Cliente: 'B', Estado: 'Pendiente', Monto: 500, Costo: 600, Texto: '$1,200.50' },
      { Cliente: 'C', Estado: 'Pagado', Monto: 800, Costo: 100, Texto: 'abc' },
    ]),
    table('Limites', [{ Cliente: 'A', Limite: 900 }, { Cliente: 'B', Limite: 900 }, { Cliente: 'C', Limite: 700 }]),
    table('Cols', [{ Estado: 'Pagado', Pagado: 'Pagado' }, { Estado: 'Pagado', Pagado: 'Otro' }, { Estado: 'Otro', Pagado: 'Otro' }]),
    table('Pares', [{ Cliente: 'A', Nombre: 'a' }, { Cliente: 'B', Nombre: 'X' }]),
    table('Fechas', [{ Inicio: '2026-03-01', Fin: '2026-03-05' }, { Inicio: '2026-03-10', Fin: '2026-03-02' }, { Inicio: '2026-03-04', Fin: '2026-03-04' }]),
    table('Flags', [{ Id: 1, Activo: true }, { Id: 2, Activo: false }, { Id: 3, Activo: 'yes' }, { Id: 4, Activo: 'no' }, { Id: 5, Activo: null }]),
    table('Nulos', [{ V: 10 }, { V: null }, { V: 3 }]),
  ],
};
const run = (q: string) => runKql(q, data, ctx);
const result = (q: string) => run(q)[0].result;
const col = (q: string, i = 0) => result(q).rows.map((r) => r.cells[i]);
const cells = (q: string) => result(q).rows.map((r) => r.cells.join('/'));
const num = (q: string) => result(q).rows[0].values[0];
const fails = (q: string, re: RegExp) => assert.throws(() => run(q), (e: unknown) => e instanceof KqlError && re.test(e.message), `${q} -> expected ${re}`);
const V = 'rows of "Ventas"';

test('conditions as values: comparisons, and / or / not, in, between, is null', () => {
  assert.deepEqual(cells(`${V} select Cliente, Monto > 700 as "Alto"`), ['A/true', 'B/false', 'C/true']);
  assert.equal(result(`${V} select Monto > 700 as "Alto"`).columns[0].label, 'Alto');
  assert.equal(result(`${V} select Monto > 700`).columns[0].label, 'Monto > 700', 'the label is the expression as written');
  assert.deepEqual(col(`${V} select Monto > 700 and Costo < 500 as "ok"`), ['true', 'false', 'true']);
  assert.deepEqual(col(`${V} select Monto > 900 or Costo > 500`), ['true', 'true', 'false']);
  assert.deepEqual(col(`${V} select not Monto > 700`), ['false', 'true', 'false']);
  assert.deepEqual(col(`${V} select Estado = "Pagado" and (Monto > 900 or Costo < 200)`), ['true', 'false', 'true'], 'parentheses');
  assert.deepEqual(col(`${V} select Monto + Costo > 1300`), ['true', 'false', 'false'], 'arithmetic binds tighter than comparison');
  assert.deepEqual(col(`${V} select Cliente in ("A", "C")`), ['true', 'false', 'true']);
  assert.deepEqual(col(`${V} select Monto between 600 and 900`), ['false', 'false', 'true']);
  assert.deepEqual(col(`${V} select Cliente contains "B"`), ['false', 'true', 'false']);
  assert.deepEqual(col('rows of "Nulos" select V > 5'), ['true', 'false', 'false'], 'a null operand is false');
  assert.deepEqual(col('rows of "Nulos" select V is null'), ['false', 'true', 'false']);
  assert.deepEqual(col('rows of "Nulos" select V is not null'), ['true', 'false', 'true']);
  assert.deepEqual(col(`${V} select Texto + 0 > 5`), ['true', 'true', 'false'], 'an error cell in a comparison is false');
  assert.deepEqual(col(`${V} select if(Monto > 700 and Costo < 500, "x", "y")`), ['x', 'y', 'x'], 'if(cond, a, b) is unchanged');
  assert.deepEqual(col(`${V} select concat(Cliente, Monto > 700)`), ['Atrue', 'Bfalse', 'Ctrue'], 'also as a function argument');
});

test('conditions as values: group by, order by, functions, where on a boolean column', () => {
  assert.deepEqual(result(`${V} group by Monto > 700 count`).rows.map((r) => [...r.labels, ...r.values].join('|')), ['true|2', 'false|1']);
  assert.deepEqual(col(`${V} select Cliente order by Monto > 700, Cliente`), ['B', 'A', 'C']);
  assert.deepEqual(col(`fn alto(m) = m > 700\n${V} select alto(Monto)`), ['true', 'false', 'true']);
  assert.equal(num(`fn alto(m) = m > 700\n${V} where alto(Monto) count`), 2);
  assert.equal(num('rows of "Flags" where [Activo] count'), 2, 'a column alone is true-ish');
  assert.equal(num('rows of "Flags" where not [Activo] count'), 3);
  assert.equal(num('rows of "Flags" where Activo = true count'), 2, 'comparisons are unchanged');
  assert.equal(num(`${V} count_if(Monto > 700)`), 2, 'count_if stays');
  assert.equal(num(`${V} sum_if(Monto, Estado = "Pagado")`), 1800);
  assert.deepEqual(col('cards select points > 4 and not (list = "done")'), ['true', 'false', 'true']);
});

test('a bare word on the right of a comparison is a column when it names one', () => {
  assert.equal(num(`${V} where Monto > Costo count`), 2);
  assert.equal(num(`${V} where Costo >= Monto count`), 1);
  assert.equal(num(`${V} where Monto != Costo count`), 3);
  assert.equal(num('rows of "Pares" where Cliente = Nombre count'), 1, 'text columns compare ignoring case');
  assert.equal(num('rows of "Fechas" where Fin >= Inicio count'), 2, 'dates');
  assert.equal(num('rows of "Fechas" where Fin > Inicio count'), 1);
  assert.equal(num('rows of "Fechas" where Fin = Inicio count'), 1);
  assert.deepEqual(col(`${V} select Monto > Costo as "m"`), ['true', 'false', 'true']);
  assert.equal(num(`${V} join rows of "Limites" as c on Cliente = c.Cliente where Monto > c.Limite count`), 2, 'joined aliases');
  assert.equal(num(`${V} where Monto > [Costo] count`), 2, '[Costo] is always a column');
  assert.equal(num('cards where points > [Horas] count'), 2, '... also on cards');
  assert.equal(num(`${V} where Estado = Zzz count`), 0, 'an unknown word stays text, no error');
  assert.equal(num(`${V} where Estado = Pagado count`), 2, 'no column called Pagado: text, as before');
  assert.equal(num(`${V} where Estado = "Pagado" count`), 2);
  assert.equal(num(`${V} where Cliente = "Costo" count`), 0, 'quoted is always text');
  // cards: built-in fields compare, vocabulary fields keep bare words as text
  assert.equal(num('cards where points > comments count'), 2);
  assert.equal(num('cards where due > created count'), 2);
  assert.equal(num('cards where created > due count'), 1);
  assert.equal(num('cards where tag = urgente count'), 1, 'tag keeps bare words as text');
  assert.equal(num('cards where list = open count'), 2);
  assert.equal(num('cards where priority = high count'), 1);
  assert.equal(num('cards where list = comments count'), 0, 'even when the word is also a field');
  assert.equal(filterCards('points > comments', cards, ctx).length, 2, 'filter boxes too');
  assert.equal(filterCards('due > created and list = open', cards, ctx).length, 2);
  fails('cards where due = soon count', /expected a date/);
  fails('cards where points > nothing', /expected a number|not a number/);
});

test('a bare word that is also a column of a table: the column wins, with a warning', () => {
  const r = result('rows of "Cols" where Estado = Pagado count');
  assert.equal(r.rows[0].values[0], 2, 'compared with the column Pagado');
  assert.ok(r.warnings!.some((w) => /compares with the column "Pagado"; write "Pagado" in quotes/.test(w)), 'one-line hint');
  assert.equal(num('rows of "Cols" where Estado = "Pagado" count'), 2, 'quoted: the text');
  assert.equal(result('rows of "Cols" where Estado = "Pagado" count').warnings, undefined);
  assert.equal(result('cards where tag = urgente count').warnings, undefined, 'no hint for vocabulary fields');
});

test('regex limits: 1000 characters, heuristics, truncation, step budget', () => {
  assert.equal(KQL_LIMITS.maxRegex, 1000);
  assert.equal(num(`cards where match(title, /${'a'.repeat(900)}/) count`), 0, 'a 900 character pattern works');
  assert.equal(num(`cards where title ~ /${'a'.repeat(1000)}/ count`), 0);
  fails(`cards where match(title, /${'a'.repeat(1001)}/) count`, /too long \(max 1000 characters\)/);
  fails(`cards where title ~ "${'x'.repeat(1001)}" count`, /max 1000 characters/);
  fails('cards where match(title, /(a+)+$/) count', /nested repetitions/);
  fails('cards where match(title, /(.*a){20}/) count', /nested repetitions/);
  fails('cards where match(title, /(a|aa)+$/) count', /overlap/);
  fails('cards where match(title, /(a|a)*/) count', /overlap/);
  fails('cards where match(title, /(.|x)+/) count', /overlap/);
  fails('cards where match(title, /(a)\\1/) count', /Backreferences/);
  assert.equal(num('cards where match(title, /(log|kan)+/i) count'), 3, 'distinct alternatives may repeat');
  assert.equal(num(`cards where match(title, /${'(a)+'.repeat(20)}/) count`), 0, 'twenty repeated groups are fine');
  fails(`cards where match(title, /${'(a)+'.repeat(21)}/) count`, /too many groups \(max 20\)/);
  fails('cards select extract(title, "(a+)+")', /nested repetitions/);
  // values longer than 10000 characters are cut for matching, with a warning
  const long: KqlCard[] = [{ id: 'l1', title: `${'a'.repeat(10_000)}b` }, { id: 'l2', title: 'ab' }];
  const r = runKql('cards where match(title, /b/) count', long, ctx)[0].result;
  assert.equal(r.rows[0].values[0], 1, 'the b past the limit is not seen');
  assert.ok(r.warnings!.some((w) => /longer than 10000 characters was cut for matching/.test(w)));
  assert.ok(runKql('cards where title ~ /b$/ count', long, ctx)[0].result.warnings!.length > 0);
  assert.equal(runKql('cards select replace(title, /a/g, "x") limit 1', long, ctx)[0].result.rows[0].cells[0].length, 10_001, 'replace keeps the part past the limit');
  assert.equal(runKql('cards where match(title, /b/) count', [{ id: 'l3', title: 'ab' }], ctx)[0].result.warnings, undefined, 'no warning when nothing is cut');
  // the budget of regex tests per query
  const many: KqlCard[] = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, title: `t${i}` }));
  const saved = KQL_LIMITS.maxRegexTests;
  try {
    KQL_LIMITS.maxRegexTests = 50;
    assert.throws(() => runKql('cards where match(title, /x/) count', many, ctx), /more than 50 regular-expression tests/);
    assert.throws(() => runKql('cards where title ~ /x/ count', many, ctx), /regular-expression tests/);
    KQL_LIMITS.maxRegexTests = 150;
    assert.equal(runKql('cards where match(title, /x/) count\ncards where match(title, /y/) count', many, ctx).length, 2, 'the budget restarts with each query');
    assert.throws(() => runKql('cards where match(title, /x/) or match(title, /y/) count', many, ctx), /regular-expression tests/);
  } finally {
    KQL_LIMITS.maxRegexTests = saved;
  }
});

test('the guide documents these and its examples still run', () => {
  for (const word of ['Conditions are values too', 'Two columns', 'Regex limits', '1000 characters', '10000 characters', 'where [Activo]']) assert.ok(KQL_SYNTAX_GUIDE.includes(word), word);
  for (const line of KQL_SYNTAX_GUIDE.split('\n')) assert.ok(line.length <= 175, `guide line too long (${line.length}): ${line.slice(0, 60)}`);
});
