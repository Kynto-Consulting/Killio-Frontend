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

import {
  applyBotsPreset, applyModerationPreset, applyReadonlyPreset, availablePresets, BOTS_PRESET_DENY_KEYS,
} from "./tristate.ts";

test("drafts carry any key of the server's universe and the dto keeps the universe's order", () => {
  const universe = ["room.view", "room.post", "room.call.screen_share", "ext.acme.sync"];
  const d = toDraft({ subjectType: "role", subjectId: "r1", allow: ["ext.acme.sync", "room.post"], deny: ["room.call.screen_share", "room.pin"] }, universe);
  assert.equal(stateOf(d, "ext.acme.sync"), "allow");
  assert.equal(stateOf(d, "room.pin"), "inherit", "outside the universe: dropped, the server would refuse it");
  assert.deepEqual(toDto(d, universe), { subjectType: "role", subjectId: "r1", allow: ["room.post", "ext.acme.sync"], deny: ["room.call.screen_share"] });
  assert.equal(draftsToDtos([d], universe).length, 1);
});

test("degraded mode: without a catalog the fixed list is the scope", () => {
  const d = toDraft({ subjectType: "role", subjectId: "r1", allow: ["room.call.screen_share", "room.post"], deny: [] });
  assert.equal(stateOf(d, "room.call.screen_share"), "inherit");
  assert.deepEqual(toDto(d)?.allow, ["room.post"]);
});

test("normalizeOverridesResponse honours the universe", () => {
  const raw = { overrides: [{ subjectType: "everyone", subjectId: null, allow: ["room.call.video"], deny: ["room.post"] }] };
  assert.equal(stateOf(normalizeOverridesResponse(raw, ["room.post", "room.call.video"])[0], "room.call.video"), "allow");
  assert.equal(stateOf(normalizeOverridesResponse(raw)[0], "room.call.video"), "inherit");
});

test("summarize can be limited to a scope", () => {
  const d = toDraft({ subjectType: "role", subjectId: "r1", allow: ["room.post", "room.pin"], deny: ["room.call"] });
  assert.deepEqual(summarize(d, ["room.post", "room.call"]), { allow: 1, deny: 1 });
});

test("read-only preset: everyone cannot write or react, nobody is promoted", () => {
  const d = applyReadonlyPreset([]);
  assert.deepEqual(draftsToDtos(d), [{ subjectType: "everyone", subjectId: null, allow: [], deny: ["room.post", "room.react"] }]);
  assert.equal(detectPreset(d), "readonly");
  assert.deepEqual(validateDrafts(d), ["nobody_can_post"]);
});

test("read-only preset skips keys the server does not have", () => {
  const d = applyReadonlyPreset([], new Set(["room.view", "room.post"]));
  assert.deepEqual(draftsToDtos(d)[0].deny, ["room.post"]);
  assert.equal(applyReadonlyPreset([], new Set(["room.view"])).length, 0);
});

test("moderation preset: hidden for everyone, the chosen roles see, write and moderate", () => {
  const d = applyModerationPreset([], ["mod"]);
  const row = d.find((x) => subjectKey(x) === "role:mod")!;
  assert.deepEqual(draftsToDtos([row])[0].allow, ["room.view", "room.post", "room.manage_messages", "room.view_audit"].filter((k) => ROOM_PERMISSION_KEYS.includes(k as never)));
  assert.equal(stateOf(d.find((x) => subjectKey(x) === "everyone"), "room.view"), "deny");
  assert.equal(detectPreset(d), "moderation");
  assert.deepEqual(validateDrafts(d), []);
});

test("moderation preset with the full universe also grants the log; a plain private channel is not a moderation channel", () => {
  const universe = ["room.view", "room.post", "room.manage_messages", "room.view_audit"];
  const d = applyModerationPreset([], ["mod"], new Set(universe));
  assert.deepEqual(draftsToDtos(d, universe)[1].allow, universe);
  assert.equal(detectPreset(applyPrivatePreset([], ["r"])), "private");
});

test("bots preset: commands and buttons for everybody, no threads / attachments / blocks / @everyone", () => {
  const d = applyBotsPreset([]);
  const row = d[0];
  assert.equal(stateOf(row, "room.use_commands"), "allow");
  assert.equal(stateOf(row, "room.use_components"), "allow");
  for (const k of BOTS_PRESET_DENY_KEYS) assert.equal(stateOf(row, k), "deny", k);
  assert.equal(stateOf(row, "room.post"), "inherit", "free text is not touched: the server has no key for commands-only");
  assert.equal(detectPreset(d), "bots");
});

test("presets are only offered when the universe has their anchor keys", () => {
  assert.deepEqual(availablePresets(), ["announcement", "private", "readonly", "moderation", "bots"]);
  assert.deepEqual(availablePresets(new Set(["room.view", "room.post"])), ["announcement", "private", "readonly"]);
  assert.deepEqual(availablePresets(new Set(["room.view", "room.post", "room.manage_messages", "room.use_commands"])), ["announcement", "private", "readonly", "moderation", "bots"]);
  assert.deepEqual(availablePresets(new Set(["room.react"])), []);
});

test("presets keep working with the keys of a server catalog (fine keys follow their parent, nothing extra is written)", () => {
  const universe = new Set(["room.view", "room.post", "room.react", "room.attach_files", "room.call.screen_share"]);
  const d = applyAnnouncementPreset([], ["r1"], universe);
  assert.deepEqual(draftsToDtos(d, [...universe]).map((x) => x.deny.concat(x.allow)), [["room.post"], ["room.post"]]);
  assert.equal(detectPreset(d), "announcement");
});
