import assert from "node:assert/strict";
import test from "node:test";

import { mergeTenantConfig } from "./merge.ts";
import {
  TENANT_RESTORE_SCRIPT,
  TENANT_SNAPSHOT_KEY,
  TENANT_SNAPSHOT_MAX_CHARS,
  buildTenantSnapshot,
  forgetTenantSnapshot,
  hashString,
  readTenantSnapshot,
  writeTenantSnapshot,
  type StorageLike,
} from "./persist.ts";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

const tenant = (primary = "220 90% 50%", name = "ROE") =>
  mergeTenantConfig({ mode: "tenant", brand: { name, shortName: name } as never, theme: { light: { primary }, dark: { primary } } as never });

test("a good tenant config makes a snapshot, the public look and a degraded copy do not", () => {
  assert.ok(buildTenantSnapshot(tenant(), "roe.example.com"));
  assert.equal(buildTenantSnapshot(mergeTenantConfig({ mode: "public" }), "killio.dev"), null);
  assert.equal(buildTenantSnapshot({ ...tenant(), degraded: true }, "roe.example.com"), null);
  assert.equal(buildTenantSnapshot(tenant(), ""), null);
});

test("write then read returns it on the same host only", () => {
  const storage = memoryStorage();
  const snap = buildTenantSnapshot(tenant(), "roe.example.com")!;
  assert.equal(writeTenantSnapshot(storage, snap), true);
  assert.equal(readTenantSnapshot(storage, "roe.example.com")?.brandName, "ROE");
  assert.equal(readTenantSnapshot(storage, "killio.dev"), null, "a customer snapshot is never applied on another host");
});

test("an identical snapshot is not rewritten, a changed palette replaces it", () => {
  const storage = memoryStorage();
  const a = buildTenantSnapshot(tenant("220 90% 50%"), "h")!;
  assert.equal(writeTenantSnapshot(storage, a), true);
  assert.equal(writeTenantSnapshot(storage, a), false);
  const b = buildTenantSnapshot(tenant("10 90% 50%"), "h")!;
  assert.notEqual(a.hash, b.hash);
  assert.equal(writeTenantSnapshot(storage, b), true);
  assert.equal(readTenantSnapshot(storage, "h")?.hash, b.hash);
});

test("corrupt, foreign-version and malformed data is ignored", () => {
  assert.equal(readTenantSnapshot(memoryStorage({ [TENANT_SNAPSHOT_KEY]: "{not json" }), "h"), null);
  assert.equal(readTenantSnapshot(memoryStorage({ [TENANT_SNAPSHOT_KEY]: JSON.stringify({ v: 99, host: "h" }) }), "h"), null);
  assert.equal(readTenantSnapshot(memoryStorage({ [TENANT_SNAPSHOT_KEY]: "null" }), "h"), null);
  assert.equal(readTenantSnapshot(null, "h"), null);
});

test("an oversized snapshot is not stored", () => {
  const storage = memoryStorage();
  const snap = buildTenantSnapshot(tenant(), "h")!;
  assert.equal(writeTenantSnapshot(storage, { ...snap, css: "a".repeat(TENANT_SNAPSHOT_MAX_CHARS) }), false);
  assert.equal(storage.data[TENANT_SNAPSHOT_KEY], undefined);
});

test("a storage that throws never breaks the page", () => {
  const broken: StorageLike = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(readTenantSnapshot(broken, "h"), null);
  assert.equal(writeTenantSnapshot(broken, buildTenantSnapshot(tenant(), "h")!), false);
  assert.doesNotThrow(() => forgetTenantSnapshot(broken));
});

test("forget removes the snapshot", () => {
  const storage = memoryStorage();
  writeTenantSnapshot(storage, buildTenantSnapshot(tenant(), "h")!);
  forgetTenantSnapshot(storage);
  assert.equal(readTenantSnapshot(storage, "h"), null);
});

test("the head script is valid JavaScript, host-checked and reads the same key", () => {
  assert.doesNotThrow(() => new Function(TENANT_RESTORE_SCRIPT));
  assert.ok(TENANT_RESTORE_SCRIPT.includes(TENANT_SNAPSHOT_KEY));
  assert.ok(TENANT_RESTORE_SCRIPT.includes("s.host!==location.host"));
});

test("the head script paints the stored look only on the matching host", () => {
  const snap = buildTenantSnapshot(tenant(), "roe.example.com")!;
  type Node = { id?: string; textContent?: string; setAttribute(): void };
  const run = (host: string) => {
    const appended: Node[] = [];
    const classes: Record<string, boolean> = {};
    const doc = {
      createElement: (): Node => ({ setAttribute() {} }),
      head: { appendChild: (n: Node) => void appended.push(n) },
      documentElement: { classList: { toggle: (c: string, v: boolean) => void (classes[c] = v) } },
    };
    new Function("document", "localStorage", "location", "matchMedia", TENANT_RESTORE_SCRIPT)(
      doc,
      { getItem: () => JSON.stringify(snap) },
      { host },
      () => ({ matches: false }),
    );
    return { appended, classes };
  };
  const hit = run("roe.example.com");
  assert.equal(hit.appended[0]?.id, "tenant-theme");
  assert.equal(hit.appended[0]?.textContent, snap.css);
  const miss = run("killio.dev");
  assert.equal(miss.appended.length, 0);
  assert.deepEqual(miss.classes, {});
});

test("hashString is stable and sensitive", () => {
  assert.equal(hashString("a"), hashString("a"));
  assert.notEqual(hashString("a"), hashString("b"));
});
