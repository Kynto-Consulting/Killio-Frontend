"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ListViewConfig } from "@/lib/boards/categories";
import type { SortRule, TagGroup } from "@/lib/boards/sorting";
import {
  boardPrefsStore,
  listViewConfigStore,
  savedViewsStore,
  type BoardPrefsStore,
  type ListViewConfigStore,
  type SavedView,
  type SavedViewsStore,
} from "@/lib/boards/view-storage";

export interface BoardViewStores {
  savedViews: SavedViewsStore;
  listConfigs: ListViewConfigStore;
  prefs: BoardPrefsStore;
}

const defaultStores: BoardViewStores = { savedViews: savedViewsStore, listConfigs: listViewConfigStore, prefs: boardPrefsStore };

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`);

/**
 * Everything a board remembers about HOW it is shown (not its data): the filter expression (session only), saved views,
 * per-list configs (filter, categories, sort), the board sort and the tag groups. Persistence goes through the store
 * interfaces of `lib/boards/view-storage` (localStorage today; a server store can be passed in `stores`).
 * Reads happen in an effect so server rendering and hydration stay identical.
 */
export function useBoardView(boardId: string | null | undefined, stores: BoardViewStores = defaultStores) {
  const [expression, setExpression] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [listConfigs, setListConfigs] = useState<Record<string, ListViewConfig>>({});
  const [boardSort, setBoardSortState] = useState<SortRule[]>([]);
  const [tagGroups, setTagGroupsState] = useState<TagGroup[]>([]);
  const loadedFor = useRef<string | null>(null);
  const storesRef = useRef(stores);
  storesRef.current = stores;

  useEffect(() => {
    if (!boardId) return;
    const s = storesRef.current;
    setSavedViews(s.savedViews.list(boardId));
    setListConfigs(s.listConfigs.getAll(boardId));
    const prefs = s.prefs.get(boardId);
    setBoardSortState(prefs.sort ?? []);
    setTagGroupsState(prefs.tagGroups ?? []);
    setExpression("");
    loadedFor.current = boardId;
  }, [boardId]);

  const persistSaved = useCallback((views: SavedView[]) => {
    if (boardId && loadedFor.current === boardId) storesRef.current.savedViews.save(boardId, views);
  }, [boardId]);

  const saveView = useCallback((name: string, expr: string) => {
    const clean = name.trim();
    if (!clean) return;
    setSavedViews((prev) => {
      const next = [...prev, { id: newId(), name: clean, expression: expr }];
      persistSaved(next);
      return next;
    });
  }, [persistSaved]);

  const renameView = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setSavedViews((prev) => {
      const next = prev.map((v) => (v.id === id ? { ...v, name: clean } : v));
      persistSaved(next);
      return next;
    });
  }, [persistSaved]);

  const deleteView = useCallback((id: string) => {
    setSavedViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      persistSaved(next);
      return next;
    });
  }, [persistSaved]);

  const setListConfig = useCallback((listId: string, config: ListViewConfig) => {
    setListConfigs((prev) => ({ ...prev, [listId]: config }));
    if (boardId && loadedFor.current === boardId) storesRef.current.listConfigs.set(boardId, listId, config);
  }, [boardId]);

  const persistPrefs = useCallback((next: { sort: SortRule[]; tagGroups: TagGroup[] }) => {
    if (boardId && loadedFor.current === boardId) storesRef.current.prefs.set(boardId, next);
  }, [boardId]);

  const setBoardSort = useCallback((sort: SortRule[]) => {
    setBoardSortState(sort);
    persistPrefs({ sort, tagGroups });
  }, [persistPrefs, tagGroups]);

  const setTagGroups = useCallback((groups: TagGroup[]) => {
    setTagGroupsState(groups);
    persistPrefs({ sort: boardSort, tagGroups: groups });
  }, [persistPrefs, boardSort]);

  const listFilters = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const [id, cfg] of Object.entries(listConfigs)) out[id] = cfg.filter;
    return out;
  }, [listConfigs]);

  return { expression, setExpression, savedViews, saveView, renameView, deleteView, listConfigs, listFilters, setListConfig, boardSort, setBoardSort, tagGroups, setTagGroups };
}
