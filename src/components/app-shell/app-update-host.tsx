"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { killioApp, type KillioAppUpdate } from "@/lib/app-shell";

const CHECKED_KEY = "killio_app_update_checked";
const DISMISSED_KEY = "killio_app_update_dismissed";
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;

declare global {
  interface Window {
    /** Lets the account menu open the update dialog and check right away. */
    __killioUpdate?: { open: () => void };
  }
}

type View =
  | { kind: "closed" }
  | { kind: "checking" }
  | { kind: "result"; update: KillioAppUpdate }
  | { kind: "installing"; update: KillioAppUpdate }
  | { kind: "error"; message: string; update?: KillioAppUpdate };

/**
 * Updating Killio App from inside it. Checks for a newer published build now and then, and when the
 * person asks from the account menu; shows what changed and installs it (Windows) or opens the installer
 * (other systems). Renders nothing on the web or in app builds without the "update" feature.
 */
export function AppUpdateHost() {
  const t = useTranslations("dashboard");
  const { locale } = useI18n();
  const [view, setView] = useState<View>({ kind: "closed" });
  const busy = useRef(false);

  const check = useCallback(async (asked: boolean) => {
    const app = killioApp();
    if (!app?.checkUpdate || busy.current) return;
    busy.current = true;
    if (asked) setView({ kind: "checking" });
    try {
      const update = await app.checkUpdate();
      try { localStorage.setItem(CHECKED_KEY, String(Date.now())); } catch { /* checked again next time */ }
      let dismissed = 0;
      try { dismissed = Number(localStorage.getItem(DISMISSED_KEY)) || 0; } catch { /* offered again */ }
      // On its own the dialog only appears for a build the person has not already put off.
      if (asked || (update.available && update.latest > dismissed)) setView({ kind: "result", update });
    } catch (e) {
      if (asked) setView({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!killioApp()?.checkUpdate) return;
    window.__killioUpdate = { open: () => void check(true) };
    let last = 0;
    try { last = Number(localStorage.getItem(CHECKED_KEY)) || 0; } catch { /* check now */ }
    // A little after start, so it never competes with the page loading.
    const timer = Date.now() - last > CHECK_EVERY_MS ? window.setTimeout(() => void check(false), 8000) : undefined;
    return () => {
      if (timer) window.clearTimeout(timer);
      delete window.__killioUpdate;
    };
  }, [check]);

  if (view.kind === "closed") return null;

  const update = "update" in view ? view.update : undefined;
  const close = () => {
    if (update?.available) {
      try { localStorage.setItem(DISMISSED_KEY, String(update.latest)); } catch { /* offered again */ }
    }
    setView({ kind: "closed" });
  };
  const install = async () => {
    const app = killioApp();
    if (!app?.installUpdate || !update) return;
    setView({ kind: "installing", update });
    try {
      await app.installUpdate();
      // Where the app replaces itself it closes before this line; elsewhere the installer opened in the browser.
      if (update.mode === "download") setView({ kind: "closed" });
    } catch (e) {
      setView({ kind: "error", message: e instanceof Error ? e.message : String(e), update });
    }
  };

  const date = update?.date ? new Date(update.date) : null;
  const when = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(locale, { dateStyle: "medium" }) : "";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={view.kind === "installing" ? undefined : close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="app-update-title" className="text-base font-semibold">
            {view.kind === "checking"
              ? t("appShell.update.checking")
              : update?.available
                ? t("appShell.update.available")
                : update
                  ? t("appShell.update.upToDate")
                  : t("appShell.update.title")}
          </h2>
          {view.kind !== "installing" ? (
            <button type="button" onClick={close} aria-label={t("appShell.update.close")} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {view.kind === "checking" ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("appShell.update.checking")}</p>
        ) : null}

        {update ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {update.available
                ? t("appShell.update.versions", { current: update.current || "—", latest: update.latest })
                : t("appShell.update.version", { current: update.current || "—" })}
              {update.available && when ? ` · ${when}` : ""}
            </p>
            {update.available && update.notes.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("appShell.update.whatChanged")}</p>
                <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
                  {update.notes.map((note, i) => <li key={i} className="break-words">{note}</li>)}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}

        {view.kind === "error" ? <p className="mt-3 text-sm text-destructive" role="alert">{view.message}</p> : null}

        {update?.available ? (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {view.kind !== "installing" ? (
              <button type="button" onClick={close} className="h-9 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent/10">{t("appShell.update.later")}</button>
            ) : null}
            <button
              type="button"
              onClick={() => void install()}
              disabled={view.kind === "installing"}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
            >
              {view.kind === "installing" ? <Loader2 className="h-4 w-4 animate-spin" /> : update.mode === "install" ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {view.kind === "installing" ? t("appShell.update.installing") : update.mode === "install" ? t("appShell.update.install") : t("appShell.update.download")}
            </button>
          </div>
        ) : null}
        {update?.available ? (
          <p className="mt-3 text-xs text-muted-foreground">{update.mode === "install" ? t("appShell.update.installHint") : t("appShell.update.downloadHint")}</p>
        ) : null}
      </div>
    </div>
  );
}
