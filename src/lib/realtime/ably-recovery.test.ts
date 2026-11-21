import assert from "node:assert/strict";
import test from "node:test";

import {
  attachWithRecovery, DEFAULT_RETRY_POLICY, errorCode, isPermissionError, newlyVisibleRooms, RenewalCoordinator, retryDelay, shouldRetry, watchChannelFailures,
  type ChannelStateChange,
} from "./ably-recovery.ts";

const permissionError = (code = 40160) => Object.assign(new Error("denied"), { code });
const noSleep = async () => {};

/** Simulated channel: refuses with `errors` in order, then attaches. */
function fakeChannel(errors: unknown[]) {
  const queue = [...errors];
  const listeners: Array<(c: ChannelStateChange) => void> = [];
  return {
    attachCalls: 0,
    async attach() {
      this.attachCalls++;
      const next = queue.shift();
      if (next) throw next;
    },
    on(_e: "failed", l: (c: ChannelStateChange) => void) { listeners.push(l); },
    off(_e: "failed", l: (c: ChannelStateChange) => void) { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); },
    fail(reason: unknown) { listeners.slice().forEach((l) => l({ current: "failed", reason })); },
    listenerCount: () => listeners.length,
  };
}

test("only capability errors count as permission errors", () => {
  assert.equal(isPermissionError(permissionError(40160)), true);
  assert.equal(isPermissionError(permissionError(40161)), true);
  assert.equal(isPermissionError(permissionError(40140)), false);
  assert.equal(isPermissionError({ reason: { code: 40160 } }), true);
  assert.equal(isPermissionError(new Error("boom")), false);
  assert.equal(isPermissionError(null), false);
  assert.equal(errorCode("x"), null);
});

test("retry delay doubles and is capped", () => {
  assert.equal(retryDelay(1), 500);
  assert.equal(retryDelay(2), 1000);
  assert.equal(retryDelay(3), 2000);
  assert.equal(retryDelay(10), DEFAULT_RETRY_POLICY.maxDelayMs);
});

test("shouldRetry needs a permission error and attempts left", () => {
  assert.equal(shouldRetry(permissionError(), 1), true);
  assert.equal(shouldRetry(permissionError(), 3), false);
  assert.equal(shouldRetry(new Error("network"), 1), false);
});

test("a refused channel renews the token once and attaches on the retry", async () => {
  const ch = fakeChannel([permissionError()]);
  let renewals = 0;
  const result = await attachWithRecovery(ch, async () => { renewals++; return true; }, { sleep: noSleep });
  assert.deepEqual({ ok: result.ok, attempts: result.attempts, renewals: result.renewals }, { ok: true, attempts: 2, renewals: 1 });
  assert.equal(renewals, 1);
  assert.equal(ch.attachCalls, 2);
});

test("it gives up after the policy and reports the last error", async () => {
  const err = permissionError(40161);
  const ch = fakeChannel([err, err, err, err, err]);
  const result = await attachWithRecovery(ch, async () => true, { sleep: noSleep });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, DEFAULT_RETRY_POLICY.maxAttempts);
  assert.equal(result.error, err);
});

test("other errors are not retried and never renew the token", async () => {
  const ch = fakeChannel([new Error("network down")]);
  let renewals = 0;
  const result = await attachWithRecovery(ch, async () => { renewals++; return true; }, { sleep: noSleep });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 1);
  assert.equal(renewals, 0);
});

test("the sleep between attempts follows the policy", async () => {
  const waits: number[] = [];
  const ch = fakeChannel([permissionError(), permissionError()]);
  await attachWithRecovery(ch, async () => true, { sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(waits, [500, 1000]);
});

test("a burst of failing channels shares one renewal", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const coordinator = new RenewalCoordinator(async () => { calls++; await gate; });
  const all = Promise.all([coordinator.renew(), coordinator.renew(), coordinator.renew()]);
  release();
  assert.deepEqual(await all, [true, true, true]);
  assert.equal(calls, 1);
});

test("a renewal right after another is reused; later one renews again; a failed one is not cached", async () => {
  let now = 1000;
  let calls = 0;
  let fail = false;
  const coordinator = new RenewalCoordinator(async () => { calls++; if (fail) throw new Error("auth down"); }, { cooldownMs: 1000, now: () => now });
  assert.equal(await coordinator.renew(), true);
  now += 200;
  assert.equal(await coordinator.renew(), true);
  assert.equal(calls, 1, "inside the cooldown");
  now += 2000;
  fail = true;
  assert.equal(await coordinator.renew(), false);
  assert.equal(calls, 2);
  assert.equal(await coordinator.renew(), false, "failure is retried, not remembered as success");
  assert.equal(calls, 3);
});

test("the channel watcher recovers on a capability failure and ignores other failures", async () => {
  const ch = fakeChannel([permissionError()]);
  let renewals = 0;
  let gaveUp = 0;
  const stop = watchChannelFailures(ch, async () => { renewals++; return true; }, { sleep: noSleep, onGiveUp: () => { gaveUp++; } });
  ch.fail({ code: 80000 });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(ch.attachCalls, 0, "unrelated failure: nothing done");
  // first attach (inside the recovery) is refused once, then succeeds
  ch.fail({ code: 40160 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(renewals, 1);
  assert.equal(ch.attachCalls, 2);
  assert.equal(gaveUp, 0);
  stop();
  assert.equal(ch.listenerCount(), 0);
});

test("rooms that appear after the first list are the ones that need a renewed token", () => {
  assert.deepEqual(newlyVisibleRooms(null, ["a", "b"]), [], "first list is the baseline");
  assert.deepEqual(newlyVisibleRooms(new Set(["a"]), ["a", "b", "c"]), ["b", "c"]);
  assert.deepEqual(newlyVisibleRooms(new Set(["a", "b"]), ["a"]), [], "losing a room needs no renewal");
  assert.deepEqual(newlyVisibleRooms(new Set(), []), []);
});

test("the watcher reports when the recovery is exhausted", async () => {
  const e = permissionError();
  const ch = fakeChannel([e, e, e]);
  let gaveUp: unknown = null;
  watchChannelFailures(ch, async () => true, { sleep: noSleep, onGiveUp: (err) => { gaveUp = err; } });
  ch.fail({ code: 40161 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gaveUp, e);
});
