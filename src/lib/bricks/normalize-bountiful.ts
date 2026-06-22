// Normalize a beautiful_table (Bountiful Table) brick's content into the
// canonical shape the editor + cell-patch flow expect:
//   columns: { id, name, type }[]   (NOT bare strings)
//   rows:    { id, cells: { [colId]: cell } }[]   (NOT string[] arrays)
//
// AI- and legacy-generated tables often ship string-array columns and array
// rows. Until they're normalized, the renderer can DISPLAY them, but cell
// patches (which match rows by `id` and cells by column `id`) silently no-op —
// the table looks locked/uneditable. Normalizing at LOAD time (sanitize) makes
// state + on-disk content canonical so edits match and persist.

type Rec = Record<string, any>;

const slug = (s: string, fallback: string): string => {
  const k = String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return k || fallback;
};

/**
 * Returns the canonical content. `changed` is true when anything was rewritten,
 * so callers can avoid pointless re-persists. Idempotent: already-canonical
 * content returns `changed: false` and the same column/row identities.
 */
export function normalizeBountifulContent(content: Rec): { content: Rec; changed: boolean } {
  const c: Rec = content || {};
  let changed = false;

  const rawCols = Array.isArray(c.columns) ? c.columns : [];
  const cols = rawCols.map((col: any, i: number) => {
    if (col && typeof col === "object" && typeof col.id === "string") return col;
    changed = true;
    const name = typeof col === "string" ? col : col?.name ?? `Col ${i + 1}`;
    return { id: slug(name, `col-${i}`), name, type: col?.type ?? "text" };
  });

  const rawRows = Array.isArray(c.rows) ? c.rows : [];
  const rows = rawRows.map((r: any, ri: number) => {
    if (r && typeof r === "object" && !Array.isArray(r) && r.cells) return r;
    changed = true;
    const arr = Array.isArray(r) ? r : [];
    const cells: Record<string, { type: "text"; text: string }> = {};
    cols.forEach((col: any, ci: number) => {
      const v = arr[ci];
      if (v !== undefined && v !== null && v !== "") cells[col.id] = { type: "text", text: String(v) };
    });
    return { id: typeof r?.id === "string" ? r.id : `row-${ri}`, cells };
  });

  if (!changed) return { content: c, changed: false };
  return { content: { ...c, columns: cols, rows }, changed: true };
}
