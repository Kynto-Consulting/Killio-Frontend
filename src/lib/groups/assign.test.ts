import test from "node:test";
import assert from "node:assert/strict";

import { membersToAssign } from "./assign.ts";

test("returns only members not yet assigned, keeping order", () => {
  assert.deepEqual(membersToAssign({ memberUserIds: ["a", "b", "c", "d"] }, ["b", "x"]), ["a", "c", "d"]);
});

test("returns nothing when everyone is assigned", () => {
  assert.deepEqual(membersToAssign({ memberUserIds: ["a", "b"] }, ["b", "a"]), []);
});

test("handles empty groups and duplicates", () => {
  assert.deepEqual(membersToAssign({ memberUserIds: [] }, ["a"]), []);
  assert.deepEqual(membersToAssign({ memberUserIds: ["a", "a", "b"] }, []), ["a", "b"]);
});
