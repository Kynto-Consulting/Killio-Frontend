import assert from "node:assert/strict";
import test from "node:test";

import { applyTablePatch } from "./table-patch.ts";

test("table_cell sets a simple cell", () => {
  const out = applyTablePatch({ rows: [["a", "b"], ["c", "d"]] }, { kind: "table_cell", rowIndex: 1, colIndex: 0, value: "X" });
  assert.deepEqual(out.rows, [["a", "b"], ["X", "d"]]);
});

test("table_add_row / table_remove_row", () => {
  let c: any = { rows: [["a", "b"]] };
  c = applyTablePatch(c, { kind: "table_add_row" });
  assert.equal(c.rows.length, 2);
  assert.deepEqual(c.rows[1], ["", ""]);
  c = applyTablePatch(c, { kind: "table_remove_row", index: 0 });
  assert.equal(c.rows.length, 1);
});

test("table_add_col / table_remove_col", () => {
  let c: any = { rows: [["a"], ["b"]] };
  c = applyTablePatch(c, { kind: "table_add_col" });
  assert.deepEqual(c.rows, [["a", ""], ["b", ""]]);
  c = applyTablePatch(c, { kind: "table_remove_col", index: 0 });
  assert.deepEqual(c.rows, [[""], [""]]);
});

test("bountiful_table_cell updates a cell by rowId/colId", () => {
  const out = applyTablePatch(
    { rows: [{ id: "r1", cells: { c1: { text: "old" } } }] },
    { kind: "bountiful_table_cell", rowId: "r1", colId: "c1", cell: { text: "new" } },
  );
  assert.deepEqual((out.rows[0] as any).cells.c1, { text: "new" });
});

test("bountiful_table_add_column adds column + null cell per row", () => {
  const out = applyTablePatch(
    { columns: [{ id: "c1" }], rows: [{ id: "r1", cells: { c1: 1 } }] },
    { kind: "bountiful_table_add_column", column: { id: "c2", name: "New" } },
  );
  assert.equal(out.columns.length, 2);
  assert.equal((out.rows[0] as any).cells.c2, null);
});

test("bountiful_table_remove_column drops column + cells", () => {
  const out = applyTablePatch(
    { columns: [{ id: "c1" }, { id: "c2" }], rows: [{ id: "r1", cells: { c1: 1, c2: 2 } }] },
    { kind: "bountiful_table_remove_column", colId: "c2" },
  );
  assert.equal(out.columns.length, 1);
  assert.equal((out.rows[0] as any).cells.c2, undefined);
});

test("unknown patch kind returns content unchanged (clone)", () => {
  const input = { rows: [["a"]] };
  const out = applyTablePatch(input, { kind: "nope" });
  assert.deepEqual(out, input);
});
