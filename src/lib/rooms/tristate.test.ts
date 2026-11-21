import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAnnouncementPreset, applyPrivatePreset, detectPreset, draftsToDtos, EVERYONE, nextState, normalizeOverridesResponse, removeSubject, ROOM_PERMISSION_KEYS, setState,
  stateOf, subjectKey, summarize, toDraft, toDto, validateDrafts, type OverrideDraft,
} from "./tristate.ts";

const role = (id: string) => ({ subjectType: "role" as const, subjectId: id });

test("click cycle is inherit, allow, deny, inherit", () => {
  assert.equal(nextState("inherit"), "allow");
  assert.equal(nextState("allow"), "deny");
  assert.equal(nextState("deny"), "inherit");
});

test("dto round trip keeps allow and deny and drops empty rows", () => {
  const d = toDraft({ subjectType: "role", subjectId: "r1", allow: ["room.post", "room.pin"], deny: ["room.call"] });
  assert.equal(stateOf(d, "room.post"), "allow");
  assert.equal(stateOf(d, "room.call"), "deny");
  assert.equal(stateOf(d, "room.view"), "inherit");
  assert.deepEqual(toDto(d), { subjectType: "role", subjectId: "r1", allow: ["room.post", "room.pin"], deny: ["room.call"] });
  assert.equal(toDto({ subjectType: "member", subjectId: "u1", states: {} }), null);
});

test("a key stored as both allow and deny reads as deny; unknown keys are ignored", () => {
  const d = toDraft({ subjectType: "group", subjectId: "g1", allow: ["room.post", "bogus.key"], deny: ["room.post"] });
  assert.equal(stateOf(d, "room.post"), "deny");
  assert.deepEqual(toDto(d), { subjectType: "group", subjectId: "g1", allow: [], deny: ["room.post"] });
});

test("everyone never carries a subject id", () => {
  const d = toDraft({ subjectType: "everyone", subjectId: "zzz", allow: ["room.view"], deny: [] });
  assert.equal(d.subjectId, null);
  assert.equal(toDto(d)?.subjectId, null);
  assert.equal(subjectKey(EVERYONE), "everyone");
});

test("setState creates the row, updates it and removes the key on inherit, without mutating", () => {
  const start: OverrideDraft[] = [];
  const a = setState(start, role("r1"), "room.post", "allow");
  assert.deepEqual(start, []);
  assert.equal(a.length, 1);
  const b = setState(a, role("r1"), "room.post", "deny");
  assert.equal(stateOf(b[0], "room.post"), "deny");
  assert.equal(stateOf(a[0], "room.post"), "allow", "previous version untouched");
  const c = setState(b, role("r1"), "room.post", "inherit");
  assert.equal(draftsToDtos(c).length, 0);
  assert.equal(setState([], role("r1"), "room.post", "inherit").length, 0, "inherit on a missing row creates nothing");
});

test("removeSubject drops only that subject", () => {
  const drafts = setState(setState([], role("r1"), "room.post", "allow"), role("r2"), "room.view", "deny");
  assert.deepEqual(removeSubject(drafts, role("r1")).map(subjectKey), ["role:r2"]);
});

test("announcement preset: everyone cannot post, the chosen roles can", () => {
  const d = applyAnnouncementPreset([], ["r1", "r2"]);
  assert.deepEqual(draftsToDtos(d), [
    { subjectType: "everyone", subjectId: null, allow: [], deny: ["room.post"] },
    { subjectType: "role", subjectId: "r1", allow: ["room.post"], deny: [] },
    { subjectType: "role", subjectId: "r2", allow: ["room.post"], deny: [] },
  ]);
  assert.equal(detectPreset(d), "announcement");
  assert.deepEqual(validateDrafts(d), []);
});

test("announcement preset keeps other settings (reactions) and overwrites a previous post state", () => {
  const before = setState(setState([], role("r1"), "room.post", "deny"), EVERYONE, "room.react", "allow");
  const d = applyAnnouncementPreset(before, ["r1"]);
  assert.equal(stateOf(d.find((x) => subjectKey(x) === "role:r1"), "room.post"), "allow");
  assert.equal(stateOf(d.find((x) => subjectKey(x) === "everyone"), "room.react"), "allow");
  assert.equal(detectPreset(d), "custom", "extra react rule makes it custom");
});

test("private preset: hidden for everyone, visible and writable for the roles", () => {
  const d = applyPrivatePreset([], ["r7"]);
  assert.deepEqual(draftsToDtos(d), [
    { subjectType: "everyone", subjectId: null, allow: [], deny: ["room.view"] },
    { subjectType: "role", subjectId: "r7", allow: ["room.view", "room.post"], deny: [] },
  ]);
  assert.equal(detectPreset(d), "private");
});

test("detectPreset: no rules is open, anything else is custom", () => {
  assert.equal(detectPreset([]), "open");
  assert.equal(detectPreset([{ subjectType: "member", subjectId: "u1", states: {} }]), "open");
  assert.equal(detectPreset(setState([], role("r1"), "room.call", "deny")), "custom");
});

test("validation flags a channel nobody can see or write in", () => {
  assert.deepEqual(validateDrafts(setState([], EVERYONE, "room.view", "deny")), ["hidden_from_everyone"]);
  assert.deepEqual(validateDrafts(setState([], EVERYONE, "room.post", "deny")), ["nobody_can_post"]);
  const ok = setState(setState([], EVERYONE, "room.view", "deny"), role("r1"), "room.view", "allow");
  assert.deepEqual(validateDrafts(ok), []);
});

test("responses of any shape are normalised; garbage is ignored", () => {
  const row = { subjectType: "role", subjectId: "r1", allow: ["room.post"], deny: [] };
  assert.equal(normalizeOverridesResponse([row]).length, 1);
  assert.equal(normalizeOverridesResponse({ overrides: [row] }).length, 1);
  assert.equal(normalizeOverridesResponse({ data: [row] }).length, 1);
  assert.deepEqual(normalizeOverridesResponse(null), []);
  assert.deepEqual(normalizeOverridesResponse([{ subjectType: "robot", subjectId: "x" }, { subjectType: "role" }, 5]), []);
  assert.equal(normalizeOverridesResponse([row, row]).length, 1, "duplicate subject collapses");
});

test("summary counts allows and denies", () => {
  const d = toDraft({ subjectType: "role", subjectId: "r1", allow: ["room.post", "room.pin"], deny: ["room.call"] });
  assert.deepEqual(summarize(d), { allow: 2, deny: 1 });
});

test("the three pin keys are part of the channel editor and round-trip", () => {
  for (const k of ["room.pin_permanent", "room.unpin_others", "room.view_pins"]) assert.ok((ROOM_PERMISSION_KEYS as readonly string[]).includes(k), k);
  const d = toDraft({ subjectType: "role", subjectId: "r1", allow: ["room.pin_permanent"], deny: ["room.unpin_others", "room.view_pins"] });
  assert.deepEqual(toDto(d), { subjectType: "role", subjectId: "r1", allow: ["room.pin_permanent"], deny: ["room.unpin_others", "room.view_pins"] });
});
