/**
 * Pure logic of the board PROJECTS view ("Proyectos"): area -> project -> phase -> tasks with done/total counts.
 * Tasks are sorted by due date (no date last); phases by natural name order ("Fase 2" before "Fase 10"); projects by their
 * earliest open due date. Cards without project / phase go to a trailing "none" project / phase.
 */
import { buildItems, byDueThenOrder, collectOwners, definedValues, DEFAULT_PATTERNS, filterByOwner, groupByArea } from './backlog-common.ts';
import type { AreaBucket, BacklogItem, BacklogList, GroupNames, Owner } from './backlog-common.ts';
import type { TagGroup } from './sorting.ts';
import { percent } from './summary-view.ts';

export interface PhaseNode {
  key: string;
  kind: 'phase' | 'none';
  name: string;
  tasks: BacklogItem[];
  total: number;
  done: number;
  /** Every task of the phase is finished ("Subtareas listas"). */
  allDone: boolean;
}

export interface ProjectNode {
  key: string;
  kind: 'project' | 'none';
  name: string;
  phases: PhaseNode[];
  total: number;
  done: number;
  progress: number;
  /** Has open tasks ("Activo"); false when everything is done. */
  active: boolean;
}

export interface ProjectArea {
  key: string;
  kind: AreaBucket['kind'];
  name: string;
  projects: ProjectNode[];
  total: number;
  done: number;
}

export interface ProjectsResult {
  areas: ProjectArea[];
  owners: Owner[];
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function buildPhases(items: BacklogItem[]): PhaseNode[] {
  const map = new Map<string, PhaseNode>();
  const none: BacklogItem[] = [];
  for (const it of items) {
    if (!it.phases.length) {
      none.push(it);
      continue;
    }
    for (const p of it.phases) {
      let node = map.get(p.toLowerCase());
      if (!node) {
        node = { key: p, kind: 'phase', name: p, tasks: [], total: 0, done: 0, allDone: false };
        map.set(p.toLowerCase(), node);
      }
      node.tasks.push(it);
    }
  }
  const phases = [...map.values()].sort((a, b) => natural(a.name, b.name));
  if (none.length) phases.push({ key: '__none__', kind: 'none', name: '', tasks: none, total: 0, done: 0, allDone: false });
  for (const p of phases) {
    p.tasks.sort(byDueThenOrder);
    p.total = p.tasks.length;
    p.done = p.tasks.filter((t) => t.done).length;
    p.allDone = p.total > 0 && p.done === p.total;
  }
  return phases;
}

function buildProjectNodes(items: BacklogItem[]): ProjectNode[] {
  const map = new Map<string, { name: string; items: BacklogItem[] }>();
  const none: BacklogItem[] = [];
  for (const it of items) {
    if (!it.projects.length) {
      none.push(it);
      continue;
    }
    for (const p of it.projects) {
      const e = map.get(p.toLowerCase()) ?? { name: p, items: [] };
      e.items.push(it);
      map.set(p.toLowerCase(), e);
    }
  }
  const earliestOpen = (list: BacklogItem[]) => Math.min(...list.filter((i) => !i.done && i.dueDay !== null).map((i) => i.dueDay as number), Infinity);
  const make = (key: string, kind: ProjectNode['kind'], name: string, list: BacklogItem[]): ProjectNode => {
    const done = list.filter((i) => i.done).length;
    return { key, kind, name, phases: buildPhases(list), total: list.length, done, progress: percent(done, list.length), active: done < list.length };
  };
  const sorted = [...map.values()].sort((a, b) => {
    const ea = earliestOpen(a.items);
    const eb = earliestOpen(b.items);
    return ea === eb ? natural(a.name, b.name) : ea < eb ? -1 : 1;
  });
  const nodes = sorted.map((e) => make(e.name, 'project', e.name, e.items));
  if (none.length) nodes.push(make('__none__', 'none', '', none));
  return nodes;
}

export function buildProjects(lists: BacklogList[], tagGroups: TagGroup[] = [], opts: GroupNames & { ownerKey?: string | null; today?: Date } = {}): ProjectsResult {
  const all = buildItems(lists, tagGroups, opts, opts.today);
  const defined = definedValues(tagGroups, opts.areaGroup, DEFAULT_PATTERNS.area);
  const buckets = groupByArea(filterByOwner(all, opts.ownerKey), defined);
  return {
    areas: buckets.map((b) => ({
      key: b.key,
      kind: b.kind,
      name: b.name,
      projects: buildProjectNodes(b.items),
      total: b.items.length,
      done: b.items.filter((i) => i.done).length,
    })),
    owners: collectOwners(all),
  };
}

/** Keys of every collapsible row (projects and phases) of the areas, to expand / collapse all at once. */
export function collapsibleKeys(areas: ProjectArea[]): string[] {
  const keys: string[] = [];
  for (const a of areas) {
    for (const p of a.projects) {
      keys.push(`${a.key}/${p.key}`);
      for (const ph of p.phases) keys.push(`${a.key}/${p.key}/${ph.key}`);
    }
  }
  return keys;
}
