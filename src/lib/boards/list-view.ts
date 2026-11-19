/**
 * Pure logic of the board LIST view (a tracker-like table of cards): columns derived from the team tag groups, rows,
 * text search, sorting, grouping by state (= the card's list) and the flat "display items" used for windowing.
 * No React and no path aliases so it runs under `node --test`. Cards arrive already filtered (KQL / per-list filters).
 */
import { parseTagGroupKey, sortCards, tagGroupKey } from './sorting.ts';
import type { SortContext, SortDir, TagGroup } from './sorting.ts';
import { toKqlCard } from './kql-cards.ts';
import type { KqlUser } from '../query/kql.ts';

export interface ListViewList {
  id: string;
  title: string;
  systemKey?: string | null;
  assignedGroupId?: string | null;
  cards: any[];
}

/** Fixed column ids; tag group columns use `tagGroup:<groupId>` (the same key the sorting helpers understand). */
export const FIXED_COLUMN_IDS = ['state', 'assignees', 'due', 'comments'] as const;
export type FixedColumnId = (typeof FIXED_COLUMN_IDS)[number];

export interface TagGroupColumn {
  /** `tagGroup:<groupId>` */
  id: string;
  groupId: string;
  name: string;
}

export interface ListRow {
  id: string;
  card: any;
  listId: string;
  listTitle: string;
  /** Position of the list on the board. */
  listIndex: number;
  /** Tag names of the card per tag group id (only groups the card has tags of). */
  tagsByGroup: Record<string, string[]>;
  /** Lowercase, accent-free text used by the search box. */
  haystack: string;
}

export interface ListSort {
  /** `title` | `list` | `due` | `comments` | `assignee` | `tagGroup:<groupId>` */
  key: string;
  dir: SortDir;
}

export interface ListGroup {
  id: string;
  /** `null` when rows are not grouped. */
  listId: string | null;
  title: string;
  rows: ListRow[];
}

export type ListItem =
  | { kind: 'group'; group: ListGroup }
  | { kind: 'row'; row: ListRow; group: ListGroup }
  | { kind: 'add'; group: ListGroup };

export const ALL_GROUP_ID = '__all__';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function assigneeLabel(a: any): string {
  if (typeof a === 'string') return a;
  return a?.name || a?.displayName || a?.email || '';
}

/** Tag names of `tags` that belong to `group` (case-insensitive), in the card's order. */
export function tagsOfGroup(tags: Array<{ name: string }> | undefined | null, group: TagGroup): string[] {
  if (!tags?.length) return [];
  const wanted = new Set(group.tags.map(norm));
  return tags.filter((t) => t && typeof t.name === 'string' && wanted.has(norm(t.name))).map((t) => t.name);
}

/** The tag groups at least one card uses, in the order the groups are defined: one column each. */
export function deriveTagGroupColumns(lists: ListViewList[], tagGroups: TagGroup[]): TagGroupColumn[] {
  const used = new Set<string>();
  const pending = tagGroups.filter((g) => g.tags.length > 0);
  for (const list of lists) {
    for (const card of list.cards) {
      if (!card.tags?.length) continue;
      for (const g of pending) if (!used.has(g.id) && tagsOfGroup(card.tags, g).length > 0) used.add(g.id);
    }
    if (used.size === pending.length) break;
  }
  return pending.filter((g) => used.has(g.id)).map((g) => ({ id: tagGroupKey(g.id), groupId: g.id, name: g.name }));
}

export function buildRows(lists: ListViewList[], tagGroups: TagGroup[]): ListRow[] {
  const rows: ListRow[] = [];
  lists.forEach((list, listIndex) => {
    for (const card of list.cards) {
      const tagsByGroup: Record<string, string[]> = {};
      for (const g of tagGroups) {
        const own = tagsOfGroup(card.tags, g);
        if (own.length) tagsByGroup[g.id] = own;
      }
      const parts = [card.title ?? '', list.title, ...(card.tags ?? []).map((t: any) => t?.name ?? ''), ...(card.assignees ?? []).map(assigneeLabel)];
      rows.push({ id: card.id, card, listId: list.id, listTitle: list.title, listIndex, tagsByGroup, haystack: norm(parts.join(' \n ')) });
    }
  });
  return rows;
}

/** Every word of the query must appear somewhere in the row (title, state, tags, assignees). Empty query keeps everything. */
export function filterRowsByText(rows: ListRow[], query: string): ListRow[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => words.every((w) => r.haystack.includes(w)));
}

/** Click on a header: none -> asc -> desc -> none. A different column starts at asc. */
export function nextSort(current: ListSort | null | undefined, key: string): ListSort | null {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  return current.dir === 'asc' ? { key, dir: 'desc' } : null;
}

/** Stable sort; rows without a value for the key go last whatever the direction. `null` keeps the incoming (board) order. */
export function sortRows(rows: ListRow[], sort: ListSort | null | undefined, ctx: { users?: KqlUser[]; tagGroups?: TagGroup[] } = {}, boardName?: string | null): ListRow[] {
  if (!sort || rows.length < 2) return rows;
  const dir: SortDir = sort.dir === 'desc' ? 'desc' : 'asc';
  if (sort.key === 'list') {
    const sorted = rows.map((row, i) => ({ row, i })).sort((a, b) => (a.row.listIndex - b.row.listIndex) * (dir === 'desc' ? -1 : 1) || a.i - b.i);
    return sorted.map((x) => x.row);
  }
  const sortCtx: SortContext = { users: ctx.users, tagGroups: ctx.tagGroups };
  const key = sort.key === 'assignees' ? 'assignee' : sort.key;
  return sortCards(
    rows,
    [{ key, dir }],
    sortCtx,
    (r) => toKqlCard(r.card, { id: r.listId, title: r.listTitle }, boardName, { priorityAsTag: true }),
  );
}

/** Groups by state (one group per list, board order, empty lists included so cards can be added) or one flat group. */
export function groupRows(rows: ListRow[], lists: ListViewList[], byState: boolean): ListGroup[] {
  if (!byState) return [{ id: ALL_GROUP_ID, listId: null, title: '', rows }];
  const byList = new Map<string, ListRow[]>();
  for (const l of lists) byList.set(l.id, []);
  for (const r of rows) byList.get(r.listId)?.push(r);
  return lists.map((l) => ({ id: l.id, listId: l.id, title: l.title, rows: byList.get(l.id) ?? [] }));
}

/**
 * Flat list of what is shown, top to bottom: a header per group (only when grouped), its rows unless collapsed, and a
 * "new card" row at the end of each group when `canAdd`. Every item has the same height so windowing is arithmetic.
 */
export function flattenItems(groups: ListGroup[], collapsed: ReadonlySet<string>, opts: { canAdd: boolean }): ListItem[] {
  const out: ListItem[] = [];
  for (const group of groups) {
    const grouped = group.listId !== null;
    if (grouped) out.push({ kind: 'group', group });
    if (grouped && collapsed.has(group.id)) continue;
    for (const row of group.rows) out.push({ kind: 'row', row, group });
    if (grouped && opts.canAdd) out.push({ kind: 'add', group });
  }
  return out;
}

/** Index range [start, end) of the items to render for the scroll position (fixed item height, with overscan). */
export function visibleRange(total: number, scrollTop: number, viewportHeight: number, itemHeight: number, overscan = 8): { start: number; end: number } {
  if (total <= 0 || itemHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / itemHeight);
  const count = Math.ceil(Math.max(0, viewportHeight) / itemHeight);
  return { start: Math.max(0, first - overscan), end: Math.min(total, first + count + overscan) };
}

/** Columns the user can toggle in the "Columns" menu: the fixed ones plus one per used tag group. The title is always on. */
export function toggleableColumnIds(tagColumns: TagGroupColumn[]): string[] {
  return ['state', ...tagColumns.map((c) => c.id), 'assignees', 'due', 'comments'];
}

export function visibleColumnIds(tagColumns: TagGroupColumn[], hidden: readonly string[] | undefined): string[] {
  const off = new Set(hidden ?? []);
  return toggleableColumnIds(tagColumns).filter((id) => !off.has(id));
}

export function toggleHiddenColumn(hidden: readonly string[] | undefined, id: string): string[] {
  const list = hidden ?? [];
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Sort keys the table understands; anything else (an old or hand-edited config) is dropped. */
export function isSortableKey(key: string): boolean {
  return ['title', 'list', 'due', 'comments', 'assignees'].includes(key) || parseTagGroupKey(key) !== null;
}

export interface ListCounts {
  shown: number;
  total: number;
}
