import assert from "node:assert/strict";
import { test } from "node:test";

import { isModalEphemeral, liveModal, normalizeEphemeral, pendingModal, visibleEphemeral, type EphemeralMessage } from "./ephemeral.ts";

const base = { roomId: "r1", content: "", sourceMessageId: null, botName: "Bot", botAvatarUrl: null, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2030-01-01T00:00:00.000Z" };
const modalMeta = (extra: Record<string, unknown> = {}) => ({ modal: { customId: "f", title: "T", inputs: [{ customId: "a", label: "A" }], ...extra } });
const msg = (id: string, metadata: Record<string, unknown> | null, over: Partial<EphemeralMessage> = {}): EphemeralMessage => ({ ...base, id, metadata, ...over });
const now = Date.parse("2026-06-01T00:00:00Z");

test("a modal carried by an ephemeral row is not listed as a message", () => {
  const list = [msg("m1", modalMeta()), msg("e1", { rich: { blocks: [{ type: "text", text: "hola" }] } }), msg("e2", null, { content: "plain" })];
  assert.equal(isModalEphemeral(list[0]), true);
  assert.equal(isModalEphemeral(list[1]), false);
  assert.deepEqual(visibleEphemeral(list, "r1", now).map((e) => e.id), ["e1", "e2"]);
});

test("the pending modal is the newest live one of this room", () => {
  const list = [
    msg("old", modalMeta({ title: "Old" }), { createdAt: "2026-05-01T00:00:00.000Z" }),
    msg("new", modalMeta({ title: "New" }), { createdAt: "2026-05-02T00:00:00.000Z" }),
    msg("other", modalMeta(), { roomId: "r2", createdAt: "2026-05-03T00:00:00.000Z" }),
  ];
  const p = pendingModal(list, "r1", now);
  assert.equal(p?.ephemeral.id, "new");
  assert.equal(p?.modal.title, "New");
  assert.equal(pendingModal(list, "r3", now), null);
});

test("an expired modal (its own expiresAt or the row's) is never opened", () => {
  assert.equal(liveModal(msg("a", modalMeta({ expiresAt: "2026-05-31T00:00:00Z" })), now), null);
  assert.equal(liveModal(msg("b", modalMeta(), { expiresAt: "2026-05-31T00:00:00.000Z" }), now), null);
  assert.ok(liveModal(msg("c", modalMeta({ expiresAt: "2026-06-02T00:00:00Z" })), now));
  assert.equal(pendingModal([msg("d", modalMeta({ expiresAt: "2026-05-31T00:00:00Z" }))], "r1", now), null);
});

test("a malformed modal is just an ephemeral message with no modal", () => {
  const bad = msg("x", { modal: { customId: "f", title: "T", inputs: [] } });
  assert.equal(isModalEphemeral(bad), false);
  assert.equal(pendingModal([bad], "r1", now), null);
  const parsed = normalizeEphemeral({ id: "i", roomId: "r1", content: "", metadata: modalMeta(), createdAt: base.createdAt, expiresAt: base.expiresAt, user: { displayName: "Bot" } });
  assert.equal(isModalEphemeral(parsed!), true);
});
