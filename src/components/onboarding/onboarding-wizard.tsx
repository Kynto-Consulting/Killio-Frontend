"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket, Sparkles, X } from "lucide-react";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useBrandName } from "@/components/providers/tenant-provider";
import { useSession } from "@/components/providers/session-provider";
import { useUiMode } from "@/components/providers/ui-mode-provider";
import { OnboardingArt, type ArtScene } from "@/components/onboarding/onboarding-art";
import { ModePicker } from "@/components/onboarding/mode-picker";
import { toast } from "@/lib/toast";
import type { Locale } from "@/i18n";
import {
  applyAnswer, buildDemoPlan, clampStep, firstActionTarget, isStepAnswered, QUESTIONS, STEPS, suggestMode,
  type OnboardingAnswers, type QuestionId, type StepId,
} from "@/lib/ui-mode/onboarding";
import { createDemoSpace, deleteDemoSpace } from "@/lib/ui-mode/demo";
import type { UiMode } from "@/lib/ui-mode/ui-mode";

const SCENE: Record<StepId, ArtScene> = { welcome: "welcome", role: "about", occupation: "about", goals: "goals", teamSize: "team", firstAction: "start", language: "tour", start: "start" };
const MULTI: StepId[] = ["goals"];

export const ONBOARDING_NEW_ACCOUNT_KEY = "killio_onboarding_new";

/**
 * Welcome wizard: short screens, every one skippable, progress saved after each step so it can be resumed from Help.
 * Answers are stored in the user's preferences (server) and never gate access.
 */
export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const brand = useBrandName();
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const { accessToken, activeTeamId } = useSession();
  const ui = useUiMode();
  const [step, setStep] = useState(() => clampStep(ui.onboarding.step));
  const [answers, setAnswers] = useState<OnboardingAnswers>(ui.onboarding.answers);
  const [mode, setMode] = useState<UiMode | null>(null);
  const [working, setWorking] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const stepId = STEPS[step];
  const suggested = useMemo(() => suggestMode(answers), [answers]);
  const chosenMode: UiMode = mode ?? suggested ?? ui.mode;
  const isLast = stepId === "start";

  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const close = (status?: "skipped") => {
    void ui.patchOnboarding({ step, answers, ...(status ? { status } : {}) }).catch(() => {});
    try { localStorage.removeItem(ONBOARDING_NEW_ACCOUNT_KEY); } catch { /* ignore */ }
    ui.setWizardOpen(false);
  };

  const go = (next: number) => {
    const n = clampStep(next);
    setStep(n);
    void ui.patchOnboarding({ step: n, answers }).catch(() => {});
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); if (!working) close(); return; }
    if (e.key !== "Tab") return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])");
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const pick = (q: QuestionId, value: string) => {
    setAnswers((a) => applyAnswer(a, q, value));
    if (q === "occupation" || q === "role" || q === "teamSize" || q === "firstAction") return;
  };

  const pickLocale = (value: Locale) => {
    setAnswers((a) => ({ ...a, locale: value }));
    setLocale(value);
  };

  const finish = async (kind: "scratch" | "demo") => {
    if (working) return;
    setWorking(true);
    try {
      await ui.setMode(chosenMode).catch(() => toast(t("mode.saveError"), "error"));
      let demoBoardId: string | null = null;
      if (kind === "demo") {
        if (!accessToken || !activeTeamId) { toast(t("wizard.start.noWorkspace"), "error"); setWorking(false); return; }
        const plan = buildDemoPlan({
          board: t("demo.board"),
          lists: [
            { name: t("demo.lists.todo"), cards: [{ title: t("demo.cards.c1"), summary: t("demo.cards.c1s") }, { title: t("demo.cards.c2"), summary: t("demo.cards.c2s") }, { title: t("demo.cards.c3") }] },
            { name: t("demo.lists.doing"), cards: [{ title: t("demo.cards.c4") }] },
            { name: t("demo.lists.done"), cards: [{ title: t("demo.cards.c5"), summary: t("demo.cards.c5s") }] },
          ],
          document: t("demo.document"),
          paragraphs: [t("demo.p1"), t("demo.p2"), t("demo.p3")],
          template: { name: t("demo.template"), description: t("demo.templateDesc") },
        });
        try {
          const created = await createDemoSpace(plan, activeTeamId, accessToken);
          demoBoardId = created.boardId;
          await ui.patchOnboarding({ demo: { teamId: activeTeamId, createdAt: new Date().toISOString(), entities: created.entities } });
        } catch (error) {
          const partial = (error as { partial?: Parameters<typeof deleteDemoSpace>[0] }).partial;
          if (partial?.length) await deleteDemoSpace(partial, accessToken).catch(() => {});
          toast(t("wizard.start.demoError"), "error");
          setWorking(false);
          return;
        }
      }
      await ui.patchOnboarding({ status: "completed", step: STEPS.length - 1, answers }).catch(() => {});
      try { localStorage.removeItem(ONBOARDING_NEW_ACCOUNT_KEY); } catch { /* ignore */ }
      ui.setWizardOpen(false);
      if (demoBoardId) { router.push(`/b/${demoBoardId}`); return; }
      const target = firstActionTarget(answers);
      router.push(target === "board" ? "/b" : target === "document" ? "/d" : target === "invite" ? "/teams" : "/");
    } finally {
      setWorking(false);
    }
  };

  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const question = (STEPS.includes(stepId) && stepId in QUESTIONS ? (stepId as QuestionId) : null);
  const selected = (v: string) => (stepId === "goals" ? (answers.goals ?? []).includes(v) : (answers as Record<string, unknown>)[stepId] === v);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4 animate-in fade-in duration-200" onKeyDown={onKeyDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("wizard.dialogLabel")}
        className="relative flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-y-auto rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] animate-in zoom-in-95 duration-200"
      >
        <button type="button" onClick={() => close()} disabled={working} aria-label={t("wizard.later")} className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" />
        </button>

        <div className="p-3 md:p-4">
          <OnboardingArt scene={SCENE[stepId]} className="mx-auto h-40 w-full rounded-2xl md:h-auto" />
        </div>

        <div className="flex flex-col gap-4 p-5 md:p-7">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("wizard.stepOf", { current: step + 1, total: STEPS.length })}</span>
              <span className="sr-only">{progress}%</span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[hsl(var(--accent-ink))] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">{t(`wizard.${stepId}.title`, { brand })}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(`wizard.${stepId}.body`, { brand })}</p>
          </div>

          {question ? (
            <div role={MULTI.includes(stepId) ? "group" : "radiogroup"} aria-label={t(`wizard.${stepId}.title`, { brand })} className="flex flex-wrap gap-2">
              {QUESTIONS[question].map((v) => (
                <button
                  key={v}
                  type="button"
                  role={MULTI.includes(stepId) ? "checkbox" : "radio"}
                  aria-checked={selected(v)}
                  onClick={() => pick(question, v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected(v) ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border text-foreground hover:bg-muted"}`}
                >
                  {selected(v) ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {t(`options.${question}.${v}`)}
                </button>
              ))}
            </div>
          ) : null}

          {stepId === "language" ? (
            <div role="radiogroup" aria-label={t("wizard.language.title")} className="flex flex-wrap gap-2">
              {(["es", "en"] as Locale[]).map((l) => (
                <button key={l} type="button" role="radio" aria-checked={locale === l} onClick={() => pickLocale(l)} className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${locale === l ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border text-foreground hover:bg-muted"}`}>
                  {locale === l ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {t(`options.language.${l}`)}
                </button>
              ))}
            </div>
          ) : null}

          {isLast ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-2 text-sm font-medium">{t("wizard.start.modeTitle", { brand })}</p>
                <ModePicker value={chosenMode} onChange={setMode} suggested={suggested} disabled={working} name="wizard-ui-mode" stacked />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" disabled={working} onClick={() => void finish("scratch")} className="flex flex-col items-start gap-1 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                  <span className="flex items-center gap-2 text-sm font-semibold"><Rocket className="h-4 w-4" aria-hidden="true" />{t("wizard.start.scratch")}</span>
                  <span className="text-xs text-muted-foreground">{t("wizard.start.scratchBody")}</span>
                </button>
                <button type="button" disabled={working} onClick={() => void finish("demo")} className="flex flex-col items-start gap-1 rounded-xl bg-primary p-3 text-left text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                  <span className="flex items-center gap-2 text-sm font-semibold">{working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}{t("wizard.start.demo")}</span>
                  <span className="text-xs opacity-80">{working ? t("wizard.start.working") : t("wizard.start.demoBody")}</span>
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={() => close("skipped")} disabled={working} className="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t("wizard.skip")}
            </button>
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <button type="button" onClick={() => go(step - 1)} disabled={working} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("wizard.back")}
                </button>
              ) : null}
              {!isLast ? (
                <button type="button" onClick={() => go(step + 1)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {t("wizard.next")}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
          {!isStepAnswered(stepId, answers) ? <p className="-mt-2 text-xs text-muted-foreground">{t("wizard.resumeHint")}</p> : null}
        </div>
      </div>
    </div>
  );
}
