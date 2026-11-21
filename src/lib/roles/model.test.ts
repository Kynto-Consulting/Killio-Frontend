import assert from "node:assert/strict";
import test from "node:test";

import {
  assignableRoles, assignBlockReason, canManageRole, canMoveRole, confirmationMatches, dropId, effectiveRoles, enforcePinned, fallbackPermissions,
  filterMembers, groupHeldPermissions, inviteState, highestPositionOf, isEmptyOverride, makeCan, memberActionBlockReason, memberRoleIds, moveId,
  normalizeOverride, normalizePermissions, normalizeRole, overrideState, paginate, permissionBlockReason, permissionsChanged,
  positionsFromOrder, resourceLevel, setOverrideState, setTriState, simulateTeamPermission, sortRoles, summarizeInvite, triStateVisual,
  type Actor, type TeamRole,
} from "./model.ts";

const role = (id: string, position: number, extra: Partial<TeamRole> = {}): TeamRole => ({
  id, name: id, color: null, position, permissions: {}, isSystem: false, systemKey: null, isDefault: false, mentionable: false, ...extra,
});
const owner = role("owner", 500, { systemKey: "owner", isSystem: true });
const admin = role("admin", 400, { systemKey: "admin", isSystem: true, permissions: { "members.kick": "allow", "boards.create": "allow" } });
const mod = role("mod", 350, { permissions: { "members.kick": "allow" } });
const member = role("member", 300, { systemKey: "member", isDefault: true, isSystem: true, permissions: { "boards.create": "allow" } });
const roles = [member, mod, owner, admin];

const actorOf = (isOwner: boolean, perms: string[], pos: number): Actor => ({ isOwner, permissions: new Set(perms), highestPosition: pos });

test("sortRoles: highest position first, stable by name", () => {
  assert.deepEqual(sortRoles(roles).map((r) => r.id), ["owner", "admin", "mod", "member"]);
  assert.deepEqual(sortRoles([role("b", 1), role("a", 1)]).map((r) => r.id), ["a", "b"]);
});

test("moveId and dropId reorder without mutating", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(moveId(ids, "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveId(ids, "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moveId(ids, "c", 1), ["a", "b", "c"]);
  assert.deepEqual(dropId(ids, "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(dropId(ids, "a", "c"), ["b", "c", "a"]);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

test("enforcePinned keeps owner on top and the default role at the bottom", () => {
  assert.deepEqual(enforcePinned(["member", "mod", "owner", "admin"], roles), ["owner", "mod", "admin", "member"]);
});

test("canMoveRole: pinned roles and roles above the actor are not movable", () => {
  const ordered = sortRoles(roles);
  const a = actorOf(false, [], 400); // admin
  assert.equal(canMoveRole(a, ordered, "mod", -1), false); // above is admin (not below actor)
  assert.equal(canMoveRole(a, ordered, "mod", 1), false); // below is the default role (pinned)
  const o = actorOf(true, [], 500);
  assert.equal(canMoveRole(o, ordered, "admin", -1), false); // owner pinned
  assert.equal(canMoveRole(o, ordered, "admin", 1), true);
});

test("positionsFromOrder gives strictly decreasing positions", () => {
  assert.deepEqual(positionsFromOrder(["a", "b", "c"]), { a: 30, b: 20, c: 10 });
});

test("canManageRole: strict hierarchy, owner exempt, nobody touches the owner role", () => {
  assert.equal(canManageRole(actorOf(false, [], 400), mod), true);
  assert.equal(canManageRole(actorOf(false, [], 400), admin), false); // same level
  assert.equal(canManageRole(actorOf(false, [], 400), owner), false);
  assert.equal(canManageRole(actorOf(true, [], 500), owner), false);
  assert.equal(canManageRole(actorOf(true, [], 500), admin), true);
});

test("permissionBlockReason explains each case", () => {
  const a = actorOf(false, ["boards.create"], 400);
  assert.equal(permissionBlockReason(a, owner, "boards.create"), "owner_role");
  assert.equal(permissionBlockReason(a, admin, "boards.create"), "position");
  assert.equal(permissionBlockReason(a, mod, "boards.create"), null);
  assert.equal(permissionBlockReason(a, mod, "billing.manage"), "not_owned");
  assert.equal(permissionBlockReason(a, mod, "administrator"), "owner_only");
  assert.equal(permissionBlockReason(actorOf(true, [], 500), mod, "administrator"), null);
  assert.equal(permissionBlockReason(actorOf(false, ["administrator"], 400), mod, "billing.manage"), null);
});

test("memberActionBlockReason: self, owner, no permission, position", () => {
  const a = actorOf(false, ["members.kick"], 350);
  const t = (id: string, pos: number, isOwner = false) => ({ userId: id, isOwner, highestPosition: pos });
  assert.equal(memberActionBlockReason(a, "me", t("me", 100), "members.kick"), "self");
  assert.equal(memberActionBlockReason(a, "me", t("o", 500, true), "members.kick"), "target_owner");
  assert.equal(memberActionBlockReason(a, "me", t("x", 100), "members.ban"), "no_permission");
  assert.equal(memberActionBlockReason(a, "me", t("x", 350), "members.kick"), "position");
  assert.equal(memberActionBlockReason(a, "me", t("x", 300), "members.kick"), null);
  assert.equal(memberActionBlockReason(actorOf(true, [], 500), "me", t("x", 400), "members.ban"), null);
});

test("normalizePermissions accepts text[] and jsonb maps and drops garbage", () => {
  assert.deepEqual(normalizePermissions(["a", "b"]), { a: "allow", b: "allow" });
  assert.deepEqual(normalizePermissions({ a: "allow", b: "deny", c: "inherit", d: 3 }), { a: "allow", b: "deny" });
  assert.deepEqual(normalizePermissions(null), {});
  const r = normalizeRole({ id: 1, name: "X", color: "red", position: "7", permissions: ["a"], is_system: true, system_key: "admin" });
  assert.equal(r.color, null);
  assert.equal(r.position, 7);
  assert.equal(r.isSystem, true);
  assert.equal(r.systemKey, "admin");
});

test("tri-state set/visual/changed", () => {
  let m = setTriState({}, "a", "allow");
  m = setTriState(m, "b", "deny");
  assert.deepEqual(m, { a: "allow", b: "deny" });
  assert.deepEqual(setTriState(m, "a", "inherit"), { b: "deny" });
  assert.equal(triStateVisual("allow").glyph, "✓");
  assert.equal(triStateVisual("deny").glyph, "✗");
  assert.equal(triStateVisual("inherit").glyph, "–");
  assert.equal(permissionsChanged({ a: "allow" }, { a: "allow" }), false);
  assert.equal(permissionsChanged({ a: "allow" }, { a: "deny" }), true);
  assert.equal(permissionsChanged({}, { a: "deny" }), true);
});

test("cascade: groups first, then personal, then default; deny beats nothing; owner passes", () => {
  const g = role("g", 320, { permissions: { "boards.create": "deny" } });
  const p = role("p", 330, { permissions: { "boards.create": "allow", "rooms.create": "allow" } });
  const base = { isOwner: false, groupRoles: [g], personalRoles: [p], defaultRole: member };
  assert.deepEqual(simulateTeamPermission("boards.create", base).state, "deny"); // group wins over personal
  assert.equal(simulateTeamPermission("rooms.create", base).state, "allow");
  const src = simulateTeamPermission("rooms.create", base).source;
  assert.equal(src.layer, "personal");
  assert.equal(simulateTeamPermission("billing.manage", base).state, "deny"); // all inherit => deny
  assert.equal(simulateTeamPermission("billing.manage", { ...base, isOwner: true }).state, "allow");
  const adm = role("adm", 400, { permissions: { administrator: "allow" } });
  assert.equal(simulateTeamPermission("billing.manage", { ...base, personalRoles: [adm] }).state, "allow");
  const denyAdm = role("da", 340, { permissions: { administrator: "deny" } });
  assert.equal(simulateTeamPermission("billing.manage", { isOwner: false, groupRoles: [denyAdm], personalRoles: [adm], defaultRole: null }).state, "deny");
});

test("memberRoleIds falls back to the legacy role; effectiveRoles reports origin", () => {
  assert.deepEqual(memberRoleIds({ role: "member" }, roles), ["member"]);
  assert.deepEqual(memberRoleIds({ role: "nope" }, roles), []);
  assert.deepEqual(memberRoleIds({ roleIds: ["mod"], role: "member" }, roles), ["mod"]);
  const groups = [{ id: "g1", name: "Mods", memberUserIds: ["u1"], roleIds: ["admin"] }];
  const eff = effectiveRoles({ userId: "u1", roleIds: ["member"] }, roles, groups);
  assert.deepEqual(eff.map((e) => [e.role.id, e.source.kind]), [["admin", "group"], ["member", "personal"]]);
  assert.equal(highestPositionOf(["member", "mod"], roles), 350);
});

test("assignableRoles: below the actor, never owner, only permissions the actor owns", () => {
  const rich = role("rich", 200, { permissions: { "billing.manage": "allow" } });
  const all = [...roles, rich];
  const a = actorOf(false, ["boards.create", "members.kick"], 400);
  assert.deepEqual(assignableRoles(a, all).map((r) => r.id), ["mod", "member"]);
  assert.equal(assignBlockReason(a, rich), "not_owned");
  assert.equal(assignBlockReason(a, admin), "position");
  assert.equal(assignBlockReason(a, owner), "owner_role");
  assert.deepEqual(assignableRoles(actorOf(true, [], 500), all).map((r) => r.id), ["admin", "mod", "member", "rich"]);
});

test("summarizeInvite lists chosen roles, groups and roles that arrive through groups", () => {
  const groups = [{ id: "g1", name: "Mods", roleIds: ["mod", "member"] }];
  const s = summarizeInvite({ roleIds: ["member"], groupIds: ["g1"], roles, groups });
  assert.deepEqual(s.roles.map((r) => r.id), ["member"]);
  assert.deepEqual(s.viaGroupRoles.map((r) => r.id), ["mod"]);
  assert.equal(s.usesDefault, false);
  assert.equal(summarizeInvite({ roleIds: [], groupIds: [], roles, groups }).usesDefault, true);
});

test("groupHeldPermissions groups by area; administrator collapses everything", () => {
  const g = groupHeldPermissions(["boards.create", "members.kick", "x.unknown"]);
  assert.deepEqual(g.map((x) => x.group), ["members", "content"]);
  assert.deepEqual(groupHeldPermissions(["administrator", "boards.create"]), [{ group: "general", keys: ["administrator"] }]);
});

test("filterMembers and paginate", () => {
  const ms = [
    { id: "1", name: "Ana", alias: null, primaryEmail: "a@x.com" },
    { id: "2", name: "Beto", alias: "Jefe", primaryEmail: "b@x.com" },
  ];
  const opts = { roleIdsOf: (m: { id: string }) => (m.id === "1" ? ["mod"] : ["member"]), groupIdsOf: () => ["g"] };
  assert.equal(filterMembers(ms, { ...opts, query: "jefe" }).length, 1);
  assert.equal(filterMembers(ms, { ...opts, roleId: "mod" })[0].id, "1");
  assert.equal(filterMembers(ms, { ...opts, groupId: "zzz" }).length, 0);
  const p = paginate([1, 2, 3, 4, 5], 9, 2);
  assert.deepEqual(p, { items: [5], pages: 3, page: 3 });
  assert.equal(paginate([], 1, 10).pages, 1);
});

test("confirmationMatches needs the exact name", () => {
  assert.equal(confirmationMatches(" Acme ", "Acme"), true);
  assert.equal(confirmationMatches("acme", "Acme"), false);
  assert.equal(confirmationMatches("", ""), false);
});

test("resource overrides: tri-state edit, empty detection, normalisation, level", () => {
  let o = normalizeOverride({ subjectType: "role", subjectId: 7, allow: ["resource.view"], deny: [] });
  assert.equal(o.subjectId, "7");
  assert.equal(overrideState(o, "resource.view"), "allow");
  o = setOverrideState(o, "resource.edit", "deny");
  assert.equal(overrideState(o, "resource.edit"), "deny");
  o = setOverrideState(o, "resource.edit", "inherit");
  o = setOverrideState(o, "resource.view", "inherit");
  assert.equal(isEmptyOverride(o), true);
  assert.equal(normalizeOverride({ subjectType: "weird" }).subjectType, "everyone");
  assert.equal(normalizeOverride({ subjectType: "everyone", subjectId: "x" }).subjectId, null);
  assert.equal(resourceLevel(["resource.view", "resource.edit"]), "edit");
  assert.equal(resourceLevel(["resource.manage"]), "manage");
  assert.equal(resourceLevel([]), "none");
});

test("makeCan / fallbackPermissions never open more than the legacy roles did", () => {
  assert.equal(makeCan(null)("boards.create"), false);
  assert.equal(makeCan({ isOwner: true, permissions: [] })("anything"), true);
  assert.equal(makeCan({ isOwner: false, permissions: ["administrator"] })("billing.manage"), true);
  const can = makeCan({ isOwner: false, permissions: ["boards.create"] });
  assert.equal(can("boards.create"), true);
  assert.equal(can("billing.manage"), false);
  const guest = makeCan(fallbackPermissions("guest"));
  assert.equal(guest("scripts.manage"), false);
  assert.equal(guest("sql.query"), true);
  assert.equal(makeCan(fallbackPermissions("admin"))("scripts.manage"), true);
  assert.equal(makeCan(fallbackPermissions("member"))("scripts.manage"), false);
  assert.equal(makeCan(fallbackPermissions(undefined))("sql.query"), false);
});

test("inviteState: expired, used up, revoked, active link, pending email invite", () => {
  const now = Date.parse("2026-11-21T00:00:00Z");
  assert.equal(inviteState({ status: "pending", expiresAt: "2026-11-20T00:00:00Z" }, now), "expired");
  assert.equal(inviteState({ status: "pending", expiresAt: "2026-11-30T00:00:00Z" }, now), "pending");
  assert.equal(inviteState({ maxUses: 3, useCount: 3 }, now), "used");
  assert.equal(inviteState({ maxUses: 3, useCount: 1, expiresAt: null }, now), "active");
  assert.equal(inviteState({ maxUses: null, useCount: 5 }, now), "active");
  assert.equal(inviteState({ status: "accepted" }, now), "used");
  assert.equal(inviteState({ status: "revoked" }, now), "revoked");
});
