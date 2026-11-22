import { test } from "node:test";
import assert from "node:assert/strict";
import { canChangeEmoji, emojiErrorKey, formatBytes, nameFromFileName, normalizeEmojiName, precheckFile, resolveEmojiUrl, sortEmojis, toCustomEmoji, EMOJI_NAME_PATTERN, type EmojiDto, type EmojiLimits } from "./custom.ts";
import { splitEmojiSegments } from "./segments.ts";
import { customByName } from "./shortcodes.ts";

const dto = (over: Partial<EmojiDto> = {}): EmojiDto => ({
  id: "e1", teamId: "t1", name: "party_parrot", shortcode: ":party_parrot:", reaction: "custom:e1", url: "/uploads/x.gif",
  contentType: "image/gif", sizeBytes: 2048, width: 64, height: 64, animated: true, createdBy: { id: "u1", name: "Ana" },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
});
const limits: EmojiLimits = { static: 50, animated: 50, maxBytes: 262144, minDimension: 32, maxDimension: 512, maxAspectRatio: 2, allowedTypes: ["image/png", "image/gif", "image/webp"] };

test("names are normalized like the backend", () => {
  assert.equal(normalizeEmojiName("  :Party Parrot: "), "party_parrot");
  assert.equal(normalizeEmojiName("a--b__c"), "a_b_c");
  assert.equal(nameFromFileName("x/y/Party Parrot.GIF"), "party_parrot");
  assert.ok(EMOJI_NAME_PATTERN.test("ok_1"));
  assert.ok(!EMOJI_NAME_PATTERN.test("x"));
  assert.ok(!EMOJI_NAME_PATTERN.test("Bad"));
});

test("relative urls go to the API host, absolute ones stay", () => {
  assert.equal(resolveEmojiUrl("/uploads/a.png", "https://api.x/"), "https://api.x/uploads/a.png");
  assert.equal(resolveEmojiUrl("https://cdn/a.png", "https://api.x"), "https://cdn/a.png");
  assert.equal(resolveEmojiUrl("", "https://api.x"), "");
});

test("dto -> custom emoji keeps the reaction key and resolves the url", () => {
  const c = toCustomEmoji(dto(), "https://api.x");
  assert.deepEqual([c.id, c.name, c.reaction, c.url, c.animated], ["e1", "party_parrot", "custom:e1", "https://api.x/uploads/x.gif", true]);
});

test("custom emojis from the team resolve :name: in messages", () => {
  const map = customByName([toCustomEmoji(dto(), "https://api.x")]);
  const segs = splitEmojiSegments("hola :party_parrot:", map);
  assert.deepEqual(segs.map((s) => s.type), ["text", "custom"]);
});

test("who can change an emoji", () => {
  assert.equal(canChangeEmoji(dto(), "u1", { canCreate: true, canManage: false }), true);
  assert.equal(canChangeEmoji(dto(), "u2", { canCreate: true, canManage: false }), false);
  assert.equal(canChangeEmoji(dto(), "u2", { canCreate: true, canManage: true }), true);
  assert.equal(canChangeEmoji(dto({ createdBy: null }), "u1", { canCreate: true, canManage: false }), false);
});

test("every backend error code maps to its own message", () => {
  const codes = ["NOT_A_MEMBER", "FORBIDDEN", "NOT_FOUND", "FILE_REQUIRED", "TOO_LARGE", "UNSUPPORTED_TYPE", "CORRUPT_IMAGE", "DIMENSIONS_INVALID", "ASPECT_INVALID", "NAME_INVALID", "NAME_TAKEN", "LIMIT_REACHED", "STORAGE_FAILED"];
  const keys = codes.map((c) => emojiErrorKey(`EMOJI_${c}`));
  assert.equal(new Set(keys).size, codes.length);
  assert.ok(!keys.includes("errors.generic"));
  assert.equal(emojiErrorKey(undefined), "errors.generic");
  assert.equal(emojiErrorKey("OTHER"), "errors.generic");
});

test("precheck and formatting", () => {
  assert.equal(precheckFile({ type: "image/jpeg", size: 10 }, limits), "unsupportedType");
  assert.equal(precheckFile({ type: "image/png", size: 300000 }, limits), "tooLarge");
  assert.equal(precheckFile({ type: "image/png", size: 1000 }, limits), null);
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(262144), "256 KB");
});

test("sorted by name", () => {
  assert.deepEqual(sortEmojis([dto({ name: "b" }), dto({ name: "a" })]).map((e) => e.name), ["a", "b"]);
});
