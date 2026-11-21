/**
 * Named view tabs of a board ("Kanban", "Gantt", "Lista", plus the ones the user adds) and their persistence.
 *
 * Saved shape (per board): `{ views: [{ id, type: 'kanban' | 'gantt' | 'list', name, config }] }`.
 * - `kanban` and `gantt` (ids `kanban` / `gantt`) are built in: always present, first, never deleted or renamed.
 * - `name: ''` means "the translated default name of the type" so built-ins follow the interface language.
 * - Settings without `views` (every board saved before this existed) load as the default tabs.
 * Pure (no React, no path aliases) so it runs under `node --test`.
 */
import type { KeyValueStorage } from './view-storage.ts';

/** `calendar` is experimental: it is never part of the default tabs, only added by hand from the "+" menu. */
export type BoardTabType = 'kanban' | 'gantt' | 'list' | 'calendar' | 'summary' | 'projects';

/** Types the "+" menu offers. Extra Kanban / Gantt tabs would show the same thing as the built-in ones, so they are not offered. */
export const ADDABLE_TAB_TYPES: readonly BoardTabType[] = ['list', 'summary', 'projects', 'calendar'];
/** Types still in development: the menu marks them. */
export const EXPERIMENTAL_TAB_TYPES: readonly BoardTabType[] = ['calendar'];

export interface ListTabConfig {
  /** Column ids switched off in the "Columns" menu (`state`, `assignees`, `due`, `comments`, `tagGroup:<id>`). */
  hiddenColumns?: string[];
  /** Group rows by state (the card's list). Default on. */
  groupByState?: boolean;
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
}

/**
 * Config of the `summary` and `projects` tabs: the NAME of the tag group each level is grouped by. Absent = the default name
 * match (Área / Proyecto / Fase). The server validates exactly these keys (strings of 1-60 characters).
 */
export interface GroupingTabConfig {
  areaGroup?: string;
  projectGroup?: string;
  phaseGroup?: string;
}

export const GROUPING_TAB_TYPES: readonly BoardTabType[] = ['summary', 'projects'];
export const GROUP_NAME_KEYS = ['areaGroup', 'projectGroup', 'phaseGroup'] as const;
export const MAX_GROUP_NAME = 60;

export interface BoardTab {
  id: string;
  type: BoardTabType;
  /** Empty = the translated default name of the type. */
  name: string;
  config?: ListTabConfig & GroupingTabConfig;
}

export type BoardTabAction =
  | { type: 'add'; id: string; tabType: BoardTabType; name: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'remove'; id: string }
  | { type: 'config'; id: string; patch: Partial<ListTabConfig> | Partial<Record<keyof GroupingTabConfig, string | null>> };

export const BUILTIN_TAB_IDS = ['kanban', 'gantt'] as const;
export const MAX_TABS = 20;
export const MAX_TAB_NAME = 40;
const TYPES: readonly BoardTabType[] = ['kanban', 'gantt', 'list', 'calendar', 'summary', 'projects'];

export const isBuiltinTab = (tab: Pick<BoardTab, 'id'>) => (BUILTIN_TAB_IDS as readonly string[]).includes(tab.id);

const builtin = (type: 'kanban' | 'gantt'): BoardTab => ({ id: type, type, name: '' });

/** What a board with nothing saved shows: both built-ins and a ready-to-use list view (deletable). */
export function defaultTabs(): BoardTab[] {
  return [builtin('kanban'), builtin('gantt'), { id: 'list', type: 'list', name: '' }];
}

export const cleanTabName = (name: unknown): string => (typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_TAB_NAME) : '');

export function sanitizeListTabConfig(raw: unknown): ListTabConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cfg: ListTabConfig = {};
  if (Array.isArray(o.hiddenColumns)) {
    const hidden = [...new Set(o.hiddenColumns.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 100))].slice(0, 100);
    if (hidden.length) cfg.hiddenColumns = hidden;
  }
  if (o.groupByState === false) cfg.groupByState = false;
  const s = o.sort as Record<string, unknown> | null | undefined;
  if (s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.key.length < 100) cfg.sort = { key: s.key, dir: s.dir === 'desc' ? 'desc' : 'asc' };
  return cfg;
}

/** Only the three group names, trimmed, 1-60 characters; anything else is dropped. */
export function sanitizeGroupingConfig(raw: unknown): GroupingTabConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cfg: GroupingTabConfig = {};
  for (const key of GROUP_NAME_KEYS) {
    const v = o[key];
    if (typeof v !== 'string') continue;
    const name = v.replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME);
    if (name) cfg[key] = name;
  }
  return cfg;
}

const isEmptyConfig = (c: ListTabConfig) => !c.hiddenColumns && c.groupByState !== false && !c.sort;

/**
 * Anything stored (or nothing) -> a valid tab list: built-ins first and unique, extras sanitized, ids unique, capped.
 * `undefined`, `{}` and malformed values (settings from before views existed) give the default tabs.
 */
export function normalizeTabs(raw: unknown): BoardTab[] {
  const source = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? (raw as { views?: unknown }).views : undefined;
  if (!Array.isArray(source)) return defaultTabs();
  const extras: BoardTab[] = [];
  const seen = new Set<string>(BUILTIN_TAB_IDS);
  for (const r of source) {
    const o = r as Record<string, unknown> | null;
    const id = typeof o?.id === 'string' ? o.id.trim().slice(0, 64) : '';
    const type = o?.type as BoardTabType;
    if (!id || seen.has(id) || !TYPES.includes(type)) continue;
    seen.add(id);
    const tab: BoardTab = { id, type, name: cleanTabName(o?.name) };
    if (type === 'list') {
      const config = sanitizeListTabConfig(o?.config);
      if (!isEmptyConfig(config)) tab.config = config;
    } else if (GROUPING_TAB_TYPES.includes(type)) {
      const config = sanitizeGroupingConfig(o?.config);
      if (Object.keys(config).length) tab.config = config;
    }
    extras.push(tab);
  }
  return [builtin('kanban'), builtin('gantt'), ...extras].slice(0, MAX_TABS);
}

/** Name shown for a tab: its own, or the translated default of its type. */
export const tabDisplayName = (tab: BoardTab, labels: Record<BoardTabType, string>) => tab.name || labels[tab.type];

/** `base`, `base 2`, `base 3`... so no two tabs show the same name (case-insensitive). */
export function uniqueTabName(base: string, tabs: BoardTab[], labels: Record<BoardTabType, string>, exceptId?: string): string {
  const taken = new Set(tabs.filter((t) => t.id !== exceptId).map((t) => tabDisplayName(t, labels).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function boardTabsReducer(tabs: BoardTab[], action: BoardTabAction): BoardTab[] {
  switch (action.type) {
    case 'add': {
      if (tabs.length >= MAX_TABS || tabs.some((t) => t.id === action.id) || !TYPES.includes(action.tabType)) return tabs;
      return [...tabs, { id: action.id, type: action.tabType, name: cleanTabName(action.name) }];
    }
    case 'rename': {
      const name = cleanTabName(action.name);
      const tab = tabs.find((t) => t.id === action.id);
      if (!tab || isBuiltinTab(tab) || !name || name === tab.name) return tabs;
      return tabs.map((t) => (t.id === action.id ? { ...t, name } : t));
    }
    case 'remove': {
      const tab = tabs.find((t) => t.id === action.id);
      if (!tab || isBuiltinTab(tab)) return tabs;
      return tabs.filter((t) => t.id !== action.id);
    }
    case 'config': {
      const tab = tabs.find((t) => t.id === action.id);
      if (tab && GROUPING_TAB_TYPES.includes(tab.type)) {
        const merged = sanitizeGroupingConfig({ ...tab.config, ...action.patch });
        return tabs.map((t) => {
          if (t.id !== action.id) return t;
          const { config: _old, ...rest } = t;
          return Object.keys(merged).length ? { ...rest, config: merged } : rest;
        });
      }
      if (!tab || tab.type !== 'list') return tabs;
      const merged = sanitizeListTabConfig({ ...tab.config, ...(action.patch as Partial<ListTabConfig>) });
      return tabs.map((t) => {
        if (t.id !== action.id) return t;
        const { config: _old, ...rest } = t;
        return isEmptyConfig(merged) ? rest : { ...rest, config: merged };
      });
    }
    default:
      return tabs;
  }
}

/** The tab to show: the wanted id if it still exists, else Kanban. */
export const resolveActiveTab = (tabs: BoardTab[], wantedId: string | null | undefined): BoardTab => tabs.find((t) => t.id === wantedId) ?? tabs[0];

export const boardTabsKey = (boardId: string) => `killio:board-tabs:${boardId}`;
export const activeTabKey = (boardId: string) => `killio:board-active-tab:${boardId}`;

export interface BoardTabsStore {
  load(boardId: string): { tabs: BoardTab[]; activeId: string | null };
  saveTabs(boardId: string, tabs: BoardTab[]): void;
  saveActive(boardId: string, id: string): void;
}

/**
 * Browser-local store (the fallback the board view settings already use). The server settings have no table for tabs yet;
 * keeping this behind an interface lets a server store replace it without touching the page.
 */
export function createBoardTabsStore(storage: KeyValueStorage | null): BoardTabsStore {
  const read = (key: string): string | null => {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string) => {
    if (!storage) return;
    try {
      storage.setItem(key, value);
    } catch {
      /* private mode / quota: the tabs just do not persist */
    }
  };
  return {
    load: (boardId) => {
      let parsed: unknown;
      try {
        const text = read(boardTabsKey(boardId));
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = undefined;
      }
      return { tabs: normalizeTabs(parsed), activeId: read(activeTabKey(boardId)) };
    },
    saveTabs: (boardId, tabs) => write(boardTabsKey(boardId), JSON.stringify({ views: normalizeTabs(tabs) })),
    saveActive: (boardId, id) => write(activeTabKey(boardId), id),
  };
}
