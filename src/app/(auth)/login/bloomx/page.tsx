"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { AuthPageFrame } from "@/components/marketing/auth-page-frame";
import { useTranslations } from "@/components/providers/i18n-provider";
import { BloomxLogo } from "@/components/brand/bloomx-logo";
import { resolveBloomxInstance, safeReturnPath, SocialLoginClientError, startSocialLogin } from "@/lib/auth/social-login";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors";

/**
 * Bloomx sign-in, two steps:
 * 1) "Tu correo Bloomx": the person types their instance (mail.empresa.com) or their email; the API validates it
 *    (https, public host, allowed by the workspace) and checks that it really is a Bloomx instance.
 * 2) Confirm the host and go to it. The API starts the flow; the browser never builds the provider URL itself.
 */
function BloomxLoginContent() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const returnTo = safeReturnPath(params.get("from"));
  const [input, setInput] = useState("");
  const [host, setHost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const describe = (e: unknown) => {
    const code = e instanceof SocialLoginClientError ? e.code : "invalid_request";
    const key = `login.socialErrors.${code}`;
    const text = t(key);
    return text === key ? t("login.socialErrors.invalid_request") : text;
  };

  async function onResolve(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await resolveBloomxInstance(input.trim());
      setHost(r.host);
    } catch (err) {
      setError(describe(err));
    } finally {
      setLoading(false);
    }
  }

  async function onGo() {
    setError(null);
    setLoading(true);
    try {
      await startSocialLogin("bloomx", { returnTo, bloomx: input.trim() });
    } catch (err) {
      setError(describe(err));
      setLoading(false);
    }
  }

  return (
    <AuthPageFrame mode="login">
      <div className="w-full rounded-[28px] border border-border bg-card/65 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <div className="mb-6 flex flex-col space-y-2 text-center">
          <BloomxLogo className="mx-auto h-12 w-12" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.bloomxTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("login.bloomxSubtitle")}</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {host === null ? (
          <form className="space-y-4" onSubmit={onResolve}>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="bloomx-instance">
                {t("login.bloomxLabel")}
              </label>
              <input
                id="bloomx-instance"
                type="text"
                inputMode="url"
                autoComplete="email"
                autoFocus
                required
                maxLength={254}
                placeholder={t("login.bloomxPlaceholder")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t("login.bloomxContinue")}<ArrowRight className="ml-2 h-4 w-4 opacity-70" /></>}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p role="status" className="rounded-md border border-border bg-background/50 p-3 text-sm text-muted-foreground">
              {t("login.bloomxConfirm", { host })}
            </p>
            <button
              type="button"
              onClick={onGo}
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary/90 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t("login.bloomxGo", { host })}<ArrowRight className="ml-2 h-4 w-4 opacity-70" /></>}
            </button>
            <button
              type="button"
              onClick={() => { setHost(null); setError(null); }}
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-border text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-60"
            >
              {t("login.bloomxBack")}
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t("login.bloomxBackToLogin")}
          </Link>
        </div>
      </div>
    </AuthPageFrame>
  );
}

export default function BloomxLoginPage() {
  return (
    <Suspense fallback={null}>
      <BloomxLoginContent />
    </Suspense>
  );
}
