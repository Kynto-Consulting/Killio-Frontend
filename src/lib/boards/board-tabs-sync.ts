/**
 * Server sync of a board's view tabs (`views` of `/boards/:id/view-settings`), shared by everyone who opens the board.
 *
 * - Server mode (an `api` is given): the server is the source of truth. The board opens from the local cache, then the
 *   server state is loaded and adopted; edits apply at once (optimistic), are cached with a `dirty` flag and pushed after
 *   a debounce, with retry and backoff. An edit that was never pushed (offline, closed tab) is pushed on the next load
 *   instead of being overwritten. Last write wins, like the board sort.
 * - One-time migration: when the server has no tabs for the board and the browser holds tabs saved before the server
 *   existed (a record without the `synced` flag), they are uploaded once.
 * - Rejected edits (no edit permission, validation) are not retried: the server state is reloaded and shown.
 * - Local mode (no `api`: no session or local files): the browser record is the store, as before.
 *
 * Pure of React and `fetch` (api, storage and timers are injected) so it runs under `node --test`.
 */
import { boardTabsKey, defaultTabs, normalizeTabs } from './board-tabs.ts';
import type { BoardTab } from './board-tabs.ts';
import type { KeyValueStorage } from './view-storage.ts';

export interface BoardTabsApi {
  /** The saved tabs, or `null` when the board never saved any. */
  getViews(boardId: string): Promise<unknown[] | null | undefined>;
  putViews(boardId: string, views: BoardTab[]): Promise<unknown>;
}

export type TabsSyncStatus = 'local' | 'loading' | 'saved' | 'saving' | 'error';

export interface BoardTabsSyncOptions {
  boardId: string;
  /** `null` = local mode. */
  api: BoardTabsApi | null;
  storage: KeyValueStorage | null;
  onChange: (tabs: BoardTab[]) => void;
  onStatus?: (status: TabsSyncStatus, message?: string) => void;
  debounceMs?: number;
  retryDelaysMs?: number[];
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
}

export interface BoardTabsSync {
  load(): Promise<void>;
  getTabs(): BoardTab[];
  setTabs(tabs: BoardTab[]): void;
  flush(): Promise<void>;
  dispose(): void;
}

interface Record_ {
  views?: unknown;
  dirty?: boolean;
  synced?: boolean;
}

const defaultTimers = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const statusOf = (e: unknown): number | null => (typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : null);
/** Network failures, 5xx, 408, 429 and 401 (token being refreshed) are worth retrying; other 4xx are not. */
const retriable = (e: unknown): boolean => {
  const s = statusOf(e);
  return s === null || s >= 500 || s === 408 || s === 429 || s === 401;
};

function readRecord(storage: KeyValueStorage | null, key: string): Record_ | null {
  try {
    const text = storage?.getItem(key);
    const parsed = text ? JSON.parse(text) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record_) : null;
  } catch {
    return null;
  }
}

export function createBoardTabsSync(opts: BoardTabsSyncOptions): BoardTabsSync {
  const { boardId, api, storage } = opts;
  const key = boardTabsKey(boardId);
  const debounceMs = opts.debounceMs ?? 400;
  const retryDelays = opts.retryDelaysMs?.length ? opts.retryDelaysMs : [1000, 2000, 4000, 8000, 15000];
  const timers = opts.timers ?? defaultTimers;

  const cached = readRecord(storage, key);
  let tabs: BoardTab[] = normalizeTabs(cached?.views);
  let dirty = !!cached?.dirty;
  let synced = !!cached?.synced;
  let loaded = false;
  let disposed = false;
  let debounceTimer: unknown = null;
  let retryTimer: unknown = null;
  let attempt = 0;
  let inFlight: Promise<void> | null = null;
  let again = false;

  const status = (s: TabsSyncStatus, message?: string) => {
    if (!disposed) opts.onStatus?.(s, message);
  };
  const emit = () => {
    if (!disposed) opts.onChange(tabs);
  };
  const persist = () => {
    try {
      storage?.setItem(key, JSON.stringify({ views: tabs, ...(dirty ? { dirty: true } : {}), ...(synced ? { synced: true } : {}) }));
    } catch {
      /* private mode / quota: the tabs just do not persist locally */
    }
  };
  const clear = (h: unknown) => {
    if (h !== null) timers.clear(h);
  };

  async function push(): Promise<void> {
    if (!api || !dirty) return;
    clear(retryTimer);
    retryTimer = null;
    const sent = tabs;
    try {
      await api.putViews(boardId, sent);
      attempt = 0;
      synced = true;
      if (same(sent, tabs)) dirty = false;
      persist();
      if (dirty) again = true;
      else status('saved');
    } catch (e) {
      if (!retriable(e)) {
        // Rejected (no edit permission, validation): drop the edit and show what the server has.
        dirty = false;
        status('error', e instanceof Error ? e.message : String(e));
        await adopt();
        return;
      }
      status('error', e instanceof Error ? e.message : String(e));
      const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
      attempt++;
      retryTimer = timers.set(() => {
        retryTimer = null;
        void flushNow();
      }, delay);
    }
  }

  async function flushNow(): Promise<void> {
    if (disposed || !api || !loaded) return;
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = (async () => {
      do {
        again = false;
        await push();
      } while (again && !disposed);
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  /** Replaces the local tabs with the server's (or the defaults when it has none). */
  async function adopt(): Promise<void> {
    if (!api) return;
    try {
      const server = await api.getViews(boardId);
      tabs = server ? normalizeTabs(server) : defaultTabs();
      dirty = false;
      synced = true;
      persist();
      emit();
      status('saved');
    } catch (e) {
      status('error', e instanceof Error ? e.message : String(e));
    }
  }

  return {
    getTabs: () => tabs,
    async load() {
      if (!api) {
        loaded = true;
        emit();
        status('local');
        return;
      }
      emit(); // the cache shows at once
      status('loading');
      try {
        const server = await api.getViews(boardId);
        if (disposed) return;
        loaded = true;
        if (dirty) {
          await flushNow(); // an unsent local edit wins over the server
        } else if (server) {
          tabs = normalizeTabs(server);
          synced = true;
          persist();
          emit();
          status('saved');
        } else if (!synced && cached?.views !== undefined && !same(normalizeTabs(cached.views), defaultTabs())) {
          dirty = true; // one-time migration of the tabs this browser saved before the server stored them
          persist();
          await flushNow();
        } else {
          tabs = defaultTabs();
          emit();
          status('saved');
        }
      } catch (e) {
        loaded = true;
        status('error', e instanceof Error ? e.message : String(e));
        if (dirty && retriable(e)) {
          const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
          attempt++;
          retryTimer = timers.set(() => {
            retryTimer = null;
            void flushNow();
          }, delay);
        }
      }
    },
    setTabs(next) {
      const clean = normalizeTabs(next);
      if (same(clean, tabs)) return;
      tabs = clean;
      dirty = !!api;
      persist();
      emit();
      if (!api) {
        status('local');
        return;
      }
      status('saving');
      if (loaded) {
        clear(debounceTimer);
        debounceTimer = timers.set(() => {
          debounceTimer = null;
          void flushNow();
        }, debounceMs);
      }
    },
    async flush() {
      clear(debounceTimer);
      debounceTimer = null;
      await flushNow();
    },
    dispose() {
      disposed = true;
      clear(debounceTimer);
      clear(retryTimer);
    },
  };
}
