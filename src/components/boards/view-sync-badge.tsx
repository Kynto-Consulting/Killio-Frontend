"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import { retryViewSync, useViewSyncState } from "./use-board-view";

/**
 * Shows when the board view settings are not (yet) saved on the server: saving, retrying after an error, or read-only
 * access (changes stay on this device). Renders nothing while everything is saved or in local workspace mode.
 */
export function ViewSyncBadge({ className = "" }: { className?: string }) {
  const t = useTranslations("board-filters");
  const state = useViewSyncState();
  if (state.status === "saving") return <span className={`text-[11px] text-muted-foreground ${className}`} role="status">{t("sync.saving")}</span>;
  if (state.status === "error") {
    return (
      <span className={`inline-flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400 ${className}`} role="alert" title={state.message}>
        {t("sync.error")}
        <button type="button" onClick={retryViewSync} className="underline hover:no-underline">{t("sync.retry")}</button>
      </span>
    );
  }
  if (state.status === "readonly") return <span className={`text-[11px] text-muted-foreground ${className}`} role="status" title={state.message}>{t("sync.readonly")}</span>;
  return null;
}
