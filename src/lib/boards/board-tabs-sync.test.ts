import assert from "node:assert/strict";
import test from "node:test";

import { boardTabsKey, boardTabsReducer, defaultTabs } from "./board-tabs.ts";
import type { BoardTab } from "./board-tabs.ts";
import { createBoardTabsSync } from "./board-tabs-sync.ts";
import type { BoardTabsApi, TabsSyncStatus } from "./board-tabs-sync.ts";

const memory = (seed: Record<string, string> = {}) => {
  const m = new Map(Object.entries(seed));
  return { map: m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
/** Timers that run only when the test says so. */
const fakeTimers = () => {
  const pending: Array<() => void> = [];
  return { timers: { set: (fn: () => void) => (pending.push(fn), pending.length), clear: () => {} }, run: async () => { while (pending.length) pending.shift()!(); await new Promise((r) => setImmediate(r)); }, pending };
};
const extra = (id: string, name: string): BoardTab => ({ id, type: "list", name });
const withExtra = () => boardTabsReducer(defaultTabs(), { type: "add", id: "view_1", tabType: "list", name: "Seguimiento" });
const fakeApi = (initial: unknown[] | null, opts: { failPut?: () => unknown } = {}) => {
  const calls = { put: [] as BoardTab[][], get: 0 };
  let server = initial;
  const api: BoardTabsApi = {
    getViews: async () => (calls.get++, server),
    putViews: async (_b, views) => {
      const err = opts.failPut?.();
      if (err) throw err;
      calls.put.push(views);
      server = views;
    },
  };
  return { api, calls, get server() { return server; } };
};
const harness = (api: BoardTabsApi | null, storage = memory()) => {
  const ft = fakeTimers();
  const seen: BoardTab[][] = [];
  const statuses: TabsSyncStatus[] = [];
  const sync = createBoardTabsSync({ boardId: "b1", api, storage, timers: ft.timers, onChange: (t) => seen.push(t), onStatus: (s) => statuses.push(s) });
  return { sync, ft, seen, statuses, storage };
};

test("a board whose server has no views shows the default tabs and writes nothing", async () => {
  const f = fakeApi(null);
  const h = harness(f.api);
  await h.sync.load();
  assert.deepEqual(h.sync.getTabs().map((t) => t.id), ["kanban", "gantt", "list"]);
  assert.equal(f.calls.put.length, 0);
  assert.equal(h.storage.map.has(boardTabsKey("b1")), false);
});

test("server views are adopted and cached; everybody sees the same tabs", async () => {
  const f = fakeApi(withExtra());
  const h = harness(f.api);
  await h.sync.load();
  assert.deepEqual(h.sync.getTabs().map((t) => t.id), ["kanban", "gantt", "list", "view_1"]);
  const cached = JSON.parse(h.storage.map.get(boardTabsKey("b1"))!);
  assert.equal(cached.synced, true);
  assert.equal(cached.dirty, undefined);
  // a second device with an empty browser gets them too
  const other = harness(f.api);
  await other.sync.load();
  assert.equal(other.sync.getTabs().length, 4);
});

test("edits are optimistic, pushed once after the debounce, and the cache is clean afterwards", async () => {
  const f = fakeApi(defaultTabs());
  const h = harness(f.api);
  await h.sync.load();
  h.sync.setTabs(withExtra());
  h.sync.setTabs(boardTabsReducer(withExtra(), { type: "rename", id: "view_1", name: "Otro" }));
  assert.equal(h.sync.getTabs()[3].name, "Otro", "optimistic");
  assert.equal(JSON.parse(h.storage.map.get(boardTabsKey("b1"))!).dirty, true);
  assert.equal(f.calls.put.length, 0, "debounced");
  await h.ft.run();
  assert.equal(f.calls.put.length, 1);
  assert.equal(f.calls.put[0][3].name, "Otro");
  assert.equal(JSON.parse(h.storage.map.get(boardTabsKey("b1"))!).dirty, undefined);
  assert.equal(h.statuses.at(-1), "saved");
});

test("migration: tabs this browser saved before the server stored them are uploaded once", async () => {
  const legacy = JSON.stringify({ views: withExtra() });
  const f = fakeApi(null);
  const h = harness(f.api, memory({ [boardTabsKey("b1")]: legacy }));
  await h.sync.load();
  assert.equal(f.calls.put.length, 1);
  assert.deepEqual(f.calls.put[0].map((t) => t.id), ["kanban", "gantt", "list", "view_1"]);
  const again = harness(f.api, h.storage);
  await again.sync.load();
  assert.equal(f.calls.put.length, 1, "not uploaded twice");
  // when the server already has views, the old browser tabs never overwrite them
  const f2 = fakeApi(defaultTabs());
  const h2 = harness(f2.api, memory({ [boardTabsKey("b1")]: legacy }));
  await h2.sync.load();
  assert.equal(f2.calls.put.length, 0);
  assert.equal(h2.sync.getTabs().length, 3);
});

test("an edit that was never pushed wins over the server on the next load", async () => {
  const f = fakeApi(defaultTabs());
  const dirty = JSON.stringify({ views: withExtra(), dirty: true, synced: true });
  const h = harness(f.api, memory({ [boardTabsKey("b1")]: dirty }));
  await h.sync.load();
  assert.equal(f.calls.put.length, 1);
  assert.equal(f.calls.put[0].length, 4);
});

test("network errors keep the edit and retry; rejections reload the server state", async () => {
  let fail: unknown = new Error("offline");
  const f = fakeApi(defaultTabs(), { failPut: () => fail });
  const h = harness(f.api);
  await h.sync.load();
  h.sync.setTabs(withExtra());
  await h.ft.run();
  assert.equal(h.statuses.at(-1), "error");
  assert.equal(h.sync.getTabs().length, 4, "the edit is kept");
  assert.equal(JSON.parse(h.storage.map.get(boardTabsKey("b1"))!).dirty, true);
  fail = null;
  await h.ft.run();
  assert.equal(f.calls.put.length, 1, "the retry succeeded");
  assert.equal(h.statuses.at(-1), "saved");

  fail = Object.assign(new Error("forbidden"), { status: 403 });
  h.sync.setTabs(boardTabsReducer(h.sync.getTabs(), { type: "remove", id: "view_1" }));
  await h.ft.run();
  assert.equal(h.sync.getTabs().length, 4, "rejected edit dropped, server tabs shown again");
  assert.equal(h.ft.pending.length, 0, "no retry for a 403");
});

test("local mode (no api) writes through the browser record only", async () => {
  const h = harness(null);
  await h.sync.load();
  h.sync.setTabs(withExtra());
  const rec = JSON.parse(h.storage.map.get(boardTabsKey("b1"))!);
  assert.equal(rec.views.length, 4);
  assert.equal(rec.dirty, undefined);
  assert.equal(h.statuses.at(-1), "local");
  const reopened = harness(null, h.storage);
  await reopened.sync.load();
  assert.equal(reopened.sync.getTabs().length, 4);
  assert.ok(extra("a", "b"));
});
