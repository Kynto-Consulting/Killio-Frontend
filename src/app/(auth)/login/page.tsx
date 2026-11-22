"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTenant } from "@/components/providers/tenant-provider";
import { requestOtp, verifyOtp } from "@/lib/api/contracts";
import { postLoginDestination } from "@/lib/auth/password-change";
import { fetchSocialProviders, SocialAvailability, startSocialLogin } from "@/lib/auth/social-login";

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, accessToken, isLoading: isSessionLoading } = useSession();
  const t = useTranslations("auth");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // White-label login modes: "password" (default), "otp" (emailed code only) or both.
  const tenant = useTenant();
  const { loginMode, signupEnabled } = tenant.auth;
  const allowPassword = loginMode !== "otp";
  const allowCode = loginMode === "otp" || loginMode === "password_or_otp";
  const [preferredMethod, setPreferredMethod] = useState<"password" | "code">(loginMode === "otp" ? "code" : "password");
  const [codeSent, setCodeSent] = useState(false);
  // true when the person already has a code (an invitation, or one sent earlier): no new code is requested
  const [haveCode, setHaveCode] = useState(false);
  const [code, setCode] = useState("");
  // Stay inside what the tenant allows even if the config changes after first render.
  const method: "password" | "code" = !allowCode ? "password" : !allowPassword ? "code" : preferredMethod;

  const from = searchParams.get("from");
  const fromPath = from ? from.split("?")[0] : null;
  const safeFrom = useMemo(() => {
    if (!from || !from.startsWith("/")) {
      return "/";
    }
    if (fromPath === "/login" || fromPath === "/signup") {
      return "/";
    }
    return from;
  }, [from, fromPath]);

  // Google / Microsoft / Bloomx buttons: only the ones the workspace and the server offer.
  const [social, setSocial] = useState<SocialAvailability>({ google: false, microsoft: false, bloomx: false });
  useEffect(() => {
    let alive = true;
    void fetchSocialProviders().then((p) => alive && setSocial(p));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const code = searchParams.get("social_error");
    if (!code) return;
    const key = `login.socialErrors.${code}`;
    const text = t(key);
    setError(text === key ? t("login.socialFailed") : text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const hasSocial = social.google || social.microsoft || social.bloomx;
  const bloomxHref = safeFrom !== "/" ? `/login/bloomx?from=${encodeURIComponent(safeFrom)}` : "/login/bloomx";

  const signupHref = safeFrom !== "/" ? `/signup?from=${encodeURIComponent(safeFrom)}` : "/signup";

  useEffect(() => {
    if (!isSessionLoading && user && accessToken) {
      router.replace(postLoginDestination(user, safeFrom));
    }
  }, [isSessionLoading, user, accessToken, router, safeFrom]);

  function persistLogin(data: any) {
    // Refresh token is set as HttpOnly cookie by the backend — only store user info
    localStorage.setItem("killio_user", JSON.stringify(data.user));
    login(data.user, data.accessToken, data.refreshToken, data.expiresInSeconds);
    // Accounts with a temporary password go straight to the "choose your password" step.
    router.push(postLoginDestination(data.user, safeFrom));
  }

  function switchMethod(next: "password" | "code") {
    setPreferredMethod(next);
    setError(null);
    setCodeSent(false);
    setHaveCode(false);
    setCode("");
  }

  /** Goes straight to typing a code that was already received, without sending (and replacing) another one. */
  function handleHaveCode() {
    setError(null);
    if (!identifier.trim().toLowerCase().includes("@")) {
      setError(t("login.emailCodeNeedsEmail"));
      return;
    }
    setHaveCode(true);
    setCodeSent(true);
    setCode("");
  }

  async function handleRequestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const email = identifier.trim().toLowerCase();
    if (!email.includes("@")) {
      setError(t("login.emailCodeNeedsEmail"));
      return;
    }
    setIsLoading(true);
    try {
      await requestOtp({ email, purpose: "login" });
      setHaveCode(false);
      setCodeSent(true);
      setCode("");
    } catch (unknownError) {
      setError(unknownError instanceof Error && unknownError.message ? unknownError.message : t("login.serverError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalizedCode = code.replace(/\s+/g, "");
    if (!normalizedCode) {
      setError(t("login.codeRequired"));
      return;
    }
    setIsLoading(true);
    try {
      const result = await verifyOtp({
        email: identifier.trim().toLowerCase(),
        code: normalizedCode,
        purpose: "login",
        rememberMe,
      });
      if ("accessToken" in result) {
        persistLogin(result);
      } else {
        setError(t("login.codeInvalid"));
      }
    } catch (unknownError) {
      setError(unknownError instanceof Error && unknownError.message ? unknownError.message : t("login.codeInvalid"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const normalizedIdentifier = identifier.trim();
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: normalizedIdentifier,
          email: normalizedIdentifier,
          password,
          rememberMe,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.message ?? t("login.invalidCredentials"));
        return;
      }

      const data = await res.json();

      // Check if 2FA is required
      if (data.otp_required) {
        // Store session info temporarily for OTP verification
        localStorage.setItem("killio_pending_auth", JSON.stringify({
          userId: data.userId,
          email: data.email,
          rememberMe,
        }));
        // Redirect to OTP verification
        router.push(`/verify-otp?purpose=login&email=${encodeURIComponent(data.email)}`);
        return;
      }

      persistLogin(data);
    } catch {
      setError(t("login.serverError"));
    } finally {
      setIsLoading(false);
    }
  }

  const onSubmit =
    method === "password" ? handlePasswordSubmit : codeSent ? handleVerifyCode : handleRequestCode;
  const submitLabel =
    method === "password" ? t("login.submit") : codeSent ? t("login.codeSubmit") : t("login.emailCodeSubmit");

  return (
    <AuthPageFrame mode="login">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("login.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="identifier">
              {t("login.identifierLabel")}
            </label>
            <input
              id="identifier"
              type={method === "code" ? "email" : "text"}
              placeholder={t("login.identifierPlaceholder")}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              readOnly={method === "code" && codeSent}
              autoComplete="username"
              className={inputClass}
            />
          </div>

          {method === "code" && codeSent && (
            <div className="space-y-2">
              <p role="status" className="rounded-md border border-border bg-background/50 p-3 text-sm text-muted-foreground">
                {haveCode ? t("login.haveCodeBody") : t("login.codeSentBody")}
              </p>
              <label className="text-sm font-medium leading-none" htmlFor="login-code">
                {t("login.codeLabel")}
              </label>
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                placeholder={t("login.codePlaceholder")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                autoComplete="one-time-code"
                className={`${inputClass} tracking-widest`}
              />
            </div>
          )}

          {method === "password" && (<>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="password">
              {t("login.passwordLabel")}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          </>)}

          <div className="flex items-center space-x-2">
            <input
              id="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border border-input bg-background accent-primary"
            />
            <label htmlFor="rememberMe" className="text-sm select-none cursor-pointer">
              {t("login.rememberMe")}
            </label>
          </div>

          {method === "password" && (
          <div className="rounded-lg border border-border/70 bg-background/50 p-3 text-xs text-muted-foreground space-y-1.5">
            <div>
              {t("login.recoverHint")}{" "}
              <Link href="/forgot-password" className="font-medium text-accent hover:underline">
                {t("login.recoverPasswordCta")}
              </Link>
            </div>
            <div>{t("login.recover2faHint")}</div>
          </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-4 inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary group disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {submitLabel}
                <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-all" />
              </>
            )}
          </button>

          {method === "code" && !codeSent && (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleHaveCode}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-border text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-60"
            >
              {t("login.haveCode")}
            </button>
          )}

          {method === "code" && codeSent && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void handleRequestCode()}
                className="font-medium text-accent hover:underline disabled:opacity-60"
              >
                {t("login.codeResend")}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => { setCodeSent(false); setHaveCode(false); setCode(""); setError(null); }}
                className="font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-60"
              >
                {t("login.codeChangeEmail")}
              </button>
            </div>
          )}

          {allowPassword && allowCode && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => switchMethod(method === "password" ? "code" : "password")}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-border text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-60"
            >
              {method === "password" ? t("login.useCodeInstead") : t("login.usePasswordInstead")}
            </button>
          )}
        </form>

        {hasSocial && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("login.socialDivider")}
              <span className="h-px flex-1 bg-border" />
            </div>
            {social.google && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void startSocialLogin("google", { returnTo: safeFrom })}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-60"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>
                {t("login.socialGoogle")}
              </button>
            )}
            {social.microsoft && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void startSocialLogin("microsoft", { returnTo: safeFrom })}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-60"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>
                {t("login.socialMicrosoft")}
              </button>
            )}
            {social.bloomx && (
              <Link
                href={bloomxHref}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-medium transition-colors hover:bg-accent/10"
              >
                <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">B</span>
                {t("login.socialBloomx")}
              </Link>
            )}
            <p className="text-center text-xs text-muted-foreground">{t("login.socialTerms")}</p>
          </div>
        )}

        {signupEnabled && (
        <div className="mt-6 text-center text-sm text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link href={signupHref} className="font-medium text-accent hover:underline">
            {t("login.goSignup")}
          </Link>
        </div>
        )}
      </div>
    </AuthPageFrame>
  );
}

function AuthLoaderFallback() {
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

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoaderFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
