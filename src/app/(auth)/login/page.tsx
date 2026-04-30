"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, accessToken, isLoading: isSessionLoading } = useSession();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const from = searchParams.get('from');
  const fromPath = from ? from.split('?')[0] : null;
  const safeFrom = from && from.startsWith('/') && fromPath !== '/login' && fromPath !== '/signup' ? from : '/';
  const signupHref = safeFrom !== '/' ? `/signup?from=${encodeURIComponent(safeFrom)}` : '/signup';

  useEffect(() => {
    if (!isSessionLoading && user && accessToken) {
      router.replace(safeFrom);
    }
  }, [isSessionLoading, user, accessToken, router, safeFrom]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const normalizedIdentifier = identifier.trim();
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send both keys to keep compatibility with backend versions expecting either field.
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
      // Store tokens for the current active view (this still maintains basic current session)
      document.cookie = `killio_token=${data.accessToken}; path=/; max-age=${data.expiresInSeconds}`;
      localStorage.setItem("killio_refresh", data.refreshToken);
      localStorage.setItem("killio_user", JSON.stringify(data.user));

      // This will manage the accounts array for the multi-switch
      login(data.user, data.accessToken, data.refreshToken);
      router.push(safeFrom);
    } catch {
      setError(t("login.serverError"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthPageFrame mode="login">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
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
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium leading-none" htmlFor="password">
                {t("login.passwordLabel")}
              </label>
            </div>
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
              onChange={e => setRememberMe(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border border-input bg-background accent-white"
            />
            <label htmlFor="rememberMe" className="text-sm select-none cursor-pointer">
              {t("login.rememberMe")}
            </label>
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

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {t("login.noAccount")} {" "}
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
