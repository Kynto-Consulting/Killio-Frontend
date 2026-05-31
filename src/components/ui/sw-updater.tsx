"use client";

// Service worker lifecycle helper. When a new SW activates (after the user
// reloads the tab post-deploy), `controllerchange` fires — reload once so the
// page is served by the new SW immediately. Without this the user can stay
// stuck on a stale SW for hours/days, which is exactly what made all the
// offline fixes "not work" — the browser kept the old sw.js.

import React from "react";
import { resetWarmCache, warmCache } from "@/lib/warm-cache";

export function SwUpdater() {
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let reloaded = false;
    const onCtrlChange = () => {
      if (reloaded) return;
      reloaded = true;
      // Give the new SW a tick to settle before reload.
      setTimeout(() => window.location.reload(), 50);
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === "killio:warm-cache") {
        // New SW just activated — reset the warm-cache marker so warmCache()
        // actually runs (otherwise the 6h TTL would short-circuit it) and
        // re-prefetches every shell route into the fresh pages-cache.
        resetWarmCache();
        void warmCache();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onCtrlChange);
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.getRegistration().then((reg) => { reg?.update().catch(() => { /* noop */ }); }).catch(() => { /* noop */ });
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onCtrlChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
