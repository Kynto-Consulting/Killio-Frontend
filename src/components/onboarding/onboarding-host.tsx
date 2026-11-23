"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Compass, Layers, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { useUiMode } from "@/components/providers/ui-mode-provider";
import { useConfirm } from "@/hooks/ui";
import { toast } from "@/lib/toast";
import { OnboardingWizard, ONBOARDING_NEW_ACCOUNT_KEY } from "@/components/onboarding/onboarding-wizard";
import { ProductTour } from "@/components/onboarding/product-tour";
import { deleteDemoSpace, invalidateWorkspaceLists } from "@/lib/ui-mode/demo";
import { hasDemo, shouldAutoOpen } from "@/lib/ui-mode/onboarding";
import { isPathVisibleInMode } from "@/lib/ui-mode/ui-mode";

/** Deletes the demo space (confirmed first). Shared by the Help menu and the demo banner. */
export function useDeleteDemo() {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const { accessToken } = useSession();
  const ui = useUiMode();
  const { ask, ConfirmDialog } = useConfirm();
  const run = async () => {
    const demo = ui.onboarding.demo;
    if (!demo || !accessToken) return;
    const ok = await ask({ title: t("help.demoDelete"), description: t("help.demoDeleteConfirm"), variant: "destructive", confirmLabel: t("help.demoDelete"), cancelLabel: tCommon("actions.cancel") });
    if (!ok) return;
    try {
      const failed = await deleteDemoSpace(demo.entities, accessToken);
      invalidateWorkspaceLists(demo.teamId, demo.entities);
      await ui.patchOnboarding({ demo: failed.length ? { ...demo, entities: failed } : null });
      toast(failed.length ? t("help.demoDeletePartial", { count: failed.length }) : t("help.demoDeleted"), failed.length ? "error" : "success");
      // Lists of boards and documents are cached client-side: a full reload to home shows the space without the demo.
      if (!failed.length) setTimeout(() => window.location.assign("/"), 600);
    } catch {
      toast(t("help.demoDeleteError"), "error");
    }
  };
  return { run, ConfirmDialog };
}

/**
 * Mounted once in each dashboard layout. Opens the wizard automatically only for accounts that just signed up (flag set
 * by the signup page) or whose wizard was started and left unfinished; shows the tour and a small demo banner.
 */
export function OnboardingHost() {
  const t = useTranslations("onboarding");
  const ui = useUiMode();
  const { activeTeamId } = useSession();
  const del = useDeleteDemo();

  useEffect(() => {
    if (!ui.loaded) return;
    let flagged = false;
    try { flagged = localStorage.getItem(ONBOARDING_NEW_ACCOUNT_KEY) === "1"; } catch { /* ignore */ }
    if (shouldAutoOpen(ui.onboarding, flagged)) ui.setWizardOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.loaded]);

  const showDemo = hasDemo(ui.onboarding, activeTeamId);

  return (
    <>
      {ui.wizardOpen ? <OnboardingWizard /> : null}
      {ui.tourOpen ? <ProductTour /> : null}
      {showDemo && !ui.wizardOpen ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-xs shadow-lg">
          <span className="truncate">{t("help.demoBanner")}</span>
          <button type="button" onClick={() => void del.run()} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2.5 py-1 font-medium text-destructive-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Trash2 className="h-3 w-3" aria-hidden="true" />{t("help.demoBannerDelete")}
          </button>
        </div>
      ) : null}
      <del.ConfirmDialog />
    </>
  );
}

/** Replaces a page of the full mode with a calm notice (data untouched) and a way to switch or go home. */
export function ModeRouteGuard({ children }: { children: React.ReactNode }) {
  const t = useTranslations("onboarding");
  const pathname = usePathname();
  const router = useRouter();
  const ui = useUiMode();
  if (isPathVisibleInMode(pathname, ui.mode)) return <>{children}</>;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><Layers className="h-6 w-6" aria-hidden="true" /></div>
      <h1 className="text-lg font-semibold tracking-tight">{t("mode.hiddenTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("mode.hiddenBody")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => void ui.setMode("full")} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("mode.switchFull")}</button>
        <button type="button" onClick={() => router.push("/")} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("mode.goHome")}</button>
      </div>
    </div>
  );
}

/** Help, in Preferences: welcome assistant, first-steps tour and (only when a demo exists) delete the demo. */
export function HelpSettings({ onDone }: { onDone: () => void }) {
  const t = useTranslations("onboarding");
  const ui = useUiMode();
  const { activeTeamId } = useSession();
  const del = useDeleteDemo();
  const item = "inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent/10";
  return (
    <div className="space-y-3">
      <label className="flex items-center text-sm font-medium leading-none">
        <Compass className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" /> {t("help.title")}
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={item} onClick={() => { onDone(); ui.setWizardOpen(true); }}>
          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" /> {t("help.wizard")}
        </button>
        <button type="button" className={item} onClick={() => { onDone(); ui.setTourOpen(true); }}>
          <Compass className="mr-2 h-4 w-4" aria-hidden="true" /> {t("help.tour")}
        </button>
        {hasDemo(ui.onboarding, activeTeamId) ? (
          <button type="button" className={`${item} text-destructive`} onClick={() => void del.run()}>
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> {t("help.demoDelete")}
          </button>
        ) : null}
      </div>
      <del.ConfirmDialog />
    </div>
  );
}
