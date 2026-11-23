import type { FeatureKey, PublicTenantConfig } from "./types";

type Features = PublicTenantConfig["features"];

/** Which module a dashboard path belongs to (null = always available). */
export function featureForPath(pathname: string): FeatureKey | null {
  const is = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (is("/marketplace")) return "marketplace";
  if (is("/rooms/vault") || is("/vault")) return "vault";
  if (is("/rooms")) return "rooms";
  if (pathname === "/scripts" || is("/integrations/table") || is("/integrations/env")) return "scripts";
  if (is("/integrations")) return "integrations";
  return null;
}

/** Seller-side marketplace pages: tenants can only buy and download packs, never publish or sell. */
export function isSellerOnlyPath(pathname: string): boolean {
  return pathname === "/marketplace/profile" || pathname.startsWith("/marketplace/profile/");
}

export function isPathEnabled(pathname: string, features: Features, mode: "public" | "tenant" = "public"): boolean {
  if (mode === "tenant" && isSellerOnlyPath(pathname)) return false;
  const feature = featureForPath(pathname);
  return feature === null || features[feature];
}

/** The "Scripts" sidebar group needs at least one of its two modules. */
export function isScriptsGroupEnabled(features: Features): boolean {
  return features.scripts || features.integrations;
}
