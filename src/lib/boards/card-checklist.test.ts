import assert from "node:assert/strict";
import test from "node:test";

import { summarizeChecklists } from "./card-checklist.ts";

test("counts `tasks` of checklist-styled text bricks and `items` of checklist bricks together", () => {
  const s = summarizeChecklists([
    { kind: "text", displayStyle: "checklist", tasks: [{ id: "1", label: "Uno", checked: true }, { id: "2", label: "Dos", checked: false }] },
    { kind: "checklist", items: [{ id: "i1", label: "Tres", checked: false }, { id: "i2", label: " Cuatro  paso ", checked: true }] },
    { kind: "text", displayStyle: "paragraph", markdown: "no cuenta" },
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.done, 2);
  assert.deepEqual(s.pending.map((i) => i.label), ["Dos", "Tres"]);
  assert.deepEqual(s.completed.map((i) => i.label), ["Uno", "Cuatro paso"]);
});

test("reads API-shaped bricks whose data sits under content, and tolerates junk", () => {
  const s = summarizeChecklists([
    { block_type: "checklist", content: { items: [{ label: "A", checked: true }, null, "x", { text: "B" }] } },
    null,
    42,
  ] as unknown[]);
  assert.deepEqual([s.total, s.done], [2, 1]);
  assert.deepEqual(s.pending.map((i) => i.label), ["B"]);
});

test("a card without checklists is empty", () => {
  assert.deepEqual(summarizeChecklists(undefined), { total: 0, done: 0, pending: [], completed: [] });
  assert.equal(summarizeChecklists([{ kind: "text", displayStyle: "paragraph" }]).total, 0);
});
