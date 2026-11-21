import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKqlPillToken,
  parseKqlPillToken,
  validateKqlPill,
  findKqlPillTokens,
  replaceKqlPillTokenAt,
  replaceKqlPillTokens,
  KQL_PILL_MAX_SCRIPT,
} from "./token.ts";

const SCRIPTS = [
  "cards where overdue count",
  'cards where title contains "a:b" select strip(description)',
  "cards where title ~ /^\\[x\\]/ count",
  "line one\nline two\r\nline three\tTabbed",
  "rows of \"Ventas\" where Estado = 'Pagado' group by Responsable sum(Monto)",
  "cards where assignee = @[group:abc:Equipo TI] count",
  "cards where title contains \"ñandú 🚀 日本語\" count",
  "100% sure ] [ : . ; # & = ? / \\ ~ ! * ' ( )",
];

test("round trip keeps script, mode and label", () => {
  for (const script of SCRIPTS) {
    for (const mode of ["value", "list", "table", "count"] as const) {
      const token = buildKqlPillToken(script, mode, "Mi consulta: 12");
      assert.ok(token.startsWith("@[kql:"));
      const body = token.slice("@[kql:".length, token.indexOf(":", "@[kql:".length));
      assert.ok(!body.includes("]"));
      assert.deepEqual(parseKqlPillToken(token), { script, mode, label: "Mi consulta: 12" });
    }
  }
});

test("encoded script contains no ':' or ']' and the token is one mention-regex match", () => {
  const token = buildKqlPillToken("a:b]c", "value", "x");
  const m = /@\[(\w+):([^:\]]+)(?::([^\]]+))?\]/.exec(token);
  assert.equal(m?.[0], token);
  assert.equal(m?.[1], "kql");
  assert.equal(m?.[3], "x");
});

test("empty label omits the trailing colon and falls back to a derived label", () => {
  const token = buildKqlPillToken("cards count", "count", "");
  assert.ok(!token.slice(6).includes(":"));
  assert.equal(parseKqlPillToken(token)?.label, "cards count");
});

test("mode defaults to value when missing, tolerates unencoded scripts", () => {
  assert.deepEqual(parseKqlPillToken("@[kql:cards%20count:Total]"), { script: "cards count", mode: "value", label: "Total" });
  assert.deepEqual(parseKqlPillToken("@[kql:value.cards count:Total]"), { script: "cards count", mode: "value", label: "Total" });
  assert.equal(parseKqlPillToken("@[kql:list.cards%zzcount:T]")?.script, "cards%zzcount");
});

test("validation limits", () => {
  assert.equal(validateKqlPill("", "value", "x"), "empty-script");
  assert.equal(validateKqlPill("   ", "value", "x"), "empty-script");
  assert.equal(validateKqlPill("x".repeat(KQL_PILL_MAX_SCRIPT), "value", "x"), null);
  assert.equal(validateKqlPill("x".repeat(KQL_PILL_MAX_SCRIPT + 1), "value", "x"), "script-too-long");
  assert.equal(validateKqlPill("x", "value", "l".repeat(60)), null);
  assert.equal(validateKqlPill("x", "value", "l".repeat(61)), "label-too-long");
  assert.equal(validateKqlPill("x", "value", "a]b"), "label-bracket");
  assert.equal(validateKqlPill("x", "nope", "a"), "bad-mode");
  assert.equal(validateKqlPill("\ud800", "value", "a"), "bad-unicode");
  assert.throws(() => buildKqlPillToken("", "value", "a"));
  assert.equal(parseKqlPillToken(`@[kql:value.${encodeURIComponent("x".repeat(2001))}:a]`), null);
});

test("label whitespace is normalised; non-kql or malformed tokens give null", () => {
  assert.equal(parseKqlPillToken(buildKqlPillToken("cards count", "value", "  a \n  b "))?.label, "a b");
  assert.equal(parseKqlPillToken("@[card:1:x]"), null);
  assert.equal(parseKqlPillToken("@[kql:]"), null);
  assert.equal(parseKqlPillToken("hello"), null);
});

test("find / replace tokens inside markdown", () => {
  const a = buildKqlPillToken("cards count", "count", "A");
  const b = buildKqlPillToken("cards where done count", "value", "B");
  const md = `hello ${a} and @[user:1:Ana] then ${b}.`;
  assert.deepEqual(findKqlPillTokens(md).map((t) => t.token), [a, b]);
  const c = buildKqlPillToken("documents count", "count", "C");
  assert.equal(replaceKqlPillTokenAt(md, 1, c), `hello ${a} and @[user:1:Ana] then ${c}.`);
  assert.equal(replaceKqlPillTokenAt(md, 5, c), md);
  assert.equal(replaceKqlPillTokens(md, (s) => `<${s.label}>`), "hello <A> and @[user:1:Ana] then <B>.");
  assert.equal(replaceKqlPillTokens("@[kql:]", () => "x"), "@[kql:]");
});

test("replaceNthTokenOccurrence targets one of several identical tokens", async () => {
  const { replaceNthTokenOccurrence } = await import("./token.ts");
  const a = buildKqlPillToken("cards count", "count", "A");
  const b = buildKqlPillToken("documents count", "count", "B");
  const md = `${a} x ${a} y ${a}`;
  assert.equal(replaceNthTokenOccurrence(md, a, 1, b), `${a} x ${b} y ${a}`);
  assert.equal(replaceNthTokenOccurrence(md, a, 3, b), md);
});
