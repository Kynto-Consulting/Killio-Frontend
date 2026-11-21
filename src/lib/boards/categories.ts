/**
 * List categories: named KQL conditions that split ONE list into labelled sections. Purely visual — a card keeps its
 * list identity, so drag-and-drop and counts of the list are unaffected.
 */
import { filterCards, KqlError } from '../query/kql.ts';
import type { KqlCard, KqlContext } from '../query/kql.ts';
import type { SortRule } from './sorting.ts';

export interface BoardCategory {
  id: string;
  name: string;
  /** A KQL condition, e.g. `overdue` or `assignee = me and not done`. */
  expr: string;
  color?: string;
}

/**
 * Per-list view settings. Lists have no settings column on the server, so today this lives in localStorage
 * (see view-storage.ts). A server column (e.g. `lists.view_config jsonb`) can replace the store without touching callers.
 */
export interface ListViewConfig {
  /** A KQL condition applied to this list only (combined with the board filter). */
  filter?: string;
  categories?: BoardCategory[];
  /** Show the cards that match no category (default true). */
  showRest?: boolean;
  /** Name of the "rest" section (default: translated "Rest"). */
  restLabel?: string;
  /** Sort rules of this list (a view only; empty = manual order). Wins over the board sort. */
  sort?: SortRule[];
}

export interface CategorySection {
  id: string;
  kind: 'category' | 'rest';
  name: string;
  color?: string;
  cards: KqlCard[];
  /** KQL error of the category condition (it then matches nothing). */
  error?: string;
}

export const REST_SECTION_ID = '__rest__';

export function describeKqlError(e: unknown): string {
  if (e instanceof KqlError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Every card goes to the FIRST category it matches; the others go to the "rest" section. Categories with an invalid
 * or empty condition match nothing and report their error. Returns every category (even empty) plus the rest section.
 */
export function splitIntoCategories(
  cards: KqlCard[],
  categories: BoardCategory[],
  ctx: KqlContext = {},
  opts: { restLabel?: string } = {},
): CategorySection[] {
  let remaining = cards;
  const sections: CategorySection[] = [];
  for (const cat of categories) {
    let matched: KqlCard[] = [];
    let error: string | undefined;
    if (!cat.expr.trim()) {
      error = 'empty';
    } else {
      try {
        matched = filterCards(cat.expr, remaining, ctx);
      } catch (e) {
        error = describeKqlError(e);
      }
    }
    if (matched.length) {
      const ids = new Set(matched.map((c) => c.id));
      remaining = remaining.filter((c) => !ids.has(c.id));
    }
    sections.push({ id: cat.id, kind: 'category', name: cat.name, color: cat.color, cards: matched, error });
  }
  sections.push({ id: REST_SECTION_ID, kind: 'rest', name: opts.restLabel ?? '', cards: remaining });
  return sections;
}

export function isListViewConfigEmpty(cfg: ListViewConfig | undefined | null): boolean {
  if (!cfg) return true;
  return !cfg.filter?.trim() && !(cfg.categories && cfg.categories.length) && cfg.showRest !== false && !cfg.restLabel?.trim() && !(cfg.sort && cfg.sort.length);
}
