import assert from "node:assert/strict";
import test from "node:test";

import { importRank, isDraftEntityKind, orderForImport, outcomeOf } from "./draft-import-order.ts";

test("only .kt and .kg are created server-side", () => {
  for (const k of ["kt", "kg"]) assert.equal(isDraftEntityKind(k), true);
  for (const k of ["kd", "kb", "km", "ks", "kf", "", "kx"]) assert.equal(isDraftEntityKind(k), false);
});

test("tag groups import first, card templates last, the rest keeps the agent's order", () => {
  const files = [
    { kind: "kt", path: "a.kt" },
    { kind: "kd", path: "doc1.kd" },
    { kind: "kg", path: "g1.kg" },
    { kind: "kb", path: "board.kb" },
    { kind: "kt", path: "b.kt" },
    { kind: "kg", path: "g2.kg" },
    { kind: "kd", path: "doc2.kd" },
  ];
  assert.deepEqual(orderForImport(files).map((f) => f.path), ["g1.kg", "g2.kg", "doc1.kd", "board.kb", "doc2.kd", "a.kt", "b.kt"]);
  assert.deepEqual(files.map((f) => f.path)[0], "a.kt", "the input is not mutated");
  assert.ok(importRank("kg") < importRank("kd") && importRank("kd") < importRank("kt"));
});

test("a server error becomes the thrown sentence; created and skipped pass through", () => {
  assert.throws(() => outcomeOf({ status: "error", message: 'Cannot import tag group "Prioridad": Your role cannot edit tag groups.' }), /Your role cannot edit tag groups/);
  assert.throws(() => outcomeOf(undefined), /no result/);
  assert.deepEqual(outcomeOf({ status: "created", message: "ok", id: "ctpl_1", warnings: ["w"] }), { status: "created", message: "ok", warnings: ["w"], id: "ctpl_1" });
  const skipped = outcomeOf({ status: "skipped", message: "already exists" });
  assert.equal(skipped.status, "skipped");
  assert.deepEqual(skipped.warnings, []);
});
