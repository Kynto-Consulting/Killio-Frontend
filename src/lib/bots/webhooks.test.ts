import assert from "node:assert/strict";
import { test } from "node:test";

import {
  maskWebhookUrl, normalizeCreatedWebhook, normalizeWebhookList, publicWebhookUrl, roomSupportsWebhooks, validateWebhookForm, webhookBody, webhookCurl, WEBHOOK_LIMITS,
} from "./webhooks.ts";

test("list answer is read tolerantly", () => {
  const list = normalizeWebhookList([{ id: "w1", roomId: "r1", name: "CI", avatarUrl: "https://x.test/a.png", userId: "u1", lastUsedAt: null, createdAt: "2026-01-01T00:00:00Z" }, { nope: 1 }, null]);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "CI");
  assert.equal(list[0].lastUsedAt, null);
  assert.deepEqual(normalizeWebhookList("x"), []);
});

test("the creation answer carries the secret once; without a token it is not a created webhook", () => {
  const c = normalizeCreatedWebhook({ id: "w1", roomId: "r1", name: "CI", path: "/hooks/rooms/w1/tok", token: "tok", note: "x" });
  assert.equal(c?.token, "tok");
  assert.equal(c?.path, "/hooks/rooms/w1/tok");
  assert.equal(normalizeCreatedWebhook({ id: "w1", name: "CI" }), null);
  assert.equal(normalizeCreatedWebhook({ id: "w1", name: "CI", token: "t", path: "https://evil.test/x" })?.path, "/hooks/rooms/w1/t", "a path that is not the hooks path is rebuilt");
});

test("public URL and masking", () => {
  const url = publicWebhookUrl("https://api.killio.dev/", "/hooks/rooms/w1/secretvalue");
  assert.equal(url, "https://api.killio.dev/hooks/rooms/w1/secretvalue");
  assert.equal(maskWebhookUrl(url), "https://api.killio.dev/hooks/rooms/w1/••••••••");
  assert.equal(maskWebhookUrl("https://x.test/other"), "https://x.test/other");
});

test("form validation follows the backend (name required, 80, https avatar)", () => {
  assert.deepEqual(validateWebhookForm({ name: "CI", avatarUrl: "" }), []);
  assert.deepEqual(validateWebhookForm({ name: " ", avatarUrl: "" }), ["name_required"]);
  assert.deepEqual(validateWebhookForm({ name: "x".repeat(WEBHOOK_LIMITS.name + 1), avatarUrl: "" }), ["name_long"]);
  assert.deepEqual(validateWebhookForm({ name: "CI", avatarUrl: "http://x.test/a.png" }), ["avatar_invalid"]);
  assert.deepEqual(webhookBody({ name: " CI ", avatarUrl: " " }), { name: "CI" });
  assert.deepEqual(webhookBody({ name: "CI", avatarUrl: " https://x.test/a.png " }), { name: "CI", avatarUrl: "https://x.test/a.png" });
});

test("example call and which rooms can have webhooks", () => {
  assert.equal(webhookCurl("https://x.test/hooks/rooms/w/t"), `curl -X POST 'https://x.test/hooks/rooms/w/t' -H 'Content-Type: application/json' -d '{"text":"Hola"}'`);
  assert.equal(roomSupportsWebhooks({ type: "channel" }), true);
  assert.equal(roomSupportsWebhooks({ type: "channel", linkedEntityType: "board" }), false);
  assert.equal(roomSupportsWebhooks({ type: "dm" }), false);
  assert.equal(roomSupportsWebhooks(null), false);
});
