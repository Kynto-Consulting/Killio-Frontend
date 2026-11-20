import assert from "node:assert/strict";
import test from "node:test";

import { searchByName, searchCards } from "./page-search.ts";

const lists = [
  { id: "l1", name: "Pendiente", cards: [{ id: "c1", title: "Ocultar biológicos", tags: [{ name: "P0" }] }, { id: "c2", title: "Migración de BD" }] },
  { id: "l2", name: "En proceso", cards: [{ id: "c3", title: "Revisar migracion", tags: [{ name: "Tipo: Desarrollo" }] }] },
];

test("matches title ignoring accents and case, title hits first", () => {
  const r = searchCards(lists, "MIGRACION");
  assert.deepEqual(r.map((x) => x.id), ["c2", "c3"]);
  assert.equal(r[0].listName, "Pendiente");
});
test("matches list and tag names; every word must match", () => {
  assert.deepEqual(searchCards(lists, "proceso").map((x) => x.id), ["c3"]);
  assert.deepEqual(searchCards(lists, "p0").map((x) => x.id), ["c1"]);
  assert.deepEqual(searchCards(lists, "migracion p0"), []);
  assert.deepEqual(searchCards(lists, "  "), []);
});
test("limits and searches boards by name", () => {
  assert.equal(searchCards(lists, "e", 1).length, 1);
  assert.deepEqual(searchByName([{ name: "Backlog Tecnología" }, { name: "Ventas" }], "tecnologia"), [{ name: "Backlog Tecnología" }]);
});
