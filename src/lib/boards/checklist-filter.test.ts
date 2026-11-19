import assert from "node:assert/strict";
import test from "node:test";

import { applyBoardFilters } from "./apply-filters.ts";
import { buildExpression, parseQuickFromExpression } from "./quick-filters.ts";

const card = (id: string, items: Array<boolean>) => ({
  id,
  title: `Card ${id}`,
  blocks: items.length ? [{ kind: "checklist", items: items.map((checked, i) => ({ id: `i${i}`, label: `t${i}`, checked })) }] : [],
});
const lists = [{ id: "l1", title: "Hacer", cards: [card("done", [true, true]), card("half", [true, false]), card("none", []), card("zero", [false, false])] }];
const ctx = { me: "u1", now: new Date("2026-11-19T12:00:00Z") } as never;
const shown = (expression: string) => applyBoardFilters(lists as never, { expression, ctx }).lists[0].cards.map((c: any) => c.id);

test("checklist quick filters write plain KQL and are recovered from it", () => {
  for (const [value, expr] of [["complete", "checklist_progress = 100"], ["pending", "checklist_progress < 100"], ["none", "checklist_total = 0"]] as const) {
    assert.equal(buildExpression({ checklist: value }), expr);
    assert.deepEqual(parseQuickFromExpression(expr), { checklist: value });
  }
  assert.equal(buildExpression({ overdue: true, checklist: "complete" }), "overdue and checklist_progress = 100");
  assert.deepEqual(parseQuickFromExpression("overdue and checklist_progress = 100"), { overdue: true, checklist: "complete" });
});

test("the filters select the right cards", () => {
  assert.deepEqual(shown("checklist_progress = 100"), ["done"]);
  assert.deepEqual(shown("checklist_progress < 100"), ["half", "zero"], "a card without checklist has no progress, so it is not 'pending'");
  assert.deepEqual(shown("checklist_total = 0"), ["none"]);
});
