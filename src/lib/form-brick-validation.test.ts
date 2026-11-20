import assert from "node:assert/strict";
import test from "node:test";

import {
  brickTokenFromUrl, buildFormSchema, formSchemaSignature, isRequiredValueMissing, joinMultiSelect,
  mapServerFormErrors, normalizeConditionValue, parseServerFormErrors, toggleMultiSelectOption,
} from "./form-brick-validation.ts";

test("joinMultiSelect joins non-empty strings and tolerates non-arrays", () => {
  assert.equal(joinMultiSelect(["a", "b"]), "a, b");
  assert.equal(joinMultiSelect(["a", "", "c"], "|"), "a|c");
  assert.equal(joinMultiSelect([]), "");
  assert.equal(joinMultiSelect(undefined), "");
  assert.equal(joinMultiSelect("x" as unknown as string[]), "");
});

test("toggleMultiSelectOption adds/removes immutably and keeps option order", () => {
  const options = ["a", "b", "c"];
  const start = ["c"];
  const next = toggleMultiSelectOption(start, "a", true, options);
  assert.deepEqual(next, ["a", "c"]);
  assert.deepEqual(start, ["c"], "input is not mutated");
  assert.deepEqual(toggleMultiSelectOption(next, "c", false, options), ["a"]);
  assert.deepEqual(toggleMultiSelectOption(undefined, "b", true, options), ["b"]);
  assert.deepEqual(toggleMultiSelectOption(["a"], "a", true, options), ["a"], "no duplicates");
});

test("isRequiredValueMissing: strings, checkbox, multi_select", () => {
  assert.equal(isRequiredValueMissing("text", false, ""), false);
  assert.equal(isRequiredValueMissing("text", true, "  "), true);
  assert.equal(isRequiredValueMissing("text", true, "x"), false);
  assert.equal(isRequiredValueMissing("checkbox", true, false), true);
  assert.equal(isRequiredValueMissing("checkbox", true, true), false);
  assert.equal(isRequiredValueMissing("multi_select", true, []), true);
  assert.equal(isRequiredValueMissing("multi_select", true, undefined), true);
  assert.equal(isRequiredValueMissing("multi_select", true, ["a"]), false);
});

test("normalizeConditionValue handles booleans, strings and arrays", () => {
  assert.equal(normalizeConditionValue(true), "true");
  assert.equal(normalizeConditionValue("  Hi "), "hi");
  assert.equal(normalizeConditionValue(["A", " b "]), "a,b");
  assert.equal(normalizeConditionValue(undefined), "");
});

test("buildFormSchema slugs ids, drops duplicates, keeps only enabled conditions", () => {
  const schema = buildFormSchema([
    { fieldId: "field_dueAt", label: " Due ", type: "date" },
    { fieldId: "field_dueat", type: "text" },
    { fieldId: "b", type: "weird", required: true, options: ["x", " "] },
    { fieldId: "c", type: "multi_select", options: ["1"], condition: { enabled: true, sourceFieldId: "Field B", operator: "equals", value: "x" } },
    { fieldId: "d", type: "text", condition: { enabled: false, sourceFieldId: "b" } },
  ]);
  assert.deepEqual(schema.fields.map((f) => f.id), ["field_dueat", "b", "c", "d"]);
  assert.equal(schema.fields[0].label, "Due");
  assert.equal(schema.fields[1].kind, "text");
  assert.deepEqual(schema.fields[1].options, ["x"]);
  assert.deepEqual(schema.fields[2].condition, { sourceFieldId: "field_b", operator: "equals", value: "x" });
  assert.equal(schema.fields[3].condition, undefined);
  assert.equal(formSchemaSignature(schema), JSON.stringify(schema));
});

test("brickTokenFromUrl extracts only public brick tokens", () => {
  const token = "a".repeat(64);
  assert.equal(brickTokenFromUrl(`http://localhost:4000/public/brick/${token}`), token);
  assert.equal(brickTokenFromUrl(`https://api.x.io/public/brick/${token}/`), token);
  assert.equal(brickTokenFromUrl("http://localhost:4000/w/t/webhook/s/tok"), null);
  assert.equal(brickTokenFromUrl("http://x/public/brick/short"), null);
  assert.equal(brickTokenFromUrl(undefined), null);
});

test("parseServerFormErrors accepts the backend shape and ignores anything else", () => {
  const body = { statusCode: 400, errors: [{ field: "a", code: "required", message: "A: required" }, { field: "", message: "x" }, null, { message: "no field" }, { field: "b", message: "B: invalid_email" }] };
  assert.deepEqual(parseServerFormErrors(body), [
    { field: "a", code: "required", message: "A: required" },
    { field: "b", code: undefined, message: "B: invalid_email" },
  ]);
  assert.deepEqual(parseServerFormErrors(null), []);
  assert.deepEqual(parseServerFormErrors({ message: "boom" }), []);
  assert.deepEqual(parseServerFormErrors({ errors: "x" }), []);
});

test("mapServerFormErrors maps field ids to brick ids, first error per field wins, unknown fields are reported", () => {
  const map = { field_a: "brick-1", field_b: "brick-2" };
  const result = mapServerFormErrors(
    [
      { field: "field_b", code: "invalid_email", message: "B: invalid_email" },
      { field: "field_a", code: "required", message: "A: required" },
      { field: "field_b", code: "too_long", message: "B: too_long" },
      { field: "ghost", message: "ghost: x" },
      { field: "constructor", message: "proto" },
    ],
    map,
    (e) => `T(${e.code ?? e.message})`,
  );
  assert.deepEqual(result.byBrick, { "brick-2": "T(invalid_email)", "brick-1": "T(required)" });
  assert.equal(result.firstBrickId, "brick-2");
  assert.deepEqual(result.unmapped.map((e) => e.field), ["ghost", "constructor"]);
});
