import assert from "node:assert/strict";
import test from "node:test";

import { qualifyTagName, splitGroupedName, suggestGroups, suggestTagColors } from "./tag-suggest.ts";

const groups = [{ id: "g1", name: "Fuente", tags: ["Fuente: Aquiles", "Fuente: Calidad"] }, { id: "g2", name: "Área", tags: ["Área: Digital"] }];
const tags = [
  { name: "Fuente: Aquiles", color: "#3b82f6" },
  { name: "Fuente: Calidad", color: "#3b82f6" },
  { name: "Área: Digital", color: "#f59e0b" },
];

test("splits and qualifies names", () => {
    assert.deepEqual(splitGroupedName("Fuente: X"), { group: "Fuente", value: "X" });
    assert.deepEqual(splitGroupedName("X"), { group: null, value: "X" });
    assert.equal(qualifyTagName("Fuente", "Comercial"), "Fuente: Comercial");
    assert.equal(qualifyTagName("Fuente", "fuente: Comercial"), "Fuente: Comercial");
    assert.equal(qualifyTagName(null, " Solo "), "Solo");
});
test("suggests the colour its group already uses first", () => {
    const s = suggestTagColors("Fuente: Comercial", tags, groups);
    assert.deepEqual(s[0], { color: "#3b82f6", reason: "group" });
});
test("falls back to keywords", () => {
    const s = suggestTagColors("Urgente", [], []);
    assert.deepEqual(s[0], { color: "#ef4444", reason: "keyword" });
});
test("uses similar names", () => {
    assert.equal(suggestTagColors("Digital", tags, groups)[0].reason, "similar");
});
test("ranks groups by prefix then similarity", () => {
    assert.equal(suggestGroups("Fuente: Nuevo", groups)[0].reason, "prefix");
    assert.equal(suggestGroups("Calidad", groups)[0].group.id, "g1");
    assert.deepEqual(suggestGroups("zzz", groups), []);
});
