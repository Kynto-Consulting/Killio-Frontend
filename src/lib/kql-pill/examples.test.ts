import test from "node:test";
import assert from "node:assert/strict";
import { kqlGuideExamples } from "./examples.ts";

test("extracts example lines and drops comments", () => {
  const guide = `Intro\n  not an example in the intro\nExamples:\n  cards where overdue count            -- late\n  documents group by month(created) count\n\nTrailing`;
  assert.deepEqual(kqlGuideExamples(guide), ["cards where overdue count", "documents group by month(created) count"]);
  assert.deepEqual(kqlGuideExamples("nothing"), []);
  assert.equal(kqlGuideExamples(guide, 1).length, 1);
});
