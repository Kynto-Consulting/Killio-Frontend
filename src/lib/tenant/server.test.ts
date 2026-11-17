import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import { TENANT_FRESH_MS, getTenantConfig, resetTenantCacheForTests } from "./server.ts";

const body = (name: string) => JSON.stringify({ mode: "tenant", brand: { name } });
const ok = (name: string) => Promise.resolve(new Response(body(name), { status: 200 }));

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  resetTenantCacheForTests();
});

test("a fresh copy is reused without asking the backend again", async () => {
  const fetchMock = mock.method(globalThis, "fetch", () => ok("ROE"));
  assert.equal((await getTenantConfig()).brand.name, "ROE");
  assert.equal((await getTenantConfig()).brand.name, "ROE");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a stale copy is served at once and refreshed in the background", async () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000 });
  let name = "ROE";
  const fetchMock = mock.method(globalThis, "fetch", () => ok(name));
  await getTenantConfig();
  name = "ROE 2";
  mock.timers.tick(TENANT_FRESH_MS + 1);
  assert.equal((await getTenantConfig()).brand.name, "ROE", "the stale copy answers immediately");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal((await getTenantConfig()).brand.name, "ROE 2", "and the next render has the new one");
});

test("a slow or failing backend never delays or changes a page that already has a copy", async () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000 });
  mock.method(globalThis, "fetch", () => ok("ROE"));
  await getTenantConfig();
  mock.restoreAll();
  mock.method(globalThis, "fetch", () => new Promise(() => {})); // never answers
  mock.timers.tick(TENANT_FRESH_MS + 1);
  assert.equal((await getTenantConfig()).brand.name, "ROE");
  mock.restoreAll();
  mock.method(globalThis, "fetch", () => Promise.reject(new Error("down")));
  assert.equal((await getTenantConfig()).mode, "tenant");
});

test("with nothing cached and the backend down it falls back to the public look", async () => {
  mock.method(globalThis, "fetch", () => Promise.reject(new Error("down")));
  assert.equal((await getTenantConfig()).mode, "public");
});

test("concurrent renders share one request", async () => {
  const fetchMock = mock.method(globalThis, "fetch", () => ok("ROE"));
  await Promise.all([getTenantConfig(), getTenantConfig(), getTenantConfig()]);
  assert.equal(fetchMock.mock.callCount(), 1);
});
