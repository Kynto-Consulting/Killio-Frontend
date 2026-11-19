/**
 * Everything a query can read in the current context, grouped for the Sources tab. Pure: the editor passes in what it
 * already knows (tables of the open document, files, shared tables, the other queries of the flow).
 */
import type { SourceData, SourceKind } from './types.ts';

export type SourceGroupId = 'document' | 'queries' | 'shared' | 'owner' | 'sql' | 'builtin';

export interface CatalogItem {
  id: string;
  /** Name shown (and written in the script). */
  name: string;
  /** Short secondary text: where it lives, how big it is. */
  detail: string;
  columns?: string[];
  rows?: number;
  /** What adding it as a new query creates. */
  source: SourceData;
  /** Narrows the source to one document / card (`bricks where document = "X"`). */
  where?: { field: string; value: string };
  /** Translation key under `sources.items` for items that are not a user's table or file (built-in sources, folders). */
  labelKey?: string;
  /** The entry opens into the owner's bricks (name and type of each one) instead of starting a query by itself. */
  expand?: 'bricks';
}

export interface CatalogGroup {
  /** Unique: the kind, or `owner:<document|card>:<title>` for one group per document / card. */
  id: string;
  kind: SourceGroupId;
  /** Owner groups: the document or card the tables and attached files belong to. */
  title?: string;
  ownerKind?: 'document' | 'card';
  /** The document the editor was opened from. */
  current?: boolean;
  items: CatalogItem[];
}

export interface CatalogInput {
  /** Tables of the open document. */
  tables: Array<{ id: string; title: string; columns: string[]; rows?: unknown[] | number }>;
  files: Array<{ id: string; name: string; kind: string; size: number | null; sheets?: string[]; where: 'card' | 'document'; refTitle: string | null }>;
  /** Shared script tables and tables of other documents / cards. */
  queryTables: Array<{ id: string; name: string; origin: 'shared' | 'document' | 'card' | 'file' | 'sql'; columns: string[]; rows?: number; refTitle?: string | null }>;
  /** The other queries of the flow (`from <name>`). */
  queries: Array<{ id: string; name: string }>;
  currentQueryId?: string | null;
}

/** Sources written as one word in KQL, with what each one reads. */
export const BUILTIN_SOURCES: Array<{ kind: SourceKind; word: string }> = [
  { kind: 'documents', word: 'documents' },
  { kind: 'members', word: 'members' },
  { kind: 'groups', word: 'groups' },
  { kind: 'timers', word: 'timers' },
  { kind: 'activity', word: 'activity' },
  { kind: 'scripts', word: 'scripts' },
];

const sizeText = (bytes: number | null): string => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};
const norm = (s: string) => s.trim().toLowerCase();

export function buildSourceCatalog(input: CatalogInput): CatalogGroup[] {
  const groups: CatalogGroup[] = [];

  const docTableIds = new Set(input.tables.map((tb) => tb.id));
  // the open document's title, read from the same tables as the team lists them
  const currentTitle = input.queryTables.find((q) => q.origin === 'document' && docTableIds.has(q.id) && q.refTitle)?.refTitle ?? null;
  const document: CatalogItem[] = input.tables.map((tb) => ({
    id: `doc:${tb.id}`,
    name: tb.title,
    detail: '',
    columns: tb.columns,
    rows: Array.isArray(tb.rows) ? tb.rows.length : typeof tb.rows === 'number' ? tb.rows : undefined,
    source: { kind: 'rows', name: tb.title },
  }));
  // known title: the open document is one block with its tables and its attached files; otherwise just its tables
  if (document.length && !currentTitle) groups.push({ id: 'document', kind: 'document', items: document });

  const queries: CatalogItem[] = input.queries
    .filter((q) => q.id !== input.currentQueryId)
    .map((q) => ({ id: `q:${q.id}`, name: q.name, detail: '', source: { kind: 'query', name: q.name } as SourceData }));
  if (queries.length) groups.push({ id: 'queries', kind: 'queries', items: queries });

  // tables and files are grouped by where they live (a document or a card): attachments belong to their owner, not to the workspace
  const fileNameCount = new Map<string, number>();
  for (const f of input.files) fileNameCount.set(norm(f.name), (fileNameCount.get(norm(f.name)) ?? 0) + 1);
  const docTitles = new Set(input.tables.map((tb) => norm(tb.title)));
  const tableNameCount = new Map<string, number>();
  for (const tb of input.queryTables) if (tb.origin !== 'file' && tb.origin !== 'sql') tableNameCount.set(norm(tb.name), (tableNameCount.get(norm(tb.name)) ?? 0) + 1);

  const shared: CatalogItem[] = [];
  const owners = new Map<string, CatalogGroup>();
  const ownerGroup = (kind: 'document' | 'card', title: string): CatalogGroup => {
    const id = `owner:${kind}:${norm(title)}`;
    let g = owners.get(id);
    if (!g) {
      g = { id, kind: 'owner', ownerKind: kind, title, items: [], ...(kind === 'document' && currentTitle && norm(currentTitle) === norm(title) ? { current: true } : {}) };
      owners.set(id, g);
    }
    return g;
  };
  if (document.length && currentTitle) ownerGroup('document', currentTitle).items.push(...document);
  // external SQL databases: one block per connection, each table read as `rows of "sql:<connection> / <table>"`
  const sqlGroups = new Map<string, CatalogGroup>();
  for (const tb of input.queryTables) {
    if (tb.origin !== 'sql') continue;
    const conn = tb.refTitle || 'SQL';
    let g = sqlGroups.get(conn);
    if (!g) { g = { id: `sql:${norm(conn)}`, kind: 'sql', title: conn, items: [] }; sqlGroups.set(conn, g); }
    g.items.push({ id: `t:${tb.id}`, name: tb.name.replace(/^sql:[^/]*\/\s*/i, ''), detail: '', columns: tb.columns, source: { kind: 'rows', name: tb.id } });
  }
  for (const tb of input.queryTables) {
    if (tb.origin === 'file' || tb.origin === 'sql') continue;
    const ambiguous = (tableNameCount.get(norm(tb.name)) ?? 0) > 1;
    if (tb.origin === 'shared') {
      shared.push({ id: `t:${tb.id}`, name: tb.name, detail: '', columns: tb.columns, rows: tb.rows, source: { kind: 'rows', name: ambiguous ? tb.id : `shared:${tb.name}` } });
      continue;
    }
    // tables of the open document are already listed with it
    if (docTableIds.has(tb.id)) continue;
    const ref = ambiguous || docTitles.has(norm(tb.name)) ? tb.id : tb.name;
    ownerGroup(tb.origin === 'card' ? 'card' : 'document', tb.refTitle || '—').items.push({ id: `t:${tb.id}`, name: tb.name, detail: '', columns: tb.columns, rows: tb.rows, source: { kind: 'rows', name: ref } });
  }
  for (const f of input.files) {
    const unique = (fileNameCount.get(norm(f.name)) ?? 0) <= 1;
    const owner = f.refTitle ? `${f.where === 'card' ? 'card' : 'doc'}:${f.refTitle} / ${f.name}` : f.name;
    ownerGroup(f.where === 'card' ? 'card' : 'document', f.refTitle || '—').items.push({
      id: `f:${f.id}`,
      name: f.name,
      detail: [f.kind.toUpperCase(), sizeText(f.size), f.sheets && f.sheets.length > 1 ? `${f.sheets.length} sheets` : ''].filter(Boolean).join(' · '),
      source: { kind: 'rows', name: unique ? f.name : f.refTitle ? owner : f.id },
    });
  }
  if (shared.length) groups.push({ id: 'shared', kind: 'shared', items: shared });
  groups.push(...[...sqlGroups.values()].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')));
  // bricks and checklist items belong to a document or card too: one folder entry each, narrowed to that owner
  for (const g of owners.values()) {
    const field = g.ownerKind === 'card' ? 'card' : 'document';
    // a document's checklists are bricks: they hang under Bricks, not beside it. A card's checklists have no brick list here.
    if (g.ownerKind === 'document') g.items.push({ id: `${g.id}:bricks`, name: 'bricks', detail: '', labelKey: 'folderBricks', expand: 'bricks', source: { kind: 'bricks', name: '' }, where: { field, value: g.title ?? '' } });
    else g.items.push({ id: `${g.id}:items`, name: 'items', detail: '', labelKey: 'folderItems', source: { kind: 'items', name: '' }, where: { field, value: g.title ?? '' } });
    g.items.push({ id: `${g.id}:comments`, name: 'comments', detail: '', labelKey: 'folderComments', source: { kind: 'comments', name: '' }, where: { field, value: g.title ?? '' } });
  }
  const ownerGroups = [...owners.values()].sort((a, b) => (a.current ? -1 : b.current ? 1 : a.ownerKind === b.ownerKind ? (a.title ?? '').localeCompare(b.title ?? '') : a.ownerKind === 'document' ? -1 : 1));
  // the open document comes first: it is where the editor was opened from
  const currentGroup = ownerGroups.find((g) => g.current);
  if (currentGroup) groups.unshift(currentGroup);
  groups.push(...ownerGroups.filter((g) => g !== currentGroup));

  groups.push({
    id: 'builtin',
    kind: 'builtin',
    items: BUILTIN_SOURCES.map((b) => ({ id: `b:${b.kind}`, name: b.word, detail: '', labelKey: b.word, source: { kind: b.kind, name: '' } as SourceData })),
  });
  return groups;
}

/** Items whose name, detail or columns contain every word of `query`. */
export function filterCatalog(groups: CatalogGroup[], query: string): CatalogGroup[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => { const hay = norm(`${g.title ?? ''} ${it.name} ${it.detail} ${(it.columns ?? []).join(' ')}`); return words.every((w) => hay.includes(w)); }) }))
    .filter((g) => g.items.length > 0);
}
