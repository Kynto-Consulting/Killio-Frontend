import assert from "node:assert/strict";
import test from "node:test";

import { createRoomHeartbeat } from "./room-activity.ts";

function fake() {
  const calls: string[] = [];
  let tick: (() => void) | null = null;
  const hb = createRoomHeartbeat({
    send: () => calls.push("put"),
    clear: () => calls.push("delete"),
    intervalMs: 20_000,
    setIntervalFn: (fn, ms) => { assert.equal(ms, 20_000); tick = fn; return 1; },
    clearIntervalFn: () => { tick = null; },
  });
  return { calls, hb, fire: () => tick?.() };
}

test("beats at once, then on every interval, and does not duplicate timers", () => {
  const { calls, hb, fire } = fake();
  hb.setActive(true);
  hb.setActive(true);
  fire(); fire();
  assert.deepEqual(calls, ["put", "put", "put"]);
});

test("hiding the tab stops the timer and sends one DELETE; showing it again resumes", () => {
  const { calls, hb, fire } = fake();
  hb.setActive(false);
  assert.deepEqual(calls, [], "nothing to clear before it started");
  hb.setActive(true);
  hb.setActive(false);
  hb.setActive(false);
  fire();
  assert.deepEqual(calls, ["put", "delete"]);
  hb.setActive(true);
  assert.deepEqual(calls, ["put", "delete", "put"]);
});
