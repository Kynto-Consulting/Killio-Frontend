"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useUiMode } from "@/components/providers/ui-mode-provider";
import { OnboardingArt, type ArtScene } from "@/components/onboarding/onboarding-art";

const STEPS: { id: string; scene: ArtScene; fullOnly?: boolean }[] = [
  { id: "boards", scene: "start" },
  { id: "cards", scene: "welcome" },
  { id: "documents", scene: "about" },
  { id: "team", scene: "team" },
  { id: "palette", scene: "tour" },
  { id: "modes", scene: "goals" },
];

/** Optional first-steps tour. Reopenable from Help. Closing it (or finishing) records `tourDone`; nothing else changes. */
export function ProductTour() {
  const t = useTranslations("onboarding");
  const ui = useUiMode();
  const [i, setI] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useEffect(() => { headingRef.current?.focus(); }, [i]);

  const close = () => {
    void ui.patchOnboarding({ tourDone: true }).catch(() => {});
    ui.setTourOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key === "ArrowRight" && !last) setI(i + 1);
    if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
    if (e.key !== "Tab") return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])");
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0], lastNode = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastNode.focus(); }
    else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-4 animate-in fade-in duration-200" onKeyDown={onKeyDown}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t("tour.dialogLabel")} className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl animate-in zoom-in-95 duration-200">
        <button type="button" onClick={close} aria-label={t("tour.skip")} className="absolute right-3 top-3 z-10 rounded-full bg-card/80 p-1.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" />
        </button>
        <OnboardingArt scene={step.scene} className="h-44 w-full" />
        <div className="space-y-3 p-5">
          <p className="text-xs text-muted-foreground">{t("tour.stepOf", { current: i + 1, total: STEPS.length })}</p>
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">{t(`tour.steps.${step.id}.title`)}</h2>
          <p className="text-sm text-muted-foreground">{t(`tour.steps.${step.id}.body`)}</p>
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={close} className="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("tour.skip")}</button>
            <div className="flex gap-2">
              {i > 0 ? (
                <button type="button" onClick={() => setI(i - 1)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("tour.back")}
                </button>
              ) : null}
              <button type="button" onClick={last ? close : () => setI(i + 1)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {last ? t("tour.done") : t("tour.next")}{last ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
