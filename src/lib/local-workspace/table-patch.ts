// Apply a table/bountiful-table cell/column patch to a brick's content locally.
// Offline there is no realtime echo, so patch handlers must mutate state here.
// Mirrors the document realtime reducer's cell/column patch logic. Pure.

type Rec = Record<string, any>;

export function applyTablePatch(content: Rec, patch: Rec): Rec {
  const c: Rec = { ...(content || {}) };
  switch (patch?.kind) {
    case "table_cell": {
      if (patch.rowIndex === undefined || patch.colIndex === undefined) return c;
      const rows = (c.rows || []).map((row: string[], i: number) => {
        if (i !== patch.rowIndex) return row;
        const r = [...row];
        r[patch.colIndex] = patch.value;
        return r;
      });
      return { ...c, rows };
    }
    case "bountiful_table_cell": {
      if (!patch.rowId || !patch.colId) return c;
      const rows = (c.rows || []).map((r: Rec) =>
        r.id !== patch.rowId ? r : { ...r, ...(patch.rowMeta ?? {}), cells: { ...(r.cells || {}), [patch.colId]: patch.cell } }
      );
      return { ...c, rows };
    }
    case "bountiful_table_column": {
      if (!patch.colId) return c;
      const columns = (c.columns || []).map((col: Rec) => (col.id !== patch.colId ? col : { ...col, ...patch.updates }));
      return { ...c, columns };
    }
    case "bountiful_table_add_column": {
      if (!patch.column) return c;
      const cols = [...(c.columns || [])];
      cols.splice(patch.atIndex ?? cols.length, 0, patch.column);
      const rows = (c.rows || []).map((r: Rec) => ({ ...r, cells: { ...(r.cells || {}), [patch.column.id]: null } }));
      return { ...c, columns: cols, rows };
    }
    case "bountiful_table_remove_column": {
      if (!patch.colId) return c;
      const columns = (c.columns || []).filter((col: Rec) => col.id !== patch.colId);
      const rows = (c.rows || []).map((r: Rec) => {
        const cells = { ...(r.cells || {}) };
        delete cells[patch.colId];
        return { ...r, cells };
      });
      return { ...c, columns, rows };
    }
    case "bountiful_table_duplicate_column": {
      if (!patch.srcColId || !patch.newColId) return c;
      const srcIdx = (c.columns || []).findIndex((col: Rec) => col.id === patch.srcColId);
      if (srcIdx < 0) return c;
      const src = c.columns[srcIdx];
      const newCol = { ...src, id: patch.newColId, name: patch.newName || `${src.name} (copy)` };
      const columns = [...(c.columns || [])];
      columns.splice(patch.atIndex !== undefined ? patch.atIndex : srcIdx + 1, 0, newCol);
      const rows = (c.rows || []).map((r: Rec) => ({
        ...r,
        cells: { ...(r.cells || {}), [patch.newColId]: r.cells?.[patch.srcColId] ? { ...r.cells[patch.srcColId] } : null },
      }));
      return { ...c, columns, rows };
    }
    case "table_add_row": {
      const rows = (c.rows as string[][]) || [];
      const cols = rows[0]?.length || 1;
      return { ...c, rows: [...rows, new Array(cols).fill("")] };
    }
    case "table_remove_row": {
      if (patch.index === undefined) return c;
      const rows = ((c.rows as string[][]) || []).filter((_: any, i: number) => i !== patch.index);
      return { ...c, rows };
    }
    case "table_add_col": {
      const rows = ((c.rows as string[][]) || []).map((row: string[]) => [...row, ""]);
      return { ...c, rows };
    }
    case "table_remove_col": {
      if (patch.index === undefined) return c;
      const rows = ((c.rows as string[][]) || []).map((row: string[]) => row.filter((_: any, i: number) => i !== patch.index));
      return { ...c, rows };
    }
    default:
      return c;
  }
}
