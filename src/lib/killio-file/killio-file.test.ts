import assert from "node:assert/strict";
import test from "node:test";

import { ByteWriter, ByteReader, encodeValue, decodeValue, newKeyDict } from "./binary.ts";
import {
  encodeMeshBrick, decodeMeshBrick,
  encodeMeshConnection, decodeMeshConnection,
  encodeMeshPayload, decodeMeshPayload, type MeshPayload,
} from "./brick-codecs.ts";
import {
  encodeContentBrick, decodeContentBrick,
  encodeContentBricks, decodeContentBricks, type ContentBrickLike,
} from "./content-brick-codecs.ts";
import {
  encodeKillioFile, decodeKillioFile, killioFilename, KillioFileError,
} from "./index.ts";

// ── primitives ────────────────────────────────────────────────────────────────
test("varint roundtrip across magnitudes", () => {
  const w = new ByteWriter();
  // include large values that are NOT all-ones in low bits (catches int32 bitwise bug)
  const vals = [0, 1, 127, 128, 300, 16384, 1e6, 2 ** 31, 2 ** 40 + 12345, 2 ** 49 + 7, Number.MAX_SAFE_INTEGER];
  vals.forEach((v) => w.uvarint(v));
  const r = new ByteReader(w.finish());
  vals.forEach((v) => assert.equal(r.uvarint(), v));
});

test("svarint roundtrip negative + positive", () => {
  const w = new ByteWriter();
  const vals = [0, -1, 1, -1000, 1000, -123456, 123456];
  vals.forEach((v) => w.svarint(v));
  const r = new ByteReader(w.finish());
  vals.forEach((v) => assert.equal(r.svarint(), v));
});

test("f64 + string (unicode) roundtrip", () => {
  const w = new ByteWriter();
  w.f64(3.14159);
  w.str("héllo 🌐 mesh");
  const r = new ByteReader(w.finish());
  assert.ok(Math.abs(r.f64() - 3.14159) < 1e-9);
  assert.equal(r.str(), "héllo 🌐 mesh");
});

// ── generic value codec ────────────────────────────────────────────────────────
function valueRoundtrip(v: unknown): unknown {
  const w = new ByteWriter();
  encodeValue(w, v, newKeyDict());
  return decodeValue(new ByteReader(w.finish()), newKeyDict());
}

test("value codec roundtrips nested structures", () => {
  const v = {
    id: "x", kind: "draw", position: { x: 10, y: -5 }, size: { w: 100.5, h: 60 },
    content: { shapePreset: "rect", style: { stroke: "#fff", opacity: 0.5, edges: "sharp" }, childOrder: ["a", "b"] },
    flag: true, nope: false, nothing: null, list: [1, 2, 3, "mix", { deep: [true] }],
  };
  assert.deepEqual(valueRoundtrip(v), v);
});

test("value codec drops undefined object keys", () => {
  const out = valueRoundtrip({ a: 1, b: undefined }) as Record<string, unknown>;
  assert.deepEqual(out, { a: 1 });
});

test("value codec: unknown keys roundtrip via inline dictionary", () => {
  const v = { totallyCustomKey: 1, anotherWeirdOne: { nestedCustom: "z" } };
  assert.deepEqual(valueRoundtrip(v), v);
});

// ── mesh brick codec ────────────────────────────────────────────────────────────
test("mesh brick roundtrip (shape with content)", () => {
  const b = {
    id: "b1", kind: "draw", parentId: null,
    position: { x: 12, y: 34 }, size: { w: 160, h: 80 }, rotation: 15,
    content: { shapePreset: "diamond", style: { stroke: "#22d3ee", strokeWidth: 2 } },
    metadata: { author: "me" },
  };
  const w = new ByteWriter();
  encodeMeshBrick(w, b, newKeyDict());
  const got = decodeMeshBrick(new ByteReader(w.finish()), newKeyDict());
  assert.deepEqual(got, b);
});

test("mesh brick roundtrip (minimal, no rotation/meta/content)", () => {
  const b = { id: "b2", kind: "text", parentId: "p1", position: { x: 0, y: 0 }, size: { w: 100, h: 40 } };
  const w = new ByteWriter();
  encodeMeshBrick(w, b, newKeyDict());
  const got = decodeMeshBrick(new ByteReader(w.finish()), newKeyDict());
  assert.deepEqual(got, b);
});

test("mesh brick: unknown kind preserved", () => {
  const b = { id: "b3", kind: "future_kind", parentId: null, position: { x: 1, y: 2 }, size: { w: 3, h: 4 } };
  const w = new ByteWriter();
  encodeMeshBrick(w, b, newKeyDict());
  const got = decodeMeshBrick(new ByteReader(w.finish()), newKeyDict());
  assert.equal(got.kind, "future_kind");
});

test("mesh connection roundtrip", () => {
  const c = { id: "c1", cons: ["a", "b"] as [string, string], label: { type: "doc", content: [] }, style: { stroke: "#fff" } };
  const w = new ByteWriter();
  encodeMeshConnection(w, c, newKeyDict());
  const got = decodeMeshConnection(new ByteReader(w.finish()), newKeyDict());
  assert.deepEqual(got, c);
});

// ── full mesh payload ────────────────────────────────────────────────────────────
function samplePayload(): MeshPayload {
  return {
    id: "m1", title: "My Mesh", viewport: { x: 10, y: 20, zoom: 1.5 },
    bricks: [
      { id: "a", kind: "board_empty", parentId: null, position: { x: 0, y: 0 }, size: { w: 200, h: 120 }, content: { childOrder: ["b"] } },
      { id: "b", kind: "text", parentId: "a", position: { x: 10, y: 10 }, size: { w: 100, h: 40 }, content: { markdown: "hi" } },
    ],
    connections: [{ id: "x", cons: ["a", "b"], label: { type: "doc", content: [] } }],
    rootOrder: ["a"],
  };
}

test("mesh payload roundtrip preserves structure", () => {
  const p = samplePayload();
  const w = new ByteWriter();
  encodeMeshPayload(w, p, newKeyDict());
  const got = decodeMeshPayload(new ByteReader(w.finish()), newKeyDict());
  assert.deepEqual(got, p);
});

// ── unified content brick codec (2nd brick family) ──────────────────────────────
test("content brick roundtrip (kanban text brick)", () => {
  const b: ContentBrickLike = { id: "t1", kind: "text", position: 0, parentBlockId: null, displayStyle: "callout", markdown: "**hi**", tasks: [] };
  const w = new ByteWriter();
  encodeContentBrick(w, b, newKeyDict());
  assert.deepEqual(decodeContentBrick(new ByteReader(w.finish()), newKeyDict()), b);
});

test("content brick roundtrip (doc table brick, position number)", () => {
  const b: ContentBrickLike = { id: "tb", kind: "table", position: 3, content: { rows: [["a", "b"], ["c", "d"]] } };
  const w = new ByteWriter();
  encodeContentBrick(w, b, newKeyDict());
  assert.deepEqual(decodeContentBrick(new ByteReader(w.finish()), newKeyDict()), b);
});

test("content brick: unknown kind preserved", () => {
  const b: ContentBrickLike = { id: "z", kind: "some_future_brick", content: {} };
  const w = new ByteWriter();
  encodeContentBrick(w, b, newKeyDict());
  assert.equal(decodeContentBrick(new ByteReader(w.finish()), newKeyDict()).kind, "some_future_brick");
});

test("content brick uses distinct enum from mesh (same string, diff family)", () => {
  // "text" exists in both families; encoded codes differ but each family decodes its own.
  const b: ContentBrickLike = { id: "x", kind: "payment", content: { amount: 10, currency: "USD" } };
  const w = new ByteWriter();
  encodeContentBrick(w, b, newKeyDict());
  assert.deepEqual(decodeContentBrick(new ByteReader(w.finish()), newKeyDict()), b);
});

test("content bricks array roundtrip", () => {
  const arr: ContentBrickLike[] = [
    { id: "1", kind: "text", position: 0, content: { markdown: "a" } },
    { id: "2", kind: "checklist", position: 1, content: { items: [{ id: "i", label: "x", checked: true }] } },
  ];
  const w = new ByteWriter();
  encodeContentBricks(w, arr, newKeyDict());
  assert.deepEqual(decodeContentBricks(new ByteReader(w.finish()), newKeyDict()), arr);
});

// ── container ────────────────────────────────────────────────────────────────────
test("container roundtrip for km (optimized codec)", () => {
  const p = samplePayload();
  const bytes = encodeKillioFile({ kind: "km", schemaVersion: "2026-v1", payload: p });
  const file = decodeKillioFile(bytes);
  assert.equal(file.kind, "km");
  assert.equal(file.schemaVersion, "2026-v1");
  assert.deepEqual(file.payload, p);
});

test("container roundtrip for kd (content-brick codec, bricks reordered last)", () => {
  const payload = { title: "Doc", visibility: "team", bricks: [
    { id: "1", kind: "text", position: 0, content: { markdown: "yo" } },
    { id: "2", kind: "table", position: 1, content: { rows: [["a"]] } },
  ] };
  const bytes = encodeKillioFile({ kind: "kd", schemaVersion: "2026-v1", payload });
  const file = decodeKillioFile(bytes);
  assert.equal(file.kind, "kd");
  assert.deepEqual(file.payload, payload);
});

test("container roundtrip for kb (generic codec, nested)", () => {
  const payload = { name: "Board", lists: [{ id: "l", name: "To Do", cards: [{ id: "c", title: "Card", blocks: [{ id: "b", kind: "text", position: 0 }] }] }] };
  const bytes = encodeKillioFile({ kind: "kb", schemaVersion: "2026-v1", payload });
  assert.deepEqual(decodeKillioFile(bytes).payload, payload);
});

test("container roundtrip for ks (generic codec)", () => {
  const payload = { name: "Flow", triggerType: "manual", nodes: [{ id: "n", nodeKind: "core.trigger.manual", positionX: 0, positionY: 0, config: {} }], edges: [] };
  const bytes = encodeKillioFile({ kind: "ks", schemaVersion: "2026-v1", payload });
  assert.deepEqual(decodeKillioFile(bytes).payload, payload);
});

test("container is smaller than JSON for km", () => {
  const p = samplePayload();
  const bytes = encodeKillioFile({ kind: "km", schemaVersion: "2026-v1", payload: p });
  const json = new TextEncoder().encode(JSON.stringify(p));
  assert.ok(bytes.length < json.length, `binary ${bytes.length} should be < json ${json.length}`);
});

test("decode rejects bad magic", () => {
  assert.throws(() => decodeKillioFile(new Uint8Array([1, 2, 3, 4, 5, 6])), KillioFileError);
});

test("decode rejects truncated buffer", () => {
  assert.throws(() => decodeKillioFile(new Uint8Array([0x4b])), KillioFileError);
});

test("killioFilename slugifies + correct extension per kind", () => {
  assert.equal(killioFilename("km", "My Mesh!", "id"), "my-mesh.km");
  assert.equal(killioFilename("kd", "", "doc-7"), "doc-7.kd");
  assert.equal(killioFilename("kb", "  ", "b9"), "b9.kb");
  assert.equal(killioFilename("ks", "Flow A", "s"), "flow-a.ks");
});
