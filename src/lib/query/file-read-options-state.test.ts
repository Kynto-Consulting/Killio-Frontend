import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FILE_READ_OPTIONS } from "./file-read-options.ts";
import {
  clampSkipRows,
  diffOptions,
  initialState,
  isDirty,
  mergeOverDefaults,
  normalizeDelimiter,
  normalizeOptions,
  readOptionsReducer,
} from "./file-read-options-state.ts";

test("clampSkipRows clamps and survives garbage", () => {
  assert.equal(clampSkipRows(-5), 0);
  assert.equal(clampSkipRows(5000), 1000);
  assert.equal(clampSkipRows(3.9), 3);
  assert.equal(clampSkipRows("12"), 12);
  assert.equal(clampSkipRows("abc"), 0);
  assert.equal(clampSkipRows(NaN), 0);
});

test("normalizeDelimiter", () => {
  assert.equal(normalizeDelimiter("auto"), "auto");
  assert.equal(normalizeDelimiter(""), "auto");
  assert.equal(normalizeDelimiter(undefined), "auto");
  assert.equal(normalizeDelimiter("\t"), "\t");
  assert.equal(normalizeDelimiter("\\t"), "\t");
  assert.equal(normalizeDelimiter(" "), " ");
  assert.equal(normalizeDelimiter("abcdef"), "abc");
  assert.equal(normalizeDelimiter("a\nb"), "ab");
});

test("mergeOverDefaults fills missing fields and rejects invalid ones", () => {
  const m = mergeOverDefaults({ skipRows: 99999, encoding: "klingon" as never, decimalSeparator: "," });
  assert.equal(m.skipRows, 1000);
  assert.equal(m.encoding, "auto");
  assert.equal(m.decimalSeparator, ",");
  assert.deepEqual(m.nullTokens, DEFAULT_FILE_READ_OPTIONS.nullTokens);
  assert.deepEqual(mergeOverDefaults(null), DEFAULT_FILE_READ_OPTIONS);
  assert.deepEqual(mergeOverDefaults({}), DEFAULT_FILE_READ_OPTIONS);
});

test("mergeOverDefaults does not alias the default arrays", () => {
  const m = mergeOverDefaults({});
  m.nullTokens.push("x");
  assert.equal(DEFAULT_FILE_READ_OPTIONS.nullTokens.includes("x"), false);
});

test("normalizeOptions cleans tokens and records", () => {
  const n = normalizeOptions({
    nullTokens: ["a", "a", "", 3 as never],
    columnTypes: { x: "integer", y: "weird" as never },
    columnNames: { x: "  ", y: "Why" },
    commentPrefix: "",
    listSeparator: "",
    sheet: "",
  });
  assert.deepEqual(n.nullTokens, ["a", ""]);
  assert.deepEqual(n.columnTypes, { x: "integer" });
  assert.deepEqual(n.columnNames, { y: "Why" });
  assert.equal(n.commentPrefix, null);
  assert.equal(n.listSeparator, null);
  assert.equal(n.sheet, null);
});

test("diffOptions returns the minimal patch", () => {
  const base = mergeOverDefaults({});
  assert.deepEqual(diffOptions(base, base), {});
  const draft = mergeOverDefaults({ delimiter: ";", nullTokens: ["x"], columnTypes: { a: "date" } });
  assert.deepEqual(diffOptions(base, draft), { delimiter: ";", nullTokens: ["x"], columnTypes: { a: "date" } });
  assert.equal(isDirty(base, draft), true);
  assert.equal(isDirty(base, mergeOverDefaults({})), false);
});

test("reducer: set, column type, rename, reset, load", () => {
  let s = initialState();
  s = readOptionsReducer(s, { type: "set", patch: { skipRows: 4000, delimiter: "" } });
  assert.equal(s.draft.skipRows, 1000);
  assert.equal(s.draft.delimiter, "auto");
  s = readOptionsReducer(s, { type: "setColumnType", column: "price", value: "decimal" });
  assert.deepEqual(s.draft.columnTypes, { price: "decimal" });
  s = readOptionsReducer(s, { type: "setColumnType", column: "price", value: null });
  assert.deepEqual(s.draft.columnTypes, {});
  s = readOptionsReducer(s, { type: "setColumnName", column: "a", value: " Alpha " });
  assert.deepEqual(s.draft.columnNames, { a: "Alpha" });
  s = readOptionsReducer(s, { type: "setColumnName", column: "a", value: "a" });
  assert.deepEqual(s.draft.columnNames, {});
  s = readOptionsReducer(s, { type: "set", patch: { trim: false } });
  assert.equal(isDirty(s.baseline, s.draft), true);
  s = readOptionsReducer(s, { type: "reset" });
  assert.equal(isDirty(s.baseline, s.draft), false);
  s = readOptionsReducer(s, { type: "load", options: { delimiter: "|" } });
  assert.equal(s.baseline.delimiter, "|");
  assert.equal(s.draft.delimiter, "|");
});
