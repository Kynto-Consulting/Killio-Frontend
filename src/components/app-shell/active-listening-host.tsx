"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square, X } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { killioApp } from "@/lib/app-shell";
import { activeListening, type ListeningState } from "@/lib/app-shell/active-listening";

const OFF: ListeningState = { status: "off", speaking: false, phrases: 0, lastText: "", error: null };
const CONSENT_KEY = "killio_listening_consent";

declare global {
  interface Window {
    /** Lets the app's title bar (and the account menu) turn active listening on and off. */
    __killioListening?: { toggle: () => void };
    /** Read by the app to draw its microphone button: true on, false off, undefined not offered. */
    __killioListeningState?: boolean;
  }
}

/**
 * Active listening, inside Killio App only: owns the on/off switch the app's title bar uses and shows a
 * small card while the microphone is on, so it is never on without the person seeing it. Renders nothing
 * on the web or while signed out.
 */
export function ActiveListeningHost() {
  const { accessToken, activeTeamId } = useSession();
  const { locale } = useI18n();
  const t = useTranslations("dashboard");
  const state = useSyncExternalStore(activeListening.subscribe, activeListening.getState, () => OFF);
  // Decided after mount: the server never knows whether the page runs inside the app.
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(killioApp() !== null); }, []);

  // The capture outlives renders, so it reads the session through a ref that is always current.
  const session = useRef({ accessToken, activeTeamId, locale });
  session.current = { accessToken, activeTeamId, locale };

  const toggle = useCallback(() => {
    if (activeListening.isOn) {
      activeListening.stop();
      return;
    }
    if (!session.current.accessToken || !session.current.activeTeamId) return;
    // Asked once per device: it records the people around, not only the person using the app.
    let agreed = false;
    try { agreed = localStorage.getItem(CONSENT_KEY) === "1"; } catch { /* asked every time */ }
    if (!agreed) {
      if (!window.confirm(t("appShell.listening.consent"))) return;
      try { localStorage.setItem(CONSENT_KEY, "1"); } catch { /* asked again next time */ }
    }
    void activeListening.start({
      accessToken: () => session.current.accessToken,
      teamId: () => session.current.activeTeamId,
      language: () => session.current.locale,
    });
  }, [t]);

  const available = inApp && Boolean(accessToken && activeTeamId);
  useEffect(() => {
    if (!available) {
      // Signed out (or not the app): nothing to offer, and nothing may keep recording.
      if (activeListening.isOn) activeListening.stop();
      delete window.__killioListening;
      window.__killioListeningState = undefined;
      return;
    }
    window.__killioListening = { toggle };
    return () => { delete window.__killioListening; };
  }, [available, toggle]);

  useEffect(() => {
    if (available) window.__killioListeningState = state.status === "listening" || state.status === "starting";
  }, [available, state.status]);

  // Leaving the page ends the capture; say so to the app right away instead of on its next poll.
  useEffect(() => () => { if (activeListening.isOn) activeListening.stop(); }, []);

  if (!available || state.status === "off") return null;

  const failed = state.status === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[95] flex w-[min(20rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-lg"
    >
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${failed ? "bg-destructive/15 text-destructive" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
        <Mic className={`h-4 w-4 ${state.speaking ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-5">
          {failed ? t("appShell.listening.stopped") : state.status === "starting" ? t("appShell.listening.starting") : t("appShell.listening.on")}
        </p>
        {failed ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t("appShell.listening.saved", { count: state.phrases })}</p>
            {state.lastText ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">“{state.lastText}”</p> : null}
            {state.error ? <p className="mt-1 text-xs text-destructive">{state.error}</p> : null}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => activeListening.stop()}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={failed ? t("appShell.listening.dismiss") : t("appShell.listening.stop")}
        title={failed ? t("appShell.listening.dismiss") : t("appShell.listening.stop")}
      >
        {failed ? <X className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>
    </div>
  );
}
