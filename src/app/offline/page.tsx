"use client";

import React from "react";
import { useTranslations } from "@/components/providers/i18n-provider";

type LocalWs = { id: string; name: string };

export default function OfflinePage() {
  const t = useTranslations("landing");
  const [localWorkspaces, setLocalWorkspaces] = React.useState<LocalWs[]>([]);

  // Local workspaces are stored offline (localStorage + IndexedDB), so we can
  // offer to enter one even with no network — they don't depend on the cloud.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem("killio_local_workspaces");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setLocalWorkspaces(parsed);
    } catch { /* ignore */ }
  }, []);

  const openLocal = (id: string) => {
    try { window.localStorage.setItem("killio_active_local", id); } catch { /* ignore */ }
    window.location.href = "/d"; // cached app shell boots offline into local mode
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-8 bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-xl">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
              />
            </svg>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            {t("offline.title")}
          </h1>
          <p className="text-neutral-400 text-sm leading-relaxed">
            {t("offline.description")}
          </p>
        </div>

        {localWorkspaces.length > 0 && (
          <div className="pt-6 border-t border-neutral-800 space-y-2 text-left">
            <p className="text-xs uppercase tracking-wider text-neutral-500">{t("offline.localWorkspaces")}</p>
            {localWorkspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => openLocal(ws.id)}
                className="flex w-full items-center gap-2 rounded-lg bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
                {ws.name}
              </button>
            ))}
          </div>
        )}

        <div className="pt-6 border-t border-neutral-800 space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition-colors"
          >
            {t("offline.tryAgain")}
          </button>
          <button
            onClick={() => window.history.back()}
            className="w-full py-2.5 px-4 bg-neutral-800 text-white font-medium rounded-lg hover:bg-neutral-700 transition-colors"
          >
            {t("offline.goBack")}
          </button>
        </div>
      </div>
    </div>
  );
}
