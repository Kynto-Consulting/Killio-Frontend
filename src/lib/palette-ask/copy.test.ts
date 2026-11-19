import assert from "node:assert/strict";
import test from "node:test";

import { ASK_DICTIONARIES, flattenKeys, fmt, getAskCopy } from "./copy.ts";

test("es and en have identical key sets and no empty strings", () => {
  const es = flattenKeys(ASK_DICTIONARIES.es).sort();
  const en = flattenKeys(ASK_DICTIONARIES.en).sort();
  assert.deepEqual(es, en);
  assert.ok(es.length > 40);
});

test("placeholders match between languages", () => {
  const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  const walk = (a: any, b: any, path: string) => {
    if (typeof a === "string") return assert.equal(params(a), params(b), `placeholders differ at ${path}`);
    for (const k of Object.keys(a)) walk(a[k], b[k], `${path}.${k}`);
  };
  walk(ASK_DICTIONARIES.es, ASK_DICTIONARIES.en, "copy");
});

test("no product or client names are hardcoded in the copy", () => {
  const all = [...flattenKeys(ASK_DICTIONARIES.es), ...flattenKeys(ASK_DICTIONARIES.en)];
  assert.ok(all.length > 0);
  const texts = JSON.stringify(ASK_DICTIONARIES);
  assert.equal(/killio|tumi|roe\b/i.test(texts), false);
});

test("getAskCopy defaults to Spanish; en* selects English; fmt fills params and keeps unknown ones", () => {
  assert.equal(getAskCopy(undefined), ASK_DICTIONARIES.es);
  assert.equal(getAskCopy("es-MX"), ASK_DICTIONARIES.es);
  assert.equal(getAskCopy("en-US"), ASK_DICTIONARIES.en);
  assert.equal(fmt("Preguntar a {brand}", { brand: "Acme" }), "Preguntar a Acme");
  assert.equal(fmt("a {x} {y}", { x: 1 }), "a 1 {y}");
});
