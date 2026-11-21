/**
 * Which controls of the call bar the room's rights take away, and the text key of the reason (tooltip).
 * Decided ONLY from what the backend resolved (`GET /rooms/:id/permissions/me`); pure, tested in call-rights.test.ts.
 */

import { isMuteActive, type RoomAccess, type RoomControls } from "./room-controls.ts";

export type CallControlName = "speak" | "video" | "screenShare" | "record";
/** Reason keys: `call.blocked.<reason>` in the rooms namespace. */
export type CallBlockReason = "muted" | CallControlName;

export type CallRestrictions = Partial<Record<CallControlName, CallBlockReason>>;

/** Controls to disable, each with why. Empty when everything is allowed. A moderation mute wins over any missing right. */
export function callRestrictions(controls: Pick<RoomControls, "call">, access: Pick<RoomAccess, "canRecord" | "isMuted" | "mutedUntil">, now = Date.now()): CallRestrictions {
  const out: CallRestrictions = {};
  const muted = isMuteActive(access, now);
  const check = (name: CallControlName, allowed: boolean) => {
    if (!allowed) out[name] = muted ? "muted" : name;
  };
  check("speak", controls.call.speak);
  check("video", controls.call.video);
  check("screenShare", controls.call.screenShare);
  check("record", access.canRecord && !muted);
  return out;
}

/** What the client must switch off on its own side when a right is revoked while the person is in the call. */
export function callForcedOff(restrictions: CallRestrictions, state: { audioOn: boolean; videoOn: boolean; screenOn: boolean }): CallControlName[] {
  const out: CallControlName[] = [];
  if (restrictions.speak && state.audioOn) out.push("speak");
  if (restrictions.video && state.videoOn) out.push("video");
  if (restrictions.screenShare && state.screenOn) out.push("screenShare");
  return out;
}
