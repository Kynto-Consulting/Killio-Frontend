"use client";

import { useEffect, useState } from "react";
import { Mic, RefreshCw, Server } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { killioApp } from "@/lib/app-shell";

/** Account-menu entries that only exist inside Killio App. Renders nothing on the web. */
export function AppShellMenuItems({ onDone }: { onDone?: () => void }) {
  const tDashboard = useTranslations("dashboard");
  // Decided after mount: the server never knows whether the page runs inside the app.
  const [inApp, setInApp] = useState(false);
  // Older builds of the app cannot update themselves: the entry only shows where it works.
  const [canUpdate, setCanUpdate] = useState(false);
  useEffect(() => {
    setInApp(killioApp() !== null);
    setCanUpdate(typeof killioApp()?.checkUpdate === "function");
  }, []);

  if (!inApp) return null;

  return (
    <>
      <button
        onClick={() => {
          onDone?.();
          void killioApp()?.switchTenant();
        }}
        className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center"
      >
        <Server className="mr-2 h-4 w-4" /> {tDashboard("accountMenu.switchServer")}
      </button>
      <button
        onClick={() => {
          onDone?.();
          // Owned by ActiveListeningHost, which asks for consent and shows the card while it is on.
          window.__killioListening?.toggle();
        }}
        className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center"
      >
        <Mic className="mr-2 h-4 w-4" /> {tDashboard("accountMenu.activeListening")}
      </button>
      {canUpdate ? (
        <button
          onClick={() => {
            onDone?.();
            // Owned by AppUpdateHost, which shows what changed and installs it.
            window.__killioUpdate?.open();
          }}
          className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center"
        >
          <RefreshCw className="mr-2 h-4 w-4" /> {tDashboard("accountMenu.checkUpdates")}
        </button>
      ) : null}
    </>
  );
}
