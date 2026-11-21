"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { useUiMode } from "@/components/providers/ui-mode-provider";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import { ModePicker } from "@/components/onboarding/mode-picker";
import { Select } from "@/components/ui/select";
import { setTeamDefaultUiMode } from "@/lib/api/ui-prefs";
import { toast } from "@/lib/toast";
import { isUiMode, type UiMode } from "@/lib/ui-mode/ui-mode";

/** "Killio mode" block of the app preferences: applies immediately (no Save needed) and never touches data. */
export function ModeSettings() {
  const t = useTranslations("onboarding");
  const ui = useUiMode();
  const { accessToken, activeTeamId, user } = useSession();
  const { can: canTeam } = useTeamPermissions(activeTeamId, accessToken, user?.id);
  const isAdmin = canTeam("team.manage");
  const [busy, setBusy] = useState(false);

  const change = async (mode: UiMode | null) => {
    setBusy(true);
    try { await ui.setMode(mode); toast(t("mode.saved"), "success"); }
    catch { toast(t("mode.saveError"), "error"); }
    finally { setBusy(false); }
  };

  const changeTeamDefault = async (value: string) => {
    if (!accessToken || !activeTeamId) return;
    const mode = isUiMode(value) ? value : null;
    try {
      await setTeamDefaultUiMode(activeTeamId, mode, accessToken);
      ui.setTeamDefaultMode(mode);
      toast(t("mode.teamDefaultSaved"), "success");
    } catch { toast(t("mode.saveError"), "error"); }
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center text-sm font-medium leading-none"><Layers className="mr-2 h-4 w-4 text-muted-foreground" />{t("mode.label")}</label>
      <ModePicker value={ui.mode} onChange={(m) => void change(m)} disabled={busy} name="prefs-ui-mode" />
      <p className="text-xs text-muted-foreground">{t("mode.note")}</p>
      {ui.source === "team" || (ui.source === "user" && ui.teamDefaultMode) ? (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("mode.fromTeam", { mode: t(`mode.${ui.teamDefaultMode ?? "full"}`) })}</span>
          {ui.source === "user" ? (
            <button type="button" disabled={busy} onClick={() => void change(null)} className="rounded-md px-2 py-1 text-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("mode.followTeam")}</button>
          ) : null}
        </div>
      ) : null}
      {isAdmin && activeTeamId ? (
        <div className="space-y-1.5 rounded-lg border border-border p-3">
          <div className="text-sm font-medium">{t("mode.teamDefaultTitle")}</div>
          <p className="text-xs text-muted-foreground">{t("mode.teamDefaultDesc")}</p>
          <Select
            value={ui.teamDefaultMode ?? ""}
            onChange={(e) => void changeTeamDefault(e.target.value)}
            options={[{ value: "", label: t("mode.teamDefaultNone") }, { value: "reduced", label: t("mode.reduced") }, { value: "full", label: t("mode.full") }]}
          />
        </div>
      ) : null}
    </div>
  );
}
