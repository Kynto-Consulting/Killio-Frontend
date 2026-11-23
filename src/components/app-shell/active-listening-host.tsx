"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Mic, Square, X } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { killioApp } from "@/lib/app-shell";
import { activeListening, type ListeningState } from "@/lib/app-shell/active-listening";
import { isWakePhraseEnabled, wakeCommand } from "@/lib/app-shell/wake-phrase";
import { assistantOrders } from "@/lib/app-shell/assistant-orders";
import { takeDueCronJobs } from "@/lib/app-shell/cron";

// Only loaded when an order is spoken: the assistant's panel is large and this host is on every page.
const AgentChatPanel = dynamic(() => import("@/components/agent/AgentChatPanel").then((m) => m.AgentChatPanel), { ssr: false });

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
      unnamedSpeaker: (number) => t("vault.speakers.person", { number }),
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

  // The wake phrase: a saved phrase that calls Killio by name is handed to the assistant as an order.
  const [order, setOrder] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!available) return;
    return activeListening.onPhrase((text) => {
      if (!isWakePhraseEnabled()) return;
      const command = wakeCommand(text);
      if (command) setOrder((previous) => ({ id: (previous?.id ?? 0) + 1, text: command }));
    });
  }, [available]);

  // Orders from elsewhere in the app, and the recurring prompts kept on this device: once a minute the
  // ones whose time has come are handed to the assistant, one at a time.
  useEffect(() => {
    if (!available) return;
    const show = (text: string) => setOrder((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
    const unsubscribe = assistantOrders.subscribe(show);
    const tick = () => { const due = takeDueCronJobs(); if (due.length > 0) show(due[0].prompt); };
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [available]);

  // Leaving the page ends the capture; say so to the app right away instead of on its next poll.
  useEffect(() => () => { if (activeListening.isOn) activeListening.stop(); }, []);

  const assistant = available && order && activeTeamId ? (
    <div className="fixed bottom-0 right-0 top-0 z-[94] flex w-[min(26rem,100vw)] shadow-2xl">
      <AgentChatPanel
        key={order.id}
        teamId={activeTeamId}
        initialMessage={order.text}
        autoSendInitial
        showCloseButton
        onClose={() => setOrder(null)}
        className="flex-1 border-l border-border"
      />
    </div>
  ) : null;

  if (!available || state.status === "off") return assistant;

  const failed = state.status === "error";
  return (
    <>
    {assistant}
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
    </>
  );
}
