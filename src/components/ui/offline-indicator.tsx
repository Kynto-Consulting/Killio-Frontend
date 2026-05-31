"use client";

// Persistent banner + transition toasts driven by navigator.onLine.
// Mount once at the app shell level. Shows a small bottom-centre badge while
// offline so the user knows requests will fail, and fires a toast when the
// connection drops or comes back.

import React from "react";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { useTranslations } from "@/components/providers/i18n-provider";
import { toast } from "@/lib/toast";

export function OfflineIndicator() {
  const online = useOnline();
  const t = useTranslations("common");
  const prevRef = React.useRef<boolean>(online);
  const firstRef = React.useRef(true);

  React.useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      prevRef.current = online;
      // Don't fire a "lost" toast on the very first render — wait for a real
      // transition. Banner still shows.
      return;
    }
    if (prevRef.current && !online) toast(t("offline.lost"), "warning", 4000);
    if (!prevRef.current && online) toast(t("offline.restored"), "success", 2500);
    prevRef.current = online;
  }, [online, t]);

  if (online) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 left-1/2 z-[150] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 shadow-lg backdrop-blur-md">
        <WifiOff className="h-3.5 w-3.5" />
        <span>{t("offline.banner")}</span>
      </div>
    </div>
  );
}
