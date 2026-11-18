import assert from "node:assert/strict";
import test from "node:test";

import { applyImport, type ImportApi } from "./apply-import.ts";
import { buildCardDrafts, matchMember, parseDueDate, splitMulti, type ImportPlan, type ImportSheet } from "./table-import.ts";

const members = [
  { id: "m1", userId: "u-ana", name: "Ana Ruiz", primaryEmail: "ana@acme.com" },
  { id: "m2", userId: "u-luis", name: "Luis Pérez", alias: "Lucho", primaryEmail: "luis@acme.com" },
];

const headers = ["ID", "Tarea", "Descripción", "Estado", "Responsable", "Vence", "Prioridad", "Etiquetas", "Subtareas", "Cliente"];
const plan: ImportPlan = {
  entity: "boards", title: 1, description: [2], list: 3, checklist: 8, ignore: [0], assignee: 4, dueDate: 5, priority: 6, tags: 7, email: null, checks: [], source: "ai",
};
const sheet: ImportSheet = {
  name: "Tareas", headers, totalRows: 4, truncated: false, columns: [], plan,
  rows: [
    ["1", "Diseñar landing", "Primera versión", "Todo", "ana@acme.com, Lucho", "2025-03-01", "Alta", "web, diseño", "maqueta; textos", "ACME"],
    ["2", "Revisar copy", "", "Doing", "Pedro", "31/02/2025", "Media", "Web", "", ""],
    ["3", "", "sin título", "Todo", "", "", "", "", "", ""],
    ["4", "Publicar", "", "", "luis@acme.com", "09/03/2025", "baja", "", "", ""],
  ],
};

test("values: multi-value split, dates and member matching", () => {
  assert.deepEqual(splitMulti("web, Diseño; ux / WEB"), ["web", "Diseño", "ux"]);
  assert.equal(parseDueDate("2025-03-01"), "2025-03-01T00:00:00.000Z");
  assert.equal(parseDueDate("09/03/2025"), "2025-03-09T00:00:00.000Z", "ambiguous dates are read day-first");
  assert.equal(parseDueDate("03/25/2025"), "2025-03-25T00:00:00.000Z", "month-first when only that is possible");
  assert.equal(parseDueDate("31/02/2025"), null);
  assert.equal(parseDueDate("pronto"), null);
  assert.equal(matchMember("ANA@acme.com", members)?.id, "m1");
  assert.equal(matchMember("lucho", members)?.id, "m2");
  assert.equal(matchMember("luis perez", members)?.id, "m2", "accents and case do not matter");
  assert.equal(matchMember("Pedro", members), null);
});

test("rows become cards: description, details, checklist, assignees, dates and tags", () => {
  const result = buildCardDrafts(sheet, plan, members);
  assert.equal(result.cards.length, 3);
  assert.equal(result.skippedEmpty, 1);
  assert.deepEqual(result.unmatchedAssignees, ["Pedro"]);
  assert.equal(result.badDates, 1);
  const first = result.cards[0];
  assert.equal(first.title, "Diseñar landing");
  assert.equal(first.listName, "Todo");
  assert.deepEqual(first.assigneeIds, ["u-ana", "u-luis"]);
  assert.equal(first.dueAt, "2025-03-01T00:00:00.000Z");
  assert.deepEqual(first.tagNames, ["Web", "Diseño", "Alta"], "tags are unified and tidied");
  assert.equal(first.blocks[0].markdown, "Primera versión");
  assert.match(first.blocks[1].markdown!, /\*\*Cliente:\*\* ACME/, "columns with no role are kept as details");
  assert.ok(!first.blocks[1].markdown!.includes("ID"), "ignored columns are left out");
  assert.deepEqual(first.blocks[2].items!.map((i) => i.label), ["maqueta", "textos"]);
});

function fakeApi() {
  const calls = { boards: [] as string[], lists: [] as Array<[string, string]>, batches: [] as any[][], docs: [] as string[], bricks: [] as any[], tags: [] as any[] };
  let n = 0;
  const api: ImportApi = {
    createBoard: async (p) => (calls.boards.push(p.name), { id: `b${++n}` }),
    createList: async (b, p) => (calls.lists.push([b, p.name]), { id: `l${++n}` }),
    createCardsBatch: async (cards) => (calls.batches.push(cards), cards.map(() => ({ id: `c${++n}` }))),
    createDocument: async (p) => (calls.docs.push(p.title), { id: `d${++n}` }),
    createDocumentBrick: async (_d, p) => (calls.bricks.push(p), {}),
    createTag: async (p) => (calls.tags.push(p), { id: `t${++n}`, name: p.name }),
  };
  return { api, calls };
}

test("a board sheet creates the board, its lists in file order, tags once and the cards in batches", async () => {
  const { api, calls } = fakeApi();
  const report = await applyImport([{ sheet, plan, enabled: true }], { members, existingTags: [{ id: "t-web", name: "Web" }] }, api);
  assert.deepEqual(calls.boards, ["Tareas"]);
  assert.deepEqual(calls.lists.map((l) => l[1]), ["Todo", "Doing", "Imported"], "blank statuses go to a catch-all list");
  assert.deepEqual(calls.tags.map((t) => t.name).sort(), ["Alta", "Baja", "Diseño", "Media"], "'web'/'Web' reuses the existing tag");
  assert.equal(calls.tags.find((t) => t.name === "Alta").tagKind, "priority");
  assert.equal(calls.tags.find((t) => t.name === "Diseño").tagKind, "custom");
  assert.equal(calls.batches.flat().length, 3);
  assert.equal(report.cards, 3);
  assert.equal(report.boards, 1);
  assert.equal(report.lists, 3);
  assert.deepEqual(report.unmatchedAssignees, ["Pedro"]);
  assert.equal(report.badDates, 1);
  assert.equal(report.skippedRows, 1);
});

test("cards sheets go to the chosen board, reusing its lists; only missing lists are created", async () => {
  const { api, calls } = fakeApi();
  const cardsPlan = { ...plan, entity: "cards" as const };
  await applyImport(
    [{ sheet, plan: cardsPlan, enabled: true }],
    { members, existingTags: [], defaultBoard: { id: "board-1", lists: [{ id: "list-todo", name: "TODO" }] } },
    api,
  );
  assert.deepEqual(calls.boards, []);
  assert.deepEqual(calls.lists.map((l) => l[1]), ["Doing"]);
  assert.equal(calls.batches.flat()[0].listId, "list-todo");
});

test("a data sheet becomes a document with table blocks, and people are only reported, never invited", async () => {
  const { api, calls } = fakeApi();
  const data: ImportSheet = { ...sheet, name: "Ventas", headers: ["Mes", "Total"], rows: Array.from({ length: 2500 }, (_, i) => [`m${i}`, String(i)]) };
  const people: ImportSheet = { ...sheet, name: "Equipo", headers: ["Nombre", "Correo"], rows: [["Ana", "ana@acme.com"], ["Zoe", "zoe@x.com"], ["Ana", "ANA@acme.com"]] };
  const report = await applyImport(
    [
      { sheet: data, plan: { ...plan, entity: "documents" }, enabled: true },
      { sheet: people, plan: { ...plan, entity: "people", title: 0, email: 1 }, enabled: true },
      { sheet, plan, enabled: false },
    ],
    { members, existingTags: [] },
    api,
  );
  assert.deepEqual(calls.docs, ["Ventas"]);
  assert.equal(calls.bricks.length, 3, "2,500 rows -> three table blocks");
  assert.deepEqual(calls.bricks[0].content.rows[0], ["Mes", "Total"]);
  assert.equal(calls.bricks[2].content.rows.length, 501);
  assert.deepEqual(report.peopleInTeam, ["Ana <ana@acme.com>"]);
  assert.deepEqual(report.peopleMissing, ["Zoe <zoe@x.com>"]);
  assert.equal(calls.boards.length, 0, "disabled sheets are not touched");
});

import { linkify } from "./table-import.ts";

test("links: URLs become clickable; ticket keys do too, but only when the deployment knows where its tickets live", () => {
  const base = "https://acme.atlassian.net/browse/";
  assert.equal(linkify("ver https://acme.com/doc.", null), "ver [https://acme.com/doc](https://acme.com/doc).");
  assert.equal(linkify("TRP-261 · TRP-258", null), "TRP-261 · TRP-258", "no base URL: keys stay text");
  assert.equal(linkify("TRP-261 · TRP-258", base), "[TRP-261](https://acme.atlassian.net/browse/TRP-261) · [TRP-258](https://acme.atlassian.net/browse/TRP-258)");
  assert.equal(linkify("[TRP-261](https://x.test/a)", base), "[TRP-261](https://x.test/a)", "an existing markdown link is left alone");
  assert.equal(linkify("https://acme.atlassian.net/browse/TRP-9", base), "[https://acme.atlassian.net/browse/TRP-9](https://acme.atlassian.net/browse/TRP-9)", "a key inside a URL is not wrapped twice");
  assert.equal(linkify("mejora de UTF-8 y SHA-256", base), "mejora de UTF-8 y SHA-256", "encodings and standards are not tickets");
  assert.equal(linkify("", base), "");
});

test("card details carry the links when a base URL is given", () => {
  const headers = ["Req", "Requerimiento Jira"];
  const plan: ImportPlan = { entity: "cards", title: 0, description: [], list: null, checklist: null, ignore: [], assignee: null, dueDate: null, priority: null, tags: null, email: null, checks: [], source: "ai" };
  const sheet: ImportSheet = { name: "S", headers, totalRows: 1, truncated: false, columns: [], plan, rows: [["Algo", "TRP-261 · TRP-258"]] };
  const withBase = buildCardDrafts(sheet, plan, [], { ticketBaseUrl: "https://acme.atlassian.net/browse/" }).cards[0].blocks[0].markdown!;
  assert.match(withBase, /\[TRP-261\]\(https:\/\/acme\.atlassian\.net\/browse\/TRP-261\)/);
  assert.equal(buildCardDrafts(sheet, plan, []).cards[0].blocks[0].markdown, "**Requerimiento Jira:** TRP-261 · TRP-258");
});
