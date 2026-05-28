import assert from "node:assert/strict";
import test from "node:test";

import { docToKd, kdToDocDraft, boardToKb, kbToBoardDraft, scriptToKs, ksToScriptDraft } from "./adapters.ts";

// ── documents ────────────────────────────────────────────────────────────────
test("docToKd sorts bricks by position + keeps id/kind/content", () => {
  const kd = docToKd({ id: "d1", title: "Doc", bricks: [
    { id: "b", kind: "text", position: 1, content: { markdown: "two" } },
    { id: "a", kind: "table", position: 0, content: { rows: [["x"]] } },
  ] });
  assert.equal(kd.title, "Doc");
  assert.deepEqual(kd.bricks.map((b) => b.id), ["a", "b"]);
  assert.equal(kd.bricks[1].kind, "text");
});

test("kdToDocDraft tolerates missing fields", () => {
  const draft = kdToDocDraft({ bricks: [{ kind: "text", content: { markdown: "x" } }] });
  assert.equal(draft.title, "Untitled");
  assert.equal(draft.bricks.length, 1);
  assert.equal(draft.bricks[0].position, 0);
});

test("doc roundtrip preserves bricks", () => {
  const doc = { id: "d", title: "T", bricks: [{ id: "a", kind: "text", position: 0, content: { markdown: "hi" } }] };
  const back = kdToDocDraft(docToKd(doc));
  assert.deepEqual(back.bricks[0], { id: "a", kind: "text", position: 0, content: { markdown: "hi" } });
});

// ── kanban ───────────────────────────────────────────────────────────────────
test("boardToKb maps lists/cards/tags/blocks", () => {
  const kb = boardToKb({ id: "b1", name: "Board", lists: [
    { id: "l1", name: "To Do", cards: [{ id: "c1", title: "Card", status: "active", urgency: "urgent", tags: [{ name: "p1", color: "#f00", tag_kind: "native" }], blocks: [{ id: "x", kind: "text" }] }] },
  ] });
  assert.equal(kb.name, "Board");
  assert.equal(kb.lists[0].name, "To Do");
  assert.equal(kb.lists[0].cards[0].title, "Card");
  assert.equal(kb.lists[0].cards[0].urgency, "urgent");
  assert.equal(kb.lists[0].cards[0].tags?.[0].name, "p1");
  assert.equal((kb.lists[0].cards[0].blocks as unknown[]).length, 1);
});

test("boardToKb defaults appearance + visibility", () => {
  const kb = boardToKb({ name: "X" });
  assert.equal(kb.boardType, "kanban");
  assert.equal(kb.backgroundKind, "none");
  assert.equal(kb.visibility, "team");
  assert.deepEqual(kb.lists, []);
});

test("kbToBoardDraft roundtrips core fields", () => {
  const kb = boardToKb({ id: "b", name: "B", description: "d", lists: [{ name: "L", cards: [] }] });
  const back = kbToBoardDraft(kb);
  assert.equal(back.name, "B");
  assert.equal(back.description, "d");
  assert.equal(back.lists[0].name, "L");
});

// ── scripts ────────────────────────────────────────────────────────────────────
test("scriptToKs merges summary + graph", () => {
  const ks = scriptToKs(
    { id: "s1", name: "Flow", description: "d", triggerType: "manual", triggerConfig: { a: 1 } },
    { nodes: [{ id: "n1", nodeKind: "core.trigger.manual", label: null, config: {}, positionX: 0, positionY: 0 }], edges: [] },
  );
  assert.equal(ks.name, "Flow");
  assert.equal(ks.triggerType, "manual");
  assert.equal(ks.nodes.length, 1);
});

test("ksToScriptDraft drops edges to unknown nodes", () => {
  const draft = ksToScriptDraft({
    name: "F", nodes: [{ id: "n1", nodeKind: "core.trigger.manual", config: {}, positionX: 0, positionY: 0 }],
    edges: [{ id: "e1", sourceNodeId: "n1", targetNodeId: "ghost", sourceHandle: null, targetHandle: null }],
  });
  assert.equal(draft.graph.nodes.length, 1);
  assert.equal(draft.graph.edges.length, 0);
});

test("script roundtrip preserves nodes/edges", () => {
  const summary = { id: "s", name: "F", description: null, triggerType: "manual", triggerConfig: {} };
  const graph = {
    nodes: [
      { id: "n1", nodeKind: "core.trigger.manual", label: null, config: {}, positionX: 0, positionY: 0 },
      { id: "n2", nodeKind: "core.action.delay", label: "wait", config: { ms: 100 }, positionX: 10, positionY: 20 },
    ],
    edges: [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n2", sourceHandle: null, targetHandle: null }],
  };
  const back = ksToScriptDraft(scriptToKs(summary, graph));
  assert.equal(back.graph.nodes.length, 2);
  assert.equal(back.graph.edges.length, 1);
  assert.equal(back.summary.name, "F");
});
