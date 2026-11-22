import { fetchApi } from "@/lib/api/client";
import type { PackSubscription } from "@/lib/marketplace/subscription";

export type MarketplacePublishMode = "private" | "public" | "link";
export type MarketplaceVersionStatus = "draft" | "published" | "archived";
export type MarketplaceAssetType = "script" | "board" | "mesh" | "document";

export type MarketplacePack = {
  id: string;
  teamId: string;
  slug: string;
  status: "draft" | "published" | "archived";
  publishMode: MarketplacePublishMode;
  isPublicListed: boolean;
  defaultLocale: string;
  title: string;
  summary: string | null;
  currentVersionId: string | null;
  latestPublishedVersionId: string | null;
  pricingType?: "free" | "paid" | "subscription";
  priceAmountMinor?: number | null;
  currency?: string | null;
  /** Subscription packs only: free trial length and grace days after a failed charge (billing is monthly). */
  trialDays?: number;
  graceDays?: number;
  /** Presentation fields (optional: an older backend may not send them yet). */
  coverImageUrl?: string | null;
  gallery?: MarketplaceGalleryImage[];
  category?: string | null;
  tags?: string[];
  authorName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceGalleryImage = { url: string; caption: string | null };

export type MarketplacePresentationInput = {
  coverImageUrl?: string | null;
  gallery?: MarketplaceGalleryImage[];
  category?: string | null;
  tags?: string[];
};

export type MarketplacePurchase = {
  id: string;
  packId: string;
  status: "pending" | "paid" | "free" | "failed" | "refunded";
  amountMinor: number;
  currency: string | null;
  createdAt: string;
};

export type MarketplaceCreatePackInput = {
  teamId: string;
  slug: string;
  title: string;
  summary?: string;
  defaultLocale?: string;
  publishMode?: MarketplacePublishMode;
};

export type MarketplaceSnapshotInput = {
  version: string;
  status?: MarketplaceVersionStatus;
  assets: Array<{
    assetType: MarketplaceAssetType;
    sourceEntityId: string;
    logicalKey?: string;
    displayName?: string;
    /** Script assets: the installed copy has its code locked (cannot be read, edited, exported or duplicated; only paused or deleted). */
    lockCode?: boolean;
  }>;
  localizations?: Array<{
    locale: string;
    title: string;
    summary?: string | null;
    description?: string | null;
    changelog?: string | null;
    documentationMarkdown?: string | null;
    metadata?: Record<string, unknown>;
    isDefault?: boolean;
  }>;
  placeholders?: Array<{
    placeholderKey: string;
    valueType: "string" | "number" | "boolean" | "json" | "entity_ref";
    isRequired?: boolean;
    defaultValue?: unknown;
    description?: string | null;
    orderIndex?: number;
    validation?: Record<string, unknown>;
  }>;
};

export type MarketplaceImportInput = {
  destinationTeamId: string;
  selector?: string;
  locale?: string;
  placeholderValues?: Record<string, unknown>;
};

export type MarketplaceImportResult = {
  locale: string;
  entityIdMap: Record<string, string>;
  job?: {
    id: string;
    status: string;
    errorMessage?: string | null;
  } | null;
};

export type MarketplaceSnapshotResult = {
  version: {
    id: string;
    version: string;
    status: string;
  };
  placeholders?: Array<{
    placeholderKey: string;
    valueType: "string" | "number" | "boolean" | "json" | "entity_ref";
    isRequired: boolean;
    defaultValue?: unknown;
    description?: string | null;
    orderIndex?: number;
    validation?: Record<string, unknown>;
  }>;
  intelligence?: {
    autoDetectedPlaceholders: string[];
    referenceEdges: Array<{
      fromLogicalKey: string;
      toLogicalKey: string;
      occurrence: "exact" | "embedded";
      via: string;
    }>;
    unresolvedEntityIds: string[];
  };
};

export type MarketplacePlaceholder = {
  id: string;
  packVersionId: string;
  placeholderKey: string;
  valueType: "string" | "number" | "boolean" | "json" | "entity_ref";
  isRequired: boolean;
  defaultValue: unknown;
  description: string | null;
  orderIndex: number;
  validation: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MarketplacePackDetail = {
  pack: MarketplacePack;
  version: {
    id: string;
    version: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  assets: Array<{
    assetType: MarketplaceAssetType;
    sourceEntityId: string;
    logicalKey: string;
    displayName: string | null;
    orderIndex: number;
  }>;
  localizations: Array<{
    id: string;
    packVersionId: string;
    locale: string;
    title: string;
    summary: string | null;
    description: string | null;
    changelog: string | null;
    documentationMarkdown: string | null;
    metadata: Record<string, unknown>;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  selectedLocalization: {
    id: string;
    packVersionId: string;
    locale: string;
    title: string;
    summary: string | null;
    description: string | null;
    changelog: string | null;
    documentationMarkdown: string | null;
    metadata: Record<string, unknown>;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  placeholders: MarketplacePlaceholder[];
};

export type MarketplaceAssetSuggestion = {
  assetType: MarketplaceAssetType;
  sourceEntityId: string;
  logicalKey: string;
  displayName: string;
  score: number;
  referencedByValues: string[];
};

export type MarketplaceAssetSuggestionsResponse = {
  suggestions: MarketplaceAssetSuggestion[];
  unresolvedEntityIds: string[];
  analyzedAssets: number;
};

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  const text = q.toString();
  return text ? `?${text}` : "";
}

export async function listPublicMarketplacePacks(input: {
  query?: string;
  category?: string;
  locale?: string;
  limit?: number;
  offset?: number;
}): Promise<MarketplacePack[]> {
  const query = buildQuery({
    q: input.query,
    category: input.category,
    locale: input.locale,
    limit: input.limit,
    offset: input.offset,
  });

  return fetchApi<MarketplacePack[]>(`/marketplace/packs${query}`);
}

export async function listTeamMarketplacePacks(teamId: string, accessToken: string): Promise<MarketplacePack[]> {
  return fetchApi<MarketplacePack[]>(`/marketplace/packs/team/${encodeURIComponent(teamId)}`, {
    accessToken,
  });
}

export async function listMyMarketplacePacks(accessToken: string): Promise<MarketplacePack[]> {
  return fetchApi<MarketplacePack[]>(`/marketplace/packs/me`, {
    accessToken,
  });
}

export async function getMarketplacePackDetail(
  packId: string,
  input: {
    selector?: string;
    locale?: string;
    token?: string;
  } = {},
  accessToken?: string,
): Promise<MarketplacePackDetail> {
  const query = buildQuery({
    selector: input.selector,
    locale: input.locale,
    token: input.token,
  });

  return fetchApi<MarketplacePackDetail>(`/marketplace/packs/${encodeURIComponent(packId)}${query}`, {
    accessToken,
  });
}

export async function createMarketplacePack(input: MarketplaceCreatePackInput, accessToken: string): Promise<MarketplacePack> {
  return fetchApi<MarketplacePack>(`/marketplace/packs`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function updateMarketplacePublishMode(
  packId: string,
  publishMode: MarketplacePublishMode,
  accessToken: string,
): Promise<MarketplacePack> {
  return fetchApi<MarketplacePack>(`/marketplace/packs/${encodeURIComponent(packId)}/publish-mode`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ publishMode }),
  });
}

/** Owner only. Free, one-time (paid) or a monthly subscription with optional trial and grace days. The backend validates and decides. */
export async function updateMarketplacePackPricing(
  packId: string,
  input: { pricingType: "free" | "paid" | "subscription"; priceAmountMinor?: number; currency?: string; trialDays?: number; graceDays?: number },
  accessToken: string,
): Promise<MarketplacePack> {
  return fetchApi<MarketplacePack>(`/marketplace/packs/${encodeURIComponent(packId)}/pricing`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

/** Subscription of a TEAM to a pack (killio.dev only). Needs billing / marketplace management in that team; the server is the authority. */
export async function getPackSubscription(teamId: string, packId: string, accessToken: string): Promise<{ subscription: PackSubscription | null; entitled: boolean }> {
  return fetchApi(`/marketplace/teams/${encodeURIComponent(teamId)}/packs/${encodeURIComponent(packId)}/subscription`, { accessToken });
}

/** Starts (or continues) the checkout: the response carries the payment URL to open. The same pending checkout is never charged twice. */
export async function subscribeToPack(teamId: string, packId: string, accessToken: string): Promise<{ subscription: PackSubscription; checkoutUrl: string | null; created: boolean }> {
  return fetchApi(`/marketplace/teams/${encodeURIComponent(teamId)}/packs/${encodeURIComponent(packId)}/subscription`, { method: "POST", accessToken });
}

/** Stops the next charges; the team keeps the pack until the end of the period it already paid. */
export async function cancelPackSubscription(teamId: string, packId: string, accessToken: string): Promise<{ subscription: PackSubscription; checkoutUrl?: null }> {
  return fetchApi(`/marketplace/teams/${encodeURIComponent(teamId)}/packs/${encodeURIComponent(packId)}/subscription/cancel`, { method: "POST", accessToken });
}

export async function resumePackSubscription(teamId: string, packId: string, accessToken: string): Promise<{ subscription: PackSubscription; checkoutUrl?: null }> {
  return fetchApi(`/marketplace/teams/${encodeURIComponent(teamId)}/packs/${encodeURIComponent(packId)}/subscription/resume`, { method: "POST", accessToken });
}

/** Owner only. Sends just the fields you pass; `null` clears the cover or the category. */
export async function updateMarketplacePackPresentation(
  packId: string,
  input: MarketplacePresentationInput,
  accessToken: string,
): Promise<MarketplacePack> {
  return fetchApi<MarketplacePack>(`/marketplace/packs/${encodeURIComponent(packId)}/presentation`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function createMarketplaceSnapshot(
  packId: string,
  input: MarketplaceSnapshotInput,
  accessToken: string,
): Promise<MarketplaceSnapshotResult> {
  return fetchApi<MarketplaceSnapshotResult>(
    `/marketplace/packs/${encodeURIComponent(packId)}/versions/snapshot`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export async function importMarketplacePack(
  packId: string,
  input: MarketplaceImportInput,
  accessToken: string,
): Promise<MarketplaceImportResult> {
  return fetchApi<MarketplaceImportResult>(`/marketplace/packs/${encodeURIComponent(packId)}/import`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function listMarketplaceAssetSuggestions(
  teamId: string,
  input: {
    selectedAssets: Array<{
      assetType: MarketplaceAssetType;
      sourceEntityId: string;
    }>;
    targetType?: MarketplaceAssetType;
    limit?: number;
  },
  accessToken: string,
): Promise<MarketplaceAssetSuggestionsResponse> {
  return fetchApi<MarketplaceAssetSuggestionsResponse>(
    `/marketplace/teams/${encodeURIComponent(teamId)}/asset-suggestions`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

/** Acquires a pack (free packs are granted immediately). Retrying with the same key never creates a second purchase. */
export async function checkoutMarketplacePack(packId: string, accessToken: string, idempotencyKey?: string) {
  return fetchApi<{ purchase: MarketplacePurchase; created: boolean }>(`/marketplace/packs/${encodeURIComponent(packId)}/checkout`, {
    method: "POST",
    accessToken,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
}

export async function listMyMarketplacePurchases(accessToken: string) {
  return fetchApi<MarketplacePurchase[]>(`/marketplace/purchases/me`, { accessToken });
}

/* ── Tenant mode: everything goes through this workspace's backend to the killio.dev hub. Buy and download only. ── */
export type HubCheckoutResult = { purchase: MarketplacePurchase; created: boolean; checkoutUrl?: string | null };

export async function getHubStatus(accessToken: string) {
  return fetchApi<{ connected: boolean }>(`/marketplace/hub/status`, { accessToken });
}

export async function listHubPacks(input: { query?: string; category?: string; locale?: string; limit?: number; offset?: number }) {
  const query = buildQuery({ q: input.query, category: input.category, locale: input.locale, limit: input.limit, offset: input.offset });
  return fetchApi<MarketplacePack[]>(`/marketplace/hub/packs${query}`);
}

export async function getHubPackDetail(packId: string, input: { selector?: string; locale?: string } = {}, accessToken: string) {
  const query = buildQuery({ selector: input.selector, locale: input.locale });
  return fetchApi<MarketplacePackDetail>(`/marketplace/hub/packs/${encodeURIComponent(packId)}${query}`, { accessToken });
}

export async function checkoutHubPack(packId: string, accessToken: string, idempotencyKey: string) {
  return fetchApi<HubCheckoutResult>(`/marketplace/hub/packs/${encodeURIComponent(packId)}/checkout`, {
    method: "POST",
    accessToken,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function listHubPurchases(accessToken: string) {
  return fetchApi<MarketplacePurchase[]>(`/marketplace/hub/purchases`, { accessToken });
}

export async function importHubPack(packId: string, input: MarketplaceImportInput, accessToken: string) {
  return fetchApi<MarketplaceImportResult>(`/marketplace/hub/packs/${encodeURIComponent(packId)}/import`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

/** Starts "connect with killio.dev"; the browser must then go to `authorizationUrl`. */
export async function startHubConnect(accessToken: string) {
  return fetchApi<{ authorizationUrl: string }>(`/oauth/connect/start`, { method: "POST", accessToken });
}

/* ── installed packs and in-place updates ── */

export type PackInstallEntry = {
  packId: string;
  source: "local" | "hub";
  slug: string | null;
  title: string | null;
  installedVersionId: string;
  installedVersion: string;
  installedAt: string;
  installedByUserId: string | null;
  lastUpdatedAt: string | null;
  origin: "install" | "adopted";
  latest: { versionId: string; version: string; publishedAt: string | null; changelog: string | null } | null;
  /** null = unknown (a pack from the hub is checked on demand). */
  updateAvailable: boolean | null;
  pending: { added: number; updated: number; conflicts: number; removedKept: number; keptContent: number } | null;
  reason: "hub_check_required" | "pack_unavailable" | "check_failed" | null;
};

export type LegacyInstallEntry = {
  packId: string;
  title: string | null;
  slug: string | null;
  lastInstalledVersionId: string | null;
  lastInstalledAt: string | null;
  canAdopt: boolean;
  reason: "legacy_install";
};

export type PackInstallsResponse = { teamId: string; canManage: boolean; installs: PackInstallEntry[]; legacy: LegacyInstallEntry[] };

export type UpdateDecision = "add" | "apply" | "conflict" | "keep_content" | "keep_removed" | "skip_missing" | "skip_locked" | "noop";
export type UpdateReason =
  | "new_in_pack" | "pack_changed" | "unchanged" | "content_not_overwritten" | "edited_locally" | "baseline_unknown"
  | "removed_from_pack_kept" | "already_removed_from_pack" | "deleted_locally" | "locked_by_workspace" | "overwrite_requested" | "publisher_lock_replaced";

export type UpdatePlanItem = {
  logicalKey: string;
  assetType: string;
  name: string | null;
  kind: "config" | "content";
  change: "added" | "modified" | "removed" | "unchanged";
  decision: UpdateDecision;
  reason: UpdateReason;
  localEdited: boolean | null;
  overwritable: boolean;
  overwritten: boolean;
  /** Which settings change (roles, channels and bots that will be updated or are in conflict). */
  fields: string[];
};

export type UpdatePreview = {
  dryRun: true;
  pack: { id: string; title: string; slug: string };
  from: { versionId: string; version: string };
  to: { versionId: string; version: string; changelog: string | null };
  locale: string;
  summary: { added: number; updated: number; conflicts: number; keptContent: number; removedKept: number; unchanged: number; skipped: number };
  noop: boolean;
  canOverwrite: boolean;
  missingPlaceholders: Array<{ key: string; valueType: string; description: string | null; defaultValue: unknown }>;
  items: UpdatePlanItem[];
  warnings: string[];
};

export type UpdateItemResult = {
  logicalKey: string;
  assetType: string;
  name: string | null;
  status: "added" | "updated" | "unchanged" | "kept" | "skipped" | "conflict" | "error";
  reason: string;
  fields?: string[];
  message?: string;
};

export type UpdateApplyResult = {
  noop: boolean;
  jobId: string | null;
  from: { versionId: string; version: string };
  to: { versionId: string; version: string };
  summary: Record<string, number>;
  results: UpdateItemResult[];
  warnings: string[];
};

export type UpdateRequest = { targetVersionId?: string; locale?: string; placeholderValues?: Record<string, unknown>; overwrite?: string[] };

const installsBase = (teamId: string, packId: string, hub: boolean) =>
  `${hub ? "/marketplace/hub" : "/marketplace"}/teams/${encodeURIComponent(teamId)}/installs/${encodeURIComponent(packId)}`;

export async function listTeamPackInstalls(teamId: string, accessToken: string): Promise<PackInstallsResponse> {
  return fetchApi<PackInstallsResponse>(`/marketplace/teams/${encodeURIComponent(teamId)}/installs`, { accessToken });
}

/** "Ver cambios": the plan of the update, nothing is written. `hub` = the pack came from the hub (tenant workspaces). */
export async function previewPackUpdate(teamId: string, packId: string, body: UpdateRequest, accessToken: string, hub = false): Promise<UpdatePreview> {
  return fetchApi<UpdatePreview>(`${installsBase(teamId, packId, hub)}/update/preview`, { method: "POST", accessToken, body: JSON.stringify(body) });
}

export async function applyPackUpdate(teamId: string, packId: string, body: UpdateRequest, accessToken: string, hub = false): Promise<UpdateApplyResult> {
  return fetchApi<UpdateApplyResult>(`${installsBase(teamId, packId, hub)}/update`, { method: "POST", accessToken, body: JSON.stringify(body) });
}

/** Enables updates for a pack installed before the install registry existed. */
export async function adoptLegacyPackInstall(teamId: string, packId: string, accessToken: string) {
  return fetchApi<{ packId: string; version: string; tracked: number; deletedByTeam: number; ofAssets: number; baseline: "unknown" }>(`${installsBase(teamId, packId, false)}/adopt`, { method: "POST", accessToken });
}
