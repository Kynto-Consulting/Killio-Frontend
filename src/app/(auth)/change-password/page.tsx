"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useTranslations } from "@/components/providers/i18n-provider";
import { resetPasswordWithOtp } from "@/lib/api/contracts";

export default function ChangePasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialEmail = useMemo(() => searchParams.get("email") ?? "", [searchParams]);
  const initialCode = useMemo(() => searchParams.get("code") ?? "", [searchParams]);
  const initialToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();
    const normalizedToken = token.trim();

    if (!normalizedToken && !normalizedCode) {
      setError(t("reset.codeRequired"));
      return;
    }

    if (!normalizedToken && !normalizedEmail) {
      setError(t("reset.emailRequired"));
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setError(t("reset.passwordMin"));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(t("reset.passwordMismatch"));
      return;
    }

    setIsLoading(true);
    try {
      await resetPasswordWithOtp({
        email: normalizedToken ? undefined : normalizedEmail,
        code: normalizedToken ? undefined : normalizedCode,
        token: normalizedToken || undefined,
        newPassword,
      });

      setSuccess(t("reset.success"));
      setTimeout(() => {
        router.push("/login");
      }, 1400);
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : t("reset.resetError");
      setError(message || t("reset.resetError"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthPageFrame mode="login">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("change.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("change.subtitle")}</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {!token && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="email">
                  {t("reset.emailLabel")}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("reset.emailPlaceholder")}
                  autoComplete="email"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="code">
                  {t("reset.codeLabel")}
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("reset.codePlaceholder")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                />
              </div>
            </>
          )}

          {token && (
            <div className="rounded-lg border border-border/70 bg-background/50 p-3 text-xs text-muted-foreground">
              {t("change.tokenMode")}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="newPassword">
              {t("reset.newPasswordLabel")}
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="confirmNewPassword">
              {t("reset.confirmPasswordLabel")}
            </label>
            <input
              id="confirmNewPassword"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            />
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
                {t("change.submit")}
                <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-all" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t("reset.backToLogin")}
          </Link>
        </div>
      </div>
    </AuthPageFrame>
  );
}
