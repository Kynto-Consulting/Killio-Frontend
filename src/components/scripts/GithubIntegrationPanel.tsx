"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  GithubAppInstallation,
  getGithubConnectUrl,
  listGithubInstallations,
  saveGithubInstallation,
  deleteGithubInstallation,
} from "@/lib/api/integrations";
import { GitBranch, CheckCircle, AlertCircle, Loader2, Trash2, ExternalLink } from "lucide-react";

interface GithubIntegrationPanelProps {
  teamId: string;
  accessToken: string;
}

export function GithubIntegrationPanel({ teamId, accessToken }: GithubIntegrationPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("integrations");
  const [installations, setInstallations] = useState<GithubAppInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [autoHandledInstallationId, setAutoHandledInstallationId] = useState<string | null>(null);

  useEffect(() => {
    listGithubInstallations(teamId, accessToken)
      .then(setInstallations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId, accessToken]);

  useEffect(() => {
    const installationIdFromQuery = searchParams.get("installation_id");
    const setupAction = searchParams.get("setup_action");
    const state = searchParams.get("state");

    if (!installationIdFromQuery) return;
    if (autoHandledInstallationId === installationIdFromQuery) return;

    const installationIdNumber = Number.parseInt(installationIdFromQuery, 10);
    if (!installationIdNumber || Number.isNaN(installationIdNumber)) {
      setError(t("integrations.github.callbackInvalidInstallationId"));
      return;
    }

    if (setupAction && !["install", "update"].includes(setupAction)) {
      return;
    }

    const parseStateTeamId = (rawState: string | null): string | null => {
      if (!rawState) return null;
      try {
        const normalized = rawState.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
        const decoded = JSON.parse(atob(padded));
        return typeof decoded?.teamId === "string" ? decoded.teamId : null;
      } catch {
        return null;
      }
    };

    const stateTeamId = parseStateTeamId(state);
    if (stateTeamId && stateTeamId !== teamId) {
      setError(t("integrations.github.callbackWrongWorkspace"));
      return;
    }

    setSyncing(true);
    setError(null);
    saveGithubInstallation(teamId, installationIdNumber, accessToken)
      .then((updated) => {
        setInstallations((prev) => {
          const idx = prev.findIndex((i) => i.installationId === updated.installationId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [...prev, updated];
        });
        setSuccess(true);
        setAutoHandledInstallationId(installationIdFromQuery);
        router.replace("/integrations", { scroll: false });
        setTimeout(() => setSuccess(false), 3000);
      })
      .catch(() => {
        setError(t("integrations.github.callbackAutoSaveError"));
      })
      .finally(() => setSyncing(false));
  }, [searchParams, autoHandledInstallationId, teamId, accessToken, router, t]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await getGithubConnectUrl(teamId, accessToken);
      window.location.href = result.url;
    } catch {
      setError(t("integrations.github.connectStartError"));
      setConnecting(false);
    }
  };

  const handleDisconnect = async (installation: GithubAppInstallation) => {
    if (!window.confirm(t("integrations.github.disconnectConfirm"))) return;
    try {
      await deleteGithubInstallation(teamId, installation.installationId, accessToken);
      setInstallations((prev) => prev.filter((i) => i.id !== installation.id));
    } catch {
      setError(t("integrations.github.deleteError"));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
          <GitBranch className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{t("integrations.github.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("integrations.github.description")}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting || syncing}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          {connecting ? t("integrations.github.connecting") : t("integrations.github.connectButton")}
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {t("integrations.github.saved")}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">{t("integrations.github.activeInstallations")}</p>
        {loading ? (
          <div className="mt-2 flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : installations.length > 0 ? (
          <div className="mt-2 space-y-2">
            {installations.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      {inst.accountLogin ?? `${t("integrations.github.installationFallback")} #${inst.installationId}`}
                    </p>
                    <p className="text-xs text-green-600">
                      {inst.accountType ?? t("integrations.github.accountTypeFallback")} · {inst.isActive ? t("scripts.active") : t("scripts.inactive")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnect(inst)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("integrations.github.disconnect")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("integrations.github.noInstallations")}</p>
        )}
      </div>
    </div>
  );
}
