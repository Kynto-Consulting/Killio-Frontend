/**
 * Month grid of the (experimental) Calendar view: cards are placed on the day of their due date. Pure (no React, no
 * path aliases) so it runs under `node --test`. Weeks start on Monday.
 */

export interface CalendarCard {
  id: string;
  dueAt?: string | null;
  [key: string]: unknown;
}

export interface CalendarCell {
  /** `YYYY-MM-DD` in local time. */
  day: string;
  inMonth: boolean;
  isToday: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** First day of the month shifted by `delta` months, at local midnight. */
export const shiftMonth = (base: Date, delta: number): Date => new Date(base.getFullYear(), base.getMonth() + delta, 1);

/** The 6 weeks (42 cells) that show `month`, starting on the Monday on or before the 1st. */
export function monthGrid(month: Date, today: Date = new Date()): CalendarCell[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const todayKey = dayKey(today);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ day: dayKey(d), inMonth: d.getMonth() === month.getMonth(), isToday: dayKey(d) === todayKey });
  }
  return cells;
}

/** Cards grouped by the local day of their due date; cards without a (valid) due date are returned apart. */
export function groupByDueDay<T extends CalendarCard>(cards: readonly T[]): { byDay: Map<string, T[]>; undated: T[] } {
  const byDay = new Map<string, T[]>();
  const undated: T[] = [];
  for (const c of cards) {
    const d = c.dueAt ? new Date(c.dueAt) : null;
    if (!d || Number.isNaN(d.getTime())) {
      undated.push(c);
      continue;
    }
    const k = dayKey(d);
    const list = byDay.get(k);
    if (list) list.push(c);
    else byDay.set(k, [c]);
  }
  return { byDay, undated };
}
