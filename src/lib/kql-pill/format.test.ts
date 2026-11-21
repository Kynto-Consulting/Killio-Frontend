import test from "node:test";
import assert from "node:assert/strict";
import { formatKqlResult, kqlResultToPlainText, rowCells, type KqlPillResult } from "./format.ts";

const scalar: KqlPillResult = {
  columns: [{ key: "count", label: "count", kind: "metric" }],
  rows: [{ keys: [], labels: [], values: [12], cells: ["12"] }],
  shape: "scalar",
  matched: 12,
  total: 40,
};
const list = (n: number): KqlPillResult => ({
  columns: [{ key: "title", label: "title", kind: "text" }],
  rows: Array.from({ length: n }, (_, i) => ({ keys: [], labels: [], values: [], cells: [`c${i + 1}`] })),
  shape: n === 1 ? "scalar" : "list",
  matched: n,
  total: 100,
});
const table: KqlPillResult = {
  columns: [{ key: "a", label: "Person", kind: "dim" }, { key: "count", label: "count", kind: "metric" }],
  rows: [
    { keys: ["1"], labels: ["Ana"], values: [3], cells: ["Ana", "3"] },
    { keys: ["2"], labels: ["Bo"], values: [1.256], cells: ["Bo", "1.26"] },
  ],
  shape: "table",
  matched: 4,
  total: 9,
};

test("value: scalar -> text, list -> comma separated", () => {
  assert.equal(formatKqlResult(scalar, "value").text, "12");
  assert.equal(formatKqlResult(list(3), "value").text, "c1, c2, c3");
  assert.equal(formatKqlResult(table, "value").text, "Ana · 3, Bo · 1.26");
});

test("value: long inline list is capped with +N", () => {
  const f = formatKqlResult(list(25), "value");
  assert.equal(f.hiddenRows, 5);
  assert.ok(f.text.endsWith("c20 +5"));
});

test("count uses matched records", () => {
  assert.equal(formatKqlResult(table, "count").text, "4");
  assert.equal(formatKqlResult(list(0), "count").text, "0");
});

test("list gives bullets, capped at 20", () => {
  const f = formatKqlResult(list(23), "list");
  assert.equal(f.kind, "list");
  assert.equal(f.items.length, 20);
  assert.equal(f.hiddenRows, 3);
});

test("table: header, rows and +N more", () => {
  const f = formatKqlResult(table, "table");
  assert.deepEqual(f.header, ["Person", "count"]);
  assert.deepEqual(f.rows, [["Ana", "3"], ["Bo", "1.26"]]);
  const big: KqlPillResult = { ...list(30), columns: [{ label: "t", kind: "text" }] };
  const g = formatKqlResult(big, "table");
  assert.equal(g.rows.length, 20);
  assert.equal(g.hiddenRows, 10);
});

test("empty results", () => {
  assert.equal(formatKqlResult(list(0), "value").text, "—");
  assert.equal(formatKqlResult(list(0), "value").empty, true);
  assert.equal(formatKqlResult(list(0), "table").empty, true);
});

test("cells are derived when the engine omits them", () => {
  const r: KqlPillResult = {
    columns: [{ label: "Who", kind: "dim" }, { label: "n", kind: "metric" }],
    rows: [{ labels: ["Ana"], values: [2.5] }],
    matched: 2,
  };
  assert.deepEqual(rowCells(r.rows[0], r.columns), ["Ana", "2.5"]);
  assert.equal(formatKqlResult(r, "table").rows[0][1], "2.5");
});

test("plain text export is complete", () => {
  assert.equal(kqlResultToPlainText(table, "table"), "Person\tcount\nAna\t3\nBo\t1.26");
  assert.equal(kqlResultToPlainText(list(25), "list").split("\n").length, 25);
  assert.equal(kqlResultToPlainText(scalar, "count"), "12");
});
