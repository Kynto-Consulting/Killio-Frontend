import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendAt, blankOption, changeOptionType, moveAt, normalizeOptions, optionAt, optionPayload, optionsPayload, previewLines, updateAt, usageOf, validateOptions,
  type CommandOption,
} from "./options.ts";

const codes = (list: CommandOption[]) => validateOptions(list).map((i) => `${i.at.join(".")}:${i.code}${i.choice !== undefined ? `#${i.choice}` : ""}`);
const str = (name: string, extra: Partial<CommandOption> = {}): CommandOption => ({ name, description: "", type: "string", ...extra });

test("valid options pass and the empty list is fine", () => {
  assert.deepEqual(codes([]), []);
  assert.deepEqual(codes([str("nombre", { required: true, maxLength: 40 }), { name: "n", description: "", type: "integer", min: 1, max: 10 }]), []);
});

test("names: lower case 1-32 of [a-z0-9_-], no duplicates (compared normalised)", () => {
  assert.deepEqual(codes([str("Bad Name")]), ["0:name_invalid"]);
  assert.deepEqual(codes([str("")]), ["0:name_invalid"]);
  assert.deepEqual(codes([str("a".repeat(33))]), ["0:name_invalid"]);
  assert.deepEqual(codes([str("ok"), str(" OK ")]), ["1:name_duplicate"]);
});

test("required options must come before optional ones (the backend rejects the other order)", () => {
  assert.deepEqual(codes([str("a"), str("b", { required: true })]), ["1:required_order"]);
  assert.deepEqual(codes([str("a", { required: true }), str("b")]), []);
});

test("at most 25 options per level and 25 choices", () => {
  const many = Array.from({ length: 26 }, (_, i) => str(`o${i}`));
  assert.ok(codes(many).includes(":too_many"));
  const choices = Array.from({ length: 26 }, (_, i) => ({ name: `c${i}`, value: `v${i}` }));
  assert.ok(codes([str("x", { choices })]).includes("0:choices_count"));
});

test("choices: only string / integer / number, exclude min/max, unique values, typed values", () => {
  assert.deepEqual(codes([{ name: "b", description: "", type: "boolean", choices: [{ name: "a", value: "a" }] }]), ["0:choices_count"]);
  assert.deepEqual(codes([str("x", { choices: [{ name: "a", value: "a" }], maxLength: 5 })]), ["0:choices_exclusive"]);
  assert.deepEqual(codes([str("x", { choices: [{ name: "a", value: "v" }, { name: "b", value: "v" }] })]), ["0:choice_duplicate#1"]);
  assert.deepEqual(codes([{ name: "n", description: "", type: "integer", choices: [{ name: "a", value: 1.5 }] }]), ["0:choice_integer#0"]);
  assert.deepEqual(codes([str("x", { choices: [{ name: "", value: "v" }] })]), ["0:choice_name#0"]);
  assert.deepEqual(codes([str("x", { choices: [] })]), ["0:choices_count"]);
});

test("numeric limits: integer needs whole bounds, min <= max, not on other types", () => {
  assert.deepEqual(codes([{ name: "n", description: "", type: "integer", min: 1.5 }]), ["0:minmax_integer"]);
  assert.deepEqual(codes([{ name: "n", description: "", type: "number", min: 5, max: 1 }]), ["0:min_gt_max"]);
});

test("string length limits: whole, 0..4000, minLength <= maxLength, maxLength >= 1", () => {
  assert.deepEqual(codes([str("s", { minLength: 5, maxLength: 2 })]), ["0:length_order"]);
  assert.deepEqual(codes([str("s", { maxLength: 0 })]), ["0:length_zero_max"]);
  assert.deepEqual(codes([str("s", { maxLength: 4001 })]), ["0:length_range"]);
});

test("description of an option is at most 100 characters", () => {
  assert.deepEqual(codes([str("s", { description: "x".repeat(101) })]), ["0:description_long"]);
});

test("subcommands: one level of groups, groups hold only subcommands, subcommands only values, no mixing with plain options", () => {
  const sub = (name: string, options: CommandOption[]): CommandOption => ({ name, description: "", type: "subcommand", options });
  const group = (name: string, options: CommandOption[]): CommandOption => ({ name, description: "", type: "subcommand_group", options });
  assert.deepEqual(codes([sub("add", [str("x")]), sub("rm", [])]), []);
  assert.deepEqual(codes([group("g", [sub("s", [str("x")])])]), []);
  assert.deepEqual(codes([group("g", [])]), ["0:group_empty"]);
  assert.deepEqual(codes([group("g", [str("x")])]), ["0:group_only_subs"]);
  assert.deepEqual(codes([sub("s", [sub("inner", [])])]), ["0.0:sub_nesting", "0:sub_only_values"]);
  assert.deepEqual(codes([sub("s", []), str("plain")]), [":mixed_levels"]);
  assert.deepEqual(codes([group("g", [group("h", [sub("s", [])])])]), ["0.0:sub_nesting", "0:group_only_subs"]);
});

test("normalizeOptions reads server data, aliases `room` to channel and drops garbage", () => {
  const out = normalizeOptions([
    { name: "sala", type: "room", description: "d", required: true },
    { name: "x", type: "weird" },
    null,
    { name: "tono", type: "string", choices: [{ name: "Formal", value: "formal" }, { nope: 1 }] },
    { name: "g", type: "subcommand_group", options: [{ name: "s", type: "subcommand", options: [{ name: "n", type: "integer", min: 1 }] }] },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].type, "channel");
  assert.equal(out[1].choices?.length, 1);
  assert.equal(out[2].options?.[0].options?.[0].min, 1);
  assert.deepEqual(normalizeOptions("nope"), []);
});

test("payload keeps only what applies to the type and normalises names", () => {
  const p = optionPayload({ name: " Nombre ", description: " d ", type: "string", required: true, min: 3, minLength: 2, maxLength: 9 });
  assert.deepEqual(p, { name: "nombre", description: "d", type: "string", required: true, minLength: 2, maxLength: 9 });
  assert.deepEqual(optionPayload({ name: "b", description: "", type: "boolean", min: 1, maxLength: 3 }), { name: "b", description: "", type: "boolean" });
  assert.deepEqual(optionsPayload([{ name: "s", description: "", type: "subcommand", options: [{ name: "a", description: "", type: "integer", min: 1 }] }]), [
    { name: "s", description: "", type: "subcommand", options: [{ name: "a", description: "", type: "integer", min: 1 }] },
  ]);
});

test("payload with choices drops min/max, as the backend demands", () => {
  const p = optionPayload({ name: "x", description: "", type: "string", choices: [{ name: " A ", value: "a" }], maxLength: 5 });
  assert.deepEqual(p.choices, [{ name: "A", value: "a" }]);
  assert.equal(p.maxLength, undefined);
});

test("changing a type keeps choices only when the values convert, and drops foreign limits", () => {
  const withChoices: CommandOption = { name: "x", description: "", type: "string", required: true, choices: [{ name: "one", value: "1" }, { name: "two", value: "2" }] };
  assert.deepEqual(changeOptionType(withChoices, "integer").choices, [{ name: "one", value: 1 }, { name: "two", value: 2 }]);
  const text: CommandOption = { name: "x", description: "", type: "string", choices: [{ name: "a", value: "abc" }] };
  assert.equal(changeOptionType(text, "integer").choices, undefined);
  assert.equal(changeOptionType({ name: "x", description: "", type: "integer", min: 1 }, "string").min, undefined);
  assert.equal(changeOptionType({ name: "x", description: "", type: "integer", min: 1 }, "number").min, 1);
  assert.deepEqual(changeOptionType({ name: "x", description: "", type: "string", required: true }, "subcommand").options, []);
  assert.equal(changeOptionType({ name: "x", description: "", type: "string", required: true }, "boolean").required, true);
});

test("editing helpers are immutable and work at depth", () => {
  const base: CommandOption[] = [{ name: "g", description: "", type: "subcommand_group", options: [{ name: "s1", description: "", type: "subcommand", options: [] }, { name: "s2", description: "", type: "subcommand", options: [] }] }, str("z")];
  const moved = moveAt(base, [0, 1], -1);
  assert.deepEqual(moved[0].options?.map((o) => o.name), ["s2", "s1"]);
  assert.deepEqual(base[0].options?.map((o) => o.name), ["s1", "s2"]);
  assert.deepEqual(moveAt(base, [1], -1).map((o) => o.name), ["z", "g"]);
  assert.deepEqual(moveAt(base, [0], -1).map((o) => o.name), ["g", "z"]);
  assert.equal(appendAt(base, [0, 0], str("p"))[0].options?.[0].options?.length, 1);
  assert.equal(updateAt(base, [0, 1], () => null)[0].options?.length, 1);
  assert.equal(optionAt(base, [0, 1])?.name, "s2");
  assert.equal(optionAt(base, [5]), null);
  assert.equal(blankOption("subcommand", 2).name, "sub3");
});

test("usage line matches the backend's", () => {
  assert.equal(usageOf("hola", [str("nombre", { required: true }), str("tono")]), "/hola <nombre> [tono]");
  const subs: CommandOption[] = [{ name: "add", description: "", type: "subcommand", options: [str("x", { required: true })] }, { name: "rm", description: "", type: "subcommand", options: [] }];
  assert.equal(usageOf("lista", subs), "/lista add|rm");
  assert.equal(usageOf("lista", subs, ["add"]), "/lista add <x>");
});

test("preview lists every invocable form with its constraints", () => {
  const lines = previewLines("hola", [str("nombre", { required: true, maxLength: 40 }), { name: "tono", description: "T", type: "string", choices: [{ name: "Formal", value: "formal" }, { name: "Casual", value: "casual" }] }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].path, "/hola");
  assert.deepEqual(lines[0].args.map((a) => [a.name, a.required, a.summary]), [["nombre", true, "≤ 40"], ["tono", false, "Formal | Casual"]]);
  const subs: CommandOption[] = [{ name: "g", description: "", type: "subcommand_group", options: [{ name: "s", description: "", type: "subcommand", options: [str("a")] }] }, { name: "top", description: "", type: "subcommand", options: [] }];
  assert.deepEqual(previewLines("c", subs).map((l) => l.path), ["/c g s", "/c top"]);
});
