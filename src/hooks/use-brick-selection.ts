"use client";

// Multi-select state for bricks/cards/nodes, shared by all engines. Ctrl/Cmd-click
// toggles membership; Esc / empty-click clears. When something is selected the
// engine's global "+" affordance flips to a "copy / bulk-actions" control.

import { useCallback, useEffect, useState } from "react";

export type BrickSelection = {
  ids: string[];
  isActive: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  add: (id: string) => void;
  set: (ids: string[]) => void;
  clear: () => void;
  /** True if the event should toggle selection (Ctrl/Cmd held). */
};

export function useBrickSelection(): BrickSelection {
  const [ids, setIds] = useState<string[]>([]);

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])), []);
  const add = useCallback((id: string) => setIds((cur) => (cur.includes(id) ? cur : [...cur, id])), []);
  const set = useCallback((next: string[]) => setIds(next), []);
  const clear = useCallback(() => setIds([]), []);

  // Esc clears the selection.
  useEffect(() => {
    if (ids.length === 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIds([]); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids.length]);

  return { ids, isActive: ids.length > 0, has, toggle, add, set, clear };
}

/** True when a click should engage multi-select (Ctrl on win/linux, Cmd on mac). */
export function isMultiSelectClick(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.ctrlKey || e.metaKey;
}
