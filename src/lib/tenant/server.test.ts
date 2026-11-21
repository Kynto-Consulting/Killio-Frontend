import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import { TENANT_FRESH_MS, getTenantConfig, resetTenantCacheForTests, setFirstLoadWaitForTests } from "./server.ts";

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

test("with nothing cached and the backend down it falls back to the public look, marked degraded", async () => {
  mock.method(globalThis, "fetch", () => Promise.reject(new Error("down")));
  const config = await getTenantConfig();
  assert.equal(config.mode, "public");
  assert.equal(config.degraded, true);
});

test("a good copy is never marked degraded", async () => {
  mock.method(globalThis, "fetch", () => ok("ROE"));
  assert.equal((await getTenantConfig()).degraded, undefined);
});

test("a degraded fallback is not cached: the next render asks again and gets the real look", async () => {
  const fetchMock = mock.method(globalThis, "fetch", () => Promise.reject(new Error("down")));
  assert.equal((await getTenantConfig()).degraded, true);
  fetchMock.mock.restore();
  mock.method(globalThis, "fetch", () => ok("ROE"));
  const next = await getTenantConfig();
  assert.equal(next.brand.name, "ROE");
  assert.equal(next.degraded, undefined);
});

test("a slow first read answers degraded at once but the request carries on and fills the cache", async () => {
  setFirstLoadWaitForTests(5);
  let release: (r: Response) => void = () => {};
  const fetchMock = mock.method(globalThis, "fetch", () => new Promise<Response>((resolve) => { release = resolve; }));
  assert.equal((await getTenantConfig()).degraded, true, "the page is not held back");
  release(new Response(body("ROE"), { status: 200 }));
  await new Promise((r) => setTimeout(r, 10));
  const next = await getTenantConfig();
  assert.equal(next.brand.name, "ROE", "the late answer was kept, not aborted");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a non-config answer (error page, wrong shape) is treated as a failure", async () => {
  mock.method(globalThis, "fetch", () => Promise.resolve(new Response(JSON.stringify({ hello: 1 }), { status: 200 })));
  assert.equal((await getTenantConfig()).degraded, true);
});

test("concurrent renders share one request", async () => {
  const fetchMock = mock.method(globalThis, "fetch", () => ok("ROE"));
  await Promise.all([getTenantConfig(), getTenantConfig(), getTenantConfig()]);
  assert.equal(fetchMock.mock.callCount(), 1);
});
