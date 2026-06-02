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

    // Force-update + force-activate any waiting SW. Without this the new
    // bundle ships but Chrome keeps the old SW (and its precache of dead
    // chunk hashes) for another 24h on default heuristics, so users get
    // ERR_ABORTED 404 on every page load after a deploy.
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.update().catch(() => { /* noop */ });
      if (reg.waiting) {
        try { reg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch { /* noop */ }
      }
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            try { nw.postMessage({ type: "SKIP_WAITING" }); } catch { /* noop */ }
          }
        });
      });
    }).catch(() => { /* noop */ });

    // 404 self-heal: if any /_next/static asset 404s in this page, the
    // active SW precache is stale — wipe caches + unregister + reload.
    // Once. Idempotent guard via sessionStorage.
    const onError = (ev: Event) => {
      const tgt: any = ev.target;
      const src: string | undefined = tgt?.src || tgt?.href;
      if (!src || !src.includes("/_next/static/")) return;
      if (sessionStorage.getItem("killio_sw_self_heal")) return;
      sessionStorage.setItem("killio_sw_self_heal", "1");
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch { /* ignore */ }
        window.location.reload();
      })();
    };
    window.addEventListener("error", onError, true);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onCtrlChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("error", onError, true);
    };
  }, []);
  return null;
}
