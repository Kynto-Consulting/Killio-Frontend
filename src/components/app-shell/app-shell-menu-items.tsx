"use client";

import { useEffect, useState } from "react";
import { Server } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { killioApp } from "@/lib/app-shell";

/** Account-menu entries that only exist inside Killio App. Renders nothing on the web. */
export function AppShellMenuItems({ onDone }: { onDone?: () => void }) {
  const tDashboard = useTranslations("dashboard");
  // Decided after mount: the server never knows whether the page runs inside the app.
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(killioApp() !== null);
  }, []);

  if (!inApp) return null;

  return (
    <button
      onClick={() => {
        onDone?.();
        void killioApp()?.switchTenant();
      }}
      className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center"
    >
      <Server className="mr-2 h-4 w-4" /> {tDashboard("accountMenu.switchServer")}
    </button>
  );
}
