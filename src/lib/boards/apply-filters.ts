/**
 * Applies the board filter (one KQL expression) and the per-list filters to the lists of a board. Filtering is a
 * VIEW: the input lists are never mutated, and an invalid expression never throws (it is reported and ignored).
 */
import { filterCards, KqlError, parseKqlFilter } from '../query/kql.ts';
import type { KqlContext } from '../query/kql.ts';
import { toKqlCard } from './kql-cards.ts';
import type { BoardCardLike, BoardListLike } from './kql-cards.ts';

export interface FilterableList extends BoardListLike {
  cards: any[];
}

export interface FilterIssue {
  message: string;
  position: number;
}

/** `cards` = the visible cards; `allCards` = every card of the list (for counts and editor previews). */
export type FilteredList<L> = L & { totalCount: number; allCards: any[] };

export interface BoardFilterResult<L> {
  lists: Array<FilteredList<L>>;
  /** Error of the board expression (all cards are shown meanwhile). */
  error: FilterIssue | null;
  /** Errors of per-list filters, by list id (that list is then not filtered). */
  listErrors: Record<string, FilterIssue>;
  /** Cards on the board / cards shown. */
  total: number;
  shown: number;
}

const issue = (e: unknown): FilterIssue =>
  e instanceof KqlError ? { message: e.message, position: e.position } : { message: e instanceof Error ? e.message : String(e), position: 0 };

/** Validates an expression without evaluating it. `null` = valid (an empty one is valid). */
export function validateExpression(expression: string): FilterIssue | null {
  if (!expression.trim()) return null;
  try {
    parseKqlFilter(expression);
    return null;
  } catch (e) {
    return issue(e);
  }
}

export function applyBoardFilters<L extends FilterableList>(
  lists: L[],
  opts: { expression: string; listFilters?: Record<string, string | undefined>; boardName?: string | null; ctx: KqlContext },
): BoardFilterResult<L> {
  const { expression, listFilters = {}, boardName, ctx } = opts;
  const total = lists.reduce((n, l) => n + l.cards.length, 0);
  const listErrors: Record<string, FilterIssue> = {};
  let error: FilterIssue | null = null;

  const kql = lists.map((l) => l.cards.map((c) => toKqlCard(c as BoardCardLike, l, boardName, { priorityAsTag: true })));

  let boardMatch: Set<string> | null = null;
  if (expression.trim()) {
    try {
      boardMatch = new Set(filterCards(expression, kql.flat(), ctx).map((c) => c.id));
    } catch (e) {
      error = issue(e);
    }
  }

  let shown = 0;
  const out = lists.map((l, i) => {
    let cards = l.cards;
    if (boardMatch) cards = cards.filter((c) => boardMatch!.has(c.id));
    const lf = listFilters[l.id];
    if (lf && lf.trim()) {
      try {
        const keep = new Set(filterCards(lf, kql[i], ctx).map((c) => c.id));
        cards = cards.filter((c) => keep.has(c.id));
      } catch (e) {
        listErrors[l.id] = issue(e);
      }
    }
    shown += cards.length;
    return { ...l, cards, totalCount: l.cards.length, allCards: l.cards } as FilteredList<L>;
  });

  return { lists: out, error, listErrors, total, shown };
}
