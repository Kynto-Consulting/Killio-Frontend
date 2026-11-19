import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_CHANGE_ROUTE,
  checkNewPassword,
  decidePasswordChangeRedirect,
  emailLocalPart,
  isPasswordChangePath,
  isPasswordChangeRequiredError,
  passwordStrength,
  postLoginDestination,
} from "./password-change.ts";

const base = { sessionReady: true, isAuthenticated: true };

test("redirect: flagged user is pinned to the password page", () => {
  assert.equal(decidePasswordChangeRedirect({ ...base, pathname: "/", mustChangePassword: true }), PASSWORD_CHANGE_ROUTE);
  assert.equal(decidePasswordChangeRedirect({ ...base, pathname: "/b/123?x=1", mustChangePassword: true }), PASSWORD_CHANGE_ROUTE);
  assert.equal(decidePasswordChangeRedirect({ ...base, pathname: "/login", mustChangePassword: true }), PASSWORD_CHANGE_ROUTE);
});

test("redirect: flagged user already on the page stays (no loop)", () => {
  assert.equal(decidePasswordChangeRedirect({ ...base, pathname: PASSWORD_CHANGE_ROUTE, mustChangePassword: true }), null);
  assert.equal(decidePasswordChangeRedirect({ ...base, pathname: "/set-password/", mustChangePassword: true }), null);
});

test("redirect: not flagged user is sent home from the page, left alone elsewhere", () => {
  assert.equal(decidePasswordChangeRedirect({ ...base, pathname: PASSWORD_CHANGE_ROUTE, mustChangePassword: false }), "/");
  assert.equal(decidePasswordChangeRedirect({ ...base, pathname: "/b/1", mustChangePassword: false }), null);
});

test("redirect: legal/offline routes stay reachable while flagged", () => {
  for (const p of ["/privacy", "/terms", "/cookies", "/offline"]) {
    assert.equal(decidePasswordChangeRedirect({ ...base, pathname: p, mustChangePassword: true }), null);
  }
});

test("redirect: never while session loading or anonymous", () => {
  assert.equal(decidePasswordChangeRedirect({ pathname: "/", sessionReady: false, isAuthenticated: true, mustChangePassword: true }), null);
  assert.equal(decidePasswordChangeRedirect({ pathname: "/", sessionReady: true, isAuthenticated: false, mustChangePassword: true }), null);
  assert.equal(decidePasswordChangeRedirect({ pathname: PASSWORD_CHANGE_ROUTE, sessionReady: true, isAuthenticated: false, mustChangePassword: false }), null);
});

test("path matching ignores query and does not match the recovery page", () => {
  assert.equal(isPasswordChangePath("/set-password?from=%2F"), true);
  assert.equal(isPasswordChangePath("/change-password"), false);
  assert.equal(isPasswordChangePath(null), false);
});

test("error detection requires 403 and the exact code", () => {
  const body = { statusCode: 403, error: "Forbidden", message: "x", code: "PASSWORD_CHANGE_REQUIRED" };
  assert.equal(isPasswordChangeRequiredError(403, body), true);
  assert.equal(isPasswordChangeRequiredError(401, body), false);
  assert.equal(isPasswordChangeRequiredError(403, { code: "OTHER" }), false);
  assert.equal(isPasswordChangeRequiredError(403, null), false);
  assert.equal(isPasswordChangeRequiredError(403, "PASSWORD_CHANGE_REQUIRED"), false);
});

test("post-login destination", () => {
  assert.equal(postLoginDestination({ mustChangePassword: true }, "/b/1"), PASSWORD_CHANGE_ROUTE);
  assert.equal(postLoginDestination({ mustChangePassword: false }, "/b/1"), "/b/1");
  assert.equal(postLoginDestination({}, "/"), "/");
  assert.equal(postLoginDestination(null, "/x"), "/x");
});

test("password rules: min 10 and email local part", () => {
  assert.deepEqual(checkNewPassword("short", "ana@example.com").issues, ["tooShort"]);
  assert.equal(checkNewPassword("123456789", null).ok, false);
  assert.equal(checkNewPassword("1234567890", null).ok, true);
  assert.deepEqual(checkNewPassword("MyAna-Pass-2026", "Ana@example.com").issues, ["containsEmail"]);
  assert.deepEqual(checkNewPassword("ana", "ana@example.com").issues, ["tooShort", "containsEmail"]);
  assert.equal(checkNewPassword("correct horse battery", "ana@example.com").ok, true);
  // very short local parts are not enforced client-side
  assert.equal(checkNewPassword("banana-split-1", "an@example.com").ok, true);
});

test("emailLocalPart", () => {
  assert.equal(emailLocalPart("Ana.Lopez@Example.com"), "ana.lopez");
  assert.equal(emailLocalPart(""), "");
  assert.equal(emailLocalPart(undefined), "");
});

test("strength hint", () => {
  assert.equal(passwordStrength(""), "empty");
  assert.equal(passwordStrength("abc"), "weak");
  assert.equal(passwordStrength("abcdefghij"), "medium");
  assert.equal(passwordStrength("Abcdefghij1234!x"), "strong");
  assert.equal(passwordStrength("annaannaanna", "anna@x.com"), "weak");
});
