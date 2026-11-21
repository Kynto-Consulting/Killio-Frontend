"use client";

import { useEffect, useMemo, useState } from "react";

import { getMyResourcePermissions, type ResourceKind } from "@/lib/api/roles";

export interface ResourcePermissionsState {
  /** `can("resource.edit")`. */
  can: (permission: string) => boolean;
  permissions: string[];
  /** True when the server answered; false = endpoint missing/failed, callers keep their previous logic. */
  resolved: boolean;
  isLoading: boolean;
}

/**
 * The caller's effective permissions on one board / document / mesh
 * (`GET /resources/:type/:id/my-permissions`). Never throws: on failure `resolved` stays false so the
 * caller falls back to what it did before (it must not open more).
 */
export function useResourcePermissions(kind: ResourceKind, id: string | null | undefined, accessToken: string | null | undefined, refreshKey = 0): ResourcePermissionsState {
  const [state, setState] = useState<{ key: string; perms: string[] | null; loading: boolean }>({ key: "", perms: null, loading: false });
  const key = `${kind}:${id ?? ""}:${refreshKey}`;

  useEffect(() => {
    if (!id || !accessToken) {
      setState({ key, perms: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ key, perms: s.key === key ? s.perms : null, loading: true }));
    getMyResourcePermissions(kind, id, accessToken)
      .then((perms) => !cancelled && setState({ key, perms, loading: false }))
      .catch(() => !cancelled && setState({ key, perms: null, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [kind, id, accessToken, key]);

  return useMemo<ResourcePermissionsState>(() => {
    const perms = state.key === key ? state.perms : null;
    const set = new Set(perms ?? []);
    return {
      can: (p) => set.has(p),
      permissions: perms ?? [],
      resolved: perms !== null,
      isLoading: state.key !== key || state.loading,
    };
  }, [state, key]);
}
