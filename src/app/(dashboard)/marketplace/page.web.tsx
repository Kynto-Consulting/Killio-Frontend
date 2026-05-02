"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Globe,
  Layout,
  Link2,
  Lock,
  RefreshCcw,
  Search,
  Sparkles,
  Upload,
  X,
  Zap,
  FileText,
  GitBranch,
  Download,
} from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import {
  getMarketplacePackDetail,
  importMarketplacePack,
  listPublicMarketplacePacks,
  MarketplacePack,
  MarketplacePackDetail,
  MarketplacePlaceholder,
  MarketplacePublishMode,
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

/* ── category data ── */
const CATEGORIES = [
  { id: "document", label: "Documents", sub: "Guides, specs, docs", icon: FileText, color: "#818cf8" },
  { id: "mesh",     label: "Meshes",    sub: "3D models & assets", icon: GitBranch, color: "#22d3ee" },
  { id: "board",    label: "Kanban",    sub: "Boards & workflows",  icon: Layout,    color: "#f472b6" },
  { id: "script",   label: "Scripts",   sub: "Automations & tools", icon: Zap,       color: "#fbbf24" },
] as const;

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
  const base = "mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[#d8ff72]/40";

  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-white">{label}</span>
      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">{ns}</span>
    </div>
  );

  if (placeholder.valueType === "boolean") {
    return (
      <div className="rounded-xl border border-white/8 bg-black/20 p-3">
        {header}
        <p className="mt-1 text-xs text-white/40">{placeholder.description || syntax}</p>
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
      <div className="rounded-xl border border-white/8 bg-black/20 p-3">
        {header}
        <p className="mt-1 text-xs text-white/40">{placeholder.description || syntax}</p>
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`${base} font-mono text-xs`} placeholder={t("import.jsonPlaceholder")} />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
      {header}
      <p className="mt-1 text-xs text-white/40">{placeholder.description || syntax}</p>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={base} placeholder={placeholder.isRequired ? t("import.requiredPlaceholder") : t("import.optionalPlaceholder")} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export function MarketplacePageView({ compact = false }: { compact?: boolean } = {}) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const { accessToken, activeTeamId } = useSession();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicPacks, setPublicPacks] = useState<MarketplacePack[]>([]);
  const [importModal, setImportModal] = useState<ImportModalState | null>(null);
  const [messageByPack, setMessageByPack] = useState<Record<string, string | null>>({});

  const loadPublicPacks = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listPublicMarketplacePacks({ locale, query: query.trim() || undefined, limit: 60 });
      setPublicPacks(items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.loadPublic"));
    } finally {
      setLoading(false);
    }
  }, [locale, query, t]);

  useEffect(() => { loadPublicPacks().catch(() => undefined); }, [loadPublicPacks]);

  useEffect(() => {
    if (!importModal || !activeTeamId || importModal.destinationTeamId) return;
    setImportModal((cur) => cur ? { ...cur, destinationTeamId: activeTeamId } : cur);
  }, [activeTeamId, importModal]);

  const loadImportDetail = useCallback(async (
    pack: MarketplacePack, selector: string, reqLocale: string, currentInputs: Record<string, string> = {},
  ) => {
    setImportModal((cur) => cur ? { ...cur, loading: true, error: null } : cur);
    try {
      const detail = await getMarketplacePackDetail(pack.id, { selector: selector || undefined, locale: reqLocale || undefined }, accessToken || undefined);
      const placeholders = sortPlaceholders(detail.placeholders ?? []);
      setImportModal((cur) => {
        if (!cur || cur.pack.id !== pack.id) return cur;
        return { ...cur, detail: { ...detail, placeholders }, loading: false, locale: detail.selectedLocalization?.locale ?? reqLocale ?? locale, placeholderInputs: seedInputs(placeholders, currentInputs) };
      });
    } catch (e) {
      setImportModal((cur) => cur ? { ...cur, loading: false, error: e instanceof Error ? e.message : t("errors.loadPackDetail") } : cur);
    }
  }, [accessToken, locale, t]);

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
      const result = await importMarketplacePack(importModal.pack.id, { destinationTeamId: importModal.destinationTeamId, selector: importModal.selector || undefined, locale: importModal.locale || undefined, placeholderValues: values }, accessToken);
      setMessageByPack((prev) => ({ ...prev, [importModal.pack.id]: t("feedback.importOk", { count: Object.keys(result.entityIdMap ?? {}).length }) }));
      setImportModal(null);
    } catch (e) {
      setImportModal((cur) => cur ? { ...cur, submitting: false, error: e instanceof Error ? e.message : t("errors.import") } : cur);
    }
  }, [accessToken, importModal, t]);

  const sorted = useMemo(() => [...publicPacks].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))), [publicPacks]);
  const required = useMemo(() => (importModal?.detail?.placeholders ?? []).filter((p) => p.isRequired), [importModal]);
  const optional = useMemo(() => (importModal?.detail?.placeholders ?? []).filter((p) => !p.isRequired), [importModal]);
  const cols = compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2";

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

        {/* ── HERO ── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-[#060b12] to-[#020408] p-8 shadow-xl">
          {/* decorative blobs */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#d8ff72]/5 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 left-1/4 h-40 w-64 rounded-full bg-purple-500/5 blur-3xl" />
          {/* decorative SVG cubes (right side) */}
          <svg className="pointer-events-none absolute right-0 top-0 h-full w-80 opacity-90" viewBox="0 0 340 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse cx="280" cy="20" r="5" fill="#d8ff72" opacity=".5" />
            <ellipse cx="300" cy="120" r="3.5" fill="#d8ff72" opacity=".35" />
            <ellipse cx="315" cy="65" r="2.5" fill="#a78bfa" opacity=".45" />
            {/* purple cube */}
            <g transform="translate(170,28)">
              <polygon points="40,0 80,22 80,66 40,88 0,66 0,22" fill="#5b21b6" stroke="#7c3aed" strokeWidth="1" />
              <polygon points="40,0 80,22 40,44 0,22" fill="#7c3aed" opacity=".8" />
              <polygon points="0,22 40,44 40,88 0,66" fill="#4c1d95" opacity=".9" />
              <polygon points="80,22 40,44 40,88 80,66" fill="#6d28d9" opacity=".85" />
            </g>
            {/* lime cube */}
            <g transform="translate(245,12) scale(0.62)">
              <polygon points="40,0 80,22 80,66 40,88 0,66 0,22" fill="#1a3300" stroke="#d8ff72" strokeWidth="1.2" />
              <polygon points="40,0 80,22 40,44 0,22" fill="#3d7a00" opacity=".8" />
              <polygon points="0,22 40,44 40,88 0,66" fill="#2a5500" opacity=".9" />
              <polygon points="80,22 40,44 40,88 80,66" fill="#4a9400" opacity=".85" />
            </g>
            {/* coin */}
            <g transform="translate(125,55)">
              <ellipse cx="26" cy="11" rx="26" ry="11" fill="#ca8a04" opacity=".75" />
              <ellipse cx="26" cy="8.5" rx="26" ry="11" fill="#fbbf24" />
              <ellipse cx="26" cy="8.5" rx="20" ry="8.5" fill="#fde68a" opacity=".55" />
              <text x="26" y="12.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#92400e" fontFamily="sans-serif">K</text>
            </g>
          </svg>

          <div className="relative max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ff72]/30 bg-[#d8ff72]/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#d8ff72]">
              <Sparkles className="h-3 w-3" />
              {t("eyebrow")}
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t("subtitle")}</h1>
            <p className="mt-2 text-sm text-white/50">Find packs created by the community or publish your own.</p>

            {/* search */}
            <div className="relative mt-5 w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#d8ff72]/40"
                placeholder={t("publicPacks.search")}
              />
            </div>
          </div>
        </div>

        {/* ── CATEGORIES ── */}
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-white/30">Popular categories</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setQuery(cat.label)}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3.5 text-left transition-all hover:border-white/15 hover:bg-white/[0.06]"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                    style={{ background: `${cat.color}18`, borderColor: `${cat.color}30`, color: cat.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-white">{cat.label}</p>
                    <p className="text-[11px] text-white/40">{cat.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── ERROR ── */}
        {error ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* ── PACKS GRID ── */}
        <section className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white">{t("publicPacks.title")}</h2>
              {!loading ? (
                <p className="mt-0.5 text-xs text-white/40">{sorted.length} packs available</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => loadPublicPacks().catch(() => undefined)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/60 transition-all hover:border-white/20 hover:text-white"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-sm text-white/30">
              <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> {t("status.loading")}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <Download className="h-7 w-7 text-white/20" />
              </div>
              <p className="mt-4 text-sm font-semibold text-white/50">{t("empty.noPublicPacks")}</p>
              <p className="mt-1 text-xs text-white/25">Check back later or publish your own.</p>
            </div>
          ) : (
            <div className={`grid gap-4 ${cols}`}>
              {sorted.map((pack) => (
                <article
                  key={pack.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-all hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-bold text-white transition-colors group-hover:text-[#d8ff72]">
                          {pack.title}
                        </h3>
                        <p className="mt-0.5 font-mono text-[11px] text-white/30">{pack.slug}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-white/40">
                        {pack.defaultLocale}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-white/50">
                      {pack.summary ?? t("empty.noSummary")}
                    </p>
                  </div>

                  {messageByPack[pack.id] ? (
                    <div className="mx-5 mb-3 rounded-lg border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-2 text-xs text-[#4ade80]">
                      {messageByPack[pack.id]}
                    </div>
                  ) : null}

                  <div className="border-t border-white/6 p-4">
                    <button
                      type="button"
                      onClick={() => openImportModal(pack)}
                      disabled={!accessToken}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#d8ff72] px-4 py-2.5 text-[13px] font-bold text-[#0a1200] transition-all hover:bg-[#c8ef60] disabled:cursor-not-allowed disabled:opacity-40"
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
      </div>

      {/* ══ IMPORT MODAL ══ */}
      {importModal ? (
        <div
          className="fixed inset-0 z-[180] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setImportModal(null); }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/12 bg-[#0c1018] shadow-2xl">
            {/* modal header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/8 bg-[#0c1018] px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">{t("import.modalEyebrow")}</p>
                <h3 className="mt-1.5 text-xl font-extrabold tracking-tight text-white">{importModal.pack.title}</h3>
                <p className="mt-1 text-sm text-white/45">
                  {importModal.detail?.selectedLocalization?.summary ?? importModal.pack.summary ?? t("empty.noSummary")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModal(null)}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 transition-colors hover:border-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* modal body */}
            <div className="px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">{t("import.destinationTeam")}</label>
                  <input
                    value={importModal.destinationTeamId}
                    onChange={(e) => setImportModal((cur) => cur ? { ...cur, destinationTeamId: e.target.value } : cur)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d8ff72]/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">{t("import.selector")}</label>
                  <input
                    value={importModal.selector}
                    onChange={(e) => setImportModal((cur) => cur ? { ...cur, selector: e.target.value } : cur)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d8ff72]/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">{t("import.locale")}</label>
                  <select
                    value={importModal.locale}
                    onChange={(e) => setImportModal((cur) => cur ? { ...cur, locale: e.target.value } : cur)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d8ff72]/40"
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
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${importModal.loading ? "animate-spin" : ""}`} />
                  {t("actions.reloadVersion")}
                </button>
                {importModal.detail?.version ? (
                  <span className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/35">
                    {t("import.loadedVersion", { version: importModal.detail.version.version })}
                  </span>
                ) : null}
              </div>

              {importModal.error ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {importModal.error}
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {/* required */}
                <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    <p className="text-[13px] font-bold text-white">{t("import.requiredTitle")}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-white/35">{t("import.requiredDescription")}</p>
                  <div className="mt-3 space-y-2">
                    {required.length > 0 ? (
                      required.map((p) => (
                        <PlaceholderField key={p.placeholderKey} placeholder={p} value={importModal.placeholderInputs[p.placeholderKey] ?? ""} onChange={(v) => setImportModal((cur) => cur ? { ...cur, placeholderInputs: { ...cur.placeholderInputs, [p.placeholderKey]: v } } : cur)} t={t} />
                      ))
                    ) : (
                      <p className="text-sm text-white/30">{t("import.noRequired")}</p>
                    )}
                  </div>
                </div>
                {/* optional */}
                <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                    <p className="text-[13px] font-bold text-white">{t("import.optionalTitle")}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-white/35">{t("import.optionalDescription")}</p>
                  <div className="mt-3 space-y-2">
                    {optional.length > 0 ? (
                      optional.map((p) => (
                        <PlaceholderField key={p.placeholderKey} placeholder={p} value={importModal.placeholderInputs[p.placeholderKey] ?? ""} onChange={(v) => setImportModal((cur) => cur ? { ...cur, placeholderInputs: { ...cur.placeholderInputs, [p.placeholderKey]: v } } : cur)} t={t} />
                      ))
                    ) : (
                      <p className="text-sm text-white/30">{t("import.noOptional")}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* modal footer */}
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 bg-[#0c1018] px-6 py-4">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-white/35">
                {t("import.placeholderCount", { count: importModal.detail?.placeholders?.length ?? 0 })}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setImportModal(null)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 transition-colors hover:border-white/20 hover:text-white">
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={importModal.loading || importModal.submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#d8ff72] px-5 py-2 text-sm font-bold text-[#0a1200] shadow-sm transition-all hover:bg-[#c8ef60] disabled:opacity-40"
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
