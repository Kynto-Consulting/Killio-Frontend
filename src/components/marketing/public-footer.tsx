
    "use client";

    import Link from "next/link";
    import { BrandLogo, BrandName } from "@/components/marketing/brand-logo";
    import { useTranslations } from "@/components/providers/i18n-provider";
    import { useTenant } from "@/components/providers/tenant-provider";

    type PublicFooterProps = {
      className?: string;
    };

    export function PublicFooter({ className = "" }: PublicFooterProps) {
      const t = useTranslations("landing");
      const tenant = useTenant();
      const isTenant = tenant.mode === "tenant";
      const contactHref = isTenant ? (tenant.brand.supportEmail ? `mailto:${tenant.brand.supportEmail}` : null) : "mailto:killio@kynto.studio";

      return (
        <footer
          className={`border-t border-border/60 bg-background/80 backdrop-blur-sm ${className}`.trim()}
        >
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-5 md:grid-cols-3 md:items-center">
            <Link href="/" className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80">
              <BrandLogo className="h-5 w-auto" />
              <span className="text-sm font-semibold tracking-tight"><BrandName /></span>
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
              <Link href="/credits" className="transition-colors hover:text-foreground">
                {t("kl.footer.credits")}
              </Link>
              {contactHref && (
                <Link href={contactHref} className="transition-colors hover:text-foreground">
                  {t("kl.footer.contact")}
                </Link>
              )}
            </nav>

            <p className={`text-xs text-muted-foreground md:text-right ${isTenant && tenant.poweredBy.show ? "md:pr-28" : ""}`.trim()}>
              {isTenant ? (tenant.landing.footerText || `© ${new Date().getFullYear()} ${tenant.brand.name}`) : t("kl.footer.copyright")}
            </p>
          </div>
        </footer>
      );
    }