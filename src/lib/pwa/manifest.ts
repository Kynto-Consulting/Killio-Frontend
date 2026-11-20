/**
 * Web app manifest of one Killio instance. The tenant's name, colours and logo become the installed
 * app's name, splash/title-bar colour and icon; without a tenant (or without a logo) it is Killio's own.
 * Pure: the route files (`app/manifest.ts`, `app/pwa-icon/[size]/route.tsx`) only do the I/O.
 */
import type { PublicTenantConfig } from "../tenant/types.ts";

export type ManifestIcon = { src: string; sizes: string; type: string; purpose?: "any" | "maskable" | "monochrome" };

export type WebManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  orientation: "any";
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
  categories: string[];
  shortcuts: Array<{ name: string; short_name: string; url: string; icons: ManifestIcon[] }>;
};

export const ICON_VARIANTS = ["192", "512", "maskable-512"] as const;
export type IconVariant = (typeof ICON_VARIANTS)[number];

export function isIconVariant(value: string): value is IconVariant {
  return (ICON_VARIANTS as readonly string[]).includes(value);
}

export function iconVariantSpec(variant: IconVariant): { size: number; maskable: boolean } {
  return variant === "maskable-512" ? { size: 512, maskable: true } : { size: Number(variant), maskable: false };
}

/** "H S% L%" (the format of the tenant palette) -> "#rrggbb". Null when it can not be parsed. */
export function hslTripletToHex(triplet: string | undefined | null): string | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%\s*$/.exec(triplet ?? "");
  if (!m) return null;
  const h = (((Number(m[1]) % 360) + 360) % 360) / 360;
  const s = Math.min(100, Number(m[2])) / 100;
  const l = Math.min(100, Number(m[3])) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => Math.round(hue2rgb(p, q, t) * 255).toString(16).padStart(2, "0");
  return `#${channel(h + 1 / 3)}${channel(h)}${channel(h - 1 / 3)}`;
}

const KILLIO_BACKGROUND = "#020408";
const KILLIO_THEME = "#000000";

/** Splash/title-bar colours of the instance, following the tenant's default colour mode. */
export function manifestColors(tenant: PublicTenantConfig): { background: string; theme: string } {
  if (tenant.mode !== "tenant") return { background: KILLIO_BACKGROUND, theme: KILLIO_THEME };
  const darkFirst = tenant.theme.defaultMode !== "light";
  const palettes = darkFirst ? [tenant.theme.dark, tenant.theme.light] : [tenant.theme.light, tenant.theme.dark];
  for (const palette of palettes) {
    const hex = hslTripletToHex(palette.background);
    if (hex) return { background: hex, theme: hex };
  }
  return { background: darkFirst ? KILLIO_BACKGROUND : "#ffffff", theme: darkFirst ? KILLIO_THEME : "#ffffff" };
}

/** Logo the generated icons are made from: the tenant's own, or null (-> Killio's static icons). */
export function tenantIconSource(tenant: PublicTenantConfig): string | null {
  if (tenant.mode !== "tenant") return null;
  const logo = (tenant.brand.logoUrl ?? tenant.brand.faviconUrl ?? "").trim();
  return logo || null;
}

/** Short stable token, appended to icon URLs so a changed logo is not served from an old cache. */
export function iconVersion(source: string): string {
  let hash = 5381;
  for (let i = 0; i < source.length; i++) hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export function buildManifestIcons(tenant: PublicTenantConfig): ManifestIcon[] {
  const source = tenantIconSource(tenant);
  if (!source) {
    return [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ];
  }
  const v = iconVersion(source);
  return [
    { src: `/pwa-icon/192?v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `/pwa-icon/512?v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `/pwa-icon/maskable-512?v=${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

export function buildWebManifest(tenant: PublicTenantConfig): WebManifest {
  const isTenant = tenant.mode === "tenant";
  const colors = manifestColors(tenant);
  const icons = buildManifestIcons(tenant);
  const shortcutIcons = icons.filter((i) => i.purpose === "any").slice(0, 1);
  const name = isTenant ? tenant.brand.name || "Killio" : "Killio | Restriction-free productivity";
  const shortName = (isTenant ? tenant.brand.shortName || tenant.brand.name : "Killio").slice(0, 12) || "Killio";
  const shortcut = (label: string, short: string, url: string) => ({ name: label, short_name: short, url, icons: shortcutIcons });
  return {
    id: "/",
    name,
    short_name: shortName,
    description: isTenant ? tenant.brand.tagline || tenant.brand.name : "Restriction-free productivity execution platform.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: colors.background,
    theme_color: colors.theme,
    icons,
    categories: ["productivity", "business"],
    shortcuts: [
      shortcut("Documents", "Docs", "/d"),
      shortcut("Meshboards", "Mesh", "/m"),
      shortcut("Boards", "Boards", "/b"),
      shortcut("Rooms", "Rooms", "/rooms"),
    ],
  };
}

/** Relative luminance (0..1) of "#rrggbb"; 0.5 when it can not be parsed. */
export function hexLuma(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/**
 * Background of a generated icon. The tenant's own colour, unless the logo would nearly disappear on it
 * (a dark logo on a dark background, or the reverse): then plain white or near-black, whichever contrasts.
 * `logoLuma` is the average luminance (0..1) of the logo's visible pixels.
 */
export function iconBackground(tenantBackground: string, logoLuma: number): string {
  if (Math.abs(hexLuma(tenantBackground) - logoLuma) >= 0.35) return tenantBackground;
  return logoLuma < 0.5 ? "#ffffff" : "#111111";
}
