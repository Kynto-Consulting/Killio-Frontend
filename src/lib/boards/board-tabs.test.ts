import assert from "node:assert/strict";
import test from "node:test";

import { ADDABLE_TAB_TYPES, EXPERIMENTAL_TAB_TYPES, activeTabKey, boardTabsKey, boardTabsReducer, createBoardTabsStore, defaultTabs, MAX_TABS, normalizeTabs, resolveActiveTab, tabDisplayName, uniqueTabName } from "./board-tabs.ts";
import type { BoardTab } from "./board-tabs.ts";

const labels = { kanban: "Kanban", gantt: "Gantt", list: "Lista", calendar: "Calendario" };
const memory = () => {
  const m = new Map<string, string>();
  return { map: m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const ids = (tabs: BoardTab[]) => tabs.map((t) => t.id);

test("settings without `views` (or garbage) load as the default tabs: Kanban, Gantt and a Lista", () => {
  for (const raw of [undefined, null, {}, { sort: [] }, "x", 5, { views: "no" }]) {
    assert.deepEqual(ids(normalizeTabs(raw)), ["kanban", "gantt", "list"]);
  }
});

test("built-ins are always present, first and unique; extras are sanitized", () => {
  const tabs = normalizeTabs({ views: [
    { id: "x1", type: "list", name: "  Mi   lista ", config: { hiddenColumns: ["due", "due", 4], groupByState: false, sort: { key: "title", dir: "desc" } } },
    { id: "kanban", type: "list", name: "hack" },
    { id: "x1", type: "list", name: "dup" },
    { id: "x2", type: "table", name: "bad type" },
    { id: "", type: "list" },
    { id: "x3", type: "gantt", name: "" },
  ] });
  assert.deepEqual(ids(tabs), ["kanban", "gantt", "x1", "x3"]);
  assert.equal(tabs[0].type, "kanban");
  assert.deepEqual(tabs[2], { id: "x1", type: "list", name: "Mi lista", config: { hiddenColumns: ["due"], groupByState: false, sort: { key: "title", dir: "desc" } } });
  assert.deepEqual(ids(normalizeTabs([{ id: "a", type: "list", name: "A" }])), ["kanban", "gantt", "a"], "deleting Lista is remembered, built-ins come back");
  const many = normalizeTabs({ views: Array.from({ length: 50 }, (_, i) => ({ id: `v${i}`, type: "list", name: `V${i}` })) });
  assert.equal(many.length, MAX_TABS);
});

test("reducer: add, rename, delete; built-ins cannot be renamed or deleted", () => {
  let tabs = defaultTabs();
  tabs = boardTabsReducer(tabs, { type: "add", id: "n1", tabType: "list", name: "Lista 2" });
  tabs = boardTabsReducer(tabs, { type: "add", id: "n1", tabType: "list", name: "again" });
  assert.deepEqual(ids(tabs), ["kanban", "gantt", "list", "n1"], "duplicate id ignored");
  tabs = boardTabsReducer(tabs, { type: "rename", id: "n1", name: "  Seguimiento  " });
  assert.equal(tabs[3].name, "Seguimiento");
  assert.equal(boardTabsReducer(tabs, { type: "rename", id: "n1", name: "   " }), tabs, "empty name ignored");
  assert.equal(boardTabsReducer(tabs, { type: "rename", id: "kanban", name: "X" }), tabs);
  assert.equal(boardTabsReducer(tabs, { type: "remove", id: "gantt" }), tabs);
  assert.equal(boardTabsReducer(tabs, { type: "remove", id: "kanban" }), tabs);
  tabs = boardTabsReducer(tabs, { type: "remove", id: "list" });
  assert.deepEqual(ids(tabs), ["kanban", "gantt", "n1"]);
  assert.equal(boardTabsReducer(tabs, { type: "remove", id: "nope" }), tabs);
  const full = Array.from({ length: MAX_TABS }, (_, i) => ({ id: `t${i}`, type: "list", name: "" }) as BoardTab);
  assert.equal(boardTabsReducer(full, { type: "add", id: "extra", tabType: "list", name: "x" }), full);
});

test("reducer: list config patches merge, defaults are not stored, other types ignore config", () => {
  let tabs = defaultTabs();
  tabs = boardTabsReducer(tabs, { type: "config", id: "list", patch: { groupByState: false } });
  tabs = boardTabsReducer(tabs, { type: "config", id: "list", patch: { hiddenColumns: ["due"], sort: { key: "due", dir: "asc" } } });
  assert.deepEqual(tabs[2].config, { groupByState: false, hiddenColumns: ["due"], sort: { key: "due", dir: "asc" } });
  tabs = boardTabsReducer(tabs, { type: "config", id: "list", patch: { sort: null } });
  assert.equal(tabs[2].config?.sort, undefined);
  tabs = boardTabsReducer(tabs, { type: "config", id: "list", patch: { groupByState: true, hiddenColumns: [] } });
  assert.equal(tabs[2].config, undefined, "all defaults -> no config stored");
  assert.equal(boardTabsReducer(tabs, { type: "config", id: "gantt", patch: { groupByState: false } }), tabs);
});

test("names: default per type, unique with a counter", () => {
  const tabs = boardTabsReducer(defaultTabs(), { type: "add", id: "a", tabType: "list", name: "Mi vista" });
  assert.equal(tabDisplayName(tabs[0], labels), "Kanban");
  assert.equal(tabDisplayName(tabs[2], labels), "Lista");
  assert.equal(uniqueTabName("Lista", tabs, labels), "Lista 2");
  assert.equal(uniqueTabName("lista", tabs, labels), "lista 2");
  assert.equal(uniqueTabName("Otra", tabs, labels), "Otra");
  assert.equal(uniqueTabName("Mi vista", tabs, labels, "a"), "Mi vista", "a tab does not clash with itself");
  assert.equal(uniqueTabName("Kanban", tabs, labels), "Kanban 2");
});

test("the active tab falls back to Kanban when it was deleted", () => {
  const tabs = defaultTabs();
  assert.equal(resolveActiveTab(tabs, "list").id, "list");
  assert.equal(resolveActiveTab(tabs, "gone").id, "kanban");
  assert.equal(resolveActiveTab(tabs, null).id, "kanban");
});

test("store: round trip per board, survives broken JSON and missing storage", () => {
  const mem = memory();
  const store = createBoardTabsStore(mem);
  assert.deepEqual(ids(store.load("b1").tabs), ["kanban", "gantt", "list"]);
  const tabs = boardTabsReducer(defaultTabs(), { type: "add", id: "n1", tabType: "gantt", name: "Plan" });
  store.saveTabs("b1", tabs);
  store.saveActive("b1", "n1");
  const back = store.load("b1");
  assert.deepEqual(back.tabs, tabs);
  assert.equal(back.activeId, "n1");
  assert.deepEqual(ids(store.load("b2").tabs), ["kanban", "gantt", "list"], "per board");
  assert.equal(JSON.parse(mem.map.get(boardTabsKey("b1"))!).views.length, 4);
  mem.map.set(boardTabsKey("b1"), "{not json");
  assert.deepEqual(ids(store.load("b1").tabs), ["kanban", "gantt", "list"]);
  assert.equal(mem.map.get(activeTabKey("b1")), "n1");
  const none = createBoardTabsStore(null);
  none.saveTabs("b", tabs);
  assert.equal(none.load("b").tabs.length, 3);
  const throwing = createBoardTabsStore({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => {} });
  assert.doesNotThrow(() => throwing.saveTabs("b", tabs));
  assert.equal(throwing.load("b").tabs.length, 3);
});

test("the + menu offers lists and the experimental calendar only; the calendar never comes by default", () => {
  assert.deepEqual([...ADDABLE_TAB_TYPES], ["list", "calendar"]);
  assert.deepEqual([...EXPERIMENTAL_TAB_TYPES], ["calendar"]);
  assert.ok(!defaultTabs().some((x) => x.type === "calendar"));
  const added = boardTabsReducer(defaultTabs(), { type: "add", id: "view_1", tabType: "calendar", name: "Calendario" });
  assert.equal(added.at(-1)?.type, "calendar");
  assert.equal(normalizeTabs(added).at(-1)?.type, "calendar");
});
