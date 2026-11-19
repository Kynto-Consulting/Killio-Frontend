import { parseTenantConfigBody } from "./merge.ts";
import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "./types.ts";

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

/** How long a copy counts as fresh. After that it is still served, and refreshed in the background. */
export const TENANT_FRESH_MS = 60_000;
/** The very first read has nothing to fall back on, so the page waits for it only this long. */
let firstLoadWaitMs = 2_500;
/** The request itself is NOT cut at that point: it keeps going so the next render finds the real copy. */
const FETCH_TIMEOUT_MS = 8_000;

export function setFirstLoadWaitForTests(ms: number): void {
  firstLoadWaitMs = ms;
}

let cached: { config: PublicTenantConfig; at: number } | null = null;
let inflight: Promise<PublicTenantConfig | null> | null = null;

export function resetTenantCacheForTests(): void {
  cached = null;
  inflight = null;
  firstLoadWaitMs = 2_500;
}

async function fetchConfig(): Promise<PublicTenantConfig | null> {
  try {
    const res = await fetch(`${API}/tenant/config`, {
      next: { revalidate: 60, tags: ["tenant-config"] },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    } as RequestInit);
    if (!res.ok) return null;
    return parseTenantConfigBody(await res.json());
  } catch {
    return null;
  }
}

/** One request at a time: concurrent renders share it instead of each hitting the backend. */
function refresh(): Promise<PublicTenantConfig | null> {
  if (!inflight) {
    inflight = fetchConfig()
      .then((config) => {
        // Only a real answer is kept. A failure leaves the previous good copy (if any) untouched.
        if (config) cached = { config, at: Date.now() };
        return config;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The public look, explicitly marked: callers must not treat it as the tenant's own configuration. */
function degradedConfig(): PublicTenantConfig {
  return { ...DEFAULT_TENANT_CONFIG, degraded: true };
}

/**
 * The tenant configuration, stale-while-revalidate: once a copy exists it is returned immediately and a
 * slow or failing backend never delays or changes the look of a page (a customer deployment must not
 * flip to Killio's own colours because of one slow request). Only the very first read waits, briefly; if the
 * backend is slower than that the page gets the public look marked `degraded: true` (the browser then restores
 * the last good tenant look and fetches the real one) while the request carries on and fills the cache.
 */
export async function getTenantConfig(): Promise<PublicTenantConfig> {
  if (cached) {
    if (Date.now() - cached.at > TENANT_FRESH_MS) void refresh();
    return cached.config;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), firstLoadWaitMs);
  });
  try {
    return (await Promise.race([refresh(), wait])) ?? degradedConfig();
  } finally {
    clearTimeout(timer);
  }
}
