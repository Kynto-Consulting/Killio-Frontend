"use client";

import Link from "next/link";
import { ArrowRight, Check, Crown, Rocket, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { PublicFooter } from "@/components/marketing/public-footer";

const PUBLIC_ROUTE_LINKS = [
  { key: "home", href: "/" },
  { key: "login", href: "/login" },
  { key: "signup", href: "/signup" },
  { key: "terms", href: "/terms" },
  { key: "privacy", href: "/privacy" },
  { key: "cookies", href: "/cookies" },
  { key: "offline", href: "/offline" },
] as const;

export function KillioLanding() {
  const t = useTranslations("landing");

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_top,rgba(216,255,114,0.18),transparent_62%)]" />
        <div className="absolute -left-24 top-16 h-[26rem] w-[26rem] rounded-full bg-[#d8ff72]/10 blur-3xl" />
        <div className="absolute right-0 top-20 h-[24rem] w-[24rem] rounded-full bg-[#3a4722]/30 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:84px_84px] [mask-image:radial-gradient(circle_at_center,black,transparent_80%)]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-85">
            <img src="/killio_white.webp" alt="Killio" className="h-7 w-auto" />
            <span className="text-lg font-semibold tracking-tight">Killio</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#pricing" className="transition-colors hover:text-foreground">{t("nav.pricing")}</a>
            <Link href="/privacy" className="transition-colors hover:text-foreground">{t("nav.privacy")}</Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">{t("nav.terms")}</Link>
            <Link href="/cookies" className="transition-colors hover:text-foreground">{t("nav.cookies")}</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-accent/10">
              {t("cta.secondary")}
            </Link>
            <Link href="/signup" className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              {t("cta.primary")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 pb-20 pt-10 md:pt-14">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
          <article className="rounded-[30px] border border-border/70 bg-card/65 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.28)] backdrop-blur-sm md:p-8">
            <span className="inline-flex rounded-full border border-[#d8ff72]/35 bg-[#d8ff72]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#d8ff72]">
              {t("badge")}
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">{t("headline")}</h1>
            <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">{t("subheadline")}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                {t("cta.primary")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#pricing" className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-accent/10">
                {t("pricing.jumpCta")}
              </a>
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
              <Sparkles className="h-3.5 w-3.5" />
              {t("pricing.noProNotice")}
            </div>
          </article>

          <article className="rounded-[30px] border border-border/70 bg-card/65 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.28)] backdrop-blur-sm md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("proof.title")}</p>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                <p className="text-2xl font-semibold">{t("metrics.teams.value")}</p>
                <p className="text-sm text-muted-foreground">{t("metrics.teams.label")}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                <p className="text-2xl font-semibold">{t("metrics.actions.value")}</p>
                <p className="text-sm text-muted-foreground">{t("metrics.actions.label")}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                <p className="text-2xl font-semibold">{t("metrics.uptime.value")}</p>
                <p className="text-sm text-muted-foreground">{t("metrics.uptime.label")}</p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-border/70 bg-card/70 p-5 backdrop-blur-sm">
            <Workflow className="h-5 w-5 text-[#d8ff72]" />
            <h3 className="mt-3 text-lg font-semibold">{t("features.focus.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("features.focus.description")}</p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-card/70 p-5 backdrop-blur-sm">
            <Rocket className="h-5 w-5 text-[#d8ff72]" />
            <h3 className="mt-3 text-lg font-semibold">{t("features.ai.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("features.ai.description")}</p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-card/70 p-5 backdrop-blur-sm">
            <ShieldCheck className="h-5 w-5 text-[#d8ff72]" />
            <h3 className="mt-3 text-lg font-semibold">{t("features.trust.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("features.trust.description")}</p>
          </article>
        </section>

        <section id="pricing" className="mt-14 rounded-[32px] border border-border/70 bg-card/70 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.3)] backdrop-blur-sm md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d8ff72]">{t("pricing.label")}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t("pricing.title")}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">{t("pricing.subtitle")}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-border/70 bg-background/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">{t("pricing.free.name")}</h3>
                <span className="rounded-full border border-border/70 px-3 py-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("pricing.free.badge")}</span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{t("pricing.free.price")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("pricing.free.description")}</p>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[#d8ff72]" />{t("pricing.free.limit1")}</li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[#d8ff72]" />{t("pricing.free.limit2")}</li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[#d8ff72]" />{t("pricing.free.limit3")}</li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[#d8ff72]" />{t("pricing.free.limit4")}</li>
              </ul>
              <Link href="/signup" className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                {t("pricing.free.cta")}
              </Link>
            </article>

            <article className="rounded-2xl border border-[#d8ff72]/45 bg-[linear-gradient(160deg,rgba(216,255,114,0.12),rgba(255,255,255,0.03))] p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">{t("pricing.enterprise.name")}</h3>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#d8ff72]/45 bg-[#d8ff72]/10 px-3 py-1 text-xs uppercase tracking-[0.14em] text-[#d8ff72]">
                  <Crown className="h-3.5 w-3.5" />
                  {t("pricing.enterprise.badge")}
                </span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{t("pricing.enterprise.price")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("pricing.enterprise.description")}</p>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[#d8ff72]" />{t("pricing.enterprise.limit1")}</li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[#d8ff72]" />{t("pricing.enterprise.limit2")}</li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[#d8ff72]" />{t("pricing.enterprise.limit3")}</li>
                <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[#d8ff72]" />{t("pricing.enterprise.limit4")}</li>
              </ul>
              <a href="mailto:sales@killio.com" className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-border bg-background/70 px-5 text-sm font-semibold transition-colors hover:bg-accent/10">
                {t("pricing.enterprise.cta")}
              </a>
            </article>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-border/70 bg-card/65 p-5 md:p-6">
          <h2 className="text-xl font-semibold tracking-tight">{t("routes.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("routes.subtitle")}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PUBLIC_ROUTE_LINKS.map((route) => (
              <Link key={route.key} href={route.href} className="inline-flex items-center justify-between rounded-xl border border-border/70 bg-background/75 px-4 py-3 text-sm transition-colors hover:border-[#d8ff72]/40 hover:bg-card">
                <span>{t(`routes.links.${route.key}`)}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-[30px] border border-border/70 bg-[linear-gradient(135deg,rgba(216,255,114,0.08),rgba(255,255,255,0.02))] p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d8ff72]">{t("final.kicker")}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t("final.title")}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">{t("final.description")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                {t("cta.finalPrimary")}
              </Link>
              <Link href="/terms" className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-accent/10">
                {t("cta.finalSecondary")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
