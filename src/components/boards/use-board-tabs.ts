"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSession } from "@/components/providers/session-provider";
import { getBoardViewSettings, updateBoardViewSettings } from "@/lib/api/view-settings";
import { boardTabsReducer, createBoardTabsStore, defaultTabs, resolveActiveTab, type BoardTab, type BoardTabAction } from "@/lib/boards/board-tabs";
import { createBoardTabsSync, type BoardTabsSync } from "@/lib/boards/board-tabs-sync";
import { browserStorage } from "@/lib/boards/view-storage";

/**
 * The named view tabs of a board and the one being shown.
 * - The tabs are SHARED: they live in the board's server view settings (`views`), with this browser's copy as the offline
 *   cache and as the only store when there is no session or the board is a local file (`serverSync: false`).
 * - Which tab is open is a per-browser choice (localStorage).
 * Storage is read in an effect so server rendering and hydration render the same default tabs.
 */
export function useBoardTabs(boardId: string | null | undefined, opts: { serverSync?: boolean } = {}) {
  const { accessToken } = useSession();
  const tokenRef = useRef<string | null>(accessToken ?? null);
  tokenRef.current = accessToken ?? null;
  const useServer = (opts.serverSync ?? true) && !!accessToken;

  const [tabs, setTabs] = useState<BoardTab[]>(defaultTabs);
  const [activeId, setActiveId] = useState<string>("kanban");
  const syncRef = useRef<BoardTabsSync | null>(null);
  const pickedRef = useRef(false);

  useEffect(() => {
    if (!boardId) return;
    const storage = browserStorage();
    pickedRef.current = false;
    const wanted = createBoardTabsStore(storage).load(boardId).activeId;
    const sync = createBoardTabsSync({
      boardId,
      storage,
      api: useServer
        ? {
            getViews: async (id) => (await getBoardViewSettings(id, tokenRef.current ?? "")).views ?? null,
            putViews: (id, views) => updateBoardViewSettings(id, { views }, tokenRef.current ?? ""),
          }
        : null,
      onChange: (next) => {
        setTabs(next);
        setActiveId((cur) => resolveActiveTab(next, pickedRef.current ? cur : (wanted ?? cur)).id);
      },
    });
    syncRef.current = sync;
    const onHide = () => {
      if (document.visibilityState === "hidden") void sync.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide as () => void);
    void sync.load();
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide as () => void);
      void sync.flush();
      sync.dispose();
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [boardId, useServer]);

  const dispatch = useCallback((action: BoardTabAction) => {
    const sync = syncRef.current;
    if (!sync) return;
    const next = boardTabsReducer(sync.getTabs(), action);
    if (next === sync.getTabs()) return;
    sync.setTabs(next);
    if (action.type === "remove") setActiveId((cur) => resolveActiveTab(next, cur).id);
  }, []);

  const select = useCallback(
    (id: string) => {
      pickedRef.current = true;
      setActiveId(id);
      if (boardId) createBoardTabsStore(browserStorage()).saveActive(boardId, id);
    },
    [boardId],
  );

  const active = resolveActiveTab(tabs, activeId);
  return { tabs, active, select, dispatch };
}
