import assert from 'node:assert/strict';
import test from 'node:test';

import { KQL_SYNTAX_GUIDE, KqlError, runKql, type KqlCard, type KqlContext, type KqlData } from './kql.ts';

const ctx: KqlContext = { now: new Date('2026-03-18T12:00:00Z'), users: [{ id: 'ana', name: 'Ana' }] };

const card = (id: string, board: string, boardId: string, list: string, listId: string, extra: Partial<KqlCard> = {}): KqlCard => ({
  id, title: id, board, list, fields: { board_id: boardId, list_id: listId }, ...extra,
});
const cards: KqlCard[] = [
  card('q1', 'Tablero QA', 'b1', 'En QA', 'l1', { due: '2026-03-01' }),
  card('q2', 'Tablero QA', 'b1', 'En QA', 'l1'),
  card('q3', 'Tablero QA', 'b1', 'Hecho', 'l3', { done: true }),
  card('s1', 'Soporte', 'b2', 'En QA', 'l2', { assignees: ['ana'] }),
  card('s2', 'Soporte', 'b2', 'En QA', 'l2', { assignees: ['ana'], due: '2026-03-02' }),
];
const data: KqlData = {
  cards,
  scopes: {
    boards: [{ id: 'b1', name: 'Tablero QA' }, { id: 'b2', name: 'Soporte' }, { id: 'b3', name: 'Vacío' }],
    lists: [
      { id: 'l1', name: 'En QA', boardId: 'b1' }, { id: 'l2', name: 'En QA', boardId: 'b2' },
      { id: 'l3', name: 'Hecho', boardId: 'b1' }, { id: 'l4', name: 'Backlog', boardId: 'b3' },
    ],
  },
  sources: { members: [{ id: 'ana', title: 'Ana', fields: { role: 'dev' } }] },
  tables: [{ id: 't1', title: 'Ventas', kind: 'table', columns: ['Monto'], rows: [{ id: 'r1', title: 'x', fields: { Monto: 5 } }] }],
};
const run = (q: string) => runKql(q, data, ctx);
const first = (q: string) => run(q)[0].result;
const n = (q: string) => first(q).rows[0].values[0];
const rows = (q: string) => first(q).rows.map((r) => [...r.labels, ...r.values].join('|'));
const fails = (q: string, re: RegExp) => assert.throws(() => run(q), (e: unknown) => e instanceof KqlError && re.test(e.message), `${q} -> expected ${re}`);

test('qualifiers: board, list, both, path, id, several values', () => {
  assert.equal(n('cards in board "Tablero QA" count'), 3);
  assert.equal(n('cards in list "Hecho" count'), 1, 'a list name that is unique needs no board');
  assert.equal(n('cards in board "Tablero QA" list "En QA" count'), 2);
  assert.equal(n('cards in board "Soporte" list "En QA" count'), 2);
  assert.equal(n('cards in "Tablero QA / En QA" count'), 2, 'path form');
  assert.equal(n('cards in "Soporte / En QA" count'), 2);
  assert.equal(n('cards in "Soporte" count'), 2, 'a path of one part is a board');
  assert.equal(n('cards in board id "b1" count'), 3);
  assert.equal(n('cards in list id "l2" count'), 2);
  assert.equal(n('cards in board "Tablero QA", "Soporte" count'), 5);
  assert.equal(n('cards in list "Hecho", "Backlog" count'), 1);
  assert.equal(n('cards in board "Tablero QA" list "En QA", "Hecho" count'), 3);
  assert.equal(n('cards in "Tablero QA / En QA", "Soporte / En QA" count'), 4);
  assert.equal(n('cards in board "Tablero QA" where done count'), 1);
  assert.deepEqual(rows('cards in board "Tablero QA" group by list count'), ['En QA|2', 'Hecho|1'], 'groups only see the scope');
});

test('qualifiers ignore case and accents, and work in Spanish', () => {
  assert.equal(n('cards in board "tablero qa" count'), 3);
  assert.equal(n('cards en tablero "TABLERO QA" lista "en qa" count'), 2);
  assert.equal(n('cards en tablero "vacio" count'), 0, 'accent-insensitive; an empty board is resolvable');
  assert.deepEqual(first('cards in board "Vacío" group by list count').rows, []);
  assert.equal(n('cards in list "backlog" count'), 0, 'an empty list is resolvable');
  assert.equal(n('cards\nin board "Soporte"\ncount'), 2, 'a new line continues the query');
});

test('ambiguity lists every candidate with its parent and id', () => {
  try {
    run('cards in list "En QA" count');
    assert.fail('should be ambiguous');
  } catch (e) {
    assert.ok(e instanceof KqlError);
    assert.match(e.message, /"En QA" is ambiguous/);
    assert.match(e.message, /list "En QA" of board "Tablero QA" \(id l1\)/);
    assert.match(e.message, /list "En QA" of board "Soporte" \(id l2\)/);
    assert.match(e.message, /Use cards in board "Tablero QA" list "En QA" or cards in list id "l1"/);
  }
  const dup: KqlData = { cards: [], scopes: { boards: [{ id: 'x1', name: 'Igual' }, { id: 'x2', name: 'Igual' }], lists: [] } };
  assert.throws(() => runKql('cards in board "Igual" count', dup, ctx), /"Igual" is ambiguous: board "Igual" \(id x1\), board "Igual" \(id x2\)/);
  assert.equal(runKql('cards in board id "x2" count', dup, ctx)[0].result.rows[0].values[0], 0);
});

test('unknown names suggest the closest one and list what exists in that scope', () => {
  fails('cards in board "Tablero Q" count', /Unknown board "Tablero Q"\. Did you mean "Tablero QA"\? Available boards: "Tablero QA", "Soporte", "Vacío"/);
  fails('cards in list "Hecko" count', /Unknown list "Hecko"\. Did you mean "Hecho"\?/);
  fails('cards in board "Soporte" list "Hecho" count', /Unknown list "Hecho"\. Available lists: "En QA"/);
  fails('cards in board id "nope" count', /Unknown board id "nope"/);
  fails('cards in "A / B / C" count', /A scope path is "Board \/ List"/);
  fails('cards in count', /Expected board, list or a "Board \/ List" path/);
  assert.throws(() => runKql('cards in board "X" count', { cards: [] }, ctx), /There are no boards to read here/);
});

test('where list = "Board / List" is precise on demand, a plain name stays permissive', () => {
  assert.equal(n('cards where list = "En QA" count'), 4);
  assert.equal(n('cards where list = "Tablero QA / En QA" count'), 2);
  assert.equal(n('cards where list = "soporte / en qa" count'), 2);
  assert.equal(n('cards where list != "Tablero QA / En QA" count'), 3);
  assert.equal(n('cards where list in ("Soporte / En QA", "Hecho") count'), 3);
});

test('path field: group by path, select path', () => {
  assert.deepEqual(rows('cards group by path count'), ['Soporte / En QA|2', 'Tablero QA / En QA|2', 'Tablero QA / Hecho|1']);
  assert.deepEqual(first('cards where id = "q3" select path').rows.map((r) => r.cells[0]), ['Tablero QA / Hecho']);
  assert.equal(n('cards where path contains "soporte" count'), 2);
  assert.equal(n('cards where path = "Tablero QA / Hecho" count'), 1);
});

test('result scope: label, source, cards in scope, qualifiers; total vs matched', () => {
  const whole = first('cards where overdue count').scope!;
  assert.deepEqual(whole, { source: 'cards', label: 'whole team', cards: 5, qualifiers: [] });
  const board = first('cards in board "Tablero QA" where done').scope!;
  assert.deepEqual(board, { source: 'cards', label: 'Tablero QA', cards: 3, qualifiers: [{ kind: 'board', name: 'Tablero QA', id: 'b1' }] });
  const both = first('cards in board "Soporte" list "En QA" count').scope!;
  assert.equal(both.label, 'Soporte / En QA');
  assert.deepEqual(both.qualifiers, [{ kind: 'board', name: 'Soporte', id: 'b2' }, { kind: 'list', name: 'En QA', id: 'l2' }]);
  assert.equal(first('cards in "Tablero QA / En QA" count').scope!.label, 'Tablero QA / En QA');
  assert.equal(first('cards in board "Tablero QA", "Soporte" count').scope!.label, 'Tablero QA + Soporte');
  const r = first('cards in board "Tablero QA" where done');
  assert.equal(r.total, 3, 'total = cards in scope');
  assert.equal(r.matched, 1, 'matched = after where');
  assert.deepEqual(first('members count').scope, { source: 'members', label: 'members', cards: 1, qualifiers: [] });
  assert.deepEqual(first('rows of "Ventas" count').scope, { source: 'Ventas', label: 'Ventas', cards: 1, qualifiers: [] });
  assert.equal(first('cards in board "Vacío" count').scope!.cards, 0);
  assert.equal(first('cards group by list pivot board count').scope!.cards, 5, 'also on reshaped results');
});

test('scoped sources compose with let, join and ids that the records carry', () => {
  assert.equal(n('let a = cards in board "Soporte" where overdue\nfrom a count'), 1);
  assert.equal(n('cards in board "Soporte" join members on assignee = id count'), 2);
  assert.deepEqual(rows('cards in board "Soporte" join members on assignee = id group by members.role count'), ['dev|2']);
  assert.equal(n('cards in board "Tablero QA" join members on assignee = id left count'), 3);
  // without declared scopes the boards and lists come from the cards themselves (by id when they have it, else by name)
  assert.equal(runKql('cards in board "Soporte" list "En QA" count', cards, ctx)[0].result.rows[0].values[0], 2);
  const plain: KqlCard[] = [{ id: 'a', title: 'a', board: 'B1', list: 'L' }, { id: 'b', title: 'b', board: 'B2', list: 'L' }];
  assert.equal(runKql('cards in "B1 / L" count', plain, ctx)[0].result.rows[0].values[0], 1);
  assert.throws(() => runKql('cards in list "L" count', plain, ctx), /"L" is ambiguous: list "L" of board "B1", list "L" of board "B2"/);
});

test('the guide documents scopes and its examples still run', () => {
  for (const word of ['cards in board', 'list id', 'is ambiguous'.slice(0, 0) + 'Board / List', 'path', 'tablero']) assert.ok(KQL_SYNTAX_GUIDE.includes(word), word);
  for (const line of KQL_SYNTAX_GUIDE.split('\n')) assert.ok(line.length <= 175, `guide line too long (${line.length})`);
});

test('a qualified path also works after "list"', () => {
  assert.equal(n('cards in list "Tablero QA / En QA" count'), 2);
  assert.equal(n('cards in list "Soporte / En QA", "Tablero QA / Hecho" count'), 3);
});
