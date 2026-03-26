"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { acceptTeamInvite } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";

function AcceptInvitePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, setActiveTeamId } = useSession();
  const t = useTranslations("accept-invite");

  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");
  const processedKeyRef = useRef<string | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loginHref = useMemo(() => {
    const encodedTarget = `/accept-invite?token=${encodeURIComponent(token)}`;
    return `/login?from=${encodeURIComponent(encodedTarget)}`;
  }, [token]);

  const signupHref = useMemo(() => {
    const encodedTarget = `/accept-invite?token=${encodeURIComponent(token)}`;
    return `/signup?from=${encodeURIComponent(encodedTarget)}`;
  }, [token]);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("missingToken"));
      return;
    }

    if (!accessToken) {
      setStatus("idle");
      return;
    }

    const requestKey = `${token}:${accessToken}`;
    if (processedKeyRef.current === requestKey) {
      return;
    }
    processedKeyRef.current = requestKey;

    let cancelled = false;
    setStatus("loading");
    setMessage("");

    acceptTeamInvite(token, accessToken)
      .then((result) => {
        if (cancelled) return;
        setActiveTeamId(result.teamId);
        setStatus("success");
        setTeamName(result.teamName);
        setMessage(t("acceptedMessage", { teamName: result.teamName, role: result.role }));
        if (redirectTimerRef.current) {
          clearTimeout(redirectTimerRef.current);
        }
        redirectTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            router.replace("/");
          }
        }, 700);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(typeof error?.message === "string" ? error.message : t("acceptError"));
      });

    return () => {
      cancelled = true;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [token, accessToken, router, setActiveTeamId, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>

        <div className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4">
          {!accessToken && token ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">{t("needLogin")}</p>
              <div className="flex items-center gap-2">
                <Link
                  href={loginHref}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("login")}
                </Link>
                <Link
                  href={signupHref}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-input px-3.5 text-sm font-medium hover:bg-accent/10"
                >
                  {t("signup")}
                </Link>
              </div>
            </div>
          ) : null}

          {status === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("accepting")}
            </div>
          ) : null}

          {status === "success" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                {message}
              </div>
              <p className="text-xs text-muted-foreground">{t("redirecting")}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push("/")}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("goDashboard")}
                </button>
                <button
                  onClick={() => router.push("/teams")}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-input px-3.5 text-sm font-medium hover:bg-accent/10"
                >
                  {t("viewTeam")}
                </button>
              </div>
              {teamName ? <p className="text-xs text-muted-foreground">{t("workspace")} {teamName}</p> : null}
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4 mt-0.5" />
              <span>{message}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AcceptInviteFallback() {
  const t = useTranslations("accept-invite");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{t("accepting")}</span>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInvitePageContent />
    </Suspense>
  );
}
