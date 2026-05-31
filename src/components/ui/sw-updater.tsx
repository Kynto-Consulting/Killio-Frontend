"use client";

// Service worker lifecycle helper. When a new SW activates (after the user
// reloads the tab post-deploy), `controllerchange` fires — reload once so the
// page is served by the new SW immediately. Without this the user can stay
// stuck on a stale SW for hours/days, which is exactly what made all the
// offline fixes "not work" — the browser kept the old sw.js.

import React from "react";

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
    navigator.serviceWorker.addEventListener("controllerchange", onCtrlChange);
    // Trigger an update check on every mount — picks up new sw.js on next
    // online navigation without waiting for the browser's 24h refresh.
    navigator.serviceWorker.getRegistration().then((reg) => { reg?.update().catch(() => { /* noop */ }); }).catch(() => { /* noop */ });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onCtrlChange);
  }, []);
  return null;
}
