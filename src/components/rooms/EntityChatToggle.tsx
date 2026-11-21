"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, MessageSquare, MessageSquareOff } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getEntityChatConfig, RoomsApiError, setEntityChatEnabled, type ChatSwitchEntity } from "@/lib/api/rooms";

interface EntityChatToggleProps {
  teamId: string;
  entityType: ChatSwitchEntity;
  entityId: string;
  accessToken: string;
  className?: string;
}

/**
 * The "chat" switch of a document, board or mesh, for its settings dialog. Off hides its room from Rooms and stops new
 * messages; nothing is deleted, turning it on brings everything back (the text says so). Renders nothing when this server
 * has no such switch, and is read-only for people who cannot manage the item.
 */
export function EntityChatToggle({ teamId, entityType, entityId, accessToken, className }: EntityChatToggleProps) {
  const t = useTranslations("rooms");
  const [config, setConfig] = useState<{ chatEnabled: boolean; canManage: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labelId = useId();
  const hintId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    getEntityChatConfig(teamId, entityType, entityId, accessToken).then((c) => {
      if (cancelled) return;
      setConfig(c);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [teamId, entityType, entityId, accessToken]);

  if (!loaded) return null;
  if (!config) return null; // the server has no chat switch: nothing to show

  const toggle = async () => {
    if (!config.canManage || saving) return;
    const next = !config.chatEnabled;
    setSaving(true);
    setError(null);
    try {
      await setEntityChatEnabled(teamId, entityType, entityId, next, accessToken);
      setConfig({ ...config, chatEnabled: next });
    } catch (err) {
      setError(err instanceof RoomsApiError && err.isUnavailable ? t("chatToggle.unavailable") : t("chatToggle.failed"));
    } finally {
      setSaving(false);
    }
  };

  const Icon = config.chatEnabled ? MessageSquare : MessageSquareOff;

  return (
    <div className={`rounded-xl border-2 border-[var(--memphis-line)] bg-muted/30 p-3 ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-sm font-semibold">{t("chatToggle.title")}</p>
          <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
            {config.chatEnabled ? t("chatToggle.on") : t("chatToggle.off")}
          </p>
          {!config.canManage && <p className="mt-1 text-[11px] italic text-muted-foreground">{t("chatToggle.cannotManage")}</p>}
          {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.chatEnabled}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          disabled={!config.canManage || saving}
          onClick={() => void toggle()}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-[var(--memphis-line)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
            config.chatEnabled ? "bg-emerald-500 dark:bg-emerald-600" : "bg-muted"
          }`}
        >
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-background shadow transition-transform motion-reduce:transition-none ${config.chatEnabled ? "translate-x-[1.35rem]" : "translate-x-0.5"}`}>
            {saving && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-label={t("chatToggle.saving")} />}
          </span>
        </button>
      </div>
    </div>
  );
}
