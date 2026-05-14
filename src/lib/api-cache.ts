/**
 * Killio API Cache — PERF-01 / PERF-05
 *
 * Three-tier cache:
 *   1. Memory (Map)          — instant reads, lives for the page session
 *   2. Browser Cache API     — ~50 MB quota, survives page reloads, tab closes
 *                              (same storage used by Service Workers)
 *   3. localStorage fallback — used only when Cache API is unavailable (old browsers / SSR)
 *
 * The Cache API is accessed via `caches.open('killio-api-v1')`.
 * We store each entry as a synthetic Response so the browser manages the binary storage.
 *
 * Usage:
 *   apiCache.set('boards:teamId', data, 120_000);
 *   const hit = apiCache.get<BoardSummary[]>('boards:teamId');   // sync from memory
 *   await apiCache.getAsync<BoardSummary[]>('boards:teamId');     // memory → CacheAPI → ls
 *   apiCache.invalidate('boards:teamId');
 *   apiCache.invalidatePrefix('boards:');
 *
 *   // Prefetch (warms cache without blocking UI)
 *   apiCache.prefetch('boards:teamId', () => listTeamBoards(teamId, token), CACHE_TTL.BOARDS);
 */

const CACHE_NAME = 'killio-api-v1';
const LS_PREFIX  = 'killio_cache:';

export interface CacheEntry<T> {
  value: T;
  expiresAt: number; // epoch ms
}

// ─── Tier 1: In-memory ────────────────────────────────────────────────────────

const memoryStore = new Map<string, CacheEntry<unknown>>();

function memGet<T>(key: string): T | undefined {
  const e = memoryStore.get(key) as CacheEntry<T> | undefined;
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { memoryStore.delete(key); return undefined; }
  return e.value;
}

function memSet<T>(key: string, entry: CacheEntry<T>) {
  memoryStore.set(key, entry as CacheEntry<unknown>);
}

// ─── Tier 2: Browser Cache API (~50 MB) ──────────────────────────────────────

const CACHE_URL_BASE = 'https://killio-cache.local/';

function cacheApiAvailable(): boolean {
  return typeof caches !== 'undefined';
}

async function cacheApiGet<T>(key: string): Promise<CacheEntry<T> | null> {
  if (!cacheApiAvailable()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res   = await cache.match(CACHE_URL_BASE + encodeURIComponent(key));
    if (!res) return null;
    const entry = await res.json() as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) {
      await cache.delete(CACHE_URL_BASE + encodeURIComponent(key));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function cacheApiSet<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  if (!cacheApiAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res   = new Response(JSON.stringify(entry), {
      headers: { 'Content-Type': 'application/json' },
    });
    await cache.put(CACHE_URL_BASE + encodeURIComponent(key), res);
  } catch {
    // quota exceeded or private browsing — degrade silently
  }
}

async function cacheApiDelete(key: string): Promise<void> {
  if (!cacheApiAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(CACHE_URL_BASE + encodeURIComponent(key));
  } catch { /* ignore */ }
}

async function cacheApiDeletePrefix(prefix: string): Promise<void> {
  if (!cacheApiAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys  = await cache.keys();
    const encodedPrefix = CACHE_URL_BASE + encodeURIComponent(prefix).slice(0, encodeURIComponent(prefix).length);
    // Match keys that start with the encoded prefix
    await Promise.all(
      keys
        .filter((req) => decodeURIComponent(req.url.replace(CACHE_URL_BASE, '')).startsWith(prefix))
        .map((req) => cache.delete(req)),
    );
  } catch { /* ignore */ }
}

// ─── Tier 3: localStorage fallback ───────────────────────────────────────────

function lsKey(key: string) { return `${LS_PREFIX}${key}`; }

function lsGet<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return null;
    const e = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() > e.expiresAt) { localStorage.removeItem(lsKey(key)); return null; }
    return e;
  } catch { return null; }
}

function lsSet<T>(key: string, entry: CacheEntry<T>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(lsKey(key), JSON.stringify(entry)); } catch { /* full */ }
}

function lsDelete(key: string) {
  if (typeof window !== 'undefined') localStorage.removeItem(lsKey(key));
}

function lsDeletePrefix(prefix: string) {
  if (typeof window === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(lsKey(prefix))) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const apiCache = {
  /**
   * Synchronous read — memory only. Use on hot paths (renders, useEffect checks).
   * Falls back to undefined if only in CacheAPI / localStorage (not yet warmed).
   */
  get<T>(key: string): T | undefined {
    return memGet<T>(key);
  },

  /**
   * Async read — checks all three tiers in order.
   * Use for initial page load where you want to show data before the first fetch.
   */
  async getAsync<T>(key: string): Promise<T | undefined> {
    const mem = memGet<T>(key);
    if (mem !== undefined) return mem;

    // Try Cache API first (larger quota)
    const ca = await cacheApiGet<T>(key);
    if (ca) { memSet(key, ca); return ca.value; }

    // Fall back to localStorage
    const ls = lsGet<T>(key);
    if (ls) { memSet(key, ls); return ls.value; }

    return undefined;
  },

  /**
   * Store a value. Writes to all three tiers asynchronously.
   * TTL default: 5 minutes.
   */
  set<T>(key: string, value: T, ttlMs = 5 * 60 * 1000): void {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    memSet(key, entry);
    // Write to Cache API (primary persistence) and localStorage (fallback) in background
    cacheApiSet(key, entry).catch(() => lsSet(key, entry));
    lsSet(key, entry);
  },

  /** Remove a specific key from all tiers. */
  invalidate(key: string): void {
    memoryStore.delete(key);
    cacheApiDelete(key).catch(() => {});
    lsDelete(key);
  },

  /** Remove all keys matching a prefix from all tiers. */
  invalidatePrefix(prefix: string): void {
    for (const key of memoryStore.keys()) {
      if (key.startsWith(prefix)) memoryStore.delete(key);
    }
    cacheApiDeletePrefix(prefix).catch(() => {});
    lsDeletePrefix(prefix);
  },

  /**
   * Stale-while-revalidate: return cached value immediately, fetch fresh in background.
   * Sync version — returns memory hit or undefined; background fetch updates cache + calls onFresh.
   */
  swr<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number,
    onFresh: (fresh: T) => void,
  ): T | undefined {
    const stale = this.get<T>(key);
    fetcher()
      .then((fresh) => { this.set(key, fresh, ttlMs); onFresh(fresh); })
      .catch(() => { /* silently ignore background errors */ });
    return stale;
  },

  /**
   * Pre-fetch: if there is no cache hit (or it is stale), fetch in the background
   * and populate the cache. Does NOT call any callback — use this on hover/focus
   * or during idle time so the next real navigation finds a warm cache.
   *
   * Safe to call multiple times — a pending prefetch for the same key is deduplicated.
   */
  prefetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): void {
    if (inflight.has(key)) return;  // already in-flight
    const hit = this.get<T>(key);
    if (hit !== undefined) return;  // already cached
    inflight.add(key);
    fetcher()
      .then((data) => { this.set(key, data, ttlMs); })
      .catch(() => { /* prefetch failed — no-op */ })
      .finally(() => inflight.delete(key));
  },
};

/** Tracks in-flight prefetch keys so we don't double-fetch. */
const inflight = new Set<string>();

// ─── Warm memory tier from persistent storage on first import ─────────────────
// We kick off an async warm-up so that after a page reload, the first
// synchronous `apiCache.get()` call already has data.
if (typeof window !== 'undefined') {
  (async () => {
    try {
      const ca = cacheApiAvailable() ? await caches.open(CACHE_NAME) : null;
      const keys = ca ? (await ca.keys()).map((r) => decodeURIComponent(r.url.replace(CACHE_URL_BASE, ''))) : [];
      await Promise.all(
        keys.map(async (key) => {
          if (memGet(key) !== undefined) return;
          const entry = await cacheApiGet(key);
          if (entry) memSet(key, entry);
        }),
      );
    } catch { /* warm-up failure is non-critical */ }
  })();
}

// ─── Cache TTLs ───────────────────────────────────────────────────────────────

/** Cache TTLs (ms) */
export const CACHE_TTL = {
  TEAMS:        5 * 60 * 1000,  // 5 min
  BOARDS:       2 * 60 * 1000,  // 2 min
  DOCUMENTS:    2 * 60 * 1000,  // 2 min
  ROOMS:        1 * 60 * 1000,  // 1 min
  BOARD_DETAIL: 30 * 1000,      // 30s — individual board with all cards
  DOCUMENT:     30 * 1000,      // 30s — document with all bricks
  MEMBERS:      5 * 60 * 1000,  // 5 min
} as const;

// ─── Cache key builders ───────────────────────────────────────────────────────

export const cacheKey = {
  teams:     (userId: string)  => `teams:${userId}`,
  boards:    (teamId: string)  => `boards:${teamId}`,
  documents: (teamId: string)  => `documents:${teamId}`,
  rooms:     (teamId: string)  => `rooms:${teamId}`,
  board:     (boardId: string) => `board:${boardId}`,
  document:  (docId: string)   => `document:${docId}`,
  members:   (teamId: string)  => `members:${teamId}`,
} as const;
