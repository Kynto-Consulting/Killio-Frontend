"use client";

import { useEffect } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { NOTICE_I18N_KEY, type CallNotice } from "@/lib/calls/call-errors";

interface RoomCallNoticeProps {
  notice: CallNotice;
  onDismiss: () => void;
  bottomOffset?: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * Toast for call problems (call full, screen denied, someone else is sharing...). Lives outside the call panel because a join
 * that is refused never opens the panel. Theme tokens, so it follows light / dark; announced to screen readers.
 */
export function RoomCallNotice({ notice, onDismiss, bottomOffset = 0, t }: RoomCallNoticeProps) {
  const info = notice.kind === "audioOnly" || notice.kind === "screenshareBusy";

  useEffect(() => {
    const id = setTimeout(onDismiss, 9000);
    return () => clearTimeout(id);
  }, [notice, onDismiss]);

  const params: Record<string, string | number> = {};
  if (notice.kind === "callFull") params.max = notice.max;
  if (notice.kind === "screenshareBusy") params.name = notice.sharerName || t("call.notice.someone");

  const Icon = info ? Info : AlertTriangle;
  return (
    <div
      role={info ? "status" : "alert"}
      aria-live={info ? "polite" : "assertive"}
      className={`fixed right-4 z-[600] flex max-w-sm items-start gap-2.5 rounded-xl border bg-card p-3 text-sm text-foreground shadow-lg ${
        info ? "border-border" : "border-destructive/40"
      }`}
      style={{ bottom: 16 + bottomOffset }}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${info ? "text-muted-foreground" : "text-destructive"}`} aria-hidden />
      <p className="flex-1 leading-snug">{t(NOTICE_I18N_KEY[notice.kind], params)}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("call.notice.dismiss")}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
