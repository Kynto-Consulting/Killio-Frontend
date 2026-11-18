import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "./types.ts";

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

/** How long a copy counts as fresh. After that it is still served, and refreshed in the background. */
export const TENANT_FRESH_MS = 60_000;
/** The very first read has nothing to fall back on, so it must not hold the page for long. */
const FIRST_LOAD_TIMEOUT_MS = 2_500;
const REFRESH_TIMEOUT_MS = 8_000;

let cached: { config: PublicTenantConfig; at: number } | null = null;
let inflight: Promise<PublicTenantConfig | null> | null = null;

export function resetTenantCacheForTests(): void {
  cached = null;
  inflight = null;
}

function merge(data: Partial<PublicTenantConfig>): PublicTenantConfig {
  return {
    ...DEFAULT_TENANT_CONFIG,
    ...data,
    brand: { ...DEFAULT_TENANT_CONFIG.brand, ...data.brand },
    theme: { ...DEFAULT_TENANT_CONFIG.theme, ...data.theme },
    landing: { ...DEFAULT_TENANT_CONFIG.landing, ...data.landing },
    auth: { ...DEFAULT_TENANT_CONFIG.auth, ...data.auth },
    billing: { ...DEFAULT_TENANT_CONFIG.billing, ...data.billing },
    poweredBy: { ...DEFAULT_TENANT_CONFIG.poweredBy, ...data.poweredBy },
    features: { ...DEFAULT_TENANT_CONFIG.features, ...data.features },
    integrations: { ...DEFAULT_TENANT_CONFIG.integrations, ...data.integrations },
    permissions: { ...DEFAULT_TENANT_CONFIG.permissions, ...data.permissions },
  } as PublicTenantConfig;
}

async function fetchConfig(timeoutMs: number): Promise<PublicTenantConfig | null> {
  try {
    const res = await fetch(`${API}/tenant/config`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(timeoutMs),
    } as RequestInit);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<PublicTenantConfig>;
    if (!data || (data.mode !== "public" && data.mode !== "tenant")) return null;
    return merge(data);
  } catch {
    return null;
  }
}

/** One request at a time: concurrent renders share it instead of each hitting the backend. */
function refresh(timeoutMs: number): Promise<PublicTenantConfig | null> {
  if (!inflight) {
    inflight = fetchConfig(timeoutMs)
      .then((config) => {
        if (config) cached = { config, at: Date.now() };
        return config;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * The tenant configuration, stale-while-revalidate: once a copy exists it is returned immediately and a
 * slow or failing backend never delays or changes the look of a page (a customer deployment must not
 * flip to Killio's own colours because of one slow request). Only the very first read waits, briefly.
 */
export async function getTenantConfig(): Promise<PublicTenantConfig> {
  if (cached) {
    if (Date.now() - cached.at > TENANT_FRESH_MS) void refresh(REFRESH_TIMEOUT_MS);
    return cached.config;
  }
  return (await refresh(FIRST_LOAD_TIMEOUT_MS)) ?? DEFAULT_TENANT_CONFIG;
}
