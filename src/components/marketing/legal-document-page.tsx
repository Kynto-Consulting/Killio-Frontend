"use client";

import Link from "next/link";
import { ChevronLeft, FileText, Lock, ScrollText } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { PublicFooter } from "@/components/marketing/public-footer";

type LegalPageKey = "privacy" | "terms" | "cookies";

type LegalDocumentPageProps = {
  page: LegalPageKey;
};

const PAGE_ICONS = {
  privacy: Lock,
  terms: ScrollText,
  cookies: FileText,
} as const;

const PAGE_SECTIONS = {
  privacy: ["collection", "usage", "sharing", "retention", "rights"],
  terms: ["access", "accounts", "acceptableUse", "ownership", "termination"],
  cookies: ["whatTheyAre", "howWeUse", "choices", "thirdParties", "updates"],
} as const;

export function LegalDocumentPage({ page }: LegalDocumentPageProps) {
  const tLegal = useTranslations("legal");
  const tLanding = useTranslations("landing");
  const Icon = PAGE_ICONS[page];
  const sections = PAGE_SECTIONS[page];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(216,255,114,0.14),transparent_56%)]" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(58,71,34,0.24),transparent_62%)]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <img src="/killio_white.webp" alt="Killio" className="h-7 w-auto" />
            <span className="text-lg font-semibold tracking-tight">Killio</span>
          </Link>

          <div className="flex items-center gap-2 text-sm">
            <Link href="/login" className="inline-flex h-9 items-center rounded-full border border-border/70 px-4 text-muted-foreground transition-colors hover:text-foreground">
              {tLegal("nav.login")}
            </Link>
            <Link href="/signup" className="inline-flex h-9 items-center rounded-full bg-primary px-4 font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              {tLegal("nav.signup")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-10 md:pt-14">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Link href="/" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            {tLegal("nav.backHome")}
          </Link>
          <span className="hidden md:inline">/</span>
          <span>{tLegal(`shared.path.${page}`)}</span>
        </div>

        <section className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="rounded-[28px] border border-border/60 bg-card/70 p-6 backdrop-blur-sm">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d8ff72]/15 text-[#d8ff72] shadow-[0_0_30px_rgba(216,255,114,0.12)]">
              <Icon className="h-6 w-6" />
            </div>
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#d8ff72]">
              {tLegal(`pages.${page}.eyebrow`)}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              {tLegal(`pages.${page}.title`)}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {tLegal(`pages.${page}.intro`)}
            </p>

            <div className="mt-8 rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {tLegal("shared.lastUpdatedLabel")}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">{tLegal(`pages.${page}.updated`)}</p>
            </div>

            <div className="mt-4 rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {tLegal("shared.platform")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{tLanding("subheadline")}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-border/60 bg-card/70 p-6 backdrop-blur-sm md:p-8">
            <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {tLegal("shared.contents")}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {sections.map((section) => (
                  <div key={section} className="rounded-2xl border border-border/50 bg-card/60 p-4">
                    <p className="text-sm font-semibold text-foreground">
                      {tLegal(`pages.${page}.sections.${section}.title`)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {tLegal(`pages.${page}.sections.${section}.body`)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border/60 bg-background/70 p-5">
              <p className="text-sm font-semibold text-foreground">{tLegal("shared.needHelpTitle")}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{tLegal(`pages.${page}.contact`)}</p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}