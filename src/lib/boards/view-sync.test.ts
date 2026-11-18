import assert from 'node:assert/strict';
import test from 'node:test';

import { boardPrefsKey, listViewsKey, savedViewsKey } from './view-storage.ts';
import type { KeyValueStorage } from './view-storage.ts';
import { createViewSync, readLastExpression, replayById, viewCacheKey, viewMigratedKey, writeLastExpression } from './view-sync.ts';
import type { ServerBoardSettings, ServerTagGroupRow, SyncState, ViewSettingsApi, ViewSnapshot } from './view-sync.ts';

class MemStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

/** Manual clock: timers only fire when the test advances time. */
function fakeClock() {
  let time = 1_000_000;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => time,
    timers: {
      set: (fn: () => void, ms: number) => { const id = ++seq; pending.set(id, { at: time + ms, fn }); return id; },
      clear: (h: unknown) => void pending.delete(h as number),
    },
    pendingCount: () => pending.size,
    async advance(ms: number) {
      const target = time + ms;
      for (;;) {
        const next = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        pending.delete(next[0]);
        time = next[1].at;
        next[1].fn();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        await new Promise((r) => setImmediate(r));
      }
      time = target;
    },
  };
}

/** In-memory server with the rules of the real one (updated_at per item, unique names, 403 for read-only users). */
function fakeServer() {
  const s = {
    teamId: 'team1' as string | null,
    sort: [] as any[],
    sortAt: null as string | null,
    lists: {} as Record<string, any>,
    listAt: {} as Record<string, string>,
    views: [] as any[],
    groups: [] as ServerTagGroupRow[],
    calls: [] as string[],
    failNext: [] as Array<{ status?: number; message: string }>,
    offline: false,
    readOnly: false,
    clock: Date.parse('2026-01-01T00:00:00Z'),
  };
  const stamp = () => new Date((s.clock += 1000)).toISOString();
  const guard = (name: string, write: boolean) => {
    s.calls.push(name);
    if (s.offline) throw new Error('Failed to fetch');
    const f = s.failNext.shift();
    if (f) throw Object.assign(new Error(f.message), { status: f.status });
    if (write && s.readOnly) throw Object.assign(new Error('forbidden'), { status: 403 });
  };
  const api: ViewSettingsApi = {
    getBoard: async () => { guard('getBoard', false); return { teamId: s.teamId, sort: s.sort, lists: s.lists, savedViews: s.views, meta: { sortUpdatedAt: s.sortAt, listUpdatedAt: { ...s.listAt } } } as ServerBoardSettings; },
    putBoard: async (_b, body) => {
      guard('putBoard', true);
      if ('sort' in body) { s.sort = body.sort ?? []; s.sortAt = stamp(); }
      for (const [id, cfg] of Object.entries(body.listConfigs ?? {})) { if (cfg) { s.lists[id] = cfg; s.listAt[id] = stamp(); } else { delete s.lists[id]; delete s.listAt[id]; } }
      return {};
    },
    createSavedView: async (_b, v) => {
      guard('createSavedView', true);
      if (s.views.some((x) => x.name.toLowerCase() === v.name.toLowerCase())) throw Object.assign(new Error('A saved view with that name already exists.'), { status: 409 });
      if (s.views.some((x) => x.id === v.id)) throw Object.assign(new Error('exists'), { status: 409 });
      s.views.push({ ...v }); return {};
    },
    updateSavedView: async (_b, id, patch) => { guard('updateSavedView', true); const v = s.views.find((x) => x.id === id); if (!v) throw Object.assign(new Error('nf'), { status: 404 }); Object.assign(v, patch); return {}; },
    deleteSavedView: async (_b, id) => { guard('deleteSavedView', true); const i = s.views.findIndex((x) => x.id === id); if (i < 0) throw Object.assign(new Error('nf'), { status: 404 }); s.views.splice(i, 1); return {}; },
    listTagGroups: async () => { guard('listTagGroups', false); return s.groups.map((g) => ({ ...g })); },
    createTagGroup: async (_t, g) => {
      guard('createTagGroup', true);
      if (s.groups.some((x) => x.name.toLowerCase() === g.name.toLowerCase())) throw Object.assign(new Error('A tag group with that name already exists.'), { status: 409 });
      s.groups.push({ ...g }); return {};
    },
    updateTagGroup: async (_t, id, patch) => { guard('updateTagGroup', true); const g = s.groups.find((x) => x.id === id); if (!g) throw Object.assign(new Error('nf'), { status: 404 }); Object.assign(g, patch); return {}; },
    deleteTagGroup: async (_t, id) => { guard('deleteTagGroup', true); s.groups = s.groups.filter((x) => x.id !== id); return {}; },
  };
  return { s, api };
}

function harness(opts: { api?: ViewSettingsApi | null; storage?: MemStorage; clock?: ReturnType<typeof fakeClock>; boardId?: string } = {}) {
  const clock = opts.clock ?? fakeClock();
  const storage = opts.storage ?? new MemStorage();
  const snapshots: ViewSnapshot[] = [];
  const states: SyncState[] = [];
  const sync = createViewSync({
    boardId: opts.boardId ?? 'b1',
    api: opts.api === undefined ? null : opts.api,
    storage,
    onChange: (s) => snapshots.push(s),
    onState: (s) => states.push(s),
    timers: clock.timers,
    now: clock.now,
    retryDelaysMs: [1000, 2000, 4000],
  });
  return { sync, clock, storage, snapshots, states, last: () => states[states.length - 1] };
}

const seedLegacy = (storage: MemStorage) => {
  storage.setItem(savedViewsKey('b1'), JSON.stringify([{ id: 'view-legacy-1', name: 'Mine', expression: 'assignee = me' }]));
  storage.setItem(listViewsKey('b1'), JSON.stringify({ l1: { filter: 'status = "open"', sort: [{ key: 'tagGroup:local-group-1', dir: 'asc' }] } }));
  storage.setItem(boardPrefsKey('b1'), JSON.stringify({ sort: [{ key: 'due', dir: 'asc' }], tagGroups: [{ id: 'local-group-1', name: 'Prioridad', tags: ['Urgente', 'Alta'] }] }));
};

test('local mode (no api): legacy keys are the store, writes go through immediately', async () => {
  const h = harness({ api: null });
  await h.sync.load();
  assert.equal(h.last().status, 'local');
  h.sync.setBoardSort([{ key: 'due', dir: 'desc' }]);
  h.sync.setTagGroups([{ id: 'tg-1', name: 'P', tags: ['a'] }]);
  h.sync.setListConfig('l1', { filter: 'x = 1' });
  assert.deepEqual(JSON.parse(h.storage.getItem(boardPrefsKey('b1'))!), { sort: [{ key: 'due', dir: 'desc' }], tagGroups: [{ id: 'tg-1', name: 'P', tags: ['a'] }] });
  assert.ok(h.storage.getItem(listViewsKey('b1')));
  assert.equal(h.clock.pendingCount(), 0, 'no timers in local mode');
});

test('debounce: several edits within 500 ms produce one PUT with the final state', async () => {
  const { s, api } = fakeServer();
  const h = harness({ api });
  await h.sync.load();
  h.sync.setBoardSort([{ key: 'due', dir: 'asc' }]);
  await h.clock.advance(300);
  h.sync.setBoardSort([{ key: 'title', dir: 'asc' }]);
  h.sync.setListConfig('l1', { filter: 'status = "open"' });
  await h.clock.advance(499);
  assert.equal(s.calls.filter((c) => c === 'putBoard').length, 0, 'not yet');
  assert.equal(h.last().status, 'saving');
  await h.clock.advance(2);
  assert.equal(s.calls.filter((c) => c === 'putBoard').length, 1);
  assert.deepEqual(s.sort, [{ key: 'title', dir: 'asc' }]);
  assert.deepEqual(s.lists.l1, { filter: 'status = "open"' });
  assert.equal(h.last().status, 'saved');
});

test('saved views and team tag groups sync by id: create, rename, delete', async () => {
  const { s, api } = fakeServer();
  const h = harness({ api });
  await h.sync.load();
  h.sync.setSavedViews([{ id: 'view-0000001', name: 'Mine', expression: 'assignee = me' }]);
  h.sync.setTagGroups([{ id: 'group-00001', name: 'Prioridad', tags: ['Alta', 'Baja'] }]);
  await h.clock.advance(600);
  assert.deepEqual(s.views.map((v) => v.name), ['Mine']);
  assert.deepEqual(s.groups.map((g) => [g.name, g.position]), [['Prioridad', 0]]);
  h.sync.setSavedViews([{ id: 'view-0000001', name: 'Mine 2', expression: 'assignee = me' }]);
  h.sync.setTagGroups([{ id: 'group-00001', name: 'Prioridad', tags: ['Baja', 'Alta'] }]);
  await h.clock.advance(600);
  assert.equal(s.views[0].name, 'Mine 2');
  assert.deepEqual(s.groups[0].tags, ['Baja', 'Alta']);
  h.sync.setSavedViews([]);
  h.sync.setTagGroups([]);
  await h.clock.advance(600);
  assert.deepEqual([s.views.length, s.groups.length], [0, 0]);
});

test('retry with backoff: a failing save shows "error" (not saved), then succeeds without losing the edit', async () => {
  const { s, api } = fakeServer();
  const h = harness({ api });
  await h.sync.load();
  s.failNext.push({ status: 503, message: 'down' }, { message: 'Failed to fetch' });
  h.sync.setBoardSort([{ key: 'due', dir: 'asc' }]);
  await h.clock.advance(500);
  assert.equal(h.last().status, 'error');
  await h.clock.advance(1000);
  assert.equal(h.last().status, 'error', 'second attempt failed too');
  assert.deepEqual(s.sort, []);
  await h.clock.advance(1999);
  assert.equal(h.last().status, 'error');
  await h.clock.advance(2);
  assert.equal(h.last().status, 'saved');
  assert.deepEqual(s.sort, [{ key: 'due', dir: 'asc' }]);
});

test('offline fallback: opens from the cache, keeps edits in the cache and pushes them when back online', async () => {
  const { s, api } = fakeServer();
  s.sort = [{ key: 'title', dir: 'asc' }];
  s.sortAt = '1970-01-01T00:00:01.000Z'; // older than the fake clock (about 1970-01-01T00:16:40)
  const first = harness({ api });
  await first.sync.load();
  assert.deepEqual(first.sync.getSnapshot().boardSort, [{ key: 'title', dir: 'asc' }]);
  first.sync.dispose();

  s.offline = true;
  const second = harness({ api, storage: first.storage, clock: first.clock });
  await second.sync.load();
  assert.deepEqual(second.sync.getSnapshot().boardSort, [{ key: 'title', dir: 'asc' }], 'shown from the cache');
  assert.equal(second.last().status, 'error');
  second.sync.setBoardSort([{ key: 'due', dir: 'desc' }]);
  await second.clock.advance(5000);
  second.sync.dispose();

  s.offline = false;
  const third = harness({ api, storage: first.storage, clock: first.clock });
  await third.sync.load();
  await third.clock.advance(600);
  assert.deepEqual(s.sort, [{ key: 'due', dir: 'desc' }], 'the offline edit reached the server');
  assert.equal(third.last().status, 'saved');
});

test('conflict: last write wins by updated_at (newer server write beats an older offline edit; newer local edit beats an older server write)', async () => {
  const storage = new MemStorage();
  const clock = fakeClock();
  const { s, api } = fakeServer();
  const a = harness({ api, storage, clock });
  await a.sync.load();
  a.sync.setBoardSort([{ key: 'due', dir: 'asc' }]);
  await a.clock.advance(600);
  a.sync.dispose();

  // Offline edit at local time T (clock.now is ~1e6, i.e. 1970): the server write below is "newer" (2026).
  s.offline = true;
  const b = harness({ api, storage, clock });
  await b.sync.load();
  b.sync.setBoardSort([{ key: 'title', dir: 'asc' }]);
  b.sync.dispose();
  s.offline = false;
  s.sort = [{ key: 'created', dir: 'desc' }];
  s.sortAt = new Date().toISOString();
  const c = harness({ api, storage, clock });
  await c.sync.load();
  assert.deepEqual(c.sync.getSnapshot().boardSort, [{ key: 'created', dir: 'desc' }], 'server write is newer: it wins');
  c.sync.dispose();

  // Now the opposite: an offline edit newer than the server's last write.
  const clock2 = fakeClock();
  const f = fakeServer();
  f.s.sort = [{ key: 'title', dir: 'asc' }];
  f.s.sortAt = '1970-01-01T00:00:00.000Z';
  const storage2 = new MemStorage();
  const d = harness({ api: f.api, storage: storage2, clock: clock2 });
  await d.sync.load();
  f.s.offline = true;
  d.sync.setBoardSort([{ key: 'due', dir: 'asc' }]);
  d.sync.dispose();
  f.s.offline = false;
  const e = harness({ api: f.api, storage: storage2, clock: clock2 });
  await e.sync.load();
  await e.clock.advance(600);
  assert.deepEqual(f.s.sort, [{ key: 'due', dir: 'asc' }], 'local edit is newer: it wins and is pushed');
});

test('replayById: local deletions, edits and additions are replayed on the server list', () => {
  const server = [{ id: 'a', n: 1 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }, { id: 'd', n: 9 }];
  const base = [{ id: 'a', n: 1 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }];
  const local = [{ id: 'a', n: 2 }, { id: 'c', n: 1 }, { id: 'z', n: 5 }];
  assert.deepEqual(replayById(server, base, local), [{ id: 'a', n: 2 }, { id: 'c', n: 1 }, { id: 'd', n: 9 }, { id: 'z', n: 5 }]);
});

test('migration: empty server + old keys -> uploaded once; tag groups become team groups, sort keys follow the new ids', async () => {
  const { s, api } = fakeServer();
  s.groups = [{ id: 'existing-grp-1', name: 'prioridad', tags: ['X'], position: 0 }];
  const storage = new MemStorage();
  seedLegacy(storage);
  const h = harness({ api, storage });
  await h.sync.load();
  assert.deepEqual(s.groups.map((g) => g.name), ['prioridad'], 'merged by name, no duplicate');
  assert.deepEqual(s.sort, [{ key: 'due', dir: 'asc' }]);
  assert.deepEqual(s.lists.l1.sort, [{ key: 'tagGroup:existing-grp-1', dir: 'asc' }], 'sort key remapped to the team group');
  assert.deepEqual(s.views.map((v) => v.name), ['Mine']);
  assert.equal(storage.getItem(viewMigratedKey('b1')), '1');
  assert.ok(storage.getItem(savedViewsKey('b1')), 'old keys are kept');
  const snap = h.sync.getSnapshot();
  assert.equal(snap.savedViews.length, 1);
  assert.equal(snap.tagGroups[0].id, 'existing-grp-1');

  const before = s.calls.length;
  const again = harness({ api, storage });
  await again.sync.load();
  assert.equal(s.calls.slice(before).some((c) => c.startsWith('create') || c === 'putBoard'), false, 'does not upload twice');
});

test('migration: new tag groups keep their id; a non-empty server wins over old board keys', async () => {
  const { s, api } = fakeServer();
  const storage = new MemStorage();
  seedLegacy(storage);
  const h = harness({ api, storage });
  await h.sync.load();
  assert.equal(s.groups[0].id, 'local-group-1');
  assert.deepEqual(s.lists.l1.sort, [{ key: 'tagGroup:local-group-1', dir: 'asc' }]);

  const f = fakeServer();
  f.s.sort = [{ key: 'title', dir: 'asc' }];
  const storage2 = new MemStorage();
  seedLegacy(storage2);
  const g = harness({ api: f.api, storage: storage2 });
  await g.sync.load();
  assert.deepEqual(f.s.sort, [{ key: 'title', dir: 'asc' }], 'server data is not overwritten');
  assert.equal(f.s.views.length, 0);
  assert.equal(storage2.getItem(viewMigratedKey('b1')), '1');
});

test('migration is retried when the network fails midway (nothing flagged, no duplicates)', async () => {
  const { s, api } = fakeServer();
  const storage = new MemStorage();
  seedLegacy(storage);
  s.failNext.push({ message: 'ok' }); // getBoard fails first
  const h = harness({ api, storage });
  await h.sync.load();
  assert.equal(h.last().status, 'error');
  assert.equal(storage.getItem(viewMigratedKey('b1')), null);
  await h.clock.advance(1100);
  assert.equal(h.last().status, 'saved');
  assert.equal(s.groups.length, 1);
  assert.equal(s.views.length, 1);
});

test('a board the server does not know (404) or may not see (403) falls back to local mode', async () => {
  const { s, api } = fakeServer();
  const storage = new MemStorage();
  seedLegacy(storage);
  s.failNext.push({ status: 404, message: 'not found' });
  const h = harness({ api, storage });
  await h.sync.load();
  assert.equal(h.last().status, 'local');
  assert.equal(h.last().tagGroupsScope, 'local');
  assert.equal(h.sync.getSnapshot().savedViews.length, 1);
  h.sync.setBoardSort([{ key: 'title', dir: 'asc' }]);
  assert.deepEqual(JSON.parse(storage.getItem(boardPrefsKey('b1'))!).sort, [{ key: 'title', dir: 'asc' }]);
});

test('a refused change (409 duplicate name) is not retried: the server state comes back and the error is shown', async () => {
  const { s, api } = fakeServer();
  s.views = [{ id: 'view-server-1', name: 'Mine', expression: 'assignee = me' }];
  const h = harness({ api });
  await h.sync.load();
  h.sync.setSavedViews([...h.sync.getSnapshot().savedViews, { id: 'view-client-01', name: 'mine', expression: 'status = "open"' }]);
  await h.clock.advance(600);
  assert.equal(h.last().status, 'error');
  assert.match(h.last().message ?? '', /already exists/);
  assert.deepEqual(h.sync.getSnapshot().savedViews.map((v) => v.id), ['view-server-1']);
  assert.equal(h.clock.pendingCount(), 0, 'no retry loop');
});

test('read-only access (403) keeps the edit on this device and stops retrying', async () => {
  const { s, api } = fakeServer();
  s.readOnly = true;
  const h = harness({ api });
  await h.sync.load();
  h.sync.setBoardSort([{ key: 'due', dir: 'asc' }]);
  await h.clock.advance(600);
  assert.equal(h.last().status, 'readonly');
  assert.deepEqual(h.sync.getSnapshot().boardSort, [{ key: 'due', dir: 'asc' }]);
  assert.equal(h.clock.pendingCount(), 0);
});

test('team tag groups loaded on another board show up (shared), and the cache is written', async () => {
  const { s, api } = fakeServer();
  s.groups = [{ id: 'team-group-1', name: 'Prioridad', tags: ['Urgente'], position: 0 }];
  const h = harness({ api, boardId: 'b2' });
  await h.sync.load();
  assert.deepEqual(h.sync.getSnapshot().tagGroups, [{ id: 'team-group-1', name: 'Prioridad', tags: ['Urgente'] }]);
  assert.ok(h.storage.getItem(viewCacheKey('b2')));
});

test('last expression is remembered per board and user in localStorage only', () => {
  const st = new MemStorage();
  writeLastExpression(st, 'u1', 'b1', 'assignee = me');
  assert.equal(readLastExpression(st, 'u1', 'b1'), 'assignee = me');
  assert.equal(readLastExpression(st, 'u2', 'b1'), '');
  assert.equal(readLastExpression(st, 'u1', 'b2'), '');
  writeLastExpression(st, 'u1', 'b1', '  ');
  assert.equal(readLastExpression(st, 'u1', 'b1'), '');
  assert.equal(readLastExpression(null, 'u1', 'b1'), '');
});
