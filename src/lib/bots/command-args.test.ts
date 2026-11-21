import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeArgs, checkSlashInput, coerceOption, parseInvocation, splitSlash, tokenize } from "./command-args.ts";
import type { CommandOption } from "./options.ts";

const o = (name: string, type: CommandOption["type"], extra: Partial<CommandOption> = {}): CommandOption => ({ name, description: "", type, ...extra });
const UUID = "123e4567-e89b-42d3-a456-426614174000";

test("tokenize: quotes, escapes, mentions as one token, key:value only for known keys", () => {
  const t = tokenize(`a "b c" 'd\\'e' @[Ana Maria](u1) nombre:Ana url:https://x`, new Set(["nombre"]));
  assert.deepEqual(t.tokens.map((x) => x.value), ["a", "b c", "d'e", "@[Ana Maria](u1)", "Ana", "url:https://x"]);
  assert.equal(t.tokens[4].key, "nombre");
  assert.equal(t.tokens[5].key, undefined);
  assert.equal(tokenize(`"open`).error, "unclosed_quote");
});

test("coerce: integer / number / boolean with ranges", () => {
  assert.deepEqual(coerceOption(o("n", "integer", { min: 1, max: 5 }), "3"), { value: 3 });
  assert.deepEqual((coerceOption(o("n", "integer", { min: 1 }), "0") as any).error.code, "min");
  assert.equal((coerceOption(o("n", "integer"), "1.5") as any).error.code, "integer");
  assert.deepEqual(coerceOption(o("n", "number"), "1.5"), { value: 1.5 });
  assert.deepEqual(coerceOption(o("b", "boolean"), "Sí"), { value: true });
  assert.deepEqual(coerceOption(o("b", "boolean"), "off"), { value: false });
  assert.equal((coerceOption(o("b", "boolean"), "quizas") as any).error.code, "boolean");
});

test("coerce: string lengths and choices by value or name", () => {
  assert.equal((coerceOption(o("s", "string", { minLength: 3 }), "ab") as any).error.code, "min_length");
  assert.equal((coerceOption(o("s", "string", { maxLength: 3 }), "abcd") as any).error.code, "max_length");
  const tone = o("t", "string", { choices: [{ name: "Formal", value: "formal" }, { name: "Casual", value: "casual" }] });
  assert.deepEqual(coerceOption(tone, "FORMAL"), { value: "formal" });
  assert.deepEqual(coerceOption(tone, "casual"), { value: "casual" });
  assert.equal((coerceOption(tone, "otro") as any).error.code, "choice");
  assert.deepEqual(coerceOption(o("n", "integer", { choices: [{ name: "Uno", value: 1 }] }), "uno"), { value: 1 });
});

test("coerce: user, role, channel, attachment accept only their mention forms", () => {
  assert.deepEqual(coerceOption(o("u", "user"), "@[Ana](u123456)"), { value: "u123456" });
  assert.equal((coerceOption(o("u", "user"), "@[Rol](role:r1)") as any).error.code, "user_kind");
  assert.equal((coerceOption(o("u", "user"), "@[x](everyone)") as any).error.code, "user_kind");
  assert.equal((coerceOption(o("u", "user"), "ana") as any).error.code, "user");
  assert.deepEqual(coerceOption(o("r", "role"), "@[Admins](role:r1)"), { value: "r1" });
  assert.equal((coerceOption(o("r", "role"), "@[Ana](u1)") as any).error.code, "role");
  assert.deepEqual(coerceOption(o("c", "channel"), `#[general](${UUID})`), { value: UUID });
  assert.deepEqual(coerceOption(o("c", "channel"), UUID), { value: UUID });
  assert.equal((coerceOption(o("c", "channel"), "#general") as any).error.code, "channel");
  assert.deepEqual(coerceOption(o("a", "attachment"), "https://x.test/f.png"), { value: "https://x.test/f.png" });
  assert.equal((coerceOption(o("a", "attachment"), "http://x") as any).error.code, "attachment");
});

test("parseInvocation: positional, key:value, the last string takes the rest of the text", () => {
  const defs = [o("nombre", "string", { required: true }), o("tono", "string", { choices: [{ name: "Formal", value: "formal" }] })];
  const ok = parseInvocation("hola", "Ana formal", defs);
  assert.ok(ok.ok && ok.invocation.options.nombre === "Ana" && ok.invocation.options.tono === "formal");
  const named = parseInvocation("hola", "tono:formal nombre:Ana", defs);
  assert.ok(named.ok && named.invocation.options.nombre === "Ana");
  const rest = parseInvocation("decir", "hola a todos los demas", [o("texto", "string", { required: true })]);
  assert.ok(rest.ok && rest.invocation.options.texto === "hola a todos los demas");
});

test("parseInvocation reports required, unknown, twice, extra and the usage line", () => {
  const defs = [o("nombre", "string", { required: true }), o("n", "integer")];
  const miss = parseInvocation("hola", "", defs);
  assert.ok(!miss.ok && miss.errors[0].code === "required" && miss.usage === "/hola <nombre> [n]");
  const bad = parseInvocation("hola", "x:1 nombre:A nombre:B", defs);
  assert.ok(!bad.ok && bad.errors.some((e) => e.code === "given_twice"));
  const extra = parseInvocation("hola", `"A" 1 "sobra"`, defs);
  assert.ok(!extra.ok && extra.errors.some((e) => e.code === "extra_argument"));
  const unknown = parseInvocation("hola", "nombre:A", [o("nombre", "string"), o("otro", "string")]);
  assert.ok(unknown.ok);
});

test("parseInvocation with subcommands and groups", () => {
  const defs: CommandOption[] = [
    { name: "add", description: "", type: "subcommand", options: [o("x", "integer", { required: true })] },
    { name: "cfg", description: "", type: "subcommand_group", options: [{ name: "set", description: "", type: "subcommand", options: [o("v", "boolean")] }] },
  ];
  const a = parseInvocation("c", "add 5", defs);
  assert.ok(a.ok && a.invocation.subcommand === "add" && a.invocation.options.x === 5);
  const g = parseInvocation("c", "cfg set yes", defs);
  assert.ok(g.ok && g.invocation.subcommandGroup === "cfg" && g.invocation.subcommand === "set" && g.invocation.options.v === true);
  const none = parseInvocation("c", "", defs);
  assert.ok(!none.ok && none.errors[0].code === "choose_one" && none.errors[0].params?.list === "add, cfg");
  const half = parseInvocation("c", "cfg", defs);
  assert.ok(!half.ok && half.errors[0].option === "cfg");
});

test("checkSlashInput validates only commands with options (old prefix commands take free text)", () => {
  const defs = [{ name: "hola", options: [o("nombre", "string", { required: true })] }, { name: "viejo", options: [] }];
  assert.equal(checkSlashInput("hola algo", [...defs]), null);
  assert.equal(checkSlashInput("/viejo lo que sea", defs), null);
  assert.equal(checkSlashInput("/desconocido x", defs), null);
  assert.equal(checkSlashInput("no es comando", defs), null);
  const bad = checkSlashInput("/hola", defs);
  assert.ok(bad && bad.errors[0].code === "required" && bad.usage === "/hola <nombre>");
  assert.equal(checkSlashInput("/hola Ana", defs), null);
  assert.deepEqual(splitSlash("/Hola  a b"), { name: "hola", args: "a b" });
});

test("two bots with the same command name: valid if any definition accepts the call", () => {
  const defs = [{ name: "x", options: [o("a", "integer", { required: true })] }, { name: "x", options: [o("b", "string", { required: true })] }];
  assert.equal(checkSlashInput("/x hola", defs), null);
});

test("analyzeArgs: subcommands first, then options, with filtering", () => {
  const defs: CommandOption[] = [
    { name: "add", description: "Add one", type: "subcommand", options: [o("x", "integer", { required: true })] },
    { name: "remove", description: "", type: "subcommand", options: [] },
  ];
  const first = analyzeArgs("c", defs, "");
  assert.deepEqual(first.suggestions.map((s) => s.label), ["add", "remove"]);
  const filtered = analyzeArgs("c", defs, "re");
  assert.deepEqual(filtered.suggestions.map((s) => s.label), ["remove"]);
  assert.equal(filtered.partialLength, 2);
  const inside = analyzeArgs("c", defs, "add ");
  assert.deepEqual(inside.path, ["add"]);
  assert.equal(inside.expecting?.name, "x");
});

test("analyzeArgs: choices, booleans, people, roles, channels", () => {
  const people = { users: [{ id: "u1", name: "Ana" }, { id: "u2", name: "Beto" }], roles: [{ id: "r1", name: "Admins" }], rooms: [{ id: UUID, name: "general" }] };
  const tone = [o("tono", "string", { choices: [{ name: "Formal", value: "formal" }, { name: "Casual", value: "casual" }] })];
  assert.deepEqual(analyzeArgs("c", tone, "", people).suggestions.filter((s) => s.kind === "choice").map((s) => s.insert), ["formal", "casual"]);
  assert.deepEqual(analyzeArgs("c", tone, "cas", people).suggestions.filter((s) => s.kind === "choice").map((s) => s.label), ["Casual"]);
  assert.deepEqual(analyzeArgs("c", [o("b", "boolean")], "t").suggestions.map((s) => s.insert), ["true"]);
  assert.deepEqual(analyzeArgs("c", [o("u", "user")], "", people).suggestions.map((s) => s.insert), ["@[Ana](u1)", "@[Beto](u2)"]);
  assert.deepEqual(analyzeArgs("c", [o("u", "user")], "@be", people).suggestions.map((s) => s.label), ["Beto"]);
  assert.deepEqual(analyzeArgs("c", [o("r", "role")], "", people).suggestions.map((s) => s.insert), ["@[Admins](role:r1)"]);
  assert.deepEqual(analyzeArgs("c", [o("c", "channel")], "", people).suggestions.map((s) => s.insert), [`#[general](${UUID})`]);
});

test("analyzeArgs: after key: the value of that option is offered, and the second positional follows the first", () => {
  const defs = [o("nombre", "string"), o("tono", "string", { choices: [{ name: "Formal", value: "formal" }] })];
  const named = analyzeArgs("c", defs, "tono:");
  assert.equal(named.expecting?.name, "tono");
  assert.deepEqual(named.suggestions.map((s) => s.insert), ["tono:formal"]);
  const second = analyzeArgs("c", defs, "Ana ");
  assert.equal(second.expecting?.name, "tono");
  const done = analyzeArgs("c", defs, "Ana formal ");
  assert.equal(done.expecting, null);
  assert.deepEqual(done.suggestions, []);
  assert.equal(analyzeArgs("c", defs, `"abc`).suggestions.length, 0);
});

test("nothing is offered once the typed token already is one of the choices", () => {
  const tone = [o("tono", "string", { choices: [{ name: "Formal", value: "formal" }, { name: "Casual", value: "casual" }] })];
  assert.deepEqual(analyzeArgs("c", tone, "casual").suggestions, []);
  assert.deepEqual(analyzeArgs("c", tone, "tono:Formal").suggestions, []);
  assert.equal(analyzeArgs("c", tone, "cas").suggestions.length, 1);
  assert.deepEqual(analyzeArgs("c", [o("b", "boolean")], "true").suggestions, []);
});

test("choices with spaces are quoted when inserted", () => {
  const defs = [o("t", "string", { choices: [{ name: "Muy formal", value: "muy formal" }] })];
  assert.equal(analyzeArgs("c", defs, "").suggestions[0].insert, `"muy formal"`);
});
