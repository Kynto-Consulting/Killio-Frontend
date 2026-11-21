import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blankButton, blankSelect, componentsPayload, interactErrorKey, isExpired, readComponentRows, toRows, validateComponents, validSelection,
  type ComponentRow, type SelectComponent,
} from "./components.ts";

const codes = (rows: unknown, exp?: unknown) => validateComponents(rows, exp).map((i) => `${i.at.join(".")}:${i.code}`);
const btn = (customId: string, extra: Record<string, unknown> = {}) => ({ type: "button", label: "Ok", style: "primary", customId, ...extra });
const sel = (customId: string, extra: Record<string, unknown> = {}) => ({ type: "select", customId, options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], minValues: 1, maxValues: 1, ...extra });

test("valid rows: up to 5 buttons or one select per row", () => {
  assert.deepEqual(codes([{ components: [btn("a"), btn("b")] }, { components: [sel("s")] }]), []);
  assert.deepEqual(codes(undefined), []);
  assert.deepEqual(codes([]), []);
});

test("limits: 5 rows, 5 buttons per row, a select goes alone", () => {
  const row = (id: string) => ({ components: [btn(id)] });
  assert.ok(codes([row("1"), row("2"), row("3"), row("4"), row("5"), row("6")]).includes(":too_many_rows"));
  assert.ok(codes([{ components: ["a", "b", "c", "d", "e", "f"].map((i) => btn(i)) }]).includes("0:too_many_buttons"));
  assert.ok(codes([{ components: [sel("s"), btn("b")] }]).includes("0:select_alone"));
  assert.deepEqual(codes([{ components: [] }]), ["0:row_empty"]);
});

test("customId: required, pattern, unique across the whole message; templates are not measured", () => {
  assert.deepEqual(codes([{ components: [btn("")] }]), ["0.0:custom_id_required"]);
  assert.deepEqual(codes([{ components: [btn("bad id")] }]), ["0.0:custom_id_invalid"]);
  assert.deepEqual(codes([{ components: [btn("a"), btn("a")] }]), ["0.1:custom_id_duplicate"]);
  assert.deepEqual(codes([{ components: [btn("a")] }, { components: [sel("a")] }]), ["1.0:custom_id_duplicate"]);
  assert.deepEqual(codes([{ components: [btn("vote:{{ invokedBy }}")] }]), []);
});

test("buttons: label required and at most 80, style among the five, link has https url and no customId", () => {
  assert.deepEqual(codes([{ components: [btn("a", { label: "" })] }]), ["0.0:label_required"]);
  assert.deepEqual(codes([{ components: [btn("a", { label: "x".repeat(81) })] }]), ["0.0:label_long"]);
  assert.deepEqual(codes([{ components: [btn("a", { style: "neon" })] }]), ["0.0:style_invalid"]);
  assert.deepEqual(codes([{ components: [{ type: "button", label: "Doc", style: "link", url: "https://x.test" }] }]), []);
  assert.deepEqual(codes([{ components: [{ type: "button", label: "Doc", style: "link", url: "http://x.test" }] }]), ["0.0:link_url"]);
  assert.deepEqual(codes([{ components: [{ type: "button", label: "Doc", style: "link", url: "https://x.test", customId: "a" }] }]), ["0.0:link_custom_id"]);
  assert.deepEqual(codes([{ components: [btn("a", { url: "https://x.test" })] }]), ["0.0:url_extra"]);
});

test("selects: options 1..25 with unique values, minValues / maxValues inside the options", () => {
  assert.deepEqual(codes([{ components: [sel("s", { options: [] })] }]), ["0.0:options_empty", "0.0:values_range"]);
  assert.deepEqual(codes([{ components: [sel("s", { options: [{ label: "A", value: "a" }, { label: "B", value: "a" }] })] }]), ["0.1:option_value_duplicate".replace("0.1", "0.0.1")]);
  assert.deepEqual(codes([{ components: [sel("s", { options: [{ label: "", value: "a" }] })] }]), ["0.0.0:option_label"]);
  assert.deepEqual(codes([{ components: [sel("s", { maxValues: 3 })] }]), ["0.0:values_range"]);
  assert.deepEqual(codes([{ components: [sel("s", { minValues: 2, maxValues: 1 })] }]), ["0.0:values_range"]);
  const many = Array.from({ length: 26 }, (_, i) => ({ label: `L${i}`, value: `v${i}` }));
  assert.ok(codes([{ components: [sel("s", { options: many, maxValues: 1 })] }]).includes("0.0:options_many"));
});

test("expiry in minutes: 1 .. 10080", () => {
  assert.deepEqual(codes([{ components: [btn("a")] }], 0), [":expires_range"]);
  assert.deepEqual(codes([{ components: [btn("a")] }], 10081), [":expires_range"]);
  assert.deepEqual(codes([{ components: [btn("a")] }], 60), []);
  assert.deepEqual(codes([{ components: [btn("a")] }], ""), []);
});

test("blank components are valid once the person fills the required text", () => {
  const rows: ComponentRow[] = [{ components: [{ ...blankButton(0), label: "Si" }] }, { components: [{ ...blankSelect(0), options: [{ label: "A", value: "a" }] }] }];
  assert.deepEqual(codes(rows), []);
  assert.ok(codes([{ components: [blankButton(0)] }]).includes("0.0:label_required"));
});

test("payload drops empty optionals and keeps only the fields of each kind", () => {
  const p = componentsPayload([{ components: [{ type: "button", label: "Doc", style: "link", url: "https://x.test", customId: "ignored", emoji: " " }, { type: "button", label: "Si", style: "danger", customId: "y", url: "ignored", disabled: false }] }, { components: [{ ...blankSelect(0), placeholder: " ", options: [{ label: "A", value: "a", description: " " }] }] }]);
  assert.deepEqual(p[0].components[0], { type: "button", label: "Doc", style: "link", url: "https://x.test" });
  assert.deepEqual(p[0].components[1], { type: "button", label: "Si", style: "danger", customId: "y" });
  assert.deepEqual(p[1].components[0], { type: "select", customId: "select_1", options: [{ label: "A", value: "a" }], minValues: 1, maxValues: 1 });
});

test("toRows accepts both row shapes", () => {
  assert.deepEqual(toRows([[btn("a")], { components: [btn("b")] }]).map((r) => r.components.length), [1, 1]);
  assert.deepEqual(toRows("x"), []);
});

test("reader of stored rows drops unknown pieces and clamps select values", () => {
  const rows = readComponentRows([
    { components: [{ type: "button", label: "A", style: "weird", customId: "a" }, { type: "mystery" }, null] },
    { components: [{ type: "select", customId: "s", options: [{ label: "A", value: "a" }, { nope: 1 }], minValues: 5, maxValues: 9 }] },
    { components: [] },
    "garbage",
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].components.length, 1);
  assert.equal((rows[0].components[0] as any).style, "secondary");
  const s = rows[1].components[0] as SelectComponent;
  assert.deepEqual([s.options.length, s.minValues, s.maxValues], [1, 1, 1]);
});

test("expiry check and error keys", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(isExpired("2025-12-31T23:59:59Z", now), true);
  assert.equal(isExpired("2026-01-01T00:00:01Z", now), false);
  assert.equal(isExpired(null, now), false);
  assert.equal(interactErrorKey(410), "expired");
  assert.equal(interactErrorKey(429), "tooMany");
  assert.equal(interactErrorKey(409), "notListening");
  assert.equal(interactErrorKey(403), "forbidden");
  assert.equal(interactErrorKey(404), "notFound");
  assert.equal(interactErrorKey(400), "invalid");
  assert.equal(interactErrorKey(500), "generic");
  assert.equal(interactErrorKey(undefined), "generic");
});

test("a select selection must be among the options and within min / max", () => {
  const s = { ...blankSelect(0), options: [{ label: "A", value: "a" }, { label: "B", value: "b" }, { label: "C", value: "c" }], minValues: 1, maxValues: 2 } as SelectComponent;
  assert.deepEqual(validSelection(s, ["a"]), ["a"]);
  assert.deepEqual(validSelection(s, ["a", "a"]), ["a"]);
  assert.equal(validSelection(s, []), null);
  assert.equal(validSelection(s, ["a", "b", "c"]), null);
  assert.equal(validSelection(s, ["z"]), null);
});
