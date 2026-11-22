"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarClock, Loader2 } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { useTenant } from "@/components/providers/tenant-provider";
import { SOFT_PRIMARY, SOFT_SECONDARY } from "@/components/marketplace/pack-ui";
import {
  cancelPackSubscription, getPackSubscription, resumePackSubscription, subscribeToPack,
  type MarketplacePack,
} from "@/lib/api/marketplace";
import { formatPackPrice } from "@/lib/marketplace/pricing";
import { subscriptionView, type PackSubscription } from "@/lib/marketplace/subscription";

const DAY_MS = 86_400_000;

/**
 * Monthly subscription of the ACTIVE workspace to a pack: state, subscribe (opens the MercadoPago checkout the backend created),
 * cancel at the end of the period and resume. The backend decides whether the team holds the pack; this only shows it.
 */
export function PackSubscriptionPanel({ pack }: { pack: MarketplacePack }) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const { accessToken, activeTeamId } = useSession();
  const isTenant = useTenant().mode === "tenant";

  const [sub, setSub] = useState<PackSubscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = formatPackPrice(pack, locale);
  const fmtDate = (iso: string | null, plusDays = 0) =>
    iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(new Date(iso).getTime() + plusDays * DAY_MS)) : "";

  const load = useCallback(async () => {
    if (isTenant || !accessToken || !activeTeamId) return;
    setLoading(true);
    try {
      const state = await getPackSubscription(activeTeamId, pack.id, accessToken);
      setSub(state.subscription);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("subscription.errors.generic"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeTeamId, isTenant, pack.id, t]);

  useEffect(() => { load().catch(() => undefined); }, [load]);

  if (isTenant) {
    return <p className="rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground/80" data-testid="pack-subscription-hub-only">{t("subscription.hubOnly")}</p>;
  }
  if (!accessToken) return null;
  if (!activeTeamId) return <p className="text-[13px] text-foreground/70">{t("subscription.noTeam")}</p>;

  const view = subscriptionView(sub);
  const priceLabel = price.kind === "free" ? "" : price.label;
  const accessUntil = sub?.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd, sub.status === "past_due" && !sub.cancelAtPeriodEnd ? sub.graceDays : 0) : "";

  const run = async (action: () => Promise<{ checkoutUrl?: string | null }>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("subscription.errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const statusText = (() => {
    switch (view.state) {
      case "pending": return t("subscription.states.pending");
      case "trialing": return t("subscription.states.trialing", { date: fmtDate(sub?.currentPeriodEnd ?? null) });
      case "active": return t("subscription.states.active", { date: fmtDate(sub?.currentPeriodEnd ?? null) });
      case "past_due": return t("subscription.states.pastDue", { date: accessUntil });
      case "ending": return t("subscription.states.ending", { date: accessUntil });
      case "ended": return t("subscription.states.ended");
      default: return pack.trialDays ? t("subscription.trial", { days: pack.trialDays }) : t("subscription.perMonth", { price: priceLabel });
    }
  })();

  return (
    <section aria-label={t("subscription.title")} className="space-y-2 rounded-2xl border border-border bg-background p-4" data-testid="pack-subscription" data-state={view.state}>
      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        {t("subscription.title")}
        <span className="ml-auto text-[13px] font-semibold text-foreground/70">{t("subscription.perMonth", { price: priceLabel })}</span>
      </div>
      {loading ? <p role="status" className="flex items-center gap-2 text-[13px] text-foreground/70"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t("status.loading")}</p> : <p className="text-[13px] text-foreground/80">{statusText}</p>}
      {view.state === "none" && pack.trialDays ? <p className="text-[12px] text-foreground/70">{t("subscription.trial", { days: pack.trialDays })}</p> : null}
      {view.state === "past_due" ? <p className="text-[12px] text-foreground/70">{t("subscription.pastDueHint")}</p> : null}

      {view.action === "subscribe" ? (
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void run(() => subscribeToPack(activeTeamId, pack.id, accessToken))}
          className={`${SOFT_PRIMARY} h-10 w-full px-5 text-sm`}
        >
          {view.state === "pending" ? t("subscription.continuePayment") : t("subscription.subscribe", { price: priceLabel })}
        </button>
      ) : null}
      {view.action === "cancel" ? (
        <>
          <button type="button" disabled={busy || loading} onClick={() => void run(() => cancelPackSubscription(activeTeamId, pack.id, accessToken))} className={`${SOFT_SECONDARY} h-9 w-full px-3 text-[13px]`}>
            {t("subscription.cancel")}
          </button>
          <p className="text-[12px] text-foreground/70">{t("subscription.cancelHint", { date: fmtDate(sub?.currentPeriodEnd ?? null) })}</p>
        </>
      ) : null}
      {view.action === "resume" ? (
        <button type="button" disabled={busy || loading} onClick={() => void run(() => resumePackSubscription(activeTeamId, pack.id, accessToken))} className={`${SOFT_PRIMARY} h-10 w-full px-5 text-sm`}>
          {t("subscription.resume")}
        </button>
      ) : null}
      {error ? <p role="alert" className="flex items-center gap-1.5 text-[12px] font-semibold text-red-700 dark:text-red-300"><AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />{error}</p> : null}
    </section>
  );
}
