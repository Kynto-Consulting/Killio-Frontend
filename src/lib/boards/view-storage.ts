/**
 * Persistence of board views (saved filters) and per-list view configs, behind tiny interfaces so a server store can
 * replace the localStorage one. Keys: `killio:board-views:<boardId>` and `killio:list-views:<boardId>`.
 */
import { isListViewConfigEmpty } from './categories.ts';
import type { BoardCategory, ListViewConfig } from './categories.ts';
import { normalizeSortRules, sanitizeTagGroups } from './sorting.ts';
import type { SortRule, TagGroup } from './sorting.ts';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedView {
  id: string;
  name: string;
  expression: string;
}

export interface SavedViewsStore {
  list(boardId: string): SavedView[];
  save(boardId: string, views: SavedView[]): void;
}

export interface ListViewConfigStore {
  /** Every configured list of the board, by list id. */
  getAll(boardId: string): Record<string, ListViewConfig>;
  /** An empty config removes the entry. */
  set(boardId: string, listId: string, config: ListViewConfig): void;
}

export const savedViewsKey = (boardId: string) => `killio:board-views:${boardId}`;
export const listViewsKey = (boardId: string) => `killio:list-views:${boardId}`;

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);

export function sanitizeSavedViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedView[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown> | null;
    const id = str(o?.id, 64);
    const name = str(o?.name, 120);
    if (!id || !name || typeof o?.expression !== 'string') continue;
    out.push({ id, name, expression: o.expression.slice(0, 6000) });
  }
  return out.slice(0, 100);
}

export function sanitizeListViewConfig(raw: unknown): ListViewConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cfg: ListViewConfig = {};
  const filter = str(o.filter, 6000);
  if (filter) cfg.filter = filter;
  if (Array.isArray(o.categories)) {
    const cats: BoardCategory[] = [];
    for (const c of o.categories) {
      const co = c as Record<string, unknown> | null;
      const id = str(co?.id, 64);
      const name = str(co?.name, 80);
      if (!id || !name || typeof co?.expr !== 'string') continue;
      const cat: BoardCategory = { id, name, expr: co.expr.slice(0, 6000) };
      const color = str(co.color, 32);
      if (color) cat.color = color;
      cats.push(cat);
    }
    if (cats.length) cfg.categories = cats.slice(0, 30);
  }
  if (o.showRest === false) cfg.showRest = false;
  const restLabel = str(o.restLabel, 80);
  if (restLabel) cfg.restLabel = restLabel;
  const sort = sanitizeSortRules(o.sort);
  if (sort.length) cfg.sort = sort;
  return cfg;
}

export function sanitizeSortRules(raw: unknown): SortRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: SortRule[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown> | null;
    const key = str(o?.key, 80);
    if (key) rules.push({ key, dir: o?.dir === 'desc' ? 'desc' : 'asc' });
  }
  return normalizeSortRules(rules).slice(0, 6);
}

/**
 * Board-level view preferences shared by every list of the board: the board sort and the tag groups.
 * A server column (e.g. `boards.view_prefs jsonb`) should replace this store later; callers only see the interface.
 */
export interface BoardPrefs {
  sort?: SortRule[];
  tagGroups?: TagGroup[];
}

export interface BoardPrefsStore {
  get(boardId: string): BoardPrefs;
  /** Empty prefs remove the entry. */
  set(boardId: string, prefs: BoardPrefs): void;
}

export const boardPrefsKey = (boardId: string) => `killio:board-prefs:${boardId}`;

export function sanitizeBoardPrefs(raw: unknown): BoardPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const prefs: BoardPrefs = {};
  const sort = sanitizeSortRules(o.sort);
  if (sort.length) prefs.sort = sort;
  const tagGroups = sanitizeTagGroups(o.tagGroups);
  if (tagGroups.length) prefs.tagGroups = tagGroups;
  return prefs;
}

export function createBoardPrefsStore(storage: KeyValueStorage | null): BoardPrefsStore {
  return {
    get: (boardId) => sanitizeBoardPrefs(readJson(storage, boardPrefsKey(boardId))),
    set: (boardId, prefs) => {
      const clean = sanitizeBoardPrefs(prefs);
      writeJson(storage, boardPrefsKey(boardId), clean, !clean.sort && !clean.tagGroups);
    },
  };
}

function readJson(storage: KeyValueStorage | null, key: string): unknown {
  if (!storage) return null;
  try {
    const text = storage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: KeyValueStorage | null, key: string, value: unknown, empty: boolean): void {
  if (!storage) return;
  try {
    if (empty) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: the view just does not persist */
  }
}

export function createSavedViewsStore(storage: KeyValueStorage | null): SavedViewsStore {
  return {
    list: (boardId) => sanitizeSavedViews(readJson(storage, savedViewsKey(boardId))),
    save: (boardId, views) => writeJson(storage, savedViewsKey(boardId), views, views.length === 0),
  };
}

export function createListViewConfigStore(storage: KeyValueStorage | null): ListViewConfigStore {
  const getAll = (boardId: string): Record<string, ListViewConfig> => {
    const raw = readJson(storage, listViewsKey(boardId));
    const out: Record<string, ListViewConfig> = {};
    if (raw && typeof raw === 'object') {
      for (const [listId, cfg] of Object.entries(raw as Record<string, unknown>)) {
        const clean = sanitizeListViewConfig(cfg);
        if (!isListViewConfigEmpty(clean)) out[listId] = clean;
      }
    }
    return out;
  };
  return {
    getAll,
    set: (boardId, listId, config) => {
      const all = getAll(boardId);
      const clean = sanitizeListViewConfig(config);
      if (isListViewConfigEmpty(clean)) delete all[listId];
      else all[listId] = clean;
      writeJson(storage, listViewsKey(boardId), all, Object.keys(all).length === 0);
    },
  };
}

/** `window.localStorage` when available (it can throw in private windows or be blocked), else `null`. */
export function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export const savedViewsStore: SavedViewsStore = {
  list: (boardId) => createSavedViewsStore(browserStorage()).list(boardId),
  save: (boardId, views) => createSavedViewsStore(browserStorage()).save(boardId, views),
};

export const boardPrefsStore: BoardPrefsStore = {
  get: (boardId) => createBoardPrefsStore(browserStorage()).get(boardId),
  set: (boardId, prefs) => createBoardPrefsStore(browserStorage()).set(boardId, prefs),
};

export const listViewConfigStore: ListViewConfigStore = {
  getAll: (boardId) => createListViewConfigStore(browserStorage()).getAll(boardId),
  set: (boardId, listId, config) => createListViewConfigStore(browserStorage()).set(boardId, listId, config),
};
