"use client";

import { useEffect, useState } from "react";
import { Server } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { killioApp } from "@/lib/app-shell";

/**
 * Preferences, inside Killio App only: which server the app is connected to, and the way to another
 * one (killio.dev or any organisation's own address). Renders nothing on the web.
 */
export function ServerSettings({ onDone }: { onDone?: () => void }) {
  const t = useTranslations("dashboard");
  // Decided after mount: the server never knows whether the page runs inside the app.
  const [server, setServer] = useState<string | null>(null);
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    const app = killioApp();
    if (!app) return;
    setInApp(true);
    let cancelled = false;
    app.info().then((info) => { if (!cancelled) setServer(info.tenant); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!inApp) return null;

  let host = server ?? window.location.origin;
  try { host = new URL(host).host; } catch { /* shown as it is */ }

  return (
    <>
      <div className="space-y-3">
        <label className="flex items-center text-sm font-medium leading-none">
          <Server className="mr-2 h-4 w-4 text-muted-foreground" />
          {t("appShell.server.title")}
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{host}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("appShell.server.hint")}</p>
          </div>
          <button
            type="button"
            onClick={() => { onDone?.(); void killioApp()?.switchTenant(); }}
            className="h-9 shrink-0 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent/10"
          >
            {t("accountMenu.switchServer")}
          </button>
        </div>
      </div>
      <div className="h-px w-full bg-border/50" />
    </>
  );
}
