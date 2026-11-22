import assert from "node:assert/strict";
import { test } from "node:test";

import { triggerAt, completionsAt, diagnosticsByLine, foldRanges, formatSource, highlightLine, variablesInScope } from "./editor-utils.ts";

const join = (line: string) => highlightLine(line).map((t) => t.text).join("");

test("highlightLine is lossless and classifies the main pieces", () => {
  for (const l of ['on command "hola":', '  reply "x # not a comment" ephemeral # real', "  si text contiene \"a\":", "", "   ", "  set n = 12"]) assert.equal(join(l), l);
  const t = highlightLine('  reply "hi" # c');
  assert.deepEqual(t.filter((x) => x.cls !== "text").map((x) => x.cls), ["action", "string", "comment"]);
  assert.equal(highlightLine("on command").find((x) => x.text === "command")?.cls, "trigger");
  assert.equal(highlightLine("if text contains").find((x) => x.text.trim() === "contains")?.cls, "operator");
});

test("variablesInScope reads set and for each", () => {
  const src = 'on message:\n  set role = "a"\n  for each members as m index i:\n    reply "x"\n';
  assert.deepEqual(variablesInScope(src).sort(), ["i", "m", "role"]);
});

const at = (src: string, ctx: { lang: "en" | "es"; nodeKinds?: string[] } = { lang: "en" }) => completionsAt(src, src.length, ctx);

test("completions at the top level offer triggers, inside a block offer actions", () => {
  assert.ok(at("").items.some((i) => i.label === "on"));
  const inner = at("on message:\n  re");
  assert.ok(inner.items.some((i) => i.label === "reply"));
  assert.ok(inner.items.some((i) => i.label === "react"));
  assert.equal(inner.from, "on message:\n  ".length);
});

test("completions after on / do / if", () => {
  assert.ok(at("on ").items.some((i) => i.label === "command"));
  assert.ok(at("al recibir ", { lang: "es" }).items.some((i) => i.label === "comando"));
  assert.deepEqual(at("on message:\n  do kil", { lang: "en", nodeKinds: ["killio.room.pin_message", "core.action.delay"] }).items.map((i) => i.label), ["killio.room.pin_message"]);
  assert.ok(at("on message:\n  if ").items.some((i) => i.label === "text"));
  assert.ok(at("on message:\n  if text ").items.some((i) => i.label === "contains"));
  assert.ok(at("on message:\n  si text ", { lang: "es" }).items.some((i) => i.label === "contiene"));
});

test("variables defined earlier are suggested as fields", () => {
  assert.ok(at('on message:\n  set puntos = 1\n  if pu').items.some((i) => i.label === "puntos"));
});

test("no completions inside strings or comments", () => {
  assert.deepEqual(at('on message:\n  reply "he').items, []);
  assert.deepEqual(at("on message:\n  reply # he").items, []);
});

test("formatSource normalises indentation and blank lines", () => {
  const out = formatSource('on message:\n\t\treply "a"   \n\n\n\n    if text is "x":\n        reply "b"\n');
  assert.equal(out, 'on message:\n  reply "a"\n\n  if text is "x":\n    reply "b"\n');
  assert.equal(formatSource(out), out, "idempotent");
  assert.equal(formatSource(""), "");
});

test("foldRanges and diagnosticsByLine", () => {
  const r = foldRanges('on message:\n  if text is "a":\n    reply "x"\n  reply "y"\n');
  assert.equal(r.get(1), 4);
  assert.equal(r.get(2), 3);
  const m = diagnosticsByLine([
    { line: 2, col: 1, endCol: 3, severity: "error", code: "E", message: "a" },
    { line: 2, col: 5, endCol: 6, severity: "error", code: "E", message: "b" },
  ]);
  assert.equal(m.get(2)?.length, 2);
});

test("fields depend on the enclosing trigger", () => {
  assert.equal(triggerAt('on reaction "x":\n  if ', 25), "reaction");
  assert.equal(triggerAt('al recibir el comando "a":\n  si ', 33), "command");
  const src = 'on join roomId="r":\n  if ';
  const labels = completionsAt(src, src.length, { lang: "en" }).items.map((i) => i.label);
  assert.ok(labels.includes("userName"));
  assert.ok(!labels.includes("authorName"));
  const s2 = "on message:\n  add_";
  assert.ok(completionsAt(s2, s2.length, { lang: "en" }).items.some((i) => i.label === "add_brick"));
});
