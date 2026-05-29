"use client";

import React from "react";
import { createPortal } from "react-dom";
import { FileUp, FolderUp, Loader2, Check, AlertTriangle, X, FileText } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { unzipToFiles, fileListToFiles, type RawFile, type ImportSummary } from "@/lib/local-workspace/vault-import";

type Phase = "pick" | "importing" | "success" | "error";

export function ImportVaultModal({
  isOpen,
  onClose,
  run,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Perform the import for the chosen files, reporting progress. */
  run: (files: RawFile[], onProgress: (done: number, total: number, label?: string) => void) => Promise<ImportSummary>;
  onDone?: () => void;
}) {
  const t = useTranslations("documents");
  const [phase, setPhase] = React.useState<Phase>("pick");
  const [progress, setProgress] = React.useState({ done: 0, total: 0, label: "" });
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const zipInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) { setPhase("pick"); setProgress({ done: 0, total: 0, label: "" }); setSummary(null); }
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const start = async (files: RawFile[]) => {
    if (files.length === 0) { setPhase("error"); return; }
    setPhase("importing");
    try {
      const s = await run(files, (done, total, label) => setProgress({ done, total, label: label || "" }));
      setSummary(s);
      setPhase("success");
      onDone?.();
    } catch {
      setPhase("error");
    }
  };

  const onZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    try { await start(unzipToFiles(await f.arrayBuffer())); } catch { setPhase("error"); }
  };
  const onFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.currentTarget.value = "";
    if (list.length === 0) return;
    try { await start(await fileListToFiles(list)); } catch { setPhase("error"); }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={phase === "importing" ? undefined : onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        {phase !== "importing" && (
          <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        )}

        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-5 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {phase === "success" ? <Check className="h-6 w-6" /> : phase === "error" ? <AlertTriangle className="h-6 w-6 text-amber-500" /> : <FileUp className="h-6 w-6" />}
          </div>
          <h2 className="text-lg font-bold tracking-tight">
            {phase === "success" ? t("import.successTitle") : phase === "error" ? t("import.errorTitle") : t("import.title")}
          </h2>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {phase === "pick" && (
            <>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">{t("import.description")}</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => zipInputRef.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-4 py-5 hover:border-accent/40 hover:bg-accent/5 transition-colors">
                  <FileUp className="h-6 w-6 text-accent" />
                  <span className="text-sm font-semibold">{t("import.chooseZip")}</span>
                </button>
                <button onClick={() => folderInputRef.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-4 py-5 hover:border-accent/40 hover:bg-accent/5 transition-colors">
                  <FolderUp className="h-6 w-6 text-accent" />
                  <span className="text-sm font-semibold">{t("import.chooseFolder")}</span>
                </button>
              </div>
              <input ref={zipInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={onZip} />
              {/* @ts-expect-error non-standard directory attributes */}
              <input ref={folderInputRef} type="file" className="hidden" webkitdirectory="" directory="" multiple onChange={onFolder} />
            </>
          )}

          {phase === "importing" && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("import.progress")} {progress.done}/{progress.total}
              </div>
              {progress.label ? <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 truncate"><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{progress.label}</span></div> : null}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40"><div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} /></div>
            </div>
          )}

          {phase === "success" && summary && (
            <>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
                {t("import.successDescription", { docs: summary.documents, assets: summary.assets })}
              </p>
              {summary.failed > 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> {t("import.failedNote", { failed: summary.failed })}
                </div>
              ) : null}
              <div className="flex items-center justify-end pt-1">
                <button onClick={onClose} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 transition-colors">{t("import.done")}</button>
              </div>
            </>
          )}

          {phase === "error" && (
            <>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">{t("import.errorDescription")}</p>
              <div className="flex items-center justify-end pt-1">
                <button onClick={() => setPhase("pick")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 transition-colors">{t("import.retry")}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
