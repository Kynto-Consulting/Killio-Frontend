"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Sparkles, Zap, Cpu, ArrowUpRight, Mail, CircleDollarSign } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { createTeamCheckout, getTeamBillingSummary, TeamBillingSummary, TeamPlanTier } from "@/lib/api/billing";
import { getScriptsUsage, ScriptMonthlyUsage } from "@/lib/api/scripts";
import { getTeamAiUsage, getTeamRagStatus, TeamAiUsage, TeamRagStatus } from "@/lib/api/contracts";

const PLAN_ORDER: TeamPlanTier[] = ["free", "pro", "max"];

const PROVIDER_BY_PLAN: Record<TeamPlanTier, string> = {
  free: "Cohere (prioritario)",
  pro: "GitHub Models",
  max: "GitHub Models",
  enterprise: "GitHub Models + custom",
};

export default function PricingPage() {
  const { accessToken, activeTeamId } = useSession();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<TeamBillingSummary | null>(null);
  const [scriptsUsage, setScriptsUsage] = useState<ScriptMonthlyUsage | null>(null);
  const [aiUsage, setAiUsage] = useState<TeamAiUsage | null>(null);
  const [ragStatus, setRagStatus] = useState<TeamRagStatus | null>(null);
  const [actionLoadingTier, setActionLoadingTier] = useState<TeamPlanTier | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !activeTeamId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      getTeamBillingSummary(activeTeamId, accessToken),
      getScriptsUsage(activeTeamId, accessToken),
      getTeamAiUsage(activeTeamId, accessToken),
      getTeamRagStatus(activeTeamId, accessToken),
    ])
      .then(([billingSummary, scripts, ai, rag]) => {
        setBilling(billingSummary);
        setScriptsUsage(scripts);
        setAiUsage(ai);
        setRagStatus(rag);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudo cargar pricing.");
      })
      .finally(() => setLoading(false));
  }, [accessToken, activeTeamId]);

  useEffect(() => {
    const billingState = searchParams.get("billing");
    if (!billingState) return;
    if (billingState === "success") {
      setNotice("Pago aprobado. Tu plan se actualizara en breve.");
    } else if (billingState === "pending") {
      setNotice("Pago pendiente. Te avisaremos cuando se confirme.");
    } else if (billingState === "failure") {
      setNotice("El pago no se completo. Puedes intentar nuevamente.");
    }
  }, [searchParams]);

  const orderedPlans = useMemo(() => {
    const plans = (billing?.plans || []).filter((plan) => plan.tier !== "enterprise");
    plans.sort((a, b) => PLAN_ORDER.indexOf(a.tier) - PLAN_ORDER.indexOf(b.tier));
    return plans;
  }, [billing]);

  const billingEmail = billing?.billingEmail || "killio@kynto.studio";
  const currentPlanTier = billing?.currentPlanTier || "free";

  const handleUpgrade = async (targetTier: TeamPlanTier) => {
    if (!activeTeamId || !accessToken) return;

    setActionLoadingTier(targetTier);
    setNotice(null);

    try {
      const checkout = await createTeamCheckout(activeTeamId, targetTier, accessToken);
      if (checkout.mode === "wallet_brick") {
        window.open(checkout.initPoint, "_blank", "noopener,noreferrer");
        setNotice("Abrimos el checkout para completar el upgrade.");
      } else {
        setNotice(`${checkout.message} Contacto: ${checkout.billingEmail}`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo iniciar el checkout.");
    } finally {
      setActionLoadingTier(null);
    }
  };

  const extraQuotaSubject = encodeURIComponent("Killio - Extra quota");
  const extraQuotaBody = encodeURIComponent(
    "Hola equipo, quiero comprar cuota extra de ejecuciones de scripts y creditos de IA para mi workspace.",
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-y-auto bg-[radial-gradient(circle_at_10%_20%,rgba(255,182,39,0.15),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(56,189,248,0.15),transparent_35%),linear-gradient(180deg,rgba(12,16,24,0.06),rgba(12,16,24,0))] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.5)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-500">
                <Sparkles className="h-3.5 w-3.5" />
                Upgrade Workspace
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                Planes Killio
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Free usa Cohere como proveedor prioritario. Pro y Max usan GitHub Models.
                Chat y asistentes de board/document ya consumen y muestran creditos correctamente por plan.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/70 px-4 py-3 text-right">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Plan actual</p>
              <p className="text-2xl font-extrabold text-foreground">{currentPlanTier.toUpperCase()}</p>
            </div>
          </div>

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Scripts este mes</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {scriptsUsage ? (scriptsUsage.limit === null ? `${scriptsUsage.executed}` : `${scriptsUsage.executed}/${scriptsUsage.limit}`) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Creditos IA este mes</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {aiUsage ? `${aiUsage.creditsUsed.toFixed(2)} / ${aiUsage.limit.toFixed(2)}` : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Owner de billing</p>
              <p className="mt-1 truncate text-xl font-bold text-foreground">{billing?.billingOwnerName || "-"}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4 sm:col-span-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">RAG vectorial</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {ragStatus
                  ? `${ragStatus.vectorIndex.coveragePct.toFixed(1)}% cobertura · ${ragStatus.vectorIndex.indexedEntities} fuentes · ${ragStatus.vectorIndex.indexedChunks} chunks`
                  : "-"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ragStatus
                  ? `Ultimo run: ${ragStatus.vectorIndex.lastRunStatus || "sin datos"} · modelo ${ragStatus.vectorIndex.embeddingModel || "n/a"}`
                  : "Sin estado RAG disponible"}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {orderedPlans.map((plan) => {
            const isCurrent = plan.tier === currentPlanTier;
            const isFeatured = plan.tier !== "free";
            const priceLabel = plan.priceCentsMonthly === null
              ? "Custom"
              : `S/${(plan.priceCentsMonthly / 100).toFixed(2)} / mes`;

            return (
              <article
                key={plan.tier}
                className={`rounded-2xl border p-5 shadow-sm transition-all ${
                  isFeatured
                    ? "border-amber-300/40 bg-[linear-gradient(160deg,rgba(251,191,36,0.12),rgba(59,130,246,0.08))]"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold text-foreground">{plan.label}</h2>
                  {isCurrent ? (
                    <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                      Actual
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-sm font-semibold text-foreground">{priceLabel}</p>

                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2"><Zap className="h-4 w-4" /> Scripts: {plan.scripts.monthlyRunLimit === null ? "Ilimitados" : `${plan.scripts.monthlyRunLimit}/mes`}</p>
                  <p className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4" /> Creditos IA: {plan.ai.monthlyCreditLimit.toFixed(2)}/mes</p>
                  <p className="flex items-center gap-2"><Cpu className="h-4 w-4" /> Provider: {PROVIDER_BY_PLAN[plan.tier]}</p>
                </div>

                <button
                  type="button"
                  disabled={isCurrent || actionLoadingTier === plan.tier}
                  onClick={() => handleUpgrade(plan.tier)}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoadingTier === plan.tier ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                  {isCurrent ? "Plan actual" : "Upgrade"}
                </button>
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-lg font-extrabold text-foreground">Extra Quota</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Compra paquetes adicionales para aumentar ejecuciones de scripts y creditos IA sin esperar al siguiente ciclo.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a
              href={`mailto:${billingEmail}?subject=${extraQuotaSubject}&body=${extraQuotaBody}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent/10"
            >
              <Zap className="h-4 w-4" />
              Comprar extra scripts calls
            </a>
            <a
              href={`mailto:${billingEmail}?subject=${extraQuotaSubject}&body=${extraQuotaBody}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent/10"
            >
              <Cpu className="h-4 w-4" />
              Comprar extra AI credits
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-lg font-extrabold text-foreground">Enterprise</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enterprise no tiene pago directo desde la app. El onboarding es asistido por el equipo de Killio.
          </p>
          <a
            href={`mailto:${billingEmail}?subject=${encodeURIComponent("Killio Enterprise")}&body=${encodeURIComponent("Hola, quiero evaluar Enterprise para mi workspace.")}`}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent/10"
          >
            <Mail className="h-4 w-4" />
            Contactar ventas
          </a>
        </section>
      </div>
    </div>
  );
}
