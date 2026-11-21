import assert from "node:assert/strict";
import { test } from "node:test";

import { auditActionKey, humanizeKey, summarizeMetadata } from "./audit.ts";
import { assignBlockReason, type Actor, type TeamRole } from "./model.ts";

test("auditActionKey turns dotted actions into i18n-safe keys", () => {
  assert.equal(auditActionKey("group.roles_changed"), "group_roles_changed");
  assert.equal(auditActionKey("role.created"), "role_created");
});

test("humanizeKey gives a readable fallback", () => {
  assert.equal(humanizeKey("foo.bar_baz"), "Foo bar baz");
  assert.equal(humanizeKey("roleIds"), "Role ids");
});

test("summarizeMetadata resolves ids, skips objects and caps the items", () => {
  const out = summarizeMetadata({ roleIds: ["r1", "x"], name: "Ops", nested: { a: 1 }, empty: "", n: 3, a: 1, b: 2 }, (id) => (id === "r1" ? "Viewer" : null), 3);
  assert.deepEqual(out, [{ key: "roleIds", value: "Viewer, x" }, { key: "name", value: "Ops" }, { key: "n", value: "3" }]);
});

test("assignBlockReason follows the server's manageableRoleIds when present", () => {
  const role = (id: string, position: number): TeamRole => ({ id, name: id, color: null, position, permissions: {}, isSystem: false, systemKey: null, isDefault: false, mentionable: false });
  const actor: Actor = { isOwner: false, permissions: new Set(), highestPosition: 10, manageableRoleIds: new Set(["viewer"]) };
  assert.equal(assignBlockReason(actor, role("viewer", 50)), null);
  assert.equal(assignBlockReason(actor, role("other", 1)), "position");
});

test("inviteActor prefers invitableRoleIds over manageableRoleIds", async () => {
  const { inviteActor } = await import("./model.ts");
  const a: Actor = { isOwner: false, permissions: new Set(), highestPosition: 1, manageableRoleIds: new Set(["a"]), invitableRoleIds: new Set(["a", "viewer"]) };
  assert.ok(inviteActor(a).manageableRoleIds!.has("viewer"));
  assert.ok(!a.manageableRoleIds!.has("viewer"));
});
