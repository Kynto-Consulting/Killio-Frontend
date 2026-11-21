import assert from "node:assert/strict";
import test from "node:test";

import {
  isMuteActive, LOADING_ROOM_ACCESS, muteMinutesLeft, normalizeRoomAccess, resolveRoomControls, sanitizeMuteDuration, sanitizeMuteReason,
} from "./room-controls.ts";

const NOW = Date.parse("2026-11-21T12:00:00Z");

test("legacy booleans: whoever can write can react and call", () => {
  const a = normalizeRoomAccess({ canPost: true, canCall: true, canManage: false, canInvite: false, canRecord: true });
  const c = resolveRoomControls(a, { roomType: "channel" });
  assert.equal(c.composer, "input");
  assert.equal(c.showReactions, true);
  assert.equal(c.showCall, true);
  assert.equal(c.showSettings, false);
  assert.equal(c.canDeleteOthers, false);
});

test("an announcement channel without post right swaps the input for a notice and hides react/call", () => {
  const a = normalizeRoomAccess({ canPost: false, canCall: false });
  const c = resolveRoomControls(a, { channelType: "announcement", roomType: "channel" });
  assert.equal(c.composer, "announcement");
  assert.equal(c.showReactions, false);
  assert.equal(c.showCall, false);
  assert.equal(c.canEditOwn, false);
  assert.equal(c.canReply, false);
});

test("a read-only text channel shows the generic read-only state", () => {
  const c = resolveRoomControls(normalizeRoomAccess({ canPost: false }), { channelType: "text" });
  assert.equal(c.composer, "readonly");
});

test("an explicit react right survives without post right (announcement with reactions)", () => {
  const a = normalizeRoomAccess({ canPost: false, canReact: true });
  const c = resolveRoomControls(a, { channelType: "announcement" });
  assert.equal(c.composer, "announcement");
  assert.equal(c.showReactions, true);
  assert.equal(c.showCall, false);
});

test("permission key list shape", () => {
  const a = normalizeRoomAccess({ permissions: ["room.view", "room.post", "room.react", "room.pin"] });
  assert.equal(a.canView, true);
  assert.equal(a.canPost, true);
  assert.equal(a.canCall, false);
  assert.equal(a.canPin, true);
  assert.equal(a.canManageMessages, false);
  const admin = normalizeRoomAccess({ permissions: ["administrator"] });
  assert.equal(admin.canManage, true);
  assert.equal(admin.canMentionEveryone, true);
});

test("manage messages implies pinning and deleting others", () => {
  const a = normalizeRoomAccess({ canPost: true, canManageMessages: true });
  const c = resolveRoomControls(a);
  assert.equal(c.canDeleteOthers, true);
  assert.equal(c.canPin, true);
});

test("@everyone needs the explicit right and a writable room", () => {
  assert.equal(resolveRoomControls(normalizeRoomAccess({ canPost: true })).canMentionEveryone, false);
  assert.equal(resolveRoomControls(normalizeRoomAccess({ canPost: true, canMentionEveryone: true })).canMentionEveryone, true);
  assert.equal(resolveRoomControls(normalizeRoomAccess({ canPost: false, canMentionEveryone: true })).canMentionEveryone, false);
});

test("a muted member keeps reading but cannot write, react, call or pin", () => {
  const a = normalizeRoomAccess({ canPost: true, canCall: true, canManageMessages: true, isMuted: true, mutedUntil: "2026-11-21T13:00:00Z" });
  const c = resolveRoomControls(a, { now: NOW });
  assert.equal(c.composer, "muted");
  assert.equal(c.showReactions, false);
  assert.equal(c.showCall, false);
  assert.equal(c.canPin, false);
  assert.equal(c.canDeleteOthers, false);
});

test("an expired mute no longer restricts", () => {
  const a = normalizeRoomAccess({ canPost: true, isMuted: true, mutedUntil: "2026-11-21T11:00:00Z" });
  assert.equal(isMuteActive(a, NOW), false);
  assert.equal(resolveRoomControls(a, { now: NOW }).composer, "input");
  assert.equal(isMuteActive({ isMuted: true, mutedUntil: null }, NOW), true, "no end date: stays until lifted");
});

test("remaining mute time is rounded up in minutes", () => {
  assert.equal(muteMinutesLeft({ mutedUntil: "2026-11-21T12:00:30Z" }, NOW), 1);
  assert.equal(muteMinutesLeft({ mutedUntil: "2026-11-21T13:00:00Z" }, NOW), 60);
  assert.equal(muteMinutesLeft({ mutedUntil: "2026-11-21T11:00:00Z" }, NOW), null);
  assert.equal(muteMinutesLeft({ mutedUntil: null }, NOW), null);
});

test("DMs never offer settings or moderation", () => {
  const a = normalizeRoomAccess({ canPost: true, canManage: true });
  const c = resolveRoomControls(a, { roomType: "dm" });
  assert.equal(c.showSettings, false);
  assert.equal(c.showModeration, false);
});

test("loading / failed answer offers nothing risky", () => {
  const c = resolveRoomControls(LOADING_ROOM_ACCESS);
  assert.equal(c.composer, "readonly");
  assert.equal(c.showCall, false);
  assert.equal(c.showSettings, false);
  const garbage = resolveRoomControls(normalizeRoomAccess(null));
  assert.equal(garbage.composer, "readonly");
});

test("mute form values are sanitized", () => {
  assert.equal(sanitizeMuteDuration(60), 60);
  assert.equal(sanitizeMuteDuration(null), null);
  assert.equal(sanitizeMuteDuration(7), 60);
  assert.equal(sanitizeMuteReason("  spam \n  repetido  "), "spam repetido");
  assert.equal(sanitizeMuteReason("x".repeat(500)).length, 200);
});
