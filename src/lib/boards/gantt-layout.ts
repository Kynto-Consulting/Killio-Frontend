/**
 * Pure layout maths of the board Gantt view: the visible window, where a card's bar sits in it, and its progress.
 * No React and no Intl here, so it is unit-tested with `node --test`.
 */

export type GanttMode = "day" | "week" | "month";

export interface GanttUnit {
  startMs: number;
  endMs: number;
}

export interface GanttWindow {
  startMs: number;
  endMs: number;
  units: GanttUnit[];
}

export interface GanttSpan {
  startMs: number;
  endMs: number;
  /** The card only had one date: the bar covers that day (or hour). */
  single: boolean;
}

export interface GanttBar {
  leftPct: number;
  widthPct: number;
  /** The bar continues before / after the visible window (its edge is drawn square). */
  clippedLeft: boolean;
  clippedRight: boolean;
}

const HOUR = 3_600_000;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday 00:00 of the week of `date`. */
export function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date);
  const shift = (d.getDay() + 6) % 7;
  return addDays(d, -shift);
}

/**
 * The visible window. Day = 24 hourly columns, week = 7 daily columns (Monday first), month = 35 daily columns
 * (five full weeks, so the grid stays aligned with the weeks). `offset` moves by whole windows.
 */
export function getGanttWindow(mode: GanttMode, base: Date, offset: number): GanttWindow {
  if (mode === "day") {
    const start = addDays(startOfDay(base), offset);
    const units = Array.from({ length: 24 }, (_, i) => ({ startMs: start.getTime() + i * HOUR, endMs: start.getTime() + (i + 1) * HOUR }));
    return { startMs: units[0].startMs, endMs: addDays(start, 1).getTime(), units };
  }
  const days = mode === "week" ? 7 : 35;
  const start = addDays(startOfWeekMonday(base), offset * days);
  const units = Array.from({ length: days }, (_, i) => ({ startMs: addDays(start, i).getTime(), endMs: addDays(start, i + 1).getTime() }));
  return { startMs: units[0].startMs, endMs: units[units.length - 1].endMs, units };
}

export function parseDateMs(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Start and end of a card on the timeline. Both dates: from start to due. Only one: that day. None: no bar.
 * A due date at exactly midnight (a date without time) covers the whole day.
 */
export function cardSpan(card: { startAt?: unknown; dueAt?: unknown }): GanttSpan | null {
  const start = parseDateMs(card.startAt);
  const due = parseDateMs(card.dueAt);
  if (start === null && due === null) return null;
  const endOfDay = (ms: number) => {
    const d = new Date(ms);
    return d.getHours() === 0 && d.getMinutes() === 0 ? addDays(startOfDay(d), 1).getTime() : ms;
  };
  if (start !== null && due !== null) {
    const lo = Math.min(start, due);
    const hi = endOfDay(Math.max(start, due));
    return { startMs: lo, endMs: Math.max(hi, lo + HOUR), single: false };
  }
  const only = (start ?? due) as number;
  const day = startOfDay(new Date(only)).getTime();
  return { startMs: day, endMs: addDays(new Date(day), 1).getTime(), single: true };
}

/** Where the bar goes inside the window, or null when the card is entirely outside. */
export function layoutBar(span: GanttSpan, window: GanttWindow, minWidthPct = 2): GanttBar | null {
  if (span.endMs <= window.startMs || span.startMs >= window.endMs) return null;
  const total = window.endMs - window.startMs;
  const from = Math.max(span.startMs, window.startMs);
  const to = Math.min(span.endMs, window.endMs);
  const leftPct = ((from - window.startMs) / total) * 100;
  const widthPct = Math.min(100 - leftPct, Math.max(minWidthPct, ((to - from) / total) * 100));
  return { leftPct, widthPct, clippedLeft: span.startMs < window.startMs, clippedRight: span.endMs > window.endMs };
}

/** 0-100. A completed card is 100; otherwise the share of checked checklist items. */
export function cardProgress(card: { completedAt?: unknown; status?: unknown; blocks?: unknown }): number {
  if (card.completedAt || card.status === "done") return 100;
  const blocks = Array.isArray(card.blocks) ? card.blocks : [];
  let total = 0;
  let done = 0;
  for (const block of blocks as Array<{ kind?: string; displayStyle?: string; tasks?: Array<{ checked?: boolean }> }>) {
    if (block?.kind !== "text" || block.displayStyle !== "checklist") continue;
    for (const task of block.tasks ?? []) {
      total += 1;
      if (task?.checked) done += 1;
    }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Position of "now" in the window (0-100), or null when it is outside. */
export function nowPosition(window: GanttWindow, nowMs: number): number | null {
  if (nowMs < window.startMs || nowMs >= window.endMs) return null;
  return ((nowMs - window.startMs) / (window.endMs - window.startMs)) * 100;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Stable hue (0-359) for a name, used for avatar colours. */
export function nameHue(name: string | null | undefined): number {
  let h = 0;
  for (const ch of name ?? "") h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
