import assert from "node:assert/strict";
import test from "node:test";

import { PRIORITY_GROUPS, STATUS_GROUPS, canonicalizer, cleanText, cleanTitle, labelKey, tidyLabel } from "./normalize.ts";
import { buildCardDrafts, type ImportPlan, type ImportSheet } from "./table-import.ts";

test("text: invisible characters, non-breaking spaces, tabs and blank lines are cleaned", () => {
  assert.equal(cleanText("  Hola\u00A0\u00A0mundo\u200B  \t "), "Hola mundo");
  assert.equal(cleanText("a\r\n\r\n\r\n\r\nb"), "a\n\nb");
  assert.equal(cleanText("  uno  \n   dos  "), "uno\ndos");
  assert.equal(cleanText("Cafe\u0301"), "Café", "accents are composed (NFC)");
});

test("titles: one line, list markers removed", () => {
  assert.equal(cleanTitle("  - Diseñar   landing \n"), "Diseñar landing");
  assert.equal(cleanTitle("• Revisar copy"), "Revisar copy");
  assert.equal(cleanTitle("3) Publicar"), "Publicar");
  assert.equal(cleanTitle("[ ] Probar"), "Probar");
  assert.equal(cleanTitle("2025 roadmap"), "2025 roadmap", "a number that is part of the text stays");
});

test("labels: case, accents, spacing and # variants share one key and one display form", () => {
  assert.equal(labelKey(" #Diseño  Web "), "diseno web");
  assert.equal(tidyLabel("POR HACER"), "Por hacer");
  assert.equal(tidyLabel("en curso"), "En curso");
  assert.equal(tidyLabel("QA"), "QA", "short acronyms stay");
  assert.equal(tidyLabel("iOS App"), "iOS App", "mixed case is left alone");
});

test("canonicalizer merges variants and synonyms, keeping the most used spelling of the file", () => {
  const status = canonicalizer(["Por hacer", "POR HACER", "por hacer ", "To do", "En curso", "in progress", "IN PROGRESS", "Hecho", "Done", "done"], STATUS_GROUPS);
  assert.equal(status("POR HACER"), "Por hacer");
  assert.equal(status("To do"), "Por hacer", "synonyms collapse into the dominant form");
  assert.equal(status("en curso"), "In progress", "dominant variant wins within a group");
  assert.equal(status("Done"), "Done");
  assert.equal(status("hecho"), "Done");
  assert.equal(status("Algo nuevo"), "Algo nuevo", "unknown values pass through tidied");

  const priority = canonicalizer(["Alta", "alta", "ALTA", "High", "media", "Baja", "low"], PRIORITY_GROUPS);
  assert.equal(priority("high"), "Alta");
  assert.equal(priority("LOW"), "Baja");

  const tags = canonicalizer(["web", "Web", "#ux", "UX", "ux"]);
  assert.equal(tags("#WEB"), "Web");
  assert.equal(tags("Ux"), "UX");
  assert.equal(tags(""), "");
});

test("cards from a messy sheet come out normalised", () => {
  const headers = ["Tarea", "Estado", "Etiquetas", "Prioridad", "Notas"];
  const plan: ImportPlan = { entity: "boards", title: 0, description: [4], list: 1, checklist: null, ignore: [], assignee: null, dueDate: null, priority: 3, tags: 2, email: null, checks: [], source: "ai" };
  const sheet: ImportSheet = {
    name: "T", headers, totalRows: 4, truncated: false, columns: [], plan,
    rows: [
      ["  - Diseñar\u00A0landing ", "POR HACER", "#web, Diseño", "ALTA", "  Primera\u200B versión  "],
      ["Revisar copy", "por hacer ", "WEB", "High", ""],
      ["Publicar", "To do", "web", "alta", ""],
      ["Cerrar", "hecho", "", "baja", ""],
    ],
  };
  const { cards } = buildCardDrafts(sheet, plan, []);
  assert.deepEqual(cards.map((c) => c.title), ["Diseñar landing", "Revisar copy", "Publicar", "Cerrar"]);
  assert.deepEqual(cards.map((c) => c.listName), ["Por hacer", "Por hacer", "Por hacer", "Hecho"]);
  assert.deepEqual(cards[0].tagNames, ["Web", "Diseño", "Alta"]);
  assert.deepEqual(cards[1].tagNames, ["Web", "Alta"]);
  assert.equal(cards[0].blocks[0].markdown, "Primera versión");
});

test("yes/no columns become checklist items and a numeric priority is read as a label", () => {
  const headers = ["Fix", "Validado en DESA", "Validado en PROD", "Prioridad"];
  const plan: ImportPlan = { entity: "cards", title: 0, description: [], list: null, checklist: null, ignore: [], assignee: null, dueDate: null, priority: 3, tags: null, email: null, checks: [1, 2], source: "ai" };
  const sheet: ImportSheet = {
    name: "F", headers, totalRows: 2, truncated: false, columns: [], plan,
    rows: [["Refresh token", "TRUE", "FALSE", "3"], ["MFA", "", "no", "3"]],
  };
  const { cards } = buildCardDrafts(sheet, plan, []);
  const items = cards[0].blocks.find((b) => b.kind === "checklist")!.items!;
  assert.deepEqual(items.map((i) => [i.label, i.checked]), [["Validado en DESA", true], ["Validado en PROD", false]]);
  assert.deepEqual(cards[1].blocks.find((b) => b.kind === "checklist")!.items!.map((i) => [i.label, i.checked]), [["Validado en PROD", false]], "empty cells are not items");
  assert.deepEqual(cards[0].tagNames, ["Prioridad 3"]);
});

test("short 'description' columns keep their label, several prose columns are told apart, unreadable dates stay visible", () => {
  const headers = ["Fix", "Módulo", "Detalles Técnicos", "Comentarios", "Compromiso"];
  const long = "x".repeat(80);
  const plan: ImportPlan = { entity: "cards", title: 0, description: [1, 2, 3], list: null, checklist: null, ignore: [], assignee: 4 - 4 || null, dueDate: 4, priority: null, tags: null, email: null, checks: [], source: "ai" };
  const sheet: ImportSheet = {
    name: "F", headers, totalRows: 2, truncated: false, columns: [], plan,
    rows: [["Refresh", "MFA", `Detalle ${long}`, `Comentario ${long}`, "pendiente"], ["Paginar", "Web", `Otro ${long}`, "", "2026-02-10"]],
  };
  const { cards, badDates } = buildCardDrafts(sheet, plan, []);
  const [prose, details] = cards[0].blocks.map((b) => b.markdown!);
  assert.match(prose, /^\*\*Detalles Técnicos\*\*\n\nDetalle /, "prose columns are labelled when there are several");
  assert.match(prose, /\*\*Comentarios\*\*\n\nComentario /);
  assert.match(details, /\*\*Módulo:\*\* MFA/, "a short column is a labelled detail, not an anonymous paragraph");
  assert.match(details, /\*\*Compromiso:\*\* pendiente/, "an unreadable date is kept as text");
  assert.equal(badDates, 1);
  assert.equal(cards[1].dueAt, "2026-02-10T00:00:00.000Z");
});

test("assignees that are not in the team are listed once, whatever the spelling", () => {
  const headers = ["Fix", "Resp"];
  const plan: ImportPlan = { entity: "cards", title: 0, description: [], list: null, checklist: null, ignore: [], assignee: 1, dueDate: null, priority: null, tags: null, email: null, checks: [], source: "ai" };
  const sheet: ImportSheet = { name: "F", headers, totalRows: 3, truncated: false, columns: [], plan, rows: [["a", "TI"], ["b", "Ti"], ["c", "Jose deza"], ["d", "Jose Deza"]] };
  assert.deepEqual(buildCardDrafts(sheet, plan, []).unmatchedAssignees, ["TI", "Jose deza"]);
});
