import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHierarchy, checkState, planSelection, toggleIds, boardIds, listIds, type Selection } from './hierarchy.ts';

const rows = [
  { board: 'QA', list: 'Todo', id: 'c1', title: 'A' },
  { board: 'QA', list: 'Todo', id: 'c2', title: 'B' },
  { board: 'QA', list: 'Done', id: 'c3', title: 'C' },
  { board: 'Dev', list: 'Todo', id: 'c4', title: 'D' },
];
const tree = buildHierarchy(rows);

test('builds boards > lists > cards in first-seen order', () => {
  assert.deepEqual(tree.map((b) => b.name), ['QA', 'Dev']);
  assert.deepEqual(tree[0].lists.map((l) => `${l.name}:${l.cards.length}`), ['Todo:2', 'Done:1']);
  assert.deepEqual(boardIds(tree[0]), ['c1', 'c2', 'c3']);
});

test('tri-state check and toggling a whole list or board', () => {
  let sel: Selection = new Set();
  assert.equal(checkState(boardIds(tree[0]), sel), 'none');
  sel = toggleIds(sel, ['c1']);
  assert.equal(checkState(listIds(tree[0].lists[0]), sel), 'some');
  sel = toggleIds(sel, listIds(tree[0].lists[0])); // not all selected → adds the rest
  assert.equal(checkState(listIds(tree[0].lists[0]), sel), 'all');
  sel = toggleIds(sel, listIds(tree[0].lists[0])); // all selected → clears
  assert.equal(sel.size, 0);
});

test('a single whole list or board uses the engine scope', () => {
  const list = planSelection(tree, new Set(['c1', 'c2']))!;
  assert.deepEqual(list.source, { kind: 'cards', name: '', scope: { board: 'QA', list: 'Todo' } });
  assert.deepEqual(list.ids, []);
  const board = planSelection(tree, new Set(['c1', 'c2', 'c3']))!;
  assert.deepEqual(board.source, { kind: 'cards', name: '', scope: { board: 'QA', list: '' } });
});

test('cherry-picked cards (partial list, several lists or boards) filter by id', () => {
  const some = planSelection(tree, new Set(['c1']))!;
  assert.deepEqual(some.source, { kind: 'cards', name: '' });
  assert.deepEqual(some.ids, ['c1']);
  const across = planSelection(tree, new Set(['c2', 'c4']))!;
  assert.deepEqual(across.ids, ['c2', 'c4']);
  assert.equal(planSelection(tree, new Set()), null);
});
