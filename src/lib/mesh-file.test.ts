import assert from "node:assert/strict";
import test from "node:test";

import {
  serializeMeshToKm,
  deserializeKmToMesh,
  parseKmText,
  kmFilename,
  KmParseError,
  KM_SCHEMA_VERSION,
} from "./mesh-file.ts";

function sampleState(): any {
  return {
    version: "1.0.0",
    viewport: { x: 10, y: 20, zoom: 1.5 },
    rootOrder: ["a", "c"],
    bricksById: {
      a: { id: "a", kind: "board_empty", parentId: null, position: { x: 0, y: 0 }, size: { w: 200, h: 120 }, content: { childOrder: ["b"] } },
      b: { id: "b", kind: "text", parentId: "a", position: { x: 10, y: 10 }, size: { w: 100, h: 40 }, content: { markdown: "hi" } },
      c: { id: "c", kind: "draw", parentId: null, position: { x: 300, y: 0 }, size: { w: 160, h: 80 }, content: { shapePreset: "rect" } },
    },
    connectionsById: {
      x: { id: "x", cons: ["a", "c"], label: { type: "doc", content: [] } },
    },
  };
}

test("serialize produces spec-shaped .km", () => {
  const km = serializeMeshToKm(sampleState(), { meshId: "m1", title: "My Mesh" });
  assert.equal(km.id, "m1");
  assert.equal(km.schemaVersion, KM_SCHEMA_VERSION);
  assert.equal(km.title, "My Mesh");
  assert.deepEqual(km.viewport, { x: 10, y: 20, zoom: 1.5 });
  assert.equal(km.bricks.length, 3);
  assert.equal(km.connections.length, 1);
  assert.deepEqual(km.rootOrder, ["a", "c"]);
});

test("roundtrip serialize → deserialize preserves structure", () => {
  const km = serializeMeshToKm(sampleState(), { meshId: "m1", title: "My Mesh" });
  const { state, meta } = deserializeKmToMesh(km);
  assert.equal(meta.id, "m1");
  assert.equal(meta.title, "My Mesh");
  assert.deepEqual(state.viewport, { x: 10, y: 20, zoom: 1.5 });
  assert.deepEqual(state.rootOrder, ["a", "c"]);
  assert.equal(Object.keys(state.bricksById).length, 3);
  assert.equal(state.bricksById.b.parentId, "a");
  assert.equal(Object.keys(state.connectionsById).length, 1);
  assert.equal(state.version, "1.0.0");
});

test("deserialize drops dangling connections", () => {
  const km = {
    id: "m", schemaVersion: KM_SCHEMA_VERSION, title: "t", viewport: { x: 0, y: 0, zoom: 1 },
    bricks: [{ id: "a", kind: "draw", parentId: null, position: { x: 0, y: 0 }, size: { w: 1, h: 1 } }],
    connections: [{ id: "z", cons: ["a", "ghost"], label: { type: "doc", content: [] } }],
  };
  const { state } = deserializeKmToMesh(km);
  assert.equal(Object.keys(state.connectionsById).length, 0);
});

test("deserialize rebuilds rootOrder when missing", () => {
  const km = {
    id: "m", schemaVersion: KM_SCHEMA_VERSION, title: "t", viewport: { x: 0, y: 0, zoom: 1 },
    bricks: [
      { id: "a", kind: "draw", parentId: null, position: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
      { id: "b", kind: "text", parentId: "a", position: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
    ],
    connections: [],
  };
  const { state } = deserializeKmToMesh(km);
  assert.deepEqual(state.rootOrder, ["a"]);
});

test("deserialize throws on bad input", () => {
  assert.throws(() => deserializeKmToMesh(null), KmParseError);
  assert.throws(() => deserializeKmToMesh({ title: "x" }), KmParseError);
});

test("parseKmText rejects invalid JSON", () => {
  assert.throws(() => parseKmText("{not json"), KmParseError);
});

test("parseKmText accepts a valid serialized file", () => {
  const km = serializeMeshToKm(sampleState(), { meshId: "m1", title: "X" });
  const text = JSON.stringify(km);
  const back = parseKmText(text);
  assert.equal(back.id, "m1");
});

test("kmFilename slugifies + appends .km", () => {
  assert.equal(kmFilename("My Cool Mesh!", "id1"), "my-cool-mesh.km");
  assert.equal(kmFilename("", "id1"), "id1.km");
  assert.equal(kmFilename("   ", "fallback-id"), "fallback-id.km");
});

test("deserialize drops connections with non-string cons", () => {
  const km = {
    id: "m", schemaVersion: KM_SCHEMA_VERSION, title: "t", viewport: { x: 0, y: 0, zoom: 1 },
    bricks: [{ id: "a", kind: "draw", parentId: null, position: { x: 0, y: 0 }, size: { w: 1, h: 1 } }],
    connections: [{ id: "z", cons: [null, "a"], label: { type: "doc", content: [] } }],
  };
  const { state } = deserializeKmToMesh(km as any);
  assert.equal(Object.keys(state.connectionsById).length, 0);
});

test("deserialize coerces missing position/size and bad viewport", () => {
  const km = {
    id: "m", schemaVersion: KM_SCHEMA_VERSION, title: "t", viewport: { x: "bad" },
    bricks: [{ id: "a", kind: "draw", parentId: 123 }],
    connections: [],
  };
  const { state } = deserializeKmToMesh(km as any);
  assert.deepEqual(state.viewport, { x: 0, y: 0, zoom: 1 });
  assert.equal(state.bricksById.a.parentId, null);
  assert.deepEqual(state.bricksById.a.position, { x: 0, y: 0 });
  assert.deepEqual(state.bricksById.a.size, { w: 120, h: 80 });
});
