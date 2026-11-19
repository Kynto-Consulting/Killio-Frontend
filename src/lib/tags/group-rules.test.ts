import assert from "node:assert/strict";
import test from "node:test";

import { addTagWithRules, groupLimit, groupsOverLimit, normalizeRule, type RuleGroup, type RuleTag } from "./group-rules.ts";

const tags: RuleTag[] = [
  { id: "a", name: "Tipo: Bug" },
  { id: "b", name: "Tipo: Mejora" },
  { id: "c", name: "Equipo: A" },
  { id: "d", name: "Equipo: B" },
  { id: "e", name: "Equipo: C" },
  { id: "f", name: "Area: X" },
  { id: "g", name: "Suelta" },
];
const groups: RuleGroup[] = [
  { id: "1", name: "Tipo", tags: ["Tipo: Bug", "Tipo: Mejora"], mode: "single" },
  { id: "2", name: "Equipo", tags: ["Equipo: A", "Equipo: B", "Equipo: C"], mode: "limited", maxTags: 2 },
  { id: "3", name: "Area", tags: ["Area: X"] },
];

test("groupLimit: single is 1, limited its number, multi none", () => {
  assert.equal(groupLimit({ mode: "single" }), 1);
  assert.equal(groupLimit({ mode: "limited", maxTags: 4 }), 4);
  assert.equal(groupLimit({ mode: "limited", maxTags: null }), 3);
  assert.equal(groupLimit({ mode: "multi" }), null);
  assert.equal(groupLimit({}), null);
});

test("single group: a new tag replaces the one chosen from that group", () => {
  const r = addTagWithRules(["a", "g"], tags[1], tags, groups);
  assert.deepEqual(r, { ok: true, ids: ["g", "b"], replaced: ["a"] });
});

test("limited group: allowed up to the limit, then refused without changes", () => {
  const one = addTagWithRules([], tags[2], tags, groups);
  assert.ok(one.ok);
  const two = addTagWithRules(one.ids, tags[3], tags, groups);
  assert.ok(two.ok);
  const three = addTagWithRules(two.ids, tags[4], tags, groups);
  assert.deepEqual(three, { ok: false, ids: ["c", "d"], group: "Equipo", limit: 2 });
});

test("multi groups, tags without group and repeated adds never block", () => {
  assert.deepEqual(addTagWithRules(["f"], tags[6], tags, groups), { ok: true, ids: ["f", "g"], replaced: [] });
  assert.deepEqual(addTagWithRules(["a"], tags[0], tags, groups), { ok: true, ids: ["a"], replaced: [] });
});

test("names match case-insensitively and ignoring surrounding spaces", () => {
  const r = addTagWithRules(["a"], { id: "z", name: "  tipo: MEJORA " }, [...tags, { id: "z", name: "  tipo: MEJORA " }], groups);
  assert.deepEqual(r, { ok: true, ids: ["z"], replaced: ["a"] });
});

test("a tag in a single and a full limited group is refused before anything is replaced", () => {
  const g: RuleGroup[] = [
    { id: "1", name: "S", tags: ["Tipo: Bug", "Tipo: Mejora"], mode: "single" },
    { id: "2", name: "L", tags: ["Tipo: Mejora", "Equipo: A"], mode: "limited", maxTags: 1 },
  ];
  const r = addTagWithRules(["a", "c"], tags[1], tags, g);
  assert.equal(r.ok, false);
});

test("groupsOverLimit reports groups already above their limit", () => {
  assert.deepEqual(groupsOverLimit(["a", "b"], tags, groups), [{ group: "Tipo", count: 2, limit: 1 }]);
  assert.deepEqual(groupsOverLimit(["a", "c"], tags, groups), []);
});

test("normalizeRule keeps a limit only for limited groups", () => {
  assert.deepEqual(normalizeRule("single", 5), { mode: "single", maxTags: null });
  assert.deepEqual(normalizeRule("limited", 99), { mode: "limited", maxTags: 50 });
  assert.deepEqual(normalizeRule("limited", "x"), { mode: "limited", maxTags: 3 });
  assert.deepEqual(normalizeRule(undefined, 2), { mode: "multi", maxTags: null });
});
