"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Upload, Globe, Lock, Link2, PlusCircle, RefreshCcw } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import {
  createMarketplacePack,
  createMarketplaceSnapshot,
  importMarketplacePack,
  listPublicMarketplacePacks,
  listTeamMarketplacePacks,
  MarketplacePack,
  MarketplacePublishMode,
  MarketplaceSnapshotInput,
  updateMarketplacePublishMode,
} from "@/lib/api/marketplace";

const DEFAULT_ASSETS_JSON = `[
  {
    "assetType": "document",
    "sourceEntityId": "doc-id",
    "logicalKey": "main-doc"
  }
]`;

const DEFAULT_PLACEHOLDERS_JSON = `[]`;

type SnapshotDraft = {
  version: string;
  status: "draft" | "published" | "archived";
  locale: string;
  title: string;
  assetsJson: string;
  placeholdersJson: string;
};

type ImportDraft = {
  destinationTeamId: string;
  selector: string;
  locale: string;
  placeholdersJson: string;
};

function parseJsonArray<T>(raw: string, label: string): T[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be an array`);
  }
  return parsed as T[];
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be an object`);
  }
  return parsed as Record<string, unknown>;
}

function modeIcon(mode: MarketplacePublishMode) {
  if (mode === "public") return <Globe className="h-3.5 w-3.5" />;
  if (mode === "link") return <Link2 className="h-3.5 w-3.5" />;
  return <Lock className="h-3.5 w-3.5" />;
}

export function MarketplacePageView({ compact = false }: { compact?: boolean } = {}) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const { accessToken, activeTeamId } = useSession();

  const [query, setQuery] = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [publicPacks, setPublicPacks] = useState<MarketplacePack[]>([]);
  const [teamPacks, setTeamPacks] = useState<MarketplacePack[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [creatingPack, setCreatingPack] = useState(false);
  const [createPackForm, setCreatePackForm] = useState({
    slug: "",
    title: "",
    summary: "",
    publishMode: "private" as MarketplacePublishMode,
  });

  const [snapshotDraftByPack, setSnapshotDraftByPack] = useState<Record<string, SnapshotDraft>>({});
  const [importDraftByPack, setImportDraftByPack] = useState<Record<string, ImportDraft>>({});
  const [busyByPack, setBusyByPack] = useState<Record<string, string | null>>({});
  const [messageByPack, setMessageByPack] = useState<Record<string, string | null>>({});

  const cardsGridClass = compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2";

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

  const ensureImportDraft = useCallback((pack: MarketplacePack): ImportDraft => {
    return (
      importDraftByPack[pack.id] ?? {
        destinationTeamId: activeTeamId ?? "",
        selector: "",
        locale,
        placeholdersJson: "{}",
      }
    );
  }, [activeTeamId, importDraftByPack, locale]);

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

  useEffect(() => {
    loadPublicPacks().catch(() => undefined);
  }, [loadPublicPacks]);

  useEffect(() => {
    loadTeamPacks().catch(() => undefined);
  }, [loadTeamPacks]);

  useEffect(() => {
    if (!activeTeamId) return;
    setImportDraftByPack((prev) => {
      const next = { ...prev };
      for (const [packId, draft] of Object.entries(next)) {
        if (!draft.destinationTeamId) {
          next[packId] = { ...draft, destinationTeamId: activeTeamId };
        }
      }
      return next;
    });
  }, [activeTeamId]);

  const sortedPublicPacks = useMemo(
    () => [...publicPacks].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    [publicPacks],
  );

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
      const assets = parseJsonArray<MarketplaceSnapshotInput["assets"][number]>(
        draft.assetsJson,
        "assetsJson",
      );
      const placeholders = parseJsonArray<NonNullable<MarketplaceSnapshotInput["placeholders"]>[number]>(
        draft.placeholdersJson,
        "placeholdersJson",
      );

      await createMarketplaceSnapshot(
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

      setMessageByPack((prev) => ({ ...prev, [pack.id]: t("feedback.snapshotOk") }));
      await loadTeamPacks();
    } catch (snapshotError) {
      setMessageByPack((prev) => ({
        ...prev,
        [pack.id]: snapshotError instanceof Error ? snapshotError.message : t("errors.snapshot"),
      }));
    } finally {
      setBusyByPack((prev) => ({ ...prev, [pack.id]: null }));
    }
  }, [accessToken, ensureSnapshotDraft, loadTeamPacks, t]);

  const handleImport = useCallback(async (pack: MarketplacePack) => {
    if (!accessToken) return;

    const draft = ensureImportDraft(pack);
    if (!draft.destinationTeamId) {
      setMessageByPack((prev) => ({ ...prev, [pack.id]: t("errors.noWorkspace") }));
      return;
    }

    setBusyByPack((prev) => ({ ...prev, [pack.id]: "import" }));
    setMessageByPack((prev) => ({ ...prev, [pack.id]: null }));

    try {
      const placeholderValues = parseJsonObject(draft.placeholdersJson, "placeholdersJson");
      const result = await importMarketplacePack(
        pack.id,
        {
          destinationTeamId: draft.destinationTeamId,
          selector: draft.selector || undefined,
          locale: draft.locale || undefined,
          placeholderValues,
        },
        accessToken,
      );

      const mappedCount = Object.keys(result.entityIdMap ?? {}).length;
      setMessageByPack((prev) => ({
        ...prev,
        [pack.id]: t("feedback.importOk", { count: mappedCount }),
      }));
    } catch (importError) {
      setMessageByPack((prev) => ({
        ...prev,
        [pack.id]: importError instanceof Error ? importError.message : t("errors.import"),
      }));
    } finally {
      setBusyByPack((prev) => ({ ...prev, [pack.id]: null }));
    }
  }, [accessToken, ensureImportDraft, t]);

  return (
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
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <RefreshCcw className={`h-4 w-4 ${publicLoading || teamLoading ? "animate-spin" : ""}`} />
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
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 focus:border-accent"
              placeholder="ops-automation-kit"
            />
          </label>

          <label className="text-sm text-muted-foreground">
            {t("fields.title")}
            <input
              value={createPackForm.title}
              onChange={(event) => setCreatePackForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 focus:border-accent"
              placeholder={t("fields.titlePlaceholder")}
            />
          </label>

          <label className="text-sm text-muted-foreground md:col-span-2">
            {t("fields.summary")}
            <textarea
              value={createPackForm.summary}
              onChange={(event) => setCreatePackForm((prev) => ({ ...prev, summary: event.target.value }))}
              className="mt-1 h-20 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 focus:border-accent"
              placeholder={t("fields.summaryPlaceholder")}
            />
          </label>

          <label className="text-sm text-muted-foreground">
            {t("fields.publishMode")}
            <select
              value={createPackForm.publishMode}
              onChange={(event) =>
                setCreatePackForm((prev) => ({
                  ...prev,
                  publishMode: event.target.value as MarketplacePublishMode,
                }))
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-0 focus:border-accent"
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
          <span className="text-xs text-muted-foreground">{teamLoading ? t("status.loading") : t("myPacks.count", { count: teamPacks.length })}</span>
        </div>

        <div className={`grid gap-4 ${cardsGridClass}`}>
          {teamPacks.map((pack) => {
            const snapshotDraft = ensureSnapshotDraft(pack);
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
                          [pack.id]: {
                            ...snapshotDraft,
                            status: event.target.value as SnapshotDraft["status"],
                          },
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

                    <textarea
                      value={snapshotDraft.assetsJson}
                      onChange={(event) =>
                        setSnapshotDraftByPack((prev) => ({
                          ...prev,
                          [pack.id]: { ...snapshotDraft, assetsJson: event.target.value },
                        }))
                      }
                      className="md:col-span-2 h-28 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
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
          {sortedPublicPacks.map((pack) => {
            const importDraft = ensureImportDraft(pack);
            const busyAction = busyByPack[pack.id];

            return (
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

                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  <input
                    value={importDraft.destinationTeamId}
                    onChange={(event) =>
                      setImportDraftByPack((prev) => ({
                        ...prev,
                        [pack.id]: { ...importDraft, destinationTeamId: event.target.value },
                      }))
                    }
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    placeholder={t("import.destinationTeam")}
                  />

                  <input
                    value={importDraft.selector}
                    onChange={(event) =>
                      setImportDraftByPack((prev) => ({
                        ...prev,
                        [pack.id]: { ...importDraft, selector: event.target.value },
                      }))
                    }
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    placeholder={t("import.selector")}
                  />

                  <select
                    value={importDraft.locale}
                    onChange={(event) =>
                      setImportDraftByPack((prev) => ({
                        ...prev,
                        [pack.id]: { ...importDraft, locale: event.target.value },
                      }))
                    }
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="en">en</option>
                    <option value="es">es</option>
                  </select>

                  <textarea
                    value={importDraft.placeholdersJson}
                    onChange={(event) =>
                      setImportDraftByPack((prev) => ({
                        ...prev,
                        [pack.id]: { ...importDraft, placeholdersJson: event.target.value },
                      }))
                    }
                    className="md:col-span-2 h-20 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleImport(pack)}
                  disabled={busyAction === "import" || !accessToken}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {busyAction === "import" ? t("actions.importing") : t("actions.import")}
                </button>

                {messageByPack[pack.id] ? (
                  <p className="mt-2 text-xs text-muted-foreground">{messageByPack[pack.id]}</p>
                ) : null}
              </article>
            );
          })}

          {!publicLoading && sortedPublicPacks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              {t("empty.noPublicPacks")}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default MarketplacePageView;
