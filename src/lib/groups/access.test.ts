import assert from "node:assert/strict";
import { test } from "node:test";

import { addableGroups, canGrantRole, canModifyGroupRole, grantableRoles, roleRank } from "./access.ts";

test("owner grants every role", () => {
  assert.deepEqual(grantableRoles("owner"), ["owner", "admin", "member", "viewer", "guest"]);
});

test("admin grants up to admin, member up to member", () => {
  assert.deepEqual(grantableRoles("admin"), ["admin", "member", "viewer", "guest"]);
  assert.deepEqual(grantableRoles("member"), ["member", "viewer", "guest"]);
});

test("viewer/guest/unknown grant little or nothing", () => {
  assert.deepEqual(grantableRoles("guest"), ["guest"]);
  assert.deepEqual(grantableRoles("nope"), []);
  assert.deepEqual(grantableRoles(null), []);
});

test("canGrantRole never above own role", () => {
  assert.equal(canGrantRole("admin", "owner"), false);
  assert.equal(canGrantRole("admin", "admin"), true);
  assert.equal(canGrantRole("admin", "bogus"), false);
  assert.equal(canModifyGroupRole("member", "admin"), false);
});

test("roleRank", () => {
  assert.equal(roleRank("owner"), 5);
  assert.equal(roleRank(undefined), 0);
});

test("addableGroups excludes groups already with access", () => {
  const groups = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(addableGroups(groups, [{ groupId: "b" }]), [{ id: "a" }, { id: "c" }]);
  assert.deepEqual(addableGroups(groups, []), groups);
});
