"use client";

import React from "react";
import { useTranslations } from "@/components/providers/i18n-provider";

export default function OfflinePage() {
  const t = useTranslations("landing");

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
