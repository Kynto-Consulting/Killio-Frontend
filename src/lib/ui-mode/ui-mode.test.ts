import assert from "node:assert/strict";
import test from "node:test";

import { isPaletteCommandVisible, isPathVisibleInMode, pickActiveTab, resolveUiMode, visibleTabs } from "./ui-mode.ts";
import { applyAnswer, buildDemoPlan, clampStep, demoDeleteOrder, hasDemo, isDemoName, isStepAnswered, shouldAutoOpen, STEPS, suggestMode, EMPTY_ONBOARDING } from "./onboarding.ts";

test("resolveUiMode: user > team > full", () => {
  assert.deepEqual(resolveUiMode("reduced", "full"), { mode: "reduced", source: "user" });
  assert.deepEqual(resolveUiMode(null, "reduced"), { mode: "reduced", source: "team" });
  assert.deepEqual(resolveUiMode(undefined, undefined), { mode: "full", source: "default" });
});

test("paths: reduced hides advanced areas and their children, keeps the essentials; full shows all", () => {
  for (const p of ["/m", "/m/abc", "/graph", "/rooms/vault", "/integrations/env", "/scripts", "/metrics", "/marketplace/profile", "/history"]) {
    assert.equal(isPathVisibleInMode(p, "reduced"), false, p);
    assert.equal(isPathVisibleInMode(p, "full"), true, p);
  }
  for (const p of ["/", "/b", "/b/1", "/d/2", "/teams", "/pricing", "/members"]) assert.equal(isPathVisibleInMode(p, "reduced"), true, p);
  // "/m" must not swallow "/marketplace-like" or "/members" prefixes by accident
  assert.equal(isPathVisibleInMode("/mx", "reduced"), true);
});

test("tabs: reduced hides gantt/summary/projects without losing them; active falls back to kanban", () => {
  const tabs = [{ id: "kanban", type: "kanban" }, { id: "gantt", type: "gantt" }, { id: "v1", type: "list" }, { id: "v2", type: "summary" }];
  assert.deepEqual(visibleTabs(tabs, "reduced").map((t) => t.id), ["kanban", "v1"]);
  assert.equal(visibleTabs(tabs, "full").length, 4);
  assert.equal(pickActiveTab(tabs, "v2", "reduced").id, "kanban");
  assert.equal(pickActiveTab(tabs, "v1", "reduced").id, "v1");
  assert.equal(pickActiveTab(tabs, "v2", "full").id, "v2");
});

test("palette: history and transactions are hidden in reduced mode", () => {
  assert.equal(isPaletteCommandVisible("global.history", "reduced"), false);
  assert.equal(isPaletteCommandVisible("tx.begin", "reduced"), false);
  assert.equal(isPaletteCommandVisible("board.open", "reduced"), true);
  assert.equal(isPaletteCommandVisible("global.history", "full"), true);
});

test("wizard: answers validate, goals toggle with a cap of 3, steps clamp", () => {
  let a = applyAnswer({}, "role", "manager");
  a = applyAnswer(a, "role", "hacker");
  assert.equal(a.role, "manager");
  for (const g of ["tasks", "docs", "team", "ai"]) a = applyAnswer(a, "goals", g);
  assert.deepEqual(a.goals, ["tasks", "docs", "team"]);
  a = applyAnswer(a, "goals", "docs");
  assert.deepEqual(a.goals, ["tasks", "team"]);
  assert.equal(clampStep(-4), 0);
  assert.equal(clampStep(99), STEPS.length - 1);
  assert.equal(isStepAnswered("goals", {}), false);
  assert.equal(isStepAnswered("welcome", {}), true);
});

test("suggestMode", () => {
  assert.equal(suggestMode({}), null);
  assert.equal(suggestMode({ goals: ["tasks", "docs"], teamSize: "solo" }), "reduced");
  assert.equal(suggestMode({ goals: ["tasks", "ai"], teamSize: "solo" }), "full");
  assert.equal(suggestMode({ goals: ["tasks"], teamSize: "21+" }), "full");
});

test("auto-open only for flagged new accounts or a started wizard", () => {
  assert.equal(shouldAutoOpen(EMPTY_ONBOARDING, false), false);
  assert.equal(shouldAutoOpen(EMPTY_ONBOARDING, true), true);
  assert.equal(shouldAutoOpen({ ...EMPTY_ONBOARDING, step: 2 }, false), true);
  assert.equal(shouldAutoOpen({ ...EMPTY_ONBOARDING, status: "skipped", step: 2 }, true), false);
});

test("demo plan is marked, and deletion order puts templates first", () => {
  const plan = buildDemoPlan({ board: "Mi tablero", lists: [{ name: "Por hacer", cards: [{ title: "A" }] }], document: "Guía", paragraphs: ["x"], template: { name: "Tarea", description: "d" } });
  assert.equal(isDemoName(plan.boardName), true);
  assert.equal(isDemoName(plan.documentTitle), true);
  assert.equal(isDemoName(plan.template.name), true);
  assert.equal(buildDemoPlan({ ...{ board: "[Demo] X", lists: [], document: "d", paragraphs: [], template: { name: "t", description: "" } } }).boardName, "[Demo] X");
  const order = demoDeleteOrder([{ type: "board", id: "b" }, { type: "template", id: "t", boardId: "b" }, { type: "document", id: "d" }]);
  assert.deepEqual(order.map((e) => e.type), ["template", "document", "board"]);
  const st = { ...EMPTY_ONBOARDING, demo: { teamId: "t1", createdAt: "", entities: [{ type: "board" as const, id: "b" }] } };
  assert.equal(hasDemo(st, "t1"), true);
  assert.equal(hasDemo(st, "t2"), false);
  assert.equal(hasDemo(EMPTY_ONBOARDING), false);
});
