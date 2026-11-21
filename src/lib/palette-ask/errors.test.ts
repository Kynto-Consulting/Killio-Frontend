import assert from "node:assert/strict";
import test from "node:test";

import { classifyAskError, shouldShowUsageNotice } from "./errors.ts";

test("PER_USER_CAP_REACHED is its own state, whatever the status", () => {
  assert.equal(classifyAskError({ code: "PER_USER_CAP_REACHED" }), "cap_reached");
  assert.equal(classifyAskError({ code: "PER_USER_CAP_REACHED", status: 429 }), "cap_reached");
});

test("402 or a credits code is the no-credits state", () => {
  assert.equal(classifyAskError({ status: 402 }), "no_credits");
  assert.equal(classifyAskError({ code: "INSUFFICIENT_CREDITS" }), "no_credits");
  assert.equal(classifyAskError({ message: "Insufficient credits" }), "no_credits");
});

test("429 is the rate-limit state", () => {
  assert.equal(classifyAskError({ status: 429 }), "rate_limit");
  assert.equal(classifyAskError({ code: "RATE_LIMITED" }), "rate_limit");
});

test("offline: navigator says so, or fetch failed with no HTTP status", () => {
  assert.equal(classifyAskError({ message: "whatever" }, false), "offline");
  assert.equal(classifyAskError({ message: "Failed to fetch" }), "offline");
  assert.equal(classifyAskError({ message: "Load failed" }), "offline");
  assert.equal(classifyAskError({ message: "Failed to fetch", status: 500 }), "unknown");
});

test("anything else is unknown", () => {
  assert.equal(classifyAskError({ status: 500, message: "Agent stream failed (500)" }), "unknown");
  assert.equal(classifyAskError({}), "unknown");
});

test("usage notice from 80 % up to, not including, 100 %", () => {
  assert.equal(shouldShowUsageNotice(79.9), false);
  assert.equal(shouldShowUsageNotice(80), true);
  assert.equal(shouldShowUsageNotice(99), true);
  assert.equal(shouldShowUsageNotice(100), false);
  assert.equal(shouldShowUsageNotice(undefined), false);
  assert.equal(shouldShowUsageNotice(NaN), false);
});
