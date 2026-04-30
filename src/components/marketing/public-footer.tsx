"use client";

import Link from "next/link";
import { useTranslations } from "@/components/providers/i18n-provider";

type PublicFooterProps = {
  className?: string;
};

export function PublicFooter({ className = "" }: PublicFooterProps) {
  const tLanding = useTranslations("landing");
  const tLegal = useTranslations("legal");

  return (
    <footer className={`border-t border-border/60 bg-background/80 ${className}`.trim()}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-tight text-foreground">{tLanding("copyright")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tLanding("footerNote")}</p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Link href="/terms" className="transition-colors hover:text-foreground">
            {tLegal("links.terms")}
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            {tLegal("links.privacy")}
          </Link>
          <Link href="/cookies" className="transition-colors hover:text-foreground">
            {tLegal("links.cookies")}
          </Link>
          <Link href="/login" className="transition-colors hover:text-foreground">
            {tLanding("cta.secondary")}
          </Link>
          <Link href="/signup" className="transition-colors hover:text-foreground">
            {tLanding("cta.primary")}
          </Link>
        </nav>
      </div>
    "use client";

    import Link from "next/link";
    import { useTranslations } from "@/components/providers/i18n-provider";

    type PublicFooterProps = {
      className?: string;
    };

    export function PublicFooter({ className = "" }: PublicFooterProps) {
      const t = useTranslations("landing");

      return (
        <footer
          className={`border-t border-border/60 bg-background/80 backdrop-blur-sm ${className}`.trim()}
        >
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-5 md:grid-cols-3 md:items-center">
            <Link href="/" className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80">
              <img src="/killio_white.webp" alt="Killio" className="h-5 w-auto" />
              <span className="text-sm font-semibold tracking-tight">Killio</span>
            </Link>

            <nav className="flex flex-wrap items-center justify-start gap-x-5 gap-y-2 text-sm text-muted-foreground md:justify-center">
              <Link href="/privacy" className="transition-colors hover:text-foreground">
                {t("kl.footer.privacy")}
              </Link>
              <Link href="/terms" className="transition-colors hover:text-foreground">
                {t("kl.footer.terms")}
              </Link>
              <Link href="/cookies" className="transition-colors hover:text-foreground">
                {t("kl.footer.cookies")}
              </Link>
              <Link href="mailto:killio@kynto.studio" className="transition-colors hover:text-foreground">
                {t("kl.footer.contact")}
              </Link>
            </nav>

            <p className="text-xs text-muted-foreground md:text-right">
              {t("kl.footer.copyright")}
            </p>
          </div>
        </footer>
      );
    }