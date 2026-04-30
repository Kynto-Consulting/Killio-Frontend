"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, accessToken, isLoading: isSessionLoading } = useSession();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
    acceptedTerms: false,
    allowCommunications: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const from = searchParams.get("from");
  const safeFrom = from && from.startsWith("/") ? from : "/";
  const loginHref = safeFrom !== "/" ? `/login?from=${encodeURIComponent(safeFrom)}` : "/login";

  useEffect(() => {
    if (!isSessionLoading && user && accessToken) {
      router.replace("/");
    }
  }, [isSessionLoading, user, accessToken, router]);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({
      ...prev,
      [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError(t("signup.passwordsMismatch"));
      return;
    }
    if (form.password.length < 8) {
      setError(t("signup.passwordMinLength"));
      return;
    }
    if (!form.acceptedTerms) {
      setError(t("signup.termsRequired"));
      return;
    }

    setIsLoading(true);
    try {
      const normalizedDisplayName = form.displayName.trim();
      const normalizedUsername = form.username.trim().toLowerCase();
      const normalizedEmail = form.email.trim().toLowerCase();

      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Keep compatibility while backend transitions from displayName/username to name.
          name: normalizedDisplayName,
          displayName: normalizedDisplayName,
          username: normalizedUsername,
          email: normalizedEmail,
          password: form.password,
          acceptedTerms: form.acceptedTerms,
          allowCommunications: form.allowCommunications,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.message ?? t("signup.registrationFailed"));
        return;
      }

      const data = await res.json();
      // Persist session exactly like the login page
      document.cookie = `killio_token=${data.accessToken}; path=/; max-age=${data.expiresInSeconds}`;
      localStorage.setItem("killio_refresh", data.refreshToken);
      localStorage.setItem("killio_user", JSON.stringify(data.user));

      login(data.user, data.accessToken, data.refreshToken);
      router.push(safeFrom);
    } catch {
      setError(t("signup.serverError"));
    } finally {
      setIsLoading(false);
    }
  }

  const passwordStrength =
    form.password.length === 0
      ? null
      : form.password.length < 8
      ? "weak"
      : form.password.length < 12
      ? "medium"
      : "strong";

  return (
    <AuthPageFrame mode="signup">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("signup.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("signup.subtitle")}
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
            <label className="text-sm font-medium" htmlFor="displayName">{t("signup.fullName")}</label>
            <input
              id="displayName"
              type="text"
              placeholder="Ronald García"
              value={form.displayName}
              onChange={update("displayName")}
              required
              autoComplete="name"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="username">{t("signup.username")}</label>
              <input
                id="username"
                type="text"
                placeholder="ronald"
                value={form.username}
                onChange={update("username")}
                required
                autoComplete="username"
                pattern="[a-zA-Z0-9_\-]+"
                title={t("signup.usernameHint")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">{t("signup.email")}</label>
              <input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={form.email}
                onChange={update("email")}
                required
                autoComplete="email"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">{t("signup.password")}</label>
            <input
              id="password"
              type="password"
              placeholder={t("signup.passwordPlaceholder")}
              value={form.password}
              onChange={update("password")}
              required
              autoComplete="new-password"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            />
            {passwordStrength && (
              <div className="flex gap-1 mt-1">
                {["weak", "medium", "strong"].map((level, i) => (
                  <div
                    key={level}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      passwordStrength === "weak" && i === 0
                        ? "bg-destructive"
                        : passwordStrength === "medium" && i <= 1
                        ? "bg-yellow-400"
                        : passwordStrength === "strong" && i <= 2
                        ? "bg-green-500"
                        : "bg-muted"
                    }`}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1 capitalize">{passwordStrength}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="confirm">{t("signup.confirmPassword")}</label>
            <div className="relative">
              <input
                id="confirm"
                type="password"
                placeholder={t("signup.confirmPasswordPlaceholder")}
                value={form.confirm}
                onChange={update("confirm")}
                required
                autoComplete="new-password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
              />
              {form.confirm && form.password === form.confirm && (
                <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4">
            <label className="flex items-start gap-3 text-sm text-muted-foreground" htmlFor="acceptedTerms">
              <input
                id="acceptedTerms"
                type="checkbox"
                checked={form.acceptedTerms}
                onChange={update("acceptedTerms")}
                required
                className="mt-0.5 h-4 w-4 rounded border border-input bg-background accent-white"
              />
              <span className="leading-6">
                {t("signup.acceptTermsPrefix")} {" "}
                <Link href="/terms" className="font-medium text-foreground hover:underline">
                  {t("signup.termsLink")}
                </Link>, {" "}
                <Link href="/privacy" className="font-medium text-foreground hover:underline">
                  {t("signup.privacyLink")}
                </Link>{" "}
                {t("signup.acceptTermsFinalConnector")} {" "}
                <Link href="/cookies" className="font-medium text-foreground hover:underline">
                  {t("signup.cookiesLink")}
                </Link>{" "}
                {t("signup.acceptTermsSuffix")}
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-muted-foreground" htmlFor="allowCommunications">
              <input
                id="allowCommunications"
                type="checkbox"
                checked={form.allowCommunications}
                onChange={update("allowCommunications")}
                className="mt-0.5 h-4 w-4 rounded border border-input bg-background accent-white"
              />
              <span className="leading-6">
                <span className="block text-foreground">{t("signup.communicationsOptIn")}</span>
                <span className="block text-xs text-muted-foreground">{t("signup.communicationsHint")}</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary group disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {t("signup.submit")}
                <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-all" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {t("signup.alreadyAccount")} {" "}
          <Link href={loginHref} className="font-medium text-accent hover:underline">
            {t("signup.goLogin")}
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">{t("signup.footerLegal")}</p>
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

export default function SignupPage() {
  return (
    <Suspense fallback={<AuthLoaderFallback />}>
      <SignupPageContent />
    </Suspense>
  );
}
