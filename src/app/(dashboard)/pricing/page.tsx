"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, CircleDollarSign, ClipboardCheck, Cpu, Headset, History, LayoutGrid, Loader2, Mail, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import {
  BillingCycle,
  cancelTeamSubscription,
  createTeamCheckout,
  getTeamBillingSummary,
  resumeTeamSubscription,
  TeamBillingSummary,
  TeamPlanTier,
} from "@/lib/api/billing";
import { getScriptsUsage, ScriptMonthlyUsage } from "@/lib/api/scripts";
import { getTeamAiUsage, getTeamRagStatus, TeamAiUsage, TeamRagStatus } from "@/lib/api/contracts";

const PLAN_ORDER: TeamPlanTier[] = ["free", "pro", "max"];

const PLAN_THEME: Record<TeamPlanTier, string> = {
  free: "border-white/15 bg-gradient-to-b from-[#0a1220]/90 to-[#04070f]/90",
  pro: "relative border-indigo-500/50 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.25),transparent_70%),linear-gradient(180deg,#0a1220,#04070f)] shadow-[0_0_40px_-10px_rgba(99,102,241,0.4)]",
  max: "border-cyan-400/40 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.2),transparent_70%),linear-gradient(180deg,#0a1220,#04070f)] shadow-[0_0_30px_-10px_rgba(34,211,238,0.3)]",
  enterprise: "border-white/15 bg-gradient-to-b from-[#0a1220]/90 to-[#04070f]/90",
};

type NoticeType = "success" | "error" | "info";

function formatIsoDate(iso: string, locale: "es" | "en"): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-PE" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(iso));
}

export default function PricingPage() {
  const { locale } = useI18n();
  const t = useTranslations("pricing");
  const { accessToken, activeTeamId } = useSession();
  const searchParams = useSearchParams();

  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<TeamBillingSummary | null>(null);
  const [scriptsUsage, setScriptsUsage] = useState<ScriptMonthlyUsage | null>(null);
  const [aiUsage, setAiUsage] = useState<TeamAiUsage | null>(null);
  const [ragStatus, setRagStatus] = useState<TeamRagStatus | null>(null);
  const [actionLoadingTier, setActionLoadingTier] = useState<TeamPlanTier | null>(null);
  const [subActionLoading, setSubActionLoading] = useState<"cancel" | "resume" | null>(null);
  const [notice, setNotice] = useState<{ type: NoticeType; message: string } | null>(null);

  const formatMoney = useCallback((amountCents: number | null, currency: "PEN" = "PEN") => {
    if (amountCents === null) return t("common.na");
    return new Intl.NumberFormat(locale === "es" ? "es-PE" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amountCents / 100);
  }, [locale, t]);

  const reloadData = useCallback(async () => {
    if (!accessToken || !activeTeamId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [billingSummary, scripts, ai, rag] = await Promise.all([
        getTeamBillingSummary(activeTeamId, accessToken),
        getScriptsUsage(activeTeamId, accessToken),
        getTeamAiUsage(activeTeamId, accessToken),
        getTeamRagStatus(activeTeamId, accessToken),
      ]);

      setBilling(billingSummary);
      setScriptsUsage(scripts);
      setAiUsage(ai);
      setRagStatus(rag);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("checkout.failed"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeTeamId, t]);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  useEffect(() => {
    const billingState = searchParams.get("billing");
    if (!billingState) return;

    if (billingState === "success") {
      setNotice({ type: "success", message: t("billingResult.success") });
    } else if (billingState === "pending") {
      setNotice({ type: "info", message: t("billingResult.pending") });
    } else if (billingState === "failure") {
      setNotice({ type: "error", message: t("billingResult.failure") });
    }
  }, [searchParams, t]);

  const orderedPlans = useMemo(() => {
    const plans = (billing?.plans || []).filter((plan) => plan.tier !== "enterprise");
    plans.sort((a, b) => PLAN_ORDER.indexOf(a.tier) - PLAN_ORDER.indexOf(b.tier));
    return plans;
  }, [billing]);

  const selectedAnnualDiscount = useMemo(() => {
    const pro = orderedPlans.find((plan) => plan.tier === "pro");
    return Math.max(0, Number(pro?.yearlyDiscountPct || 0));
  }, [orderedPlans]);

  const billingEmail = billing?.billingEmail || "killio@kynto.studio";
  const currentPlanTier = billing?.currentPlanTier || "free";

  const handlePlanAction = async (targetTier: TeamPlanTier) => {
    if (!activeTeamId || !accessToken) return;

    const plan = orderedPlans.find((item) => item.tier === targetTier);
    if (!plan) return;

    const canStartTrial = targetTier !== "free"
      && targetTier !== "enterprise"
      && Boolean(billing?.trial?.eligible?.[targetTier as "pro" | "max"])
      && plan.trialDays > 0
      && currentPlanTier === "free";

    setActionLoadingTier(targetTier);
    setNotice(null);

    try {
      const checkout = await createTeamCheckout(activeTeamId, targetTier, accessToken, {
        billingCycle,
        startTrial: canStartTrial,
      });

      if (checkout.mode === "trial_activated") {
        setNotice({
          type: "success",
          message: t("checkout.trialActivated", {
            date: formatIsoDate(checkout.trialEndsAt, locale),
          }),
        });
        await reloadData();
        return;
      }

      if (checkout.mode === "wallet_brick") {
        window.open(checkout.initPoint, "_blank", "noopener,noreferrer");
        setNotice({ type: "success", message: t("checkout.opened") });
        return;
      }

      setNotice({
        type: "info",
        message: t("checkout.contactSales", {
          message: checkout.message,
          email: checkout.billingEmail,
        }),
      });
    } catch (err) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : t("checkout.failed"),
      });
    } finally {
      setActionLoadingTier(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!activeTeamId || !accessToken) return;
    setSubActionLoading("cancel");
    setNotice(null);
    try {
      await cancelTeamSubscription(activeTeamId, accessToken);
      setNotice({ type: "success", message: t("subscription.cancelScheduled") });
      await reloadData();
    } catch (err) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : t("checkout.failed") });
    } finally {
      setSubActionLoading(null);
    }
  };

  const handleResumeSubscription = async () => {
    if (!activeTeamId || !accessToken) return;
    setSubActionLoading("resume");
    setNotice(null);
    try {
      await resumeTeamSubscription(activeTeamId, accessToken);
      await reloadData();
    } catch (err) {
      setNotice({ type: "error", message: err instanceof Error ? err.message : t("checkout.failed") });
    } finally {
      setSubActionLoading(null);
    }
  };

  const extraQuotaSubject = encodeURIComponent("Killio - Extra quota");
  const extraQuotaBody = encodeURIComponent(
    locale === "es"
      ? "Hola equipo, quiero comprar cuota extra de ejecuciones de scripts y creditos de IA para mi workspace."
      : "Hi team, I want to purchase extra script calls and AI credits for my workspace.",
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{t("hero.title")}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">{t("hero.subtitle")}</p>
            </div>

            {/* Estado actual del workspace */}
            <div className="flex flex-col items-end gap-2">
              <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-widest text-slate-400">{t("hero.currentPlan")}</p>
                <p className="text-2xl font-extrabold text-white">{currentPlanTier.toUpperCase()}</p>
              </div>
              {billing?.subscription?.trialEndsAt && billing.subscription.status === "trialing" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  {t("hero.trialActive", { date: formatIsoDate(billing.subscription.trialEndsAt, locale) })}
                </span>
              ) : billing?.subscription?.status && billing.subscription.status !== "active" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-300">
                  {t(`status.${billing.subscription.status}`)}
                </span>
              ) : billing?.subscription?.status === "active" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t("status.active")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <div className="inline-flex rounded-xl border border-white/10 bg-black/25 p-1">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`mr-4 ml-4 rounded-lg px-4 py-2 text-sm font-semibold transition ${billingCycle === "monthly" ? "bg-white/95 text-black" : "text-slate-300 hover:text-white"}`}
              >
                {t("cycles.monthly")}
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`mr-2 ml-2  inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${billingCycle === "yearly" ? "bg-white/95 text-black" : "text-slate-300 hover:text-white"}`}
              >
                {t("cycles.yearly")}
                {selectedAnnualDiscount > 0 ? (
                  <span className={`rounded-xl px-2 py-0.5 text-[10px] uppercase tracking-wider  ${billingCycle === "yearly" ? "bg-indigo-500 text-indigo-100" : "bg-indigo-500/20 text-indigo-200"}`}>
                    {t("cycles.save", { pct: selectedAnnualDiscount })}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          {notice ? (
            <div
              className={`mt-4 rounded-xl border px-4 py-2 text-sm ${
                notice.type === "error"
                  ? "border-red-400/40 bg-red-500/10 text-red-200"
                  : notice.type === "success"
                    ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                    : "border-cyan-300/30 bg-cyan-400/10 text-cyan-100"
              }`}
            >
              {notice.message}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</div>
          ) : null}

        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {orderedPlans.map((plan) => {
            const isCurrent = plan.tier === currentPlanTier;
            const planPrice = billingCycle === "yearly" ? plan.priceCentsYearly : plan.priceCentsMonthly;
            const hasYearlyPrice = plan.priceCentsYearly !== null;
            const canStartTrial = plan.tier !== "free"
              && plan.tier !== "enterprise"
              && Boolean(billing?.trial?.eligible?.[plan.tier as "pro" | "max"])
              && plan.trialDays > 0
              && currentPlanTier === "free";

            const scriptsValue = plan.scripts.monthlyRunLimit === null
              ? t("common.unlimited")
              : `${plan.scripts.monthlyRunLimit}${t("common.monthSuffix")}`;

            const tableValue = plan.killioTables.maxTables === null
              ? t("common.unlimited")
              : `${plan.killioTables.maxTables} (${plan.killioTables.storageLimitMb ?? 0}MB)`;

            const historyValue = plan.activity.historyRetentionDays === null
              ? t("common.unlimited")
              : t("common.days", { count: plan.activity.historyRetentionDays });

            const meshBoardsValue = plan.meshBoards.maxBoards === null
              ? t("common.unlimited")
              : String(plan.meshBoards.maxBoards);

            const providerKey = plan.tier as "free" | "pro" | "max" | "enterprise";
            const planTitle = t(`plans.${plan.tier}.name`) || plan.label;
            const planHeadline = t(`plans.${plan.tier}.headline`);
            const badge = t(`plans.${plan.tier}.badge`);

            const isPro = plan.tier === "pro";
            const isMax = plan.tier === "max";

            const currentTierIndex = PLAN_ORDER.indexOf(currentPlanTier);
            const thisTierIndex = PLAN_ORDER.indexOf(plan.tier);
            const isDowngrade = !isCurrent && thisTierIndex < currentTierIndex && currentTierIndex !== -1;
            const isInTrial = billing?.subscription?.status === "trialing";

            // Etiqueta del botón
            const buttonLabel = (() => {
              if (isCurrent && billing?.subscription?.billingCycle === billingCycle) return t("actions.currentPlan");
              if (canStartTrial) return t("actions.startTrial", { days: plan.trialDays });
              if (isCurrent) return billingCycle === "yearly" ? t("actions.switchToYearly") : t("actions.switchToMonthly");
              if (isDowngrade) return t("actions.downgrade");
              return t("actions.upgrade");
            })();

            return (
              <article key={plan.tier} className={`group relative flex flex-col overflow-hidden rounded-xl border p-8 text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${PLAN_THEME[plan.tier]}`}>
                {isPro && (
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-70" />
                )}
                {isMax && (
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-70" />
                )}

                {/* Badge fija en esquina superior derecha */}
                {badge ? (
                  <span className={`absolute right-6 top-6 inline-flex rounded-md border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${isPro ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-300" : isMax ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-300" : "border-white/20 bg-white/10 text-slate-200"}`}>
                    {badge}
                  </span>
                ) : null}

                {/* Título + descripción — altura fija para alinear precio */}
                <div className="min-h-[80px] pr-20">
                  <h2 className="text-2xl font-black tracking-tight">{planTitle}</h2>
                  <p className="mt-2 text-sm text-slate-400">{planHeadline}</p>
                </div>

                {/* Precio — altura fija para alinear botón */}
                <div className="mt-6 border-b border-white/5 pb-6">
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-black tracking-tighter leading-none">{formatMoney(planPrice)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-400">
                    {billingCycle === "yearly" ? t("common.perUserYear") : t("common.perUserMonth")}
                  </p>
                  <div className="mt-1 h-5">
                    {billingCycle === "yearly" && hasYearlyPrice && plan.priceCentsYearly !== null ? (
                      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                        {formatMoney(Math.round(plan.priceCentsYearly / 12))}{t("common.monthSuffix")} billed annually
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Botón — siempre en la misma posición vertical */}
                <button
                  type="button"
                  disabled={actionLoadingTier === plan.tier || (isCurrent && billing?.subscription?.billingCycle === billingCycle)}
                  className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold shadow-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                    isDowngrade
                      ? "border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 focus-visible:outline-white/30"
                      : isPro
                        ? "bg-indigo-500 text-white hover:bg-indigo-400 focus-visible:outline-indigo-500 shadow-indigo-500/25 hover:shadow-indigo-500/40"
                        : isMax
                          ? "bg-cyan-500 text-slate-900 hover:bg-cyan-400 focus-visible:outline-cyan-500 shadow-cyan-500/25 hover:shadow-cyan-500/40"
                          : "bg-white text-slate-900 hover:bg-slate-100 focus-visible:outline-white"
                  }`}
                  onClick={() => handlePlanAction(plan.tier)}
                >
                  {actionLoadingTier === plan.tier ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  {buttonLabel}
                </button>

                {/* Pill de trial si el plan actual está en trial */}
                {isCurrent && isInTrial && billing?.subscription?.trialEndsAt ? (
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-amber-300">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                    {t("hero.trialActive", { date: formatIsoDate(billing.subscription.trialEndsAt, locale) })}
                  </div>
                ) : null}

                {/* Features */}
                <div className="mt-8 flex-1 space-y-4 text-sm font-medium text-slate-300">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t("plans.featuresTitle")}</p>
                  <ul className="space-y-3.5">
                    <li className="flex items-start gap-3">
                      <Zap className={`mt-0.5 h-4 w-4 shrink-0 ${isPro ? "text-indigo-400" : isMax ? "text-cyan-400" : "text-slate-400"}`} />
                      <span>{t("plans.scripts", { value: scriptsValue })}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CircleDollarSign className={`mt-0.5 h-4 w-4 shrink-0 ${isPro ? "text-indigo-400" : isMax ? "text-cyan-400" : "text-slate-400"}`} />
                      <span>{t("plans.credits", { value: plan.ai.monthlyCreditLimit.toFixed(2) })}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Cpu className={`mt-0.5 h-4 w-4 shrink-0 ${isPro ? "text-indigo-400" : isMax ? "text-cyan-400" : "text-slate-400"}`} />
                      <span>{t("provider.label")}: <span className="text-white">{t(`provider.${providerKey}`)}</span></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <History className={`mt-0.5 h-4 w-4 shrink-0 ${isPro ? "text-indigo-400" : isMax ? "text-cyan-400" : "text-slate-400"}`} />
                      <span>{t("plans.activityHistory", { value: historyValue })}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Sparkles className={`mt-0.5 h-4 w-4 shrink-0 ${isPro ? "text-indigo-400" : isMax ? "text-cyan-400" : "text-slate-400"}`} />
                      <span>{t("plans.tables", { value: tableValue })}</span>
                    </li>
                    {plan.meshBoards.maxBoards !== 0 && (
                      <li className="flex items-start gap-3">
                        <LayoutGrid className={`mt-0.5 h-4 w-4 shrink-0 ${isPro ? "text-indigo-400" : isMax ? "text-cyan-400" : "text-slate-400"}`} />
                        <span>{t("plans.meshBoards", { value: meshBoardsValue })}</span>
                      </li>
                    )}
                    {(plan.support.priority || plan.support.custom || plan.support.ssoScim || plan.activity.auditLogs) && (
                      <>
                        <li className="border-t border-white/5 pt-3" />
                        {plan.support.priority && (
                          <li className="flex items-start gap-3">
                            <Headset className={`mt-0.5 h-4 w-4 shrink-0 ${isPro ? "text-indigo-400" : isMax ? "text-cyan-400" : "text-slate-400"}`} />
                            <span>{t("plans.prioritySupport")}</span>
                          </li>
                        )}
                        {plan.support.custom && (
                          <li className="flex items-start gap-3">
                            <Headset className={`mt-0.5 h-4 w-4 shrink-0 ${isMax ? "text-cyan-400" : "text-slate-400"}`} />
                            <span>{t("plans.customSupport")}</span>
                          </li>
                        )}
                        {plan.support.ssoScim && (
                          <li className="flex items-start gap-3">
                            <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${isMax ? "text-cyan-400" : "text-slate-400"}`} />
                            <span>{t("plans.ssoScim")}</span>
                          </li>
                        )}
                        {plan.activity.auditLogs && (
                          <li className="flex items-start gap-3">
                            <ClipboardCheck className={`mt-0.5 h-4 w-4 shrink-0 ${isMax ? "text-cyan-400" : "text-slate-400"}`} />
                            <span>{t("plans.auditLogs")}</span>
                          </li>
                        )}
                      </>
                    )}
                  </ul>
                </div>
              </article>
            );
          })}
        </section>

        {billing?.subscription ? (
          <section className="rounded-2xl border border-white/10 bg-[#0a1220]/70 p-5 text-white">
            <h3 className="text-lg font-extrabold">{t("subscription.title")}</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              <p>{t("subscription.status", { status: t(`status.${billing.subscription.status}`) })}</p>
              <p>{t("subscription.cycle", { cycle: t(`cycles.${billing.subscription.billingCycle}`) })}</p>
              {billing.subscription.currentPeriodEnd ? (
                <p>{t("subscription.periodEnd", { date: formatIsoDate(billing.subscription.currentPeriodEnd, locale) })}</p>
              ) : null}
              {billing.subscription.trialEndsAt ? (
                <p>{t("subscription.trialEnd", { date: formatIsoDate(billing.subscription.trialEndsAt, locale) })}</p>
              ) : null}
              {billing.subscription.cancelAtPeriodEnd ? <p>{t("subscription.cancelScheduled")}</p> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {billing.subscription.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  onClick={handleResumeSubscription}
                  disabled={subActionLoading !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {subActionLoading === "resume" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("actions.resumeSubscription")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelSubscription}
                  disabled={subActionLoading !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {subActionLoading === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("actions.cancelAtPeriodEnd")}
                </button>
              )}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-[#0a1220]/70 p-5">
          <h3 className="text-lg font-extrabold text-white">{t("extraQuota.title")}</h3>
          <p className="mt-1 text-sm text-slate-300">{t("extraQuota.subtitle")}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a
              href={`mailto:${billingEmail}?subject=${extraQuotaSubject}&body=${extraQuotaBody}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm font-semibold text-white hover:bg-black/30"
            >
              <Zap className="h-4 w-4" />
              {t("extraQuota.scripts")}
            </a>
            <a
              href={`mailto:${billingEmail}?subject=${extraQuotaSubject}&body=${extraQuotaBody}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm font-semibold text-white hover:bg-black/30"
            >
              <Cpu className="h-4 w-4" />
              {t("extraQuota.credits")}
            </a>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-400">{t("summary.scriptsMonth")}</p>
              <p className="mt-1 text-xl font-bold text-white">
                {scriptsUsage ? (scriptsUsage.limit === null ? `${scriptsUsage.executed}` : `${scriptsUsage.executed}/${scriptsUsage.limit}`) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-400">{t("summary.aiCreditsMonth")}</p>
              <p className="mt-1 text-xl font-bold text-white">
                {aiUsage ? `${aiUsage.creditsUsed.toFixed(2)} / ${aiUsage.limit.toFixed(2)}` : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-400">{t("summary.billingOwner")}</p>
              <p className="mt-1 truncate text-xl font-bold text-white">{billing?.billingOwnerName || "-"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 sm:col-span-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">{t("summary.rag")}</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {ragStatus
                  ? t("summary.ragLine", {
                      coverage: ragStatus.vectorIndex.coveragePct.toFixed(1),
                      sources: ragStatus.vectorIndex.indexedEntities,
                      chunks: ragStatus.vectorIndex.indexedChunks,
                    })
                  : "-"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {ragStatus
                  ? t("summary.ragLastRun", {
                      status: ragStatus.vectorIndex.lastRunStatus || t("common.na"),
                      model: ragStatus.vectorIndex.embeddingModel || t("common.na"),
                    })
                  : t("summary.ragEmpty")}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0a1220]/70 p-5">
          <h3 className="text-lg font-extrabold text-white">{t("enterprise.title")}</h3>
          <p className="mt-1 text-sm text-slate-300">{t("enterprise.subtitle")}</p>
          <a
            href={`mailto:${billingEmail}?subject=${encodeURIComponent("Killio Enterprise")}&body=${encodeURIComponent("Hola, quiero evaluar Enterprise para mi workspace.")}`}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-semibold text-white hover:bg-black/30"
          >
            <Mail className="h-4 w-4" />
            {t("enterprise.cta")}
          </a>
        </section>
      </div>
    </div>
  );
}
