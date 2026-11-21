import assert from "node:assert/strict";
import test from "node:test";

import type { RuleGroup } from "../tags/group-rules.ts";
import { acceptOf, activeWizard, checkWizardFile, decodeWizardFile, encodeWizardFile, isAnswered, markdownLink, maxFilesOf, mimeAllowed, setMediaUnderHeading, WIZARD_MAX_FILE_BYTES, wizardFiles, type WizardFile,  applyWizardAnswers, buildVariables, dayToIso, setChecklistUnderHeading, missingRequired, setLine, setTextUnderHeading, starterWizard, substitute, type TemplateWizard, type WizardBrick } from "./wizard.ts";

const tags = [
  { id: "o1", name: "Origen: BAU" },
  { id: "o2", name: "Origen: Nuevo" },
  { id: "r1", name: "Responsable: TI" },
  { id: "r2", name: "Responsable: Digital" },
  { id: "r3", name: "Responsable: Dropout" },
];
const groups: RuleGroup[] = [
  { id: "g_o", name: "Origen", tags: ["Origen: BAU", "Origen: Nuevo"], mode: "single" },
  { id: "g_r", name: "Responsable", tags: ["Responsable: TI", "Responsable: Digital", "Responsable: Dropout"], mode: "limited", maxTags: 2 },
];
const wizard: TemplateWizard = {
  enabled: true,
  steps: [
    { id: "s1", title: "Clasificación", fields: [
      { id: "f_o", kind: "tag_group", label: "Origen", required: true, groupId: "g_o" },
      { id: "f_r", kind: "tag_group", label: "Responsable", required: false, groupId: "g_r" },
    ] },
    { id: "s2", title: "Detalle", fields: [
      { id: "f_t", kind: "title", label: "Nombre", required: true },
      { id: "f_l", kind: "list", label: "Estado", required: false },
      { id: "f_e", kind: "line", label: "Esfuerzo", key: "Esfuerzo (d)", input: "number", required: false },
      { id: "f_x", kind: "text", label: "Detalle", required: false },
    ] },
  ],
};
const blocks = (): WizardBrick[] => [
  { id: "b1", kind: "text", displayStyle: "paragraph", markdown: "Categoría: \nÁrea funcional: \nEsfuerzo (d): " },
  { id: "b2", kind: "text", displayStyle: "paragraph", markdown: "## Detalle" },
  { id: "b3", kind: "text", displayStyle: "paragraph", markdown: "Qué se necesita." },
];
let n = 0;
const makeId = () => `new${++n}`;

test("activeWizard needs it enabled and at least one field", () => {
  assert.equal(activeWizard(null), null);
  assert.equal(activeWizard({ enabled: false, steps: wizard.steps }), null);
  assert.equal(activeWizard({ enabled: true, steps: [{ id: "s", title: "x", fields: [] }] }), null);
  assert.equal(activeWizard(wizard)?.steps.length, 2);
});

test("missingRequired lists the unanswered required fields of a step", () => {
  assert.deepEqual(missingRequired(wizard.steps[0], {}), ["f_o"]);
  assert.deepEqual(missingRequired(wizard.steps[0], { f_o: ["o2"] }), []);
  assert.deepEqual(missingRequired(wizard.steps[1], { f_t: "  " }), ["f_t"]);
});

test("setLine replaces an existing line or appends one", () => {
  assert.equal(setLine("A: 1\nEsfuerzo (d): \nB: 2", "Esfuerzo (d)", "3"), "A: 1\nEsfuerzo (d): 3\nB: 2");
  assert.equal(setLine("A: 1", "esfuerzo (d)", "3"), "A: 1\nesfuerzo (d): 3");
  assert.equal(setLine("", "Área", "X"), "Área: X");
  assert.equal(setLine("Área funcional: viejo", "Área funcional", "Citas (a.b)"), "Área funcional: Citas (a.b)");
});

test("setTextUnderHeading replaces the paragraph below the heading, adds one, or appends", () => {
  assert.equal(setTextUnderHeading(blocks(), "Detalle", "Nuevo texto", makeId)[2].markdown, "Nuevo texto");
  const noPara = [blocks()[1]];
  const added = setTextUnderHeading(noPara, "Detalle", "Algo", makeId);
  assert.equal(added.length, 2);
  assert.equal(added[1].markdown, "Algo");
  assert.equal(setTextUnderHeading(blocks(), "Otro", "Z", makeId).at(-1)?.markdown, "Z");
  assert.equal(setTextUnderHeading(blocks(), "Otro", "  ", makeId).length, 3, "empty text adds nothing");
});

test("applyWizardAnswers fills tags with the group rules, title, list, lines and text", () => {
  const out = applyWizardAnswers({
    wizard,
    answers: { f_o: ["o2"], f_r: ["r1", "r2", "r3"], f_t: "Validar citas", f_l: "list-7", f_e: "2.5", f_x: "Detalle largo" },
    blocks: blocks(), tagIds: ["o1"], allTags: tags, groups, title: "[19/11] ", listId: "list-1", makeId,
  });
  assert.deepEqual(out.tagIds.sort(), ["o2", "r1", "r2"].sort(), "single replaces BAU; limited keeps two of the three");
  assert.equal(out.title, "[19/11] Validar citas");
  assert.equal(out.listId, "list-7");
  assert.match(String(out.blocks[0].markdown), /Esfuerzo \(d\): 2\.5/);
  assert.equal(out.blocks[2].markdown, "Detalle largo");
});

test("unanswered optional fields leave the card as the template made it", () => {
  const out = applyWizardAnswers({ wizard, answers: { f_o: ["o1"] }, blocks: blocks(), tagIds: ["r3"], allTags: tags, groups, title: "", listId: "list-1", makeId });
  assert.deepEqual(out.tagIds.sort(), ["o1", "r3"]);
  assert.equal(out.listId, "list-1");
  assert.equal(out.blocks[2].markdown, "Qué se necesita.");
});

test("starterWizard builds a classification step from the tag groups and a detail step", () => {
  let i = 0;
  const w = starterWizard([{ id: "g1", name: "Origen", mode: "single" }, { id: "g2", name: "Responsable", mode: "multi" }], () => `id${++i}`);
  assert.equal(w.steps[0].title, "Clasificación");
  assert.deepEqual(w.steps[0].fields.map((f) => [f.label, f.required]), [["Origen", true], ["Responsable", false]]);
  assert.equal(w.steps[1].fields.some((f) => f.kind === "title"), true);
  assert.equal(starterWizard([], () => `id${++i}`).steps.length, 1);
});

test("substitute replaces {{variables}} case-insensitively and empties unknown ones", () => {
  assert.equal(substitute("[{{Date}}] {{iniciativa}} - {{nada}}", { date: "19/11", iniciativa: "WebROE" }), "[19/11] WebROE - ");
  assert.equal(substitute("sin llaves {x} ni {{ 1x }}", { x: "A" }), "sin llaves {x} ni {{ 1x }}");
});

test("placeholders of the title and blocks are filled from the answers and the built-ins", () => {
  const w: TemplateWizard = {
    enabled: true,
    steps: [{ id: "s", title: "x", fields: [
      { id: "f_i", kind: "tag_group", label: "Origen", required: true, groupId: "g_o", variable: "origen" },
      { id: "f_l", kind: "list", label: "Estado", required: false, variable: "estado" },
      { id: "f_n", kind: "text", label: "Resumen", required: false, variable: "resumen" },
    ] }],
  };
  const out = applyWizardAnswers({
    wizard: w, answers: { f_i: ["o2"], f_l: "list-7", f_n: "  Citas  " },
    blocks: [
      { id: "b1", kind: "text", displayStyle: "paragraph", markdown: "Pedido por {{user}} en {{board}} ({{origen}}), estado {{estado}}: {{resumen}}" },
      { id: "b2", kind: "checklist", items: [{ id: "i", label: "Revisar {{resumen}}", checked: false }] },
    ],
    tagIds: [], allTags: tags, groups, title: "[{{date}}] {{origen}} ", listId: null, makeId,
    lists: [{ id: "list-7", name: "2. En análisis" }], builtins: { date: "19/11", user: "Piero", board: "PENDIENTES" },
  });
  assert.equal(out.title, "[19/11] Nuevo ");
  assert.equal(out.blocks[0].markdown, "Pedido por Piero en PENDIENTES (Nuevo), estado 2. En análisis: Citas");
  assert.equal((out.blocks[1].items as Array<{ label: string }>)[0].label, "Revisar Citas");
});

test("buildVariables strips the group prefix from tag names and joins several", () => {
  const w: TemplateWizard = { enabled: true, steps: [{ id: "s", title: "x", fields: [{ id: "f", kind: "tag_group", label: "Responsable", required: false, groupId: "g_r", variable: "resp" }] }] };
  const v = buildVariables(w, { f: ["r1", "r2"] }, { allTags: tags, groups, lists: [], builtins: {} });
  assert.equal(v.resp, "TI, Digital");
  assert.equal(buildVariables(w, {}, { allTags: tags, groups, lists: [], builtins: {} }).resp, "");
});

test("a checklist answer fills the checklist under its heading, or adds heading and list", () => {
  const withList: WizardBrick[] = [{ id: "h", kind: "text", displayStyle: "paragraph", markdown: "## Criterios" }, { id: "c", kind: "checklist", items: [{ id: "i", label: "viejo", checked: false }] }];
  const out = setChecklistUnderHeading(withList, "Criterios", ["A", "B"], makeId);
  assert.deepEqual((out[1].items as Array<{ label: string }>).map((x) => x.label), ["A", "B"]);
  assert.equal(setChecklistUnderHeading([withList[0]], "Criterios", ["A"], makeId)[1].kind, "checklist");
  const none = setChecklistUnderHeading([], "Pasos", ["1"], makeId);
  assert.deepEqual(none.map((b) => b.kind), ["text", "checklist"]);
  assert.equal(none[0].markdown, "## Pasos");
  assert.equal(setChecklistUnderHeading(withList, "Criterios", [], makeId), withList, "no items changes nothing");
});

test("date, assignees, toggle and checklist questions", () => {
  const w: TemplateWizard = { enabled: true, steps: [{ id: "s", title: "x", fields: [
    { id: "d1", kind: "date", label: "Entrega", required: false, target: "due", variable: "entrega" },
    { id: "d2", kind: "date", label: "Inicio", required: false, target: "start" },
    { id: "d3", kind: "date", label: "Corte", required: false, target: "line", key: "Fecha de corte" },
    { id: "a", kind: "assignees", label: "Quién", required: false, variable: "quien" },
    { id: "t", kind: "toggle", label: "QA", required: false, key: "Requiere QA", variable: "qa" },
    { id: "c", kind: "checklist", label: "Criterios", required: false, variable: "criterios" },
  ] }] };
  const out = applyWizardAnswers({
    wizard: w, answers: { d1: "2026-12-01", d2: "2026-11-20", d3: "2026-12-15", a: ["u1", "u2"], t: "yes", c: ["Uno", " ", "Dos"] },
    blocks: [{ id: "b", kind: "text", displayStyle: "paragraph", markdown: "Requiere QA: \nFecha de corte: \nEntrega {{entrega}} por {{quien}}, QA {{qa}}: {{criterios}}" }],
    tagIds: [], allTags: tags, groups, title: "", listId: null, makeId,
    members: [{ id: "u1", name: "Ana" }, { id: "u2", name: "Beto" }], assigneeIds: ["u0"],
  });
  assert.equal(out.dueDay, "2026-12-01");
  assert.equal(out.startDay, "2026-11-20");
  assert.deepEqual(out.assigneeIds, ["u0", "u1", "u2"]);
  const md = String(out.blocks[0].markdown);
  assert.match(md, /Requiere QA: Sí/);
  assert.match(md, /Fecha de corte: 2026-12-15/);
  assert.match(md, /Entrega 2026-12-01 por Ana, Beto, QA Sí: Uno, Dos/);
  assert.equal(out.blocks.length, 3, "the checklist question added heading and list");
  assert.deepEqual((out.blocks[2].items as Array<{ label: string }>).map((x) => x.label), ["Uno", "Dos"]);
});

test("dayToIso keeps the calendar day and rejects bad input", () => {
  const iso = dayToIso("2026-12-01")!;
  const d = new Date(iso);
  assert.deepEqual([d.getFullYear(), d.getMonth() + 1, d.getDate()], [2026, 12, 1]);
  assert.equal(dayToIso("1/12/2026"), null);
  assert.equal(dayToIso(""), null);
});

const pic = (name: string, extra: Partial<WizardFile> = {}): WizardFile => ({ url: `https://cdn.test/${name}`, name, mime: "image/png", size: 1200, ...extra });

test("file answers round-trip through their encoded form and ignore garbage", () => {
  const f = pic("a.png");
  assert.deepEqual(decodeWizardFile(encodeWizardFile(f)), f);
  assert.equal(decodeWizardFile("not json"), null);
  assert.equal(decodeWizardFile(JSON.stringify({ name: "x" })), null, "a file needs its url");
  assert.equal(decodeWizardFile(42), null);
  assert.deepEqual(wizardFiles([encodeWizardFile(f), "junk", ""]), [f]);
  assert.deepEqual(wizardFiles(undefined), []);
  assert.equal(isAnswered([encodeWizardFile(f)]), true);
  assert.equal(isAnswered([]), false);
});

test("missingRequired treats an image / file question as answered once a file is there", () => {
  const step = { id: "s", title: "x", fields: [{ id: "i", kind: "image" as const, label: "Capturas", required: true }, { id: "d", kind: "file" as const, label: "Contrato", required: false }] };
  assert.deepEqual(missingRequired(step, {}), ["i"]);
  assert.deepEqual(missingRequired(step, { i: [] }), ["i"]);
  assert.deepEqual(missingRequired(step, { i: [encodeWizardFile(pic("a.png"))] }), []);
});

test("maxFilesOf, acceptOf and mimeAllowed", () => {
  assert.equal(maxFilesOf({}), 1);
  assert.equal(maxFilesOf({ max: 4 }), 4);
  assert.equal(maxFilesOf({ max: 99 }), 10);
  assert.equal(maxFilesOf({ max: 0 }), 1);
  assert.equal(maxFilesOf({ max: 2.5 }), 1);
  assert.deepEqual(acceptOf({ kind: "image", accept: ["application/pdf"] }), ["image/*"], "an image question only takes images");
  assert.deepEqual(acceptOf({ kind: "file" }), []);
  assert.equal(mimeAllowed([], "anything/else"), true);
  assert.equal(mimeAllowed(["image/*"], "image/webp"), true);
  assert.equal(mimeAllowed(["image/*"], "application/pdf"), false);
  assert.equal(mimeAllowed(["application/pdf", "text/csv"], "TEXT/CSV"), true);
  assert.equal(mimeAllowed(["application/pdf"], ""), false, "an unknown type fails a restricted list");
  assert.equal(mimeAllowed(["image/*"], "imagex/png"), false);
});

test("checkWizardFile: type, size and count", () => {
  const img = { kind: "image" as const, max: 2 };
  assert.equal(checkWizardFile(img, { type: "image/png", size: 10 }, 0), null);
  assert.equal(checkWizardFile(img, { type: "application/pdf", size: 10 }, 0), "type");
  assert.equal(checkWizardFile(img, { type: "image/png", size: WIZARD_MAX_FILE_BYTES + 1 }, 0), "size");
  assert.equal(checkWizardFile(img, { type: "image/png", size: WIZARD_MAX_FILE_BYTES }, 0), null, "exactly the cap is fine");
  assert.equal(checkWizardFile(img, { type: "image/png", size: 10 }, 2), "count");
  assert.equal(checkWizardFile({ kind: "file" }, { type: "image/png", size: 10 }, 1), null, "a single-file question replaces its file");
  assert.equal(checkWizardFile({ kind: "file", accept: ["application/pdf"], max: 3 }, { type: "text/csv", size: 10 }, 0), "type");
});

test("an image answer becomes one image media brick under its heading", () => {
  const w: TemplateWizard = { enabled: true, steps: [{ id: "s", title: "x", fields: [{ id: "i", kind: "image", label: "Detalle", required: false, max: 3 }] }] };
  const one = applyWizardAnswers({ wizard: w, answers: { i: [encodeWizardFile(pic("a.png"))] }, blocks: blocks(), tagIds: [], allTags: tags, groups, title: "", listId: null, makeId });
  assert.deepEqual(one.blocks.map((b) => b.kind), ["text", "text", "media", "text"], "right after the ## Detalle heading");
  const m = one.blocks[2];
  assert.equal(m.mediaType, "image");
  assert.equal(m.url, "https://cdn.test/a.png");
  assert.equal(m.title, "a.png");
  assert.equal(m.caption, null);
  const many = applyWizardAnswers({ wizard: w, answers: { i: [encodeWizardFile(pic("a.png")), encodeWizardFile(pic("b.png")), encodeWizardFile(pic("c.png")), encodeWizardFile(pic("d.png"))] }, blocks: blocks(), tagIds: [], allTags: tags, groups, title: "", listId: null, makeId });
  const caption = String(many.blocks[2].caption);
  assert.ok(caption.startsWith("__media_meta_v1__:"), "several pictures use the carousel caption of the card's own upload");
  assert.deepEqual(JSON.parse(caption.slice("__media_meta_v1__:".length)).items.map((i: { title: string }) => i.title), ["a.png", "b.png", "c.png"], "capped to max");
});

test("a file answer appends heading and file brick when the heading is missing; empty brick is replaced; no files change nothing", () => {
  const file: WizardFile = { url: "https://cdn.test/c.pdf", name: "Contrato.pdf", mime: "application/pdf", size: 5000 };
  const added = setMediaUnderHeading(blocks(), "Contrato", [file], "file", makeId);
  assert.deepEqual(added.slice(-2).map((b) => [b.kind, b.markdown ?? b.mediaType]), [["text", "## Contrato"], ["media", "file"]]);
  const withEmpty: WizardBrick[] = [{ id: "h", kind: "text", displayStyle: "paragraph", markdown: "## Contrato" }, { id: "m", kind: "media", mediaType: "file", url: null }, { id: "t", kind: "text", markdown: "fin" }];
  const replaced = setMediaUnderHeading(withEmpty, "contrato", [file], "file", makeId);
  assert.equal(replaced.length, 3);
  assert.equal(replaced[1].id, "m", "keeps the template brick id");
  assert.equal(replaced[1].url, file.url);
  const filled: WizardBrick[] = [withEmpty[0], { id: "m", kind: "media", mediaType: "file", url: "https://old" }];
  assert.equal(setMediaUnderHeading(filled, "Contrato", [file], "file", makeId).length, 3, "a brick that already has a file is kept");
  assert.equal(setMediaUnderHeading(withEmpty, "Contrato", [], "file", makeId), withEmpty);
});

test("{{variable}} of an image / file question is a markdown link list and never breaks the text", () => {
  const w: TemplateWizard = { enabled: true, steps: [{ id: "s", title: "x", fields: [{ id: "i", kind: "image", label: "Capturas", required: false, variable: "capturas", max: 2 }, { id: "f", kind: "file", label: "Doc", required: false, variable: "doc" }] }] };
  const tricky = pic("a [1].png", { url: "https://cdn.test/a b(1).png" });
  const out = applyWizardAnswers({
    wizard: w, answers: { i: [encodeWizardFile(tricky), encodeWizardFile(pic("b.png"))] },
    blocks: [{ id: "b", kind: "text", displayStyle: "paragraph", markdown: "Capturas: {{capturas}}. Doc: {{doc}}." }],
    tagIds: [], allTags: tags, groups, title: "", listId: null, makeId,
  });
  assert.equal(out.blocks[0].markdown, "Capturas: [a \\[1\\].png](https://cdn.test/a%20b%281%29.png), [b.png](https://cdn.test/b.png). Doc: .");
  assert.equal(markdownLink(pic("x.png")), "[x.png](https://cdn.test/x.png)");
});
