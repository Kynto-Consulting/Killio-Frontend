import assert from "node:assert/strict";
import test from "node:test";

import { buildProjects, collapsibleKeys } from "./projects-view.ts";

const today = new Date(2026, 10, 19, 12, 0, 0);
const at = (offset: number) => new Date(2026, 10, 19 + offset, 9, 30).toISOString();
const tag = (name: string) => ({ name });
const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Card ${id}`, ...extra });
const lists = (...l: Array<[string, any[]]>) => l.map(([title, cards], i) => ({ id: `l${i}`, title, cards }));

test("buildProjects: area > project > phase tree with counts and ordering", () => {
  const ti = tag("Área: TI");
  const ft = tag("Proyecto: Fast Track");
  const web = tag("Proyecto: Web");
  const f1 = tag("Fase: Fase 1");
  const f10 = tag("Fase: Fase 10");
  const f2 = tag("Fase: Fase 2");
  const ls = lists(
    ["Pendiente", [
      card("a", { tags: [ti, ft, f10], dueAt: at(5) }),
      card("b", { tags: [ti, ft, f2], dueAt: at(9) }),
      card("c", { tags: [ti, ft, f2], dueAt: at(1) }),
      card("d", { tags: [ti, ft, f2] }),
      card("w", { tags: [ti, web], dueAt: at(-3) }),
    ]],
    ["Realizado", [card("e", { tags: [ti, ft, f1], dueAt: at(-8) }), card("f", { tags: [ti, ft, f1] })]],
  );
  const r = buildProjects(ls, [], { today });
  assert.equal(r.areas.length, 1);
  const area = r.areas[0];
  assert.deepEqual([area.name, area.total, area.done], ["TI", 7, 2]);
  assert.deepEqual(area.projects.map((p) => p.name), ["Web", "Fast Track"], "projects by earliest open due date");
  const ft2 = area.projects[1];
  assert.deepEqual([ft2.total, ft2.done, ft2.progress, ft2.active], [6, 2, 33, true]);
  assert.deepEqual(ft2.phases.map((p) => p.name), ["Fase 1", "Fase 2", "Fase 10"], "natural phase order");
  const [p1, p2] = ft2.phases;
  assert.equal(p1.allDone, true);
  assert.equal(p2.allDone, false);
  assert.deepEqual(p2.tasks.map((t) => t.id), ["c", "b", "d"], "tasks by due date, undated last");
  assert.deepEqual(p2.tasks[0].daysToDue, 1);
  assert.deepEqual(area.projects[0].phases.map((p) => [p.kind, p.total]), [["none", 1]]);
});

test("buildProjects: cards without project, project all done, no area, empty board", () => {
  const ls = lists(["Realizado", [card("1", { tags: [tag("Proyecto: X")] })]], ["Pendiente", [card("2")]]);
  const r = buildProjects(ls, [], { today });
  assert.equal(r.areas[0].kind, "all");
  assert.deepEqual(r.areas[0].projects.map((p) => [p.kind, p.name, p.active]), [["project", "X", false], ["none", "", true]]);
  const e = buildProjects([], [], { today });
  assert.equal(e.areas[0].projects.length, 0);
  assert.deepEqual(collapsibleKeys(e.areas), []);
  assert.deepEqual(collapsibleKeys(r.areas), ["__all__/X", "__all__/X/__none__", "__all__/__none__", "__all__/__none__/__none__"]);
});

test("buildProjects: configured group names and owner filter", () => {
  const ls = lists(["Pendiente", [
    card("1", { tags: [tag("Cliente: A"), tag("Iniciativa: I1"), tag("Etapa: E1")], assignees: [{ id: "u1", name: "Ana" }] }),
    card("2", { tags: [tag("Cliente: A"), tag("Iniciativa: I2"), tag("Etapa: E1")], assignees: [{ id: "u2", name: "Bob" }] }),
  ]]);
  const r = buildProjects(ls, [], { today, areaGroup: "Cliente", projectGroup: "Iniciativa", phaseGroup: "Etapa", ownerKey: "u2" });
  assert.deepEqual(r.areas.map((a) => a.name), ["A"]);
  assert.deepEqual(r.areas[0].projects.map((p) => [p.name, p.phases[0].name, p.total]), [["I2", "E1", 1]]);
  assert.equal(r.owners.length, 2);
});
