import assert from "node:assert/strict";
import test from "node:test";

import { REFINE_HINT, buildRefinementMessage, detectModifiedPaths, omitKeys, snapshotContents } from "./draft-refine.ts";

test("refinement message is the user text plus the fixed hint", () => {
  const m = buildRefinementMessage("  agrega un campo de prioridad \n");
  assert.equal(m, `agrega un campo de prioridad\n\n${REFINE_HINT}`);
});

test("only files that existed and changed are reported as modified", () => {
  const base = snapshotContents([
    { path: "a/x.kt", content: "v1" },
    { path: "a/y.kb", content: "same" },
  ]);
  const next = [
    { path: "a/x.kt", content: "v2" },
    { path: "a/y.kb", content: "same" },
    { path: "a/new.kd", content: "fresh" },
  ];
  assert.deepEqual(detectModifiedPaths(base, next), ["a/x.kt"]);
});

test("omitKeys drops the given keys without mutating the input", () => {
  const rec = { a: 1, b: 2, c: 3 };
  assert.deepEqual(omitKeys(rec, ["a", "c", "zzz"]), { b: 2 });
  assert.deepEqual(rec, { a: 1, b: 2, c: 3 });
  assert.equal(omitKeys(rec, []), rec);
});
