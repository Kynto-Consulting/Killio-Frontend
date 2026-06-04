"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Puzzle } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { TeamView, listTeams } from "@/lib/api/contracts";
import { IntegrationCatalogGrid } from "./integration-catalog-grid";

/**
 * The user's PERSONAL integrations panel. These live under the user's personal
 * workspace (the `is_personal` team) and are reused everywhere the user goes —
 * private rooms, DMs, ephemeral doc/board agent chats. Shown ONLY here in user
 * settings, never in a team's integrations page.
 */
export function PersonalIntegrationsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { accessToken } = useSession();
  const t = useTranslations("integrations");
  const tp = useTranslations("preferences");
  const [teams, setTeams] = useState<TeamView[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !accessToken) return;
    setLoading(true);
    listTeams(accessToken)
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }, [isOpen, accessToken]);

  const personalTeamId = useMemo(() => teams?.find((tm) => tm.isPersonal)?.id ?? null, [teams]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: "#070a10" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(216,255,114,0.1)", color: "#d8ff72" }}>
              <Puzzle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">{tp("personalIntegrations.title", { fallback: "Personal integrations" })}</h2>
              <p className="text-xs text-white/45">
                {tp("personalIntegrations.subtitle", { fallback: "Your own connected apps, reused across every workspace and private chat." })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t("actions.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading || accessToken == null ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          ) : personalTeamId ? (
            <IntegrationCatalogGrid scope="personal" teamId={personalTeamId} accessToken={accessToken} />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <Puzzle className="h-7 w-7 text-white/30" />
              <p className="text-sm text-white/60">
                {tp("personalIntegrations.noPersonalTeam", { fallback: "No personal workspace found for your account yet." })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
