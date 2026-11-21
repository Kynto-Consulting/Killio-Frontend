import assert from "node:assert/strict";
import test from "node:test";

import { teamRoomCapabilities } from "./team-capabilities.ts";

test("without the permissions endpoint the legacy admin flag decides", () => {
  assert.deepEqual(teamRoomCapabilities(null, true), { canCreateChannels: true, canManageChannels: true, canMuteMembers: true });
  assert.deepEqual(teamRoomCapabilities(null, false), { canCreateChannels: false, canManageChannels: false, canMuteMembers: false });
});

test("owner and administrator can do everything", () => {
  const all = { canCreateChannels: true, canManageChannels: true, canMuteMembers: true };
  assert.deepEqual(teamRoomCapabilities({ isOwner: true, permissions: [] }, false), all);
  assert.deepEqual(teamRoomCapabilities({ permissions: ["administrator"] }, false), all);
});

test("each right is its own key", () => {
  assert.deepEqual(teamRoomCapabilities({ permissions: ["rooms.create"] }, true), { canCreateChannels: true, canManageChannels: false, canMuteMembers: false });
  assert.deepEqual(teamRoomCapabilities({ permissions: ["members.mute"] }, true), { canCreateChannels: false, canManageChannels: false, canMuteMembers: true });
  assert.deepEqual(teamRoomCapabilities({ permissions: ["rooms.manage"] }, false), { canCreateChannels: true, canManageChannels: true, canMuteMembers: true });
});

test("an answer without room keys means no rights, whatever the legacy flag says", () => {
  assert.deepEqual(teamRoomCapabilities({ permissions: ["boards.create"] }, true), { canCreateChannels: false, canManageChannels: false, canMuteMembers: false });
});
