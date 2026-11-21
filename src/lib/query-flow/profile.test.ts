import assert from 'node:assert/strict';
import test from 'node:test';

import { cellClass, countValues, inferType, isEmptyCell, numberStats, parseNumber, percent, profileColumn, profileTable, qualityBar } from './profile.ts';

test('numbers are parsed loosely', () => {
  assert.equal(parseNumber('1,234.50'), 1234.5);
  assert.equal(parseNumber('12%'), 12);
  assert.equal(parseNumber('$ 3'), 3);
  assert.equal(parseNumber('-4'), -4);
  assert.equal(parseNumber('1,23'), null);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
});

test('type inference', () => {
  assert.equal(inferType(['1', '2', '', '3.5']), 'number');
  assert.equal(inferType(['2026-01-01', '2026-02-03', '']), 'date');
  assert.equal(inferType(['yes', 'no', 'yes']), 'boolean');
  assert.equal(inferType(['a', '1', 'b']), 'text');
  assert.equal(inferType(['', '(none)']), 'empty');
  assert.equal(inferType([]), 'empty');
  assert.equal(inferType(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'x']), 'number');
});

test('empty and error cells', () => {
  assert.ok(isEmptyCell(''));
  assert.ok(isEmptyCell(null));
  assert.ok(isEmptyCell('(none)'));
  assert.ok(!isEmptyCell('0'));
  assert.equal(cellClass('abc', 'number'), 'error');
  assert.equal(cellClass('12', 'number'), 'valid');
  assert.equal(cellClass('', 'number'), 'empty');
  assert.equal(cellClass('  ', 'number'), 'empty');
  assert.equal(cellClass('not a date', 'date'), 'error');
  assert.equal(cellClass('2026-01-02', 'date'), 'valid');
  assert.equal(cellClass('#VALUE!', 'text'), 'valid');
});

test('stats of a number column (population standard deviation)', () => {
  const s = numberStats([2, 4, 4, 4, 5, 5, 7, 9])!;
  assert.equal(s.min, 2);
  assert.equal(s.max, 9);
  assert.equal(s.average, 5);
  assert.equal(s.median, 4.5);
  assert.equal(s.stdDev, 2);
  assert.equal(s.sum, 40);
  assert.equal(numberStats([]), null);
});

test('column profile: quality, distinct, unique, distribution, length', () => {
  const p = profileColumn('Estado', ['Pagado', 'Pagado', 'Pendiente', '', 'Anulado', '(none)']);
  assert.deepEqual(p.quality, { valid: 4, error: 0, empty: 2, total: 6 });
  assert.equal(p.type, 'text');
  assert.equal(p.distinct, 3);
  assert.equal(p.unique, 2);
  assert.deepEqual(p.distribution[0], { value: 'Pagado', count: 2 });
  assert.equal(p.textMin, 'Anulado');
  assert.equal(p.textMax, 'Pendiente');
  assert.equal(p.stats, null);
  assert.ok(p.lengthDistribution.some((l) => l.value === '6' && l.count === 2));
  const n = profileColumn('Monto', ['10', '20', '20', '']);
  assert.equal(n.type, 'number');
  assert.equal(n.stats?.median, 20);
  assert.equal(n.stats?.average, 50 / 3);
  assert.equal(n.textMin, null);
  const bad = profileColumn('Monto', ['10', 'abc', '', '5', '7', '8', '9', '1', '2', '3', '4', '6']);
  assert.equal(bad.type, 'number');
  assert.deepEqual(bad.quality, { valid: 10, error: 1, empty: 1, total: 12 });
  assert.equal(bad.stats?.max, 10);
  const dates = profileColumn('Fecha', ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-13-45']);
  assert.equal(dates.type, 'date');
  const capped = profileColumn('x', ['a', 'b', 'c', 'd'], { topValues: 2 });
  assert.equal(capped.distribution.length, 2);
  assert.equal(capped.distinct, 4);
});

test('table profile samples the first 1000 rows unless told otherwise', () => {
  const rows = Array.from({ length: 1500 }, (_, i) => [String(i), i % 2 ? 'a' : 'b']);
  const sampled = profileTable(['n', 't'], rows);
  assert.equal(sampled.rowsProfiled, 1000);
  assert.equal(sampled.rowsTotal, 1500);
  assert.ok(sampled.sampled);
  assert.equal(sampled.columns[0].quality.total, 1000);
  const whole = profileTable(['n', 't'], rows, { sample: Infinity });
  assert.equal(whole.rowsProfiled, 1500);
  assert.ok(!whole.sampled);
  assert.equal(whole.columns[1].distinct, 2);
  assert.equal(profileTable(['a'], []).columns[0].type, 'empty');
});

test('quality bar adds up to 100', () => {
  assert.deepEqual(qualityBar({ valid: 5, error: 0, empty: 5, total: 10 }), { valid: 50, error: 0, empty: 50 });
  assert.deepEqual(qualityBar({ valid: 0, error: 0, empty: 0, total: 0 }), { valid: 0, error: 0, empty: 0 });
  const q = qualityBar({ valid: 1, error: 1, empty: 1, total: 3 });
  assert.ok(Math.abs(q.valid + q.error + q.empty - 100) < 0.2);
  assert.equal(percent(1, 3), 33.3);
  assert.deepEqual(countValues(['b', 'a', 'b']), [{ value: 'b', count: 2 }, { value: 'a', count: 1 }]);
});
