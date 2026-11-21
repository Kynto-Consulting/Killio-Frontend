import assert from "node:assert/strict";
import { test } from "node:test";

import { noticeFromApiError, noticeFromMediaError, NOTICE_I18N_KEY } from "./call-errors.ts";
import { isPolite, offerCollision, shouldIgnoreOffer } from "./negotiation.ts";
import { addStream, removeStream, resolvePeerStreams } from "./peer-streams.ts";
import {
  CAMERA_BITRATE_WHILE_SHARING_BPS, SCREEN_MAX_BITRATE_BPS, SCREEN_MIN_BITRATE_BPS, classifyCaptureError, screenBitratePerViewer,
  screenCaptureRequest, screenFramerate,
} from "./screen-quality.ts";
import {
  actionFromSignal, canStartShare, initialScreenShareState, primaryShare, screenShareReducer, snapshotFromState,
  type ScreenShareAction, type ScreenShareState,
} from "./screenshare-state.ts";

const run = (actions: ScreenShareAction[], from: ScreenShareState = initialScreenShareState) => actions.reduce(screenShareReducer, from);
const started = (peerId: string, startedAt: number, extra: Record<string, unknown> = {}): ScreenShareAction =>
  ({ type: "started", share: { peerId, startedAt, withAudio: false, ...extra } });

// ── reducer ─────────────────────────────────────────────────────────────────

test("started/stopped: add, ignore duplicates, remove", () => {
  const s1 = run([started("a-1", 10)]);
  assert.deepEqual(s1.shares.map((s) => s.peerId), ["a-1"]);
  const dup = screenShareReducer(s1, started("a-1", 99));
  assert.equal(dup, s1, "same share again is a no-op (same object, no re-render)");
  assert.equal(dup.shares[0].startedAt, 10, "the first start time is kept");
  assert.deepEqual(run([{ type: "stopped", peerId: "a-1" }], s1).shares, []);
  assert.equal(screenShareReducer(s1, { type: "stopped", peerId: "zzz" }), s1);
});

test("the sharer's own signal can fill in the stream id a server event did not carry", () => {
  const s = run([started("a-1", 10), started("a-1", 11, { streamId: "S1", withAudio: true })]);
  assert.deepEqual(s.shares, [{ peerId: "a-1", startedAt: 10, streamId: "S1", withAudio: true }]);
  const kept = screenShareReducer(s, started("a-1", 12)); // a later server echo without the id
  assert.equal(kept.shares[0].streamId, "S1", "an id is never lost to an event that does not know it");
});

test("peerLeft drops that peer's share; reset clears all", () => {
  const s = run([started("a-1", 1), started("b-1", 2, {})]);
  assert.deepEqual(run([{ type: "peerLeft", peerId: "a-1" }], s).shares.map((x) => x.peerId), ["b-1"]);
  assert.deepEqual(run([{ type: "reset" }], s).shares, []);
  assert.equal(screenShareReducer(initialScreenShareState, { type: "reset" }), initialScreenShareState);
});

test("shares are ordered by start time and the primary is the earliest", () => {
  const s = run([started("b-1", 50), started("a-1", 20)]);
  assert.deepEqual(s.shares.map((x) => x.peerId), ["a-1", "b-1"]);
  assert.equal(primaryShare(s)?.peerId, "a-1");
  assert.equal(primaryShare(initialScreenShareState), null);
});

test("snapshot replaces the list (late joiner / reconnect) but keeps known stream ids and adopts the policy", () => {
  const before = run([started("a-1", 10, { streamId: "S1" }), started("gone-1", 11)]);
  const after = screenShareReducer(before, { type: "snapshot", policy: "multiple", shares: [{ peerId: "a-1", startedAt: 10, withAudio: false }, { peerId: "c-1", startedAt: 30, withAudio: true }] });
  assert.equal(after.policy, "multiple");
  assert.deepEqual(after.shares.map((s) => [s.peerId, s.streamId]), [["a-1", "S1"], ["c-1", undefined]]);
  assert.equal(screenShareReducer(after, { type: "snapshot", shares: [] }).policy, "multiple", "no policy in the snapshot keeps the current one");
});

test("canStartShare: single blocks while someone else shares (not while it is me); multiple never blocks", () => {
  const s = run([started("a-1", 1)]);
  assert.deepEqual(canStartShare(s, "b-1"), { ok: false, reason: "busy", sharerPeerId: "a-1" });
  assert.deepEqual(canStartShare(s, "a-1"), { ok: true });
  assert.deepEqual(canStartShare(initialScreenShareState, "b-1"), { ok: true });
  assert.deepEqual(canStartShare({ ...s, policy: "multiple" }, "b-1"), { ok: true });
});

// ── signals ─────────────────────────────────────────────────────────────────

test("actionFromSignal understands the legacy call.screen and the server events", () => {
  assert.deepEqual(actionFromSignal("call.screen", { peerId: "a-1", active: true }, 500), { type: "started", share: { peerId: "a-1", streamId: undefined, withAudio: false, startedAt: 500 } });
  assert.deepEqual(actionFromSignal("call.screen", { peerId: "a-1", active: true, streamId: "S", audio: true }, 500), { type: "started", share: { peerId: "a-1", streamId: "S", withAudio: true, startedAt: 500 } });
  assert.deepEqual(actionFromSignal("call.screen", { peerId: "a-1", active: false }), { type: "stopped", peerId: "a-1" });
  assert.deepEqual(actionFromSignal("call.screenshare.stopped", { peerId: "a-1", reason: "forced" }), { type: "stopped", peerId: "a-1" });
  const srv = actionFromSignal("call.screenshare.started", { peerId: "a-1", withAudio: true, startedAt: "2026-01-01T00:00:00.000Z" }, 1);
  assert.deepEqual(srv, { type: "started", share: { peerId: "a-1", streamId: undefined, withAudio: true, startedAt: Date.parse("2026-01-01T00:00:00.000Z") } });
});

test("actionFromSignal ignores garbage", () => {
  assert.equal(actionFromSignal("call.screen", null), null);
  assert.equal(actionFromSignal("call.screen", { active: true }), null);
  assert.equal(actionFromSignal("call.screen", { peerId: "", active: true }), null);
  assert.equal(actionFromSignal("call.screen", { peerId: "a-1" }), null, "no active flag");
  assert.equal(actionFromSignal("call.other", { peerId: "a-1", active: true }), null);
});

test("snapshotFromState reads the server shape and tolerates a missing list", () => {
  const a = snapshotFromState({ screenSharePolicy: "multiple", screenShares: [{ peerId: "a-1", userId: "a", withAudio: true, startedAt: "2026-01-01T00:00:00.000Z" }, { nope: 1 }] });
  assert.equal(a?.type, "snapshot");
  assert.equal(a?.type === "snapshot" && a.shares.length, 1);
  assert.equal(a?.type === "snapshot" && a.policy, "multiple");
  assert.equal(snapshotFromState({}), null);
  assert.equal(snapshotFromState(null), null);
});

// ── streams ─────────────────────────────────────────────────────────────────

test("peer streams: camera vs screen by announced id, whatever order the tracks land in", () => {
  const cam = { id: "C" }, scr = { id: "S" };
  assert.deepEqual(resolvePeerStreams([cam], undefined, false), { camera: cam, screen: undefined });
  assert.deepEqual(resolvePeerStreams([cam, scr], "S", true), { camera: cam, screen: scr });
  // the screen track landed before its announcement: it must not be taken for the camera
  assert.deepEqual(resolvePeerStreams([cam, scr], undefined, true), { camera: cam, screen: undefined });
  // sharing stopped: the lingering screen stream is not shown as a camera either
  assert.equal(resolvePeerStreams([cam, scr], "S", false).camera, cam);
  assert.equal(resolvePeerStreams([scr], "S", true).camera, undefined, "only the screen so far: no camera tile stream");
});

test("addStream / removeStream are idempotent and keep arrival order", () => {
  const a = { id: "A" }, b = { id: "B" };
  const l1 = addStream([], a);
  assert.equal(addStream(l1, a), l1);
  assert.deepEqual(addStream(l1, b).map((s) => s.id), ["A", "B"]);
  assert.equal(removeStream(l1, "zzz"), l1);
  assert.deepEqual(removeStream([a, b], "A"), [b]);
});

// ── perfect negotiation ─────────────────────────────────────────────────────

test("exactly one side of a pair is polite", () => {
  assert.notEqual(isPolite("u1-aaa", "u2-bbb"), isPolite("u2-bbb", "u1-aaa"));
});

test("glare: the impolite side ignores a colliding offer, the polite side accepts (rollback)", () => {
  const stable = { makingOffer: false, signalingState: "stable" as const };
  assert.equal(offerCollision(stable), false);
  assert.equal(offerCollision({ makingOffer: true, signalingState: "stable" }), true);
  assert.equal(offerCollision({ makingOffer: false, signalingState: "have-local-offer" }), true);
  assert.equal(shouldIgnoreOffer({ polite: false, ...stable }), false, "no collision: accept");
  assert.equal(shouldIgnoreOffer({ polite: false, makingOffer: true, signalingState: "have-local-offer" }), true);
  assert.equal(shouldIgnoreOffer({ polite: true, makingOffer: true, signalingState: "have-local-offer" }), false);
});

// ── quality ─────────────────────────────────────────────────────────────────

test("screen bitrate: the upload budget is split per viewer, clamped to [min, max]", () => {
  assert.equal(screenBitratePerViewer(1), SCREEN_MAX_BITRATE_BPS);
  assert.equal(screenBitratePerViewer(3), 2_000_000);
  assert.equal(screenBitratePerViewer(5), 1_200_000);
  assert.equal(screenBitratePerViewer(100), SCREEN_MIN_BITRATE_BPS);
  assert.equal(screenBitratePerViewer(0), SCREEN_MAX_BITRATE_BPS, "0 viewers behaves as 1");
  assert.ok(CAMERA_BITRATE_WHILE_SHARING_BPS < SCREEN_MIN_BITRATE_BPS);
  assert.ok(screenFramerate(1) > screenFramerate(3) && screenFramerate(3) > screenFramerate(5));
});

test("capture request: audio is optional and echo processing is off for system audio", () => {
  assert.equal(screenCaptureRequest(false).audio, false);
  assert.equal(screenCaptureRequest(false).systemAudio, "exclude");
  const withAudio = screenCaptureRequest(true);
  assert.deepEqual(withAudio.audio, { echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  assert.equal(withAudio.systemAudio, "include");
  assert.equal(withAudio.selfBrowserSurface, "exclude");
});

test("classifyCaptureError", () => {
  const env = { hasApi: true, secure: true };
  assert.equal(classifyCaptureError({ name: "NotAllowedError" }, env), "denied");
  assert.equal(classifyCaptureError({ name: "NotReadableError" }, env), "system");
  assert.equal(classifyCaptureError({ name: "NotFoundError" }, env), "noSource");
  assert.equal(classifyCaptureError({ name: "TypeError" }, env), "unsupported");
  assert.equal(classifyCaptureError(new Error("x"), env), "other");
  assert.equal(classifyCaptureError({ name: "NotAllowedError" }, { hasApi: false, secure: true }), "unsupported", "mobile browsers: no API");
  assert.equal(classifyCaptureError({ name: "NotAllowedError" }, { hasApi: true, secure: false }), "insecure");
});

// ── errors ──────────────────────────────────────────────────────────────────

test("API error bodies become notices", () => {
  assert.deepEqual(noticeFromApiError(409, { code: "call_full", max: 8 }), { kind: "callFull", max: 8 });
  assert.deepEqual(noticeFromApiError(409, { code: "call_full" }), { kind: "callFull", max: 6 });
  assert.deepEqual(noticeFromApiError(409, { code: "screenshare_busy", sharer: { peerId: "a-1", displayName: "Ana" } }), { kind: "screenshareBusy", sharerName: "Ana" });
  assert.deepEqual(noticeFromApiError(409, { code: "screenshare_busy" }), { kind: "screenshareBusy", sharerName: "" });
  assert.deepEqual(noticeFromApiError(409, { code: "call_ended" }), { kind: "callEnded" });
  assert.deepEqual(noticeFromApiError(403, {}), { kind: "forbidden" });
  assert.equal(noticeFromApiError(500, { message: "boom" }), null);
  assert.equal(noticeFromApiError(409, null), null);
});

test("media errors and the i18n key table covers every kind", () => {
  assert.deepEqual(noticeFromMediaError({ name: "NotFoundError" }), { kind: "mediaNotFound" });
  assert.deepEqual(noticeFromMediaError({ name: "NotAllowedError" }), { kind: "mediaDenied" });
  assert.deepEqual(noticeFromMediaError(undefined), { kind: "mediaDenied" });
  assert.equal(Object.keys(NOTICE_I18N_KEY).length, 14);
  for (const k of Object.values(NOTICE_I18N_KEY)) assert.match(k, /^call\.notice\.[a-zA-Z]+$/);
});
