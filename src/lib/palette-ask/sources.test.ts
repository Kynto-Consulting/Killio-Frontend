import assert from "node:assert/strict";
import test from "node:test";

import { describeToolInput, extractSources, humanizeTool, toolStatusKind } from "./sources.ts";

test("search_workspace results become source chips with in-app links", () => {
  const sources = extractSources([
    {
      tool: "search_workspace",
      phase: "done",
      success: true,
      output: {
        results: [
          { entityType: "board", entityId: "b1", sourceLabel: "Consolidado Dropout", snippet: "x" },
          { entityType: "document", entityId: "d1", sourceLabel: "Acta" },
          { entityType: "card", entityId: "c1", sourceLabel: "Tarea", boardId: "b1" },
          { entityType: "user", entityId: "u1", sourceLabel: "Ana" },
        ],
      },
    },
  ]);
  assert.deepEqual(sources.map((s) => [s.kind, s.id, s.title, s.href]), [
    ["board", "b1", "Consolidado Dropout", "/b/b1"],
    ["document", "d1", "Acta", "/d/d1"],
    ["card", "c1", "Tarea", "/b/b1"],
  ]);
});

test("tool-shaped outputs (board_*, document_*) are picked up and duplicates collapse", () => {
  const sources = extractSources([
    { tool: "board_get", phase: "done", output: { id: "b1", name: "Roadmap" } },
    { tool: "board_get", phase: "done", output: { id: "b1", name: "Roadmap" } },
    { tool: "document_get", phase: "done", output: { data: { id: "d9", title: "Plan" } } },
  ]);
  assert.deepEqual(sources.map((s) => `${s.kind}:${s.id}`), ["board:b1", "document:d9"]);
});

test("failed or still-running tools contribute no sources", () => {
  const sources = extractSources([
    { tool: "board_get", phase: "start", output: { id: "b1", name: "A" } },
    { tool: "board_get", phase: "done", success: false, output: { id: "b2", name: "B" } },
  ]);
  assert.deepEqual(sources, []);
});

test("a card row that names its board also cites the board; sources are capped", () => {
  const one = extractSources([{ tool: "kql_query", phase: "done", output: { rows: [{ boardId: "b7", boardName: "Ops" }] } }]);
  assert.deepEqual(one.map((s) => s.href), ["/b/b7"]);

  const many = extractSources([
    { tool: "search_workspace", phase: "done", output: { results: Array.from({ length: 20 }, (_, i) => ({ entityType: "document", entityId: `d${i}`, sourceLabel: `Doc ${i}` })) } },
  ]);
  assert.equal(many.length, 8);
});

test("a source with no title falls back to a short id", () => {
  const s = extractSources([{ tool: "search_workspace", phase: "done", output: { results: [{ entityType: "mesh", entityId: "abcdef123456" }] } }]);
  assert.equal(s[0]?.title, "abcdef12");
  assert.equal(s[0]?.href, "/m/abcdef123456");
});

test("toolStatusKind maps tools to the status verbs", () => {
  assert.equal(toolStatusKind("search_workspace"), "searching");
  assert.equal(toolStatusKind("web_search"), "searching");
  assert.equal(toolStatusKind("kql_query"), "querying");
  assert.equal(toolStatusKind("board_list"), "querying");
  assert.equal(toolStatusKind("card_create"), "running");
  assert.equal(humanizeTool("card_create"), "card create");
});

test("describeToolInput shows every field, nothing hidden; long values are cut", () => {
  const rows = describeToolInput({ title: "Nueva", listId: "l1", due: null, tags: ["a", "b"], notes: "x".repeat(900) });
  assert.deepEqual(rows.map((r) => r.key), ["title", "listId", "due", "tags", "notes"]);
  assert.equal(rows[0]?.value, "Nueva");
  assert.equal(rows[2]?.value, "—");
  assert.match(rows[3]?.value ?? "", /"a"/);
  assert.ok((rows[4]?.value.length ?? 0) <= 601);
  assert.deepEqual(describeToolInput(undefined), []);
});
