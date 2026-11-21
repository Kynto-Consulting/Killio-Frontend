"use client";

import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { getPermissionCatalog } from "@/lib/api/roles";
import { approximateCatalog, type PermissionCatalog } from "@/lib/roles/catalog";

const TTL_MS = 5 * 60_000;
const FAIL_RETRY_MS = 30_000;
const cache = new Map<string, { catalog: PermissionCatalog | null; at: number }>();
const inflight = new Map<string, Promise<PermissionCatalog | null>>();
const listeners = new Set<() => void>();

/** Forces a reload (after installing or removing an integration or extension). */
export function invalidatePermissionCatalog(): void {
  cache.clear();
  listeners.forEach((l) => l());
}

/**
 * The permission catalogue of a workspace (grouped by provider). Never blocks: while loading, and when the endpoint
 * fails or does not exist yet, it returns the minimal local catalogue with `isApprox` true so the UI can say so.
 */
export function usePermissionCatalog(teamId: string | null | undefined): { catalog: PermissionCatalog; isApprox: boolean; isLoading: boolean } {
  const { accessToken } = useSession();
  const { locale } = useI18n();
  const key = `${teamId ?? ""}:${locale}`;
  const [, bump] = useState(0);
  const [loading, setLoading] = useState(false);
  const fallback = useMemo(() => approximateCatalog(), []);

  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < (hit.catalog ? TTL_MS : FAIL_RETRY_MS);

  useEffect(() => {
    if (!teamId || !accessToken || fresh) return;
    let cancelled = false;
    let request = inflight.get(key);
    if (!request) {
      request = getPermissionCatalog(teamId, accessToken, locale)
        .catch(() => null)
        .then((catalog) => {
          cache.set(key, { catalog, at: Date.now() });
          return catalog;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, request);
    }
    setLoading(true);
    request.then(() => {
      if (cancelled) return;
      setLoading(false);
      bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, accessToken, key, locale, fresh]);

  const catalog = hit?.catalog ?? fallback;
  return { catalog, isApprox: catalog.source === "approx", isLoading: loading && !hit };
}
