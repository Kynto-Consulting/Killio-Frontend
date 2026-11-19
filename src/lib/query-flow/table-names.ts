/**
 * How a table / file is written in `rows of "..."`: its plain name, or, when two tables share a name, qualified with its kind
 * (`shared:Name`, `doc:Informe / ventas.csv`, `card:Tarea / ventas.csv`); the id is the last resort.
 */

export type TableOrigin = 'shared' | 'document' | 'card' | 'file' | 'sql';
export interface TableRef { id: string; name: string; origin: TableOrigin; refTitle?: string | null }

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function candidate(t: TableRef, fileWhere?: 'card' | 'document'): string {
  const holder = t.refTitle?.trim();
  switch (t.origin) {
    case 'shared': return `shared:${t.name}`;
    case 'document': return holder ? `doc:${holder} / ${t.name}` : `doc:${t.name}`;
    case 'card': return holder ? `card:${holder} / ${t.name}` : `card:${t.name}`;
    default: return holder ? `${fileWhere === 'card' ? 'card' : 'doc'}:${holder} / ${t.name}` : t.name;
  }
}

/** The name to write for `t` among `all` (`fileWhere` tells where a file is attached: a card or a document). */
export function qualifiedName(t: TableRef, all: TableRef[], fileWhere?: Record<string, 'card' | 'document'>): string {
  // an external SQL table is always written whole: `sql:<connection> / <table>` is its id
  if (t.origin === 'sql') return t.id;
  const same = all.filter((o) => o.id !== t.id && fold(o.name) === fold(t.name));
  if (same.length === 0) return t.name;
  const mine = candidate(t, fileWhere?.[t.id]);
  const clash = same.some((o) => fold(candidate(o, fileWhere?.[o.id])) === fold(mine));
  return clash ? t.id : mine;
}

export interface TableOption { value: string; label: string; origin: TableOrigin; id: string }

/** Options of a table picker: value = what goes in `rows of "..."`, label = what the user reads. */
export function tableOptions(all: TableRef[], fileWhere?: Record<string, 'card' | 'document'>): TableOption[] {
  return all
    .map((t) => ({ value: qualifiedName(t, all, fileWhere), label: t.refTitle ? `${t.name} (${t.refTitle})` : t.name, origin: t.origin, id: t.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
