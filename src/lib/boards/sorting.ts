/**
 * Multi-level card sorting (a VIEW: positions are never rewritten) and tag groups used as sort orders.
 *
 * Tag group shape is exactly `{ id, name, tags }` so it can be handed unchanged to `KqlContext.tagGroups` once the
 * KQL engine understands it (`rank("Group name")`).
 */
import type { KqlCard, KqlUser } from '../query/kql.ts';

export interface TagGroup {
  id: string;
  name: string;
  /** Ordered tag names; the position is the rank (lower first). */
  tags: string[];
}

export type SortDir = 'asc' | 'desc';
/** `manual` | title | due | start | created | updated | completed | priority | assignee | points | comments | `tagGroup:<groupId>` */
export interface SortRule {
  key: string;
  dir: SortDir;
}

export const SORT_KEYS = ['manual', 'title', 'due', 'start', 'created', 'updated', 'completed', 'priority', 'assignee', 'points', 'comments'] as const;
export const TAG_GROUP_KEY_PREFIX = 'tagGroup:';

export const tagGroupKey = (groupId: string) => `${TAG_GROUP_KEY_PREFIX}${groupId}`;
export const parseTagGroupKey = (key: string): string | null => (key.startsWith(TAG_GROUP_KEY_PREFIX) ? key.slice(TAG_GROUP_KEY_PREFIX.length) : null);

export interface SortContext {
  users?: KqlUser[];
  tagGroups?: TagGroup[];
}

/** Rules that actually reorder (manual and duplicates dropped). Empty = manual order. */
export function normalizeSortRules(rules: SortRule[] | undefined | null): SortRule[] {
  const seen = new Set<string>();
  const out: SortRule[] = [];
  for (const r of rules ?? []) {
    if (!r || typeof r.key !== 'string' || r.key === 'manual' || seen.has(r.key)) continue;
    seen.add(r.key);
    out.push({ key: r.key, dir: r.dir === 'desc' ? 'desc' : 'asc' });
  }
  return out;
}

/** The list's own sort wins over the board's. */
export function effectiveSortRules(listRules: SortRule[] | undefined, boardRules: SortRule[] | undefined): SortRule[] {
  const own = normalizeSortRules(listRules);
  return own.length ? own : normalizeSortRules(boardRules);
}

const norm = (s: string) => s.trim().toLowerCase();

/** Lowest position among the card's tags that belong to the group; `null` when none does. */
export function tagGroupRank(tags: string[] | undefined, group: TagGroup | undefined): number | null {
  if (!group || !tags || !tags.length) return null;
  const wanted = new Set(tags.map(norm));
  for (let i = 0; i < group.tags.length; i++) if (wanted.has(norm(group.tags[i]))) return i;
  return null;
}

const PRIORITY_RANK: Record<string, number> = {
  urgente: 0, urgent: 0, critica: 0, critical: 0, crítica: 0,
  alta: 1, high: 1,
  media: 2, medium: 2, normal: 2,
  baja: 3, low: 3,
};

type Value = number | string | null;

const time = (s: string | null | undefined): Value => {
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isNaN(n) ? null : n;
};

function userLabel(id: string, users: KqlUser[] | undefined): string {
  const u = users?.find((x) => x.id === id);
  return norm(u?.name || u?.alias || u?.email || id);
}

function valueFor(card: KqlCard, key: string, ctx: SortContext): Value {
  switch (key) {
    case 'title': return card.title ? norm(card.title) : null;
    case 'due': return time(card.due);
    case 'start': return time(card.start);
    case 'created': return time(card.created);
    case 'updated': return time(card.updated);
    case 'completed': return time(card.completed);
    case 'points': return typeof card.points === 'number' ? card.points : null;
    case 'comments': return typeof card.comments === 'number' ? card.comments : null;
    case 'priority': {
      if (!card.priority) return null;
      const p = norm(card.priority);
      return p in PRIORITY_RANK ? PRIORITY_RANK[p] : 100 + [...p].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 1_000_003, 0) / 1_000_003;
    }
    case 'assignee': {
      const names = (card.assignees ?? []).map((id) => userLabel(id, ctx.users)).sort();
      return names.length ? names[0] : null;
    }
    default: {
      const gid = parseTagGroupKey(key);
      if (gid === null) return null;
      return tagGroupRank(card.tags, ctx.tagGroups?.find((g) => g.id === gid));
    }
  }
}

function compare(a: Value, b: Value): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return (a as number) - (b as number);
}

/**
 * Stable multi-level sort. Cards without a value for a rule go last for that rule whatever the direction.
 * `toKql` maps your own card objects to KQL cards (identity by default); the input array is not mutated.
 */
export function sortCards<T = KqlCard>(items: T[], rules: SortRule[], ctx: SortContext = {}, toKql: (item: T) => KqlCard = (x) => x as unknown as KqlCard): T[] {
  const active = normalizeSortRules(rules);
  if (!active.length || items.length < 2) return items;
  const rows = items.map((item, index) => {
    const card = toKql(item);
    return { item, index, values: active.map((r) => valueFor(card, r.key, ctx)) };
  });
  rows.sort((x, y) => {
    for (let i = 0; i < active.length; i++) {
      const a = x.values[i];
      const b = y.values[i];
      if (a === null && b === null) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      const c = compare(a, b);
      if (c !== 0) return active[i].dir === 'desc' ? -c : c;
    }
    return x.index - y.index;
  });
  return rows.map((r) => r.item);
}

/** Short human text of a rule list, e.g. `Due ↑ · Prioridad ↓` (labels come from the caller for i18n). */
export function describeSort(rules: SortRule[], label: (key: string) => string): string {
  return normalizeSortRules(rules).map((r) => `${label(r.key)} ${r.dir === 'desc' ? '↓' : '↑'}`).join(' · ');
}

// ── Tag groups ──────────────────────────────────────────────────────────────

export function sanitizeTagGroups(raw: unknown): TagGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: TagGroup[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    const o = r as Record<string, unknown> | null;
    if (!o || typeof o.id !== 'string' || !o.id || ids.has(o.id) || typeof o.name !== 'string' || !o.name.trim()) continue;
    ids.add(o.id);
    const tags: string[] = [];
    if (Array.isArray(o.tags)) for (const t of o.tags) if (typeof t === 'string' && t.trim() && !tags.includes(t)) tags.push(t.slice(0, 80));
    out.push({ id: o.id.slice(0, 64), name: o.name.trim().slice(0, 80), tags: tags.slice(0, 100) });
  }
  return out.slice(0, 50);
}

/** One category per tag of the group, in order (the caller adds the "rest" section). */
export function categoriesFromTagGroup(group: TagGroup): Array<{ id: string; name: string; expr: string }> {
  return group.tags.map((t, i) => ({ id: `tg-${group.id}-${i}`, name: t, expr: `tag = "${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` }));
}

/** Moves item `from` to position `to` (clamped); returns a new array. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, x);
  return next;
}
