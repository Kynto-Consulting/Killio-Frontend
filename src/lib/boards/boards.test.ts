import assert from 'node:assert/strict';
import test from 'node:test';

import { applyBoardFilters, validateExpression } from './apply-filters.ts';
import { splitIntoCategories } from './categories.ts';
import { buildKqlContext, toKqlCard } from './kql-cards.ts';
import { appendCondition, buildExpression, parseQuickFromExpression } from './quick-filters.ts';
import { createListViewConfigStore, createSavedViewsStore, listViewsKey } from './view-storage.ts';
import type { KeyValueStorage } from './view-storage.ts';
import { filterCards, parseKqlFilter } from '../query/kql.ts';
import type { KqlCard } from '../query/kql.ts';

const NOW = new Date('2026-03-18T12:00:00Z'); // Wednesday
const ctx = buildKqlContext({
  me: 'ana',
  now: NOW,
  members: [{ id: 'ana', name: 'Ana Ruiz' }, { id: 'luis', name: 'Luis Pérez' }],
  groups: [{ id: 'g-ti', slug: 'ti', name: 'TI', memberUserIds: ['luis'] }],
});

const list = { id: 'l1', title: 'En curso' };
const tag = (name: string, tag_kind = 'custom') => ({ id: name, name, slug: name, color: null, tag_kind });

test('mapper: done rules, priority tag, assignee shapes, completed fallback', () => {
  const k = toKqlCard(
    { id: 'c1', title: 'A', status: 'active', dueAt: '2026-03-10', updatedAt: '2026-03-11', tags: [tag('bug'), tag('Alta', 'priority')], assignees: ['ana', { id: 'luis' }, { userId: 'pedro' }, { user_id: 'zoe' }, { nope: 1 }, 'ana'], commentsCount: 2 },
    { ...list, assignedGroupId: 'g-ti' },
    'Board',
  );
  assert.equal(k.done, false);
  assert.deepEqual(k.assignees, ['ana', 'luis', 'pedro', 'zoe']);
  assert.deepEqual(k.tags, ['bug']);
  assert.equal(k.priority, 'Alta');
  assert.deepEqual(k.groupIds, ['g-ti']);
  assert.equal(k.board, 'Board');
  assert.equal(k.list, 'En curso');
  assert.equal(k.completed, null);
  assert.equal(k.comments, 2);

  assert.equal(toKqlCard({ id: 'x', title: 'x', status: 'done', updatedAt: '2026-01-05' }, list).completed, '2026-01-05', 'done without completion date falls back to updatedAt');
  assert.equal(toKqlCard({ id: 'x', title: 'x', completedAt: '2026-01-02' }, list).done, true);
  assert.equal(toKqlCard({ id: 'x', title: 'x' }, { id: 'l', title: 'Resuelto' }).done, true, 'done-like list name');
  assert.equal(toKqlCard({ id: 'x', title: 'x' }, { id: 'l', title: 'Hecho ya' }).done, true);
  assert.equal(toKqlCard({ id: 'x', title: 'x' }, { id: 'l', title: 'Backlog', systemKey: 'done' }).done, true);
  assert.equal(toKqlCard({ id: 'x', title: 'x' }, { id: 'l', title: 'Backlog' }).done, false);
  assert.equal(toKqlCard({ id: 'x', title: 'x', archivedAt: '2026-01-01' }, list).archived, true);
});

test('context: me, members, groups', () => {
  assert.equal(ctx.me, 'ana');
  assert.equal(ctx.users?.length, 2);
  assert.deepEqual(ctx.groups, [{ id: 'g-ti', slug: 'ti', name: 'TI', memberIds: ['luis'] }]);
  const withMe = buildKqlContext({ meInfo: { id: 'me1', name: 'Me' }, members: [] });
  assert.equal(withMe.me, 'me1');
  assert.equal(withMe.users?.[0].id, 'me1');
});

test('buildExpression composes quick filters', () => {
  assert.equal(buildExpression({}), '');
  assert.equal(buildExpression({ mine: true, overdue: true }), 'assignee = me and overdue');
  assert.equal(buildExpression({ status: 'open', dueThisWeek: true }), 'open and due in this week');
  assert.equal(buildExpression({ group: { id: 'g-ti', name: 'TI' } }), 'group = @[group:g-ti:TI]');
  assert.equal(buildExpression({ tags: ['bug', 'say "hi"'] }), 'tag in ("bug", "say \\"hi\\"")');
  assert.equal(buildExpression({ dateField: 'created', dateFrom: '2026-03-01', dateTo: '2026-03-31' }), 'created between 2026-03-01 and 2026-03-31');
  assert.equal(buildExpression({ dateFrom: '2026-03-01' }), 'due >= 2026-03-01');
  assert.equal(buildExpression({ dateFrom: 'garbage' }), '');
  assert.equal(buildExpression({ text: 'a/b', regex: true }), 'title ~ /a\\/b/');
  assert.equal(buildExpression({ text: ' hola ' }), 'title contains "hola"');
});

test('every built expression parses in KQL and filters correctly', () => {
  const quicks = [
    { mine: true }, { unassigned: true }, { overdue: true }, { dueThisWeek: true }, { status: 'done' as const }, { status: 'open' as const },
    { group: { id: 'g-ti', name: 'TI' } }, { tags: ['bug', 'x y'] }, { dateField: 'due' as const, dateFrom: '2026-03-01', dateTo: '2026-03-31' },
    { dateField: 'created' as const, dateTo: '2026-03-31' }, { text: '^bug', regex: true }, { text: 'bug' },
    { mine: true, status: 'open' as const, overdue: true, tags: ['bug'], text: 'x', dateFrom: '2026-01-01' },
  ];
  for (const q of quicks) assert.doesNotThrow(() => parseKqlFilter(buildExpression(q)), buildExpression(q));

  const cards: KqlCard[] = [
    { id: 'a', title: 'Bug login', assignees: ['ana'], tags: ['bug'], due: '2026-03-10', created: '2026-03-01' },
    { id: 'b', title: 'Feature', assignees: [], tags: ['feat'], due: '2026-03-19', done: true },
    { id: 'c', title: 'Other bug', assignees: ['luis'], tags: ['bug', 'x'] },
  ];
  const ids = (q: Parameters<typeof buildExpression>[0]) => filterCards(buildExpression(q), cards, ctx).map((c) => c.id);
  assert.deepEqual(ids({ mine: true }), ['a']);
  assert.deepEqual(ids({ unassigned: true }), ['b']);
  assert.deepEqual(ids({ overdue: true }), ['a']);
  assert.deepEqual(ids({ dueThisWeek: true }), ['b']);
  assert.deepEqual(ids({ status: 'done' }), ['b']);
  assert.deepEqual(ids({ tags: ['feat', 'x'] }), ['b', 'c'], 'tags are OR, like the old tag filter');
  assert.deepEqual(ids({ text: '^bug', regex: true }), ['a']);
  assert.deepEqual(ids({ text: 'bug' }), ['a', 'c']);
  assert.deepEqual(ids({ dateField: 'due', dateFrom: '2026-03-01', dateTo: '2026-03-31' }), ['a', 'b']);
  assert.deepEqual(ids({ group: { id: 'g-ti', name: 'TI' } }), ['c'], 'group = any member of the group is assigned');
});

test('parseQuickFromExpression is lossless or null', () => {
  const roundTrip = (q: Parameters<typeof buildExpression>[0]) => {
    const text = buildExpression(q);
    assert.equal(buildExpression(parseQuickFromExpression(text)!), text, text);
  };
  roundTrip({});
  roundTrip({ mine: true, overdue: true });
  roundTrip({ status: 'done', dueThisWeek: true, unassigned: true });
  roundTrip({ group: { id: 'g1', name: 'Diseño' }, tags: ['a', 'b "c"'] });
  roundTrip({ dateField: 'created', dateFrom: '2026-03-01', dateTo: '2026-03-31' });
  roundTrip({ dateField: 'due', dateFrom: '2026-03-01' });
  roundTrip({ dateTo: '2026-03-31' });
  roundTrip({ text: 'hola mundo' });
  roundTrip({ text: 'a/b', regex: true });
  roundTrip({ mine: true, status: 'open', overdue: true, dueThisWeek: true, group: { id: 'g', name: 'G' }, tags: ['t'], dateFrom: '2026-01-01', text: 'x' });

  assert.deepEqual(parseQuickFromExpression(''), {});
  assert.deepEqual(parseQuickFromExpression('assignee = me and overdue'), { mine: true, overdue: true });
  assert.deepEqual(parseQuickFromExpression('due between 2026-03-01 and 2026-03-31'), { dateField: 'due', dateFrom: '2026-03-01', dateTo: '2026-03-31' });
  assert.deepEqual(parseQuickFromExpression('title ~ /^bug/')?.regex, true);

  assert.equal(parseQuickFromExpression('priority = alta'), null);
  assert.equal(parseQuickFromExpression('overdue or done'), null);
  assert.equal(parseQuickFromExpression('overdue and priority = alta'), null);
  assert.equal(parseQuickFromExpression('overdue and overdue'), null, 'duplicates are not lossless');
  assert.equal(parseQuickFromExpression('overdue  and assignee = me'), null, 'other spacing');
  assert.equal(parseQuickFromExpression('overdue and assignee = me'), null, 'other ordering');
  assert.equal(parseQuickFromExpression('done in last 30d'), null);
  assert.equal(parseQuickFromExpression('doner'), null);
});

test('appendCondition keeps precedence', () => {
  assert.equal(appendCondition('', 'overdue'), 'overdue');
  assert.equal(appendCondition('done', 'overdue'), 'done and overdue');
  assert.equal(appendCondition('done or overdue', 'assignee = me'), '(done or overdue) and assignee = me');
});

const mk = (id: string, extra: Partial<KqlCard> = {}): KqlCard => ({ id, title: id, ...extra });

test('splitIntoCategories: first match wins, rest gets the others, errors reported', () => {
  const cards = [mk('a', { due: '2026-03-10' }), mk('b', { assignees: ['ana'], due: '2026-03-10' }), mk('c', { assignees: ['ana'] }), mk('d')];
  const s = splitIntoCategories(
    cards,
    [
      { id: '1', name: 'Overdue', expr: 'overdue' },
      { id: '2', name: 'Mine', expr: 'assignee = me', color: '#f00' },
      { id: '3', name: 'Broken', expr: 'due in' },
      { id: '4', name: 'Empty', expr: '  ' },
    ],
    ctx,
    { restLabel: 'Resto' },
  );
  assert.deepEqual(s.map((x) => [x.id, x.cards.map((c) => c.id)]), [['1', ['a', 'b']], ['2', ['c']], ['3', []], ['4', []], ['__rest__', ['d']]]);
  assert.equal(s[1].color, '#f00');
  assert.ok(s[2].error && s[2].error.length > 0);
  assert.equal(s[3].error, 'empty');
  assert.equal(s[0].error, undefined);
  assert.equal(s[4].kind, 'rest');
  assert.equal(s[4].name, 'Resto');
  assert.equal(s.reduce((n, x) => n + x.cards.length, 0), cards.length, 'no card is lost or duplicated');
  assert.deepEqual(splitIntoCategories(cards, [], ctx).map((x) => x.cards.length), [4]);
});

test('applyBoardFilters: board filter, per-list filter, errors never throw, input untouched', () => {
  const lists = [
    { id: 'l1', title: 'Todo', cards: [{ id: 'c1', title: 'Bug', assignees: ['ana'] }, { id: 'c2', title: 'Task', assignees: [] }] },
    { id: 'l2', title: 'Hecho', cards: [{ id: 'c3', title: 'Bug 2', assignees: ['ana'] }] },
  ];
  const snapshot = JSON.stringify(lists);
  const all = applyBoardFilters(lists, { expression: '', ctx });
  assert.equal(all.shown, 3);
  assert.equal(all.total, 3);
  assert.equal(all.lists[0].cards, lists[0].cards);

  const mine = applyBoardFilters(lists, { expression: 'assignee = me', ctx });
  assert.deepEqual(mine.lists.map((l) => l.cards.map((c) => c.id)), [['c1'], ['c3']]);
  assert.equal(mine.shown, 2);
  assert.deepEqual(mine.lists.map((l) => l.totalCount), [2, 1]);

  const perList = applyBoardFilters(lists, { expression: 'assignee = me', listFilters: { l2: 'not done' }, ctx });
  assert.deepEqual(perList.lists.map((l) => l.cards.length), [1, 0], 'the done list is "done" by name');

  const bad = applyBoardFilters(lists, { expression: 'assignee = ', listFilters: { l1: 'due in' }, ctx });
  assert.ok(bad.error);
  assert.equal(bad.shown, 3, 'invalid expression keeps every card');
  assert.ok(bad.listErrors.l1);
  assert.equal(JSON.stringify(lists), snapshot);

  assert.equal(validateExpression(''), null);
  assert.equal(validateExpression('overdue'), null);
  const v = validateExpression('title ~');
  assert.ok(v && typeof v.position === 'number' && v.message);
});

function fakeStorage(initial: Record<string, string> = {}, broken = false): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => { if (broken) throw new Error('blocked'); return k in data ? data[k] : null; },
    setItem: (k, v) => { if (broken) throw new Error('quota'); data[k] = v; },
    removeItem: (k) => { if (broken) throw new Error('blocked'); delete data[k]; },
  };
}

test('list view config storage: round trip, sanitising, empty removes, broken storage never throws', () => {
  const st = fakeStorage();
  const store = createListViewConfigStore(st);
  assert.deepEqual(store.getAll('b1'), {});
  store.set('b1', 'l1', { filter: 'overdue', categories: [{ id: 'c1', name: 'Urgent', expr: 'overdue', color: '#f00' }], showRest: false, restLabel: 'Others' });
  store.set('b1', 'l2', { filter: 'done' });
  store.set('b2', 'l1', { filter: 'open' });
  assert.deepEqual(store.getAll('b1').l1, { filter: 'overdue', categories: [{ id: 'c1', name: 'Urgent', expr: 'overdue', color: '#f00' }], showRest: false, restLabel: 'Others' });
  assert.deepEqual(Object.keys(store.getAll('b1')).sort(), ['l1', 'l2']);
  assert.deepEqual(store.getAll('b2'), { l1: { filter: 'open' } }, 'boards are isolated');

  store.set('b1', 'l2', { filter: '   ', showRest: true });
  assert.deepEqual(Object.keys(store.getAll('b1')), ['l1']);
  store.set('b1', 'l1', {});
  assert.equal(listViewsKey('b1') in st.data, false, 'the key goes away with the last config');

  const junk = fakeStorage({ [listViewsKey('b')]: JSON.stringify({ l1: { filter: 5, categories: [{ id: 'x' }, { id: 'y', name: 'N', expr: 'done' }, 'z'] }, l2: 'nope' }) });
  assert.deepEqual(createListViewConfigStore(junk).getAll('b'), { l1: { categories: [{ id: 'y', name: 'N', expr: 'done' }] } });
  assert.deepEqual(createListViewConfigStore(fakeStorage({ [listViewsKey('b')]: '{oops' })).getAll('b'), {});

  const broken = createListViewConfigStore(fakeStorage({}, true));
  assert.deepEqual(broken.getAll('b'), {});
  assert.doesNotThrow(() => broken.set('b', 'l', { filter: 'done' }));
  assert.doesNotThrow(() => createListViewConfigStore(null).set('b', 'l', { filter: 'done' }));
});

test('saved views storage', () => {
  const st = fakeStorage();
  const store = createSavedViewsStore(st);
  assert.deepEqual(store.list('b'), []);
  store.save('b', [{ id: 'v1', name: 'Mine', expression: 'assignee = me' }, { id: '', name: 'bad', expression: 'x' } as any]);
  assert.deepEqual(store.list('b'), [{ id: 'v1', name: 'Mine', expression: 'assignee = me' }]);
  store.save('b', []);
  assert.deepEqual(Object.keys(st.data), []);
  assert.deepEqual(createSavedViewsStore(fakeStorage({}, true)).list('b'), []);
});

test('priorityAsTag keeps the priority tag in tags for board views (filter by "Alta" works)', () => {
  const card = { id: 'p', title: 'p', tags: [tag('Alta', 'priority'), tag('bug')] };
  assert.deepEqual(toKqlCard(card, list).tags, ['bug']);
  assert.deepEqual(toKqlCard(card, list, null, { priorityAsTag: true }).tags, ['Alta', 'bug']);
  const lists = [{ id: 'l1', title: 'x', cards: [card, { id: 'q', title: 'q', tags: [tag('bug')] }] }];
  assert.deepEqual(applyBoardFilters(lists, { expression: 'tag in ("Alta")', ctx }).lists[0].cards.map((c: any) => c.id), ['p']);
});
