"use client";

import { useEffect, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { killioApp } from "@/lib/app-shell";

/**
 * Preferences, inside Killio App only: everything about the app itself in one place. Which server it
 * is connected to and the way to another one, and which build is running and the way to update it.
 * Renders nothing on the web.
 */
export function ServerSettings({ onDone }: { onDone?: () => void }) {
  const t = useTranslations("dashboard");
  // Decided after mount: the server never knows whether the page runs inside the app.
  const [inApp, setInApp] = useState(false);
  const [server, setServer] = useState<string | null>(null);
  const [build, setBuild] = useState<number | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  useEffect(() => {
    const app = killioApp();
    if (!app) return;
    setInApp(true);
    // Older builds of the app cannot update themselves: the row only shows where it works.
    setCanUpdate(typeof app.checkUpdate === "function");
    let cancelled = false;
    app.info().then((info) => {
      if (cancelled) return;
      setServer(info.tenant);
      setBuild(typeof info.build === "number" ? info.build : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!inApp) return null;

  let host = server ?? window.location.origin;
  try { host = new URL(host).host; } catch { /* shown as it is */ }
  const row = "flex flex-wrap items-center justify-between gap-3 p-3";
  const button = "h-9 shrink-0 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent/10";

  return (
    <>
      <div className="space-y-3">
        <label className="flex items-center text-sm font-medium leading-none">
          <MonitorSmartphone className="mr-2 h-4 w-4 text-muted-foreground" />
          {t("appShell.server.title")}
        </label>
        <div className="divide-y divide-border rounded-lg border border-border">
          <div className={row}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{host}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("appShell.server.hint")}</p>
            </div>
            <button type="button" onClick={() => { onDone?.(); void killioApp()?.switchTenant(); }} className={button}>
              {t("accountMenu.switchServer")}
            </button>
          </div>
          {canUpdate ? (
            <div className={row}>
              <div className="min-w-0">
                <p className="text-sm font-medium">{build ? t("appShell.update.version", { current: build }) : t("appShell.update.title")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("appShell.server.updateHint")}</p>
              </div>
              {/* Owned by AppUpdateHost, which shows what changed and installs it. */}
              <button type="button" onClick={() => { onDone?.(); window.__killioUpdate?.open(); }} className={button}>
                {t("accountMenu.checkUpdates")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="h-px w-full bg-border/50" />
    </>
  );
}
