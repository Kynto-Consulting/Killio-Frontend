/**
 * Data profiling of a preview (what Power Query shows under the column headers and in the Column profile pane).
 * Pure: it works on display cells (strings) of the rows it is given. Valid / error / empty is the engine's own rule
 * (`classifyCell`, the one `iserror` uses): a blank cell is never an error; a non-blank text the column's type cannot read is.
 */
import { classifyCell } from '../query/kql.ts';

export type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'empty';

export interface Quality { valid: number; error: number; empty: number; total: number }
export interface ValueCount { value: string; count: number }
export interface NumberStats { min: number; max: number; average: number; median: number; stdDev: number; sum: number }
export interface ColumnProfile {
  name: string;
  type: ColumnType;
  quality: Quality;
  /** Different values (empty ones excluded). */
  distinct: number;
  /** Values that appear exactly once. */
  unique: number;
  /** Most frequent first (ties by value), capped by `topValues`. */
  distribution: ValueCount[];
  /** Same, grouped by text length (text columns). */
  lengthDistribution: ValueCount[];
  stats: NumberStats | null;
  /** Some value of a number column has decimals (the header shows 1.2 instead of 123). */
  decimal: boolean;
  /** Some value of a date column has a time of day (the header shows a clock). */
  hasTime: boolean;
  /** Text min / max (alphabetical) for non-numeric columns. */
  textMin: string | null;
  textMax: string | null;
}

export const PROFILE_SAMPLE = 1000;

const EMPTY_CELLS = new Set(['', '(none)', 'null', 'undefined']);

export const isEmptyCell = (cell: string | null | undefined): boolean => cell === null || cell === undefined || EMPTY_CELLS.has(String(cell).trim().toLowerCase());

export type CellClass = 'valid' | 'error' | 'empty';
/** Class of a display cell in a column of this type (text, boolean and date-less columns have no errors). */
export function cellClass(cell: string | null | undefined, type: ColumnType): CellClass {
  if (isEmptyCell(cell)) return 'empty';
  if (type === 'number') return classifyCell(String(cell), 'number');
  if (type === 'date') return classifyCell(String(cell), 'date');
  if (type === 'boolean') return classifyCell(String(cell), 'bool');
  return 'valid';
}

/** "1,234.50", "12%", "$ 3" -> number; null when the text is not a number. */
export function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/^[$€£]\s*/, '').replace(/%$/, '');
  if (!t || !/^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/;
const BOOL_RE = /^(true|false|yes|no|si|sí)$/i;

export function inferType(cells: Array<string | null | undefined>): ColumnType {
  const filled = cells.filter((c): c is string => !isEmptyCell(c));
  if (filled.length === 0) return 'empty';
  const share = (test: (c: string) => boolean) => filled.filter(test).length / filled.length;
  if (share((c) => DATE_RE.test(c.trim())) >= 0.9) return 'date';
  if (share((c) => classifyCell(c, 'number') === 'valid') >= 0.9) return 'number';
  if (share((c) => classifyCell(c, 'bool') === 'valid' && BOOL_RE.test(c.trim())) >= 0.9) return 'boolean';
  return 'text';
}

function quantileMedian(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function numberStats(values: number[]): NumberStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const average = sum / values.length;
  // population standard deviation (every profiled row is the whole population being looked at)
  const variance = values.reduce((a, v) => a + (v - average) ** 2, 0) / values.length;
  return { min: sorted[0], max: sorted[sorted.length - 1], average, median: quantileMedian(sorted), stdDev: Math.sqrt(variance), sum };
}

export function countValues(cells: string[]): ValueCount[] {
  const map = new Map<string, number>();
  for (const c of cells) map.set(c, (map.get(c) ?? 0) + 1);
  return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function profileColumn(name: string, cells: Array<string | null | undefined>, options: { topValues?: number } = {}): ColumnProfile {
  const top = options.topValues ?? 20;
  const type = inferType(cells);
  let empty = 0;
  let error = 0;
  const valid: string[] = [];
  for (const c of cells) {
    const kind = cellClass(c, type);
    if (kind === 'empty') empty++;
    else if (kind === 'error') error++;
    else valid.push(String(c));
  }
  const counted = countValues(valid);
  const numbers = type === 'number' ? valid.map((v) => parseNumber(v) ?? (Number.isFinite(Number(v)) ? Number(v) : null)).filter((n): n is number => n !== null) : [];
  const sortedText = [...new Set(valid)].sort((a, b) => a.localeCompare(b));
  return {
    name,
    type,
    quality: { valid: valid.length, error, empty, total: cells.length },
    distinct: counted.length,
    unique: counted.filter((v) => v.count === 1).length,
    distribution: counted.slice(0, top),
    lengthDistribution: countValues(valid.map((v) => String(v.length))).sort((a, b) => Number(a.value) - Number(b.value)).slice(0, top),
    stats: numberStats(numbers),
    decimal: numbers.some((n) => !Number.isInteger(n)),
    hasTime: type === 'date' && valid.some((v) => /\d{2}:\d{2}/.test(v)),
    textMin: type === 'number' || sortedText.length === 0 ? null : sortedText[0],
    textMax: type === 'number' || sortedText.length === 0 ? null : sortedText[sortedText.length - 1],
  };
}

export interface ProfileResult { columns: ColumnProfile[]; rowsProfiled: number; rowsTotal: number; sampled: boolean }

/** Profiles every column of a table of display cells. By default only the first 1000 rows (`sample`); pass `Infinity` for all. */
export function profileTable(columns: string[], rows: string[][], options: { sample?: number; topValues?: number } = {}): ProfileResult {
  const limit = options.sample ?? PROFILE_SAMPLE;
  const used = rows.length > limit ? rows.slice(0, limit) : rows;
  return {
    columns: columns.map((name, i) => profileColumn(name, used.map((r) => r[i]), { topValues: options.topValues })),
    rowsProfiled: used.length,
    rowsTotal: rows.length,
    sampled: used.length < rows.length,
  };
}

export const percent = (part: number, total: number): number => (total === 0 ? 0 : Math.round((part / total) * 1000) / 10);

/** Quality bar widths in percent: green valid, red error, grey empty (they add up to 100). */
export function qualityBar(q: Quality): { valid: number; error: number; empty: number } {
  if (q.total === 0) return { valid: 0, error: 0, empty: 0 };
  const error = percent(q.error, q.total);
  const empty = percent(q.empty, q.total);
  return { valid: Math.max(0, Math.round((100 - error - empty) * 10) / 10), error, empty };
}
