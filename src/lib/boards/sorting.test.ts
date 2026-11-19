import assert from 'node:assert/strict';
import test from 'node:test';

import { categoriesFromTagGroup, describeSort, effectiveSortRules, moveItem, normalizeSortRules, sanitizeTagGroups, sortCards, tagGroupKey, tagGroupRank } from './sorting.ts';
import type { TagGroup } from './sorting.ts';
import { sanitizeSortRules } from './view-storage.ts';
import { splitIntoCategories } from './categories.ts';
import { createBoardPrefsStore, createListViewConfigStore } from './view-storage.ts';
import type { KqlCard } from '../query/kql.ts';

const mk = (id: string, extra: Partial<KqlCard> = {}): KqlCard => ({ id, title: id, ...extra });
const ids = (cs: KqlCard[]) => cs.map((c) => c.id);
const prio: TagGroup = { id: 'p', name: 'Prioridad', tags: ['Urgente', 'Alta', 'Media', 'Baja'] };
const users = [{ id: 'u1', name: 'Zoe' }, { id: 'u2', name: 'ana' }, { id: 'u3', email: 'bob@x.com' }];

test('manual / empty rules keep the order and the same array', () => {
  const cs = [mk('b'), mk('a')];
  assert.equal(sortCards(cs, []), cs);
  assert.equal(sortCards(cs, [{ key: 'manual', dir: 'asc' }]), cs);
});

test('title sort is case-insensitive, natural, directional and does not mutate', () => {
  const cs = [mk('b2', { title: 'beta 10' }), mk('a', { title: 'Alpha' }), mk('b1', { title: 'beta 2' })];
  assert.deepEqual(ids(sortCards(cs, [{ key: 'title', dir: 'asc' }])), ['a', 'b1', 'b2']);
  assert.deepEqual(ids(sortCards(cs, [{ key: 'title', dir: 'desc' }])), ['b2', 'b1', 'a']);
  assert.deepEqual(ids(cs), ['b2', 'a', 'b1']);
});

test('missing values go last in both directions; ties keep manual order (stable)', () => {
  const cs = [mk('n1'), mk('d3', { due: '2026-03-30' }), mk('d1', { due: '2026-03-01' }), mk('n2'), mk('d1b', { due: '2026-03-01' })];
  assert.deepEqual(ids(sortCards(cs, [{ key: 'due', dir: 'asc' }])), ['d1', 'd1b', 'd3', 'n1', 'n2']);
  assert.deepEqual(ids(sortCards(cs, [{ key: 'due', dir: 'desc' }])), ['d3', 'd1', 'd1b', 'n1', 'n2']);
  assert.deepEqual(ids(sortCards([mk('a', { points: 0 }), mk('b'), mk('c', { points: 5 })], [{ key: 'points', dir: 'desc' }])), ['c', 'a', 'b'], '0 is a value, not missing');
});

test('numeric and date keys', () => {
  const cs = [mk('a', { comments: 3, created: '2026-01-02' }), mk('b', { comments: 1, created: '2026-01-03' }), mk('c', { comments: 2, created: '2026-01-01' })];
  assert.deepEqual(ids(sortCards(cs, [{ key: 'comments', dir: 'asc' }])), ['b', 'c', 'a']);
  assert.deepEqual(ids(sortCards(cs, [{ key: 'created', dir: 'desc' }])), ['b', 'a', 'c']);
  assert.deepEqual(ids(sortCards([mk('x', { completed: '2026-02-01' }), mk('y', { completed: 'garbage' })], [{ key: 'completed', dir: 'asc' }])), ['x', 'y']);
});

test('priority uses a known urgency order, then alphabetical for custom values', () => {
  const cs = [mk('baja', { priority: 'Baja' }), mk('none'), mk('urg', { priority: 'Urgente' }), mk('media', { priority: 'media' }), mk('alta', { priority: 'ALTA' }), mk('zz', { priority: 'zzz' })];
  assert.deepEqual(ids(sortCards(cs, [{ key: 'priority', dir: 'asc' }])).slice(0, 4), ['urg', 'alta', 'media', 'baja']);
  assert.equal(ids(sortCards(cs, [{ key: 'priority', dir: 'asc' }]))[5], 'none');
});

test('assignee sorts by the first name alphabetically (names resolved through the context)', () => {
  const cs = [mk('z', { assignees: ['u1'] }), mk('multi', { assignees: ['u1', 'u2'] }), mk('b', { assignees: ['u3'] }), mk('none', { assignees: [] })];
  assert.deepEqual(ids(sortCards(cs, [{ key: 'assignee', dir: 'asc' }], { users })), ['multi', 'b', 'z', 'none']);
});

test('tag group rank: best position among the card tags, none last, case-insensitive', () => {
  assert.equal(tagGroupRank(['x', 'Media', 'alta'], prio), 1);
  assert.equal(tagGroupRank(['baja'], prio), 3);
  assert.equal(tagGroupRank(['x'], prio), null);
  assert.equal(tagGroupRank([], prio), null);
  assert.equal(tagGroupRank(['Alta'], undefined), null);

  const cs = [mk('none', { tags: ['x'] }), mk('baja', { tags: ['Baja'] }), mk('urg', { tags: ['bug', 'Urgente'] }), mk('multi', { tags: ['Baja', 'Media'] }), mk('notags')];
  const key = tagGroupKey('p');
  assert.deepEqual(ids(sortCards(cs, [{ key, dir: 'asc' }], { tagGroups: [prio] })), ['urg', 'multi', 'baja', 'none', 'notags']);
  assert.deepEqual(ids(sortCards(cs, [{ key, dir: 'desc' }], { tagGroups: [prio] })), ['baja', 'multi', 'urg', 'none', 'notags']);
  assert.deepEqual(ids(sortCards(cs, [{ key: tagGroupKey('gone'), dir: 'asc' }], { tagGroups: [prio] })), ids(cs), 'unknown group = no values = manual order');
});

test('a tag may belong to several groups', () => {
  const other: TagGroup = { id: 'e', name: 'Esfuerzo', tags: ['Baja', 'Alta'] };
  const cs = [mk('a', { tags: ['Alta'] }), mk('b', { tags: ['Baja'] })];
  assert.deepEqual(ids(sortCards(cs, [{ key: tagGroupKey('p'), dir: 'asc' }], { tagGroups: [prio, other] })), ['a', 'b']);
  assert.deepEqual(ids(sortCards(cs, [{ key: tagGroupKey('e'), dir: 'asc' }], { tagGroups: [prio, other] })), ['b', 'a']);
});

test('multi-level: later rules break ties, per-rule direction', () => {
  const cs = [
    mk('1', { priority: 'Alta', due: '2026-03-05' }),
    mk('2', { priority: 'Alta', due: '2026-03-01' }),
    mk('3', { priority: 'Baja', due: '2026-03-01' }),
    mk('4', { priority: 'Alta' }),
  ];
  assert.deepEqual(ids(sortCards(cs, [{ key: 'priority', dir: 'asc' }, { key: 'due', dir: 'asc' }])), ['2', '1', '4', '3']);
  assert.deepEqual(ids(sortCards(cs, [{ key: 'priority', dir: 'asc' }, { key: 'due', dir: 'desc' }])), ['1', '2', '4', '3']);
  assert.deepEqual(ids(sortCards(cs, [{ key: 'due', dir: 'asc' }, { key: 'priority', dir: 'desc' }])), ['3', '2', '1', '4']);
});

test('generic items with a mapper', () => {
  const items = [{ id: 'x', k: mk('x', { title: 'b' }) }, { id: 'y', k: mk('y', { title: 'a' }) }];
  assert.deepEqual(sortCards(items, [{ key: 'title', dir: 'asc' }], {}, (i) => i.k).map((i) => i.id), ['y', 'x']);
});

test('rule normalisation, effective rules and description', () => {
  assert.deepEqual(normalizeSortRules([{ key: 'manual', dir: 'asc' }, { key: 'due', dir: 'desc' }, { key: 'due', dir: 'asc' }, { key: 'title', dir: 'x' as any }]), [{ key: 'due', dir: 'desc' }, { key: 'title', dir: 'asc' }]);
  assert.deepEqual(effectiveSortRules([{ key: 'title', dir: 'asc' }], [{ key: 'due', dir: 'asc' }]), [{ key: 'title', dir: 'asc' }]);
  assert.deepEqual(effectiveSortRules([], [{ key: 'due', dir: 'asc' }]), [{ key: 'due', dir: 'asc' }]);
  assert.deepEqual(effectiveSortRules([{ key: 'manual', dir: 'asc' }], undefined), []);
  assert.equal(describeSort([{ key: 'due', dir: 'asc' }, { key: 'title', dir: 'desc' }], (k) => k.toUpperCase()), 'DUE ↑ · TITLE ↓');
});

test('tag groups: sanitising, categories source, moveItem', () => {
  assert.deepEqual(sanitizeTagGroups([{ id: 'g', name: ' P ', tags: ['a', 'a', '', 'b', 3] }, { id: 'g', name: 'dup', tags: [] }, { id: 'h' }, 'x']), [{ id: 'g', name: 'P', tags: ['a', 'b'] }]);
  assert.deepEqual(sanitizeTagGroups(null), []);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a'], 5, 0), ['a']);

  const cats = categoriesFromTagGroup({ id: 'p', name: 'P', tags: ['Urgente', 'say "x"'] });
  assert.deepEqual(cats.map((c) => c.name), ['Urgente', 'say "x"']);
  const cards = [mk('a', { tags: ['Urgente'] }), mk('b', { tags: ['say "x"'] }), mk('c', { tags: ['other'] }), mk('d', { tags: ['Urgente', 'say "x"'] })];
  const s = splitIntoCategories(cards, cats, {});
  assert.deepEqual(s.map((x) => ids(x.cards)), [['a', 'd'], ['b'], ['c']], 'one category per tag in order + rest, first match wins');
  assert.equal(s.some((x) => x.error), false);
});

test('storage: list sort and board prefs round-trip', () => {
  const data: Record<string, string> = {};
  const st = { getItem: (k: string) => (k in data ? data[k] : null), setItem: (k: string, v: string) => { data[k] = v; }, removeItem: (k: string) => { delete data[k]; } };
  const lists = createListViewConfigStore(st);
  lists.set('b', 'l', { sort: [{ key: 'due', dir: 'desc' }, { key: 'manual', dir: 'asc' }, { key: 'x', dir: 'bad' as any }] });
  assert.deepEqual(lists.getAll('b').l.sort, [{ key: 'due', dir: 'desc' }, { key: 'x', dir: 'asc' }]);
  lists.set('b', 'l', { sort: [{ key: 'manual', dir: 'asc' }] });
  assert.deepEqual(lists.getAll('b'), {}, 'manual only = empty config');

  const prefs = createBoardPrefsStore(st);
  assert.deepEqual(prefs.get('b'), {});
  prefs.set('b', { sort: [{ key: 'title', dir: 'asc' }], tagGroups: [prio] });
  assert.deepEqual(prefs.get('b'), { sort: [{ key: 'title', dir: 'asc' }], tagGroups: [prio] });
  assert.deepEqual(prefs.get('other'), {});
  prefs.set('b', {});
  assert.deepEqual(Object.keys(data), []);
});

test('sorts by tag names and by number of tags', () => {
  const cards: Array<{ id: string; title: string; tags: string[] }> = [
    { id: 'a', title: 'A', tags: ['urgente', 'bug'] },
    { id: 'b', title: 'B', tags: [] },
    { id: 'c', title: 'C', tags: ['alta'] },
    { id: 'd', title: 'D', tags: ['Bug'] },
  ];
  const ids = (rules: Array<{ key: string; dir: 'asc' | 'desc' }>) => sortCards(cards, rules, {}, (c) => c as never).map((c) => c.id).join('');
  // alphabetical by tag names, cards without tags last (also when descending)
  assert.equal(ids([{ key: 'tags', dir: 'asc' }]), 'cdab');
  assert.equal(ids([{ key: 'tags', dir: 'desc' }]), 'adcb');
  assert.equal(ids([{ key: 'tagCount', dir: 'desc' }]), 'acdb');
  assert.equal(ids([{ key: 'tagCount', dir: 'asc' }]), 'bcda');
});

test('a custom tag order ranks cards by their best listed tag and keeps the rest last', () => {
  const cards: Array<{ id: string; title: string; tags: string[] }> = [
    { id: 'a', title: 'A', tags: ['baja'] },
    { id: 'b', title: 'B', tags: ['otra'] },
    { id: 'c', title: 'C', tags: ['urgente', 'baja'] },
    { id: 'd', title: 'D', tags: ['Media'] },
  ];
  const run = (order: string[], dir: 'asc' | 'desc' = 'asc') => sortCards(cards, [{ key: 'tags', dir, order }], {}, (c) => c as never).map((c) => c.id).join('');
  assert.equal(run(['urgente', 'media', 'baja']), 'cdab', 'urgent first, then medium, then low; unlisted last');
  assert.equal(run(['baja', 'media', 'urgente']), 'acdb');
  assert.equal(run(['urgente', 'media', 'baja'], 'desc'), 'adcb', 'descending reverses the order but unlisted stay last');
  // an empty order falls back to alphabetical
  assert.equal(run([]), sortCards(cards, [{ key: 'tags', dir: 'asc' }], {}, (c) => c as never).map((c) => c.id).join(''));
  // normalisation keeps and cleans the order
  assert.deepEqual(normalizeSortRules([{ key: 'tags', dir: 'asc', order: [' urgente ', 'urgente', '', 'baja'] }]), [{ key: 'tags', dir: 'asc', order: ['urgente', 'baja'] }]);
  assert.deepEqual(normalizeSortRules([{ key: 'title', dir: 'asc', order: ['x'] }]), [{ key: 'title', dir: 'asc' }]);
});

test('sanitising stored sort rules keeps the custom tag order (so it survives saving and reloading)', () => {
  const stored = [{ key: 'tags', dir: 'asc', order: ['urgente', 'alta'] }, { key: 'title', dir: 'desc', order: ['x'] }];
  assert.deepEqual(sanitizeSortRules(stored), [{ key: 'tags', dir: 'asc', order: ['urgente', 'alta'] }, { key: 'title', dir: 'desc' }]);
  assert.deepEqual(sanitizeSortRules(JSON.parse(JSON.stringify(stored))), sanitizeSortRules(stored));
});
