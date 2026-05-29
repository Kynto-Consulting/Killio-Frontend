import assert from "node:assert/strict";
import test from "node:test";

import { localDocsForPicker, localBoardsForPicker, localRouteFor } from "./local-references.ts";

const files = [
  { name: "notes.kd", path: "notes.kd", folder: "", kind: "kd" as const },
  { name: "spec.kd", path: "specs/spec.kd", folder: "specs", kind: "kd" as const },
  { name: "flow.km", path: "flow.km", folder: "", kind: "km" as const },
  { name: "board.kb", path: "board.kb", folder: "", kind: "kb" as const },
  { name: "auto.ks", path: "auto.ks", folder: "", kind: "ks" as const },
];

test("localDocsForPicker returns only .kd with path id + clean title", () => {
  const docs = localDocsForPicker(files);
  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => d.id), ["notes.kd", "specs/spec.kd"]);
  assert.equal(docs[1].title, "spec");
});

test("localBoardsForPicker returns meshes + boards", () => {
  const b = localBoardsForPicker(files);
  assert.deepEqual(b.map((x) => x.id).sort(), ["board.kb", "flow.km"]);
});

test("localRouteFor maps kind → route + encodes segments", () => {
  assert.equal(localRouteFor("kd", "specs/my doc.kd"), "/d/specs/my%20doc.kd");
  assert.equal(localRouteFor("km", "flow.km"), "/m/flow.km");
  assert.equal(localRouteFor("kb", "board.kb"), "/b/board.kb");
});
