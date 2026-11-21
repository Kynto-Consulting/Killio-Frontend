import assert from "node:assert/strict";
import { test } from "node:test";

import { addEphemeral, dismissEphemeral, ephemeralExtras, mergeRoomEphemeral, normalizeEphemeral, normalizeEphemeralList, visibleEphemeral } from "./ephemeral.ts";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const dto = (id: string, extra: Record<string, unknown> = {}) => ({
  id, roomId: "r1", ephemeral: true, userId: "bot1", content: `msg ${id}`, metadata: null, sourceMessageId: null, isBot: true,
  user: { displayName: "Ayuda", avatarUrl: null, isBot: true }, createdAt: "2026-01-01T11:30:00Z", expiresAt: "2026-01-01T12:30:00Z", ...extra,
});

test("reads the server DTO", () => {
  const e = normalizeEphemeral(dto("e1", { metadata: { rich: { version: 1, blocks: [{ type: "text", text: "x" }] } } }));
  assert.equal(e?.botName, "Ayuda");
  assert.equal(e?.content, "msg e1");
  assert.equal(ephemeralExtras(e!).blocks.length, 1);
  assert.equal(normalizeEphemeral({ id: "x" }), null);
  assert.deepEqual(normalizeEphemeralList("x"), []);
  assert.equal(normalizeEphemeral({ id: "a", roomId: "r" })?.botName, "Bot");
});

test("shows only this room, only unexpired, oldest first", () => {
  const list = normalizeEphemeralList([
    dto("a", { createdAt: "2026-01-01T11:50:00Z" }),
    dto("b", { createdAt: "2026-01-01T11:40:00Z" }),
    dto("old", { expiresAt: "2026-01-01T11:59:00Z" }),
    dto("other", { roomId: "r2" }),
  ]);
  assert.deepEqual(visibleEphemeral(list, "r1", NOW).map((e) => e.id), ["b", "a"]);
  assert.deepEqual(visibleEphemeral(list, "r2", NOW).map((e) => e.id), ["other"]);
});

test("adding replaces by id and drops expired; dismissing removes", () => {
  let list = normalizeEphemeralList([dto("a"), dto("old", { expiresAt: "2026-01-01T11:00:00Z" })]);
  list = addEphemeral(list, normalizeEphemeral(dto("a", { content: "nuevo" }))!, NOW);
  assert.deepEqual(list.map((e) => [e.id, e.content]), [["a", "nuevo"]]);
  list = addEphemeral(list, normalizeEphemeral(dto("b"))!, NOW);
  assert.deepEqual(dismissEphemeral(list, "a").map((e) => e.id), ["b"]);
});

test("merging the server list of one room keeps the others", () => {
  const local = normalizeEphemeralList([dto("a"), dto("x", { roomId: "r2" })]);
  const merged = mergeRoomEphemeral(local, "r1", normalizeEphemeralList([dto("b")]), NOW);
  assert.deepEqual(merged.map((e) => e.id).sort(), ["b", "x"]);
});
