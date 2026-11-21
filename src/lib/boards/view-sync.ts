/**
 * Server sync of the board view settings (sort, list configs, saved views) and the team tag groups.
 *
 * - Server mode (an `api` is given): the server is the source of truth. The board opens from a local cache, then loads
 *   the server state; edits update the local state at once (optimistic) and are pushed after a debounce, with retry and
 *   backoff. Last write wins: edits made while offline only override the server when they are newer than the server's
 *   `updated_at` of that item; saved views and tag groups are merged by id.
 * - Local mode (no `api`: no session, local files, or a board the server does not know): the old localStorage keys are the
 *   store, exactly as before.
 * - One-time migration: when the server has nothing for the board and the old keys have data, it is uploaded; the tag
 *   groups become team groups (merged by name). The old keys are kept untouched and flagged as migrated.
 *
 * Pure of React and of `fetch`: the API, the storage and the timers are injected, so it is unit tested with fakes.
 */
import { isListViewConfigEmpty } from './categories.ts';
import type { ListViewConfig } from './categories.ts';
import { sanitizeTagGroups } from './sorting.ts';
import type { SortRule, TagGroup } from './sorting.ts';
import {
  boardPrefsKey,
  createBoardPrefsStore,
  createListViewConfigStore,
  createSavedViewsStore,
  listViewsKey,
  sanitizeListViewConfig,
  sanitizeSavedViews,
  sanitizeSortRules,
  savedViewsKey,
} from './view-storage.ts';
import type { KeyValueStorage, SavedView } from './view-storage.ts';

export interface ViewSnapshot {
  savedViews: SavedView[];
  listConfigs: Record<string, ListViewConfig>;
  boardSort: SortRule[];
  /** Team tag groups (in local mode: the groups of this board only). */
  tagGroups: TagGroup[];
}

export type SyncStatus = 'local' | 'loading' | 'saved' | 'saving' | 'error' | 'readonly';
export interface SyncState {
  status: SyncStatus;
  /** What went wrong (error / readonly), for display. */
  message?: string;
  /** Whether tag groups are shared with the team (server mode) or only on this device. */
  tagGroupsScope: 'team' | 'local';
}

export interface ServerBoardSettings {
  teamId: string | null;
  sort: SortRule[];
  lists: Record<string, ListViewConfig>;
  savedViews: SavedView[];
  meta: { sortUpdatedAt: string | null; listUpdatedAt: Record<string, string> };
}
export interface ServerTagGroupRow extends TagGroup {
  position: number;
}
export interface ViewSettingsApi {
  getBoard(boardId: string): Promise<ServerBoardSettings>;
  putBoard(boardId: string, body: { sort?: SortRule[] | null; listConfigs?: Record<string, ListViewConfig | null> }): Promise<unknown>;
  createSavedView(boardId: string, view: SavedView): Promise<unknown>;
  updateSavedView(boardId: string, viewId: string, patch: { name?: string; expression?: string }): Promise<unknown>;
  deleteSavedView(boardId: string, viewId: string): Promise<unknown>;
  listTagGroups(teamId: string): Promise<ServerTagGroupRow[]>;
  createTagGroup(teamId: string, group: { id: string; name: string; tags: string[]; position: number; mode?: 'single' | 'multi' | 'limited'; maxTags?: number | null }): Promise<unknown>;
  updateTagGroup(teamId: string, groupId: string, patch: { name?: string; tags?: string[]; position?: number; mode?: 'single' | 'multi' | 'limited'; maxTags?: number | null }): Promise<unknown>;
  deleteTagGroup(teamId: string, groupId: string): Promise<unknown>;
}

export interface SyncTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface ViewSyncOptions {
  boardId: string;
  /** `null` = local mode. */
  api: ViewSettingsApi | null;
  storage: KeyValueStorage | null;
  onChange: (snapshot: ViewSnapshot) => void;
  onState: (state: SyncState) => void;
  debounceMs?: number;
  /** Delays between retries; the last one repeats. */
  retryDelaysMs?: number[];
  timers?: SyncTimers;
  now?: () => number;
}

export interface ViewSyncController {
  load(): Promise<void>;
  getSnapshot(): ViewSnapshot;
  setSavedViews(views: SavedView[]): void;
  setListConfig(listId: string, config: ListViewConfig): void;
  setBoardSort(sort: SortRule[]): void;
  setTagGroups(groups: TagGroup[]): void;
  /** Pushes pending edits now (page hide, unmount). */
  flush(): Promise<void>;
  /** Retries after an error without waiting for the backoff. */
  retry(): Promise<void>;
  dispose(): void;
}

export const viewCacheKey = (boardId: string) => `killio:view-cache:${boardId}`;
export const viewMigratedKey = (boardId: string) => `killio:view-migrated:${boardId}`;
export const lastExpressionKey = (userId: string | null | undefined, boardId: string) => `killio:board-expr:${userId || 'anon'}:${boardId}`;

/** The filter expression last typed on a board, per user and browser only (not shared). */
export function readLastExpression(storage: KeyValueStorage | null, userId: string | null | undefined, boardId: string): string {
  try {
    return storage?.getItem(lastExpressionKey(userId, boardId)) ?? '';
  } catch {
    return '';
  }
}
export function writeLastExpression(storage: KeyValueStorage | null, userId: string | null | undefined, boardId: string, expression: string): void {
  try {
    if (!storage) return;
    if (expression.trim()) storage.setItem(lastExpressionKey(userId, boardId), expression.slice(0, 6000));
    else storage.removeItem(lastExpressionKey(userId, boardId));
  } catch {
    /* private mode / quota */
  }
}

export const emptySnapshot = (): ViewSnapshot => ({ savedViews: [], listConfigs: {}, boardSort: [], tagGroups: [] });

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const ts = (iso: string | null | undefined): number => {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const ID = /^[A-Za-z0-9_-]{8,80}$/;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const statusOf = (e: unknown): number | null => (typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : null);
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** Network failures, 5xx, 408, 429 and 401 (token being refreshed) are worth retrying; other 4xx are not. */
const retriable = (e: unknown): boolean => {
  const s = statusOf(e);
  return s === null || s >= 500 || s === 408 || s === 429 || s === 401;
};

/** Mode and limit as the server stores them (`multi` and no limit when the group has none). */
const ruleOf = (g: TagGroup): { mode: 'single' | 'multi' | 'limited'; maxTags: number | null } => ({ mode: g.mode ?? 'multi', maxTags: g.mode === 'limited' ? g.maxTags ?? 3 : null });

/** Server limits: group name 40, tag 60, 100 tags, unique names, 100 groups. */
export function clampTagGroups(groups: TagGroup[]): TagGroup[] {
  const out: TagGroup[] = [];
  const names = new Set<string>();
  for (const g of sanitizeTagGroups(groups)) {
    const name = g.name.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name || names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const t of g.tags) {
      const tag = t.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        tags.push(tag);
      }
    }
    out.push({ id: g.id, name, tags: tags.slice(0, 100), ...(g.mode ? { mode: g.mode } : {}), ...(g.mode === 'limited' && g.maxTags ? { maxTags: g.maxTags } : {}) });
  }
  return out.slice(0, 100);
}

/** Items of `server` after replaying what the local side did since `base`: deletions, edits and additions, by id. */
export function replayById<T extends { id: string }>(server: T[], base: T[], local: T[]): T[] {
  const baseById = new Map(base.map((x) => [x.id, x]));
  const localById = new Map(local.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const s of server) {
    if (baseById.has(s.id) && !localById.has(s.id)) continue; // deleted locally
    const b = baseById.get(s.id);
    const l = localById.get(s.id);
    out.push(b && l && !same(b, l) ? l : s); // edited locally
  }
  const have = new Set(out.map((x) => x.id));
  for (const l of local) if (!baseById.has(l.id) && !have.has(l.id)) out.push(l); // added locally
  return out;
}

interface CacheV1 {
  v: 1;
  teamId: string | null;
  snap: ViewSnapshot;
  base: ViewSnapshot;
  dirtyAt: { sort?: number; lists: Record<string, number> };
}

const defaultTimers: SyncTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

function readJson(storage: KeyValueStorage | null, key: string): unknown {
  try {
    const text = storage?.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
function writeJson(storage: KeyValueStorage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

function sanitizeSnapshot(raw: unknown): ViewSnapshot {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const listConfigs: Record<string, ListViewConfig> = {};
  if (o.listConfigs && typeof o.listConfigs === 'object') {
    for (const [id, cfg] of Object.entries(o.listConfigs as Record<string, unknown>)) {
      const clean = sanitizeListViewConfig(cfg);
      if (!isListViewConfigEmpty(clean)) listConfigs[id] = clean;
    }
  }
  return { savedViews: sanitizeSavedViews(o.savedViews), listConfigs, boardSort: sanitizeSortRules(o.boardSort), tagGroups: sanitizeTagGroups(o.tagGroups) };
}

function readCache(storage: KeyValueStorage | null, boardId: string): CacheV1 | null {
  const raw = readJson(storage, viewCacheKey(boardId)) as Partial<CacheV1> | null;
  if (!raw || raw.v !== 1) return null;
  const dirty = (raw.dirtyAt ?? { lists: {} }) as CacheV1['dirtyAt'];
  return { v: 1, teamId: typeof raw.teamId === 'string' ? raw.teamId : null, snap: sanitizeSnapshot(raw.snap), base: sanitizeSnapshot(raw.base), dirtyAt: { sort: typeof dirty.sort === 'number' ? dirty.sort : undefined, lists: dirty.lists && typeof dirty.lists === 'object' ? dirty.lists : {} } };
}

/** What the old localStorage keys hold for the board (tag groups were stored with the board prefs). */
export function readLegacy(storage: KeyValueStorage | null, boardId: string): ViewSnapshot {
  const prefs = createBoardPrefsStore(storage).get(boardId);
  return { savedViews: createSavedViewsStore(storage).list(boardId), listConfigs: createListViewConfigStore(storage).getAll(boardId), boardSort: prefs.sort ?? [], tagGroups: prefs.tagGroups ?? [] };
}

const isLegacyEmpty = (s: ViewSnapshot) => !s.savedViews.length && !Object.keys(s.listConfigs).length && !s.boardSort.length && !s.tagGroups.length;

const remapSort = (sort: SortRule[] | undefined, idMap: Record<string, string>): SortRule[] | undefined =>
  sort?.map((r) => {
    if (!r.key.startsWith('tagGroup:')) return r;
    const id = r.key.slice('tagGroup:'.length);
    return idMap[id] ? { ...r, key: `tagGroup:${idMap[id]}` } : r;
  });

export function createViewSync(opts: ViewSyncOptions): ViewSyncController {
  const { boardId, api, storage } = opts;
  const debounceMs = opts.debounceMs ?? 500;
  const retryDelays = opts.retryDelaysMs && opts.retryDelaysMs.length ? opts.retryDelaysMs : [1000, 2000, 4000, 8000, 15000];
  const timers = opts.timers ?? defaultTimers;
  const now = opts.now ?? (() => Date.now());

  let snap: ViewSnapshot = emptySnapshot();
  let base: ViewSnapshot = emptySnapshot();
  let teamId: string | null = null;
  let localMode = api === null;
  let loaded = false;
  let disposed = false;
  let generation = 0;
  let dirtyAt: CacheV1['dirtyAt'] = { lists: {} };
  let debounceTimer: unknown = null;
  let retryTimer: unknown = null;
  let attempt = 0;
  let inFlight: Promise<void> | null = null;
  let again = false;
  let state: SyncState = { status: localMode ? 'local' : 'loading', tagGroupsScope: localMode ? 'local' : 'team' };

  const setState = (status: SyncStatus, message?: string) => {
    state = { status, message, tagGroupsScope: localMode ? 'local' : 'team' };
    if (!disposed) opts.onState(state);
  };
  const emit = () => {
    if (!disposed) opts.onChange(clone(snap));
  };
  const writeCache = () => {
    if (localMode) return;
    writeJson(storage, viewCacheKey(boardId), { v: 1, teamId, snap, base, dirtyAt } as CacheV1);
  };
  const clearTimer = (h: unknown) => {
    if (h !== null) timers.clear(h);
  };

  const hasPending = () => !same(snap, base);

  function scheduleFlush() {
    clearTimer(debounceTimer);
    debounceTimer = timers.set(() => {
      debounceTimer = null;
      void flushNow();
    }, debounceMs);
  }

  /** After an edit: local mode writes through; server mode caches and schedules the push. */
  function afterEdit() {
    if (localMode) {
      writeLegacy();
      setState('local');
      return;
    }
    writeCache();
    if (loaded) {
      setState('saving');
      scheduleFlush();
    }
  }

  function writeLegacy() {
    createSavedViewsStore(storage).save(boardId, snap.savedViews);
    const lists = createListViewConfigStore(storage);
    const stored = lists.getAll(boardId);
    for (const id of Object.keys(stored)) if (!snap.listConfigs[id]) lists.set(boardId, id, {});
    for (const [id, cfg] of Object.entries(snap.listConfigs)) lists.set(boardId, id, cfg);
    createBoardPrefsStore(storage).set(boardId, { sort: snap.boardSort, tagGroups: snap.tagGroups });
  }

  function goLocal() {
    localMode = true;
    loaded = true;
    snap = readLegacy(storage, boardId);
    base = clone(snap);
    emit();
    setState('local');
  }

  /** Reads the old keys, uploads them when the server has nothing, and flags them as migrated. May throw (retried later). */
  async function migrate(server: ServerBoardSettings, groups: ServerTagGroupRow[]): Promise<{ groups: ServerTagGroupRow[]; refetch: boolean }> {
    if (!api || readJson(storage, viewMigratedKey(boardId))) return { groups, refetch: false };
    const legacy = readLegacy(storage, boardId);
    let refetch = false;
    if (!isLegacyEmpty(legacy)) {
      const idMap: Record<string, string> = {};
      const outGroups = [...groups];
      if (teamId && legacy.tagGroups.length) {
        const byName = new Map(outGroups.map((g) => [g.name.toLowerCase(), g]));
        for (const lg of clampTagGroups(legacy.tagGroups)) {
          const existing = byName.get(lg.name.toLowerCase());
          if (existing) {
            idMap[lg.id] = existing.id;
            continue;
          }
          const id = ID.test(lg.id) ? lg.id : newId('tg');
          try {
            await api.createTagGroup(teamId, { id, name: lg.name, tags: lg.tags, position: outGroups.length });
          } catch (e) {
            if (retriable(e)) throw e;
            continue; // refused for good (permission, id taken...): this group stays local only
          }
          idMap[lg.id] = id;
          const row = { id, name: lg.name, tags: lg.tags, position: outGroups.length };
          outGroups.push(row);
          byName.set(lg.name.toLowerCase(), row);
        }
        groups = outGroups;
      }
      const serverEmpty = !server.sort.length && !Object.keys(server.lists).length && !server.savedViews.length;
      if (serverEmpty) {
        const sort = remapSort(legacy.boardSort, idMap) ?? [];
        if (sort.length) {
          try {
            await api.putBoard(boardId, { sort });
            refetch = true;
          } catch (e) {
            if (retriable(e)) throw e;
          }
        }
        for (const [listId, cfg] of Object.entries(legacy.listConfigs)) {
          const mapped: ListViewConfig = { ...cfg, ...(cfg.sort ? { sort: remapSort(cfg.sort, idMap) } : {}) };
          try {
            await api.putBoard(boardId, { listConfigs: { [listId]: mapped } });
            refetch = true;
          } catch (e) {
            if (retriable(e)) throw e;
          }
        }
        for (const v of legacy.savedViews) {
          try {
            await api.createSavedView(boardId, { ...v, id: ID.test(v.id) ? v.id : newId('sv') });
            refetch = true;
          } catch (e) {
            if (retriable(e)) throw e;
          }
        }
      }
    }
    try {
      storage?.setItem(viewMigratedKey(boardId), '1');
    } catch {
      /* private mode */
    }
    return { groups, refetch };
  }

  async function loadServer(discardLocal: boolean): Promise<void> {
    const gen = ++generation;
    setState('loading');
    const cached = discardLocal ? null : readCache(storage, boardId);
    if (cached) {
      snap = clone(cached.snap);
      base = clone(cached.base);
      dirtyAt = clone(cached.dirtyAt);
      teamId = cached.teamId;
      emit();
    } else if (!loaded) {
      snap = readLegacy(storage, boardId); // shown while the server is unreachable; nothing is pushed from it except by migration
      base = clone(snap);
      emit();
    }
    try {
      let server = await api!.getBoard(boardId);
      if (gen !== generation || disposed) return;
      teamId = server.teamId;
      let groups: ServerTagGroupRow[] = teamId ? await api!.listTagGroups(teamId) : [];
      const m = await migrate(server, groups);
      groups = m.groups;
      if (m.refetch) server = await api!.getBoard(boardId);
      if (gen !== generation || disposed) return;

      const serverSnap: ViewSnapshot = sanitizeSnapshot({ savedViews: server.savedViews, listConfigs: server.lists, boardSort: server.sort, tagGroups: [...groups].sort((a, b) => a.position - b.position) });
      const local = discardLocal ? { snap: serverSnap, base: serverSnap, dirtyAt: { lists: {} } as CacheV1['dirtyAt'] } : cached ?? { snap: clone(snap), base: clone(base), dirtyAt };
      const merged = clone(serverSnap);
      // Sort and list configs: a local edit wins only when it is newer than the server's last write.
      if (!same(local.snap.boardSort, local.base.boardSort) && (local.dirtyAt.sort ?? 0) > ts(server.meta.sortUpdatedAt)) merged.boardSort = local.snap.boardSort;
      const ids = new Set([...Object.keys(local.snap.listConfigs), ...Object.keys(local.base.listConfigs)]);
      for (const id of ids) {
        const edited = !same(local.snap.listConfigs[id], local.base.listConfigs[id]);
        if (edited && (local.dirtyAt.lists[id] ?? 0) > ts(server.meta.listUpdatedAt[id])) {
          if (local.snap.listConfigs[id]) merged.listConfigs[id] = local.snap.listConfigs[id];
          else delete merged.listConfigs[id];
        }
      }
      // Saved views and tag groups: replay the local additions/edits/deletions on the server's list.
      merged.savedViews = replayById(serverSnap.savedViews, local.base.savedViews, local.snap.savedViews);
      merged.tagGroups = clampTagGroups(replayById(serverSnap.tagGroups, local.base.tagGroups, local.snap.tagGroups));

      base = serverSnap;
      snap = merged;
      dirtyAt = { sort: local.dirtyAt.sort, lists: { ...local.dirtyAt.lists } };
      loaded = true;
      attempt = 0;
      emit();
      writeCache();
      if (hasPending()) {
        setState('saving');
        scheduleFlush();
      } else {
        dirtyAt = { lists: {} };
        setState('saved');
      }
    } catch (e) {
      if (gen !== generation || disposed) return;
      const s = statusOf(e);
      if (s === 403 || s === 404) {
        goLocal(); // a board the server does not know (local file) or no access: keep the device-only store
        return;
      }
      setState('error', messageOf(e));
      scheduleRetry(() => loadServer(false));
    }
  }

  function scheduleRetry(fn: () => Promise<void>) {
    clearTimer(retryTimer);
    const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
    attempt++;
    retryTimer = timers.set(() => {
      retryTimer = null;
      void fn();
    }, delay);
  }

  async function pushOnce(): Promise<void> {
    if (!api || !loaded) return;
    // Board sort and list configs, in one call.
    const body: { sort?: SortRule[] | null; listConfigs?: Record<string, ListViewConfig | null> } = {};
    const sentSort = clone(snap.boardSort);
    const sentLists: Record<string, ListViewConfig | null> = {};
    if (!same(snap.boardSort, base.boardSort)) body.sort = sentSort;
    for (const id of new Set([...Object.keys(snap.listConfigs), ...Object.keys(base.listConfigs)])) {
      if (!same(snap.listConfigs[id], base.listConfigs[id])) sentLists[id] = snap.listConfigs[id] ? clone(snap.listConfigs[id]) : null;
    }
    if (Object.keys(sentLists).length) body.listConfigs = sentLists;
    if ('sort' in body || body.listConfigs) {
      await api.putBoard(boardId, body);
      if ('sort' in body) base.boardSort = sentSort;
      for (const [id, cfg] of Object.entries(sentLists)) {
        if (cfg) base.listConfigs[id] = cfg;
        else delete base.listConfigs[id];
      }
    }

    // Saved views: deletions, edits, additions.
    const snapViews = new Map(snap.savedViews.map((v) => [v.id, v]));
    for (const v of [...base.savedViews]) {
      if (snapViews.has(v.id)) continue;
      try {
        await api.deleteSavedView(boardId, v.id);
      } catch (e) {
        if (statusOf(e) !== 404) throw e;
      }
      base.savedViews = base.savedViews.filter((x) => x.id !== v.id);
    }
    for (const b of [...base.savedViews]) {
      const l = snapViews.get(b.id);
      if (!l || (l.name === b.name && l.expression === b.expression)) continue;
      try {
        await api.updateSavedView(boardId, b.id, { ...(l.name !== b.name ? { name: l.name } : {}), ...(l.expression !== b.expression ? { expression: l.expression } : {}) });
        base.savedViews = base.savedViews.map((x) => (x.id === b.id ? clone(l) : x));
      } catch (e) {
        if (statusOf(e) !== 404) throw e;
        base.savedViews = base.savedViews.filter((x) => x.id !== b.id); // gone on the server: it is created again below
      }
    }
    const baseIds = new Set(base.savedViews.map((v) => v.id));
    for (const l of snap.savedViews) {
      if (baseIds.has(l.id)) continue;
      await api.createSavedView(boardId, clone(l));
      base.savedViews.push(clone(l));
    }

    // Team tag groups.
    if (teamId) {
      const groups = clampTagGroups(snap.tagGroups);
      if (!same(groups, snap.tagGroups)) snap.tagGroups = groups;
      const snapGroups = new Map(groups.map((g) => [g.id, g]));
      for (const g of [...base.tagGroups]) {
        if (snapGroups.has(g.id)) continue;
        try {
          await api.deleteTagGroup(teamId, g.id);
        } catch (e) {
          if (statusOf(e) !== 404) throw e;
        }
        base.tagGroups = base.tagGroups.filter((x) => x.id !== g.id);
      }
      for (const b of [...base.tagGroups]) {
        const l = snapGroups.get(b.id);
        if (!l || same(l, b)) continue;
        try {
          await api.updateTagGroup(teamId, b.id, { ...(l.name !== b.name ? { name: l.name } : {}), ...(!same(l.tags, b.tags) ? { tags: l.tags } : {}), ...(ruleOf(l).mode !== ruleOf(b).mode || ruleOf(l).maxTags !== ruleOf(b).maxTags ? ruleOf(l) : {}) });
          base.tagGroups = base.tagGroups.map((x) => (x.id === b.id ? clone(l) : x));
        } catch (e) {
          if (statusOf(e) !== 404) throw e;
          base.tagGroups = base.tagGroups.filter((x) => x.id !== b.id);
        }
      }
      const known = new Set(base.tagGroups.map((g) => g.id));
      for (const [index, l] of groups.entries()) {
        if (known.has(l.id)) continue;
        await api.createTagGroup(teamId, { id: l.id, name: l.name, tags: l.tags, position: index, ...ruleOf(l) });
        base.tagGroups.push(clone(l));
      }
    } else {
      base.tagGroups = clone(snap.tagGroups); // no team to share with: device only
    }
  }

  async function runFlush(): Promise<void> {
    if (!api || localMode || !loaded) return;
    do {
      again = false;
      if (!hasPending()) {
        setState('saved');
        return;
      }
      setState('saving');
      try {
        await pushOnce();
        attempt = 0;
        if (!hasPending()) dirtyAt = { lists: {} };
        else {
          if (same(snap.boardSort, base.boardSort)) delete dirtyAt.sort;
          for (const id of Object.keys(dirtyAt.lists)) if (same(snap.listConfigs[id], base.listConfigs[id])) delete dirtyAt.lists[id];
        }
        writeCache();
      } catch (e) {
        writeCache();
        const s = statusOf(e);
        if (s === 403) {
          // Read-only access: the edits stay on this device only; do not retry them.
          base = clone(snap);
          writeCache();
          setState('readonly', messageOf(e));
          return;
        }
        if (retriable(e)) {
          setState('error', messageOf(e));
          scheduleRetry(flushNow);
          return;
        }
        // The server refuses this change (duplicate name, invalid expression...): drop local edits and show the server state.
        const reason = messageOf(e);
        await loadServer(true);
        if (!disposed) setState('error', reason);
        return;
      }
    } while (again || hasPending());
    setState('saved');
  }

  function flushNow(): Promise<void> {
    clearTimer(debounceTimer);
    debounceTimer = null;
    clearTimer(retryTimer);
    retryTimer = null;
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = runFlush().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    async load() {
      if (localMode) {
        goLocal();
        return;
      }
      await loadServer(false);
    },
    getSnapshot: () => clone(snap),
    setSavedViews(views) {
      snap.savedViews = sanitizeSavedViews(views);
      afterEdit();
    },
    setListConfig(listId, config) {
      const clean = sanitizeListViewConfig(config);
      if (isListViewConfigEmpty(clean)) delete snap.listConfigs[listId];
      else snap.listConfigs[listId] = clean;
      dirtyAt.lists[listId] = now();
      afterEdit();
    },
    setBoardSort(sort) {
      snap.boardSort = sanitizeSortRules(sort);
      dirtyAt.sort = now();
      afterEdit();
    },
    setTagGroups(groups) {
      snap.tagGroups = localMode ? sanitizeTagGroups(groups) : clampTagGroups(groups);
      afterEdit();
    },
    flush: () => (localMode ? Promise.resolve() : flushNow()),
    retry: () => (state.status === 'error' && !loaded ? loadServer(false) : flushNow()),
    dispose() {
      disposed = true;
      generation++;
      clearTimer(debounceTimer);
      clearTimer(retryTimer);
    },
  };
}

// Re-exported so callers know the legacy keys that migration reads.
export const LEGACY_KEYS = { savedViews: savedViewsKey, lists: listViewsKey, prefs: boardPrefsKey };
