"use client";

import { useEffect, useState } from "react";
import { Bell, Download, Loader2, Smartphone } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTenant } from "@/components/providers/tenant-provider";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { isStandalone, usePwaInstall } from "@/hooks/use-pwa-install";
import { getPushStatus, PUSH_KINDS, savePushPreferences, type PushKind, type PushPreferences } from "@/lib/api/push";
import { resolvePushUiState, type PushUiState } from "@/lib/pwa/support";

const STATE_TEXT: Record<Exclude<PushUiState, "off">, string> = {
  on: "stateOn",
  denied: "stateDenied",
  "needs-install": "stateNeedsInstall",
  unsupported: "stateUnsupported",
  "not-configured": "stateNotConfigured",
};

/** "Install app" + "Turn on notifications" + what to be notified about, for the signed-in user. */
export function NotificationSettings() {
  const { accessToken } = useSession();
  const t = useTranslations("profile");
  const tenant = useTenant();
  const appName = tenant.mode === "tenant" ? tenant.brand.name : "Killio";
  const install = usePwaInstall();
  const push = usePushSubscription(accessToken);

  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<PushPreferences>({ enabled: true, mutedKinds: [] });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void getPushStatus(accessToken).then((status) => {
      if (cancelled || !status) return;
      setServerConfigured(status.configured);
      setPrefs(status.preferences);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const state = resolvePushUiState({
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    maxTouchPoints: typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
    platform: typeof navigator === "undefined" ? "" : navigator.platform,
    standalone: typeof window === "undefined" ? false : isStandalone(),
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    hasPushManager: typeof window !== "undefined" && "PushManager" in window,
    hasNotification: typeof window !== "undefined" && "Notification" in window,
    permission: push.permission,
    subscribed: push.isSubscribed,
    serverConfigured,
  });

  async function toggle() {
    setBusy(true);
    setFailed(false);
    try {
      if (state === "on") await push.unsubscribe();
      else if (!(await push.subscribe())) setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function updatePrefs(next: PushPreferences) {
    const previous = prefs;
    setPrefs(next);
    if (!accessToken) return;
    const saved = await savePushPreferences(accessToken, next);
    if (!saved) setPrefs(previous);
  }

  function toggleKind(kind: PushKind) {
    const muted = prefs.mutedKinds.includes(kind) ? prefs.mutedKinds.filter((k) => k !== kind) : [...prefs.mutedKinds, kind];
    void updatePrefs({ ...prefs, mutedKinds: muted });
  }

  const card = "rounded-xl border border-border/70 bg-background/50 p-4";
  const button =
    "inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";

  return (
    <div className="space-y-6">
      <section className={card}>
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t("notifications.installTitle")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {install.state === "installed"
                ? t("notifications.installed", { app: appName })
                : install.state === "ios-manual"
                  ? t("notifications.installIos")
                  : install.state === "prompt"
                    ? t("notifications.installBody", { app: appName })
                    : t("notifications.installUnavailable")}
            </p>
            {install.state === "prompt" && (
              <button type="button" onClick={() => void install.install()} className={`${button} mt-3`}>
                <Download className="h-4 w-4" />
                {t("notifications.installButton")}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t("notifications.pushTitle")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {state === "off" ? t("notifications.pushBody") : t(`notifications.${STATE_TEXT[state]}`)}
            </p>
            {(state === "off" || state === "on") && (
              <button type="button" onClick={() => void toggle()} disabled={busy || !accessToken} className={`${button} mt-3`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {state === "on" ? t("notifications.disable") : t("notifications.enable")}
              </button>
            )}
            {failed && <p className="mt-2 text-xs text-destructive">{t("notifications.failed")}</p>}
          </div>
        </div>
      </section>

      {state === "on" && (
        <section className={card}>
          <p className="mb-3 text-sm font-medium text-foreground">{t("notifications.kindsTitle")}</p>
          <div className="space-y-2">
            {PUSH_KINDS.map((kind) => (
              <label key={kind} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span>{t(`notifications.kinds.${kind}`)}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={!prefs.mutedKinds.includes(kind)}
                  onChange={() => toggleKind(kind)}
                />
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
