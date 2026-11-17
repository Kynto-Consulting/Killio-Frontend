import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "./types";

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

// The last configuration that was read successfully. A customer deployment must not flip to
// Killio's own look because of one slow or failed request.
let lastGood: PublicTenantConfig | null = null;

/**
 * Reads the tenant configuration from the backend (server side, cached for a
 * minute). If the backend can't be reached it keeps the last good configuration,
 * and only falls back to the public Killio look when it has never succeeded.
 */
export async function getTenantConfig(): Promise<PublicTenantConfig> {
  const fallback = lastGood ?? DEFAULT_TENANT_CONFIG;
  try {
    const res = await fetch(`${API}/tenant/config`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as Partial<PublicTenantConfig>;
    if (!data || (data.mode !== "public" && data.mode !== "tenant")) return fallback;
    const merged = {
      ...DEFAULT_TENANT_CONFIG,
      ...data,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, ...data.brand },
      theme: { ...DEFAULT_TENANT_CONFIG.theme, ...data.theme },
      landing: { ...DEFAULT_TENANT_CONFIG.landing, ...data.landing },
      auth: { ...DEFAULT_TENANT_CONFIG.auth, ...data.auth },
      billing: { ...DEFAULT_TENANT_CONFIG.billing, ...data.billing },
      poweredBy: { ...DEFAULT_TENANT_CONFIG.poweredBy, ...data.poweredBy },
      features: { ...DEFAULT_TENANT_CONFIG.features, ...data.features },
      permissions: { ...DEFAULT_TENANT_CONFIG.permissions, ...data.permissions },
    } as PublicTenantConfig;
    lastGood = merged;
    return merged;
  } catch {
    return fallback;
  }
}
