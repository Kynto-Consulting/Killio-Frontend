import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "./types.ts";

/** The backend sends only what differs from the public look; every missing group falls back to the default. */
export function mergeTenantConfig(data: Partial<PublicTenantConfig>): PublicTenantConfig {
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

/** Only a body that names a mode is a tenant config; anything else (an error page, a proxy answer) is not. */
export function parseTenantConfigBody(data: unknown): PublicTenantConfig | null {
  const d = data as Partial<PublicTenantConfig> | null;
  if (!d || (d.mode !== "public" && d.mode !== "tenant")) return null;
  return mergeTenantConfig(d);
}
