import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MODAL_LIMITS, blankModal, blankPicker, blankToggle, componentsPayload, isSelectLike, modalPayload, modalSubmitBody, readComponentRows, readModal, readPickerItems, toRows, toggleValues,
  validPick, validateComponents, validateModal, validateModalFields,
} from "./components.ts";

const codes = (rows: unknown, expires?: unknown, blocks?: unknown[]) => validateComponents(rows, expires, blocks).map((i) => `${i.at.join(".")}:${i.code}`);
const select = (type: string, extra: Record<string, unknown> = {}) => ({ type, customId: `${type}_1`, ...extra });

test("pickers and toggles are valid components", () => {
  assert.deepEqual(codes([
    [select("user_select", { placeholder: "Personas", minValues: 0, maxValues: 5 })],
    [select("role_select", { selfAssignableOnly: true })],
    [select("channel_select")],
    [select("mentionable_select", { maxValues: 25 })],
    [{ type: "toggle", customId: "t1", label: "Avisos", checked: true }, { type: "button", label: "Ok", style: "primary", customId: "b1" }],
  ]), []);
});

test("every select takes a whole row, toggles share it with buttons (max 5)", () => {
  assert.deepEqual(codes([[select("user_select"), { type: "button", label: "x", style: "primary", customId: "b" }]]), ["0:select_alone"]);
  assert.deepEqual(codes([[select("role_select"), select("channel_select")]]), ["0:select_alone"]);
  const five = Array.from({ length: 5 }, (_, i) => ({ type: "toggle", customId: `t${i}`, label: "x" }));
  assert.deepEqual(codes([five]), []);
  assert.deepEqual(codes([[...five, { type: "button", label: "x", style: "primary", customId: "six" }]]), ["0:too_many_buttons"]);
  assert.equal(codes(Array.from({ length: 6 }, (_, i) => [select("user_select", { customId: `u${i}` })])).includes(":too_many_rows"), true);
});

test("picker limits: customId pattern and uniqueness, min / max values", () => {
  assert.deepEqual(codes([[select("user_select", { customId: "bad id" })]]), ["0.0:custom_id_invalid"]);
  assert.deepEqual(codes([[select("user_select", { customId: "x".repeat(101) })]]), ["0.0:custom_id_invalid"]);
  assert.deepEqual(codes([[{ type: "user_select" }]]), ["0.0:custom_id_required"]);
  assert.deepEqual(codes([[select("user_select", { customId: "a" })], [select("role_select", { customId: "a" })]]), ["1.0:custom_id_duplicate"]);
  assert.deepEqual(codes([[select("user_select", { maxValues: 26 })]]), ["0.0:values_range"]);
  assert.deepEqual(codes([[select("user_select", { minValues: 3, maxValues: 2 })]]), ["0.0:values_range"]);
  assert.deepEqual(codes([[select("user_select", { minValues: -1 })]]), ["0.0:values_range"]);
  assert.deepEqual(codes([[select("user_select", { placeholder: "x".repeat(151) })]]), ["0.0:placeholder_long"]);
});

test("toggle needs a label and a customId", () => {
  assert.deepEqual(codes([[{ type: "toggle", customId: "t" }]]), ["0.0:label_required"]);
  assert.deepEqual(codes([[{ type: "toggle", label: "x" }]]), ["0.0:custom_id_required"]);
});

test("string_select is accepted as an alias of select", () => {
  assert.deepEqual(codes([[{ type: "string_select", customId: "s", options: [{ label: "a", value: "a" }] }]]), []);
  const rows = readComponentRows([[{ type: "string_select", customId: "s", options: [{ label: "a", value: "a" }] }]]);
  assert.equal(rows[0].components[0].type, "select");
});

test("the buttons that live in a section share the customId space of the message", () => {
  const blocks = [{ type: "section", text: "a", accessory: { type: "button", label: "x", style: "primary", customId: "dup" } }];
  assert.deepEqual(codes([[{ type: "button", label: "y", style: "primary", customId: "dup" }]], undefined, blocks), ["0.0:custom_id_duplicate"]);
  assert.deepEqual(codes([[{ type: "button", label: "y", style: "primary", customId: "other" }]], undefined, blocks), []);
});

test("link buttons keep their rules: https url, no customId", () => {
  assert.deepEqual(codes([[{ type: "button", label: "x", style: "link", url: "http://x.test" }]]), ["0.0:link_url"]);
  assert.deepEqual(codes([[{ type: "button", label: "x", style: "link", url: "https://x.test", customId: "a" }]]), ["0.0:link_custom_id"]);
  assert.deepEqual(codes([[{ type: "button", label: "x", style: "link", url: "https://x.test" }]]), []);
});

test("reader: old rows (buttons, one select) are read exactly as before", () => {
  const stored = [
    { components: [{ type: "button", label: "A", style: "success", customId: "a" }, { type: "button", label: "B", style: "secondary", customId: "b", emoji: "🎉" }] },
    { components: [{ type: "select", customId: "s", placeholder: "p", options: [{ label: "x", value: "x" }, { label: "y", value: "y", description: "d" }], minValues: 1, maxValues: 2 }] },
  ];
  const rows = readComponentRows(stored);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].components.length, 2);
  assert.equal(rows[0].components[1].type === "button" && rows[0].components[1].emoji, "🎉");
  const sel = rows[1].components[0];
  assert.equal(sel.type, "select");
  assert.equal(sel.type === "select" && sel.maxValues, 2);
});

test("reader: new components, hostile rows and unknown types", () => {
  const rows = readComponentRows([
    [{ type: "role_select", customId: "r", maxValues: 99, minValues: 7 }],
    [{ type: "toggle", customId: "t", label: "x", checked: true }, { type: "teleport", customId: "z" }],
    [{ type: "user_select", customId: "u" }, { type: "button", label: "no", style: "primary", customId: "n" }],
    [{ type: "mystery" }],
    "nope",
  ]);
  assert.equal(rows.length, 3);
  const pick = rows[0].components[0];
  assert.equal(pick.type === "role_select" && pick.maxValues, 25);
  assert.equal(pick.type === "role_select" && pick.minValues <= pick.maxValues, true);
  assert.equal(rows[1].components.length, 1);
  assert.equal(rows[2].components.length, 1, "a select keeps its row to itself");
  assert.equal(isSelectLike(rows[2].components[0]), true);
});

test("payload keeps only what was set", () => {
  const rows = componentsPayload(toRows([[{ ...blankPicker("role_select", 0), placeholder: " ", selfAssignableOnly: true }], [{ ...blankToggle(0), label: "x", checked: false }]]));
  assert.deepEqual(rows[0].components[0], { type: "role_select", customId: "role_1", minValues: 1, maxValues: 1, selfAssignableOnly: true });
  assert.deepEqual(rows[1].components[0], { type: "toggle", customId: "toggle_1", label: "x" });
  const user = componentsPayload([{ components: [{ ...blankPicker("user_select", 0), selfAssignableOnly: true }] }]);
  assert.equal("selfAssignableOnly" in user[0].components[0], false, "only role selects carry it");
});

test("picker selection and toggle values", () => {
  assert.deepEqual(validPick({ minValues: 1, maxValues: 2 }, ["a", "a", "b"]), ["a", "b"]);
  assert.equal(validPick({ minValues: 1, maxValues: 1 }, []), null);
  assert.equal(validPick({ minValues: 0, maxValues: 1 }, [])?.length, 0);
  assert.equal(validPick({ minValues: 1, maxValues: 1 }, ["a", "b"]), null);
  assert.deepEqual(toggleValues(true), ["true"]);
  assert.deepEqual(toggleValues(false), ["false"]);
});

test("picker items: only the documented shape, max 100, colors validated", () => {
  const items = readPickerItems({ items: [
    { id: "1", name: "Ana", kind: "user", avatarUrl: "https://x.test/a.png" },
    { id: "2", name: "Mods", kind: "role", color: "#ff0000" },
    { id: "3", name: "general", kind: "channel" },
    { id: "4", name: "x", kind: "ghost" },
    { name: "no id", kind: "user" },
    { id: "5", name: "Bad", kind: "role", color: "red" },
  ] });
  assert.deepEqual(items.map((i) => i.id), ["1", "2", "3", "5"]);
  assert.equal(items[3].color, undefined);
  assert.equal(readPickerItems({ items: Array.from({ length: 150 }, (_, i) => ({ id: String(i), name: "n", kind: "user" })) }).length, 100);
  assert.deepEqual(readPickerItems("nope"), []);
});

/* ── modal ── */

const modal = () => ({ customId: "feedback", title: "Opinión", inputs: [{ customId: "asunto", label: "Asunto", style: "short" }, { customId: "texto", label: "Texto", style: "paragraph", placeholder: "…", required: false, minLength: 5, maxLength: 1000 }] });
const mcodes = (m: unknown) => validateModal(m).map((i) => `${i.at.join(".")}:${i.code}`);

test("a valid modal", () => {
  assert.deepEqual(mcodes(modal()), []);
  assert.deepEqual(mcodes(undefined), []);
});

test("modal limits: title, inputs, ids, lengths", () => {
  assert.ok(mcodes({ ...modal(), customId: "" }).includes(":custom_id_required"));
  assert.ok(mcodes({ ...modal(), customId: "a b" }).includes(":custom_id_invalid"));
  assert.ok(mcodes({ ...modal(), title: "" }).includes(":title_required"));
  assert.ok(mcodes({ ...modal(), title: "x".repeat(46) }).includes(":title_long"));
  assert.ok(mcodes({ ...modal(), submitLabel: "x".repeat(31) }).includes(":submit_long"));
  assert.ok(mcodes({ ...modal(), inputs: [] }).includes(":inputs_range"));
  const six = Array.from({ length: 6 }, (_, i) => ({ customId: `i${i}`, label: "x" }));
  assert.ok(mcodes({ ...modal(), inputs: six }).includes(":inputs_range"));
  assert.deepEqual(mcodes({ ...modal(), inputs: [{ customId: "a", label: "x" }, { customId: "a", label: "y" }] }), ["1:input_duplicate"]);
  assert.deepEqual(mcodes({ ...modal(), inputs: [{ customId: "a", label: "x".repeat(46) }] }), ["0:input_label"]);
  assert.deepEqual(mcodes({ ...modal(), inputs: [{ customId: "a", label: "x", style: "rich" }] }), ["0:input_style"]);
  assert.deepEqual(mcodes({ ...modal(), inputs: [{ customId: "a", label: "x", style: "short", maxLength: 401 }] }), ["0:input_length"]);
  assert.deepEqual(mcodes({ ...modal(), inputs: [{ customId: "a", label: "x", style: "paragraph", maxLength: 4000 }] }), []);
  assert.deepEqual(mcodes({ ...modal(), inputs: [{ customId: "a", label: "x", style: "paragraph", maxLength: 4001 }] }), ["0:input_length"]);
  assert.deepEqual(mcodes({ ...modal(), inputs: [{ customId: "a", label: "x", minLength: 9, maxLength: 3 }] }), ["0:input_length"]);
  assert.deepEqual(mcodes({ ...modal(), inputs: [{ customId: "a", label: "x", placeholder: "x".repeat(101) }] }), ["0:input_placeholder"]);
  assert.equal(MODAL_LIMITS.maxInputs, 5);
});

test("modal payload drops empty optionals; blank modal is incomplete but well-formed", () => {
  const p = modalPayload({ ...blankModal(), title: "T", submitLabel: " ", inputs: [{ customId: "a", label: "A", style: "short", required: true, placeholder: " " }] });
  assert.deepEqual(p, { customId: "modal_1", title: "T", inputs: [{ customId: "a", label: "A", style: "short", required: true }] });
  assert.deepEqual(mcodes(blankModal()).sort(), [":title_required", "0:input_label"].sort());
});

test("reader of metadata.modal: tolerant, clamps lengths, null when unusable", () => {
  const m = readModal({ ...modal(), expiresAt: "2030-01-01T00:00:00Z", inputs: [...modal().inputs, { customId: "x", label: "L", style: "short", maxLength: 99999 }, { nope: true }] });
  assert.ok(m);
  assert.equal(m!.inputs.length, 3);
  assert.equal(m!.inputs[2].maxLength, 400);
  assert.equal(m!.inputs[1].required, false);
  assert.equal(m!.expiresAt, "2030-01-01T00:00:00Z");
  assert.equal(readModal(null), null);
  assert.equal(readModal({ customId: "a", title: "t", inputs: [] }), null);
  assert.equal(readModal({ title: "t", inputs: [{ customId: "a", label: "x" }] }), null);
});

test("what the person typed is checked against the definition (required, min, max)", () => {
  const def = readModal(modal())!;
  assert.deepEqual(validateModalFields(def, { asunto: "Hola", texto: "" }), {});
  assert.deepEqual(validateModalFields(def, { asunto: "  ", texto: "" }), { asunto: "required" });
  assert.deepEqual(validateModalFields(def, { asunto: "ok", texto: "abc" }), { texto: "min" });
  assert.deepEqual(validateModalFields(def, { asunto: "x".repeat(401), texto: "" }), { asunto: "max" });
  assert.deepEqual(validateModalFields(def, { asunto: "ok", texto: "x".repeat(1001) }), { texto: "max" });
});

test("submit body: only the declared inputs, trimmed", () => {
  const def = readModal(modal())!;
  assert.deepEqual(modalSubmitBody(def, { asunto: "  Hola ", texto: "", extra: "boo" }), { fields: { asunto: "Hola", texto: "" } });
});
