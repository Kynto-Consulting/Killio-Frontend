import assert from "node:assert/strict";
import test from "node:test";

import { applySuggestion, buildKqlSchema, closestMatch, declarationsOf, editDistance, findHints, joinAliases, suggest, type KqlSchema } from "./kql-complete.ts";

const schema: KqlSchema = {
  mode: "filter",
  tags: ["urgente", "alta", "baja", "bug de login"],
  lists: ["Por hacer", "En QA", "Resuelto"],
  boards: ["Tablero QA"],
  priorities: ["alta", "media"],
  people: ["Ana Torres", "Luis"],
  groups: ["ti"],
  customFields: ["cliente"],
  tables: ["Ventas"],
  columns: ["Responsable", "Monto neto"],
  sources: [],
};
const script: KqlSchema = { ...schema, mode: "script", customFields: [] };
const labels = (text: string, s = schema, caret = text.length) => suggest(text, caret, s).items.map((i) => i.label);

test("edit distance and closest match", () => {
  assert.equal(editDistance("kitten", "sitting", 5), 3);
  assert.equal(closestMatch("urgnte", schema.tags), "urgente");
  assert.equal(closestMatch("assignne", ["assignee", "board"]), "assignee");
  assert.equal(closestMatch("zzzzzz", ["assignee", "board"]), null);
  assert.equal(closestMatch("a", ["ab"]), null, "one letter is never a typo");
});

test("at the start it offers flags, fields and functions filtered by what was typed", () => {
  const start = labels("");
  assert.ok(start.includes("overdue") && start.includes("assignee"));
  assert.ok(labels("low").includes("lower("), "functions are offered by prefix");
  const ov = labels("over");
  assert.equal(ov[0], "overdue");
  assert.ok(labels("assi").includes("assignee"));
  assert.ok(labels("cf.cl").includes("cf.cliente"));
  assert.ok(!labels("assignee").includes("assignee"), "a fully typed word is not offered again");
});

test("after a field it offers operators", () => {
  const ops = labels("priority ");
  assert.ok(ops.includes("=") && ops.includes("contains") && ops.includes("between"));
});

test("after an operator it offers the real values of that field", () => {
  assert.deepEqual(labels("tag = ").slice(0, 3), ["urgente", "alta", "baja"], "values come in the order of the data");
  assert.ok(labels("tag = ur").includes("urgente"));
  assert.ok(labels('list = "En').includes("En QA"), "inside quotes it completes the text without adding quotes");
  const withSpaces = suggest("tag = bug", 9, schema).items.find((i) => i.label === "bug de login")!;
  assert.equal(withSpaces.insert, '"bug de login"', "values with spaces are quoted");
  assert.ok(labels("assignee = ").includes("me") && labels("assignee = ").includes("Ana Torres") && labels("assignee = ").includes("@ti"));
  assert.ok(labels("due = ").includes("today") && labels("due in ").includes("last 30d"));
  assert.ok(labels("tag in (urgente, ").includes("alta"));
});

test("shortcuts: #tag and @person", () => {
  assert.ok(labels("#ur").includes("#urgente"));
  assert.ok(labels("@a").includes("@Ana Torres"));
  assert.ok(labels("@t").includes("@ti"));
});

test("after a condition it offers and/or, and in scripts the clauses", () => {
  const tail = labels("overdue ");
  assert.ok(tail.includes("and") && tail.includes("or") && !tail.includes("group by"));
  const s = labels("cards where overdue ", script);
  assert.ok(s.includes("group by") && s.includes("select") && s.includes("order by") && s.includes("limit"));
});

test("scripts: sources, tables, group by and order by", () => {
  assert.ok(labels("", script).includes("cards") && labels("", script).includes("rows of"));
  assert.deepEqual(labels("rows of ", script), ["Ventas"]);
  const g = labels("cards group by ", script);
  assert.ok(g.includes("assignee") && g.includes("week("));
  assert.ok(labels("cards group by Resp", script).includes("Responsable"), "table columns are dimensions too");
  assert.ok(labels("cards group by assignee, ", script).includes("priority"));
  assert.ok(labels("cards order by ", script).includes("due"));
  assert.ok(labels("cards where done group by assignee ", script).includes("count"));
});

test("applying a suggestion replaces the word under the caret", () => {
  const c = suggest("overdue and assi", 16, schema);
  const item = c.items.find((i) => i.label === "assignee")!;
  const r = applySuggestion("overdue and assi", c, item);
  assert.equal(r.text, "overdue and assignee");
  assert.equal(r.caret, r.text.length);
  const mid = suggest("tag = ur and done", 8, schema);
  const r2 = applySuggestion("tag = ur and done", mid, mid.items.find((i) => i.label === "urgente")!);
  assert.equal(r2.text, "tag = urgente and done");
});

test("hints: unknown field from the engine message, near keywords, and values that match nothing", () => {
  const unknown = findHints("assigne = me", schema, { message: 'Unknown field "assigne". Built-in fields: ...', position: 0 });
  assert.ok(unknown[0].message.includes("assignee"));
  assert.deepEqual(unknown[0].fix, { from: 0, to: 7, replacement: "assignee", label: "assignee" });

  const kw = findHints("overdu and done", schema);
  assert.ok(kw.some((h) => h.fix?.replacement === "overdue"));
  const typoKw = findHints("cards where done grup by assignee", script);
  assert.ok(typoKw.some((h) => h.fix?.replacement === "group"));

  const val = findHints("tag = urgnte", schema);
  assert.equal(val.length, 1);
  assert.equal(val[0].fix!.replacement, "urgente");
  assert.equal(val[0].fix!.from, 6);
  const none = findHints('list = "Otra cosa"', schema);
  assert.ok(none[0].message.includes("Available"));
  assert.equal(none[0].fix, undefined);
  const quoted = findHints('list = "En qa"', schema);
  assert.equal(quoted.length, 0, "case does not matter");
});

test("no false alarms on valid text", () => {
  for (const ok of ["overdue and not done", "assignee = me and due in last 7d", 'title ~ /^bug/ and tag = "bug de login"', "priority = alta or #urgente", "done in last 30d"]) {
    assert.deepEqual(findHints(ok, schema), [], ok);
  }
  assert.deepEqual(findHints("cards where done group by assignee count", script), []);
});

test("the schema is learned from the cards and the context", () => {
  const s = buildKqlSchema({
    mode: "filter",
    cards: [
      { id: "1", title: "a", list: "Por hacer", board: "B", tags: ["x", "y"], priority: "alta", fields: { cliente: "ACME" } },
      { id: "2", title: "b", list: "En QA", board: "B", tags: ["x"], priority: null },
    ],
    ctx: { users: [{ id: "u", name: "Ana", alias: "an" }], groups: [{ id: "g", slug: "ti", name: "TI", memberIds: [] }], tagGroups: [{ id: "t", name: "P", tags: ["z"] }] },
  });
  assert.deepEqual(s.tags, ["x", "y", "z"]);
  assert.deepEqual(s.lists, ["En QA", "Por hacer"]);
  assert.deepEqual(s.priorities, ["alta"]);
  assert.deepEqual(s.people, ["an", "Ana"]);
  assert.deepEqual(s.groups, ["ti"]);
  assert.deepEqual(s.customFields, ["cliente"]);
});

test("new language: functions keep their camelCase, joins offer sources and alias fields", () => {
  assert.ok(labels("addd").includes("addDays("), "camelCase display names");
  assert.ok(labels("have").includes("having") || labels("hav", script).includes("having"));
  assert.ok(labels("cards where overdue ", script).includes("having") && labels("cards where overdue ", script).includes("join") && labels("cards where overdue ", script).includes("union"));
  assert.ok(labels("cards join ", script).includes("members"), "a source after join");
  assert.deepEqual(joinAliases('cards join members on assignee = id'), ["members"]);
  assert.deepEqual(joinAliases('rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombre'), ["c"]);
  const withCols: KqlSchema = { ...script, columns: ["Pais"] };
  const aliased = labels('rows of "Ventas" join rows of "Clientes" as c on Cliente = c.Nombre group by c.', withCols);
  assert.ok(aliased.includes("c.Pais") && aliased.includes("c.title"), "alias. completes the joined fields");
  assert.ok(labels('cards join members on assignee = id group by ', script).includes("members."), "the alias itself is offered");
  assert.ok(labels("cards group by list ", script).includes("median(") && labels("cards group by list ", script).includes("count_if("));
  const hints = findHints("cards where lowr(title) contains 'x'", script, { message: 'Unknown function "lowr". Did you mean "lower"?', position: 12 });
  assert.ok(hints.some((h) => h.fix?.replacement === "lower"));
  assert.deepEqual(findHints("cards join members on assignee = id left where age > 3", script), []);
});

test("rows and columns operations are offered after the right context", () => {
  const after = labels("cards where overdue ", script);
  for (const k of ["pivot", "unpivot", "transpose", "tail", "droplast"]) assert.ok(after.includes(k), k);
  assert.deepEqual(labels("cards select title transpose ", script), ["header"]);
  assert.ok(labels('rows of "Ventas" unpivot ', { ...script, columns: ["Q1"] }).includes("except"));
  assert.ok(labels('rows of "Ventas" unpivot ', { ...script, columns: ["Q1"] }).includes("Q1"));
  assert.ok(labels("cards group by list pivot ", script).includes("priority"));
  for (const fn of ["rownum(", "fill_down(", "lag(", "lead(", "running_sum(", "iserror(", "try("]) assert.ok(labels(fn.slice(0, 3)).includes(fn), fn);
  assert.deepEqual(findHints("cards group by list pivot priority count transpose header", script), []);
});

test("scopes: cards in board / list, qualified paths and shared list names", () => {
  const scoped: KqlSchema = {
    ...script,
    boardScopes: [{ name: "Tablero QA", id: "b1" }, { name: "Soporte", id: "b2" }],
    listScopes: [{ name: "En QA", board: "Tablero QA", id: "l1" }, { name: "En QA", board: "Soporte", id: "l2" }, { name: "Hecho", board: "Tablero QA", id: "l3" }],
    lists: ["En QA", "Hecho"],
  };
  const first = suggest("cards in ", 9, scoped).items;
  assert.ok(first.some((i) => i.label === "board") && first.some((i) => i.label === "list"));
  assert.ok(first.some((i) => i.label === "En QA — Soporte" && i.insert === '"Soporte / En QA"'), "lists show their board and insert the qualified path");
  assert.deepEqual(suggest("cards in board ", 15, scoped).items.map((i) => i.label), ["Tablero QA", "Soporte"]);
  assert.ok(suggest("cards in list ", 14, scoped).items.some((i) => i.insert === '"Tablero QA / Hecho"'));
  assert.ok(suggest("cards where list = ", 19, scoped).items.some((i) => i.label === "Soporte / En QA"), "shared names offer the qualified path");
  assert.ok(!suggest("cards where list = ", 19, scoped).items.some((i) => i.label === "Tablero QA / Hecho"), "unique names stay plain");
  const hints = findHints('list = "En QA"', scoped);
  assert.ok(hints.some((h) => h.level === "info" && /exists in 2 boards/.test(h.message) && /Tablero QA \/ En QA/.test(h.message)));
  assert.deepEqual(findHints('list = "Soporte / En QA"', scoped), [], "a qualified path is not a typo");
  const built = buildKqlSchema({
    mode: "script",
    cards: [{ id: "1", title: "a", board: "B", list: "L", fields: { board_id: "b9", list_id: "l9" } }],
    scopes: { boards: [{ id: "b8", name: "Vacío" }], lists: [{ id: "l8", name: "Nada", boardId: "b8" }] },
  });
  assert.deepEqual(built.boardScopes?.map((b) => b.name), ["B", "Vacío"]);
  assert.deepEqual(built.listScopes?.map((l) => `${l.board}/${l.name}`), ["B/L", "Vacío/Nada"], "empty boards and lists are included");
});

test("select offers * and, after it, except", () => {
  const afterSelect = labels("cards select ", script);
  assert.ok(afterSelect.includes("*") && afterSelect.includes("title") && afterSelect.includes("lower("));
  const afterStar = labels("cards select * ", script);
  assert.ok(afterStar[0] === "except" && afterStar.includes("limit"));
  assert.ok(labels("cards select title, *  ", script).includes("except"));
  assert.deepEqual(findHints("cards select * except (title) limit 5", script), []);
});

test("expressions: catalog detail, Power Query names, parameters, user functions, operators", () => {
  const upper = suggest("Text.U", 6, script).items.find((i) => i.label === "Text.Upper(");
  assert.ok(upper && upper.insert === "Text.Upper(" && /Power Query/.test(upper.detail ?? ""), "Text.U offers Text.Upper(");
  assert.ok(!labels("up", script).includes("Text.Upper("), "M names only appear when the typed prefix matches them");
  const lower = suggest("low", 3, script).items.find((i) => i.label === "lower(");
  assert.ok(lower && /^Text · lower\(text\)/.test(lower.detail ?? ""), "category and signature as detail");
  assert.ok(labels("addd", script).includes("addDays("));
  const text = 'param minimo = 100\nparam estado = "Pagado"\nfn conigv(x) = x * 1.18\nrows of "Ventas" where Monto > ';
  assert.deepEqual(declarationsOf(text), { params: [{ name: "minimo", value: "100" }, { name: "estado", value: '"Pagado"' }], functions: [{ name: "conigv", args: ["x"] }] });
  const dollar = suggest(text + "$", text.length + 1, script).items;
  assert.deepEqual(dollar.map((i) => i.label), ["$minimo", "$estado"]);
  assert.equal(suggest(text + "$mi", text.length + 3, script).items[0].insert, "$minimo");
  const fnItem = suggest(text.replace("Monto > ", "conig"), text.length - 8 + 5, script).items.find((i) => i.label === "conigv(");
  assert.ok(fnItem && /your function/.test(fnItem.detail ?? "") && /x/.test(fnItem.detail ?? ""), "user functions with their arguments");
  assert.ok(labels("param minimo = 1\n", script).includes("param") && labels("", script).includes("fn"), "param / fn at the start of a statement");
  assert.ok(labels("values", script).includes("values") || suggest("from ", 5, script).items.some((i) => i.label === "values"));
  const ops = labels("points ", script);
  for (const o of ["+", "-", "*", "/", "%", "&"]) assert.ok(ops.includes(o), o);
  assert.deepEqual(findHints("param n = 1\nrows of \"V\" select Text.Upper(x) limit $n then else", script).filter((h) => /Upper|limit/.test(h.message)), []);
  assert.deepEqual(findHints('cards select if points > 4 then "a" else "b"', script), []);
});

test("the words of multi-word keywords are not flagged as typos ('order' is not 'owner')", () => {
  const schema = buildKqlSchema({ mode: "script" });
  for (const text of ["cards order by due", "cards group by list count", "cards select distinct list", "cards order by due desc limit 3"]) {
    assert.deepEqual(findHints(text, schema).map((h) => h.message), [], text);
  }
  // a real typo is still caught
  assert.ok(findHints("cards ordr by due", schema).some((h) => /ordr/.test(h.message)));
});
