import type { Metadata } from "next";
import { VaultMarketingPage } from "@/components/vault/vault-marketing-page";
import { getI18nText } from "@/i18n";

/**
 * Public Killio Vault marketing route.
 *
 * Unauthenticated and indexable. Allow-listed in `src/middleware.ts` so the
 * cookie-presence redirect doesn't punt anonymous visitors to /login.
 *
 * Metadata is exported from this server component (the actual page body is
 * a client component because the mockups consume the I18nProvider via
 * useTranslations).
 */
export const metadata: Metadata = {
  title:
    getI18nText("en", "vault", "meta.title") ??
    "Killio Vault — Android-first AI companion",
  description:
    getI18nText("en", "vault", "meta.description") ??
    "Vault turns your Android phone into a 24/7 AI workspace.",
  alternates: {
    canonical: "/vault",
  },
  openGraph: {
    type: "website",
    url: "/vault",
    title:
      getI18nText("en", "vault", "meta.ogTitle") ??
      "Killio Vault — your phone as a 24/7 AI workspace",
    description:
      getI18nText("en", "vault", "meta.ogDescription") ??
      "On-device audio diary, push-to-talk assistant with wake-word, local agents with RAG memory.",
    siteName: "Killio",
  },
  twitter: {
    card: "summary_large_image",
    title:
      getI18nText("en", "vault", "meta.ogTitle") ??
      "Killio Vault — your phone as a 24/7 AI workspace",
    description:
      getI18nText("en", "vault", "meta.ogDescription") ??
      "On-device audio diary, push-to-talk assistant with wake-word, local agents with RAG memory.",
  },
};

export default function VaultPage() {
  return <VaultMarketingPage />;
}
