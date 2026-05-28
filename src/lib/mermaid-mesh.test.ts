import assert from "node:assert/strict";
import test from "node:test";

import { parseMermaidToMesh } from "./mermaid-mesh.ts";

test("parses simple flowchart with shapes and edge label", () => {
  const src = `flowchart TD
    A[Start] --> B{Decision}
    B -->|yes| C[(Database)]
    B -->|no| D((End))`;
  const mesh = parseMermaidToMesh(src);
  assert.equal(mesh.nodes.length, 4);
  const byRef = Object.fromEntries(mesh.nodes.map((n) => [n.ref, n]));
  assert.equal(byRef.A.shape, "rect");
  assert.equal(byRef.A.label, "Start");
  assert.equal(byRef.B.shape, "diamond");
  assert.equal(byRef.C.shape, "cylinder");
  assert.equal(byRef.D.shape, "ellipse");
  assert.equal(mesh.edges.length, 3);
  const yes = mesh.edges.find((e) => e.from === "B" && e.to === "C");
  assert.equal(yes?.label, "yes");
});

test("layers flow top-to-bottom (TB increases y)", () => {
  const mesh = parseMermaidToMesh(`graph TD
    A --> B
    B --> C`);
  const byRef = Object.fromEntries(mesh.nodes.map((n) => [n.ref, n]));
  assert.ok(byRef.A.y < byRef.B.y, "B below A");
  assert.ok(byRef.B.y < byRef.C.y, "C below B");
  assert.equal(byRef.A.x, byRef.B.x, "vertical column shares x");
});

test("LR direction flows left-to-right (increases x)", () => {
  const mesh = parseMermaidToMesh(`flowchart LR
    A --> B`);
  const byRef = Object.fromEntries(mesh.nodes.map((n) => [n.ref, n]));
  assert.ok(byRef.A.x < byRef.B.x, "B right of A");
  assert.equal(byRef.A.y, byRef.B.y, "horizontal row shares y");
});

test("chained edges on one line", () => {
  const mesh = parseMermaidToMesh(`graph TD
    A --> B --> C`);
  assert.equal(mesh.nodes.length, 3);
  assert.equal(mesh.edges.length, 2);
});

test("rounded and stadium map to rounded-rect", () => {
  const mesh = parseMermaidToMesh(`flowchart TD
    A(Round) --> B([Stadium])`);
  const byRef = Object.fromEntries(mesh.nodes.map((n) => [n.ref, n]));
  assert.equal(byRef.A.shape, "rounded-rect");
  assert.equal(byRef.B.shape, "rounded-rect");
});

test("no header still parses edges", () => {
  const mesh = parseMermaidToMesh(`X[One] --> Y[Two]`);
  assert.equal(mesh.nodes.length, 2);
  assert.equal(mesh.edges.length, 1);
});

test("ignores comments and blank lines", () => {
  const mesh = parseMermaidToMesh(`graph TD
    %% this is a comment

    A --> B`);
  assert.equal(mesh.nodes.length, 2);
  assert.equal(mesh.edges.length, 1);
});

test("dedupes node defs, last shape wins on redefinition", () => {
  const mesh = parseMermaidToMesh(`graph TD
    A[First] --> B
    A{Decision} --> C`);
  const byRef = Object.fromEntries(mesh.nodes.map((n) => [n.ref, n]));
  assert.equal(byRef.A.shape, "diamond");
  assert.equal(mesh.nodes.length, 3);
});

test("empty / whitespace source yields empty mesh", () => {
  assert.deepEqual(parseMermaidToMesh("   \n  "), { nodes: [], edges: [] });
});
