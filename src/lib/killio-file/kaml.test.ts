import assert from "node:assert/strict";
import test from "node:test";

import { stringifyKaml, parseKaml, KamlParseError } from "./kaml.ts";
import {
  encodeKillioFile, decodeKillioFile, killioFilename, KillioFileError,
} from "./index.ts";

function roundtrip(v: unknown): unknown {
  return parseKaml(stringifyKaml(v));
}

// ── scalars ─────────────────────────────────────────────────────────────────
test("scalars roundtrip", () => {
  assert.deepEqual(roundtrip({ a: 1, b: -5, c: 3.14, d: true, e: false, f: null, g: "hi" }),
    { a: 1, b: -5, c: 3.14, d: true, e: false, f: null, g: "hi" });
});

test("string that looks like a number/bool stays a string", () => {
  const v = { a: "123", b: "true", c: "null", d: "3.14" };
  assert.deepEqual(roundtrip(v), v);
  // confirm they were quoted in the text
  assert.ok(stringifyKaml(v).includes('a: "123"'));
});

test("special chars in strings escape + roundtrip", () => {
  const v = { s: 'he said "hi"\tand\\path', uni: "héllo 🌐", colon: "key: value # not comment" };
  assert.deepEqual(roundtrip(v), v);
});

// ── nesting ───────────────────────────────────────────────────────────────────
test("nested objects + arrays roundtrip", () => {
  const v = {
    id: "m1", title: "My Mesh", viewport: { x: 10, y: -5, zoom: 1.5 },
    bricks: [
      { id: "a", kind: "board_empty", position: { x: 0, y: 0 }, content: { childOrder: ["b"] } },
      { id: "b", kind: "draw", position: { x: 10, y: 20 }, content: { shapePreset: "rect", style: { stroke: "#fff", opacity: 0.5 } } },
    ],
    connections: [{ id: "x", cons: ["a", "b"], label: { type: "doc", content: [] } }],
    rootOrder: ["a"],
  };
  assert.deepEqual(roundtrip(v), v);
});

test("array of arrays (table rows)", () => {
  const v = { rows: [["a", "b"], ["c", "d"]] };
  assert.deepEqual(roundtrip(v), v);
});

test("empty collections roundtrip", () => {
  const v = { arr: [], obj: {}, nested: { a: [], b: {} } };
  assert.deepEqual(roundtrip(v), v);
});

// ── block scalars (multi-line markdown) ────────────────────────────────────────
test("multi-line markdown via block scalar", () => {
  const md = "# Title\n\nSome **bold** text\n- item 1\n- item 2";
  const v = { content: { markdown: md } };
  const text = stringifyKaml(v);
  assert.ok(text.includes("markdown: |"), "uses block scalar");
  assert.deepEqual(roundtrip(v), v);
});

test("multi-line string inside array item", () => {
  const v = { notes: ["line a\nline b", "single"] };
  assert.deepEqual(roundtrip(v), v);
});

// ── readability ─────────────────────────────────────────────────────────────────
test("output is human-readable (no JSON braces for nesting)", () => {
  const text = stringifyKaml({ a: { b: { c: 1 } } });
  assert.ok(!text.includes("{"), "no object braces");
  assert.ok(text.includes("a:") && text.includes("c: 1"));
});

test("comments and blank lines are ignored on parse", () => {
  const text = "# a comment\n\nid: \"m\"\n\n# mid\ntitle: \"T\"\n";
  assert.deepEqual(parseKaml(text), { id: "m", title: "T" });
});

// ── container ─────────────────────────────────────────────────────────────────
test("container roundtrip with header (km)", () => {
  const payload = { id: "m1", title: "My Mesh", viewport: { x: 0, y: 0, zoom: 1 }, bricks: [], connections: [], rootOrder: [] };
  const text = encodeKillioFile({ kind: "km", schemaVersion: "2026-v1", payload });
  assert.ok(text.startsWith("#killio km 2026-v1\n"));
  const file = decodeKillioFile(text);
  assert.equal(file.kind, "km");
  assert.equal(file.schemaVersion, "2026-v1");
  assert.deepEqual(file.payload, payload);
});

test("container works for kd/kb/ks", () => {
  for (const kind of ["kd", "kb", "ks"] as const) {
    const payload = { name: "x", items: [1, 2, 3] };
    const file = decodeKillioFile(encodeKillioFile({ kind, schemaVersion: "v1", payload }));
    assert.equal(file.kind, kind);
    assert.deepEqual(file.payload, payload);
  }
});

test("decode rejects missing header", () => {
  assert.throws(() => decodeKillioFile("id: 1\n"), KillioFileError);
});

test("decode rejects unknown kind in header", () => {
  assert.throws(() => decodeKillioFile("#killio xx v1\nid: 1\n"), KillioFileError);
});

test("killioFilename slug + extension per kind", () => {
  assert.equal(killioFilename("km", "My Mesh!", "id"), "my-mesh.km");
  assert.equal(killioFilename("kd", "", "doc-7"), "doc-7.kd");
  assert.equal(killioFilename("kb", "  ", "b9"), "b9.kb");
  assert.equal(killioFilename("ks", "Flow A", "s"), "flow-a.ks");
});

test("KAML is smaller-ish and readable vs raw JSON.stringify(2)", () => {
  const payload = { id: "m", title: "T", viewport: { x: 0, y: 0, zoom: 1 },
    bricks: [{ id: "a", kind: "draw", position: { x: 0, y: 0 }, size: { w: 1, h: 1 } }], connections: [], rootOrder: [] };
  const kaml = encodeKillioFile({ kind: "km", schemaVersion: "v1", payload });
  // sanity: parses back identical
  assert.deepEqual(decodeKillioFile(kaml).payload, payload);
});

test("KamlParseError surfaces on malformed map line", () => {
  assert.throws(() => parseKaml("justtext_no_colon\n"), KamlParseError);
});
