"use client";

import React from "react";
import { createPortal } from "react-dom";
import { CloudUpload, Loader2, Check, AlertTriangle, X, WifiOff, GitMerge, RefreshCw } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import type { WorkspacePublishSummary } from "@/lib/local-workspace/publish-workspace";

export type PublishMode = "create" | "merge" | "override";
type Phase = "confirm" | "publishing" | "success" | "error";

export function PublishWorkspaceModal({
  isOpen,
  onClose,
  online,
  canPublish,
  itemCount,
  hasExisting = false,
  run,
}: {
  isOpen: boolean;
  onClose: () => void;
  online: boolean;
  canPublish: boolean;
  itemCount: number;
  /** True when this folder was already uploaded → offer Merge/Override. */
  hasExisting?: boolean;
  /** Runs the workspace publish in the given mode, reporting progress. */
  run: (mode: PublishMode, onProgress: (done: number, total: number) => void) => Promise<WorkspacePublishSummary>;
}) {
  const t = useTranslations("share-local");
  const [phase, setPhase] = React.useState<Phase>("confirm");
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [summary, setSummary] = React.useState<WorkspacePublishSummary | null>(null);

  React.useEffect(() => {
    if (isOpen) { setPhase("confirm"); setProgress({ done: 0, total: 0 }); setSummary(null); }
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const blocked = !online || !canPublish || itemCount === 0;
  const blockedMsg = !online ? t("offline") : !canPublish ? t("needAccount") : t("wsEmpty");

  const [chosenMode, setChosenMode] = React.useState<PublishMode>("create");
  const start = async (mode: PublishMode = "create") => {
    setChosenMode(mode);
    setPhase("publishing");
    try {
      const s = await run(mode, (done, total) => setProgress({ done, total }));
      setSummary(s);
      setPhase("success");
    } catch {
      setPhase("error");
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={phase === "publishing" ? undefined : onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        {phase !== "publishing" && (
          <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-5 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {phase === "success" ? <Check className="h-6 w-6" /> : phase === "error" ? <AlertTriangle className="h-6 w-6 text-amber-500" /> : <CloudUpload className="h-6 w-6" />}
          </div>
          <h2 className="text-lg font-bold tracking-tight">
            {phase === "success" ? t("wsSuccessTitle") : phase === "error" ? t("errorTitle") : t("wsTitle")}
          </h2>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {phase === "confirm" && (
            <>
              <p className="text-center text-sm font-medium text-foreground/90">{t("wsQuestion")}</p>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 text-center text-[13px] leading-relaxed text-muted-foreground">{t("wsDescription")}</div>
              {blocked ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
                  {!online ? <WifiOff className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{blockedMsg}
                </div>
              ) : null}

              {hasExisting && !blocked ? (
                <>
                  <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-center text-[12px] text-muted-foreground">
                    {t("wsAlreadyUploaded", { fallback: "This workspace is already in the cloud. Choose how to sync your local changes." })}
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    <button onClick={() => start("merge")} className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left hover:border-accent/50 hover:bg-accent/5 transition-colors">
                      <GitMerge className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold">{t("wsMerge", { fallback: "Merge" })}</span>
                        <span className="text-[12px] text-muted-foreground">{t("wsMergeDesc", { fallback: "Add and update from local; keep items only in the cloud." })}</span>
                      </span>
                    </button>
                    <button onClick={() => start("override")} className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left hover:border-destructive/50 hover:bg-destructive/5 transition-colors">
                      <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold">{t("wsOverride", { fallback: "Override" })}</span>
                        <span className="text-[12px] text-muted-foreground">{t("wsOverrideDesc", { fallback: "Delete the previous cloud copy and upload everything fresh." })}</span>
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center justify-end pt-1">
                    <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition-colors">{t("cancel")}</button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition-colors">{t("cancel")}</button>
                  <button onClick={() => start("create")} disabled={blocked} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 disabled:opacity-50 transition-colors">
                    <CloudUpload className="h-4 w-4" /> {t("wsConfirm")}
                  </button>
                </div>
              )}
            </>
          )}

          {phase === "publishing" && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("wsProgress", { done: progress.done, total: progress.total })}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {phase === "success" && summary && (
            <>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
                {t("wsSuccessDescription", { published: summary.published, total: summary.total })}
              </p>
              {summary.failed > 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> {t("wsFailedNote", { failed: summary.failed })}
                </div>
              ) : null}
              <div className="flex items-center justify-end pt-1">
                <button onClick={onClose} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 transition-colors">{t("done")}</button>
              </div>
            </>
          )}

          {phase === "error" && (
            <>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">{t("errorDescription")}</p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition-colors">{t("cancel")}</button>
                <button onClick={() => start(chosenMode)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 transition-colors">
                  <CloudUpload className="h-4 w-4" /> {t("retry")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
