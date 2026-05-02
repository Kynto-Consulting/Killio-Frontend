import { fetchApi } from "@/lib/api/client";

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
  createdAt: string;
  updatedAt: string;
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
  locale?: string;
  limit?: number;
  offset?: number;
}): Promise<MarketplacePack[]> {
  const query = buildQuery({
    q: input.query,
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
