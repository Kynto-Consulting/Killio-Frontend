"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpDown, RefreshCcw, Search, SearchX, Store, Upload, X } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { useTenant } from "@/components/providers/tenant-provider";
import { FOCUS_RING, SOFT_PRIMARY, SOFT_SECONDARY, MemphisIllustration, PackCard, PackCardSkeleton, useCategoryLabel } from "@/components/marketplace/pack-ui";
import { formatPackPrice, newIdempotencyKey, nextHubAction, parsePurchaseReturn } from "@/lib/marketplace/pricing";
import { categoriesFromPacks, coverBgVar, coverFamily, filterPacks, parseInstallParam, SORT_MODES, sortPacks, type SortMode } from "@/lib/marketplace/presentation";
import {
  getMarketplacePackDetail,
  importMarketplacePack,
  checkoutHubPack,
  getHubPackDetail,
  getHubStatus,
  importHubPack,
  listHubPacks,
  listHubPurchases,
  startHubConnect,
  listPublicMarketplacePacks,
  MarketplacePack,
  MarketplacePackDetail,
  MarketplacePlaceholder,
} from "@/lib/api/marketplace";

/* ── types ── */
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

/* ── helpers ── */
function namespaceLabel(p: MarketplacePlaceholder): string {
  const ns = p.validation?.namespace;
  return typeof ns === "string" && ns.trim() ? ns.trim() : "general";
}
function leafLabel(p: MarketplacePlaceholder): string {
  const lk = p.validation?.leafKey;
  return typeof lk === "string" && lk.trim() ? lk.trim() : p.placeholderKey;
}
function seedInputs(placeholders: MarketplacePlaceholder[], current: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of placeholders) {
    const def = p.defaultValue;
    out[p.placeholderKey] = current[p.placeholderKey] ?? (def == null ? "" : typeof def === "object" ? JSON.stringify(def, null, 2) : String(def));
  }
  return out;
}
function sortPlaceholders(placeholders: MarketplacePlaceholder[]): MarketplacePlaceholder[] {
  return [...placeholders].sort((a, b) => {
    const rw = Number(b.isRequired) - Number(a.isRequired);
    if (rw !== 0) return rw;
    const nc = namespaceLabel(a).localeCompare(namespaceLabel(b));
    if (nc !== 0) return nc;
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    return leafLabel(a).localeCompare(leafLabel(b));
  });
}
function serializeValue(p: MarketplacePlaceholder, raw: string): unknown {
  if (raw === "") return undefined;
  switch (p.valueType) {
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Invalid number for ${p.placeholderKey}`);
      return n;
    }
    case "boolean":
      if (raw !== "true" && raw !== "false") throw new Error(`Invalid boolean for ${p.placeholderKey}`);
      return raw === "true";
    case "json":
      return JSON.parse(raw);
    default:
      return raw;
  }
}

/* ── placeholder field ── */
function PlaceholderField({
  placeholder, value, onChange, t,
}: {
  placeholder: MarketplacePlaceholder;
  value: string;
  onChange: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const label = leafLabel(placeholder);
  const ns = namespaceLabel(placeholder);
  const syntax = typeof placeholder.validation?.placeholderSyntax === "string" ? placeholder.validation.placeholderSyntax : placeholder.placeholderKey;
  const base = "mt-1.5 w-full rounded-lg border border-foreground/10 dark:border-white/10 bg-foreground/5 px-3 py-2 text-sm text-foreground dark:text-white outline-none transition-colors focus:border-[hsl(var(--accent-ink))]/40";

  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-foreground dark:text-white">{label}</span>
      <span className="rounded-full border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/40 dark:text-white/40">{ns}</span>
    </div>
  );

  if (placeholder.valueType === "boolean") {
    return (
      <div className="rounded-xl border border-foreground/8 dark:border-white/8 bg-foreground/5 p-3">
        {header}
        <p className="mt-1 text-xs text-foreground/40 dark:text-white/40">{placeholder.description || syntax}</p>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">{t("import.useDefault")}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
    );
  }
  if (placeholder.valueType === "json") {
    return (
      <div className="rounded-xl border border-foreground/8 dark:border-white/8 bg-foreground/5 p-3">
        {header}
        <p className="mt-1 text-xs text-foreground/40 dark:text-white/40">{placeholder.description || syntax}</p>
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`${base} font-mono text-xs`} placeholder={t("import.jsonPlaceholder")} />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-foreground/8 dark:border-white/8 bg-foreground/5 p-3">
      {header}
      <p className="mt-1 text-xs text-foreground/40 dark:text-white/40">{placeholder.description || syntax}</p>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={base} placeholder={placeholder.isRequired ? t("import.requiredPlaceholder") : t("import.optionalPlaceholder")} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
const PRIMARY_BTN = `${SOFT_PRIMARY} h-10 px-4 text-[13px]`;
const SECONDARY_BTN = `${SOFT_SECONDARY} h-9 px-3 text-[13px]`;

export function MarketplacePageView({ compact = false }: { compact?: boolean } = {}) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const categoryLabel = useCategoryLabel();
  const { accessToken, activeTeamId } = useSession();
  // In a tenant workspace the marketplace is the killio.dev hub: browse, buy and download only.
  const isTenant = useTenant().mode === "tenant";
  const [hubConnected, setHubConnected] = useState<boolean | null>(null);
  const [hubPurchases, setHubPurchases] = useState<Record<string, "free" | "paid">>({});
  const [hubBusy, setHubBusy] = useState(false);
  const [purchaseReturn, setPurchaseReturn] = useState<ReturnType<typeof parsePurchaseReturn>>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publicPacks, setPublicPacks] = useState<MarketplacePack[]>([]);
  const [importModal, setImportModal] = useState<ImportModalState | null>(null);
  const [messageByPack, setMessageByPack] = useState<Record<string, string | null>>({});

  // Search and categories filter on the client (instant results, tags included), so the full list is fetched once.
  // The API functions also accept `category`, ready for when the catalog is too big to load in one go.
  const loadPublicPacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { locale, limit: 60 };
      const items = isTenant ? await listHubPacks(params) : await listPublicMarketplacePacks(params);
      setPublicPacks(items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.loadPublic"));
    } finally {
      setLoading(false);
    }
  }, [isTenant, locale, t]);

  useEffect(() => { loadPublicPacks().catch(() => undefined); }, [loadPublicPacks]);

  const refreshHub = useCallback(async () => {
    if (!isTenant || !accessToken) return;
    try {
      const { connected } = await getHubStatus(accessToken);
      setHubConnected(connected);
      if (connected) {
        const purchases = await listHubPurchases(accessToken);
        setHubPurchases(Object.fromEntries(purchases.map((p) => [p.packId, p.status === "paid" ? "paid" : "free"])));
      }
    } catch {
      setHubConnected(false);
    }
  }, [accessToken, isTenant]);

  useEffect(() => { refreshHub().catch(() => undefined); }, [refreshHub]);

  // Back from the payment page (tenant -> killio.dev -> MercadoPago -> killio.dev -> here): show the result and, while the
  // payment is still "pending" (the provider notification can lag), keep refreshing the purchases for a short while.
  useEffect(() => {
    if (!isTenant || typeof window === "undefined") return;
    const parsed = parsePurchaseReturn(window.location.search);
    if (!parsed) return;
    setPurchaseReturn(parsed);
    window.history.replaceState(null, "", window.location.pathname);
  }, [isTenant]);

  useEffect(() => {
    if (!purchaseReturn || purchaseReturn.status !== "pending") return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      refreshHub().catch(() => undefined);
      if (attempts >= 10) window.clearInterval(timer);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [purchaseReturn, refreshHub]);

  const connectHub = useCallback(async () => {
    if (!accessToken) return;
    setHubBusy(true);
    try {
      const { authorizationUrl } = await startHubConnect(accessToken);
      window.location.href = authorizationUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.import"));
      setHubBusy(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    if (!importModal || !activeTeamId || importModal.destinationTeamId) return;
    setImportModal((cur) => cur ? { ...cur, destinationTeamId: activeTeamId } : cur);
  }, [activeTeamId, importModal]);

  const loadImportDetail = useCallback(async (
    pack: MarketplacePack, selector: string, reqLocale: string, currentInputs: Record<string, string> = {},
  ) => {
    setImportModal((cur) => cur ? { ...cur, loading: true, error: null } : cur);
    try {
      const detailInput = { selector: selector || undefined, locale: reqLocale || undefined };
      const detail = isTenant && accessToken
        ? await getHubPackDetail(pack.id, detailInput, accessToken)
        : await getMarketplacePackDetail(pack.id, detailInput, accessToken || undefined);
      const placeholders = sortPlaceholders(detail.placeholders ?? []);
      setImportModal((cur) => {
        if (!cur || cur.pack.id !== pack.id) return cur;
        return { ...cur, detail: { ...detail, placeholders }, loading: false, locale: detail.selectedLocalization?.locale ?? reqLocale ?? locale, placeholderInputs: seedInputs(placeholders, currentInputs) };
      });
    } catch (e) {
      setImportModal((cur) => cur ? { ...cur, loading: false, error: e instanceof Error ? e.message : t("errors.loadPackDetail") } : cur);
    }
  }, [accessToken, isTenant, locale, t]);

  const openImportModal = useCallback((pack: MarketplacePack) => {
    const dst = activeTeamId ?? "";
    setImportModal({ pack, detail: null, loading: true, submitting: false, selector: "", destinationTeamId: dst, locale, placeholderInputs: {}, error: null });
    loadImportDetail(pack, "", locale, {}).catch(() => undefined);
  }, [activeTeamId, loadImportDetail, locale]);

  const handleImportSubmit = useCallback(async () => {
    if (!importModal || !accessToken) return;
    if (!importModal.destinationTeamId) {
      setImportModal((cur) => cur ? { ...cur, error: t("errors.noWorkspace") } : cur);
      return;
    }
    const placeholders = importModal.detail?.placeholders ?? [];
    const values: Record<string, unknown> = {};
    try {
      for (const p of placeholders) {
        const raw = importModal.placeholderInputs[p.placeholderKey] ?? "";
        const s = serializeValue(p, raw);
        if (s !== undefined) values[p.placeholderKey] = s;
      }
    } catch (e) {
      setImportModal((cur) => cur ? { ...cur, error: e instanceof Error ? e.message : t("errors.import") } : cur);
      return;
    }
    setImportModal((cur) => cur ? { ...cur, submitting: true, error: null } : cur);
    try {
      const importInput = { destinationTeamId: importModal.destinationTeamId, selector: importModal.selector || undefined, locale: importModal.locale || undefined, placeholderValues: values };
      let result;
      if (isTenant) {
        const packId = importModal.pack.id;
        const action = nextHubAction({ connected: hubConnected === true, purchaseStatus: hubPurchases[packId] ?? null });
        if (action === "connect") {
          await connectHub();
          return;
        }
        if (action === "checkout") {
          // The key makes a retry of this same click safe: the hub never opens a second purchase or charge.
          const bought = await checkoutHubPack(packId, accessToken, newIdempotencyKey(packId));
          if (bought.checkoutUrl && bought.purchase.status === "pending") {
            window.location.href = bought.checkoutUrl;
            return;
          }
          setHubPurchases((cur) => ({ ...cur, [packId]: bought.purchase.status === "paid" ? "paid" : "free" }));
        }
        result = await importHubPack(packId, importInput, accessToken);
      } else {
        result = await importMarketplacePack(importModal.pack.id, importInput, accessToken);
      }
      setMessageByPack((prev) => ({ ...prev, [importModal.pack.id]: t("feedback.importOk", { count: Object.keys(result.entityIdMap ?? {}).length }) }));
      setImportModal(null);
    } catch (e) {
      setImportModal((cur) => cur ? { ...cur, submitting: false, error: e instanceof Error ? e.message : t("errors.import") } : cur);
    }
  }, [accessToken, connectHub, hubConnected, hubPurchases, importModal, isTenant, t]);

  const hubButtonLabel = (pack: MarketplacePack) => {
    const action = nextHubAction({ connected: hubConnected === true, purchaseStatus: hubPurchases[pack.id] ?? null });
    if (action === "connect") return t("hub.connect");
    if (action === "import") return t("hub.import");
    const price = formatPackPrice(pack, locale);
    if (price.kind === "subscription") return t("hub.subscription", { price: price.label });
    return price.kind === "paid" ? t("hub.buy", { price: price.label }) : t("hub.getFree");
  };


  // `/marketplace?install=<packId>` (from the detail page or a shared link) opens that pack's install modal once.
  const installHandled = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !accessToken) return;
    const packId = parseInstallParam(window.location.search);
    if (!packId || installHandled.current === packId) return;
    installHandled.current = packId;
    const params = new URLSearchParams(window.location.search);
    params.delete("install");
    const rest = params.toString();
    window.history.replaceState(null, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    (async () => {
      try {
        const input = { locale };
        const detail = isTenant ? await getHubPackDetail(packId, input, accessToken) : await getMarketplacePackDetail(packId, input, accessToken);
        openImportModal(detail.pack);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errors.loadPackDetail"));
      }
    })();
  }, [accessToken, isTenant, locale, openImportModal, t]);

  const categories = useMemo(() => categoriesFromPacks(publicPacks), [publicPacks]);
  const visible = useMemo(() => sortPacks(filterPacks(publicPacks, { category, query }), sort), [publicPacks, category, query, sort]);
  const filtersActive = category !== "all" || query.trim() !== "";
  const clearFilters = () => { setCategory("all"); setQuery(""); };
  const required = useMemo(() => (importModal?.detail?.placeholders ?? []).filter((p) => p.isRequired), [importModal]);
  const optional = useMemo(() => (importModal?.detail?.placeholders ?? []).filter((p) => !p.isRequired), [importModal]);
  const chipBase = `inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        {/* ── COMPACT HEADER: one row on desktop, sticky search on mobile ── */}
        <header className="sticky top-0 z-20 -mx-4 border-b border-border/60 bg-background px-4 py-3 sm:static sm:mx-0 sm:border-b-0 sm:px-0 sm:pb-2 sm:pt-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <div className="min-w-0 sm:mr-2">
              <h1 className="text-2xl font-black leading-none tracking-tight text-foreground">{t("title")}</h1>
              <p className="mt-1 hidden text-[13px] text-foreground/70 sm:block">{t("gallery.tagline")}</p>
            </div>
            <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-72 lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/60" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("publicPacks.search")}
                placeholder={t("gallery.searchPlaceholder")}
                className={`w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/55 ${FOCUS_RING}`}
              />
            </div>
            <label className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-foreground/70 sm:ml-0">
              <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t("gallery.sort.label")}</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className={`rounded-xl border border-border bg-background px-2 py-1.5 text-[13px] font-bold text-foreground ${FOCUS_RING}`}
              >
                {SORT_MODES.map((mode) => <option key={mode} value={mode}>{t(`gallery.sort.${mode}`)}</option>)}
              </select>
            </label>
            {!isTenant ? (
              <Link href="/marketplace/profile" className={SECONDARY_BTN} aria-label={t("gallery.sellerProfile")} title={t("gallery.sellerProfile")}>
                <Store className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("gallery.sellerProfile")}</span>
              </Link>
            ) : null}
          </div>
        </header>

        {/* ── CATEGORY CHIPS (horizontal scroll on mobile) ── */}
        <div role="group" aria-label={t("publicPacks.categories")} className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-3 pt-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
            className={`${chipBase} ${category === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent"}`}
          >
            {t("gallery.all")}
          </button>
          {categories.map((c) => {
            const active = category === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(active ? "all" : c.slug)}
                className={`${chipBase} ${active ? "border-primary bg-primary/10" : "bg-background text-foreground hover:bg-accent"}`}
                style={active ? { background: coverBgVar(coverFamily(c.slug)), color: "var(--cover-ink)" } : undefined}
              >
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-border" style={{ background: coverBgVar(coverFamily(c.slug)) }} />
                {categoryLabel(c.slug)}
                <span className="text-[11px] font-semibold opacity-70">{c.count}</span>
              </button>
            );
          })}
        </div>

        {/* ── NOTICES ── */}
        {purchaseReturn ? (
          <div role="status" className={`mt-3 rounded-xl border px-4 py-3 text-sm font-medium ${purchaseReturn.status === "failed" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "border-border bg-[var(--cover-badge-free)] text-[var(--cover-ink)]"}`}>
            {t(`hub.return.${purchaseReturn.status}`)}
          </div>
        ) : null}

        {isTenant && hubConnected === false ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-[var(--cover-badge-paid)] px-4 py-3 text-sm text-[var(--cover-ink)]">
            <div>
              <p className="font-extrabold">{t("hub.connectTitle")}</p>
              <p className="text-xs font-medium">{t("hub.connectBody")}</p>
            </div>
            <button type="button" disabled={hubBusy} onClick={() => connectHub().catch(() => undefined)} className={PRIMARY_BTN}>
              {hubBusy ? t("hub.connecting") : t("hub.connect")}
            </button>
          </div>
        ) : null}

        {/* ── RESULTS ── */}
        <section className="mt-2" aria-busy={loading}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p aria-live="polite" className="text-[13px] font-semibold text-foreground/70">
              {loading ? t("status.loading") : t("gallery.results", { count: visible.length })}
            </p>
            <div className="flex items-center gap-2">
              {filtersActive && !loading ? (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[12px] font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("gallery.clearFilters")}
                </button>
              ) : null}
              <button type="button" onClick={() => loadPublicPacks().catch(() => undefined)} aria-label={t("actions.refresh")} className={SECONDARY_BTN}>
                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
                <span className="hidden sm:inline">{t("actions.refresh")}</span>
              </button>
            </div>
          </div>

          {error ? (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{error}</span>
              <button type="button" onClick={() => loadPublicPacks().catch(() => undefined)} className={SECONDARY_BTN}>{t("gallery.retry")}</button>
            </div>
          ) : null}

          {loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: compact ? 3 : 8 }).map((_, i) => <PackCardSkeleton key={i} />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <MemphisIllustration className="h-24 w-40" />
              <p className="mt-4 text-lg font-black text-foreground">{filtersActive ? t("gallery.noResults") : t("empty.noPublicPacks")}</p>
              <p className="mt-1 max-w-sm text-sm text-foreground/70">{filtersActive ? t("gallery.noResultsHint") : t("publicPacks.checkBack")}</p>
              {filtersActive ? (
                <button type="button" onClick={clearFilters} className={`${PRIMARY_BTN} mt-5`}>
                  <SearchX className="h-4 w-4" aria-hidden="true" />
                  {t("gallery.clearFilters")}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  footer={
                    <>
                      {messageByPack[pack.id] ? (
                        <p role="status" className="mb-2 rounded-lg border border-border bg-[var(--cover-badge-free)] px-3 py-1.5 text-xs font-bold text-[var(--cover-ink)]">{messageByPack[pack.id]}</p>
                      ) : null}
                      <button type="button" onClick={() => openImportModal(pack)} disabled={!accessToken} aria-label={t("gallery.installAria", { title: pack.title })} className={`${PRIMARY_BTN} w-full`}>
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        {isTenant ? hubButtonLabel(pack) : t("actions.configureImport")}
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ══ IMPORT MODAL ══ */}
      {importModal ? (
        <div
          className="fixed inset-0 z-[180] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setImportModal(null); }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-foreground/12 dark:border-white/12 bg-background shadow-2xl">
            {/* modal header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-foreground/8 dark:border-white/8 bg-background px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/30 dark:text-white/30">{t("import.modalEyebrow")}</p>
                <h3 className="mt-1.5 text-xl font-extrabold tracking-tight text-foreground dark:text-white">{importModal.pack.title}</h3>
                <p className="mt-1 text-sm text-foreground/45 dark:text-white/45">
                  {importModal.detail?.selectedLocalization?.summary ?? importModal.pack.summary ?? t("empty.noSummary")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModal(null)}
                className="shrink-0 rounded-xl border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 p-2 text-foreground/40 dark:text-white/40 transition-colors hover:border-foreground/20 dark:hover:border-white/20 hover:text-foreground dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* modal body */}
            <div className="px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-foreground/35 dark:text-white/35">{t("import.destinationTeam")}</label>
                  <input
                    value={importModal.destinationTeamId}
                    onChange={(e) => setImportModal((cur) => cur ? { ...cur, destinationTeamId: e.target.value } : cur)}
                    className="mt-1.5 w-full rounded-xl border border-foreground/10 dark:border-white/10 bg-foreground/5 px-3 py-2 text-sm text-foreground dark:text-white outline-none focus:border-[hsl(var(--accent-ink))]/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-foreground/35 dark:text-white/35">{t("import.selector")}</label>
                  <input
                    value={importModal.selector}
                    onChange={(e) => setImportModal((cur) => cur ? { ...cur, selector: e.target.value } : cur)}
                    className="mt-1.5 w-full rounded-xl border border-foreground/10 dark:border-white/10 bg-foreground/5 px-3 py-2 text-sm text-foreground dark:text-white outline-none focus:border-[hsl(var(--accent-ink))]/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-foreground/35 dark:text-white/35">{t("import.locale")}</label>
                  <select
                    value={importModal.locale}
                    onChange={(e) => setImportModal((cur) => cur ? { ...cur, locale: e.target.value } : cur)}
                    className="mt-1.5 w-full rounded-xl border border-foreground/10 dark:border-white/10 bg-foreground/5 px-3 py-2 text-sm text-foreground dark:text-white outline-none focus:border-[hsl(var(--accent-ink))]/40"
                  >
                    {(importModal.detail?.localizations ?? []).map((l) => <option key={l.locale} value={l.locale}>{l.locale}</option>)}
                    {importModal.detail?.localizations?.length ? null : <option value={locale}>{locale}</option>}
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadImportDetail(importModal.pack, importModal.selector, importModal.locale, importModal.placeholderInputs)}
                  disabled={importModal.loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-3 py-2 text-sm text-foreground/70 dark:text-white/70 transition-colors hover:border-foreground/20 dark:hover:border-white/20 hover:text-foreground dark:hover:text-white disabled:opacity-40"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${importModal.loading ? "animate-spin" : ""}`} />
                  {t("actions.reloadVersion")}
                </button>
                {importModal.detail?.version ? (
                  <span className="rounded-lg border border-foreground/8 dark:border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs text-foreground/35 dark:text-white/35">
                    {t("import.loadedVersion", { version: importModal.detail.version.version })}
                  </span>
                ) : null}
              </div>

              {importModal.error ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {importModal.error}
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {/* required */}
                <div className="rounded-xl border border-foreground/8 dark:border-white/8 bg-foreground/5 p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    <p className="text-[13px] font-bold text-foreground dark:text-white">{t("import.requiredTitle")}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-foreground/35 dark:text-white/35">{t("import.requiredDescription")}</p>
                  <div className="mt-3 space-y-2">
                    {required.length > 0 ? (
                      required.map((p) => (
                        <PlaceholderField key={p.placeholderKey} placeholder={p} value={importModal.placeholderInputs[p.placeholderKey] ?? ""} onChange={(v) => setImportModal((cur) => cur ? { ...cur, placeholderInputs: { ...cur.placeholderInputs, [p.placeholderKey]: v } } : cur)} t={t} />
                      ))
                    ) : (
                      <p className="text-sm text-foreground/30 dark:text-white/30">{t("import.noRequired")}</p>
                    )}
                  </div>
                </div>
                {/* optional */}
                <div className="rounded-xl border border-foreground/8 dark:border-white/8 bg-foreground/5 p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/20 dark:bg-white/20" />
                    <p className="text-[13px] font-bold text-foreground dark:text-white">{t("import.optionalTitle")}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-foreground/35 dark:text-white/35">{t("import.optionalDescription")}</p>
                  <div className="mt-3 space-y-2">
                    {optional.length > 0 ? (
                      optional.map((p) => (
                        <PlaceholderField key={p.placeholderKey} placeholder={p} value={importModal.placeholderInputs[p.placeholderKey] ?? ""} onChange={(v) => setImportModal((cur) => cur ? { ...cur, placeholderInputs: { ...cur.placeholderInputs, [p.placeholderKey]: v } } : cur)} t={t} />
                      ))
                    ) : (
                      <p className="text-sm text-foreground/30 dark:text-white/30">{t("import.noOptional")}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* modal footer */}
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-foreground/8 dark:border-white/8 bg-background px-6 py-4">
              <span className="rounded-full border border-foreground/10 dark:border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-foreground/35 dark:text-white/35">
                {t("import.placeholderCount", { count: importModal.detail?.placeholders?.length ?? 0 })}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setImportModal(null)} className="rounded-xl border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-4 py-2 text-sm font-semibold text-foreground/60 dark:text-white/60 transition-colors hover:border-foreground/20 dark:hover:border-white/20 hover:text-foreground dark:hover:text-white">
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={importModal.loading || importModal.submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--accent-ink))] px-5 py-2 text-sm font-bold text-[hsl(var(--accent-ink-fg))] shadow-sm transition-all hover:bg-[#c8ef60] disabled:opacity-40"
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
