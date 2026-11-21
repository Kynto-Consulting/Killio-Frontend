import assert from "node:assert/strict";
import test from "node:test";

import { callForcedOff, callRestrictions } from "./call-rights.ts";
import { normalizeRoomAccess, resolveRoomControls } from "./room-controls.ts";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const of = (raw: unknown) => {
  const access = normalizeRoomAccess(raw);
  return { access, controls: resolveRoomControls(access, { roomType: "channel", now: NOW }) };
};

test("everything allowed: nothing is restricted", () => {
  const { access, controls } = of({ canStartCall: true, permissions: ["room.view", "room.call", "room.record", "room.call.start", "room.call.join", "room.call.speak", "room.call.video", "room.call.screen_share"] });
  assert.deepEqual(callRestrictions(controls, access, NOW), {});
});

test("a missing screen-share (or video) key disables just that button, with its own reason", () => {
  const { access, controls } = of({ canStartCall: true, permissions: ["room.view", "room.call", "room.record", "room.call.start", "room.call.join", "room.call.speak"] });
  assert.deepEqual(callRestrictions(controls, access, NOW), { video: "video", screenShare: "screenShare" });
});

test("no record right disables recording", () => {
  const { access, controls } = of({ canStartCall: true, permissions: ["room.view", "room.call.speak", "room.call.video", "room.call.screen_share"] });
  assert.equal(callRestrictions(controls, access, NOW).record, "record");
});

test("a moderation mute explains itself as a mute, not as a missing permission", () => {
  const { access, controls } = of({ canPost: true, canCall: true, canRecord: true, isMuted: true, mutedUntil: null });
  assert.deepEqual(callRestrictions(controls, access, NOW), { speak: "muted", video: "muted", screenShare: "muted", record: "muted" });
});

test("an old server (only room.call) keeps every control", () => {
  const { access, controls } = of({ permissions: ["room.view", "room.post", "room.call", "room.record"] });
  assert.deepEqual(callRestrictions(controls, access, NOW), {});
});

test("when a right is revoked mid-call, only the active feature is forced off", () => {
  const r = callRestrictions({ call: { start: true, join: true, speak: false, video: true, screenShare: false, muteOthers: false, removeParticipants: false } }, { canRecord: true, isMuted: false, mutedUntil: null }, NOW);
  assert.deepEqual(callForcedOff(r, { audioOn: true, videoOn: true, screenOn: false }), ["speak"]);
  assert.deepEqual(callForcedOff(r, { audioOn: false, videoOn: true, screenOn: true }), ["screenShare"]);
  assert.deepEqual(callForcedOff({}, { audioOn: true, videoOn: true, screenOn: true }), []);
});
