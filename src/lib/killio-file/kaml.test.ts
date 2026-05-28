import assert from "node:assert/strict";
import test from "node:test";

import { stringifyKaml, parseKaml, parseInline, inlineValue, KamlParseError } from "./kaml.ts";
import {
  encodeKillioFile, decodeKillioFile, killioFilename, KillioFileError,
} from "./index.ts";

function roundtrip(v: unknown): unknown {
  return parseKaml(stringifyKaml(v));
}

// ── scalars + inline ──────────────────────────────────────────────────────────
test("scalars roundtrip", () => {
  const v = { a: 1, b: -5, c: 3.14, d: true, e: false, f: null, g: "hi" };
  assert.deepEqual(roundtrip(v), v);
});

test("number/bool-like strings stay strings (quoted)", () => {
  const v = { a: "123", b: "true", c: "null", d: "3.14" };
  assert.deepEqual(roundtrip(v), v);
  assert.ok(stringifyKaml(v).includes('a = "123"'));
});

test("safe identifier strings stay bare for readability", () => {
  const text = stringifyKaml({ kind: "draw", id: "b1" });
  assert.ok(text.includes("kind = draw"), "bare string");
  assert.ok(text.includes("id = b1"));
});

test("special chars escape + roundtrip", () => {
  const v = { s: 'say "hi"\tand\\path', uni: "héllo 🌐", eq: "a=b, c=(d)" };
  assert.deepEqual(roundtrip(v), v);
});

// ── inline records + lists ──────────────────────────────────────────────────
test("inline record roundtrip via parseInline", () => {
  assert.deepEqual(parseInline("(x=0, y=34, zoom=1.5)"), { x: 0, y: 34, zoom: 1.5 });
});

test("inline list roundtrip", () => {
  assert.deepEqual(parseInline("[a, b, c]"), ["a", "b", "c"]);
  assert.deepEqual(parseInline("[1, 2, 3]"), [1, 2, 3]);
});

test("nested record/list inline", () => {
  const v = parseInline('(shapePreset=diamond, style=(stroke="#22d3ee", opacity=0.5), pts=[(x=0, y=0), (x=1, y=1)])');
  assert.deepEqual(v, { shapePreset: "diamond", style: { stroke: "#22d3ee", opacity: 0.5 }, pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
});

test("inlineValue produces records with parens not braces", () => {
  const s = inlineValue({ a: { b: 1 } });
  assert.ok(s.includes("(") && !s.includes("{"));
});

// ── array-of-objects → [[section]] ──────────────────────────────────────────
test("array of objects becomes [[section]] blocks and roundtrips", () => {
  const v = {
    title: "My Mesh",
    rootOrder: ["a"],
    viewport: { x: 0, y: 0, zoom: 1 },
    bricks: [
      { id: "a", kind: "board_empty", pos: { x: 0, y: 0 } },
      { id: "b", kind: "draw", content: { shapePreset: "rect", manualStrokes: [{ points: [{ x: 0, y: 0 }], color: "#fff" }] } },
    ],
    connections: [],
  };
  const text = stringifyKaml(v);
  assert.ok(text.includes("[[bricks]]"), "uses section blocks");
  assert.ok(!text.includes("\n  "), "no indentation (not YAML)");
  assert.deepEqual(roundtrip(v), v);
});

test("empty collections roundtrip", () => {
  const v = { arr: [], obj: {}, list: [1] };
  assert.deepEqual(roundtrip(v), v);
});

// ── multi-line strings (markdown) ────────────────────────────────────────────
test("multi-line markdown roundtrips (escaped, single line)", () => {
  const md = "# Title\n\n**bold**\n- a\n- b";
  const v = { bricks: [{ id: "x", kind: "text", content: { markdown: md } }] };
  assert.deepEqual(roundtrip(v), v);
});

// ── readability ──────────────────────────────────────────────────────────────
test("not YAML: no significant indentation in output", () => {
  const text = stringifyKaml({ a: { b: { c: 1 } }, bricks: [{ id: "1", kind: "text" }] });
  for (const line of text.split("\n")) assert.ok(!line.startsWith(" "), `line indented: "${line}"`);
});

// ── container ──────────────────────────────────────────────────────────────────
test("container roundtrip with header (km)", () => {
  const payload = { id: "m1", title: "My Mesh", viewport: { x: 0, y: 0, zoom: 1 }, bricks: [{ id: "a", kind: "draw", pos: { x: 1, y: 2 } }], connections: [], rootOrder: ["a"] };
  const text = encodeKillioFile({ kind: "km", schemaVersion: "2026-v1", payload });
  assert.ok(text.startsWith("#killio km 2026-v1\n"));
  const file = decodeKillioFile(text);
  assert.equal(file.kind, "km");
  assert.equal(file.schemaVersion, "2026-v1");
  assert.deepEqual(file.payload, payload);
});

test("container works for kd/kb/ks", () => {
  for (const kind of ["kd", "kb", "ks"] as const) {
    const payload = { name: "x", items: [1, 2, 3], bricks: [{ id: "b", kind: "text" }] };
    const file = decodeKillioFile(encodeKillioFile({ kind, schemaVersion: "v1", payload }));
    assert.equal(file.kind, kind);
    assert.deepEqual(file.payload, payload);
  }
});

test("decode rejects missing header", () => {
  assert.throws(() => decodeKillioFile("id = 1\n"), KillioFileError);
});

test("decode rejects unknown kind in header", () => {
  assert.throws(() => decodeKillioFile("#killio xx v1\nid = 1\n"), KillioFileError);
});

test("comments + blank lines ignored", () => {
  assert.deepEqual(parseKaml('# c\n\nid = m\n\n# mid\ntitle = "T"\n'), { id: "m", title: "T" });
});

test("killioFilename slug + extension per kind", () => {
  assert.equal(killioFilename("km", "My Mesh!", "id"), "my-mesh.km");
  assert.equal(killioFilename("kd", "", "doc-7"), "doc-7.kd");
  assert.equal(killioFilename("kb", "  ", "b9"), "b9.kb");
  assert.equal(killioFilename("ks", "Flow A", "s"), "flow-a.ks");
});

test("malformed line throws KamlParseError", () => {
  assert.throws(() => parseKaml("no equals here\n"), KamlParseError);
});
