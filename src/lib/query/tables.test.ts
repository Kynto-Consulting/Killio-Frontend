import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCell, tableFromBrick, tablesFromBricks, uniqueColumnNames } from "./tables.ts";

test("normalizeCell covers every Bountiful cell shape", () => {
  assert.equal(normalizeCell({ type: "text", text: "hi" }), "hi");
  assert.equal(normalizeCell({ type: "select", name: "Open", color: "red" }), "Open");
  assert.deepEqual(normalizeCell({ type: "multiselect", items: [{ name: "a" }, { label: "b" }] }), ["a", "b"]);
  assert.deepEqual(normalizeCell({ type: "person", users: [{ id: "u1", name: "Ana" }, { id: "u2", email: "b@x.com" }, { id: "u3" }] }), ["Ana", "b@x.com", "u3"]);
  assert.equal(normalizeCell({ type: "date", start: "2026-03-05", end: "2026-03-09" }), "2026-03-05T00:00:00.000Z");
  assert.equal(normalizeCell({ type: "date" }), null);
  assert.equal(normalizeCell({ type: "number", number: 42 }), 42);
  assert.equal(normalizeCell({ type: "number", number: 0 }), 0);
  assert.equal(normalizeCell({ type: "checkbox", checked: false }), false);
  assert.equal(normalizeCell({ type: "checkbox", checked: true }), true);
  assert.equal(normalizeCell({ type: "url", url: "https://k.io" }), "https://k.io");
  assert.equal(normalizeCell({ type: "formula", value: "3.5", formula: "a+b" }), 3.5);
  assert.equal(normalizeCell({ type: "formula", value: "abc" }), "abc");
  assert.deepEqual(normalizeCell({ type: "document", documents: [{ id: "d", name: "Spec" }] }), ["Spec"]);
  assert.deepEqual(normalizeCell({ type: "cards", cards: [{ id: "c1" }] }), ["c1"]);
  assert.deepEqual(normalizeCell({ type: "boards", boards: [{ id: "b", name: "B" }] }), ["B"]);
  assert.equal(normalizeCell({ type: "weird", value: "v" }), "v");
  assert.equal(normalizeCell({ type: "text", text: "" }), null);
  assert.equal(normalizeCell(null), null);
  assert.equal(normalizeCell("plain"), "plain");
  assert.equal(normalizeCell(""), null);
  assert.equal(normalizeCell(7), 7);
  assert.equal(normalizeCell(Number.NaN), null);
  assert.deepEqual(normalizeCell(["x", { name: "y" }]), ["x", "y"]);
});

test("column names are made unique", () => {
  assert.deepEqual(uniqueColumnNames(["A", "A", "B", "A", ""]), ["A", "A (2)", "B", "A (3)", "Column 5"]);
});

test("a bountiful table becomes a KQL table keyed by column name", () => {
  const t = tableFromBrick({
    id: "k1",
    kind: "bountiful_table",
    owner: "Doc",
    content: {
      title: "Clients",
      columns: [
        { id: "c1", name: "Name", type: "text" },
        { id: "c2", name: "Status", type: "select" },
        { id: "c3", name: "Name", type: "text" },
        { id: "c4", name: "Owner", type: "person" },
        { id: "c5", name: "Done", type: "checkbox" },
      ],
      rows: [
        { id: "r1", _createdAt: "2026-03-01T00:00:00Z", _lastEditedAt: "2026-03-02T00:00:00Z", cells: { c1: { type: "text", text: "Acme" }, c2: { type: "select", name: "Open" }, c3: { type: "text", text: "dup" }, c4: { type: "people", users: [{ id: "u", name: "Ana" }] }, c5: { type: "checkbox", checked: true } } },
        { id: "r2", cells: { c2: { type: "select", name: "Closed" } } },
      ],
    },
  });
  assert.ok(t);
  assert.deepEqual([t.id, t.title, t.kind, t.columns], ["k1", "Clients", "bountiful_table", ["Name", "Status", "Name (2)", "Owner", "Done"]]);
  assert.deepEqual(t.rows[0].fields, { Name: "Acme", Status: "Open", "Name (2)": "dup", Owner: ["Ana"], Done: true });
  assert.deepEqual([t.rows[0].id, t.rows[0].title, t.rows[0].created, t.rows[0].updated], ["r1", "Acme", "2026-03-01T00:00:00.000Z", "2026-03-02T00:00:00.000Z"]);
  assert.deepEqual([t.rows[1].title, t.rows[1].fields?.Name, t.rows[1].fields?.Status], ["Closed", null, "Closed"]);
});

test("a database brick may key cells by column name and falls back to the owner title", () => {
  const t = tableFromBrick({ id: "k", kind: "database", owner: "Inventory", content: { columns: [{ id: "a", name: "Item", type: "text" }, { id: "b", name: "Qty", type: "number" }], rows: [{ id: "r", cells: { Item: "Bolt", b: { type: "number", number: 5 } } }] } });
  assert.equal(t?.title, "Inventory");
  assert.deepEqual(t?.rows[0].fields, { Item: "Bolt", Qty: 5 });
});

test("a simple table uses its first row as header and numbers become numbers", () => {
  const t = tableFromBrick({ id: "k", kind: "table", owner: "Doc", content: { rows: [["Name", "Score", "Name"], ["Ana", "10", "x"], ["Luis", "7.5", ""], ["", "3"]] } });
  assert.deepEqual(t?.columns, ["Name", "Score", "Name (2)"]);
  assert.deepEqual(t?.rows.map((r) => [r.id, r.title, r.fields]), [
    ["k:1", "Ana", { Name: "Ana", Score: 10, "Name (2)": "x" }],
    ["k:2", "Luis", { Name: "Luis", Score: 7.5, "Name (2)": null }],
    ["k:3", "3", { Name: null, Score: 3, "Name (2)": null }],
  ]);
  assert.equal(tableFromBrick({ id: "k", kind: "table", content: { rows: [] } })?.rows.length, 0);
  assert.equal(tableFromBrick({ id: "k", kind: "table", content: { foo: 1 } }), null);
});

test("tablesFromBricks keeps only table kinds and titles them by content.title or id", () => {
  const tables = tablesFromBricks([
    { id: "b1", kind: "table", content: { title: "Ventas", rows: [["Mes", "Monto"], ["Ene", "10"]] } },
    { id: "b2", kind: "bountiful_table", content: { columns: [{ id: "a", name: "X", type: "text" }], rows: [] } },
    { id: "b3", kind: "text", content: { rows: [["a"]] } },
    { id: "b4", kind: "database", content: { nothing: true } },
  ]);
  assert.deepEqual(tables.map((t) => [t.id, t.title, t.kind]), [["b1", "Ventas", "table"], ["b2", "b2", "bountiful_table"]]);
});
