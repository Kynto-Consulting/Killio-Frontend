/**
 * The model of the column menu (the chevron of a header, right click on it, the rows of the Schema view): Power Query's column
 * menus as data. Every id is also a translation key (`cm.<id>`). Commands use the grammar of ribbon-config.ts, plus
 *   col:<name>     an action on the clicked column (rename, copyName, clearSort, detectType)
 *   values         the checkbox list of values (drawn by the menu itself)
 */
import type { ColumnType } from './profile.ts';

export type MenuKind = 'text' | 'number' | 'date' | 'boolean' | 'list' | 'any';

export interface MenuEntry {
  id: string;
  command?: string;
  /** KQL cannot do it yet: shown, disabled, with the "needs engine support" tooltip. */
  engine?: boolean;
  /** Keyboard hint drawn on the right. */
  hint?: string;
  /** Only with more than one column selected. */
  multi?: boolean;
  /** Extra words the search also matches. */
  keywords?: string[];
  children?: MenuEntry[];
  separator?: boolean;
  /** `values`: the checkbox list. */
  values?: boolean;
}

export const menuKindOf = (type: ColumnType): MenuKind => (type === 'empty' ? 'any' : type);

const e = (id: string, command?: string, extra: Partial<MenuEntry> = {}): MenuEntry => ({ id, ...(command ? { command } : {}), ...extra });
const eng = (id: string): MenuEntry => ({ id, engine: true });
const sep = (id: string): MenuEntry => ({ id, separator: true });
const sub = (id: string, children: MenuEntry[], extra: Partial<MenuEntry> = {}): MenuEntry => ({ id, children, ...extra });

const TEXT_FILTERS = (): MenuEntry[] => [
  e('fEquals', 'dlg:filterCompare?op=%3D'), e('fDoesNotEqual', 'dlg:filterCompare?op=!%3D'), e('fBeginsWith', 'dlg:filterCompare?op=startswith'), e('fEndsWith', 'dlg:filterCompare?op=endswith'),
  e('fContains', 'dlg:filterCompare?op=contains'), e('fDoesNotContain', 'dlg:filterCompare?op=not contains'), e('fIsEmpty', 'op:filterEmpty'), e('fIsNotEmpty', 'op:removeEmpty'),
];
const NUMBER_FILTERS = (): MenuEntry[] => [
  e('fEquals', 'dlg:filterCompare?op=%3D'), e('fDoesNotEqual', 'dlg:filterCompare?op=!%3D'), e('fGreaterThan', 'dlg:filterCompare?op=%3E'), e('fGreaterOrEqual', 'dlg:filterCompare?op=%3E%3D'),
  e('fLessThan', 'dlg:filterCompare?op=%3C'), e('fLessOrEqual', 'dlg:filterCompare?op=%3C%3D'), e('fBetween', 'dlg:filterBetween'), e('fIsEmpty', 'op:filterEmpty'), e('fIsNotEmpty', 'op:removeEmpty'),
];
const DATE_FILTERS = (): MenuEntry[] => [
  e('fEquals', 'dlg:filterCompare?op=%3D'), e('fBefore', 'dlg:filterCompare?op=%3C'), e('fAfter', 'dlg:filterCompare?op=%3E'), e('fOnOrBefore', 'dlg:filterCompare?op=%3C%3D'), e('fOnOrAfter', 'dlg:filterCompare?op=%3E%3D'),
  e('fBetween', 'dlg:filterBetween'), e('fPreviousDays', 'dlg:filterWindow?dir=last'), e('fNextDays', 'dlg:filterWindow?dir=next'), e('fIsEmpty', 'op:filterEmpty'), e('fIsNotEmpty', 'op:removeEmpty'),
];

function transformFor(kind: MenuKind): MenuEntry[] {
  switch (kind) {
    case 'text':
      return [e('lower', 'op:lower'), e('upper', 'op:upper'), e('proper', 'op:proper'), e('capitalize', 'op:capitalize'), e('trim', 'op:trim'), e('clean', 'op:clean'), e('length', 'op:length'), e('firstChars', 'dlg:left'), e('lastChars', 'dlg:right'),
        sub('listOps', [e('listJoin', 'dlg:listJoin'), e('listCount', 'op:listCount'), e('listFirst', 'op:listFirst')])];
    case 'number':
      return [
        e('round', 'dlg:round'), e('roundUp', 'op:ceil'), e('roundDown', 'op:floor'), e('abs', 'op:abs'),
        sub('standard', [e('numAdd', 'dlg:numAdd'), e('numSub', 'dlg:numSub'), e('numMul', 'dlg:numMul'), e('numDiv', 'dlg:numDiv'), e('numMod', 'dlg:numMod'), e('numPercent', 'dlg:numPercent')]),
        sub('statistics', [e('statSum', 'op:stat?fn=sum'), e('statMin', 'op:stat?fn=min'), e('statMax', 'op:stat?fn=max'), e('statAvg', 'op:stat?fn=avg'), e('statMedian', 'op:stat?fn=median'), e('statStdDev', 'op:stat?fn=stddev'), e('statCount', 'op:stat?fn=count'), e('statCountDistinct', 'op:stat?fn=count_distinct')]),
      ];
    case 'date':
      return [e('year', 'op:year'), e('month', 'op:month'), e('monthName', 'op:monthName'), e('quarter', 'op:quarter'), e('week', 'op:week'), e('day', 'op:day'), e('dayOfWeek', 'op:dayOfWeek'), e('dayName', 'op:dayName'), e('age', 'op:age'), e('daysUntil', 'op:daysUntil')];
    case 'boolean':
      return [e('notBool', 'op:notBool')];
    case 'list':
      return [e('listJoin', 'dlg:listJoin'), e('listCount', 'op:listCount'), e('listFirst', 'op:listFirst')];
    default:
      return [];
  }
}

function addFromThis(kind: MenuKind): MenuEntry[] {
  const out: MenuEntry[] = [e('customFromThis', 'new:customColumn'), e('conditionalFromThis', 'new:conditional'), e('indexFrom0', 'op:indexColumn?start=0'), e('indexFrom1', 'op:indexColumn?start=1'), e('duplicateColumn2', 'op:duplicateColumn')];
  if (kind === 'date') out.push(sub('dateParts', [e('year', 'op:year?_new=1'), e('month', 'op:month?_new=1'), e('day', 'op:day?_new=1'), e('dayOfWeek', 'op:dayOfWeek?_new=1'), e('age', 'op:age?_new=1')]));
  return out;
}

/** The menu of a column of this type. `sorted` enables "Clear sort". */
export function buildColumnMenu(opts: { type: ColumnType; sorted?: boolean }): MenuEntry[] {
  const kind = menuKindOf(opts.type);
  const filters = kind === 'number' ? NUMBER_FILTERS() : kind === 'date' ? DATE_FILTERS() : kind === 'text' || kind === 'any' ? TEXT_FILTERS() : [e('fIsEmpty', 'op:filterEmpty'), e('fIsNotEmpty', 'op:removeEmpty')];
  const transform = transformFor(kind);
  const hasErrors = kind === 'number' || kind === 'date';
  const out: MenuEntry[] = [
    e('sortAsc', 'op:sortAsc'), e('sortDesc', 'op:sortDesc'),
    e('clearSort', 'col:clearSort'),
    sep('s1'),
    sub(kind === 'number' ? 'numberFilters' : kind === 'date' ? 'dateFilters' : 'textFilters', filters, { keywords: ['filter'] }),
    { id: 'values', values: true },
    sep('s2'),
    sub('changeType', [e('typeWhole', 'op:changeType?type=whole'), e('typeDecimal', 'op:changeType?type=decimal'), e('typeDate', 'op:changeType?type=date'), e('typeDateTime', 'op:changeType?type=datetime'), e('typeBool', 'op:changeType?type=bool'), e('typeText', 'op:changeType?type=text'), eng('typeList'), sep('t1'), e('detectType', 'col:detectType'), eng('usingLocale')], { keywords: ['data type'] }),
    sep('s3'),
    e('renameColumn', 'col:rename', { hint: 'F2' }), e('duplicateColumn', 'op:duplicateColumn'), e('removeColumns', 'op:removeColumn'), e('removeOtherColumns', 'op:removeOtherColumns'),
    e('removeDuplicates', 'op:removeDuplicates'), ...(hasErrors ? [e('removeErrors', 'op:removeErrors')] : []), e('removeBlank', 'op:removeEmpty'),
    e('replaceValues', 'dlg:replace'), ...(hasErrors ? [e('replaceErrors', 'dlg:replaceErrors')] : []),
    sub('fill', [e('fillDown', 'dlg:fillDown'), e('fillUp', 'dlg:fillUp')]),
    sub('move', [e('moveLeft', 'op:moveLeft'), e('moveRight', 'op:moveRight'), e('moveStart', 'op:moveStart'), e('moveEnd', 'op:moveEnd')]),
    e('chooseColumns', 'x:chooseColumns'), eng('hideColumn'), e('copyName', 'col:copyName'),
    sep('s4'),
    ...(transform.length > 0 ? [sub('transform', transform)] : []),
    ...(kind === 'text' || kind === 'any' ? [sub('splitColumn', [e('splitDelimiter', 'dlg:split'), eng('splitChars'), eng('splitPositions'), eng('splitCase')])] : []),
    e('mergeColumns', 'dlg:merge', { multi: true }),
    ...(kind === 'text' || kind === 'any' ? [sub('extract', [e('textBefore', 'dlg:textBefore'), e('textAfter', 'dlg:textAfter'), e('textBetween', 'dlg:textBetween'), e('firstChars', 'dlg:left'), e('lastChars', 'dlg:right'), e('extractRegex', 'dlg:extract')])] : []),
    sub('addFromThis', addFromThis(kind)),
    sep('s5'),
    e('groupBy', 'x:groupBy'), e('unpivotColumns', 'op:unpivotSelected'), e('unpivotOther', 'op:unpivotOther'), e('unpivotOnlySelected', 'op:unpivotSelected'), e('pivotColumn', 'op:pivot'),
    sep('s6'),
    e('showProfile', 'view:profile'), e('showDistribution', 'view:distribution'),
  ];
  return out;
}

/** Normalised text for matching (case and accents ignored). */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface MenuMatch { entry: MenuEntry; /** Parent labels, for "Transform > Text > lowercase". */ path: string[] }

/** Every actionable entry whose label (or keyword) contains the query, with the labels of the submenus it sits in. */
export function searchMenu(entries: MenuEntry[], query: string, labelOf: (id: string) => string): MenuMatch[] {
  const q = fold(query);
  if (!q) return [];
  const out: MenuMatch[] = [];
  const seen = new Set<string>();
  const walk = (list: MenuEntry[], path: string[], inherited: string[]) => {
    for (const entry of list) {
      if (entry.separator || entry.values) continue;
      if (entry.children) { walk(entry.children, [...path, labelOf(entry.id)], [...inherited, ...(entry.keywords ?? [])]); continue; }
      const haystack = [labelOf(entry.id), ...path, ...inherited, ...(entry.keywords ?? [])].map(fold).join(' ');
      const key = `${path.join('>')}>${entry.id}>${entry.command ?? ''}`;
      if (haystack.includes(q) && !seen.has(key)) { seen.add(key); out.push({ entry, path }); }
    }
  };
  walk(entries, [], []);
  return out;
}

/** Why an entry cannot be used right now (null = usable). */
export function entryBlock(entry: MenuEntry, ctx: { selectedCount: number; sorted: boolean }): 'engine' | 'multi' | 'nosort' | null {
  if (entry.engine) return 'engine';
  if (entry.multi && ctx.selectedCount < 2) return 'multi';
  if (entry.id === 'clearSort' && !ctx.sorted) return 'nosort';
  return null;
}

/** All the commands a menu can run (for the "every operation is reachable" checks). */
export function menuCommands(entries: MenuEntry[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.command) out.push(entry.command);
    if (entry.children) out.push(...menuCommands(entry.children));
  }
  return out;
}

/** Every translation id the menu needs (without the `cm.` prefix). */
export function menuLabelIds(entries: MenuEntry[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.separator) out.push(entry.id);
    if (entry.children) out.push(...menuLabelIds(entry.children));
  }
  return out;
}

/** True when no submenu lists the same command / id twice (a menu with two identical rows is a bug). */
export function hasDuplicates(entries: MenuEntry[]): boolean {
  const ids = entries.filter((x) => !x.separator).map((x) => `${x.id}|${x.command ?? ''}`);
  if (new Set(ids).size !== ids.length) return true;
  return entries.some((x) => x.children && hasDuplicates(x.children));
}
