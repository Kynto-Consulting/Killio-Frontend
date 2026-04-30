"use client";

import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";

const highlights = [
  {
    icon: Workflow,
    key: "flow",
  },
  {
    icon: Bot,
    key: "ai",
  },
  {
    icon: ShieldCheck,
    key: "teams",
  },
] as const;

export default function LandingPageMobile() {
  const t = useTranslations("landing");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,rgba(216,255,114,0.18),transparent_62%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/killio_white.webp" alt="Killio" className="h-6 w-auto" />
            <span className="text-base font-semibold tracking-tight">Killio</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/login" className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-medium">
              {t("cta.secondary")}
            </Link>
            <Link href="/signup" className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">
              {t("cta.primary")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
        <section className="rounded-3xl border border-border/70 bg-card/70 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <div className="inline-flex items-center gap-1 rounded-full border border-[#d8ff72]/30 bg-[#d8ff72]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d8ff72]">
            <Sparkles className="h-3 w-3" />
            {t("mobile.badge")}
          </div>

          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">
            {t("mobile.hero.titleLine1")}
            <span className="block text-[#d8ff72]">{t("mobile.hero.titleLine2")}</span>
          </h1>

          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {t("mobile.hero.subtitle")}
          </p>

          <div className="mt-6 flex gap-2">
            <Link href="/signup" className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
              {t("mobile.hero.primaryCta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-medium">
              {t("cta.secondary")}
            </Link>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2">
          <article className="rounded-2xl border border-border/60 bg-card/60 p-3 text-center">
            <p className="text-lg font-semibold">2.4k+</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t("metrics.teams.label")}</p>
          </article>
          <article className="rounded-2xl border border-border/60 bg-card/60 p-3 text-center">
            <p className="text-lg font-semibold">1.2M</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t("metrics.actions.label")}</p>
          </article>
          <article className="rounded-2xl border border-border/60 bg-card/60 p-3 text-center">
            <p className="text-lg font-semibold">99.9%</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t("metrics.uptime.label")}</p>
          </article>
        </section>

        <section className="mt-5 space-y-3">
          {highlights.map((item) => (
            <article key={item.key} className="rounded-2xl border border-border/60 bg-card/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <item.icon className="h-4 w-4 text-[#d8ff72]" />
                {t(`mobile.highlights.${item.key}.title`)}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`mobile.highlights.${item.key}.description`)}</p>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-3xl border border-border/70 bg-[linear-gradient(135deg,rgba(216,255,114,0.12),rgba(255,255,255,0.03))] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#d8ff72]">{t("mobile.launch.kicker")}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{t("mobile.launch.title")}</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#d8ff72]" />
              {t("mobile.launch.points.one")}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#d8ff72]" />
              {t("mobile.launch.points.two")}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#d8ff72]" />
              {t("mobile.launch.points.three")}
            </li>
          </ul>

          <Link href="/signup" className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {t("mobile.launch.cta")}
          </Link>
        </section>

        <footer className="mt-8 border-t border-border/70 pt-4 text-center text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-3">
            <Link href="/privacy" className="hover:text-foreground">{t("nav.privacy")}</Link>
            <Link href="/terms" className="hover:text-foreground">{t("nav.terms")}</Link>
            <Link href="/cookies" className="hover:text-foreground">{t("nav.cookies")}</Link>
          </div>
          <p className="mt-3">{t("copyright")}</p>
        </footer>
      </main>
    </div>
  );
}
