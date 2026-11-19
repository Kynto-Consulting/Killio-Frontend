/**
 * Shared model of the board SUMMARY ("Resumen") and PROJECTS ("Proyectos") views: every card becomes a `BacklogItem`
 * (status from its list, due day, reschedule count parsed from the description, owners and the values of the three
 * grouping tag groups). Pure (no React, no path aliases) so it runs under `node --test`.
 *
 * Tag groups follow the team convention "Group: Value" ("Área: TI", "Proyecto: Fast Track", "Fase: Fase 4: Web"): a tag
 * belongs to a group when its prefix names the group OR when it is listed in a board tag group with that name. The value
 * is the tag name without the prefix (only the FIRST colon splits, so "Fase 4: Web" survives).
 */
import { assigneeId, isDoneList } from './kql-cards.ts';
import { stripGroupPrefix, tagsOfGroup } from './list-view.ts';
import type { TagGroup } from './sorting.ts';

export interface BacklogList {
  id: string;
  title: string;
  systemKey?: string | null;
  cards: any[];
}

export interface GroupNames {
  /** Name of the tag group that defines the area / project / phase. Absent = the default name match. */
  areaGroup?: string;
  projectGroup?: string;
  phaseGroup?: string;
}

export const DONE_STATUS = /resuelt|realizad|hecho|\bdone\b|complet|cerrad|terminad|finalizad/i;
export const BLOCKED_STATUS = /bloquead|blocked/i;

/** No group name is assumed: a view groups only by the tag group the board picked, never by a guessed "Area" / "Proyecto". */
const NEVER = /(?!)/;
const AREA_DEFAULT = NEVER;
const PROJECT_DEFAULT = NEVER;
const PHASE_DEFAULT = NEVER;
export const DEFAULT_PATTERNS = { area: AREA_DEFAULT, project: PROJECT_DEFAULT, phase: PHASE_DEFAULT } as const;

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export type StatusKind = 'pending' | 'doing' | 'waiting' | 'review' | 'next' | 'done' | 'deprioritized' | 'cancelled' | 'blocked';

/** Tone of a list title, used to colour the status bar. Unknown names are `pending` (neutral). */
export function statusKind(title: string, systemKey?: string | null): StatusKind {
  if (BLOCKED_STATUS.test(title)) return 'blocked';
  if (isDoneList({ title, systemKey }) || DONE_STATUS.test(title)) return 'done';
  const n = norm(title);
  if (/cancel/.test(n)) return 'cancelled';
  if (/despriori|deprioriti|archiv/.test(n)) return 'deprioritized';
  if (/espera|waiting|hold|pausa/.test(n)) return 'waiting';
  if (/revision|review|qa|testing|prueba/.test(n)) return 'review';
  if (/proximo|siguiente|next|pase|upcoming/.test(n)) return 'next';
  if (/proceso|progress|doing|curso|desarrollo|ejecuc/.test(n)) return 'doing';
  return 'pending';
}

export interface Owner {
  key: string;
  name: string;
  avatarUrl?: string;
  email?: string;
}

export interface BacklogItem {
  id: string;
  card: any;
  title: string;
  listId: string;
  listTitle: string;
  /** Order in the board (list, then card) for stable sorts. */
  order: number;
  kind: StatusKind;
  done: boolean;
  blocked: boolean;
  /** Local day number (days since 1970-01-01) of the due date, `null` without a valid one. */
  dueDay: number | null;
  /** `YYYY-MM-DD` of the due date (local), or null. */
  dueDate: string | null;
  /** Days from today to the due date (negative = late), `null` without a due date. */
  daysToDue: number | null;
  reschedules: number;
  /** `YYYY-MM-DD` of the original due date written in the description, or null. */
  originalDate: string | null;
  owners: Owner[];
  areas: string[];
  projects: string[];
  phases: string[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Dates

const pad = (n: number) => String(n).padStart(2, '0');

/** Local-calendar day number: two instants on the same local date give the same number whatever the time of day. */
export const dayNumber = (d: Date): number => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

export const dayNumberToIso = (n: number): string => {
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** A due date as stored: a full ISO instant (local day of it) or a bare `YYYY-MM-DD` (that calendar day, no timezone shift). */
export function parseDue(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = bare ? new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `Reprogramada: 3 veces` / `**Reprogramada:** 3` / `Rescheduled: 3 times` -> 3; absent or malformed -> 0. Fecha original -> `YYYY-MM-DD`. */
export function parseDescription(text: unknown): { reschedules: number; originalDate: string | null } {
  const s = typeof text === 'string' ? text : '';
  const r = /(?:reprogramad[oa]s?|rescheduled|reschedules)[\s*_:=-]*(\d{1,4})/i.exec(s);
  const reschedules = r ? Number(r[1]) : 0;
  let originalDate: string | null = null;
  const o = /(?:fecha\s+original|original\s+(?:due\s+)?date)[\s*_:=-]*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i.exec(s);
  if (o) {
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(o[1]);
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(o[1]);
    const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : dmy ? [+dmy[3], +dmy[2], +dmy[1]] : [0, 0, 0];
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (y && probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d) originalDate = `${y}-${pad(m)}-${pad(d)}`;
  }
  return { reschedules, originalDate };
}

const isEs = (locale: string) => (locale || '').toLowerCase().startsWith('es');

export type DueTone = 'late' | 'today' | 'soon' | 'future';

/** "Atrasado 5d" / "Hoy" / "Mañana" / "En 7d" (es) and "Overdue 5d" / "Today" / "Tomorrow" / "In 7d" (en). */
export function relativeDueLabel(days: number, locale: string): { text: string; tone: DueTone } {
  const es = isEs(locale);
  if (days < 0) return { text: es ? `Atrasado ${-days}d` : `Overdue ${-days}d`, tone: 'late' };
  if (days === 0) return { text: es ? 'Hoy' : 'Today', tone: 'today' };
  if (days === 1) return { text: es ? 'Mañana' : 'Tomorrow', tone: 'soon' };
  return { text: es ? `En ${days}d` : `In ${days}d`, tone: days <= 7 ? 'soon' : 'future' };
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-11` -> "11 sep" (es) / "Sep 11" (en); the year is added when it is not the one of `today`. Unparseable -> ''. */
export function shortDate(iso: string | null | undefined, locale: string, today: Date = new Date()): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return '';
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return '';
  const day = Number(m[3]);
  const year = Number(m[1]) !== today.getFullYear() ? ` ${m[1]}` : '';
  return isEs(locale) ? `${day} ${MONTHS_ES[month]}${year}` : `${MONTHS_EN[month]} ${day}${year}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tag groups

/** Does the group name ("Área", "area") match what the view wants (the configured name, else the default pattern)? */
export function groupNameMatches(name: string, configured: string | undefined, fallback: RegExp): boolean {
  const n = norm(name);
  if (!n) return false;
  return configured && configured.trim() ? n === norm(configured) : fallback.test(n);
}

/** Values of the card's tags for one group (prefix convention and/or a board tag group with that name), deduplicated. */
export function groupValues(tags: Array<{ name: string }> | null | undefined, tagGroups: TagGroup[], configured: string | undefined, fallback: RegExp): string[] {
  if (!tags?.length) return [];
  const out: string[] = [];
  const push = (v: string) => {
    if (v && !out.some((x) => norm(x) === norm(v))) out.push(v);
  };
  const groups = tagGroups.filter((g) => groupNameMatches(g.name, configured, fallback));
  for (const tag of tags) {
    if (!tag || typeof tag.name !== 'string') continue;
    const idx = tag.name.indexOf(':');
    if (idx > 0 && groupNameMatches(tag.name.slice(0, idx), configured, fallback)) {
      push(tag.name.slice(idx + 1).trim());
      continue;
    }
    for (const g of groups) if (tagsOfGroup([tag], g).length) push(stripGroupPrefix(tag.name, g.name));
  }
  return out;
}

/** Values defined by the board's tag groups (an area exists even when no card uses it yet), in the group's order. */
export function definedValues(tagGroups: TagGroup[], configured: string | undefined, fallback: RegExp): string[] {
  const out: string[] = [];
  for (const g of tagGroups) {
    if (!groupNameMatches(g.name, configured, fallback)) continue;
    for (const t of g.tags) {
      const v = stripGroupPrefix(t, g.name);
      if (v && !out.some((x) => norm(x) === norm(v))) out.push(v);
    }
  }
  return out;
}

/** Names of every tag group of the board plus the prefixes used by tag names: what the "Agrupar por" selector offers. */
export function groupNameOptions(tagGroups: TagGroup[], lists: BacklogList[]): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (t && !out.some((x) => norm(x) === norm(t))) out.push(t);
  };
  for (const g of tagGroups) if (g.tags.length) push(g.name);
  for (const l of lists) {
    for (const c of l.cards ?? []) {
      for (const t of c?.tags ?? []) {
        const idx = typeof t?.name === 'string' ? t.name.indexOf(':') : -1;
        if (idx > 0) push(t.name.slice(0, idx));
      }
    }
  }
  return out.slice(0, 60);
}

// ---------------------------------------------------------------------------------------------------------------------
// Items

function ownerOf(a: any): Owner | null {
  const key = assigneeId(a) ?? (typeof a?.email === 'string' && a.email ? a.email : null);
  if (!key) return null;
  const name = typeof a === 'string' ? a : a?.name || a?.displayName || a?.email || key;
  const avatarUrl = typeof a === 'object' && a ? a.avatar_url || a.avatarUrl || undefined : undefined;
  return { key, name: String(name), avatarUrl, email: typeof a === 'object' && a?.email ? a.email : undefined };
}

/** One item per card, in board order. `today` only matters for `daysToDue`. */
export function buildItems(lists: BacklogList[], tagGroups: TagGroup[], names: GroupNames = {}, today: Date = new Date()): BacklogItem[] {
  const todayNumber = dayNumber(today);
  const items: BacklogItem[] = [];
  let order = 0;
  for (const list of lists) {
    const kind = statusKind(list.title ?? '', list.systemKey);
    for (const card of list.cards ?? []) {
      if (!card) continue;
      const due = parseDue(card.dueAt);
      const dueDay = due ? dayNumber(due) : null;
      const { reschedules, originalDate } = parseDescription(card.summary ?? card.description);
      const owners: Owner[] = [];
      for (const a of card.assignees ?? []) {
        const o = ownerOf(a);
        if (o && !owners.some((x) => x.key === o.key)) owners.push(o);
      }
      items.push({
        id: card.id,
        card,
        title: typeof card.title === 'string' ? card.title : '',
        listId: list.id,
        listTitle: list.title ?? '',
        order: order++,
        kind,
        done: kind === 'done' || kind === 'cancelled' || kind === 'deprioritized',
        blocked: kind === 'blocked',
        dueDay,
        dueDate: dueDay === null ? null : dayNumberToIso(dueDay),
        daysToDue: dueDay === null ? null : dueDay - todayNumber,
        reschedules,
        originalDate,
        owners,
        areas: groupValues(card.tags, tagGroups, names.areaGroup, AREA_DEFAULT),
        projects: groupValues(card.tags, tagGroups, names.projectGroup, PROJECT_DEFAULT),
        phases: groupValues(card.tags, tagGroups, names.phaseGroup, PHASE_DEFAULT),
      });
    }
  }
  return items;
}

/** Every person assigned to any item, sorted by name. */
export function collectOwners(items: BacklogItem[]): Owner[] {
  const map = new Map<string, Owner>();
  for (const it of items) for (const o of it.owners) if (!map.has(o.key)) map.set(o.key, o);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export const filterByOwner = (items: BacklogItem[], ownerKey: string | null | undefined): BacklogItem[] =>
  ownerKey ? items.filter((i) => i.owners.some((o) => o.key === ownerKey)) : items;

export const isOpenOverdue = (i: BacklogItem) => !i.done && i.daysToDue !== null && i.daysToDue < 0;

export interface AreaBucket {
  /** Stable key: the area name, `__none__` or `__all__`. */
  key: string;
  /** `area`: a real area; `none`: cards without area on a board that uses areas; `all`: the board has no area group. */
  kind: 'area' | 'none' | 'all';
  name: string;
  items: BacklogItem[];
}

/**
 * Items split by area. Areas defined by the board's tag group come first (in its order) even when empty, then the ones only
 * found on cards (alphabetical). Without any area, everything is one `all` bucket. A card with several areas is in each.
 */
export function groupByArea(items: BacklogItem[], defined: string[]): AreaBucket[] {
  const buckets: AreaBucket[] = [];
  const find = (name: string) => buckets.find((b) => norm(b.name) === norm(name));
  for (const name of defined) if (!find(name)) buckets.push({ key: name, kind: 'area', name, items: [] });
  const definedCount = buckets.length;
  const extra: AreaBucket[] = [];
  const none: BacklogItem[] = [];
  for (const it of items) {
    if (!it.areas.length) {
      none.push(it);
      continue;
    }
    for (const a of it.areas) {
      let b = find(a);
      if (!b) {
        b = { key: a, kind: 'area', name: a, items: [] };
        buckets.push(b);
        extra.push(b);
      }
      b.items.push(it);
    }
  }
  if (!buckets.length) return [{ key: '__all__', kind: 'all', name: '', items: none }];
  extra.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const ordered = [...buckets.slice(0, definedCount), ...extra];
  if (none.length) ordered.push({ key: '__none__', kind: 'none', name: '', items: none });
  return ordered;
}

export const byDueThenOrder = (a: BacklogItem, b: BacklogItem) => {
  if (a.dueDay !== b.dueDay) {
    if (a.dueDay === null) return 1;
    if (b.dueDay === null) return -1;
    return a.dueDay - b.dueDay;
  }
  return a.order - b.order;
};
