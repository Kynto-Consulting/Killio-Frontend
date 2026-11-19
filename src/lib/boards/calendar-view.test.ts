import assert from 'node:assert/strict';
import test from 'node:test';

import { dayKey, groupByDueDay, monthGrid, shiftMonth } from './calendar-view.ts';

test('monthGrid: 42 cells starting on the Monday on or before the 1st', () => {
  const cells = monthGrid(new Date(2026, 10, 1), new Date(2026, 10, 19)); // November 2026: the 1st is a Sunday
  assert.equal(cells.length, 42);
  assert.equal(cells[0].day, '2026-10-26');
  assert.equal(cells[6].day, '2026-11-01');
  assert.equal(cells[0].inMonth, false);
  assert.equal(cells[6].inMonth, true);
  assert.equal(cells.filter((c) => c.isToday).map((c) => c.day).join(), '2026-11-19');
  assert.equal(cells.filter((c) => c.inMonth).length, 30);
});

test('monthGrid: a month that starts on Monday has no leading days', () => {
  const cells = monthGrid(new Date(2026, 5, 1)); // June 2026 starts on a Monday
  assert.equal(cells[0].day, '2026-06-01');
  assert.equal(cells[0].inMonth, true);
});

test('shiftMonth moves across year ends', () => {
  assert.equal(dayKey(shiftMonth(new Date(2026, 11, 15), 1)), '2027-01-01');
  assert.equal(dayKey(shiftMonth(new Date(2026, 0, 31), -1)), '2025-12-01');
});

test('groupByDueDay places cards by local due day and keeps undated ones apart', () => {
  const a = { id: 'a', dueAt: new Date(2026, 10, 19, 9, 30).toISOString() };
  const b = { id: 'b', dueAt: new Date(2026, 10, 19, 23, 0).toISOString() };
  const c = { id: 'c', dueAt: null };
  const d = { id: 'd', dueAt: 'not a date' };
  const { byDay, undated } = groupByDueDay([a, b, c, d]);
  assert.deepEqual(byDay.get('2026-11-19')?.map((x) => x.id), ['a', 'b']);
  assert.deepEqual(undated.map((x) => x.id), ['c', 'd']);
});
