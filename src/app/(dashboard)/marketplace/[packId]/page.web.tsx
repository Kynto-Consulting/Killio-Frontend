"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronRight, FileText, GitBranch, Globe, Layout, Package, RefreshCcw, SlidersHorizontal, Tag, User, Zap } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { useTenant } from "@/components/providers/tenant-provider";
import { PackGallery } from "@/components/marketplace/pack-gallery";
import { PackDocument } from "@/components/marketplace/pack-document";
import { CategoryChip, FOCUS_RING, HARD_SHADOW_HOVER, MemphisIllustration, PackCard, PackCover, PriceBadge } from "@/components/marketplace/pack-ui";
import { formatPackPrice, nextHubAction } from "@/lib/marketplace/pricing";
import { groupAssets, relatedPacks } from "@/lib/marketplace/presentation";
import {
  getHubPackDetail,
  getHubStatus,
  getMarketplacePackDetail,
  listHubPacks,
  listHubPurchases,
  listPublicMarketplacePacks,
  MarketplaceAssetType,
  MarketplacePack,
  MarketplacePackDetail,
} from "@/lib/api/marketplace";

const ASSET_ICONS: Record<MarketplaceAssetType, React.ElementType> = { document: FileText, board: Layout, mesh: GitBranch, script: Zap };
const PRIMARY_BTN = `inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-[hsl(var(--accent-ink))] px-5 py-3 text-sm font-extrabold text-[hsl(var(--accent-ink-fg))] ${HARD_SHADOW_HOVER} ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-40`;
const SECONDARY_BTN = `inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-[13px] font-bold text-foreground ${HARD_SHADOW_HOVER} ${FOCUS_RING}`;

function placeholderLabel(p: { placeholderKey: string; validation?: Record<string, unknown> }): string {
  const leaf = p.validation?.leafKey;
  return typeof leaf === "string" && leaf.trim() ? leaf.trim() : p.placeholderKey;
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border-2 border-foreground bg-background p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-black tracking-tight text-foreground">
        {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function MarketplaceDetailView({ packId, compact = false }: { packId: string; compact?: boolean }) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const router = useRouter();
  const { accessToken } = useSession();
  const isTenant = useTenant().mode === "tenant";

  const [detail, setDetail] = useState<MarketplacePackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<MarketplacePack[]>([]);
  const [hubConnected, setHubConnected] = useState<boolean | null>(null);
  const [hubPurchase, setHubPurchase] = useState<"free" | "paid" | null>(null);

  const load = useCallback(async () => {
    // The hub needs a session; the public marketplace works without one.
    if (isTenant && !accessToken) return;
    setLoading(true);
    try {
      const input = { locale };
      const result = isTenant
        ? await getHubPackDetail(packId, input, accessToken as string)
        : await getMarketplacePackDetail(packId, input, accessToken || undefined);
      setDetail(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.loadPackDetail"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, isTenant, locale, packId, t]);

  useEffect(() => { load().catch(() => undefined); }, [load]);

  // Related packs are a nice-to-have: a failure here never blocks the page.
  const category = detail?.pack.category ?? null;
  useEffect(() => {
    if (!category) { setRelated([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const params = { locale, limit: 60 };
        const items = isTenant ? await listHubPacks(params) : await listPublicMarketplacePacks(params);
        if (!cancelled) setRelated(relatedPacks(items, { id: packId, category }, 3));
      } catch {
        if (!cancelled) setRelated([]);
      }
    })();
    return () => { cancelled = true; };
  }, [category, isTenant, locale, packId]);

  useEffect(() => {
    if (!isTenant || !accessToken) return;
    (async () => {
      try {
        const { connected } = await getHubStatus(accessToken);
        setHubConnected(connected);
        if (connected) {
          const purchases = await listHubPurchases(accessToken);
          const mine = purchases.find((p) => p.packId === packId && (p.status === "paid" || p.status === "free"));
          setHubPurchase(mine ? (mine.status === "paid" ? "paid" : "free") : null);
        }
      } catch {
        setHubConnected(false);
      }
    })();
  }, [accessToken, isTenant, packId]);

  const pack = detail?.pack ?? null;
  const localization = detail?.selectedLocalization ?? null;
  const groups = useMemo(() => groupAssets(detail?.assets ?? []), [detail]);
  const placeholders = detail?.placeholders ?? [];

  const actionLabel = useMemo(() => {
    if (!pack) return "";
    if (!isTenant) return t("actions.configureImport");
    const action = nextHubAction({ connected: hubConnected === true, purchaseStatus: hubPurchase });
    if (action === "connect") return t("hub.connect");
    if (action === "import") return t("hub.import");
    const price = formatPackPrice(pack, locale);
    return price.kind === "paid" ? t("hub.buy", { price: price.label }) : t("hub.getFree");
  }, [hubConnected, hubPurchase, isTenant, locale, pack, t]);

  // The install modal (placeholders, destination, connect/checkout in tenants) lives in the list page.
  const install = () => { if (pack) router.push(`/marketplace?install=${encodeURIComponent(pack.id)}`); };

  const breadcrumb = (
    <nav aria-label={t("detail.breadcrumb")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-foreground/70">
      <Link href="/marketplace" className={`rounded-md underline-offset-2 hover:text-foreground hover:underline ${FOCUS_RING}`}>{t("title")}</Link>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      <span aria-current="page" className="min-w-0 truncate text-foreground">{pack?.title ?? t("status.loading")}</span>
    </nav>
  );

  if (loading && !detail) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-busy="true">
        {breadcrumb}
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="aspect-[16/10] animate-pulse rounded-3xl border-2 border-foreground/25 bg-foreground/10 motion-reduce:animate-none lg:col-span-3" />
          <div className="space-y-3 lg:col-span-2">
            <div className="h-8 w-3/4 animate-pulse rounded-full bg-foreground/15 motion-reduce:animate-none" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-foreground/10 motion-reduce:animate-none" />
            <div className="h-12 w-full animate-pulse rounded-xl bg-foreground/10 motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !pack) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {breadcrumb}
        <div role="alert" className="flex flex-col items-center rounded-3xl border-2 border-dashed border-foreground/40 px-6 py-12 text-center">
          <MemphisIllustration className="h-24 w-40" />
          <p className="mt-4 text-lg font-black text-foreground">{t("detail.notFound")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/70"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error ?? t("errors.loadPackDetail")}</p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => load().catch(() => undefined)} className={SECONDARY_BTN}><RefreshCcw className="h-4 w-4" aria-hidden="true" />{t("gallery.retry")}</button>
            <Link href="/marketplace" className={SECONDARY_BTN}>{t("detail.backToMarketplace")}</Link>
          </div>
        </div>
      </div>
    );
  }

  const title = localization?.title || pack.title;
  const summary = localization?.summary ?? pack.summary;
  const locales = (detail?.localizations ?? []).map((l) => l.locale);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      {breadcrumb}

      {/* ── HERO ── */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="overflow-hidden rounded-3xl border-2 border-foreground shadow-[6px_6px_0_0_hsl(var(--foreground))] lg:col-span-3">
          <PackCover pack={pack} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {pack.category ? <CategoryChip slug={pack.category} /> : null}
            <PriceBadge pack={pack} />
          </div>
          <h1 className="text-3xl font-black leading-tight tracking-tight text-foreground sm:text-4xl">{title}</h1>
          {summary ? <p className="text-[15px] leading-relaxed text-foreground/80">{summary}</p> : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <div><dt className="flex items-center gap-1 font-bold text-foreground/60"><User className="h-3.5 w-3.5" aria-hidden="true" />{t("detail.author")}</dt><dd className="font-semibold text-foreground">{pack.authorName ?? t("gallery.anonymous")}</dd></div>
            <div><dt className="flex items-center gap-1 font-bold text-foreground/60"><Package className="h-3.5 w-3.5" aria-hidden="true" />{t("detail.version")}</dt><dd className="font-semibold text-foreground">{detail?.version?.version ?? "-"}</dd></div>
            <div className="col-span-2"><dt className="flex items-center gap-1 font-bold text-foreground/60"><Globe className="h-3.5 w-3.5" aria-hidden="true" />{t("detail.languages")}</dt><dd className="font-semibold uppercase text-foreground">{(locales.length ? locales : [pack.defaultLocale]).join(" · ")}</dd></div>
          </dl>
          {(pack.tags ?? []).length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label={t("gallery.tags")}>
              {(pack.tags ?? []).map((tag) => <li key={tag} className="inline-flex items-center gap-1 rounded-full border border-foreground/40 px-2.5 py-0.5 text-[12px] font-semibold text-foreground/80"><Tag className="h-3 w-3" aria-hidden="true" />{tag}</li>)}
            </ul>
          ) : null}
          <button type="button" onClick={install} disabled={!accessToken} className={`${PRIMARY_BTN} w-full`}>
            {actionLabel}
          </button>
          {!accessToken ? <p className="text-xs text-foreground/70">{t("detail.signInToInstall")}</p> : null}
        </div>
      </div>

      <div className={`mt-8 grid gap-6 ${compact ? "" : "lg:grid-cols-3"}`}>
        <div className="space-y-6 lg:col-span-2">
          <PackGallery images={pack.gallery ?? []} title={title} />

          {localization?.description ? (
            <Section title={t("detail.about")}>
              <PackDocument text={localization.description} idPrefix={`about-${pack.id}`} />
            </Section>
          ) : null}

          {localization?.documentationMarkdown ? (
            <Section title={t("detail.documentation")} icon={FileText}>
              <PackDocument text={localization.documentationMarkdown} idPrefix={`docs-${pack.id}`} />
            </Section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Section title={t("detail.includes")} icon={Package}>
            {groups.length === 0 ? (
              <p className="text-sm text-foreground/70">{t("detail.includesEmpty")}</p>
            ) : (
              <div className="space-y-4">
                <ul className="flex flex-wrap gap-2" aria-label={t("detail.includesSummary")}>
                  {groups.map((g) => {
                    const Icon = ASSET_ICONS[g.type as MarketplaceAssetType] ?? FileText;
                    return (
                      <li key={g.type} className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-[13px] font-bold text-foreground">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {g.count} · {t(`assetTypes.${g.type}`)}
                      </li>
                    );
                  })}
                </ul>
                {groups.map((g) => {
                  const Icon = ASSET_ICONS[g.type as MarketplaceAssetType] ?? FileText;
                  return (
                    <div key={g.type}>
                      <h3 className="mb-1.5 text-[12px] font-extrabold uppercase tracking-wider text-foreground/60">{t(`assetTypes.${g.type}`)}</h3>
                      <ul className="space-y-1">
                        {g.items.map((item) => (
                          <li key={`${g.type}-${item.asset.logicalKey}`} className="flex items-center gap-2 text-sm text-foreground">
                            <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden="true" />
                            <span className="min-w-0 truncate">{item.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {placeholders.length > 0 ? (
            <Section title={t("detail.customize")} icon={SlidersHorizontal}>
              <p className="mb-3 text-sm text-foreground/70">{t("detail.customizeHint")}</p>
              <ul className="space-y-2">
                {placeholders.map((p) => (
                  <li key={p.placeholderKey} className="rounded-2xl border-2 border-foreground/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-foreground">{placeholderLabel(p)}</span>
                      <span className="shrink-0 rounded-full border border-foreground/40 px-2 py-0.5 text-[11px] font-bold text-foreground/70">{p.isRequired ? t("detail.required") : t("detail.optional")}</span>
                    </div>
                    {p.description ? <p className="mt-0.5 text-[13px] text-foreground/70">{p.description}</p> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-10" aria-label={t("detail.related")}>
          <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">{t("detail.related")}</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => <PackCard key={p.id} pack={p} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default MarketplaceDetailView;
