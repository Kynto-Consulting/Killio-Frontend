import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_QUERY_LENGTH, absorb, applySuggestion, canSearch, chipProblem, chipsFromFilters, emptyModel, isTooLong, makeChip, parseQuery, parseRecent,
  pushRecent, quickDates, reconcileChips, removeChip, removeRecent, serializeChip, serializeQuery, suggest, toggleNegation, tokenAtCaret, tokenize,
  type ServerFilters, type SuggestionSources,
} from "./search-query.ts";

const NOW = new Date("2026-11-21T12:00:00Z");
const src: SuggestionSources = {
  scope: "team",
  members: [{ id: "u1", name: "Ana Pérez", email: "ana@x.io" }, { id: "u2", name: "Luis", email: "luis@x.io" }],
  roles: [{ id: "r1", name: "Admins" }],
  rooms: [{ id: "c1", name: "general" }, { id: "c2", name: "diseño web" }],
  now: NOW,
};

test("tokenize: words, phrases, negations and operators with positions", () => {
  const t = tokenize('hola "frase exacta" -mala from:ana -in:general');
  assert.equal(t.length, 5);
  assert.equal(t[1].quoted, true);
  assert.equal(t[1].value, "frase exacta");
  assert.equal(t[2].negated, true);
  assert.equal(t[2].key, null);
  assert.equal(t[3].key, "from");
  assert.equal(t[3].value, "ana");
  assert.equal(t[4].key, "in");
  assert.equal(t[4].negated, true);
});

test("tokenize: quoted operator values, aliases and non-operators", () => {
  const t = tokenize('de:"Ana Pérez" 12:30 http://x.io from: foo');
  assert.equal(t[0].key, "from");
  assert.equal(t[0].value, "Ana Pérez");
  assert.equal(t[0].quoted, true);
  assert.equal(t[1].key, null, "12:30 stays text");
  assert.equal(t[2].key, null, "a url stays text");
  assert.equal(t[3].key, null, "`from:` without a value is text");
});

test("parseQuery: operators become chips, the rest stays as text (aliases normalised)", () => {
  const m = parseQuery('hola tiene:enlace de:ana antes:2026-01-31 -menciona:luis "dos palabras" -nada');
  assert.deepEqual(m.chips, [
    { key: "has", value: "link", negated: false },
    { key: "from", value: "ana", negated: false },
    { key: "before", value: "2026-01-31", negated: false },
    { key: "mentions", value: "luis", negated: true },
  ]);
  assert.equal(m.text, 'hola "dos palabras" -nada');
});

test("parseQuery: duplicates collapse, case and accents are ignored when comparing", () => {
  const m = parseQuery("from:Ana from:ana has:links has:LINK");
  assert.equal(m.chips.length, 2);
});

test("makeChip: normalises is / pinned / has values and rejects empties", () => {
  assert.deepEqual(makeChip("es", "bots"), { key: "is", value: "bot", negated: false });
  assert.deepEqual(makeChip("fijado", "si"), { key: "pinned", value: "true", negated: false });
  assert.deepEqual(makeChip("tiene", "imagenes"), { key: "has", value: "image", negated: false });
  assert.equal(makeChip("from", "  "), null);
  assert.equal(makeChip("zzz", "x"), null);
  assert.deepEqual(makeChip("from", "@ana"), { key: "from", value: "ana", negated: false });
});

test("serialize: chips first, quotes for spaces, negation prefix; parse(serialize(x)) is stable", () => {
  const model = { text: 'hola "x y"', chips: [{ key: "from" as const, value: "Ana Pérez", negated: false }, { key: "in" as const, value: "general", negated: true }, { key: "pinned" as const, value: "true", negated: false }] };
  const q = serializeQuery(model);
  assert.equal(q, 'from:"Ana Pérez" -in:general pinned:true hola "x y"');
  assert.deepEqual(parseQuery(q), model);
  assert.equal(serializeChip({ key: "has", value: "file", negated: true }), "-has:file");
});

test("absorb: the word being typed stays in the text until it is finished", () => {
  const a = absorb("hola from:an", emptyModel(), true);
  assert.deepEqual(a.chips, []);
  assert.equal(a.text, "hola from:an");
  const b = absorb("hola from:ana ", emptyModel(), true);
  assert.equal(b.chips.length, 1);
  assert.equal(b.text, "hola");
  const c = absorb("has:file", { text: "", chips: [{ key: "from", value: "ana", negated: false }] }, false);
  assert.equal(c.chips.length, 2);
});

test("removeChip / toggleNegation", () => {
  const m = parseQuery("from:ana pinned:true has:file");
  assert.equal(removeChip(m, 0).chips.length, 2);
  assert.equal(toggleNegation(m, 0).chips[0].negated, true);
  assert.equal(toggleNegation(m, 1).chips[1].negated, false, "pinned cannot be negated");
});

test("length limit mirrors the server (300)", () => {
  assert.equal(isTooLong({ text: "a".repeat(MAX_QUERY_LENGTH), chips: [] }), false);
  assert.equal(isTooLong({ text: "a".repeat(MAX_QUERY_LENGTH + 1), chips: [] }), true);
  assert.equal(canSearch(emptyModel()), false);
  assert.equal(canSearch({ text: "", chips: [{ key: "pinned", value: "true", negated: false }] }), true, "a filter alone is a search");
  assert.equal(canSearch({ text: "-spam", chips: [] }), true, "an exclusion alone is allowed");
});

test("chipProblem: mirrors the server warnings", () => {
  assert.equal(chipProblem({ key: "has", value: "mp3", negated: false }, "team"), "unknown_has_kind");
  assert.equal(chipProblem({ key: "has", value: "file", negated: false }, "team"), null);
  assert.equal(chipProblem({ key: "before", value: "2026-02-30", negated: false }, "team"), "invalid_date");
  assert.equal(chipProblem({ key: "before", value: "2026-02-28", negated: false }, "team"), null);
  assert.equal(chipProblem({ key: "after", value: "7d", negated: false }, "team"), null);
  assert.equal(chipProblem({ key: "during", value: "ayer", negated: false }, "team"), null);
  assert.equal(chipProblem({ key: "during", value: "maniana", negated: false }, "team"), "invalid_date");
  assert.equal(chipProblem({ key: "is", value: "robot", negated: false }, "team"), "invalid_value");
  assert.equal(chipProblem({ key: "thread", value: "nope", negated: false }, "team"), "invalid_thread");
  assert.equal(chipProblem({ key: "in", value: "general", negated: false }, "room"), "ignored_in_room");
  assert.equal(chipProblem({ key: "in", value: "general", negated: false }, "team"), null);
});

const filters = (over: Partial<ServerFilters> = {}): ServerFilters => ({
  from: { include: [], exclude: [] }, mentions: { include: [], exclude: [] }, in: { include: [], exclude: [] }, has: { include: [], exclude: [] },
  after: null, before: null, pinned: null, is: null, thread: null, ...over,
});

test("chipsFromFilters: what the server understood, back as chips", () => {
  const chips = chipsFromFilters(filters({ from: { include: ["ana"], exclude: ["luis"] }, has: { include: ["link"], exclude: [] }, before: "2026-01-02T00:00:00.000Z", pinned: false, is: "bot" }));
  assert.deepEqual(chips.map(serializeChip), ["from:ana", "-from:luis", "has:link", "before:2026-01-02T00:00:00.000Z", "pinned:false", "is:bot"]);
});

test("reconcileChips: warnings by name, and chips the server dropped", () => {
  const chips = parseQuery("from:ana from:nadie -has:file before:7d pinned:true").chips;
  const server = {
    filters: filters({ from: { include: ["ana", "nadie"], exclude: [] }, has: { include: [], exclude: ["file"] }, before: "2026-11-14T12:00:00.000Z" }),
    warnings: [{ operator: "from", value: "nadie", code: "not_found" }],
  };
  const status = reconcileChips(chips, "team", server);
  assert.deepEqual(status.map((s) => s.problem), [null, "not_found", null, null, "dropped"]);
  const before = reconcileChips(chips, "team", null);
  assert.ok(before.every((s) => s.problem === null));
});

test("tokenAtCaret: the word around the caret", () => {
  assert.deepEqual(tokenAtCaret("hola from:an mundo", 12), { start: 5, end: 12, text: "from:an" });
  assert.deepEqual(tokenAtCaret("hola ", 5), { start: 5, end: 5, text: "" });
});

test("suggest: operators for an empty word and for a prefix (aliases too)", () => {
  const empty = suggest("", 0, src);
  assert.ok(empty.some((s) => s.insert === "from:") && empty.some((s) => s.insert === "pinned:true"));
  const f = suggest("fr", 2, src).map((s) => s.insert);
  assert.deepEqual(f, ["from:"]);
  assert.deepEqual(suggest("tie", 3, src).map((s) => s.insert), ["has:"], "the Spanish alias `tiene` suggests `has:`");
});

test("suggest: `in` is not offered when searching one room", () => {
  assert.ok(!suggest("", 0, { ...src, scope: "room" }).some((s) => s.key === "in"));
  assert.deepEqual(suggest("in:ge", 5, { ...src, scope: "room" }), []);
});

test("suggest: values by operator", () => {
  const users = suggest("from:an", 7, src);
  assert.equal(users[0].insert, 'from:"Ana Pérez"');
  assert.equal(users[0].commit, true);
  assert.ok(suggest("from:", 5, src).some((s) => s.insert === "from:me"));
  assert.ok(suggest("mentions:adm", 12, src).some((s) => s.insert === "mentions:Admins"));
  assert.ok(!suggest("from:adm", 8, src).some((s) => s.valueKind === "role"), "roles are for mentions only");
  assert.equal(suggest("in:dis", 6, src)[0].insert, 'in:"diseño web"');
  assert.equal(suggest("-in:gen", 7, src)[0].insert, "-in:general");
  assert.deepEqual(suggest("has:im", 6, src).map((s) => s.insert), ["has:image"]);
  assert.ok(suggest("has:", 4, src).length === 7);
  assert.deepEqual(suggest("before:", 7, src).map((s) => s.insert), ["before:today", "before:yesterday", "before:7d", "before:2w", "before:1mo", "before:1y", "before:2026-11-21"]);
  assert.deepEqual(suggest("is:", 3, src).map((s) => s.insert), ["is:bot", "is:human"]);
  assert.deepEqual(suggest("pinned:", 7, src).map((s) => s.insert), ["pinned:true", "pinned:false"]);
  assert.deepEqual(suggest("-pinned", 7, src), [], "pinned has no negated form");
});

test("suggest: accents and email prefixes match members", () => {
  assert.equal(suggest("from:perez", 10, src)[0]?.insert, 'from:"Ana Pérez"');
  assert.equal(suggest("from:luis", 9, src)[0]?.insert, "from:Luis");
});

test("applySuggestion: replaces the word under the caret; a value commits with a space", () => {
  const s = suggest("hola from:an mundo", 12, src)[0];
  const r = applySuggestion("hola from:an mundo", 12, s);
  assert.equal(r.input, 'hola from:"Ana Pérez" mundo');
  assert.equal(r.caret, 'hola from:"Ana Pérez" '.length);
  const op = suggest("fr", 2, src)[0];
  const r2 = applySuggestion("fr", 2, op);
  assert.equal(r2.input, "from:");
  assert.equal(r2.caret, 5);
});

test("quickDates includes today's ISO date", () => {
  assert.equal(quickDates(NOW).at(-1), "2026-11-21");
});

test("recent searches: parse is defensive; push dedupes, trims and caps", () => {
  assert.deepEqual(parseRecent(null), []);
  assert.deepEqual(parseRecent("{oops"), []);
  assert.deepEqual(parseRecent('["a",3,"","b"]'), ["a", "b"]);
  let list: string[] = [];
  for (let i = 0; i < 12; i += 1) list = pushRecent(list, `q${i}`);
  assert.equal(list.length, 8);
  assert.equal(list[0], "q11");
  assert.deepEqual(pushRecent(["a", "b", "c"], " b "), ["b", "a", "c"]);
  assert.deepEqual(pushRecent(["a"], "   "), ["a"]);
  assert.deepEqual(removeRecent(["a", "b"], "a"), ["b"]);
});

import { committedModel } from "./search-query.ts";

test("committedModel: the operator being typed is not searched yet, a finished one is", () => {
  const typing = committedModel("hola from:an", []);
  assert.equal(typing.text, "hola");
  assert.equal(typing.chips.length, 0);
  const done = committedModel("hola from:ana ", []);
  assert.deepEqual(done.chips, [{ key: "from", value: "ana", negated: false }]);
  assert.equal(done.text, "hola");
  const plain = committedModel("hola mundo", [{ key: "has", value: "file", negated: false }]);
  assert.equal(plain.text, "hola mundo");
  assert.equal(plain.chips.length, 1);
});
