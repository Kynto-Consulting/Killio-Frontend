"use client";

// Drop-in replacement for cloud-only page bodies when the device is offline.
// Renders a small centered card with a route-specific message + actions
// (retry / open local workspace / go home). Pages wrap their root in
// <OfflineRouteFallback view="teams">…</OfflineRouteFallback> — if online or
// in a local workspace the children render unchanged.

import React from "react";
import { WifiOff, RefreshCw, FolderOpen, Home } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { useTranslations } from "@/components/providers/i18n-provider";

type ViewKey =
  | "teams" | "history" | "metrics" | "rooms" | "marketplace"
  | "integrations" | "profile" | "preferences" | "pricing"
  | "estadisticas" | "generic";

export function OfflineRouteFallback({
  view,
  children,
  // If true, the route is hybrid (has local fallback) — only show the offline
  // card when the user has no local workspace selected. Default false: cloud-
  // only routes always show the card while offline.
  hybridLocalOk = false,
}: { view: ViewKey; children: React.ReactNode; hybridLocalOk?: boolean }) {
  const online = useOnline();
  const localWs = useLocalWorkspace();
  const localMode = localWs.mode === "local";
  const t = useTranslations("common");

  // Online → always render the real page.
  if (online) return <>{children}</>;
  // Hybrid route in local mode → render the real page (it has a local view).
  if (hybridLocalOk && localMode) return <>{children}</>;

  const message = t(`offline.fallback.views.${view}` as any);

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-card/60 p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
          <WifiOff className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{t("offline.fallback.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/90">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("offline.fallback.retry")}
          </button>
          {localWs.workspaces.length > 0 && (
            <button type="button" onClick={() => localWs.workspaces[0] && void localWs.selectLocalWorkspace(localWs.workspaces[0].id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/40">
              <FolderOpen className="h-3.5 w-3.5" />
              {t("offline.fallback.goLocal")}
            </button>
          )}
          <button type="button" onClick={() => { window.location.href = "/"; }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40">
            <Home className="h-3.5 w-3.5" />
            {t("offline.fallback.goHome")}
          </button>
        </div>
      </div>
    </div>
  );
}
