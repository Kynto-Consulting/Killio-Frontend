"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { saveNotionCallback, saveTrelloCallback } from "@/lib/api/integrations";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function IntegrationCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, user } = useSession();
  const t = useTranslations("integrations");
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!accessToken || !user) {
      router.replace("/login");
      return;
    }

    // Trello returns token in hash fragment: #token=ABC123
    // Notion/others return code as query param: ?code=ABC
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const trelloToken = hashParams.get("token");

    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(errorParam);
      return;
    }

    // Trello flow: token in hash, teamId in localStorage
    if (trelloToken) {
      const pendingTeamId = localStorage.getItem("trello_pending_teamId");
      if (!pendingTeamId) {
        setError(t("callback.errors.sessionExpired"));
        return;
      }
      localStorage.removeItem("trello_pending_teamId");
      saveTrelloCallback(pendingTeamId, trelloToken, accessToken)
        .then(() => { setSuccess(true); setTimeout(() => router.replace("/integrations"), 1500); })
        .catch((err: any) => setError(err.message || t("callback.errors.finalizeTrello")));
      return;
    }

    // Notion / other OAuth2 flow: code + state in query params
    const stateStr = searchParams.get("state");
    if (!code || !stateStr) {
      setError(t("callback.errors.missingOAuthParams"));
      return;
    }

    let stateObj;
    try {
      const decoded = atob(stateStr);
      stateObj = JSON.parse(decoded);
    } catch {
      setError(t("callback.errors.invalidState"));
      return;
    }

    const { teamId, provider } = stateObj;

    if (!teamId || !provider) {
      setError(t("callback.errors.incompleteState"));
      return;
    }

    const processCallback = async () => {
      try {
        if (provider === "notion") {
          await saveNotionCallback(teamId, code, accessToken);
        } else {
          throw new Error(t("callback.errors.unsupportedProvider"));
        }
        setSuccess(true);
        setTimeout(() => {
          router.replace("/integrations");
        }, 1500);
      } catch (err: any) {
        setError(err.message || t("callback.errors.finalizeSetup"));
      }
    };

    processCallback();
  }, [accessToken, user, router, searchParams, t]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-destructive/20 bg-card p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("callback.ui.failedTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <button
            onClick={() => router.replace("/integrations")}
            className="w-full rounded-md bg-secondary px-4 py-3 text-sm font-medium hover:bg-secondary/90 transition-colors"
          >
            {t("callback.ui.returnButton")}
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="text-xl font-semibold text-foreground">{t("callback.ui.successTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("callback.ui.redirecting")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        <h1 className="text-lg font-medium text-foreground">{t("callback.ui.finalizingTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("callback.ui.finalizingDescription")}</p>
      </div>
    </div>
  );
}
