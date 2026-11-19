/**
 * Pure logic of the board SUMMARY view ("Resumen"): one card per area with KPIs (open, overdue, due in 7 days, blocked),
 * progress split by status (= board list), the most overdue open cards and how many times due dates were moved.
 * See `backlog-common.ts` for how cards, tag groups and descriptions are read.
 */
import { buildItems, collectOwners, definedValues, DEFAULT_PATTERNS, filterByOwner, groupByArea, isOpenOverdue } from './backlog-common.ts';
import type { AreaBucket, BacklogItem, BacklogList, GroupNames, Owner, StatusKind } from './backlog-common.ts';
import type { TagGroup } from './sorting.ts';

export const DUE_SOON_DAYS = 7;
export const TOP_OVERDUE = 3;

export interface StatusSegment {
  listId: string;
  title: string;
  kind: StatusKind;
  count: number;
}

export interface OverdueEntry {
  item: BacklogItem;
  daysLate: number;
  /** First project tag value of the card, or null. */
  project: string | null;
}

export interface AreaSummary {
  key: string;
  kind: AreaBucket['kind'];
  name: string;
  total: number;
  open: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  done: number;
  /** Whole percent done / total (0 when there are no cards). */
  progress: number;
  /** One segment per list that has cards, in board order. */
  statuses: StatusSegment[];
  topOverdue: OverdueEntry[];
  /** Sum of the reschedule counts of the area's cards. */
  rescheduled: number;
  empty: boolean;
}

export interface SummaryResult {
  areas: AreaSummary[];
  owners: Owner[];
  /** True when the board has an area group (otherwise there is one "all" card). */
  hasAreaGroup: boolean;
}

export const percent = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

export function summarizeBucket(bucket: AreaBucket, lists: BacklogList[]): AreaSummary {
  const items = bucket.items;
  const open = items.filter((i) => !i.done);
  const overdue = open.filter(isOpenOverdue);
  const statuses: StatusSegment[] = [];
  for (const l of lists) {
    const inList = items.filter((i) => i.listId === l.id);
    if (inList.length) statuses.push({ listId: l.id, title: l.title, kind: inList[0].kind, count: inList.length });
  }
  const done = items.length - open.length;
  return {
    key: bucket.key,
    kind: bucket.kind,
    name: bucket.name,
    total: items.length,
    open: open.length,
    overdue: overdue.length,
    dueSoon: open.filter((i) => i.daysToDue !== null && i.daysToDue >= 0 && i.daysToDue <= DUE_SOON_DAYS).length,
    blocked: items.filter((i) => i.blocked).length,
    done,
    progress: percent(done, items.length),
    statuses,
    topOverdue: [...overdue]
      .sort((a, b) => (a.daysToDue as number) - (b.daysToDue as number) || a.order - b.order)
      .slice(0, TOP_OVERDUE)
      .map((item) => ({ item, daysLate: -(item.daysToDue as number), project: item.projects[0] ?? null })),
    rescheduled: items.reduce((n, i) => n + i.reschedules, 0),
    empty: items.length === 0,
  };
}

/** `ownerKey`: only cards assigned to that person (the owner list is always built from every card). */
export function buildSummary(lists: BacklogList[], tagGroups: TagGroup[] = [], opts: GroupNames & { ownerKey?: string | null; today?: Date } = {}): SummaryResult {
  const all = buildItems(lists, tagGroups, opts, opts.today);
  const defined = definedValues(tagGroups, opts.areaGroup, DEFAULT_PATTERNS.area);
  const buckets = groupByArea(filterByOwner(all, opts.ownerKey), defined);
  return {
    areas: buckets.map((b) => summarizeBucket(b, lists)),
    owners: collectOwners(all),
    hasAreaGroup: buckets.some((b) => b.kind !== 'all'),
  };
}
