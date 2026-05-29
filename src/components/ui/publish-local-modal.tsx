"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Share2, Globe, Loader2, Check, Copy, ExternalLink, AlertTriangle, X, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/components/providers/i18n-provider";
import type { PublishResult } from "@/lib/local-workspace/publish-local";

type Kind = "document" | "board" | "mesh";
type Phase = "confirm" | "publishing" | "success" | "error";

export function PublishLocalModal({
  isOpen,
  onClose,
  kind,
  online,
  canPublish,
  publish,
}: {
  isOpen: boolean;
  onClose: () => void;
  kind: Kind;
  online: boolean;
  /** true when there is a session + personal workspace to publish into */
  canPublish: boolean;
  publish: () => Promise<PublishResult>;
}) {
  const t = useTranslations("share-local");
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("confirm");
  const [result, setResult] = React.useState<PublishResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) { setPhase("confirm"); setResult(null); setCopied(false); }
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const kindLabel = kind === "document" ? t("kindDocument") : kind === "board" ? t("kindBoard") : t("kindMesh");
  const blocked = !online || !canPublish;
  const blockedMsg = !online ? t("offline") : t("needAccount");

  const handleConfirm = async () => {
    setPhase("publishing");
    try {
      const res = await publish();
      setResult(res);
      setPhase("success");
    } catch {
      setPhase("error");
    }
  };

  const fullUrl = result ? `${typeof window !== "undefined" ? window.location.origin : ""}${result.route}` : "";

  const copy = async () => {
    if (!fullUrl) return;
    try { await navigator.clipboard.writeText(fullUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>

        {/* Header band */}
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-5 text-center bg-gradient-to-b from-accent/10 to-transparent">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            {phase === "success" ? <Globe className="h-6 w-6" /> : phase === "error" ? <AlertTriangle className="h-6 w-6 text-amber-500" /> : <Share2 className="h-6 w-6" />}
          </div>
          <h2 className="text-lg font-bold tracking-tight">
            {phase === "success" ? t("successTitle") : phase === "error" ? t("errorTitle") : t("title")}
          </h2>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {(phase === "confirm" || phase === "publishing") && (
            <>
              <p className="text-center text-sm font-medium text-foreground/90">{t("question", { kind: kindLabel })}</p>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 text-center text-[13px] leading-relaxed text-muted-foreground">
                {t("description")}
              </div>

              {blocked ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
                  {!online ? <WifiOff className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {blockedMsg}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  disabled={phase === "publishing"}
                  className="h-9 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:bg-muted/60 disabled:opacity-50 transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={blocked || phase === "publishing"}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {phase === "publishing" ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("publishing")}</> : <><Globe className="h-4 w-4" /> {t("confirm")}</>}
                </button>
              </div>
            </>
          )}

          {phase === "success" && result && (
            <>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">{t("successDescription")}</p>
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                <Globe className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="flex-1 truncate text-xs font-mono text-foreground/80">{fullUrl}</span>
                <button onClick={copy} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-semibold hover:bg-muted/60 transition-colors">
                  {copied ? <><Check className="h-3 w-3 text-emerald-500" /> {t("copied")}</> : <><Copy className="h-3 w-3" /> {t("copyLink")}</>}
                </button>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition-colors">
                  {t("done")}
                </button>
                <button
                  onClick={() => { router.push(result.route); onClose(); }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" /> {t("open")}
                </button>
              </div>
            </>
          )}

          {phase === "error" && (
            <>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">{t("errorDescription")}</p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:bg-muted/60 transition-colors">
                  {t("cancel")}
                </button>
                <button
                  onClick={handleConfirm}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/90 transition-colors"
                >
                  <Share2 className="h-4 w-4" /> {t("retry")}
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
