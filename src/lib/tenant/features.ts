import type { FeatureKey, PublicTenantConfig } from "./types";

type Features = PublicTenantConfig["features"];

/** Which module a dashboard path belongs to (null = always available). */
export function featureForPath(pathname: string): FeatureKey | null {
  const is = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (is("/marketplace")) return "marketplace";
  if (is("/rooms/vault")) return "vault";
  if (is("/rooms")) return "rooms";
  if (pathname === "/scripts" || is("/integrations/table") || is("/integrations/env")) return "scripts";
  if (is("/integrations")) return "integrations";
  return null;
}

export function isPathEnabled(pathname: string, features: Features): boolean {
  const feature = featureForPath(pathname);
  return feature === null || features[feature];
}

/** The "Scripts" sidebar group needs at least one of its two modules. */
export function isScriptsGroupEnabled(features: Features): boolean {
  return features.scripts || features.integrations;
}
