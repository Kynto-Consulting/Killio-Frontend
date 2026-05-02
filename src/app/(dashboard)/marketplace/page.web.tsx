"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Link2, Lock, PlusCircle, RefreshCcw, Sparkles, Upload, X } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { BoardSummary, listTeamBoards, listTeamCatalog, TeamCatalog } from "@/lib/api/contracts";
import {
  createMarketplacePack,
  createMarketplaceSnapshot,
  getMarketplacePackDetail,
  importMarketplacePack,
  listPublicMarketplacePacks,
  listTeamMarketplacePacks,
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

  if (placeholder.valueType === "boolean") {
    return (
      <label className="block rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-[11px] uppercase tracking-[0.08em]">{namespace}</span>
        </div>
        <p className="mt-1 text-xs">{placeholder.description || syntax}</p>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          <option value="">{t("import.useDefault")}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }

  if (placeholder.valueType === "json") {
    return (
      <label className="block rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-[11px] uppercase tracking-[0.08em]">{namespace}</span>
        </div>
        <p className="mt-1 text-xs">{placeholder.description || syntax}</p>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 h-24 w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-foreground"
          placeholder={t("import.jsonPlaceholder")}
        />
      </label>
    );
  }

  return (
    <label className="block rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-[11px] uppercase tracking-[0.08em]">{namespace}</span>
      </div>
      <p className="mt-1 text-xs">{placeholder.description || syntax}</p>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
        placeholder={placeholder.isRequired ? t("import.requiredPlaceholder") : t("import.optionalPlaceholder")}
      />
    </label>
  );
}

export function MarketplacePageView({ compact = false }: { compact?: boolean } = {}) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const { accessToken, activeTeamId } = useSession();

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
    if (!accessToken || !activeTeamId) {
      setTeamPacks([]);
      return;
    }

    setTeamLoading(true);
    try {
      const items = await listTeamMarketplacePacks(activeTeamId, accessToken);
      setTeamPacks(items);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("errors.loadTeam"));
    } finally {
      setTeamLoading(false);
    }
  }, [accessToken, activeTeamId, t]);

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
    loadPublicPacks().catch(() => undefined);
  }, [loadPublicPacks]);

  useEffect(() => {
    loadTeamPacks().catch(() => undefined);
  }, [loadTeamPacks]);

  useEffect(() => {
    loadSourceAssets().catch(() => undefined);
  }, [loadSourceAssets]);

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

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("eyebrow")}</p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
                <Sparkles className="h-5 w-5" />
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                loadPublicPacks().catch(() => undefined);
                loadTeamPacks().catch(() => undefined);
                loadSourceAssets().catch(() => undefined);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCcw className={`h-4 w-4 ${publicLoading || teamLoading || catalogLoading ? "animate-spin" : ""}`} />
              {t("actions.refresh")}
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <section className="mt-6 rounded-2xl border border-border/70 bg-card/60 p-5">
          <div className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
            <PlusCircle className="h-4 w-4" />
            {t("create.title")}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-muted-foreground">
              {t("fields.slug")}
              <input
                value={createPackForm.slug}
                onChange={(event) => setCreatePackForm((prev) => ({ ...prev, slug: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                placeholder="ops-automation-kit"
              />
            </label>

            <label className="text-sm text-muted-foreground">
              {t("fields.title")}
              <input
                value={createPackForm.title}
                onChange={(event) => setCreatePackForm((prev) => ({ ...prev, title: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                placeholder={t("fields.titlePlaceholder")}
              />
            </label>

            <label className="text-sm text-muted-foreground md:col-span-2">
              {t("fields.summary")}
              <textarea
                value={createPackForm.summary}
                onChange={(event) => setCreatePackForm((prev) => ({ ...prev, summary: event.target.value }))}
                className="mt-1 h-20 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                placeholder={t("fields.summaryPlaceholder")}
              />
            </label>

            <label className="text-sm text-muted-foreground">
              {t("fields.publishMode")}
              <select
                value={createPackForm.publishMode}
                onChange={(event) => setCreatePackForm((prev) => ({ ...prev, publishMode: event.target.value as MarketplacePublishMode }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              >
                <option value="private">{t("publish.private")}</option>
                <option value="public">{t("publish.public")}</option>
                <option value="link">{t("publish.link")}</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            disabled={creatingPack || !createPackForm.slug.trim() || !createPackForm.title.trim()}
            onClick={handleCreatePack}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusCircle className="h-4 w-4" />
            {creatingPack ? t("actions.creating") : t("actions.createPack")}
          </button>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t("myPacks.title")}</h2>
            <span className="text-xs text-muted-foreground">
              {teamLoading ? t("status.loading") : t("myPacks.count", { count: teamPacks.length })}
            </span>
          </div>

          <div className={`grid gap-4 ${cardsGridClass}`}>
            {teamPacks.map((pack) => {
              const snapshotDraft = ensureSnapshotDraft(pack);
              const selectedKeys = selectedAssetKeysByPack[pack.id] ?? [];
              const snapshotInsight = snapshotInsightByPack[pack.id];
              const busyAction = busyByPack[pack.id];

              return (
                <article key={pack.id} className="rounded-xl border border-border/70 bg-card/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{pack.title}</h3>
                      <p className="text-xs text-muted-foreground">{pack.slug}</p>
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                      {modeIcon(pack.publishMode)}
                      <select
                        value={pack.publishMode}
                        onChange={(event) => handlePublishMode(pack.id, event.target.value as MarketplacePublishMode)}
                        disabled={busyAction === "mode"}
                        className="bg-transparent text-xs text-foreground outline-none"
                      >
                        <option value="private">{t("publish.private")}</option>
                        <option value="public">{t("publish.public")}</option>
                        <option value="link">{t("publish.link")}</option>
                      </select>
                    </label>
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">{pack.summary ?? t("empty.noSummary")}</p>

                  <div className="mt-4 rounded-lg border border-border/60 bg-background/60 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("snapshot.title")}
                    </p>

                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={snapshotDraft.version}
                        onChange={(event) =>
                          setSnapshotDraftByPack((prev) => ({
                            ...prev,
                            [pack.id]: { ...snapshotDraft, version: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        placeholder={t("snapshot.version")}
                      />

                      <select
                        value={snapshotDraft.status}
                        onChange={(event) =>
                          setSnapshotDraftByPack((prev) => ({
                            ...prev,
                            [pack.id]: { ...snapshotDraft, status: event.target.value as SnapshotDraft["status"] },
                          }))
                        }
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      >
                        <option value="draft">draft</option>
                        <option value="published">published</option>
                        <option value="archived">archived</option>
                      </select>

                      <input
                        value={snapshotDraft.locale}
                        onChange={(event) =>
                          setSnapshotDraftByPack((prev) => ({
                            ...prev,
                            [pack.id]: { ...snapshotDraft, locale: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        placeholder="en"
                      />

                      <input
                        value={snapshotDraft.title}
                        onChange={(event) =>
                          setSnapshotDraftByPack((prev) => ({
                            ...prev,
                            [pack.id]: { ...snapshotDraft, title: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        placeholder={t("fields.title")}
                      />

                      <div className="md:col-span-2 rounded-lg border border-border bg-card p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {t("snapshot.assetPicker")}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {t("snapshot.selectedCount", { count: selectedKeys.length })}
                          </span>
                        </div>

                        {catalogLoading ? (
                          <p className="text-xs text-muted-foreground">{t("status.loading")}</p>
                        ) : (
                          <div className="space-y-2">
                            {(["document", "board", "mesh", "script"] as MarketplaceAssetType[]).map((assetType) => {
                              const options = sourceAssetsByType[assetType];
                              if (options.length === 0) return null;

                              return (
                                <div key={assetType}>
                                  <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                                    {t(`assetTypes.${assetType}`)}
                                  </p>
                                  <div className="grid gap-1">
                                    {options.map((option) => {
                                      const checked = selectedKeys.includes(option.key);
                                      return (
                                        <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2 py-1 text-xs text-foreground hover:bg-accent/30">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleAssetSelection(pack.id, option.key)}
                                            className="h-3.5 w-3.5"
                                          />
                                          <span className="font-medium">{option.label}</span>
                                          <span className="text-muted-foreground">({option.hint})</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <textarea
                        value={snapshotDraft.assetsJson}
                        onChange={(event) =>
                          setSnapshotDraftByPack((prev) => ({
                            ...prev,
                            [pack.id]: { ...snapshotDraft, assetsJson: event.target.value },
                          }))
                        }
                        className="md:col-span-2 h-24 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                      />

                      <textarea
                        value={snapshotDraft.placeholdersJson}
                        onChange={(event) =>
                          setSnapshotDraftByPack((prev) => ({
                            ...prev,
                            [pack.id]: { ...snapshotDraft, placeholdersJson: event.target.value },
                          }))
                        }
                        className="md:col-span-2 h-20 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSnapshot(pack)}
                      disabled={busyAction === "snapshot"}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    >
                      <Upload className="h-4 w-4" />
                      {busyAction === "snapshot" ? t("actions.savingSnapshot") : t("actions.saveSnapshot")}
                    </button>
                  </div>

                  {snapshotInsight && snapshotInsight.placeholders.length > 0 ? (
                    <div className="mt-2 rounded-md border border-border/70 bg-background/70 px-2 py-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        {t("snapshot.detectedPlaceholders")}
                      </p>
                      <p className="mt-1 text-xs text-foreground">{snapshotInsight.placeholders.join(", ")}</p>
                    </div>
                  ) : null}

                  {messageByPack[pack.id] ? (
                    <p className="mt-2 text-xs text-muted-foreground">{messageByPack[pack.id]}</p>
                  ) : null}
                </article>
              );
            })}

            {!teamLoading && teamPacks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                {t("empty.noTeamPacks")}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t("publicPacks.title")}</h2>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              placeholder={t("publicPacks.search")}
            />
          </div>

          <div className={`grid gap-4 ${cardsGridClass}`}>
            {sortedPublicPacks.map((pack) => (
              <article key={pack.id} className="rounded-xl border border-border/70 bg-card/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{pack.title}</h3>
                    <p className="text-xs text-muted-foreground">{pack.slug}</p>
                  </div>
                  <span className="rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                    {pack.defaultLocale}
                  </span>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">{pack.summary ?? t("empty.noSummary")}</p>

                <button
                  type="button"
                  onClick={() => openImportModal(pack)}
                  disabled={!accessToken}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {t("actions.configureImport")}
                </button>

                {messageByPack[pack.id] ? (
                  <p className="mt-2 text-xs text-muted-foreground">{messageByPack[pack.id]}</p>
                ) : null}
              </article>
            ))}

            {!publicLoading && sortedPublicPacks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                {t("empty.noPublicPacks")}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {importModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("import.modalEyebrow")}</p>
                <h3 className="mt-1 text-xl font-semibold text-foreground">{importModal.pack.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {importModal.detail?.selectedLocalization?.summary ?? importModal.pack.summary ?? t("empty.noSummary")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModal(null)}
                className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm text-muted-foreground">
                {t("import.destinationTeam")}
                <input
                  value={importModal.destinationTeamId}
                  onChange={(event) =>
                    setImportModal((current) => current ? { ...current, destinationTeamId: event.target.value } : current)
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="text-sm text-muted-foreground">
                {t("import.selector")}
                <input
                  value={importModal.selector}
                  onChange={(event) =>
                    setImportModal((current) => current ? { ...current, selector: event.target.value } : current)
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="text-sm text-muted-foreground">
                {t("import.locale")}
                <select
                  value={importModal.locale}
                  onChange={(event) =>
                    setImportModal((current) => current ? { ...current, locale: event.target.value } : current)
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {(importModal.detail?.localizations ?? []).map((entry) => (
                    <option key={entry.locale} value={entry.locale}>{entry.locale}</option>
                  ))}
                  {importModal.detail?.localizations?.length ? null : <option value={locale}>{locale}</option>}
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => loadImportDetail(importModal.pack, importModal.selector, importModal.locale, importModal.placeholderInputs)}
                disabled={importModal.loading}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
              >
                <RefreshCcw className={`h-4 w-4 ${importModal.loading ? "animate-spin" : ""}`} />
                {t("actions.reloadVersion")}
              </button>
              {importModal.detail?.version ? (
                <span className="text-xs text-muted-foreground">
                  {t("import.loadedVersion", { version: importModal.detail.version.version })}
                </span>
              ) : null}
            </div>

            {importModal.error ? (
              <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {importModal.error}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                <p className="text-sm font-semibold text-foreground">{t("import.requiredTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("import.requiredDescription")}</p>
                <div className="mt-3 space-y-3">
                  {importRequiredPlaceholders.length > 0 ? (
                    importRequiredPlaceholders.map((placeholder) => (
                      <PlaceholderField
                        key={placeholder.placeholderKey}
                        placeholder={placeholder}
                        value={importModal.placeholderInputs[placeholder.placeholderKey] ?? ""}
                        onChange={(value) =>
                          setImportModal((current) => current ? {
                            ...current,
                            placeholderInputs: {
                              ...current.placeholderInputs,
                              [placeholder.placeholderKey]: value,
                            },
                          } : current)
                        }
                        t={t}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("import.noRequired")}</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                <p className="text-sm font-semibold text-foreground">{t("import.optionalTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("import.optionalDescription")}</p>
                <div className="mt-3 space-y-3">
                  {importOptionalPlaceholders.length > 0 ? (
                    importOptionalPlaceholders.map((placeholder) => (
                      <PlaceholderField
                        key={placeholder.placeholderKey}
                        placeholder={placeholder}
                        value={importModal.placeholderInputs[placeholder.placeholderKey] ?? ""}
                        onChange={(value) =>
                          setImportModal((current) => current ? {
                            ...current,
                            placeholderInputs: {
                              ...current.placeholderInputs,
                              [placeholder.placeholderKey]: value,
                            },
                          } : current)
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

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <div className="text-xs text-muted-foreground">
                {t("import.placeholderCount", { count: importModal.detail?.placeholders?.length ?? 0 })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportModal(null)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={importModal.loading || importModal.submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
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
