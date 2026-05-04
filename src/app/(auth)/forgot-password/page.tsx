"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle, Mail, KeyRound } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useTranslations } from "@/components/providers/i18n-provider";
import { requestOtp } from "@/lib/api/contracts";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        setError(t("reset.emailRequired"));
        return;
      }

      const result = await requestOtp({
        email: normalizedEmail,
        purpose: "password_reset",
      });

      setRequested(true);
      setNotice(t("reset.codeSent", { minutes: result.expiresInMinutes }));
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : t("reset.requestError");
      setError(message || t("reset.requestError"));
    } finally {
      setIsLoading(false);
    }
  }

  function handleContinueToChange(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError(t("reset.emailRequired"));
      return;
    }
    if (!code.trim()) {
      setError(t("reset.codeRequired"));
      return;
    }

    router.push(`/change-password?email=${encodeURIComponent(normalizedEmail)}&code=${encodeURIComponent(code.trim())}`);
  }

  return (
    <AuthPageFrame mode="login">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("reset.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("reset.subtitle")}</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            {notice}
          </div>
        )}

        {!requested ? (
          <form className="space-y-4" onSubmit={handleRequestCode}>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="email">
                {t("reset.emailLabel")}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("reset.emailPlaceholder")}
                  autoComplete="email"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary group disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {t("reset.sendCode")}
                  <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-all" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleContinueToChange}>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="resetCode">
                {t("reset.codeLabel")}
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  id="resetCode"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("reset.codePlaceholder")}
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary group disabled:opacity-60"
            >
              {t("reset.continueToChange")}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t("reset.backToLogin")}
          </Link>
        </div>
      </div>
    </AuthPageFrame>
  );
}
