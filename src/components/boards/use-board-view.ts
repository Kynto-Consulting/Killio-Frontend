"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { useSession } from "@/components/providers/session-provider";
import { createViewSettingsApi } from "@/lib/api/view-settings";
import type { ListViewConfig } from "@/lib/boards/categories";
import type { SortRule, TagGroup } from "@/lib/boards/sorting";
import { browserStorage, type SavedView } from "@/lib/boards/view-storage";
import { createViewSync, emptySnapshot, readLastExpression, writeLastExpression, type SyncState, type ViewSnapshot, type ViewSyncController } from "@/lib/boards/view-sync";
import { getViewSyncState, publishViewSyncState, retryViewSync, subscribeViewSyncState } from "@/lib/boards/view-sync-status";

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`);

/** `name`, or `name (2)`, `name (3)`... when another view already uses it (names are unique per board, case-insensitive). */
function uniqueViewName(name: string, views: SavedView[], exceptId?: string): string {
  const taken = new Set(views.filter((v) => v.id !== exceptId).map((v) => v.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** The sync state of the open board's view settings ("saved", "saving", "not saved"...), for any component. */
export function useViewSyncState(): SyncState {
  return useSyncExternalStore(subscribeViewSyncState, getViewSyncState, getViewSyncState);
}
export { retryViewSync };

/**
 * Everything a board remembers about HOW it is shown (not its data): the filter expression, saved views, per-list configs
 * (filter, categories, sort), the board sort and the tag groups.
 * - Saved views, list configs and the board sort live on the SERVER (shared by everyone with access to the board); the tag
 *   groups are TEAM-level. Edits are optimistic and pushed after a debounce with retry; `localStorage` is the offline cache
 *   and the store in local workspace mode (see `lib/boards/view-sync`).
 * - The filter expression is only remembered per board and user in localStorage.
 * Reads happen in an effect so server rendering and hydration stay identical.
 */
export function useBoardView(boardId: string | null | undefined) {
  const { accessToken, user } = useSession();
  const hasToken = !!accessToken;
  const userId = user?.id ?? null;
  const tokenRef = useRef<string | null>(accessToken ?? null);
  tokenRef.current = accessToken ?? null;

  const [expression, setExpressionState] = useState("");
  const [snapshot, setSnapshot] = useState<ViewSnapshot>(emptySnapshot);
  const syncState = useViewSyncState();
  const controllerRef = useRef<ViewSyncController | null>(null);

  useEffect(() => {
    if (!boardId) return;
    const storage = browserStorage();
    const controller = createViewSync({
      boardId,
      api: hasToken ? createViewSettingsApi(() => tokenRef.current) : null,
      storage,
      onChange: setSnapshot,
      onState: (state) => publishViewSyncState(state, () => void controller.retry()),
    });
    controllerRef.current = controller;
    setSnapshot(emptySnapshot());
    setExpressionState(readLastExpression(storage, userId, boardId));
    void controller.load();
    const onHide = () => {
      if (document.visibilityState === "hidden") void controller.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide as () => void);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide as () => void);
      void controller.flush();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [boardId, hasToken, userId]);

  const apply = useCallback(() => {
    const c = controllerRef.current;
    if (c) setSnapshot(c.getSnapshot());
  }, []);

  const setExpression = useCallback((value: string) => {
    setExpressionState(value);
    if (boardId) writeLastExpression(browserStorage(), userId, boardId, value);
  }, [boardId, userId]);

  const saveView = useCallback((name: string, expr: string) => {
    const c = controllerRef.current;
    const clean = name.trim();
    if (!c || !clean) return;
    const views = c.getSnapshot().savedViews;
    c.setSavedViews([...views, { id: newId(), name: uniqueViewName(clean, views), expression: expr }]);
    apply();
  }, [apply]);

  const renameView = useCallback((id: string, name: string) => {
    const c = controllerRef.current;
    const clean = name.trim();
    if (!c || !clean) return;
    const views = c.getSnapshot().savedViews;
    c.setSavedViews(views.map((v) => (v.id === id ? { ...v, name: uniqueViewName(clean, views, id) } : v)));
    apply();
  }, [apply]);

  const deleteView = useCallback((id: string) => {
    const c = controllerRef.current;
    if (!c) return;
    c.setSavedViews(c.getSnapshot().savedViews.filter((v) => v.id !== id));
    apply();
  }, [apply]);

  const setListConfig = useCallback((listId: string, config: ListViewConfig) => {
    controllerRef.current?.setListConfig(listId, config);
    apply();
  }, [apply]);

  const setBoardSort = useCallback((sort: SortRule[]) => {
    controllerRef.current?.setBoardSort(sort);
    apply();
  }, [apply]);

  const setTagGroups = useCallback((groups: TagGroup[]) => {
    controllerRef.current?.setTagGroups(groups);
    apply();
  }, [apply]);

  const listFilters = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const [id, cfg] of Object.entries(snapshot.listConfigs)) out[id] = cfg.filter;
    return out;
  }, [snapshot.listConfigs]);

  return {
    expression,
    setExpression,
    savedViews: snapshot.savedViews,
    saveView,
    renameView,
    deleteView,
    listConfigs: snapshot.listConfigs,
    listFilters,
    setListConfig,
    boardSort: snapshot.boardSort,
    setBoardSort,
    tagGroups: snapshot.tagGroups,
    setTagGroups,
    /** "saved" | "saving" | "error" (not saved, retrying) | "readonly" | "local" | "loading". */
    syncState,
  };
}
