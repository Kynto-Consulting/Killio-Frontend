"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { verifyOtp } from "@/lib/api/contracts";

function VerifyOtpContent() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useSession();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get("token") || "";
  const from = searchParams.get("from") || "/";
  const safeFrom = useMemo(() => {
    if (!from || !from.startsWith("/")) {
      return "/";
    }
    return from;
  }, [from]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus("error");
        setError(t("otp.invalidLink"));
        return;
      }

      try {
        const result = await verifyOtp({
          token,
          purpose: "login",
          autoRegister: true,
          rememberMe: true,
        });

        if (!cancelled && "accessToken" in result) {
          document.cookie = `killio_token=${result.accessToken}; path=/; max-age=${result.expiresInSeconds}`;
          localStorage.setItem("killio_refresh", result.refreshToken);
          localStorage.setItem("killio_user", JSON.stringify(result.user));
          login(result.user, result.accessToken, result.refreshToken);
          setStatus("success");
          router.replace(safeFrom);
          return;
        }

        if (!cancelled) {
          setStatus("error");
          setError(t("otp.invalidLink"));
        }
      } catch (unknownError: unknown) {
        if (!cancelled) {
          const message = unknownError instanceof Error ? unknownError.message : t("otp.verifyError");
          setError(message || t("otp.verifyError"));
          setStatus("error");
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [token, login, router, safeFrom, t]);

  return (
    <AuthPageFrame mode="login">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("otp.verifyingTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("otp.verifyingSubtitle")}</p>
        </div>

        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{tCommon("actions.loading")}</span>
          </div>
        )}

        {status === "success" && (
          <div className="flex items-center justify-center gap-2 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>{t("otp.success")}</span>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error ?? t("otp.verifyError")}</span>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-accent hover:underline">
                {t("otp.backToLogin")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthPageFrame>
  );
}

function VerifyOtpFallback() {
  const tCommon = useTranslations("common");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{tCommon("actions.loading")}</span>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<VerifyOtpFallback />}>
      <VerifyOtpContent />
    </Suspense>
  );
}
