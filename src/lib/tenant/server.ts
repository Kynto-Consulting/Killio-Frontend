import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "./types";

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

/**
 * Reads the tenant configuration from the backend (server side, cached for a
 * minute). If the backend is unreachable the app falls back to the public
 * Killio look instead of failing to render.
 */
export async function getTenantConfig(): Promise<PublicTenantConfig> {
  try {
    const res = await fetch(`${API}/tenant/config`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return DEFAULT_TENANT_CONFIG;
    const data = (await res.json()) as Partial<PublicTenantConfig>;
    if (!data || (data.mode !== "public" && data.mode !== "tenant")) return DEFAULT_TENANT_CONFIG;
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
      permissions: { ...DEFAULT_TENANT_CONFIG.permissions, ...data.permissions },
    } as PublicTenantConfig;
  } catch {
    return DEFAULT_TENANT_CONFIG;
  }
}
