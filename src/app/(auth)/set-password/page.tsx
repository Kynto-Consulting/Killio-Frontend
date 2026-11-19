"use client";

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Check, Circle, Eye, EyeOff, Loader2, LogOut } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ApiError, changePassword, logout as apiLogout } from "@/lib/api/contracts";
import {
  MIN_PASSWORD_LENGTH,
  checkNewPassword,
  isMustChangePassword,
  passwordStrength,
} from "@/lib/auth/password-change";

/**
 * Forced "choose your password" step for accounts created with a temporary
 * password. (The recovery-by-code page lives at /change-password.)
 */
function SetPasswordContent() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, accessToken, isLoading: isSessionLoading, login, logout } = useSession();

  const from = searchParams.get("from");
  const safeFrom = from && from.startsWith("/") && !from.startsWith("//") && !from.split("?")[0].startsWith("/set-password") ? from : "/";

  const ids = useId();
  const passwordId = `${ids}-password`;
  const confirmId = `${ids}-confirm`;
  const rulesId = `${ids}-rules`;
  const errorId = `${ids}-error`;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const submitted = useRef(false);

  const mustChange = isMustChangePassword(user);
  const email = user?.email ?? user?.primaryEmail ?? null;

  useEffect(() => {
    if (isSessionLoading) return;
    if (!user || !accessToken) {
      router.replace(`/login?from=${encodeURIComponent("/set-password")}`);
      return;
    }
    // Not flagged (and not in the middle of our own submit): nothing to do here.
    if (!mustChange && !submitted.current) router.replace("/");
  }, [isSessionLoading, user, accessToken, mustChange, router]);

  const check = useMemo(() => checkNewPassword(password, email), [password, email]);
  const strength = passwordStrength(password, email);
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = check.ok && confirm === password && !isSaving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);

    if (!check.ok) {
      setError(check.issues.includes("tooShort") ? t("setPassword.tooShort", { min: MIN_PASSWORD_LENGTH }) : t("setPassword.containsEmail"));
      return;
    }
    if (password !== confirm) {
      setError(t("setPassword.mismatch"));
      return;
    }

    setIsSaving(true);
    submitted.current = true;
    try {
      const data = await changePassword(accessToken, { newPassword: password });
      // Same persistence path as login: refresh token lives in the HttpOnly cookie.
      localStorage.setItem("killio_user", JSON.stringify(data.user));
      login(data.user, data.accessToken, data.refreshToken, data.expiresInSeconds);
      setPassword("");
      setConfirm("");
      router.replace(safeFrom);
    } catch (unknownError: unknown) {
      submitted.current = false;
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        setError(t("setPassword.sessionExpired"));
      } else {
        const message = unknownError instanceof Error ? unknownError.message : "";
        setError(message || t("setPassword.saveError"));
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // Best effort: the local session is cleared either way.
    }
    logout();
  }

  const inputClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors";

  const bars = ["weak", "medium", "strong"] as const;
  const filled = strength === "empty" ? 0 : strength === "weak" ? 1 : strength === "medium" ? 2 : 3;
  const barColor = strength === "weak" ? "bg-destructive" : strength === "medium" ? "bg-yellow-500" : "bg-green-600";

  if (isSessionLoading || !user || (!mustChange && !submitted.current)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{tCommon("actions.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <AuthPageFrame mode="account">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("setPassword.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("setPassword.subtitle")}</p>
        </div>

        {error && (
          <div
            id={errorId}
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor={passwordId}>
              {t("setPassword.newPassword")}
            </label>
            <div className="relative">
              <input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                aria-describedby={error ? `${rulesId} ${errorId}` : rulesId}
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center gap-1 pt-1" aria-hidden="true">
              {bars.map((level, i) => (
                <div key={level} className={`h-1 flex-1 rounded-full transition-colors ${i < filled ? barColor : "bg-muted"}`} />
              ))}
            </div>
            <p className="sr-only" role="status" aria-live="polite">
              {strength === "empty" ? "" : t(`setPassword.strength.${strength}`)}
            </p>
            {strength !== "empty" && (
              <p className="text-xs text-muted-foreground" aria-hidden="true">
                {t(`setPassword.strength.${strength}`)}
              </p>
            )}

            <ul id={rulesId} className="space-y-1 text-xs text-muted-foreground">
              <Rule ok={!check.issues.includes("tooShort")} text={t("setPassword.ruleLength", { min: MIN_PASSWORD_LENGTH })} okLabel={t("setPassword.ruleMet")} pendingLabel={t("setPassword.rulePending")} />
              <Rule ok={!check.issues.includes("containsEmail")} text={t("setPassword.ruleEmail")} okLabel={t("setPassword.ruleMet")} pendingLabel={t("setPassword.rulePending")} />
            </ul>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor={confirmId}>
              {t("setPassword.confirmPassword")}
            </label>
            <input
              id={confirmId}
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              aria-invalid={mismatch}
              aria-describedby={mismatch ? `${confirmId}-mismatch` : undefined}
              className={inputClass}
            />
            {mismatch && (
              <p id={`${confirmId}-mismatch`} className="text-xs text-destructive">
                {t("setPassword.mismatch")}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background group disabled:opacity-60"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-label={tCommon("actions.loading")} />
            ) : (
              <>
                {t("setPassword.submit")}
                <ArrowRight className="ml-2 h-4 w-4 opacity-70 transition-all group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4" />
            {t("setPassword.logout")}
          </button>
        </div>
      </div>
    </AuthPageFrame>
  );
}

function Rule({ ok, text, okLabel, pendingLabel }: { ok: boolean; text: string; okLabel: string; pendingLabel: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-green-700 dark:text-green-400" : ""}`}>
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{text}</span>
      <span className="sr-only">{ok ? okLabel : pendingLabel}</span>
    </li>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordContent />
    </Suspense>
  );
}
