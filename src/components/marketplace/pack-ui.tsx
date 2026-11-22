"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Building2, Code, Globe, LayoutGrid, Sparkles, User, Users, Wallet } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import type { MarketplacePack } from "@/lib/api/marketplace";
import { formatPackPrice } from "@/lib/marketplace/pricing";
import {
  COVER_H, COVER_PALETTE, COVER_W, CoverShape, coverBgVar, coverFamily, generateCover, isKnownCategory, prettifyCategory,
} from "@/lib/marketplace/presentation";

/* Soft building blocks shared with the document dialogs: thin borders, rounded corners, theme primary colour, no offset shadows. */

export const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
export const SOFT_HOVER = "transition-colors motion-reduce:transition-none";
export const SOFT_PRIMARY = `inline-flex items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
export const SOFT_SECONDARY = `inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-background font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
export const SOFT_FIELD = `w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground/60 focus-visible:border-primary ${FOCUS_RING}`;
export const SOFT_ICON_BTN = `flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background text-foreground transition-colors hover:bg-accent disabled:opacity-40 ${FOCUS_RING}`;

const ICONS: Record<string, React.ElementType> = { Wallet, Users, LayoutGrid, Code, Building2, Sparkles };

/** Translated category label; slugs without a translation are prettified. */
export function useCategoryLabel() {
  const t = useTranslations("marketplace");
  return (slug: string) => (isKnownCategory(slug) ? t(`gallery.cat.${slug}`) : prettifyCategory(slug));
}

function Shape({ shape, ink }: { shape: CoverShape; ink: string }) {
  const { kind, size: sz, fill } = shape;
  const r = sz / 2;
  // Colours go through `style` (not attributes) so the theme tokens (var(--cover-*)) resolve in light and dark mode.
  const solid: React.CSSProperties = { fill, stroke: ink, strokeWidth: 2.4, strokeLinejoin: "round", strokeLinecap: "round" };
  let node: React.ReactNode = null;
  switch (kind) {
    case "circle": node = <circle r={r} style={solid} />; break;
    case "ring": node = <circle r={r} style={{ fill: "none", stroke: fill, strokeWidth: 5 }} />; break;
    case "semicircle": node = <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z`} style={solid} />; break;
    case "triangle": node = <polygon points={`0,${-r} ${r},${r} ${-r},${r}`} style={solid} />; break;
    case "squiggle": {
      const q = sz / 8;
      node = <path d={`M ${-r} 0 q ${q} ${-q * 2} ${q * 2} 0 t ${q * 2} 0 t ${q * 2} 0 t ${q * 2} 0`} style={{ fill: "none", stroke: fill, strokeWidth: 3.4, strokeLinecap: "round" }} />;
      break;
    }
    case "dots": {
      const gap = sz / 3;
      node = (
        <g style={{ fill }}>
          {[-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => <circle key={`${i}${j}`} cx={i * gap} cy={j * gap} r={1.6} />))}
        </g>
      );
      break;
    }
    case "moon": node = <path d={`M 0 ${-r} A ${r} ${r} 0 1 0 0 ${r} A ${r * 0.62} ${r} 0 1 1 0 ${-r} Z`} style={solid} />; break;
    case "block": node = <rect x={-r} y={-r * 1.3} width={sz} height={sz * 1.3} rx={sz * 0.28} style={solid} />; break;
  }
  return <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>{node}</g>;
}

/**
 * Cover of a pack: the author's image when there is one (and it loads), otherwise a flat generated composition
 * that depends only on (pack id, category).
 */
export function PackCover({ pack, className = "", showIcon = true }: {
  pack: Pick<MarketplacePack, "id" | "category" | "coverImageUrl" | "title">;
  className?: string;
  showIcon?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const spec = generateCover(pack.id, pack.category);
  const Icon = ICONS[spec.icon] ?? Sparkles;
  const frame = `relative aspect-[16/10] w-full overflow-hidden ${className}`;

  if (pack.coverImageUrl && !broken) {
    return (
      <div className={frame} style={{ background: spec.background }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pack.coverImageUrl} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={frame} style={{ background: spec.background }} aria-hidden="true">
      <svg viewBox={`0 0 ${COVER_W} ${COVER_H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {spec.shapes.map((shape, i) => <Shape key={i} shape={shape} ink={spec.stroke} />)}
      </svg>
      {showIcon ? (
        <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border-2 sm:h-16 sm:w-16" style={{ background: COVER_PALETTE.cream, borderColor: spec.stroke, color: spec.stroke }}>
          <Icon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.4} />
        </div>
      ) : null}
    </div>
  );
}

/** Flat pill. Free is mint, paid is mustard (deeper tones in dark mode); contrast with the ink token is AA-tested. */
export function PriceBadge({ pack, className = "" }: { pack: Pick<MarketplacePack, "pricingType" | "priceAmountMinor" | "currency">; className?: string }) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const price = formatPackPrice(pack, locale);
  return (
    <span
      className={`inline-flex items-center rounded-full border border-black/10 px-2.5 py-0.5 text-[12px] font-bold dark:border-white/10 ${className}`}
      style={{ background: price.kind === "free" ? "var(--cover-badge-free)" : "var(--cover-badge-paid)", color: "var(--cover-ink)" }}
    >
      {price.kind === "free" ? t("hub.free") : price.kind === "subscription" ? t("hub.perMonth", { price: price.label }) : price.label}
    </span>
  );
}

export function CategoryChip({ slug, className = "" }: { slug: string; className?: string }) {
  const label = useCategoryLabel();
  return (
    <span className={`inline-flex items-center rounded-full border border-black/10 px-2.5 py-0.5 text-[11px] font-semibold dark:border-white/10 ${className}`} style={{ background: coverBgVar(coverFamily(slug)), color: "var(--cover-ink)" }}>
      {label(slug)}
    </span>
  );
}

export function PackCard({ pack, footer }: { pack: MarketplacePack; footer?: React.ReactNode }) {
  const t = useTranslations("marketplace");
  const tags = (pack.tags ?? []).slice(0, 3);
  return (
    <article className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-primary/40`}>
      <Link
        href={`/marketplace/${encodeURIComponent(pack.id)}`}
        aria-label={t("gallery.openPack", { title: pack.title })}
        className="flex flex-1 flex-col focus-visible:outline-none after:absolute after:inset-0 after:content-['']"
      >
        <div className="relative border-b border-border/60">
          <PackCover pack={pack} />
          <PriceBadge pack={pack} className="absolute right-3 top-3" />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-2 text-base font-semibold leading-tight text-foreground">{pack.title}</h3>
          <p className="line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-foreground/70">{pack.summary ?? t("empty.noSummary")}</p>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-[12px] font-semibold text-foreground/70">
            {pack.category ? <CategoryChip slug={pack.category} /> : null}
            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" aria-hidden="true" />{pack.authorName ?? t("gallery.anonymous")}</span>
            <span className="inline-flex items-center gap-1 uppercase"><Globe className="h-3.5 w-3.5" aria-hidden="true" />{pack.defaultLocale}</span>
          </div>
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label={t("gallery.tags")}>
              {tags.map((tag) => <li key={tag} className="rounded-full border border-foreground/30 px-2 py-0.5 text-[11px] font-semibold text-foreground/70">#{tag}</li>)}
            </ul>
          ) : null}
        </div>
      </Link>
      {footer ? <div className="relative z-10 border-t border-border/60 p-3">{footer}</div> : null}
    </article>
  );
}

/** Same silhouette as PackCard, so the grid does not jump when data arrives. */
export function PackCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-background" aria-hidden="true">
      <div className="aspect-[16/10] w-full animate-pulse border-b-2 border-foreground/25 bg-foreground/10 motion-reduce:animate-none" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-foreground/15 motion-reduce:animate-none" />
        <div className="h-3 w-full animate-pulse rounded-full bg-foreground/10 motion-reduce:animate-none" />
        <div className="h-3 w-4/5 animate-pulse rounded-full bg-foreground/10 motion-reduce:animate-none" />
        <div className="flex gap-2 pt-1">
          <div className="h-5 w-16 animate-pulse rounded-full bg-foreground/15 motion-reduce:animate-none" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-foreground/10 motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

/** Flat decorative illustration for empty / error states (abstract shapes only). */
export function MemphisIllustration({ className = "" }: { className?: string }) {
  const line = { stroke: COVER_PALETTE.ink, strokeWidth: 2.4, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 160 100" className={className} aria-hidden="true">
      <rect x="10" y="22" width="52" height="64" rx="16" style={{ fill: COVER_PALETTE.violet, ...line }} />
      <circle cx="96" cy="46" r="24" style={{ fill: COVER_PALETTE.mustard, ...line }} />
      <path d="M 70 84 A 26 26 0 0 1 122 84 Z" style={{ fill: COVER_PALETTE.coral, ...line }} />
      <polygon points="136,18 150,44 122,44" style={{ fill: COVER_PALETTE.turquoise, ...line }} />
      <path d="M 18 12 q 5 -8 10 0 t 10 0 t 10 0" style={{ fill: "none", stroke: COVER_PALETTE.pink, strokeWidth: 3.4, strokeLinecap: "round" }} />
    </svg>
  );
}
