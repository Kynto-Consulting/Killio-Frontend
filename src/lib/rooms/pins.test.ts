import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPinPatch, buildPinBody, canUnpinMessage, classifyPinError, clampTimerDelay, computeExpiry, expirePins, formatPinCountdown, getClockOffset,
  isPinActive, MAX_TIMER_MS, nextPinExpiry, normalizePinEvent, normalizePinSummary, oldestPin, parseLocalDateTime, patchesFromPinResponse,
  patchNeedsRefetch, pickerPresets, pinNow, pinTickInterval, pinTimeLeft, resetClockOffset, resolvePinCaps, sortPins, syncServerClock,
  toLocalDateTimeValue, validateCustomExpiry, type PinFields,
} from "./pins.ts";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const pin = (id: string, pinnedAt: string | null, expiresInMs?: number | null, by = "u1"): PinFields => ({
  id, pinnedAt, pinnedBy: pinnedAt ? by : null, pinExpiresAt: expiresInMs == null ? null : iso(NOW + expiresInMs),
});

/* Expiry calculation */

test("a preset travels by name, 'never' as preset never, an unknown duration as minutes", () => {
  assert.deepEqual(buildPinBody({ kind: "preset", id: "24h", minutes: 1440 }), { preset: "24h" });
  assert.deepEqual(buildPinBody({ kind: "preset", id: "never", minutes: null }), { preset: "never" });
  assert.deepEqual(buildPinBody({ kind: "preset", id: "2d", minutes: 2880 }), { durationMinutes: 2880 });
});

test("a custom date travels as ISO and never together with another date field", () => {
  const body = buildPinBody({ kind: "custom", at: NOW + 3_600_000 });
  assert.deepEqual(body, { expiresAt: "2026-11-21T13:00:00.000Z" });
  assert.equal(Object.keys(body).filter((k) => ["expiresAt", "durationMinutes", "preset"].includes(k)).length, 1);
});

test("replaceOldest is only sent when asked for", () => {
  assert.equal("replaceOldest" in buildPinBody({ kind: "preset", id: "1h", minutes: 60 }), false);
  assert.deepEqual(buildPinBody({ kind: "preset", id: "1h", minutes: 60 }, true), { preset: "1h", replaceOldest: true });
});

test("computeExpiry: preset = now + minutes, never = null, custom = the date", () => {
  assert.equal(computeExpiry({ kind: "preset", id: "7d", minutes: 10080 }, NOW), NOW + 7 * 86_400_000);
  assert.equal(computeExpiry({ kind: "preset", id: "never", minutes: null }, NOW), null);
  assert.equal(computeExpiry({ kind: "custom", at: NOW + 5 }, NOW), NOW + 5);
});

test("custom date validation: past, too soon, too far (unless permanent pins are allowed)", () => {
  assert.equal(validateCustomExpiry(NOW - 1, NOW, null, false), "past");
  assert.equal(validateCustomExpiry(NOW + 30_000, NOW, null, false), "tooSoon");
  assert.equal(validateCustomExpiry(NOW + 3_600_000, NOW, 1440, false), "ok");
  assert.equal(validateCustomExpiry(NOW + 2 * 86_400_000, NOW, 1440, false), "tooFar");
  assert.equal(validateCustomExpiry(NOW + 2 * 86_400_000, NOW, 1440, true), "ok");
  assert.equal(validateCustomExpiry(NaN, NOW, null, false), "invalid");
});

test("datetime-local values round-trip in local time and reject impossible dates", () => {
  const ms = parseLocalDateTime("2026-11-21T09:30");
  assert.equal(toLocalDateTimeValue(ms), "2026-11-21T09:30");
  assert.ok(Number.isNaN(parseLocalDateTime("")));
  assert.ok(Number.isNaN(parseLocalDateTime("2026-02-31T10:00")));
});

/* Summary, presets and rights */

test("the summary is read with its presets (names or objects) and rights", () => {
  const s = normalizePinSummary({
    limit: 10, count: 3, maxDurationMinutes: 43200, presets: ["1h", "24h", { preset: "7d", minutes: 10080 }, "bogus"],
    canPin: true, canPinPermanent: false, canUnpinOthers: true, serverNow: "2026-11-21T12:00:00Z",
  });
  assert.ok(s);
  assert.deepEqual(s.presets.map((p) => p.id), ["1h", "24h", "7d"]);
  assert.equal(s.canUnpinOthers, true);
  assert.equal(normalizePinSummary({ nothing: 1 }), null);
  assert.equal(normalizePinSummary(null), null);
});

test("the picker offers the server's presets, 'never' only with the right, nothing above the maximum", () => {
  const s = normalizePinSummary({ limit: 5, count: 0, maxDurationMinutes: 1440, presets: ["1h", "24h", "7d", "30d", "never"], canPin: true });
  assert.deepEqual(pickerPresets(s, false).map((p) => p.id), ["1h", "24h"]);
  assert.deepEqual(pickerPresets(s, true).map((p) => p.id), ["1h", "24h", "7d", "30d", "never"]);
  assert.deepEqual(pickerPresets(null, false).map((p) => p.id), ["1h", "24h", "7d", "30d"]);
  assert.equal(pickerPresets(null, true).at(-1)?.id, "never");
});

test("rights: the summary wins once loaded; before that the permission keys decide; a muted member cannot pin", () => {
  const s = normalizePinSummary({ limit: 5, count: 2, presets: [], canPin: true, canPinPermanent: true, canUnpinOthers: false });
  const caps = resolvePinCaps(s, { canPin: true, canPinPermanent: false, canUnpinOthers: true });
  assert.equal(caps.canPinPermanent, true);
  assert.equal(caps.canUnpinOthers, false);
  assert.equal(caps.limit, 5);
  assert.equal(resolvePinCaps(s, { canPin: false }).canPin, false);
  const before = resolvePinCaps(null, { canPin: true, canUnpinOthers: true });
  assert.equal(before.limit, null);
  assert.equal(before.canUnpinOthers, true);
  assert.equal(before.canPinPermanent, false);
});

test("own pins can always be removed, other people's only with the right", () => {
  const m = pin("a", "2026-11-21T10:00:00Z", null, "me");
  assert.equal(canUnpinMessage(m, "me", { canUnpinOthers: false }), true);
  assert.equal(canUnpinMessage(pin("b", "2026-11-21T10:00:00Z", null, "you"), "me", { canUnpinOthers: false }), false);
  assert.equal(canUnpinMessage(pin("b", "2026-11-21T10:00:00Z", null, "you"), "me", { canUnpinOthers: true }), true);
  assert.equal(canUnpinMessage(pin("c", null), "me", { canUnpinOthers: true }), false, "not pinned: nothing to unpin");
});

/* Countdown */

test("countdown text is compact, rounds up and never reads 0 while time is left", () => {
  assert.equal(formatPinCountdown(2 * 86_400_000 + 3 * 3_600_000 + 5 * 60_000), "2d 3h");
  assert.equal(formatPinCountdown(86_400_000), "1d");
  assert.equal(formatPinCountdown(3 * 3_600_000 + 5 * 60_000), "3h 5m");
  assert.equal(formatPinCountdown(3_600_000), "1h");
  assert.equal(formatPinCountdown(12 * 60_000), "12m");
  assert.equal(formatPinCountdown(90_000), "1m 30s");
  assert.equal(formatPinCountdown(45_000), "45s");
  assert.equal(formatPinCountdown(1), "1s");
  assert.equal(formatPinCountdown(0), "0s");
  assert.equal(formatPinCountdown(-5), "0s");
});

test("a pin with no expiry has no countdown and stays active; one past its date is not active", () => {
  assert.equal(pinTimeLeft(pin("a", "x", null), NOW), null);
  assert.equal(isPinActive(pin("a", "2026-11-21T10:00:00Z", null), NOW), true);
  assert.equal(isPinActive(pin("a", "2026-11-21T10:00:00Z", 1000), NOW), true);
  assert.equal(isPinActive(pin("a", "2026-11-21T10:00:00Z", 0), NOW), false, "expires exactly now");
  assert.equal(isPinActive(pin("a", "2026-11-21T10:00:00Z", -1), NOW), false);
  assert.equal(isPinActive(pin("a", null), NOW), false);
});

test("the countdown repaints every second in the last two minutes, otherwise every 15 s", () => {
  assert.equal(pinTickInterval(90_000), 1000);
  assert.equal(pinTickInterval(3_600_000), 15_000);
  assert.equal(pinTickInterval(null), 15_000);
});

/* Ordering */

test("pins are ordered newest first with a stable tie-break; the oldest is the one 'replace' takes", () => {
  const list = [pin("a", "2026-11-21T08:00:00Z"), pin("c", "2026-11-21T10:00:00Z"), pin("b", "2026-11-21T10:00:00Z"), pin("n", null)];
  assert.deepEqual(sortPins(list).map((m) => m.id), ["b", "c", "a", "n"]);
  assert.equal(oldestPin(list)?.id, "a");
  assert.equal(oldestPin([]), undefined);
});

/* Expiry sweep and timers */

test("expired pins are cleared locally; the same array comes back when nothing expired", () => {
  const list = [pin("a", "2026-11-21T10:00:00Z", -1000), pin("b", "2026-11-21T10:00:00Z", 5000), pin("c", "2026-11-21T10:00:00Z", null)];
  const out = expirePins(list, NOW);
  assert.equal(out[0].pinnedAt, null);
  assert.equal(out[0].pinExpiresAt, null);
  assert.equal(out[1], list[1]);
  assert.equal(out[2], list[2]);
  assert.equal(expirePins(out, NOW), out);
});

test("the next expiry is the earliest of the pins in force", () => {
  const list = [pin("a", "x", 9000), pin("b", "x", 3000), pin("c", "x", null), pin("d", "x", -10), pin("e", null, 100)];
  assert.equal(nextPinExpiry(list, NOW), NOW + 3000);
  assert.equal(nextPinExpiry([pin("c", "x", null)], NOW), null);
  assert.equal(nextPinExpiry([], NOW), null);
});

test("timer delays are clamped to what setTimeout can wait (a 30-day pin)", () => {
  assert.equal(clampTimerDelay(30 * 86_400_000), MAX_TIMER_MS);
  assert.equal(clampTimerDelay(-5), 0);
  assert.equal(clampTimerDelay(1500), 1500);
});

/* Clock correction */

test("the server clock offset corrects the countdown and ignores garbage", () => {
  resetClockOffset();
  syncServerClock(iso(NOW + 120_000), NOW); // the server is two minutes ahead
  assert.equal(getClockOffset(), 120_000);
  assert.equal(pinNow(NOW), NOW + 120_000);
  assert.equal(isPinActive(pin("a", "x", 60_000), pinNow(NOW)), false, "with the server clock it already expired");
  assert.equal(isPinActive(pin("a", "x", 60_000), NOW), true);
  syncServerClock("not a date", NOW);
  assert.equal(getClockOffset(), 120_000);
  resetClockOffset();
});

/* Event reduction */

test("pinned event pins (with expiry) and an expiry-only change replaces the old date", () => {
  const list = [pin("a", null), pin("b", "2026-11-21T09:00:00Z", 1000, "u2")];
  const p = normalizePinEvent("room.message.pinned", { messageId: "a", roomId: "r", pinned: true, pinnedAt: "2026-11-21T11:00:00Z", pinnedBy: "u9", pinExpiresAt: iso(NOW + 5000) });
  assert.ok(p);
  const out = applyPinPatch(list, p, NOW);
  assert.equal(out[0].pinnedAt, "2026-11-21T11:00:00Z");
  assert.equal(out[0].pinnedBy, "u9");
  assert.equal(out[0].pinExpiresAt, iso(NOW + 5000));
  const forever = normalizePinEvent("room.message.pinned", { messageId: "b", pinned: true, pinnedAt: "2026-11-21T09:00:00Z", pinnedBy: "u2" });
  assert.equal(applyPinPatch(out, forever!, NOW)[1].pinExpiresAt, null, "no pinExpiresAt in the event = no expiry");
});

test("unpinned event clears the pin for every reason; the compatibility 'pinned: false' event does the same", () => {
  const list = [pin("a", "2026-11-21T09:00:00Z", 5000)];
  for (const reason of ["manual", "expired", "replaced"] as const) {
    const p = normalizePinEvent("room.message.unpinned", { messageId: "a", pinned: false, reason, unpinnedBy: "u3" });
    assert.equal(p?.reason, reason);
    const out = applyPinPatch(list, p!, NOW);
    assert.equal(out[0].pinnedAt, null);
    assert.equal(out[0].pinnedBy, null);
    assert.equal(out[0].pinExpiresAt, null);
  }
  const compat = normalizePinEvent("room.message.pinned", { messageId: "a", pinned: false });
  assert.equal(applyPinPatch(list, compat!, NOW)[0].pinnedAt, null);
});

test("an event for a message the list does not hold changes nothing, and says whether the list must be fetched again", () => {
  const list = [pin("a", "2026-11-21T09:00:00Z")];
  const p = normalizePinEvent("room.message.pinned", { messageId: "zzz", pinned: true, pinnedAt: "2026-11-21T09:00:00Z" })!;
  assert.equal(applyPinPatch(list, p, NOW), list);
  assert.equal(patchNeedsRefetch(list, p), true);
  assert.equal(patchNeedsRefetch(list, { messageId: "a", pinned: true }), false);
  assert.equal(patchNeedsRefetch(list, { messageId: "zzz", pinned: false }), false);
  assert.equal(normalizePinEvent("room.message.pinned", {}), null);
  assert.equal(normalizePinEvent("room.message.pinned", null), null);
});

test("the answer of PUT with replaceOldest unpins the replaced message too", () => {
  const patches = patchesFromPinResponse({ id: "new", pinned: true, pinnedAt: "2026-11-21T11:00:00Z", pinnedBy: "me", pinExpiresAt: iso(NOW + 1000), replacedMessageId: "old" }, "new");
  assert.equal(patches.length, 2);
  assert.deepEqual(patches[1], { messageId: "old", pinned: false, reason: "replaced" });
  const list = [pin("new", null), pin("old", "2026-11-21T08:00:00Z")];
  const out = patches.reduce((acc, p) => applyPinPatch(acc, p, NOW), list);
  assert.equal(out[0].pinnedBy, "me");
  assert.equal(out[1].pinnedAt, null);
  assert.equal(patchesFromPinResponse({ id: "x", pinned: false }, "x")[0].pinned, false);
});

/* Errors */

test("backend pin errors map to what the UI says and offers", () => {
  assert.deepEqual(classifyPinError({ status: 409, code: "room_pin_limit", data: { limit: 10, count: 10, oldestMessageId: "m1" } }), { kind: "limit", limit: 10, count: 10, oldestMessageId: "m1" });
  assert.equal(classifyPinError({ status: 403, code: "room_pin_limit", data: {} }).kind, "limitOthers");
  assert.equal(classifyPinError({ status: 403, code: "room_pin_permanent_forbidden" }).kind, "permanentForbidden");
  assert.equal(classifyPinError({ status: 409, code: "room_pin_not_active" }).kind, "notActive");
  assert.equal(classifyPinError({ status: 400 }).kind, "invalidDate");
  assert.equal(classifyPinError({ status: 403 }).kind, "forbidden");
  assert.equal(classifyPinError(new Error("boom")).kind, "generic");
  assert.equal(classifyPinError(undefined).kind, "generic");
  assert.equal(classifyPinError({ status: 409, data: { code: "room_pin_limit", details: { limit: 3 } } }).limit, 3, "code and numbers may sit in the body");
});
