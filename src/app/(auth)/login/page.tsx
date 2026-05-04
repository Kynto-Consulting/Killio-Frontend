"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { requestOtp, resetPasswordWithOtp, verifyOtp } from "@/lib/api/contracts";

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

type AuthMode = "password" | "otp" | "reset";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, accessToken, isLoading: isSessionLoading } = useSession();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [authMode, setAuthMode] = useState<AuthMode>("password");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetRequested, setResetRequested] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const signupHref = safeFrom !== "/" ? `/signup?from=${encodeURIComponent(safeFrom)}` : "/signup";

  useEffect(() => {
    if (!isSessionLoading && user && accessToken) {
      router.replace(safeFrom);
    }
  }, [isSessionLoading, user, accessToken, router, safeFrom]);

  function persistLogin(data: any) {
    document.cookie = `killio_token=${data.accessToken}; path=/; max-age=${data.expiresInSeconds}`;
    localStorage.setItem("killio_refresh", data.refreshToken);
    localStorage.setItem("killio_user", JSON.stringify(data.user));
    login(data.user, data.accessToken, data.refreshToken);
    router.push(safeFrom);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
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
      persistLogin(data);
    } catch {
      setError(t("login.serverError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const email = otpEmail.trim().toLowerCase();
      if (!email) {
        setError(t("otp.emailRequired"));
        return;
      }

      const response = await requestOtp({
        email,
        useMagicLink,
        purpose: "login",
      });

      setOtpRequested(true);
      if (useMagicLink) {
        setNotice(t("otp.magicLinkSent", { minutes: response.expiresInMinutes }));
      } else {
        setNotice(t("otp.codeSent", { minutes: response.expiresInMinutes }));
      }
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : t("otp.requestError");
      setError(message || t("otp.requestError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const email = otpEmail.trim().toLowerCase();
      if (!email) {
        setError(t("otp.emailRequired"));
        return;
      }
      if (!otpCode.trim()) {
        setError(t("otp.codeRequired"));
        return;
      }

      const result = await verifyOtp({
        email,
        code: otpCode.trim(),
        rememberMe,
        purpose: "login",
        autoRegister: true,
      });

      if ("accessToken" in result) {
        persistLogin(result);
        return;
      }

      setError(t("otp.verifyError"));
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : t("otp.verifyError");
      setError(message || t("otp.verifyError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const email = resetEmail.trim().toLowerCase();
      if (!email) {
        setError(t("reset.emailRequired"));
        return;
      }

      const response = await requestOtp({
        email,
        useMagicLink: false,
        purpose: "password_reset",
      });

      setResetRequested(true);
      setNotice(t("reset.codeSent", { minutes: response.expiresInMinutes }));
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : t("reset.requestError");
      setError(message || t("reset.requestError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const email = resetEmail.trim().toLowerCase();
      if (!email) {
        setError(t("reset.emailRequired"));
        return;
      }
      if (!resetCode.trim()) {
        setError(t("reset.codeRequired"));
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

      await resetPasswordWithOtp({
        email,
        code: resetCode.trim(),
        newPassword,
      });

      setNotice(t("reset.success"));
      setAuthMode("password");
      setIdentifier(email);
      setPassword("");
      setResetRequested(false);
      setResetCode("");
      setNewPassword("");
      setConfirmNewPassword("");
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
          <h1 className="text-2xl font-semibold tracking-tight">
            {authMode === "password" ? t("login.title") : authMode === "otp" ? t("otp.title") : t("reset.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {authMode === "password"
              ? t("login.subtitle")
              : authMode === "otp"
                ? t("otp.subtitle")
                : t("reset.subtitle")}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {notice}
          </div>
        )}

        <div className="mb-5 flex gap-2 rounded-xl border border-border/60 bg-background/50 p-1">
          <button
            type="button"
            onClick={() => {
              setAuthMode("password");
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${authMode === "password" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("login.tabPassword")}
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("otp");
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${authMode === "otp" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("login.tabOtp")}
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("reset");
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${authMode === "reset" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("login.tabForgot")}
          </button>
        </div>

        {authMode === "password" && (
          <form className="space-y-4" onSubmit={handlePasswordSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="identifier">
                {t("login.identifierLabel")}
              </label>
              <input
                id="identifier"
                type="text"
                placeholder={t("login.identifierPlaceholder")}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
              />
            </div>

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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-11 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
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

            <div className="flex items-center space-x-2">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border border-input bg-background accent-white"
              />
              <label htmlFor="rememberMe" className="text-sm select-none cursor-pointer">
                {t("login.rememberMe")}
              </label>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/50 p-3 text-xs text-muted-foreground">
              {t("login.otpConfigReminder")} {" "}
              <Link href="/forgot-password" className="font-medium text-accent hover:underline">
                {t("login.forgotPasswordCta")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-4 inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary group disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {t("login.submit")}
                  <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-all" />
                </>
              )}
            </button>
          </form>
        )}

        {authMode === "otp" && (
          <form className="space-y-4" onSubmit={otpRequested && !useMagicLink ? handleVerifyOtp : handleRequestOtp}>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="otpEmail">
                {t("otp.emailLabel")}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  id="otpEmail"
                  type="email"
                  placeholder={t("otp.emailPlaceholder")}
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="useMagicLink"
                type="checkbox"
                checked={useMagicLink}
                onChange={(e) => {
                  setUseMagicLink(e.target.checked);
                  setOtpRequested(false);
                  setOtpCode("");
                  setNotice(null);
                }}
                className="mt-0.5 h-4 w-4 rounded border border-input bg-background accent-white"
              />
              <label htmlFor="useMagicLink" className="text-sm select-none cursor-pointer">
                {t("otp.useMagicLink")}
              </label>
            </div>

            {!useMagicLink && otpRequested && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="otpCode">
                  {t("otp.codeLabel")}
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="otpCode"
                    type="text"
                    inputMode="numeric"
                    placeholder={t("otp.codePlaceholder")}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary group disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {otpRequested && !useMagicLink ? t("otp.verifyButton") : t("otp.sendButton")}
                  <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-all" />
                </>
              )}
            </button>

            {!useMagicLink && otpRequested && (
              <button
                type="button"
                onClick={() => {
                  setOtpRequested(false);
                  setOtpCode("");
                  setNotice(null);
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                {t("otp.changeDelivery")}
              </button>
            )}
          </form>
        )}

        {authMode === "reset" && (
          <form className="space-y-4" onSubmit={resetRequested ? handleResetPassword : handleRequestReset}>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="resetEmail">
                {t("reset.emailLabel")}
              </label>
              <input
                id="resetEmail"
                type="email"
                placeholder={t("reset.emailPlaceholder")}
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                autoComplete="email"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
              />
            </div>

            {resetRequested && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="resetCode">
                    {t("reset.codeLabel")}
                  </label>
                  <input
                    id="resetCode"
                    type="text"
                    inputMode="numeric"
                    placeholder={t("reset.codePlaceholder")}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                  />
                </div>

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
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary group disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {resetRequested ? t("reset.submitNewPassword") : t("reset.sendCode")}
                  <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-all" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link href={signupHref} className="font-medium text-accent hover:underline">
            {t("login.goSignup")}
          </Link>
        </div>
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
