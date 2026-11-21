import assert from "node:assert/strict";
import test from "node:test";

import { applyPin, boardPinKind, isPinned, pinHref, resolvePins } from "./resolve.ts";

const sources = {
  boards: [
    { id: "b1", name: "Tablero", boardType: "kanban", updatedAt: "2026-01-02" },
    { id: "m1", name: "Malla", boardType: "mesh" },
  ],
  documents: [{ id: "d1", title: "Doc" }],
  folders: [{ id: "f1", name: "Carpeta" }],
};

test("resolvePins keeps the pin order and builds titles and links", () => {
  const out = resolvePins(
    [
      { entityType: "document", entityId: "d1", position: 2 },
      { entityType: "board", entityId: "b1", position: 0 },
      { entityType: "mesh", entityId: "m1", position: 1 },
      { entityType: "folder", entityId: "f1", position: 3 },
    ],
    sources,
  );
  assert.deepEqual(out.map((e) => `${e.kind}:${e.title}:${e.href}`), ["board:Tablero:/b/b1", "mesh:Malla:/m/m1", "document:Doc:/d/d1", "folder:Carpeta:/d?folder=f1"]);
});

test("pins of things that are gone, or filed under the wrong kind, are left out", () => {
  const out = resolvePins([{ entityType: "board", entityId: "nope" }, { entityType: "board", entityId: "m1" }, { entityType: "document", entityId: "zzz" }], sources);
  assert.deepEqual(out, []);
  assert.deepEqual(resolvePins([{ entityType: "board", entityId: "b1" }], {}), []);
});

test("boards are pinned as boards and meshes as meshes", () => {
  assert.equal(boardPinKind({ boardType: "mesh" }), "mesh");
  assert.equal(boardPinKind({ boardType: "kanban" }), "board");
  assert.equal(boardPinKind({}), "board");
  assert.equal(pinHref("mesh", "x"), "/m/x");
});

test("isPinned and applyPin (optimistic list)", () => {
  let pins = applyPin([], "board", "b1", true);
  pins = applyPin(pins, "document", "d1", true);
  assert.deepEqual(pins.map((p) => [p.entityId, p.position]), [["b1", 0], ["d1", 1]]);
  assert.equal(isPinned(pins, "board", "b1"), true);
  assert.equal(isPinned(pins, "document", "b1"), false);
  assert.equal(applyPin(pins, "board", "b1", true).length, 2, "pinning twice does not duplicate");
  assert.deepEqual(applyPin(pins, "board", "b1", false).map((p) => p.entityId), ["d1"]);
});
