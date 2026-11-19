import assert from "node:assert/strict";
import test from "node:test";

import { buildItems, groupNameOptions, parseDescription, parseDue, relativeDueLabel, shortDate, statusKind, DEFAULT_PATTERNS, groupValues } from "./backlog-common.ts";
import { buildSummary } from "./summary-view.ts";

// Local noon of 2026-11-19 (a Thursday). dueAt values are built from local dates so the test is timezone independent.
const today = new Date(2026, 10, 19, 12, 0, 0);
const at = (offset: number) => new Date(2026, 10, 19 + offset, 9, 30).toISOString();
const tag = (name: string) => ({ name });
const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Card ${id}`, ...extra });
const lists = (...l: Array<[string, any[]]>) => l.map(([title, cards], i) => ({ id: `l${i}`, title, cards }));

test("parseDescription: tolerant reschedule count and original date", () => {
  assert.deepEqual(parseDescription("Reprogramada: 3 veces\nFecha original: 2026-09-18"), { reschedules: 3, originalDate: "2026-09-18" });
  assert.deepEqual(parseDescription("intro\n**Reprogramada:** 12 veces\n**Fecha original:** 5/9/2026"), { reschedules: 12, originalDate: "2026-09-05" });
  assert.deepEqual(parseDescription("reprogramada 1 vez - FECHA ORIGINAL : 2026-9-1"), { reschedules: 1, originalDate: "2026-09-01" });
  assert.deepEqual(parseDescription("Rescheduled: 2 times"), { reschedules: 2, originalDate: null });
  assert.deepEqual(parseDescription("Fecha original: 2026-02-31"), { reschedules: 0, originalDate: null }, "impossible dates are dropped");
  assert.deepEqual(parseDescription("Reprogramada: muchas"), { reschedules: 0, originalDate: null });
  assert.deepEqual(parseDescription(null), { reschedules: 0, originalDate: null });
  assert.deepEqual(parseDescription(undefined), { reschedules: 0, originalDate: null });
});

test("parseDue: ISO instants and bare dates", () => {
  assert.equal(parseDue(null), null);
  assert.equal(parseDue(""), null);
  assert.equal(parseDue("not a date"), null);
  const d = parseDue("2026-09-18")!;
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 8, 18], "bare date keeps its calendar day");
});

test("relativeDueLabel and shortDate in es and en", () => {
  assert.deepEqual(relativeDueLabel(-5, "es"), { text: "Atrasado 5d", tone: "late" });
  assert.deepEqual(relativeDueLabel(0, "es"), { text: "Hoy", tone: "today" });
  assert.deepEqual(relativeDueLabel(1, "es-MX"), { text: "Mañana", tone: "soon" });
  assert.deepEqual(relativeDueLabel(7, "es"), { text: "En 7d", tone: "soon" });
  assert.deepEqual(relativeDueLabel(30, "es"), { text: "En 30d", tone: "future" });
  assert.equal(relativeDueLabel(-2, "en").text, "Overdue 2d");
  assert.equal(relativeDueLabel(0, "en").text, "Today");
  assert.equal(relativeDueLabel(1, "en").text, "Tomorrow");
  assert.equal(relativeDueLabel(9, "en").text, "In 9d");
  assert.equal(shortDate("2026-09-11", "es", today), "11 sep");
  assert.equal(shortDate("2026-09-11", "en", today), "Sep 11");
  assert.equal(shortDate("2025-01-02", "es", today), "2 ene 2025");
  assert.equal(shortDate("garbage", "es", today), "");
  assert.equal(shortDate(null, "en", today), "");
});

test("statusKind classifies list names", () => {
  assert.equal(statusKind("Realizado"), "done");
  assert.equal(statusKind("Hecho"), "done");
  assert.equal(statusKind("Cualquiera", "done"), "done");
  assert.equal(statusKind("Bloqueadas"), "blocked");
  assert.equal(statusKind("En proceso"), "doing");
  assert.equal(statusKind("En espera"), "waiting");
  assert.equal(statusKind("En revisión"), "review");
  assert.equal(statusKind("Próximo pase"), "next");
  assert.equal(statusKind("Despriorizado"), "deprioritized");
  assert.equal(statusKind("Cancelado"), "cancelled");
  assert.equal(statusKind("Pendiente"), "pending");
  assert.equal(statusKind("Ideas"), "pending");
});

test("groupValues: prefix convention, tag groups, only the first colon splits", () => {
  const tags = [tag("Área: TI"), tag("Fase: Fase 4: Web ROE (Frontend)"), tag("Proyecto: Fast Track"), tag("urgente")];
  assert.deepEqual(groupValues(tags, [], undefined, DEFAULT_PATTERNS.area), ["TI"]);
  assert.deepEqual(groupValues(tags, [], undefined, DEFAULT_PATTERNS.phase), ["Fase 4: Web ROE (Frontend)"]);
  assert.deepEqual(groupValues(tags, [], "proyecto", DEFAULT_PATTERNS.area), ["Fast Track"], "configured name wins over the default");
  assert.deepEqual(groupValues(tags, [], "Equipo", DEFAULT_PATTERNS.area), []);
  const groups = [{ id: "g1", name: "Area", tags: ["Digital", "Operaciones"] }];
  assert.deepEqual(groupValues([tag("Digital"), tag("Área: Digital")], groups, undefined, DEFAULT_PATTERNS.area), ["Digital"], "deduplicated");
  assert.deepEqual(groupValues(undefined, groups, undefined, DEFAULT_PATTERNS.area), []);
  assert.deepEqual(groupNameOptions(groups, lists(["A", [card("1", { tags })]])), ["Area", "Fase", "Proyecto"]);
});

test("buildItems: days, owners, status flags", () => {
  const ls = lists(["Pendiente", [card("1", { dueAt: at(-3), assignees: [{ id: "u1", name: "Ana" }, "u1"], summary: "Reprogramada: 2 veces" })]], ["Realizado", [card("2", { dueAt: at(0) })]], ["Bloqueadas", [card("3")]]);
  const [a, b, c] = buildItems(ls, [], {}, today);
  assert.equal(a.daysToDue, -3);
  assert.equal(a.reschedules, 2);
  assert.equal(a.owners.length, 1, "same person twice counts once");
  assert.equal(b.done, true);
  assert.equal(b.daysToDue, 0);
  assert.equal(c.blocked, true);
  assert.equal(c.dueDay, null);
  assert.equal(c.daysToDue, null);
});

test("buildSummary: KPIs, progress, status bar, top overdue, rescheduled", () => {
  const ti = tag("Área: TI");
  const dig = tag("Área: Digital");
  const ls = lists(
    ["Pendiente", [
      card("1", { tags: [ti, tag("Proyecto: Fast Track")], dueAt: at(-10), summary: "Reprogramada: 4 veces" }),
      card("2", { tags: [ti], dueAt: at(-2) }),
      card("3", { tags: [ti], dueAt: at(-5) }),
      card("4", { tags: [ti], dueAt: at(-1) }),
      card("5", { tags: [ti], dueAt: at(7) }),
      card("6", { tags: [ti], dueAt: at(8) }),
      card("7", { tags: [ti] }),
    ]],
    ["Bloqueadas", [card("8", { tags: [ti], dueAt: at(2) })]],
    ["Realizado", [card("9", { tags: [ti], dueAt: at(-20) }), card("10", { tags: [dig], summary: "Reprogramada: 1 vez" })]],
  );
  const s = buildSummary(ls, [], { today });
  assert.equal(s.hasAreaGroup, true);
  assert.deepEqual(s.areas.map((a) => a.name), ["Digital", "TI"], "alphabetical when the board defines no order");
  const t = s.areas.find((a) => a.name === "TI")!;
  assert.equal(t.total, 9);
  assert.equal(t.open, 8);
  assert.equal(t.overdue, 4, "done cards are never overdue");
  assert.equal(t.dueSoon, 2, "today..+7 days: day 7 and day 2 (blocked) count, day 8 does not");
  assert.equal(t.blocked, 1);
  assert.equal(t.done, 1);
  assert.equal(t.progress, 11);
  assert.deepEqual(t.statuses.map((x) => [x.title, x.count, x.kind]), [["Pendiente", 7, "pending"], ["Bloqueadas", 1, "blocked"], ["Realizado", 1, "done"]]);
  assert.deepEqual(t.topOverdue.map((x) => [x.item.id, x.daysLate, x.project]), [["1", 10, "Fast Track"], ["3", 5, null], ["2", 2, null]]);
  assert.equal(t.rescheduled, 4);
  const d = s.areas.find((a) => a.name === "Digital")!;
  assert.equal(d.progress, 100);
  assert.equal(d.rescheduled, 1);
  assert.equal(d.overdue, 0);
});

test("buildSummary: areas defined by a tag group appear empty; cards without area go to 'none'", () => {
  const groups = [{ id: "g", name: "Área", tags: ["Área: TI", "Área: Médica"] }];
  const ls = lists(["Pendiente", [card("1", { tags: [tag("Área: TI")] }), card("2")]]);
  const s = buildSummary(ls, groups, { today });
  assert.deepEqual(s.areas.map((a) => [a.kind, a.name, a.total, a.empty]), [["area", "TI", 1, false], ["area", "Médica", 0, true], ["none", "", 1, false]]);
});

test("buildSummary: no area group -> one 'all' card; empty board; no due dates; no tags", () => {
  const s = buildSummary(lists(["Pendiente", [card("1"), card("2", { tags: [tag("x")] })]], ["Hecho", [card("3")]]), [], { today });
  assert.equal(s.hasAreaGroup, false);
  assert.equal(s.areas.length, 1);
  assert.equal(s.areas[0].kind, "all");
  assert.equal(s.areas[0].total, 3);
  assert.equal(s.areas[0].overdue, 0);
  assert.equal(s.areas[0].progress, 33);
  const e = buildSummary([], [], { today });
  assert.equal(e.areas.length, 1);
  assert.equal(e.areas[0].empty, true);
  assert.equal(e.areas[0].progress, 0);
  assert.deepEqual(e.owners, []);
  const e2 = buildSummary(lists(["Pendiente", []]), [], { today });
  assert.equal(e2.areas[0].empty, true);
});

test("buildSummary: owner filter and configured area group name", () => {
  const ana = { id: "u1", name: "Ana" };
  const bob = { id: "u2", name: "Bob" };
  const ls = lists(["Pendiente", [card("1", { assignees: [ana], tags: [tag("Equipo: Rojo")] }), card("2", { assignees: [bob], tags: [tag("Equipo: Azul")] })]]);
  const all = buildSummary(ls, [], { today, areaGroup: "Equipo" });
  assert.deepEqual(all.areas.map((a) => a.name), ["Azul", "Rojo"]);
  assert.deepEqual(all.owners.map((o) => o.name), ["Ana", "Bob"]);
  const mine = buildSummary(ls, [], { today, areaGroup: "Equipo", ownerKey: "u1" });
  assert.deepEqual(mine.areas.map((a) => [a.name, a.total]), [["Rojo", 1]]);
  assert.deepEqual(mine.owners.map((o) => o.name), ["Ana", "Bob"], "the filter list is not narrowed by the filter");
});
