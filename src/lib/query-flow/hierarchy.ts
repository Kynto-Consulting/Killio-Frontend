/**
 * The boards > lists > cards hierarchy for the Sources tab, and how a cherry-picked selection becomes a query:
 * a whole board / list uses the engine's scope (`cards in board "X" list "Y"`), anything else a `title`-independent
 * filter on card ids (`cards where id in (...)`).
 */
import type { SourceData } from './types.ts';

export interface HCard { id: string; title: string }
export interface HList { name: string; cards: HCard[] }
export interface HBoard { name: string; lists: HList[] }

export interface CardRow { board: string; list: string; id: string; title: string }

/** Boards, their lists and cards, in the order they first appear (the query orders them). */
export function buildHierarchy(rows: CardRow[]): HBoard[] {
  const boards = new Map<string, Map<string, HCard[]>>();
  for (const r of rows) {
    const b = r.board || '—';
    const l = r.list || '—';
    if (!boards.has(b)) boards.set(b, new Map());
    const lists = boards.get(b)!;
    if (!lists.has(l)) lists.set(l, []);
    lists.get(l)!.push({ id: r.id, title: r.title });
  }
  return [...boards].map(([name, lists]) => ({ name, lists: [...lists].map(([lname, cards]) => ({ name: lname, cards })) }));
}

/** Script that reads the hierarchy: one row per card. */
export const HIERARCHY_SCRIPT = 'cards select board, list, id, title order by board, list limit 3000';

/** Selected card ids (a Set is used so a board / list tick is just "all its cards"). */
export type Selection = Set<string>;

export const boardIds = (b: HBoard): string[] => b.lists.flatMap((l) => l.cards.map((c) => c.id));
export const listIds = (l: HList): string[] => l.cards.map((c) => c.id);

export type CheckState = 'none' | 'some' | 'all';
export function checkState(ids: string[], sel: Selection): CheckState {
  if (ids.length === 0) return 'none';
  let n = 0;
  for (const id of ids) if (sel.has(id)) n++;
  return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
}

/** Toggles all ids: when every one is selected they are removed, otherwise all are added. */
export function toggleIds(sel: Selection, ids: string[]): Selection {
  const next = new Set(sel);
  const all = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) (all ? next.delete(id) : next.add(id));
  return next;
}

export interface PickPlan {
  source: SourceData;
  /** Card ids for a `where id in (...)` filter; empty when the scope alone says it. */
  ids: string[];
  count: number;
}

/**
 * What to run for a selection: a single whole board or a single whole list → the engine scope (cheap and it keeps
 * the "reads from here" label); otherwise the cards source filtered by the picked ids.
 */
export function planSelection(tree: HBoard[], sel: Selection): PickPlan | null {
  const picked = tree.flatMap((b) => b.lists.flatMap((l) => l.cards.filter((c) => sel.has(c.id)).map((c) => c.id)));
  if (picked.length === 0) return null;
  const touchedBoards = tree.filter((b) => b.lists.some((l) => l.cards.some((c) => sel.has(c.id))));
  if (touchedBoards.length === 1) {
    const b = touchedBoards[0];
    const touchedLists = b.lists.filter((l) => l.cards.some((c) => sel.has(c.id)));
    if (touchedLists.length === 1 && checkState(listIds(touchedLists[0]), sel) === 'all') {
      return { source: { kind: 'cards', name: '', scope: { board: b.name, list: touchedLists[0].name } }, ids: [], count: picked.length };
    }
    if (checkState(boardIds(b), sel) === 'all') return { source: { kind: 'cards', name: '', scope: { board: b.name, list: '' } }, ids: [], count: picked.length };
  }
  return { source: { kind: 'cards', name: '' }, ids: picked, count: picked.length };
}
