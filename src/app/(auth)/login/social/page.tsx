"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { postLoginDestination } from "@/lib/auth/password-change";
import { appHandoffUrl, clearExchangeVerifier, exchangeSocialCode, readExchangeVerifier, safeReturnPath } from "@/lib/auth/social-login";
import { isKillioApp } from "@/lib/app-shell";

/** Landing page of a social sign-in: trades the one-time code (+ the secret this browser kept) for a session. */
function SocialCompleteContent() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useSession();
  const [error, setError] = useState<string | null>(null);
  // Set when this browser received a sign-in it did not start: one started in Killio App.
  const [handoff, setHandoff] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // React strict mode: the code is single use
    ran.current = true;
    const code = params.get("code");
    const verifier = readExchangeVerifier();
    // Remove the code from the address bar/history right away.
    window.history.replaceState(null, "", window.location.pathname);
    if (code && !verifier && !isKillioApp()) {
      // A browser always holds the secret for a sign-in it started. Having the code without it means the
      // sign-in began in Killio App, which opened this browser: give the code back to the app.
      const link = appHandoffUrl(code, window.location.origin);
      setHandoff(link);
      window.location.href = link;
      return;
    }
    if (!code || !verifier) {
      setError(t("login.socialErrors.invalid_exchange"));
      return;
    }
    exchangeSocialCode(code, verifier)
      .then((data) => {
        clearExchangeVerifier();
        localStorage.setItem("killio_user", JSON.stringify(data.user));
        login(data.user, data.accessToken, data.refreshToken, data.expiresInSeconds);
        router.replace(postLoginDestination(data.user, safeReturnPath(data.returnTo)));
      })
      .catch(() => {
        clearExchangeVerifier();
        setError(t("login.socialErrors.invalid_exchange"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthPageFrame mode="login">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        {handoff ? (
          <div className="space-y-4">
            <p className="text-base font-semibold">{t("login.appHandoff.title")}</p>
            <p className="text-sm text-muted-foreground">{t("login.appHandoff.desc")}</p>
            <a href={handoff} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {t("login.appHandoff.open")}
            </a>
            <p className="text-xs text-muted-foreground">
              {t("login.appHandoff.notApp")}{" "}
              <Link href="/login" className="font-medium text-accent hover:underline">{t("login.bloomxBackToLogin")}</Link>
            </p>
          </div>
        ) : error ? (
          <>
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-left text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
            <Link href="/login" className="text-sm font-medium text-accent hover:underline">
              {t("login.bloomxBackToLogin")}
            </Link>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t("login.socialFinishing")}</span>
          </div>
        )}
      </div>
    </AuthPageFrame>
  );
}

export default function SocialCompletePage() {
  return (
    <Suspense fallback={null}>
      <SocialCompleteContent />
    </Suspense>
  );
}
