"use client";

// Mobile marketing landing. It carries the same sections, facts and calls to action as the desktop
// landing (components/marketing/killio-landing.tsx), laid out for a phone: one column, 44px tap
// targets, theme tokens (light and dark) instead of the desktop's fixed dark palette.
// Content comes from components/marketing/landing-data.ts and the `landing` i18n namespace, both
// shared with desktop. page.tsx decides when this renders (never inside Killio App).

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Download,
  FileText,
  Kanban,
  Menu,
  Orbit,
  Slash,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { BrandLogo, BrandName } from "@/components/marketing/brand-logo";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTenant } from "@/components/providers/tenant-provider";
import {
  AI_FEATURES,
  DOC_PREVIEW_TITLE,
  KANBAN_COLUMNS,
  LANDING_INTEGRATIONS,
  LANDING_NAV_LINKS,
  LANDING_PLANS,
  MESH_NODES,
  MESH_PILLS,
  SALES_MAILTO,
  SCRIPT_STEPS,
  STRIP_ITEMS,
} from "@/components/marketing/landing-data";

type T = (key: string, params?: Record<string, string | number>) => string;
type Tone = "lime" | "indigo" | "cyan" | "amber" | "rose";

// "lime" is Killio's accent: lime on dark, blue on light (see --accent-ink in globals.css).
const TONE: Record<Tone, { text: string; soft: string }> = {
  lime: { text: "text-[hsl(var(--accent-ink))]", soft: "border-[hsl(var(--accent-ink)/0.3)] bg-[hsl(var(--accent-ink)/0.1)]" },
  indigo: { text: "text-indigo-600 dark:text-indigo-300", soft: "border-indigo-500/30 bg-indigo-500/10" },
  cyan: { text: "text-cyan-700 dark:text-cyan-300", soft: "border-cyan-500/30 bg-cyan-500/10" },
  amber: { text: "text-amber-700 dark:text-amber-300", soft: "border-amber-500/30 bg-amber-500/10" },
  rose: { text: "text-rose-600 dark:text-rose-300", soft: "border-rose-500/30 bg-rose-500/10" },
};

const ACCENT_TEXT = TONE.lime.text;
const BTN_BASE = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm transition-colors motion-reduce:transition-none";
const BTN_PRIMARY = `${BTN_BASE} bg-[hsl(var(--accent-ink))] font-semibold text-[hsl(var(--accent-ink-fg))] active:opacity-90`;
const BTN_OUTLINE = `${BTN_BASE} border border-border font-medium text-foreground active:bg-foreground/5`;
const CARD = "border border-border/70 bg-card/70";
const SECTION = "scroll-mt-16 px-4 py-12";

// ─── Small pieces ─────────────────────────────────────────────────────────────

/** Fades its content in the first time it enters the screen. Static when the user asks for reduced motion. */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-500 ease-out motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:transition-none ${shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: string }) {
  return (
    <Reveal className="mb-6">
      <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${ACCENT_TEXT}`}>{eyebrow}</p>
      <h2 className="mt-2 text-balance text-[1.7rem] font-bold leading-tight tracking-tight">{title}</h2>
      {sub ? <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{sub}</p> : null}
    </Reveal>
  );
}

function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${TONE[tone].text} ${TONE[tone].soft}`}>
      {children}
    </span>
  );
}

/** Killio's mark has a dark and a white version; a tenant brings its own logo. */
function Logo({ className }: { className: string }) {
  const tenant = useTenant();
  if (tenant.mode === "tenant") return <BrandLogo className={className} />;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/killio.webp" alt="Killio" className={`${className} dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/killio_white.webp" alt="Killio" className={`${className} hidden dark:block`} />
    </>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({ t }: { t: T }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-2 pl-4 pr-1.5">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2">
          <Logo className="h-6 w-auto shrink-0" />
          <span className="hidden truncate text-base font-semibold tracking-tight min-[400px]:inline"><BrandName /></span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link href="/login" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-[13px] font-medium text-foreground">
            {t("kl.nav.signIn")}
          </Link>
          {/* The pill is 36px tall to keep the bar compact; the link around it is the 44px tap target. */}
          <Link href="/signup" className="inline-flex min-h-11 items-center">
            <span className="inline-flex h-9 items-center whitespace-nowrap rounded-full bg-[hsl(var(--accent-ink))] px-3.5 text-[13px] font-semibold text-[hsl(var(--accent-ink-fg))]">
              {t("mobile.nav.cta")}
            </span>
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground"
            aria-label={open ? t("mobile.menu.close") : t("mobile.menu.open")}
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <>
          {/* Absolute, not fixed: the header's backdrop-filter would anchor a fixed child to the header box. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-x-0 top-full z-0 h-screen bg-background/60"
            onClick={() => setOpen(false)}
          />
          <nav id={menuId} className="absolute inset-x-0 top-full z-10 border-b border-border bg-background px-2 pb-3 pt-1 shadow-lg">
            <ul>
              {LANDING_NAV_LINKS.map((link) => (
                <li key={link.key}>
                  {link.hash ? (
                    <a href={link.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-base font-medium active:bg-foreground/5">
                      {t(`kl.nav.${link.key}`)}
                    </a>
                  ) : (
                    <Link href={link.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center justify-between rounded-xl px-3 text-base font-medium active:bg-foreground/5">
                      {t(`kl.nav.${link.key}`)}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-2 grid grid-cols-2 gap-2 px-1">
              <Link href="/login" className={BTN_OUTLINE}>{t("kl.nav.signIn")}</Link>
              <Link href="/signup" className={BTN_PRIMARY}>{t("kl.nav.getStarted")}</Link>
            </div>
          </nav>
        </>
      ) : null}
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ t }: { t: T }) {
  return (
    <section className="px-4 pb-10 pt-10 text-center">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${ACCENT_TEXT} ${TONE.lime.soft}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" />
        {t("kl.hero.badge")}
      </div>

      <h1 className="mt-5 text-balance text-[2.6rem] font-extrabold leading-[1.02] tracking-tight">
        {t("kl.hero.titlePrefix")} <span className={ACCENT_TEXT}>{t("kl.hero.titleAccent")}</span>
        <br />
        {t("kl.hero.titleSuffix")}
      </h1>

      <p className="mx-auto mt-5 max-w-sm text-base leading-relaxed text-muted-foreground">{t("kl.hero.sub")}</p>

      <div className="mt-7 flex flex-col gap-2.5">
        <Link href="/signup" className={`${BTN_PRIMARY} h-12`}>
          {t("kl.hero.ctaPrimary")}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <a href="#features" className={`${BTN_OUTLINE} h-12`}>{t("kl.hero.ctaSecondary")}</a>
      </div>

      <p className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Check className={`h-3.5 w-3.5 shrink-0 ${ACCENT_TEXT}`} strokeWidth={2.5} />
        {t("kl.hero.noCard")}
      </p>
    </section>
  );
}

// ─── Feature previews (decorative) ────────────────────────────────────────────

const KANBAN_TAG: Record<"blue" | "red" | "green", string> = {
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function KanbanPreview() {
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border/70 bg-foreground/[0.03] p-2">
      {KANBAN_COLUMNS.map((column) => (
        <div key={column.name} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 px-1 pt-1 text-[10px] font-semibold text-muted-foreground">
            <span className="truncate">{column.name}</span>
            <span className="rounded-full bg-foreground/10 px-1.5 text-[9px]">{column.count}</span>
          </div>
          {column.cards.map((card) => (
            <div key={card.title} className="rounded-lg border border-border/70 bg-card p-1.5">
              <p className="line-clamp-2 text-[10px] font-medium leading-snug">{card.title}</p>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className={`truncate rounded-full border px-1.5 text-[8px] font-bold leading-4 ${KANBAN_TAG[card.tc]}`}>{card.tag}</span>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                  style={{ background: `${card.ac}22`, border: `1px solid ${card.ac}55`, color: card.ac }}
                >
                  {card.av}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DocPreview() {
  const rows = [
    ["50%", "50%", "50%"],
    ["60%", "80%", "40%"],
    ["75%", "55%", "65%"],
  ];
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-border/70 bg-foreground/[0.03]">
      <div className="flex items-center gap-1.5 border-b border-border/70 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="ml-1 truncate text-[11px] text-muted-foreground">{DOC_PREVIEW_TITLE}</span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <div className="h-4 w-[55%] rounded bg-foreground/80" />
        <div className="mt-1 h-2 w-[90%] rounded bg-foreground/15" />
        <div className="h-2 w-[72%] rounded bg-foreground/15" />
        <div className={`flex items-center gap-2 rounded-lg border-l-[3px] border-l-[hsl(var(--accent-ink))] bg-[hsl(var(--accent-ink)/0.1)] px-3 py-2.5 ${ACCENT_TEXT}`}>
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <div className="h-2 flex-1 rounded bg-current opacity-50" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border/70">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex border-b border-border/60 last:border-b-0">
              {row.map((width, cellIndex) => (
                <div key={cellIndex} className="flex h-6 flex-1 items-center px-2.5">
                  <div className={`h-1.5 rounded ${rowIndex === 0 ? "bg-foreground/30" : "bg-foreground/15"}`} style={{ width }} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground">
          <Slash className="h-3.5 w-3.5 shrink-0" />
          <div className="h-1.5 w-2/3 rounded bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}

// The desktop canvas is 510px wide; on a phone the same five nodes are stacked in three rows.
const MESH_LAYOUT: Record<(typeof MESH_NODES)[number]["id"], { x: number; y: number; tone: Tone }> = {
  a: { x: 94, y: 10, tone: "lime" },
  b: { x: 20, y: 70, tone: "indigo" },
  c: { x: 168, y: 70, tone: "cyan" },
  d: { x: 20, y: 130, tone: "amber" },
  e: { x: 168, y: 130, tone: "rose" },
};
const MESH_LINKS: [keyof typeof MESH_LAYOUT, keyof typeof MESH_LAYOUT][] = [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["c", "e"]];
const MESH_W = 112;
const MESH_H = 30;

function MeshPreview() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-2xl border border-border/70 bg-foreground/[0.03] [background-image:radial-gradient(circle,hsl(var(--ink)/0.14)_1px,transparent_1px)] [background-size:20px_20px]"
    >
      <svg viewBox="0 0 300 170" className="block h-auto w-full">
        {MESH_LINKS.map(([from, to]) => {
          const a = MESH_LAYOUT[from];
          const b = MESH_LAYOUT[to];
          const x1 = a.x + MESH_W / 2;
          const y1 = a.y + MESH_H;
          const x2 = b.x + MESH_W / 2;
          const y2 = b.y;
          return (
            <path
              key={`${from}${to}`}
              d={`M ${x1} ${y1} C ${x1} ${y1 + 16} ${x2} ${y2 - 16} ${x2} ${y2}`}
              fill="none"
              className="stroke-muted-foreground/50"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
          );
        })}
        {MESH_NODES.map((node) => {
          const spot = MESH_LAYOUT[node.id];
          return (
            <g key={node.id} className={TONE[spot.tone].text}>
              <rect x={spot.x} y={spot.y} width={MESH_W} height={MESH_H} rx="8" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.45" />
              <text x={spot.x + MESH_W / 2} y={spot.y + MESH_H / 2} textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="10.5" fontWeight="500">
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

function FeatureCard({ tone, icon, tag, title, desc, children }: { tone: Tone; icon: ReactNode; tag: string; title: string; desc: string; children: ReactNode }) {
  return (
    <Reveal>
      <article className={`rounded-3xl ${CARD} p-5`}>
        <Tag tone={tone}>{icon} {tag}</Tag>
        <h3 className="mt-3 text-xl font-bold leading-snug tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
        <div className="mt-4">{children}</div>
      </article>
    </Reveal>
  );
}

function FeaturesSection({ t }: { t: T }) {
  return (
    <section id="features" className={SECTION}>
      <SectionHeader eyebrow={t("kl.features.eyebrow")} title={t("kl.features.title")} sub={t("kl.features.sub")} />
      <div className="flex flex-col gap-4">
        <FeatureCard tone="lime" icon={<Kanban className="h-3.5 w-3.5" />} tag={t("kl.features.kanban.tag")} title={t("kl.features.kanban.title")} desc={t("kl.features.kanban.desc")}>
          <KanbanPreview />
        </FeatureCard>
        <FeatureCard tone="indigo" icon={<FileText className="h-3.5 w-3.5" />} tag={t("kl.features.docs.tag")} title={t("kl.features.docs.title")} desc={t("kl.features.docs.desc")}>
          <DocPreview />
        </FeatureCard>
        <FeatureCard tone="cyan" icon={<Orbit className="h-3.5 w-3.5" />} tag={t("kl.features.mesh.tag")} title={t("kl.features.mesh.title")} desc={t("kl.features.mesh.desc")}>
          <ul className="mb-4 flex flex-wrap gap-1.5">
            {MESH_PILLS.map((pill) => (
              <li key={pill} className={`rounded-full border px-2.5 py-1 text-[11px] ${TONE.cyan.text} ${TONE.cyan.soft}`}>{t(`kl.features.mesh.${pill}`)}</li>
            ))}
          </ul>
          <MeshPreview />
        </FeatureCard>
      </div>
    </section>
  );
}

// ─── AI ───────────────────────────────────────────────────────────────────────

const SCRIPT_TONE: Record<(typeof SCRIPT_STEPS)[number]["cls"], Tone> = {
  trigger: "lime",
  condition: "amber",
  action1: "indigo",
  action2: "cyan",
  end: "rose",
};

function ScriptStep({ step }: { step: (typeof SCRIPT_STEPS)[number] }) {
  const tone = TONE[SCRIPT_TONE[step.cls]];
  return (
    <div className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${tone.text} ${tone.soft}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{step.label}</span>
    </div>
  );
}

/** The desktop automation canvas as a top-to-bottom flow: trigger, condition, two actions, end. */
function ScriptFlow({ t }: { t: T }) {
  const step = (cls: (typeof SCRIPT_STEPS)[number]["cls"]) => SCRIPT_STEPS.find((item) => item.cls === cls)!;
  const line = <div className="mx-auto h-4 w-px bg-muted-foreground/40" />;
  return (
    <div className="rounded-2xl border border-border/70 bg-foreground/[0.03] p-4 [background-image:radial-gradient(circle,hsl(var(--ink)/0.1)_1px,transparent_1px)] [background-size:22px_22px]">
      <div aria-hidden="true" className="mx-auto max-w-[17rem]">
        <div className="mx-auto w-3/5"><ScriptStep step={step("trigger")} /></div>
        {line}
        <div className="mx-auto w-3/5"><ScriptStep step={step("condition")} /></div>
        {line}
        <div className="mx-auto h-px w-1/2 bg-muted-foreground/40" />
        <div className="grid grid-cols-2 gap-2">
          <div>{line}<ScriptStep step={step("action1")} />{line}</div>
          <div>{line}<ScriptStep step={step("action2")} />{line}</div>
        </div>
        <div className="mx-auto h-px w-1/2 bg-muted-foreground/40" />
        {line}
        <div className="mx-auto w-3/5"><ScriptStep step={step("end")} /></div>
      </div>
      <div className="mt-4 flex justify-center">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${TONE.indigo.text} ${TONE.indigo.soft}`}>
          <Sparkles className="h-3.5 w-3.5" /> {t("kl.ai.scriptBadge")}
        </span>
      </div>
    </div>
  );
}

function AISection({ t }: { t: T }) {
  return (
    <section id="ai" className={SECTION}>
      <SectionHeader eyebrow={t("kl.ai.eyebrow")} title={<>{t("kl.ai.title1")}<br />{t("kl.ai.title2")}</>} sub={t("kl.ai.sub")} />
      <Reveal>
        <ul className="flex flex-col gap-5">
          {AI_FEATURES.map((feature) => (
            <li key={feature.key} className="flex items-start gap-3.5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${TONE[feature.cls].text} ${TONE[feature.cls].soft}`}>
                <feature.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{t(`kl.ai.${feature.key}.title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`kl.ai.${feature.key}.desc`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal className="mt-6">
        <ScriptFlow t={t} />
      </Reveal>
    </section>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────

function IntegrationsSection({ t }: { t: T }) {
  return (
    <section id="integrations" className={SECTION}>
      <SectionHeader eyebrow={t("kl.integrations.eyebrow")} title={t("kl.integrations.title")} sub={t("kl.integrations.sub")} />
      <Reveal>
        <ul className="grid grid-cols-2 gap-2">
          {LANDING_INTEGRATIONS.map((integration) => (
            <li key={integration.key} className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-2xl border border-border/70 bg-card/70 px-3.5 text-sm font-medium">
              <integration.Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words leading-tight">{t(`kl.integrations.${integration.key}`)}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLAN_STYLE: Record<(typeof LANDING_PLANS)[number]["key"], { card: string; button: string }> = {
  free: {
    card: "border-border/70",
    button: "border border-border bg-foreground/5 text-foreground",
  },
  pro: {
    card: "border-indigo-500/50 shadow-[0_0_40px_-14px_rgba(99,102,241,0.55)]",
    button: "bg-indigo-500 text-white",
  },
  max: {
    card: "border-cyan-500/50 shadow-[0_0_36px_-14px_rgba(34,211,238,0.5)]",
    button: "bg-cyan-400 text-slate-950",
  },
};

function PricingSection({ t }: { t: T }) {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const titleId = useId();
  const yearly = cycle === "yearly";
  const toggle = (value: "monthly" | "yearly") =>
    `inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${cycle === value ? "bg-foreground text-background" : "text-muted-foreground"}`;

  return (
    <section id="pricing" className={SECTION}>
      <SectionHeader
        eyebrow={t("kl.pricing.eyebrow")}
        title={<span id={titleId}>{t("kl.pricing.title1")}<br />{t("kl.pricing.title2")}</span>}
        sub={t("kl.pricing.sub")}
      />

      <div role="group" aria-labelledby={titleId} className="mb-5 flex rounded-full border border-border/70 bg-foreground/[0.03] p-1">
        <button type="button" aria-pressed={!yearly} className={toggle("monthly")} onClick={() => setCycle("monthly")}>
          {t("kl.pricing.monthly")}
        </button>
        <button type="button" aria-pressed={yearly} className={toggle("yearly")} onClick={() => setCycle("yearly")}>
          {t("kl.pricing.yearly")}
          <span className="whitespace-nowrap rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">{t("kl.pricing.save")}</span>
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {LANDING_PLANS.map((plan) => {
          const base = `kl.pricing.${plan.key}`;
          const tone = TONE[plan.accent];
          const style = PLAN_STYLE[plan.key];
          const priceSub = !plan.paid
            ? t(`${base}.priceSub`)
            : yearly
              ? `${t(`${base}.priceSub`)} · ${t("kl.pricing.billedAnnually")}`
              : t(`${base}.priceSub`);
          return (
            <Reveal key={plan.key}>
              <article className={`rounded-3xl border bg-card p-5 ${style.card}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-extrabold tracking-tight">{t(`${base}.label`)}</h3>
                  {plan.paid ? (
                    <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${tone.text} ${tone.soft}`}>{t(`${base}.badge`)}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{t(`${base}.headline`)}</p>

                <div className="mt-4 border-b border-border/60 pb-4">
                  <p className="text-4xl font-black leading-none tracking-tight">{t(plan.paid && yearly ? `${base}.priceYearly` : `${base}.price`)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{priceSub}</p>
                  {plan.paid && yearly ? (
                    <p className={`mt-1 text-[11px] font-bold ${TONE.indigo.text}`}>{t("kl.pricing.vsMonthly", { price: t(`${base}.price`) })}</p>
                  ) : null}
                </div>

                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("kl.pricing.included")}</p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground/85">
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${tone.text} ${tone.soft}`}>
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      {t(`${base}.${feature}`)}
                    </li>
                  ))}
                </ul>

                <Link href="/signup" className={`mt-5 flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-bold ${style.button}`}>
                  {t(`${base}.cta`)}
                </Link>
              </article>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="mt-4">
        <div className={`rounded-2xl ${CARD} p-5`}>
          <h3 className="text-lg font-bold">{t("kl.pricing.enterprise.title")}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("kl.pricing.enterprise.sub")}</p>
          <a href={SALES_MAILTO} className={`${BTN_OUTLINE} mt-4 w-full`}>
            {t("kl.pricing.enterprise.cta")}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </Reveal>
    </section>
  );
}

// ─── "Every detail" strip ─────────────────────────────────────────────────────

function StripSection({ t }: { t: T }) {
  return (
    <section className={SECTION}>
      <SectionHeader eyebrow={t("kl.strip.eyebrow")} title={t("kl.strip.title")} />
      <Reveal>
        <ul className={`overflow-hidden rounded-3xl ${CARD} divide-y divide-border/60`}>
          {STRIP_ITEMS.map((item) => (
            <li key={item.key} className="flex items-start gap-3.5 p-4">
              <item.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ACCENT_TEXT}`} />
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold">{t(`kl.strip.${item.key}.title`)}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t(`kl.strip.${item.key}.desc`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

// ─── Killio App + final call to action ────────────────────────────────────────

function AppDownloadCard() {
  const t = useTranslations("download");
  return (
    <section className="px-4 py-6">
      <Reveal>
        <div className={`rounded-3xl ${CARD} p-5`}>
          <div className="flex items-center gap-2 text-base font-semibold">
            <Smartphone className={`h-4 w-4 ${ACCENT_TEXT}`} />
            {t("mobile.title")}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("mobile.description")}</p>
          <Link href="/download" className={`${BTN_OUTLINE} mt-4 w-full`}>
            <Download className="h-4 w-4" />
            {t("mobile.cta")}
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function FinalCta({ t }: { t: T }) {
  return (
    <section className="px-4 pb-14 pt-6">
      <Reveal>
        <div className="rounded-3xl border border-[hsl(var(--accent-ink)/0.3)] bg-[linear-gradient(135deg,hsl(var(--accent-ink)/0.12),hsl(var(--ink)/0.02))] px-5 py-10 text-center">
          <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${ACCENT_TEXT}`}>{t("kl.cta.eyebrow")}</p>
          <h2 className="mt-3 text-balance text-[1.7rem] font-bold leading-tight tracking-tight">
            {t("kl.cta.title1")}
            <br />
            {t("kl.cta.title2")}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t("kl.cta.sub")}</p>
          <div className="mt-6 flex flex-col gap-2.5">
            <Link href="/signup" className={`${BTN_PRIMARY} h-12`}>
              {t("kl.cta.primary")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#pricing" className={`${BTN_OUTLINE} h-12`}>{t("kl.cta.secondary")}</a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function MobileFooter({ t }: { t: T }) {
  const tenant = useTenant();
  // Same rule as components/marketing/public-footer.tsx: a tenant shows its own support address or none.
  const contactHref = tenant.mode === "tenant" ? (tenant.brand.supportEmail ? `mailto:${tenant.brand.supportEmail}` : null) : "mailto:killio@kynto.studio";
  const link = "flex min-h-11 items-center text-sm text-muted-foreground active:text-foreground";
  return (
    <footer className="border-t border-border/70 px-4 pb-8 pt-6">
      <Link href="/" className="flex min-h-11 items-center gap-2">
        <Logo className="h-5 w-auto" />
        <span className="text-sm font-semibold tracking-tight text-muted-foreground"><BrandName /></span>
      </Link>
      <nav className="mt-2 grid grid-cols-2 gap-x-4">
        <Link href="/download" className={link}>{t("kl.footer.download")}</Link>
        <Link href="/privacy" className={link}>{t("kl.footer.privacy")}</Link>
        <Link href="/terms" className={link}>{t("kl.footer.terms")}</Link>
        <Link href="/cookies" className={link}>{t("kl.footer.cookies")}</Link>
        {contactHref ? <a href={contactHref} className={link}>{t("kl.footer.contact")}</a> : null}
      </nav>
      <p className="mt-4 text-xs text-muted-foreground/70">{t("kl.footer.copyright")}</p>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPageMobile() {
  const t = useTranslations("landing");

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[26rem]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--accent-ink)/0.16),transparent_65%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--ink)/0.04)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--ink)/0.04)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:radial-gradient(circle_at_top,black,transparent_75%)]" />
      </div>

      <TopBar t={t} />

      <main className="relative mx-auto w-full max-w-md">
        <Hero t={t} />
        <FeaturesSection t={t} />
        <AISection t={t} />
        <IntegrationsSection t={t} />
        <PricingSection t={t} />
        <StripSection t={t} />
        <AppDownloadCard />
        <FinalCta t={t} />
      </main>

      <div className="relative mx-auto w-full max-w-md">
        <MobileFooter t={t} />
      </div>
    </div>
  );
}
