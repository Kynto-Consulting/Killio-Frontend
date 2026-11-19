import assert from "node:assert/strict";
import test from "node:test";

import { buildRows, deriveTagGroupColumns, filterRowsByText, flattenItems, groupRows, nextSort, sortRows, toggleHiddenColumn, visibleColumnIds, visibleRange } from "./list-view.ts";
import type { ListViewList } from "./list-view.ts";

const tag = (name: string) => ({ id: name, name });
const groups = [
  { id: "g-init", name: "Iniciativa", tags: ["INI-1", "INI-2", "INI-3"] },
  { id: "g-resp", name: "Responsable", tags: ["Ana", "Luis"] },
  { id: "g-unused", name: "Fuente", tags: ["Excel"] },
  { id: "g-empty", name: "Vacío", tags: [] },
];
const lists: ListViewList[] = [
  { id: "l1", title: "Por hacer", cards: [
    { id: "c1", title: "[A-10] Rotulado", tags: [tag("INI-2"), tag("Ana")], dueAt: "2026-12-05T00:00:00Z", commentsCount: 2, assignees: [{ id: "u1", name: "Zoe" }] },
    { id: "c2", title: "[A-2] Migración", tags: [tag("ini-1")], dueAt: null, commentsCount: 0 },
  ] },
  { id: "l2", title: "En curso", cards: [
    { id: "c3", title: "[A-3] Cámara fría", tags: [tag("Luis"), tag("Otra")], dueAt: "2026-11-30T00:00:00Z", commentsCount: 5, assignees: [{ id: "u2", name: "Ada" }] },
  ] },
  { id: "l3", title: "Hecho", cards: [] },
];

test("columns: only tag groups used by some card, in group order, ignoring empty groups", () => {
  const cols = deriveTagGroupColumns(lists, groups);
  assert.deepEqual(cols.map((c) => c.id), ["tagGroup:g-init", "tagGroup:g-resp"]);
  assert.equal(cols[0].name, "Iniciativa");
  assert.deepEqual(deriveTagGroupColumns([], groups), []);
  assert.deepEqual(deriveTagGroupColumns(lists, []), []);
});

test("rows carry the tags of each group (case-insensitive) and board position", () => {
  const rows = buildRows(lists, groups);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].tagsByGroup, { "g-init": ["INI-2"], "g-resp": ["Ana"] });
  assert.deepEqual(rows[1].tagsByGroup, { "g-init": ["ini-1"] });
  assert.deepEqual(rows[2].tagsByGroup, { "g-resp": ["Luis"] }, "tags outside any group are not in a column");
  assert.equal(rows[2].listIndex, 1);
});

test("search matches title, state, tags and assignees, accent and case insensitive, all words", () => {
  const rows = buildRows(lists, groups);
  assert.deepEqual(filterRowsByText(rows, "camara").map((r) => r.id), ["c3"]);
  assert.deepEqual(filterRowsByText(rows, "POR HACER").map((r) => r.id), ["c1", "c2"]);
  assert.deepEqual(filterRowsByText(rows, "ana rotulado").map((r) => r.id), ["c1"]);
  assert.deepEqual(filterRowsByText(rows, "zoe").map((r) => r.id), ["c1"]);
  assert.equal(filterRowsByText(rows, "  ").length, 3);
  assert.equal(filterRowsByText(rows, "nope").length, 0);
});

test("sorting: header cycle, natural title order, empty values last, tag group rank, state order", () => {
  assert.deepEqual(nextSort(null, "title"), { key: "title", dir: "asc" });
  assert.deepEqual(nextSort({ key: "title", dir: "asc" }, "title"), { key: "title", dir: "desc" });
  assert.equal(nextSort({ key: "title", dir: "desc" }, "title"), null);
  assert.deepEqual(nextSort({ key: "title", dir: "desc" }, "due"), { key: "due", dir: "asc" });

  const rows = buildRows(lists, groups);
  const ids = (s: Parameters<typeof sortRows>[1]) => sortRows(rows, s, { tagGroups: groups, users: [{ id: "u1", name: "Zoe" }, { id: "u2", name: "Ada" }] as any }).map((r) => r.id);
  assert.deepEqual(ids(null), ["c1", "c2", "c3"]);
  assert.deepEqual(ids({ key: "title", dir: "asc" }), ["c2", "c3", "c1"], "[A-2] < [A-3] < [A-10]");
  assert.deepEqual(ids({ key: "due", dir: "asc" }), ["c3", "c1", "c2"], "no due date goes last");
  assert.deepEqual(ids({ key: "due", dir: "desc" }), ["c1", "c3", "c2"], "no due date goes last also descending");
  assert.deepEqual(ids({ key: "comments", dir: "desc" }), ["c3", "c1", "c2"]);
  assert.deepEqual(ids({ key: "tagGroup:g-init", dir: "asc" }), ["c2", "c1", "c3"], "INI-1 < INI-2, none last");
  assert.deepEqual(ids({ key: "list", dir: "desc" }), ["c3", "c1", "c2"]);
  assert.deepEqual(ids({ key: "assignees", dir: "asc" }), ["c3", "c1", "c2"], "Ada < Zoe, none last");
  assert.deepEqual(rows.map((r) => r.id), ["c1", "c2", "c3"], "input is not mutated");
});

test("grouping by state keeps every list (also empty) in board order; flat mode is one group", () => {
  const rows = buildRows(lists, groups);
  const grouped = groupRows(rows, lists, true);
  assert.deepEqual(grouped.map((g) => [g.id, g.rows.length]), [["l1", 2], ["l2", 1], ["l3", 0]]);
  const sorted = groupRows(sortRows(rows, { key: "title", dir: "asc" }), lists, true);
  assert.deepEqual(sorted[0].rows.map((r) => r.id), ["c2", "c1"], "sort applies inside each group");
  const flat = groupRows(rows, lists, false);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].listId, null);
  assert.equal(flat[0].rows.length, 3);
});

test("flattened items: headers, rows, add rows; collapsed groups hide rows but keep the header", () => {
  const grouped = groupRows(buildRows(lists, groups), lists, true);
  const kinds = (items: ReturnType<typeof flattenItems>) => items.map((i) => i.kind).join(",");
  assert.equal(kinds(flattenItems(grouped, new Set(), { canAdd: true })), "group,row,row,add,group,row,add,group,add");
  assert.equal(kinds(flattenItems(grouped, new Set(["l1"]), { canAdd: true })), "group,group,row,add,group,add");
  assert.equal(kinds(flattenItems(grouped, new Set(), { canAdd: false })), "group,row,row,group,row,group");
  const flat = groupRows(buildRows(lists, groups), lists, false);
  assert.equal(kinds(flattenItems(flat, new Set(["__all__"]), { canAdd: true })), "row,row,row", "no header and no add row when not grouped");
});

test("windowing renders only the visible slice with overscan", () => {
  assert.deepEqual(visibleRange(0, 0, 600, 40), { start: 0, end: 0 });
  assert.deepEqual(visibleRange(250, 0, 600, 40, 5), { start: 0, end: 20 });
  assert.deepEqual(visibleRange(250, 4000, 600, 40, 5), { start: 95, end: 120 });
  assert.equal(visibleRange(250, 99999, 600, 40, 5).end, 250);
  const { start, end } = visibleRange(250, 2000, 600, 40);
  assert.ok(end - start < 40, "never close to the 250 items");
});

test("column visibility: hidden ids are removed, new groups show up by default", () => {
  const cols = deriveTagGroupColumns(lists, groups);
  assert.deepEqual(visibleColumnIds(cols, undefined), ["state", "tagGroup:g-init", "tagGroup:g-resp", "assignees", "due", "comments"]);
  assert.deepEqual(visibleColumnIds(cols, ["tagGroup:g-resp", "due", "gone"]), ["state", "tagGroup:g-init", "assignees", "comments"]);
  assert.deepEqual(toggleHiddenColumn(undefined, "due"), ["due"]);
  assert.deepEqual(toggleHiddenColumn(["due", "state"], "due"), ["state"]);
});
