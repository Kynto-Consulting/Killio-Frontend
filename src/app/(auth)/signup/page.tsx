"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useSession();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const from = searchParams.get("from");
  const safeFrom = from && from.startsWith("/") ? from : "/";
  const loginHref = safeFrom !== "/" ? `/login?from=${encodeURIComponent(safeFrom)}` : "/login";

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

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

    setIsLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          username: form.username.trim().toLowerCase(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
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
    <div className="flex min-h-screen flex-col items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0 bg-background">
        <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
          <div
            className="relative left-[calc(50%+11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[-30deg] bg-gradient-to-tr from-[#4ade80] to-[#3b82f6] opacity-15 sm:left-[calc(50%+20rem)] sm:w-[72.1875rem]"
            style={{ clipPath: "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)" }}
          />
        </div>
      </div>

      <div className="z-10 w-full max-w-sm px-4 py-8">
        <div className="flex flex-col items-center space-y-6">
          <div className="flex items-center space-x-2">
            <img src="/killio_white.webp" alt="Killio" className="h-8 w-auto" />
            <span className="text-2xl font-bold tracking-tight">Killio</span>
          </div>

          <div className="w-full rounded-xl border border-border bg-card/60 p-8 shadow-2xl backdrop-blur-sm">
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

              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-primary/90 hover:bg-primary text-primary-foreground shadow h-10 w-full mt-2 group disabled:opacity-60"
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
          </div>
        </div>
      </div>
    </div>
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
