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

test("the pin keys: pin, pin without expiry, unpin others and see pins are separate rights", () => {
  const basic = normalizeRoomAccess({ permissions: ["room.view", "room.pin"] });
  assert.equal(basic.canPin, true);
  assert.equal(basic.canPinPermanent, false);
  assert.equal(basic.canUnpinOthers, false);
  assert.equal(basic.canViewPins, false);
  const more = normalizeRoomAccess({ permissions: ["room.view", "room.pin", "room.pin_permanent", "room.unpin_others", "room.view_pins"] });
  assert.equal(more.canPinPermanent && more.canUnpinOthers && more.canViewPins, true);
  const admin = normalizeRoomAccess({ permissions: ["administrator"] });
  assert.equal(admin.canPinPermanent && admin.canUnpinOthers, true);
  const legacy = normalizeRoomAccess({ canPost: true, canPin: true });
  assert.equal(legacy.canPinPermanent, false);
  assert.equal(legacy.canViewPins, true, "an old server without the key does not hide the pins");
});

test("fine call rights come from the key list; an old server without them falls back to room.call", () => {
  const modern = normalizeRoomAccess({ canStartCall: true, permissions: ["room.view", "room.call", "room.call.start", "room.call.join", "room.call.speak"] });
  assert.equal(modern.canStartCall, true);
  assert.equal(modern.canSpeak, true);
  assert.equal(modern.canVideo, false, "room.call alone no longer opens the camera once the server speaks fine keys");
  assert.equal(modern.canShareScreen, false);
  const c = resolveRoomControls(modern, { roomType: "channel" });
  assert.deepEqual(c.call, { start: true, join: true, speak: true, video: false, screenShare: false, muteOthers: false, removeParticipants: false });
  assert.equal(c.showCall, true);

  const old = normalizeRoomAccess({ permissions: ["room.view", "room.post", "room.call"] });
  assert.equal(old.canVideo && old.canShareScreen && old.canSpeak && old.canStartCall && old.canJoinCall, true);
  assert.equal(old.canMuteOthers, false);
});

test("the canXxx flags alone mark a modern server even when every fine key is denied", () => {
  const a = normalizeRoomAccess({ canStartCall: false, canJoinCall: false, permissions: ["room.view", "room.call"] });
  assert.equal(a.canJoinCall, false);
  assert.equal(a.canVideo, false);
});

test("legacy booleans: fine call flags default to canCall and moderation to canManage", () => {
  const a = normalizeRoomAccess({ canPost: true, canCall: true, canManage: true });
  assert.equal(a.canVideo && a.canShareScreen && a.canSpeak, true);
  assert.equal(a.canMuteOthers && a.canRemoveParticipants, true);
  const b = normalizeRoomAccess({ canPost: true, canCall: true, canVideo: false, canShareScreen: false });
  assert.equal(b.canVideo, false);
  assert.equal(b.canSpeak, true);
});

test("a mute silences every call right of the room", () => {
  const a = normalizeRoomAccess({ canPost: true, canCall: true, isMuted: true, mutedUntil: null });
  const c = resolveRoomControls(a, { roomType: "channel" });
  assert.equal(c.call.speak || c.call.video || c.call.screenShare || c.call.start || c.call.join, false);
});
