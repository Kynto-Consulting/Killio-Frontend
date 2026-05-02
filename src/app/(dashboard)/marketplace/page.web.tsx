"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Globe,
  Link2,
  Lock,
  Package,
  PackageOpen,
  PlusCircle,
  RefreshCcw,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { BoardSummary, listTeamBoards, listTeamCatalog, TeamCatalog } from "@/lib/api/contracts";
import {
  createMarketplacePack,
  createMarketplaceSnapshot,
  getMarketplacePackDetail,
  importMarketplacePack,
  listMyMarketplacePacks,
  listPublicMarketplacePacks,
  MarketplaceAssetType,
  MarketplacePack,
  MarketplacePackDetail,
  MarketplacePlaceholder,
  MarketplacePublishMode,
  MarketplaceSnapshotInput,
  MarketplaceSnapshotResult,
  updateMarketplacePublishMode,
} from "@/lib/api/marketplace";
import { listScripts, ScriptSummary } from "@/lib/api/scripts";

const DEFAULT_ASSETS_JSON = "[]";
const DEFAULT_PLACEHOLDERS_JSON = "[]";

type SnapshotDraft = {
  version: string;
  status: "draft" | "published" | "archived";
  locale: string;
  title: string;
  assetsJson: string;
  placeholdersJson: string;
};

type SourceAsset = {
  key: string;
  assetType: MarketplaceAssetType;
  sourceEntityId: string;
  logicalKey: string;
  label: string;
  hint: string;
};

type SnapshotInsightByPack = {
  placeholders: string[];
  referenceCount: number;
};

type ImportModalState = {
  pack: MarketplacePack;
  detail: MarketplacePackDetail | null;
  loading: boolean;
  submitting: boolean;
  selector: string;
  destinationTeamId: string;
  locale: string;
  placeholderInputs: Record<string, string>;
  error: string | null;
};

function parseJsonArray<T>(raw: string, label: string): T[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be an array`);
  }
  return parsed as T[];
}

function modeIcon(mode: MarketplacePublishMode) {
  if (mode === "public") return <Globe className="h-3.5 w-3.5" />;
  if (mode === "link") return <Link2 className="h-3.5 w-3.5" />;
  return <Lock className="h-3.5 w-3.5" />;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function logicalPrefix(assetType: MarketplaceAssetType): string {
  if (assetType === "document") return "doc";
  if (assetType === "board") return "board";
  if (assetType === "mesh") return "mesh";
  return "script";
}

function buildSourceAssets(catalog: TeamCatalog, boards: BoardSummary[], scripts: ScriptSummary[]): SourceAsset[] {
  const items: SourceAsset[] = [];
  const usedLogicalKeys = new Set<string>();

  const pushItem = (assetType: MarketplaceAssetType, sourceEntityId: string, label: string, hint: string) => {
    const base = `${logicalPrefix(assetType)}-${slugify(label) || sourceEntityId.slice(0, 8)}`;
    let logicalKey = base;
    let suffix = 2;
    while (usedLogicalKeys.has(logicalKey)) {
      logicalKey = `${base}-${suffix}`;
      suffix += 1;
    }

    usedLogicalKeys.add(logicalKey);
    items.push({
      key: `${assetType}:${sourceEntityId}`,
      assetType,
      sourceEntityId,
      logicalKey,
      label,
      hint,
    });
  };

  for (const doc of catalog.documents) {
    pushItem("document", doc.id, doc.title, "document");
  }

  for (const board of boards) {
    if (board.boardType === "kanban") {
      pushItem("board", board.id, board.name, "kanban");
      continue;
    }

    pushItem("mesh", board.id, board.name, "mesh");
  }

  for (const script of scripts) {
    pushItem("script", script.id, script.name, "script");
  }

  return items;
}

function buildSnapshotInsight(result: MarketplaceSnapshotResult): SnapshotInsightByPack {
  return {
    placeholders: result.intelligence?.autoDetectedPlaceholders ?? [],
    referenceCount: result.intelligence?.referenceEdges?.length ?? 0,
  };
}

function stringifyPlaceholderDefault(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function namespaceLabel(placeholder: MarketplacePlaceholder): string {
  const namespace = placeholder.validation?.namespace;
  return typeof namespace === "string" && namespace.trim().length > 0 ? namespace.trim() : "general";
}

function placeholderLeafLabel(placeholder: MarketplacePlaceholder): string {
  const leafKey = placeholder.validation?.leafKey;
  return typeof leafKey === "string" && leafKey.trim().length > 0 ? leafKey.trim() : placeholder.placeholderKey;
}

function seedPlaceholderInputs(
  placeholders: MarketplacePlaceholder[],
  current: Record<string, string> = {},
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const placeholder of placeholders) {
    next[placeholder.placeholderKey] = current[placeholder.placeholderKey] ?? stringifyPlaceholderDefault(placeholder.defaultValue);
  }
  return next;
}

function sortPlaceholders(placeholders: MarketplacePlaceholder[]): MarketplacePlaceholder[] {
  return [...placeholders].sort((left, right) => {
    const requiredWeight = Number(right.isRequired) - Number(left.isRequired);
    if (requiredWeight !== 0) return requiredWeight;

    const namespaceCompare = namespaceLabel(left).localeCompare(namespaceLabel(right));
    if (namespaceCompare !== 0) return namespaceCompare;

    if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex;
    return placeholderLeafLabel(left).localeCompare(placeholderLeafLabel(right));
  });
}

function serializePlaceholderValue(placeholder: MarketplacePlaceholder, rawValue: string): unknown {
  if (rawValue === "") return undefined;

  switch (placeholder.valueType) {
    case "number": {
      const numberValue = Number(rawValue);
      if (!Number.isFinite(numberValue)) {
        throw new Error(`Invalid number for ${placeholder.placeholderKey}`);
      }
      return numberValue;
    }
    case "boolean":
      if (rawValue !== "true" && rawValue !== "false") {
        throw new Error(`Invalid boolean for ${placeholder.placeholderKey}`);
      }
      return rawValue === "true";
    case "json":
      return JSON.parse(rawValue);
    default:
      return rawValue;
  }
}

function PlaceholderField(props: {
  placeholder: MarketplacePlaceholder;
  value: string;
  onChange: (value: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { placeholder, value, onChange, t } = props;
  const label = placeholderLeafLabel(placeholder);
  const namespace = namespaceLabel(placeholder);
  const syntax = typeof placeholder.validation?.placeholderSyntax === "string"
    ? placeholder.validation.placeholderSyntax
    : placeholder.placeholderKey;

  const fieldBase = "block rounded-xl border border-border/70 bg-background/60 p-3 text-sm text-muted-foreground";
  const inputBase = "mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20";

  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-foreground">{label}</span>
      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{namespace}</span>
    </div>
  );

  if (placeholder.valueType === "boolean") {
    return (
      <label className={fieldBase}>
        {header}
        <p className="mt-1 text-xs">{placeholder.description || syntax}</p>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputBase}>
          <option value="">{t("import.useDefault")}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }

  if (placeholder.valueType === "json") {
    return (
      <label className={fieldBase}>
        {header}
        <p className="mt-1 text-xs">{placeholder.description || syntax}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputBase} h-24 font-mono text-xs`}
          placeholder={t("import.jsonPlaceholder")}
        />
      </label>
    );
  }

  return (
    <label className={fieldBase}>
      {header}
      <p className="mt-1 text-xs">{placeholder.description || syntax}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase}
        placeholder={placeholder.isRequired ? t("import.requiredPlaceholder") : t("import.optionalPlaceholder")}
      />
    </label>
  );
}

export function MarketplacePageView({
  compact = false,
  mode = "browse",
}: {
  compact?: boolean;
  mode?: "browse" | "seller";
} = {}) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const { accessToken, activeTeamId } = useSession();
  const isBrowseMode = mode === "browse";
  const isSellerMode = mode === "seller";

  const [query, setQuery] = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [publicPacks, setPublicPacks] = useState<MarketplacePack[]>([]);
  const [teamPacks, setTeamPacks] = useState<MarketplacePack[]>([]);
  const [sourceAssets, setSourceAssets] = useState<SourceAsset[]>([]);

  const [creatingPack, setCreatingPack] = useState(false);
  const [createPackForm, setCreatePackForm] = useState({
    slug: "",
    title: "",
    summary: "",
    publishMode: "private" as MarketplacePublishMode,
  });

  const [snapshotDraftByPack, setSnapshotDraftByPack] = useState<Record<string, SnapshotDraft>>({});
  const [selectedAssetKeysByPack, setSelectedAssetKeysByPack] = useState<Record<string, string[]>>({});
  const [busyByPack, setBusyByPack] = useState<Record<string, string | null>>({});
  const [messageByPack, setMessageByPack] = useState<Record<string, string | null>>({});
  const [snapshotInsightByPack, setSnapshotInsightByPack] = useState<Record<string, SnapshotInsightByPack>>({});
  const [importModal, setImportModal] = useState<ImportModalState | null>(null);

  // UI-only state
  const [activeSellerTab, setActiveSellerTab] = useState<"packs" | "create">("packs");
  const [expandedSnapshotPackId, setExpandedSnapshotPackId] = useState<string | null>(null);

  const cardsGridClass = compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2";

  const sourceAssetByKey = useMemo(() => {
    const map = new Map<string, SourceAsset>();
    for (const item of sourceAssets) map.set(item.key, item);
    return map;
  }, [sourceAssets]);

  const sourceAssetsByType = useMemo(() => {
    const groups: Record<MarketplaceAssetType, SourceAsset[]> = {
      document: [],
      board: [],
      mesh: [],
      script: [],
    };

    for (const item of sourceAssets) {
      groups[item.assetType].push(item);
    }

    return groups;
  }, [sourceAssets]);

  const ensureSnapshotDraft = useCallback((pack: MarketplacePack): SnapshotDraft => {
    return (
      snapshotDraftByPack[pack.id] ?? {
        version: "v1",
        status: "draft",
        locale,
        title: pack.title,
        assetsJson: DEFAULT_ASSETS_JSON,
        placeholdersJson: DEFAULT_PLACEHOLDERS_JSON,
      }
    );
  }, [locale, snapshotDraftByPack]);

  const loadPublicPacks = useCallback(async () => {
    setPublicLoading(true);
    try {
      const items = await listPublicMarketplacePacks({
        locale,
        query: query.trim() || undefined,
        limit: 60,
      });
      setPublicPacks(items);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("errors.loadPublic"));
    } finally {
      setPublicLoading(false);
    }
  }, [locale, query, t]);

  const loadTeamPacks = useCallback(async () => {
    if (!accessToken) {
      setTeamPacks([]);
      return;
    }

    setTeamLoading(true);
    try {
      const items = await listMyMarketplacePacks(accessToken);
      setTeamPacks(items);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("errors.loadTeam"));
    } finally {
      setTeamLoading(false);
    }
  }, [accessToken, t]);

  const loadSourceAssets = useCallback(async () => {
    if (!accessToken || !activeTeamId) {
      setSourceAssets([]);
      return;
    }

    setCatalogLoading(true);
    try {
      const [catalog, boards, scripts] = await Promise.all([
        listTeamCatalog(activeTeamId, accessToken),
        listTeamBoards(activeTeamId, accessToken),
        listScripts(activeTeamId, accessToken),
      ]);
      setSourceAssets(buildSourceAssets(catalog, boards, scripts));
      setError(null);
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : t("errors.loadCatalog"));
      setSourceAssets([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [accessToken, activeTeamId, t]);

  useEffect(() => {
    if (!isBrowseMode) return;
    loadPublicPacks().catch(() => undefined);
  }, [isBrowseMode, loadPublicPacks]);

  useEffect(() => {
    if (!isSellerMode) return;
    loadTeamPacks().catch(() => undefined);
  }, [isSellerMode, loadTeamPacks]);

  useEffect(() => {
    if (!isSellerMode) return;
    loadSourceAssets().catch(() => undefined);
  }, [isSellerMode, loadSourceAssets]);

  useEffect(() => {
    if (!importModal || !activeTeamId || importModal.destinationTeamId) return;
    setImportModal((current) => (
      current
        ? {
            ...current,
            destinationTeamId: activeTeamId,
          }
        : current
    ));
  }, [activeTeamId, importModal]);

  const updateAssetsJsonFromSelection = useCallback((packId: string, selectedKeys: string[]) => {
    const assets = selectedKeys
      .map((key) => sourceAssetByKey.get(key))
      .filter((item): item is SourceAsset => Boolean(item))
      .map((item) => ({
        assetType: item.assetType,
        sourceEntityId: item.sourceEntityId,
        logicalKey: item.logicalKey,
        displayName: item.label,
      }));

    setSnapshotDraftByPack((prev) => {
      const current = prev[packId] ?? {
        version: "v1",
        status: "draft",
        locale,
        title: "",
        assetsJson: DEFAULT_ASSETS_JSON,
        placeholdersJson: DEFAULT_PLACEHOLDERS_JSON,
      };

      return {
        ...prev,
        [packId]: {
          ...current,
          assetsJson: JSON.stringify(assets, null, 2),
        },
      };
    });
  }, [locale, sourceAssetByKey]);

  const toggleAssetSelection = useCallback((packId: string, assetKey: string) => {
    setSelectedAssetKeysByPack((prev) => {
      const current = new Set(prev[packId] ?? []);
      if (current.has(assetKey)) {
        current.delete(assetKey);
      } else {
        current.add(assetKey);
      }

      const selectedKeys = Array.from(current);
      updateAssetsJsonFromSelection(packId, selectedKeys);

      return {
        ...prev,
        [packId]: selectedKeys,
      };
    });
  }, [updateAssetsJsonFromSelection]);

  const handleCreatePack = useCallback(async () => {
    if (!accessToken || !activeTeamId) {
      setError(t("errors.noWorkspace"));
      return;
    }

    setCreatingPack(true);
    try {
      await createMarketplacePack(
        {
          teamId: activeTeamId,
          slug: createPackForm.slug,
          title: createPackForm.title,
          summary: createPackForm.summary || undefined,
          publishMode: createPackForm.publishMode,
          defaultLocale: locale,
        },
        accessToken,
      );

      setCreatePackForm({ slug: "", title: "", summary: "", publishMode: "private" });
      setActiveSellerTab("packs");
      await loadTeamPacks();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("errors.createPack"));
    } finally {
      setCreatingPack(false);
    }
  }, [accessToken, activeTeamId, createPackForm, locale, loadTeamPacks, t]);

  const handlePublishMode = useCallback(async (packId: string, publishMode: MarketplacePublishMode) => {
    if (!accessToken) return;

    setBusyByPack((prev) => ({ ...prev, [packId]: "mode" }));
    setMessageByPack((prev) => ({ ...prev, [packId]: null }));
    try {
      await updateMarketplacePublishMode(packId, publishMode, accessToken);
      await loadTeamPacks();
      setMessageByPack((prev) => ({ ...prev, [packId]: t("feedback.modeUpdated") }));
    } catch (updateError) {
      setMessageByPack((prev) => ({
        ...prev,
        [packId]: updateError instanceof Error ? updateError.message : t("errors.updateMode"),
      }));
    } finally {
      setBusyByPack((prev) => ({ ...prev, [packId]: null }));
    }
  }, [accessToken, loadTeamPacks, t]);

  const handleSnapshot = useCallback(async (pack: MarketplacePack) => {
    if (!accessToken) return;

    const draft = ensureSnapshotDraft(pack);
    setBusyByPack((prev) => ({ ...prev, [pack.id]: "snapshot" }));
    setMessageByPack((prev) => ({ ...prev, [pack.id]: null }));

    try {
      const selectedKeys = selectedAssetKeysByPack[pack.id] ?? [];
      const selectedAssets = selectedKeys
        .map((key) => sourceAssetByKey.get(key))
        .filter((item): item is SourceAsset => Boolean(item))
        .map((item) => ({
          assetType: item.assetType,
          sourceEntityId: item.sourceEntityId,
          logicalKey: item.logicalKey,
          displayName: item.label,
        }));

      const assets = selectedAssets.length > 0
        ? selectedAssets
        : parseJsonArray<MarketplaceSnapshotInput["assets"][number]>(draft.assetsJson, "assetsJson");

      const placeholders = parseJsonArray<NonNullable<MarketplaceSnapshotInput["placeholders"]>[number]>(
        draft.placeholdersJson,
        "placeholdersJson",
      );

      const result = await createMarketplaceSnapshot(
        pack.id,
        {
          version: draft.version,
          status: draft.status,
          assets,
          placeholders,
          localizations: [
            {
              locale: draft.locale,
              title: draft.title,
              summary: pack.summary,
              isDefault: true,
            },
          ],
        },
        accessToken,
      );

      if (Array.isArray(result.placeholders)) {
        setSnapshotDraftByPack((prev) => ({
          ...prev,
          [pack.id]: {
            ...ensureSnapshotDraft(pack),
            placeholdersJson: JSON.stringify(result.placeholders, null, 2),
          },
        }));
      }

      const insight = buildSnapshotInsight(result);
      setSnapshotInsightByPack((prev) => ({ ...prev, [pack.id]: insight }));
      setMessageByPack((prev) => ({
        ...prev,
        [pack.id]: t("feedback.snapshotWithIntelligence", {
          auto: insight.placeholders.length,
          refs: insight.referenceCount,
        }),
      }));

      await loadTeamPacks();
    } catch (snapshotError) {
      setMessageByPack((prev) => ({
        ...prev,
        [pack.id]: snapshotError instanceof Error ? snapshotError.message : t("errors.snapshot"),
      }));
    } finally {
      setBusyByPack((prev) => ({ ...prev, [pack.id]: null }));
    }
  }, [accessToken, ensureSnapshotDraft, loadTeamPacks, selectedAssetKeysByPack, sourceAssetByKey, t]);

  const loadImportDetail = useCallback(async (
    pack: MarketplacePack,
    selector: string,
    requestedLocale: string,
    currentInputs: Record<string, string> = {},
  ) => {
    setImportModal((current) => current ? { ...current, loading: true, error: null } : current);
    try {
      const detail = await getMarketplacePackDetail(
        pack.id,
        {
          selector: selector || undefined,
          locale: requestedLocale || undefined,
        },
        accessToken || undefined,
      );

      const placeholders = sortPlaceholders(detail.placeholders ?? []);
      setImportModal((current) => {
        if (!current || current.pack.id !== pack.id) return current;
        const nextLocale = detail.selectedLocalization?.locale ?? requestedLocale ?? locale;
        return {
          ...current,
          detail: {
            ...detail,
            placeholders,
          },
          loading: false,
          locale: nextLocale,
          placeholderInputs: seedPlaceholderInputs(placeholders, currentInputs),
        };
      });
    } catch (detailError) {
      setImportModal((current) => current ? {
        ...current,
        loading: false,
        error: detailError instanceof Error ? detailError.message : t("errors.loadPackDetail"),
      } : current);
    }
  }, [accessToken, locale, t]);

  const openImportModal = useCallback((pack: MarketplacePack) => {
    const destinationTeamId = activeTeamId ?? "";
    setImportModal({
      pack,
      detail: null,
      loading: true,
      submitting: false,
      selector: "",
      destinationTeamId,
      locale,
      placeholderInputs: {},
      error: null,
    });

    loadImportDetail(pack, "", locale, {}).catch(() => undefined);
  }, [activeTeamId, loadImportDetail, locale]);

  const handleImportSubmit = useCallback(async () => {
    if (!importModal || !accessToken) return;
    if (!importModal.destinationTeamId) {
      setImportModal((current) => current ? { ...current, error: t("errors.noWorkspace") } : current);
      return;
    }

    const placeholders = importModal.detail?.placeholders ?? [];
    const placeholderValues: Record<string, unknown> = {};

    try {
      for (const placeholder of placeholders) {
        const rawValue = importModal.placeholderInputs[placeholder.placeholderKey] ?? "";
        const serialized = serializePlaceholderValue(placeholder, rawValue);
        if (serialized !== undefined) {
          placeholderValues[placeholder.placeholderKey] = serialized;
        }
      }
    } catch (submitError) {
      setImportModal((current) => current ? {
        ...current,
        error: submitError instanceof Error ? submitError.message : t("errors.import"),
      } : current);
      return;
    }

    setImportModal((current) => current ? { ...current, submitting: true, error: null } : current);
    try {
      const result = await importMarketplacePack(
        importModal.pack.id,
        {
          destinationTeamId: importModal.destinationTeamId,
          selector: importModal.selector || undefined,
          locale: importModal.locale || undefined,
          placeholderValues,
        },
        accessToken,
      );

      setMessageByPack((prev) => ({
        ...prev,
        [importModal.pack.id]: t("feedback.importOk", { count: Object.keys(result.entityIdMap ?? {}).length }),
      }));
      setImportModal(null);
    } catch (importError) {
      setImportModal((current) => current ? {
        ...current,
        submitting: false,
        error: importError instanceof Error ? importError.message : t("errors.import"),
      } : current);
      return;
    }
  }, [accessToken, importModal, t]);

  const sortedPublicPacks = useMemo(
    () => [...publicPacks].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    [publicPacks],
  );

  const importRequiredPlaceholders = useMemo(
    () => (importModal?.detail?.placeholders ?? []).filter((item) => item.isRequired),
    [importModal],
  );

  const importOptionalPlaceholders = useMemo(
    () => (importModal?.detail?.placeholders ?? []).filter((item) => !item.isRequired),
    [importModal],
  );

  const isAnyLoading = publicLoading || teamLoading || catalogLoading;

  return (
    <>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ── HERO ─────────────────────────────────────────── */}
        <header className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card/95 to-background p-6 shadow-md">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/8 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 left-1/3 h-32 w-48 rounded-full bg-primary/5 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3 w-3" />
                {t("eyebrow")}
              </span>
              <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {t("subtitle")}
              </h1>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                {isSellerMode
                  ? "Publish packs and share them with your team or the world."
                  : "Find packs created by the community, or publish your own."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isBrowseMode) loadPublicPacks().catch(() => undefined);
                if (isSellerMode) {
                  loadTeamPacks().catch(() => undefined);
                  loadSourceAssets().catch(() => undefined);
                }
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background/80 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-accent"
            >
              <RefreshCcw className={`h-4 w-4 transition-transform ${isAnyLoading ? "animate-spin" : ""}`} />
              {t("actions.refresh")}
            </button>
          </div>

          {error ? (
            <div className="relative mt-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}
        </header>

        {/* ── SELLER MODE ───────────────────────────────────── */}
        {isSellerMode ? (
          <>
            {/* Tabs */}
            <div className="flex w-fit items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
              <button
                type="button"
                onClick={() => setActiveSellerTab("packs")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeSellerTab === "packs"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("myPacks.title")}
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    activeSellerTab === "packs"
                      ? "bg-primary/15 text-primary"
                      : "bg-border/70 text-muted-foreground"
                  }`}
                >
                  {teamLoading ? "…" : teamPacks.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSellerTab("create")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeSellerTab === "create"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                {t("create.title")}
              </button>
            </div>

            {/* ── CREATE PACK FORM ── */}
            {activeSellerTab === "create" ? (
              <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-foreground">{t("create.title")}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Publish a pack and make it available for others.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("fields.slug")}
                    </label>
                    <input
                      value={createPackForm.slug}
                      onChange={(e) => setCreatePackForm((prev) => ({ ...prev, slug: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                      placeholder="ops-automation-kit"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("fields.title")}
                    </label>
                    <input
                      value={createPackForm.title}
                      onChange={(e) => setCreatePackForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                      placeholder={t("fields.titlePlaceholder")}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex items-baseline justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("fields.summary")}
                      </label>
                      <span className="text-[11px] text-muted-foreground/60">{createPackForm.summary.length} / 120</span>
                    </div>
                    <textarea
                      value={createPackForm.summary}
                      onChange={(e) => setCreatePackForm((prev) => ({ ...prev, summary: e.target.value }))}
                      rows={3}
                      maxLength={120}
                      className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                      placeholder={t("fields.summaryPlaceholder")}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("fields.publishMode")}
                    </label>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-sm">
                      {(["private", "link", "public"] as MarketplacePublishMode[]).map((modeOpt) => {
                        const isActive = createPackForm.publishMode === modeOpt;
                        const styles: Record<MarketplacePublishMode, string> = {
                          private: isActive
                            ? "border-border bg-card text-foreground shadow-sm"
                            : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                          link: isActive
                            ? "border-amber-400/50 bg-amber-500/10 text-amber-400 shadow-sm"
                            : "border-border/50 text-muted-foreground hover:border-amber-400/30 hover:text-amber-400/70",
                          public: isActive
                            ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400 shadow-sm"
                            : "border-border/50 text-muted-foreground hover:border-emerald-400/30 hover:text-emerald-400/70",
                        };
                        return (
                          <button
                            key={modeOpt}
                            type="button"
                            onClick={() => setCreatePackForm((prev) => ({ ...prev, publishMode: modeOpt }))}
                            className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition-all ${styles[modeOpt]}`}
                          >
                            {modeOpt === "private" && <Lock className="h-4 w-4" />}
                            {modeOpt === "link" && <Link2 className="h-4 w-4" />}
                            {modeOpt === "public" && <Globe className="h-4 w-4" />}
                            {t(`publish.${modeOpt}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={creatingPack || !createPackForm.slug.trim() || !createPackForm.title.trim()}
                    onClick={handleCreatePack}
                    className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <PlusCircle className="h-4 w-4" />
                    {creatingPack ? t("actions.creating") : t("actions.createPack")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSellerTab("packs")}
                    className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("actions.cancel")}
                  </button>
                </div>
              </section>
            ) : null}

            {/* ── MY PACKS LIST ── */}
            {activeSellerTab === "packs" ? (
              <section>
                {teamLoading ? (
                  <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
                    <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                    {t("status.loading")}
                  </div>
                ) : teamPacks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
                    <Package className="h-12 w-12 text-muted-foreground/30" />
                    <p className="mt-3 text-sm font-medium text-foreground">{t("empty.noTeamPacks")}</p>
                    <button
                      type="button"
                      onClick={() => setActiveSellerTab("create")}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      {t("actions.createPack")}
                    </button>
                  </div>
                ) : (
                  <div className={`grid gap-4 ${cardsGridClass}`}>
                    {teamPacks.map((pack) => {
                      const snapshotDraft = ensureSnapshotDraft(pack);
                      const selectedKeys = selectedAssetKeysByPack[pack.id] ?? [];
                      const snapshotInsight = snapshotInsightByPack[pack.id];
                      const busyAction = busyByPack[pack.id];
                      const isSnapshotExpanded = expandedSnapshotPackId === pack.id;

                      const modeStyles: Record<MarketplacePublishMode, string> = {
                        private: "text-muted-foreground border-border bg-background",
                        link: "text-amber-400 border-amber-400/30 bg-amber-500/10",
                        public: "text-emerald-400 border-emerald-400/30 bg-emerald-500/10",
                      };

                      return (
                        <article key={pack.id} className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm transition-shadow hover:shadow-md">
                          {/* Card header */}
                          <div className="flex items-start justify-between gap-3 p-5">
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-base font-semibold text-foreground">{pack.title}</h3>
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{pack.slug}</p>
                              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                {pack.summary ?? t("empty.noSummary")}
                              </p>
                            </div>
                            <label
                              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${modeStyles[pack.publishMode]}`}
                            >
                              {modeIcon(pack.publishMode)}
                              <select
                                value={pack.publishMode}
                                onChange={(e) => handlePublishMode(pack.id, e.target.value as MarketplacePublishMode)}
                                disabled={busyAction === "mode"}
                                className="cursor-pointer bg-transparent text-xs outline-none"
                              >
                                <option value="private">{t("publish.private")}</option>
                                <option value="public">{t("publish.public")}</option>
                                <option value="link">{t("publish.link")}</option>
                              </select>
                            </label>
                          </div>

                          {/* Snapshot insight */}
                          {snapshotInsight && snapshotInsight.placeholders.length > 0 ? (
                            <div className="mx-5 mb-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                                {t("snapshot.detectedPlaceholders")}
                              </p>
                              <p className="mt-0.5 text-xs text-foreground">{snapshotInsight.placeholders.join(", ")}</p>
                            </div>
                          ) : null}

                          {/* Feedback message */}
                          {messageByPack[pack.id] ? (
                            <div className="mx-5 mb-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                              {messageByPack[pack.id]}
                            </div>
                          ) : null}

                          {/* Snapshot expand toggle */}
                          <div className="mt-auto border-t border-border/50">
                            <button
                              type="button"
                              onClick={() => setExpandedSnapshotPackId(isSnapshotExpanded ? null : pack.id)}
                              className="flex w-full items-center justify-between gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
                            >
                              <span className="flex items-center gap-1.5">
                                <Upload className="h-3.5 w-3.5" />
                                {t("snapshot.title")}
                              </span>
                              {isSnapshotExpanded
                                ? <ChevronUp className="h-4 w-4" />
                                : <ChevronDown className="h-4 w-4" />}
                            </button>

                            {isSnapshotExpanded ? (
                              <div className="border-t border-border/50 bg-background/40 px-5 py-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {t("snapshot.version")}
                                    </label>
                                    <input
                                      value={snapshotDraft.version}
                                      onChange={(e) =>
                                        setSnapshotDraftByPack((prev) => ({
                                          ...prev,
                                          [pack.id]: { ...snapshotDraft, version: e.target.value },
                                        }))
                                      }
                                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                                      placeholder="v1.0"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Status
                                    </label>
                                    <select
                                      value={snapshotDraft.status}
                                      onChange={(e) =>
                                        setSnapshotDraftByPack((prev) => ({
                                          ...prev,
                                          [pack.id]: { ...snapshotDraft, status: e.target.value as SnapshotDraft["status"] },
                                        }))
                                      }
                                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                                    >
                                      <option value="draft">Draft</option>
                                      <option value="published">Published</option>
                                      <option value="archived">Archived</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Locale
                                    </label>
                                    <input
                                      value={snapshotDraft.locale}
                                      onChange={(e) =>
                                        setSnapshotDraftByPack((prev) => ({
                                          ...prev,
                                          [pack.id]: { ...snapshotDraft, locale: e.target.value },
                                        }))
                                      }
                                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                                      placeholder="en"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {t("fields.title")}
                                    </label>
                                    <input
                                      value={snapshotDraft.title}
                                      onChange={(e) =>
                                        setSnapshotDraftByPack((prev) => ({
                                          ...prev,
                                          [pack.id]: { ...snapshotDraft, title: e.target.value },
                                        }))
                                      }
                                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                                    />
                                  </div>

                                  {/* Asset Picker */}
                                  <div className="rounded-xl border border-border/60 bg-background/60 p-3 sm:col-span-2">
                                    <div className="mb-2.5 flex items-center justify-between">
                                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {t("snapshot.assetPicker")}
                                      </p>
                                      <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                        {t("snapshot.selectedCount", { count: selectedKeys.length })}
                                      </span>
                                    </div>

                                    {catalogLoading ? (
                                      <p className="text-xs text-muted-foreground">{t("status.loading")}</p>
                                    ) : (
                                      <div className="space-y-3">
                                        {(["document", "board", "mesh", "script"] as MarketplaceAssetType[]).map((assetType) => {
                                          const options = sourceAssetsByType[assetType];
                                          if (options.length === 0) return null;
                                          return (
                                            <div key={assetType}>
                                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                {t(`assetTypes.${assetType}`)}
                                              </p>
                                              <div className="flex flex-wrap gap-1.5">
                                                {options.map((option) => {
                                                  const checked = selectedKeys.includes(option.key);
                                                  return (
                                                    <button
                                                      key={option.key}
                                                      type="button"
                                                      onClick={() => toggleAssetSelection(pack.id, option.key)}
                                                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                                                        checked
                                                          ? "border-primary/40 bg-primary/10 text-primary"
                                                          : "border-border text-muted-foreground hover:border-border hover:bg-accent/30 hover:text-foreground"
                                                      }`}
                                                    >
                                                      {checked ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                                                      {option.label}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  <div className="sm:col-span-2">
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Assets JSON
                                    </label>
                                    <textarea
                                      value={snapshotDraft.assetsJson}
                                      onChange={(e) =>
                                        setSnapshotDraftByPack((prev) => ({
                                          ...prev,
                                          [pack.id]: { ...snapshotDraft, assetsJson: e.target.value },
                                        }))
                                      }
                                      rows={3}
                                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary/60"
                                    />
                                  </div>

                                  <div className="sm:col-span-2">
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Placeholders JSON
                                    </label>
                                    <textarea
                                      value={snapshotDraft.placeholdersJson}
                                      onChange={(e) =>
                                        setSnapshotDraftByPack((prev) => ({
                                          ...prev,
                                          [pack.id]: { ...snapshotDraft, placeholdersJson: e.target.value },
                                        }))
                                      }
                                      rows={2}
                                      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary/60"
                                    />
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleSnapshot(pack)}
                                  disabled={busyAction === "snapshot"}
                                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-accent disabled:opacity-50"
                                >
                                  <Upload className="h-4 w-4" />
                                  {busyAction === "snapshot" ? t("actions.savingSnapshot") : t("actions.saveSnapshot")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {/* ── BROWSE MODE ───────────────────────────────────── */}
        {isBrowseMode ? (
          <section>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t("publicPacks.title")}</h2>
                {!publicLoading ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {sortedPublicPacks.length} {sortedPublicPacks.length === 1 ? "pack" : "packs"} available
                  </p>
                ) : null}
              </div>
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                  placeholder={t("publicPacks.search")}
                />
              </div>
            </div>

            {publicLoading ? (
              <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                {t("status.loading")}
              </div>
            ) : sortedPublicPacks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24 text-center">
                <PackageOpen className="h-14 w-14 text-muted-foreground/25" />
                <p className="mt-4 text-sm font-medium text-foreground">{t("empty.noPublicPacks")}</p>
                <p className="mt-1 text-xs text-muted-foreground">Check back later or create your own pack.</p>
              </div>
            ) : (
              <div className={`grid gap-4 ${cardsGridClass}`}>
                {sortedPublicPacks.map((pack) => (
                  <article
                    key={pack.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm transition-all hover:border-border hover:shadow-md"
                  >
                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                            {pack.title}
                          </h3>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{pack.slug}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-border bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {pack.defaultLocale}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                        {pack.summary ?? t("empty.noSummary")}
                      </p>
                    </div>

                    {messageByPack[pack.id] ? (
                      <div className="mx-5 mb-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                        {messageByPack[pack.id]}
                      </div>
                    ) : null}

                    <div className="border-t border-border/50 p-4">
                      <button
                        type="button"
                        onClick={() => openImportModal(pack)}
                        disabled={!accessToken}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Upload className="h-4 w-4" />
                        {t("actions.configureImport")}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {/* ── IMPORT MODAL ──────────────────────────────────── */}
      {isBrowseMode && importModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-8 backdrop-blur-sm sm:items-center">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-block rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("import.modalEyebrow")}
                </span>
                <h3 className="mt-2 text-xl font-bold text-foreground">{importModal.pack.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {importModal.detail?.selectedLocalization?.summary ?? importModal.pack.summary ?? t("empty.noSummary")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModal(null)}
                className="shrink-0 rounded-xl border border-border bg-background p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("import.destinationTeam")}
                </label>
                <input
                  value={importModal.destinationTeamId}
                  onChange={(e) => setImportModal((cur) => cur ? { ...cur, destinationTeamId: e.target.value } : cur)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("import.selector")}
                </label>
                <input
                  value={importModal.selector}
                  onChange={(e) => setImportModal((cur) => cur ? { ...cur, selector: e.target.value } : cur)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("import.locale")}
                </label>
                <select
                  value={importModal.locale}
                  onChange={(e) => setImportModal((cur) => cur ? { ...cur, locale: e.target.value } : cur)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                >
                  {(importModal.detail?.localizations ?? []).map((entry) => (
                    <option key={entry.locale} value={entry.locale}>{entry.locale}</option>
                  ))}
                  {importModal.detail?.localizations?.length ? null : <option value={locale}>{locale}</option>}
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => loadImportDetail(importModal.pack, importModal.selector, importModal.locale, importModal.placeholderInputs)}
                disabled={importModal.loading}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <RefreshCcw className={`h-4 w-4 ${importModal.loading ? "animate-spin" : ""}`} />
                {t("actions.reloadVersion")}
              </button>
              {importModal.detail?.version ? (
                <span className="rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                  {t("import.loadedVersion", { version: importModal.detail.version.version })}
                </span>
              ) : null}
            </div>

            {importModal.error ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {importModal.error}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  <p className="text-sm font-semibold text-foreground">{t("import.requiredTitle")}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("import.requiredDescription")}</p>
                <div className="mt-3 space-y-3">
                  {importRequiredPlaceholders.length > 0 ? (
                    importRequiredPlaceholders.map((placeholder) => (
                      <PlaceholderField
                        key={placeholder.placeholderKey}
                        placeholder={placeholder}
                        value={importModal.placeholderInputs[placeholder.placeholderKey] ?? ""}
                        onChange={(value) =>
                          setImportModal((cur) => cur ? {
                            ...cur,
                            placeholderInputs: { ...cur.placeholderInputs, [placeholder.placeholderKey]: value },
                          } : cur)
                        }
                        t={t}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("import.noRequired")}</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  <p className="text-sm font-semibold text-foreground">{t("import.optionalTitle")}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("import.optionalDescription")}</p>
                <div className="mt-3 space-y-3">
                  {importOptionalPlaceholders.length > 0 ? (
                    importOptionalPlaceholders.map((placeholder) => (
                      <PlaceholderField
                        key={placeholder.placeholderKey}
                        placeholder={placeholder}
                        value={importModal.placeholderInputs[placeholder.placeholderKey] ?? ""}
                        onChange={(value) =>
                          setImportModal((cur) => cur ? {
                            ...cur,
                            placeholderInputs: { ...cur.placeholderInputs, [placeholder.placeholderKey]: value },
                          } : cur)
                        }
                        t={t}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("import.noOptional")}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
              <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
                {t("import.placeholderCount", { count: importModal.detail?.placeholders?.length ?? 0 })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportModal(null)}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={importModal.loading || importModal.submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2 text-sm font-semibold text-background shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {importModal.submitting ? t("actions.importing") : t("actions.import")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default MarketplacePageView;
