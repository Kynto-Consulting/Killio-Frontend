"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "@/lib/tenant/types";
import { parseTenantConfigBody } from "@/lib/tenant/merge";
import { applyTenantThemeToDocument, buildTenantSnapshot, forgetTenantSnapshot, writeTenantSnapshot } from "@/lib/tenant/persist";

const TenantContext = createContext<PublicTenantConfig>(DEFAULT_TENANT_CONFIG);

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The real configuration, read by the browser itself after the server had to give up on it. Null when unreachable. */
async function fetchLiveTenantConfig(): Promise<PublicTenantConfig | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API}/tenant/config`, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const config = parseTenantConfigBody(await res.json());
        if (config) return config;
      }
    } catch {
      /* try again */
    }
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  return null;
}

/**
 * `degraded` means the server could not read the tenant configuration in time and rendered the public look. The
 * browser then repaints the last good tenant look before paint (inline script in layout.tsx), asks the backend for the
 * real configuration, and swaps it in. A good render is saved so the next degraded one has something to restore.
 */
export function TenantProvider({ value, degraded = false, children }: { value: PublicTenantConfig; degraded?: boolean; children: React.ReactNode }) {
  const [live, setLive] = useState(value);

  useEffect(() => {
    setLive(value);
  }, [value]);

  useEffect(() => {
    const host = window.location.host;
    const storage = safeStorage();
    if (!degraded) {
      if (value.mode === "tenant") {
        const snapshot = buildTenantSnapshot(value, host);
        if (snapshot) writeTenantSnapshot(storage, snapshot);
      } else {
        // A deployment that really is public must not keep a customer look from an earlier life of this host.
        forgetTenantSnapshot(storage);
      }
      return;
    }
    let cancelled = false;
    void fetchLiveTenantConfig().then((config) => {
      if (cancelled || !config) return;
      setLive(config);
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (config.mode === "tenant") {
        applyTenantThemeToDocument(config, document, systemDark);
        const snapshot = buildTenantSnapshot(config, host);
        if (snapshot) writeTenantSnapshot(storage, snapshot);
      } else {
        document.getElementById("tenant-theme")?.remove();
        document.documentElement.classList.add("dark");
        forgetTenantSnapshot(storage);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value, degraded]);

  return <TenantContext.Provider value={live}>{children}</TenantContext.Provider>;
}

/** The deployment's white-label config. Outside the provider it is the public Killio. */
export function useTenant(): PublicTenantConfig {
  return useContext(TenantContext);
}

/** "Killio" on killio.dev, the customer's brand name in tenant mode. */
export function useBrandName(): string {
  const tenant = useTenant();
  return tenant.mode === "tenant" ? tenant.brand.name : "Killio";
}
