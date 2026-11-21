/**
 * Dynamic permission catalogue (addendum A7). Pure helpers.
 *
 * The editors are built ONLY from `GET /teams/:teamId/permissions/catalog`. The hardcoded list in model.ts
 * (PERMISSION_GROUPS) survives only as `approximateCatalog()`: the backup used when the endpoint fails or does
 * not exist yet. It is always labelled "approximate" and never blocks anything.
 */

import { PERMISSION_GROUPS, RESOURCE_PERMISSION_KEYS, type TriState } from "./model.ts";

export type PermissionScope = "team" | "resource" | "room";

export interface CatalogPermission {
  key: string;
  /** Empty = no server label (approximate catalogue): the UI falls back to its own text. */
  label: string;
  description: string;
  group: string;
  groupLabel: string;
  scope: PermissionScope;
  resourceTypes: string[] | null;
  dangerous: boolean;
  requires: string[];
  /** The provider marked it obsolete, or the provider is uninstalled. */
  obsolete: boolean;
  providerId: string;
}

export interface CatalogProvider {
  id: string;
  label: string;
  description: string;
  version: string;
  /** False when the provider is uninstalled: all its keys are obsolete. */
  installed: boolean;
  permissions: CatalogPermission[];
}

export interface PermissionCatalog {
  providers: CatalogProvider[];
  /** "approx" = local backup, not the server's truth. */
  source: "server" | "approx";
}

/** A text that may be a plain string or `{ es, en }`: picks the user's language, then English, then anything. */
export function localizedText(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const pick = o[locale] ?? o[locale.split("-")[0]] ?? o.en ?? Object.values(o).find((v) => typeof v === "string");
    return typeof pick === "string" ? pick : "";
  }
  return "";
}

const SCOPES: ReadonlySet<string> = new Set(["team", "resource", "room"]);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Accepts `{ providers: [...] }` (or a bare array). A provider lists `permissions[]` each carrying `group`, or
 * `groups[{ id, label, permissions[] }]`. Duplicate keys: the first wins (the server already rejects them).
 */
export function normalizeCatalog(raw: unknown, locale = "en"): PermissionCatalog | null {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.providers) ? (raw as any).providers : null;
  if (!list) return null;
  const seen = new Set<string>();
  const providers: CatalogProvider[] = [];
  for (const p of list) {
    const id = typeof p?.id === "string" ? p.id : "";
    if (!id) continue;
    const entries: Array<{ d: any; groupId?: string; groupLabel?: unknown }> = [];
    if (Array.isArray(p.permissions)) p.permissions.forEach((d: any) => entries.push({ d }));
    if (Array.isArray(p.groups)) {
      for (const g of p.groups) for (const d of Array.isArray(g?.permissions) ? g.permissions : []) entries.push({ d, groupId: g?.id, groupLabel: g?.label });
    }
    const installed = p.installed !== false && p.deprecated !== true && p.uninstalled !== true;
    const permissions: CatalogPermission[] = [];
    for (const { d, groupId, groupLabel } of entries) {
      const key = typeof d?.key === "string" ? d.key : "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      permissions.push({
        key,
        label: localizedText(d.label, locale),
        description: localizedText(d.description, locale),
        group: String(d.group ?? groupId ?? "general"),
        groupLabel: localizedText(d.groupLabel ?? groupLabel, locale),
        scope: SCOPES.has(d.scope) ? d.scope : "team",
        resourceTypes: Array.isArray(d.resourceTypes) ? strList(d.resourceTypes) : null,
        dangerous: d.dangerous === true,
        requires: strList(d.requires),
        obsolete: d.obsolete === true || !installed,
        providerId: id,
      });
    }
    providers.push({ id, label: localizedText(p.label ?? p.name, locale) || id, description: localizedText(p.description, locale), version: typeof p.version === "string" ? p.version : "", installed, permissions });
  }
  return { providers, source: "server" };
}

/** Minimal local catalogue (labels come from the app's own i18n). Used only when the server catalogue is unavailable. */
export function approximateCatalog(): PermissionCatalog {
  const dangerous = new Set(["administrator", "content.manage_all", "env.manage", "billing.manage"]);
  const requires: Record<string, string[]> = { "room.post": ["room.view"], "room.react": ["room.view"], "room.call": ["room.view"], "room.record": ["room.call"] };
  const permissions: CatalogPermission[] = PERMISSION_GROUPS.flatMap((g) =>
    g.keys.map(
      (key): CatalogPermission => ({
        key, label: "", description: "", group: g.id, groupLabel: "", scope: key.startsWith("room.") ? "room" : "team",
        resourceTypes: null, dangerous: dangerous.has(key), requires: requires[key] ?? [], obsolete: false, providerId: "core",
      }),
    ),
  );
  permissions.push(
    ...RESOURCE_PERMISSION_KEYS.map(
      (key): CatalogPermission => ({
        key, label: "", description: "", group: "resource", groupLabel: "", scope: "resource", resourceTypes: null,
        dangerous: false, requires: key === "resource.view" ? [] : ["resource.view"], obsolete: false, providerId: "core",
      }),
    ),
  );
  return { providers: [{ id: "core", label: "", description: "", version: "", installed: true, permissions }], source: "approx" };
}

export function catalogIndex(catalog: PermissionCatalog): Map<string, CatalogPermission> {
  const m = new Map<string, CatalogPermission>();
  for (const p of catalog.providers) for (const d of p.permissions) m.set(d.key, d);
  return m;
}

export interface CatalogSection {
  provider: CatalogProvider;
  groups: Array<{ id: string; label: string; permissions: CatalogPermission[] }>;
}

/** Providers then groups; only permissions of the wanted scopes (and resource type); obsolete ones left out; `core` first. */
export function groupCatalog(catalog: PermissionCatalog, scopes: readonly PermissionScope[], resourceType?: string): CatalogSection[] {
  const sections: CatalogSection[] = [];
  for (const provider of catalog.providers) {
    const groups = new Map<string, { id: string; label: string; permissions: CatalogPermission[] }>();
    for (const d of provider.permissions) {
      if (d.obsolete || !scopes.includes(d.scope)) continue;
      if (resourceType && d.resourceTypes && !d.resourceTypes.includes(resourceType)) continue;
      const g = groups.get(d.group) ?? { id: d.group, label: d.groupLabel, permissions: [] };
      if (!g.label && d.groupLabel) g.label = d.groupLabel;
      g.permissions.push(d);
      groups.set(d.group, g);
    }
    if (groups.size > 0) sections.push({ provider, groups: [...groups.values()] });
  }
  return [...sections.filter((s) => s.provider.id === "core"), ...sections.filter((s) => s.provider.id !== "core")];
}

/** Keys stored somewhere (a role, an override) that the live catalogue no longer defines or marks obsolete. */
export function obsoleteKeys(keys: readonly string[], catalog: PermissionCatalog): string[] {
  const idx = catalogIndex(catalog);
  return keys.filter((k) => {
    const d = idx.get(k);
    return !d || d.obsolete;
  });
}

/** The provider an obsolete key came from, guessed from the mandatory `ext.<provider>.<name>` prefix (else null). */
export function providerOfKey(key: string): string | null {
  const m = /^ext\.([^.]+)\./.exec(key);
  return m ? m[1] : null;
}

/** Origin class of a provider for its badge: the core, one of our own integrations, or a third-party extension. */
export function providerOrigin(providerId: string): "core" | "integration" | "extension" {
  if (providerId === "core") return "core";
  if (providerId === "integrations" || providerId.startsWith("integrations.")) return "integration";
  return "extension";
}

/** Required permissions of `key` that are not currently allowed (warn only: the server decides). */
export function unmetRequires(key: string, isAllowed: (k: string) => boolean, catalog: PermissionCatalog): string[] {
  const d = catalogIndex(catalog).get(key);
  return d ? d.requires.filter((r) => !isAllowed(r)) : [];
}

/** Allowing a dangerous permission asks for a confirmation first. */
export const needsDangerConfirm = (catalog: PermissionCatalog, key: string, next: TriState) => next === "allow" && !!catalogIndex(catalog).get(key)?.dangerous;

/** What somebody holds, grouped from the live catalogue (resource-scope and obsolete keys are skipped; administrator collapses). */
export function groupHeldByCatalog(held: readonly string[], catalog: PermissionCatalog): Array<{ providerId: string; group: string; groupLabel: string; keys: string[] }> {
  const idx = catalogIndex(catalog);
  const out = new Map<string, { providerId: string; group: string; groupLabel: string; keys: string[] }>();
  const set = new Set(held);
  const keys = set.has("administrator") ? ["administrator"] : [...set];
  for (const k of keys) {
    const d = idx.get(k);
    if (!d || d.obsolete || d.scope === "resource") continue;
    const id = `${d.providerId}/${d.group}`;
    const g = out.get(id) ?? { providerId: d.providerId, group: d.group, groupLabel: d.groupLabel, keys: [] };
    g.keys.push(k);
    out.set(id, g);
  }
  return [...out.values()];
}
