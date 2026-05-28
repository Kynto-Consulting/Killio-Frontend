import assert from "node:assert/strict";
import test from "node:test";

import { captureTemplate, instantiateTemplate, type MeshTemplate } from "./mesh-templates.ts";

function brick(id: string, parentId: string | null, x: number, y: number, extra: Record<string, unknown> = {}): any {
  return { id, kind: "draw", parentId, position: { x, y }, size: { w: 100, h: 60 }, content: { ...extra } };
}

let seq = 0;
const makeId = (p: string) => `${p}_${++seq}`;

test("captureTemplate: normalizes roots to group bbox origin", () => {
  seq = 0;
  const bricksById = {
    a: brick("a", null, 200, 100),
    b: brick("b", null, 360, 100),
  };
  const tpl = captureTemplate("T", new Set(["a", "b"]), bricksById, {}, makeId)!;
  assert.ok(tpl);
  const a = tpl.bricks.find((x) => x.id === "a")!;
  const b = tpl.bricks.find((x) => x.id === "b")!;
  assert.deepEqual(a.position, { x: 0, y: 0 });
  assert.deepEqual(b.position, { x: 160, y: 0 });
});

test("captureTemplate: includes descendants and keeps only inside connections", () => {
  seq = 0;
  const bricksById = {
    board: brick("board", null, 0, 0, { childOrder: ["child"], isContainer: true }),
    child: brick("child", "board", 10, 20),
    outside: brick("outside", null, 999, 999),
  };
  const connectionsById = {
    c1: { id: "c1", cons: ["board", "child"], label: { type: "doc", content: [] } },
    c2: { id: "c2", cons: ["board", "outside"], label: { type: "doc", content: [] } },
  } as any;
  const tpl = captureTemplate("T", new Set(["board"]), bricksById, connectionsById, makeId)!;
  assert.equal(tpl.bricks.length, 2);
  assert.equal(tpl.connections.length, 1);
  assert.equal(tpl.connections[0].cons[1], "child");
});

test("instantiateTemplate: remaps ids, offsets roots, preserves child relative pos", () => {
  seq = 0;
  const tpl: MeshTemplate = {
    id: "t1",
    name: "T",
    bricks: [
      brick("board", null, 0, 0, { childOrder: ["child"] }),
      brick("child", "board", 10, 20),
    ],
    connections: [{ id: "c1", cons: ["board", "child"], label: { type: "doc", content: [] } } as any],
  };
  const { bricks, connections } = instantiateTemplate(tpl, { x: 500, y: 300 }, makeId);
  const root = bricks.find((b) => b.parentId === null)!;
  const child = bricks.find((b) => b.parentId !== null)!;
  // new ids, not original
  assert.notEqual(root.id, "board");
  assert.equal(root.parentId, null);
  assert.deepEqual(root.position, { x: 500, y: 300 }, "root offset applied");
  assert.deepEqual(child.position, { x: 10, y: 20 }, "child keeps relative pos");
  assert.equal(child.parentId, root.id, "child reparented to new root id");
  // childOrder remapped
  assert.deepEqual((root.content as any).childOrder, [child.id]);
  // connection remapped
  assert.equal(connections.length, 1);
  assert.deepEqual(connections[0].cons, [root.id, child.id]);
  assert.notEqual(connections[0].id, "c1");
});

test("captureTemplate: empty selection returns null", () => {
  assert.equal(captureTemplate("T", new Set(), {}, {}, makeId), null);
});
