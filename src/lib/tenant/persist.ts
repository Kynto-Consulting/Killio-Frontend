import { buildTenantThemeCss } from "./theme.ts";
import type { PublicTenantConfig } from "./types.ts";

/**
 * The last good tenant look, kept in the browser. When the server cannot read the tenant configuration in time it
 * serves the public Killio look (`degraded`); an inline script in <head> then repaints the stored look before the
 * first paint, so a customer never sees Killio's own colours. It is tied to the host it was saved on, so a snapshot
 * from a customer deployment is never applied on killio.dev (or on another customer's host).
 */
export const TENANT_SNAPSHOT_KEY = "killio_tenant_theme_v1";
export const TENANT_SNAPSHOT_VERSION = 1;
/** Above this the snapshot is not stored (a huge custom stylesheet must not eat the storage quota). */
export const TENANT_SNAPSHOT_MAX_CHARS = 120_000;

export type TenantSnapshot = {
  v: typeof TENANT_SNAPSHOT_VERSION;
  host: string;
  hash: string;
  css: string;
  defaultMode: "light" | "dark" | "system";
  brandName: string;
  shortName: string;
  faviconUrl: string | null;
  logoUrl: string | null;
  savedAt: number;
};

/** The few methods used, so tests can pass a plain object. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** FNV-1a, 32 bit: enough to tell "the palette changed" apart, not a security feature. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Null for anything that is not a good tenant copy: the public look, or a degraded fallback. */
export function buildTenantSnapshot(config: PublicTenantConfig, host: string, now = Date.now()): TenantSnapshot | null {
  if (config.mode !== "tenant" || config.degraded || !host) return null;
  const css = buildTenantThemeCss(config);
  if (!css) return null;
  const meta = {
    defaultMode: config.theme.defaultMode,
    brandName: config.brand.name,
    shortName: config.brand.shortName,
    faviconUrl: config.brand.faviconUrl,
    logoUrl: config.brand.logoUrl,
  };
  return {
    v: TENANT_SNAPSHOT_VERSION,
    host,
    hash: hashString(JSON.stringify([css, meta])),
    css,
    ...meta,
    savedAt: now,
  };
}

function isSnapshot(value: unknown): value is TenantSnapshot {
  const s = value as Partial<TenantSnapshot> | null;
  return (
    !!s &&
    typeof s === "object" &&
    s.v === TENANT_SNAPSHOT_VERSION &&
    typeof s.host === "string" &&
    typeof s.hash === "string" &&
    typeof s.css === "string" &&
    (s.defaultMode === "light" || s.defaultMode === "dark" || s.defaultMode === "system") &&
    typeof s.brandName === "string"
  );
}

/** The stored snapshot, or null when there is none, it is corrupt, from another version, or from another host. */
export function readTenantSnapshot(storage: StorageLike | null | undefined, host: string): TenantSnapshot | null {
  if (!storage || !host) return null;
  try {
    const raw = storage.getItem(TENANT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed) || parsed.host !== host) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Saves a snapshot unless the identical one is already there. Returns whether it wrote. Never throws. */
export function writeTenantSnapshot(storage: StorageLike | null | undefined, snapshot: TenantSnapshot): boolean {
  if (!storage) return false;
  try {
    const raw = JSON.stringify(snapshot);
    if (raw.length > TENANT_SNAPSHOT_MAX_CHARS) return false;
    const existing = readTenantSnapshot(storage, snapshot.host);
    if (existing && existing.hash === snapshot.hash) return false;
    storage.setItem(TENANT_SNAPSHOT_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function forgetTenantSnapshot(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(TENANT_SNAPSHOT_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Inline script for <head>, emitted only when the server served a degraded fallback. It runs before the first paint:
 * it re-creates the tenant stylesheet and the dark/light class from the stored snapshot, and only if the snapshot
 * belongs to this very host. Every step is guarded: a failure leaves the public look, never a broken page.
 */
export const TENANT_RESTORE_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(TENANT_SNAPSHOT_KEY)})||"null");if(!s||s.v!==${TENANT_SNAPSHOT_VERSION}||s.host!==location.host||typeof s.css!=="string")return;var d=document,e=d.createElement("style");e.id="tenant-theme";e.setAttribute("data-restored","1");e.textContent=s.css;d.head.appendChild(e);var m=s.defaultMode,dark=m==="light"?false:m==="system"?matchMedia("(prefers-color-scheme: dark)").matches:true;d.documentElement.classList.toggle("dark",dark);if(typeof s.faviconUrl==="string"&&/^(https:\\/\\/|\\/(?!\\/))/.test(s.faviconUrl)){var l=d.createElement("link");l.rel="icon";l.href=s.faviconUrl;d.head.appendChild(l)}}catch(x){}})()`;

/** Re-paints the page from a freshly fetched config (used once the browser has the real one after a degraded render). */
export function applyTenantThemeToDocument(config: PublicTenantConfig, doc: Document, systemDark: boolean): void {
  const css = buildTenantThemeCss(config);
  let style = doc.getElementById("tenant-theme");
  if (!style) {
    style = doc.createElement("style");
    style.id = "tenant-theme";
    doc.head.appendChild(style);
  }
  style.textContent = css;
  style.removeAttribute("data-restored");
  const mode = config.mode === "tenant" ? config.theme.defaultMode : "dark";
  doc.documentElement.classList.toggle("dark", mode === "light" ? false : mode === "system" ? systemDark : true);
}
