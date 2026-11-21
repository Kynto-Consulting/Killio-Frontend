/**
 * The ribbon of the editor as data: Power Query's tabs (Home, Transform, Add Column, View), their groups and buttons. It only
 * holds query / table level commands and the "any column" ones that act on the current selection; everything that belongs to one
 * column lives in the column menu (column-menu-config.ts). Every id is also the translation key (`rb.<id>`). Commands:
 *   op:<opId>[?k=v&...]  add the step now (no dialog)       dlg:<opId>   ask for its parameters first
 *   new:<opId>           add the step and open its settings  x:<name>     a dedicated dialog (see the editor)
 *   src:<kind>           new query that starts from a source view:<name>  a view option      home:<name> title-row actions
 *   col:<name>           an action on the selected column(s)
 */

export type TabId = 'home' | 'transform' | 'addColumn' | 'view' | 'sources';
export const TAB_IDS: TabId[] = ['home', 'transform', 'addColumn', 'view', 'sources'];

export type Needs = 'column' | 'steps';
export interface Entry { id: string; command: string; needs?: Needs; /** KQL cannot do it yet: disabled with a tooltip. */ engine?: boolean; toggle?: boolean }
export type MenuItem = Entry | { sep: true } | { heading: string };
export interface RibbonItem { id: string; icon: string; command?: string; menu?: MenuItem[]; needs?: Needs; engine?: boolean; toggle?: boolean }
export interface RibbonGroup {
  id: string;
  items: RibbonItem[];
  /** When the ribbon is too narrow the group with the HIGHEST number collapses into one dropdown first. */
  collapse: number;
}

const e = (id: string, command: string, extra: Partial<Entry> = {}): Entry => ({ id, command, ...extra });
const sep = { sep: true } as const;
const engine = (id: string): Entry => ({ id, command: 'disabled', engine: true });
const FORMAT = (suffix: string): Entry[] => [e('lower', `op:lower${suffix}`, { needs: 'column' }), e('upper', `op:upper${suffix}`, { needs: 'column' }), e('proper', `op:proper${suffix}`, { needs: 'column' }), e('trim', `op:trim${suffix}`, { needs: 'column' }), e('clean', `op:clean${suffix}`, { needs: 'column' })];
const EXTRACT = (suffix: string): Entry[] => [e('firstChars', `dlg:left${suffix}`, { needs: 'column' }), e('lastChars', `dlg:right${suffix}`, { needs: 'column' }), e('textRange', `dlg:substr${suffix}`, { needs: 'column' }), e('extractRegex', `dlg:extract${suffix}`, { needs: 'column' })];
const DATE_PARTS = (suffix: string): Entry[] => [e('year', `op:year${suffix}`, { needs: 'column' }), e('month', `op:month${suffix}`, { needs: 'column' }), e('day', `op:day${suffix}`, { needs: 'column' }), e('dayOfWeek', `op:dayOfWeek${suffix}`, { needs: 'column' }), e('age', `op:age${suffix}`, { needs: 'column' })];
const DATA_TYPE: Entry[] = [e('typeWhole', 'op:changeType?type=whole', { needs: 'column' }), e('typeDecimal', 'op:changeType?type=decimal', { needs: 'column' }), e('typeDate', 'op:changeType?type=date', { needs: 'column' }), e('typeDateTime', 'op:changeType?type=datetime', { needs: 'column' }), e('typeBool', 'op:changeType?type=bool', { needs: 'column' }), e('typeText', 'op:changeType?type=text', { needs: 'column' }), engine('typeList')];
const ROUNDING = (suffix: string): Entry[] => [e('round', `dlg:round${suffix}`, { needs: 'column' }), e('roundUp', `op:ceil${suffix}`, { needs: 'column' }), e('roundDown', `op:floor${suffix}`, { needs: 'column' })];

export const RIBBON: Record<TabId, RibbonGroup[]> = {
  home: [
    { id: 'gQuery', collapse: 0, items: [
      { id: 'closeApply', icon: 'check', menu: [e('apply', 'home:apply'), e('closeWithout', 'home:close')] },
      { id: 'newSource', icon: 'database', menu: [e('srcBlank', 'src:blank'), e('srcCards', 'x:fromCards'), e('srcRows', 'x:fromTable'), e('srcFile', 'x:fromFile'), e('srcShared', 'x:fromShared'), e('srcAttachments', 'src:files'), e('enterData', 'x:enterData'), sep, e('srcMembers', 'src:members'), e('srcDocuments', 'src:documents'), e('srcBoards', 'src:boards'), e('srcItems', 'src:items'), e('srcActivity', 'src:activity')] },
      { id: 'manageParameters', icon: 'fx', menu: [e('manageParameters', 'x:params'), e('createFunction', 'x:function')] },
      { id: 'refreshPreview', icon: 'refresh', command: 'home:refresh' },
    ] },
    { id: 'gManageColumns', collapse: 3, items: [
      { id: 'chooseColumns', icon: 'columns', command: 'x:chooseColumns', needs: 'steps' },
      { id: 'removeColumns', icon: 'columnOff', command: 'op:removeColumn', needs: 'column' },
    ] },
    { id: 'gReduceRows', collapse: 2, items: [
      { id: 'keepRows', icon: 'rowsKeep', menu: [e('keepTop', 'dlg:keepTop', { needs: 'steps' }), e('keepBottom', 'dlg:keepBottom', { needs: 'steps' }), e('keepRange', 'dlg:keepRange', { needs: 'steps' })] },
      { id: 'removeRows', icon: 'rowsRemove', menu: [e('removeTop', 'dlg:removeTop', { needs: 'steps' }), e('removeBottom', 'dlg:removeBottom', { needs: 'steps' }), engine('removeAlternate'), sep, e('removeDuplicates', 'op:removeDuplicates', { needs: 'steps' }), e('removeBlank', 'op:removeEmpty', { needs: 'steps' }), e('removeErrors', 'op:removeErrors', { needs: 'column' })] },
    ] },
    { id: 'gSort', collapse: 4, items: [
      { id: 'sortLevels', icon: 'sortAsc', command: 'x:sort', needs: 'steps' },
    ] },
    { id: 'gTransform', collapse: 1, items: [
      { id: 'groupBy', icon: 'group', command: 'x:groupBy', needs: 'steps' },
      { id: 'useFirstRowAsHeaders', icon: 'header', command: 'disabled', engine: true },
      { id: 'transpose', icon: 'transpose', command: 'dlg:transpose', needs: 'steps' },
      { id: 'reverseRows', icon: 'reverse', command: 'op:reverseRows', needs: 'steps' },
      { id: 'countRows', icon: 'count', command: 'op:countRows', needs: 'steps' },
    ] },
    { id: 'gCombine', collapse: 5, items: [
      { id: 'mergeQueries', icon: 'merge', command: 'x:merge', needs: 'steps' },
      { id: 'appendQueries', icon: 'append', command: 'x:append', needs: 'steps' },
    ] },
    { id: 'gAdvanced', collapse: 6, items: [
      { id: 'advancedEditor', icon: 'code', command: 'view:advanced' },
      { id: 'queryProperties', icon: 'panelRight', command: 'x:properties' },
    ] },
  ],
  transform: [
    { id: 'gAnyColumn', collapse: 1, items: [
      { id: 'dataType', icon: 'type', menu: DATA_TYPE },
      { id: 'detectDataType', icon: 'detect', command: 'col:detectType', needs: 'steps' },
      { id: 'replaceValues', icon: 'replace', command: 'dlg:replace', needs: 'column' },
      { id: 'fill', icon: 'fill', menu: [e('fillDown', 'dlg:fillDown', { needs: 'column' }), e('fillUp', 'dlg:fillUp', { needs: 'column' })] },
      { id: 'pivotColumn', icon: 'pivot', command: 'op:pivot', needs: 'column' },
      { id: 'unpivotColumns', icon: 'unpivot', menu: [e('unpivotColumns', 'op:unpivotSelected', { needs: 'column' }), e('unpivotOther', 'op:unpivotOther', { needs: 'column' }), e('unpivotOnlySelected', 'op:unpivotSelected', { needs: 'column' })] },
      { id: 'move', icon: 'move', menu: [e('moveLeft', 'op:moveLeft', { needs: 'column' }), e('moveRight', 'op:moveRight', { needs: 'column' }), e('moveStart', 'op:moveStart', { needs: 'column' }), e('moveEnd', 'op:moveEnd', { needs: 'column' })] },
      { id: 'convertToList', icon: 'list', command: 'disabled', engine: true },
    ] },
    { id: 'gTable', collapse: 0, items: [
      { id: 'transpose', icon: 'transpose', command: 'dlg:transpose', needs: 'steps' },
      { id: 'reverseRows', icon: 'reverse', command: 'op:reverseRows', needs: 'steps' },
      { id: 'countRows', icon: 'count', command: 'op:countRows', needs: 'steps' },
      { id: 'useFirstRowAsHeaders', icon: 'header', command: 'disabled', engine: true },
    ] },
  ],
  addColumn: [
    { id: 'gGeneral', collapse: 0, items: [
      { id: 'customColumn', icon: 'fx', command: 'new:customColumn', needs: 'steps' },
      { id: 'conditionalColumn', icon: 'branch', command: 'new:conditional', needs: 'steps' },
      { id: 'indexColumn', icon: 'hash', menu: [e('indexFrom0', 'op:indexColumn?start=0', { needs: 'steps' }), e('indexFrom1', 'op:indexColumn?start=1', { needs: 'steps' }), e('indexCustom', 'dlg:indexColumn', { needs: 'steps' })] },
      { id: 'duplicateColumn', icon: 'copy', command: 'op:duplicateColumn', needs: 'column' },
      { id: 'columnFromExamples', icon: 'wand', command: 'disabled', engine: true },
    ] },
    { id: 'gFromText', collapse: 3, items: [
      { id: 'format', icon: 'text', menu: FORMAT('?_new=1') },
      { id: 'extract', icon: 'extract', menu: EXTRACT('?_new=1') },
    ] },
    { id: 'gFromNumber', collapse: 2, items: [
      { id: 'rounding', icon: 'round', menu: [...ROUNDING('?_new=1'), e('abs', 'op:abs?_new=1', { needs: 'column' })] },
      { id: 'runningSum', icon: 'sum', command: 'op:runningSum?_new=1', needs: 'column' },
      { id: 'lag', icon: 'lag', menu: [e('lag', 'dlg:lag?_new=1', { needs: 'column' }), e('lead', 'dlg:lead?_new=1', { needs: 'column' })] },
    ] },
    { id: 'gFromDate', collapse: 1, items: [
      { id: 'dateParts', icon: 'calendar', menu: DATE_PARTS('?_new=1') },
    ] },
  ],
  view: [
    { id: 'gLayout', collapse: 2, items: [
      { id: 'querySettings', icon: 'panelRight', command: 'view:querySettings', toggle: true },
      { id: 'formulaBar', icon: 'fx', command: 'view:formulaBar', toggle: true },
      { id: 'queriesPane', icon: 'panelLeft', command: 'view:queriesPane', toggle: true },
    ] },
    { id: 'gDataPreview', collapse: 1, items: [
      { id: 'monospaced', icon: 'mono', command: 'view:monospaced', toggle: true },
      { id: 'showWhitespace', icon: 'space', command: 'view:showWhitespace', toggle: true },
      { id: 'columnQuality', icon: 'quality', command: 'view:quality', toggle: true },
      { id: 'columnDistribution', icon: 'bars', command: 'view:distribution', toggle: true },
      { id: 'columnProfile', icon: 'profile', command: 'view:profile', toggle: true },
    ] },
    { id: 'gProfiling', collapse: 3, items: [
      { id: 'profileTop', icon: 'top', command: 'view:profileTop', toggle: true },
      { id: 'profileAll', icon: 'all', command: 'view:profileAll', toggle: true },
    ] },
    { id: 'gViewAdvanced', collapse: 0, items: [
      { id: 'advancedEditor', icon: 'code', command: 'view:advanced' },
      { id: 'diagramView', icon: 'diagram', command: 'view:diagram', toggle: true },
      { id: 'schemaView', icon: 'schema', command: 'view:schema', toggle: true },
    ] },
  ],
  // the catalog itself is the editor's main area while this tab is open; the ribbon only adds / refreshes
  sources: [
    { id: 'gSources', collapse: 0, items: [
      { id: 'newSource', icon: 'database', menu: [e('srcBlank', 'src:blank'), e('srcCards', 'x:fromCards'), e('srcRows', 'x:fromTable'), e('srcFile', 'x:fromFile'), e('srcShared', 'x:fromShared'), e('srcAttachments', 'src:files'), e('enterData', 'x:enterData')] },
      { id: 'refreshSources', icon: 'refresh', command: 'home:refresh' },
    ] },
  ],
};

/** Every translation key (without the `rb.` prefix) the ribbon needs. */
export function ribbonLabelIds(): string[] {
  const ids = new Set<string>(TAB_IDS.map((t) => `tab_${t}`));
  for (const groups of Object.values(RIBBON)) {
    for (const g of groups) {
      ids.add(g.id);
      for (const item of g.items) {
        ids.add(item.id);
        for (const m of item.menu ?? []) if ('id' in m) ids.add(m.id);
      }
    }
  }
  return [...ids];
}

/** Parses `op:trim?_new=1` into the command kind, the id and its params (values are URL-decoded). */
export function parseCommand(command: string): { kind: string; id: string; params: Record<string, string> } {
  const colon = command.indexOf(':');
  const kind = colon < 0 ? command : command.slice(0, colon);
  const rest = colon < 0 ? '' : command.slice(colon + 1);
  const q = rest.indexOf('?');
  const id = q < 0 ? rest : rest.slice(0, q);
  const params: Record<string, string> = {};
  if (q >= 0) {
    for (const pair of rest.slice(q + 1).split('&')) {
      const eq = pair.indexOf('=');
      const k = eq < 0 ? pair : pair.slice(0, eq);
      let v = eq < 0 ? '' : pair.slice(eq + 1);
      try { v = decodeURIComponent(v); } catch { /* keep as written */ }
      if (k) params[k] = v;
    }
  }
  return { kind, id, params };
}
