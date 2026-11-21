"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { useI18n } from "@/components/providers/i18n-provider";
import { useTenant } from "@/components/providers/tenant-provider";

const FALLBACKS = {
  es: { headline: (name: string) => `Bienvenido a ${name}`, cta: "Entrar", signup: "Crear cuenta" },
  en: { headline: (name: string) => `Welcome to ${name}`, cta: "Sign in", signup: "Create account" },
} as const;

/** Landing for a white-label deployment: the customer's brand, one call to action, optional feature list. */
export function TenantLanding() {
  const tenant = useTenant();
  const { locale } = useI18n();
  const text = locale === "es" ? FALLBACKS.es : FALLBACKS.en;
  const { brand, landing, auth } = tenant;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo className="h-7 w-auto" />
            <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
          </Link>
          <nav className="flex items-center gap-2">
            {landing.navLinks.map((link) => (
              <a key={link.url + link.label} href={link.url} target={link.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="hidden h-9 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-flex">
                {link.label}
              </a>
            ))}
            {auth.signupEnabled ? (
              <Link href="/signup" className="hidden h-9 items-center rounded-full px-4 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">
                {text.signup}
              </Link>
            ) : null}
            <Link href="/login" className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
              {landing.primaryCtaLabel || text.cta}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-6 py-20 text-center md:py-28">
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{landing.headline || text.headline(brand.name)}</h1>
          {landing.subheadline || brand.tagline ? (
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{landing.subheadline || brand.tagline}</p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="group inline-flex h-12 items-center rounded-full bg-primary px-7 text-base font-medium text-primary-foreground shadow transition-opacity hover:opacity-90">
              {landing.primaryCtaLabel || text.cta}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            {landing.secondaryCta ? (
              <a href={landing.secondaryCta.url} target={landing.secondaryCta.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="inline-flex h-12 items-center rounded-full border border-border px-7 text-base font-medium transition-colors hover:bg-accent/10">
                {landing.secondaryCta.label}
              </a>
            ) : null}
          </div>
          {landing.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={landing.heroImageUrl} alt="" className="mx-auto mt-12 max-h-80 w-auto rounded-2xl border border-border object-contain shadow-sm" />
          ) : null}
        </section>

        {landing.features.length > 0 ? (
          <section className="mx-auto w-full max-w-6xl px-6 pb-24">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {landing.features.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="font-semibold">{feature.title}</h2>
                  {feature.description ? <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>{landing.footerText || `© ${new Date().getFullYear()} ${brand.name}`}</span>
          <div className="flex items-center gap-4">
            {landing.legalLinks.map((link) => (
              <a key={link.url} href={link.url} className="hover:text-foreground" target={link.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
            {brand.supportEmail ? <a href={`mailto:${brand.supportEmail}`} className="hover:text-foreground">{brand.supportEmail}</a> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
