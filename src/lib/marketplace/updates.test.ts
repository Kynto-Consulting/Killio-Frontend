import assert from "node:assert/strict";
import test from "node:test";

import { countResults, groupPlan, hasWork, installStatus, overwritePayload, placeholderPayload, reportableResults, sectionOf, versionLabel, type PlanItemLike } from "./updates.ts";

const item = (logicalKey: string, decision: PlanItemLike["decision"], over: Partial<PlanItemLike> = {}): PlanItemLike => ({ logicalKey, assetType: "role", name: logicalKey, decision, overwritable: decision === "conflict", fields: [], ...over });

test("every decision lands in the section the person expects, noop in none", () => {
  assert.equal(sectionOf({ decision: "conflict" }), "conflicts");
  assert.equal(sectionOf({ decision: "apply" }), "updated");
  assert.equal(sectionOf({ decision: "add" }), "added");
  assert.equal(sectionOf({ decision: "keep_content" }), "keptContent");
  assert.equal(sectionOf({ decision: "keep_removed" }), "removed");
  assert.equal(sectionOf({ decision: "skip_missing" }), "skipped");
  assert.equal(sectionOf({ decision: "skip_locked" }), "skipped");
  assert.equal(sectionOf({ decision: "noop" }), null);
});

test("groupPlan orders sections by what needs a decision and sorts inside them", () => {
  const groups = groupPlan([
    item("z", "add", { assetType: "document", name: "Zeta" }),
    item("a", "conflict", { assetType: "room", name: "Alpha" }),
    item("b", "conflict", { assetType: "bot", name: "Beta" }),
    item("c", "noop"),
    item("d", "keep_removed"),
    item("e", "apply"),
  ]);
  assert.deepEqual(groups.map((g) => g.section), ["conflicts", "updated", "added", "removed"]);
  assert.deepEqual(groups[0].items.map((i) => i.logicalKey), ["b", "a"], "bot before room: sorted by asset type");
});

test("overwrite only ever sends ticked conflicts", () => {
  const items = [item("c1", "conflict"), item("c2", "conflict"), item("u", "apply"), item("d", "keep_content", { overwritable: false })];
  assert.deepEqual(overwritePayload(new Set(["c1", "u", "d", "ghost"]), items), ["c1"]);
  assert.deepEqual(overwritePayload(new Set(), items), []);
  const notOverwritable = [item("locked", "conflict", { overwritable: false })];
  assert.deepEqual(overwritePayload(new Set(["locked"]), notOverwritable), []);
});

test("version label: a new version, or a revision of the same one", () => {
  assert.deepEqual(versionLabel("v1", "v2"), { from: "v1", to: "v2", revision: false });
  assert.deepEqual(versionLabel("2.0.0", "2.0.0"), { from: "2.0.0", to: "2.0.0", revision: true });
  assert.deepEqual(versionLabel("v1", null), { from: "v1", to: "v1", revision: true });
});

test("results are counted and reported with problems first, unchanged hidden", () => {
  const results = [
    { logicalKey: "a", assetType: "role", name: "A", status: "updated" as const },
    { logicalKey: "b", assetType: "role", name: "B", status: "unchanged" as const },
    { logicalKey: "c", assetType: "bot", name: "C", status: "error" as const },
    { logicalKey: "d", assetType: "room", name: "D", status: "conflict" as const },
    { logicalKey: "e", assetType: "document", name: "E", status: "added" as const },
  ];
  assert.deepEqual(countResults(results), { added: 1, updated: 1, kept: 0, skipped: 0, conflict: 1, error: 1, unchanged: 1 });
  assert.deepEqual(reportableResults(results).map((r) => r.logicalKey), ["c", "d", "a", "e"]);
});

test("a plan with only conflicts has nothing to apply until something is overwritten", () => {
  assert.equal(hasWork({ added: 0, updated: 0 }, 0), false);
  assert.equal(hasWork({ added: 0, updated: 0 }, 1), true);
  assert.equal(hasWork({ added: 2, updated: 0 }, 0), true);
  assert.equal(hasWork({ added: 0, updated: 1 }, 0), true);
});

test("install status badge", () => {
  assert.equal(installStatus({ updateAvailable: true, reason: null, pending: { conflicts: 0 } }), "update");
  assert.equal(installStatus({ updateAvailable: null, reason: "hub_check_required", pending: null }), "check");
  assert.equal(installStatus({ updateAvailable: false, reason: "pack_unavailable", pending: null }), "unavailable");
  assert.equal(installStatus({ updateAvailable: false, reason: null, pending: { conflicts: 2 } }), "conflicts");
  assert.equal(installStatus({ updateAvailable: false, reason: null, pending: { conflicts: 0 } }), "upToDate");
});

test("placeholder payload skips empty values", () => {
  assert.deepEqual(placeholderPayload({ a: "x", b: "  ", c: "" }), { a: "x" });
});
