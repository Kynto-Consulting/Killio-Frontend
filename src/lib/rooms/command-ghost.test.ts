import test from "node:test";
import assert from "node:assert/strict";

import { formatInvokedAt, ghostOf, isCommandAck, looksLikeCommand, popoverPosition, readCommandGhost } from "./command-ghost.ts";

const meta = {
  interaction: {
    id: "i1", commandName: "greet", invokerUserId: "u1", invokerName: "Ana",
    params: [{ name: "name", value: "Bo" }, { name: "times", value: 2 }, { value: "no name" }, null],
    invokedAt: "2026-11-21T12:00:00.000Z",
  },
};

test("reads the interaction header, keeps only well-formed params and stringifies values", () => {
  const g = readCommandGhost(meta)!;
  assert.equal(g.commandName, "greet");
  assert.equal(g.invokerName, "Ana");
  assert.deepEqual(g.params, [{ name: "name", value: "Bo" }, { name: "times", value: "2" }]);
  assert.equal(g.failed, null);
});

test("old messages and malformed metadata give no header", () => {
  for (const m of [null, undefined, {}, { interaction: null }, { interaction: "x" }, { interaction: { commandName: "bad name!" } }, { interaction: { commandName: "" } }, "text", 5]) {
    assert.equal(readCommandGhost(m), null);
  }
  // "/hola" typed by someone before this feature is just a message with no metadata
  assert.equal(ghostOf({ metadata: null, user: { isBot: false } }), null);
});

test("a slash in the stored name is dropped and an unknown failure code is ignored", () => {
  const g = readCommandGhost({ interaction: { commandName: "/hola", failed: "weird", invokedAt: "nope" } })!;
  assert.equal(g.commandName, "hola");
  assert.equal(g.failed, null);
  assert.equal(g.invokedAt, "");
  assert.equal(readCommandGhost({ interaction: { commandName: "hola", failed: "no_response" } })!.failed, "no_response");
});

test("only a bot message shows the header (a person cannot forge it)", () => {
  assert.equal(ghostOf({ metadata: meta, user: { isBot: false } }), null);
  assert.equal(ghostOf({ metadata: meta, user: undefined }), null);
  assert.equal(ghostOf({ metadata: meta, user: { isBot: true } })?.invokerName, "Ana");
});

test("a command is plain /name text without thread or metadata", () => {
  assert.equal(looksLikeCommand("/hola"), true);
  assert.equal(looksLikeCommand("  /greet name:Ana "), true);
  assert.equal(looksLikeCommand("/hola", { metadata: {} }), true);
  assert.equal(looksLikeCommand("/hola", { threadRootId: "t1" }), false);
  assert.equal(looksLikeCommand("/hola", { metadata: { attachments: [1] } }), false);
  for (const s of ["hola", "/", "/ hola", "see /etc/hosts", "//x", "/a/b", ""]) assert.equal(looksLikeCommand(s), false, s);
});

test("the server acknowledgement is recognised", () => {
  assert.equal(isCommandAck({ commandInvocation: true, id: "x" }), true);
  assert.equal(isCommandAck({ id: "m1", content: "/x" }), false);
  assert.equal(isCommandAck(null), false);
});

test("date label survives an invalid date", () => {
  assert.equal(formatInvokedAt("nope"), "");
  assert.ok(formatInvokedAt("2026-11-21T12:00:00Z", "en").length > 3);
});

test("popover opens below when it fits, above when not, and stays inside the viewport", () => {
  const vp = { width: 1000, height: 700 };
  const size = { width: 288, height: 160 };
  assert.deepEqual(popoverPosition({ left: 100, top: 100, bottom: 120 }, size, vp), { left: 100, top: 126, placement: "below" });
  assert.equal(popoverPosition({ left: 100, top: 600, bottom: 620 }, size, vp).placement, "above");
  assert.equal(popoverPosition({ left: 100, top: 600, bottom: 620 }, size, vp).top, 600 - 6 - 160);
  assert.equal(popoverPosition({ left: 900, top: 100, bottom: 120 }, size, vp).left, 1000 - 8 - 288);
  assert.equal(popoverPosition({ left: -50, top: 100, bottom: 120 }, size, vp).left, 8);
  // neither fits: stays below but is pulled up into the viewport
  const tight = popoverPosition({ left: 0, top: 50, bottom: 70 }, { width: 100, height: 300 }, { width: 400, height: 300 });
  assert.equal(tight.placement, "below");
  assert.ok(tight.top >= 8);
});
