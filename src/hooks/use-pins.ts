"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useSession } from "@/components/providers/session-provider";
import { listPins, pinEntity, unpinEntity, type Pin, type PinType } from "@/lib/api/pins";
import { applyPin, isPinned } from "@/lib/pins/resolve";
import { toast } from "@/lib/toast";

/**
 * The current user's pins of a workspace ("Fijados"). One shared store per workspace, so the Pin buttons and the
 * Fijados section of the same page stay in step without prop drilling. Pinning is optimistic and rolls back on error.
 */
const stores = new Map<string, { pins: Pin[]; loaded: boolean; loading: boolean }>();
const listeners = new Set<() => void>();
const EMPTY: Pin[] = [];

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const get = (teamId: string) => {
  let s = stores.get(teamId);
  if (!s) {
    s = { pins: EMPTY, loaded: false, loading: false };
    stores.set(teamId, s);
  }
  return s;
};
const set = (teamId: string, pins: Pin[], loaded = true) => {
  const s = get(teamId);
  stores.set(teamId, { ...s, pins, loaded, loading: false });
  emit();
};

export function usePins(teamId: string | null | undefined) {
  const { accessToken } = useSession();
  const pins = useSyncExternalStore(
    subscribe,
    () => (teamId ? get(teamId).pins : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (!teamId || !accessToken) return;
    const s = get(teamId);
    if (s.loaded || s.loading) return;
    stores.set(teamId, { ...s, loading: true });
    listPins(teamId, accessToken)
      .then((rows) => set(teamId, Array.isArray(rows) ? rows : []))
      .catch(() => set(teamId, get(teamId).pins, true));
  }, [teamId, accessToken]);

  const toggle = useCallback(
    async (kind: PinType, id: string) => {
      if (!teamId || !accessToken) return;
      const before = get(teamId).pins;
      const willPin = !isPinned(before, kind, id);
      set(teamId, applyPin(before, kind, id, willPin) as Pin[]);
      try {
        const rows = willPin ? await pinEntity(teamId, kind, id, accessToken) : await unpinEntity(teamId, kind, id, accessToken);
        set(teamId, Array.isArray(rows) ? rows : get(teamId).pins);
      } catch {
        set(teamId, before);
        toast("No se pudo actualizar Fijados", "error");
      }
    },
    [teamId, accessToken],
  );

  return { pins, isPinned: (kind: PinType, id: string) => isPinned(pins, kind, id), toggle, enabled: !!teamId && !!accessToken };
}
