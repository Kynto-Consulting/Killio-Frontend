"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Tag, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { SOFT_FIELD, SOFT_PRIMARY, SOFT_SECONDARY } from "@/components/marketplace/pack-ui";
import { MarketplacePack, updateMarketplacePackPricing } from "@/lib/api/marketplace";
import { buildPricingBody, formatAmountText, PRICING_CURRENCIES, type PricingFormInput } from "@/lib/marketplace/subscription";

type PricingType = PricingFormInput["pricingType"];
const TYPES: PricingType[] = ["free", "paid", "subscription"];

/**
 * Price of one of the author's packs: free, one-time, or a monthly subscription (optional free trial and grace days).
 * The backend validates again (currency allowlist, paid-packs switch) and is the authority.
 */
export function PricingEditor({ pack, accessToken, onClose, onSaved }: {
  pack: MarketplacePack;
  accessToken: string;
  onClose: () => void;
  onSaved: (pack: MarketplacePack) => void;
}) {
  const t = useTranslations("marketplace");
  const [pricingType, setPricingType] = useState<PricingType>(pack.pricingType ?? "free");
  const [amount, setAmount] = useState(formatAmountText(pack.priceAmountMinor));
  const [currency, setCurrency] = useState(pack.currency ?? "USD");
  const [trialDays, setTrialDays] = useState(pack.trialDays ? String(pack.trialDays) : "");
  const [graceDays, setGraceDays] = useState(String(pack.graceDays ?? 3));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const save = async () => {
    const built = buildPricingBody({ pricingType, amount, currency, trialDays, graceDays });
    if (!built.ok) return setError(t(`pricing.errors.${built.issue}`));
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMarketplacePackPricing(pack.id, built.body, accessToken);
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pricing.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const label = "mb-1.5 block text-xs font-medium text-muted-foreground";
  const paid = pricingType !== "free";

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pricing-title" className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl focus-visible:outline-none sm:rounded-2xl">
        <div className="flex shrink-0 items-start gap-3 border-b border-border/60 p-5">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Tag className="h-5 w-5 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="pricing-title" className="text-base font-semibold leading-tight text-foreground">{t("pricing.title")}</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{pack.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label={t("actions.cancel")} className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <fieldset>
            <legend className={label}>{t("pricing.type")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TYPES.map((type) => (
                <label key={type} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${pricingType === type ? "border-primary bg-primary/5 text-foreground" : "border-border text-foreground/80"}`}>
                  <input type="radio" name="pricing-type" value={type} checked={pricingType === type} onChange={() => setPricingType(type)} className="h-4 w-4" />
                  {t(`pricing.types.${type}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {paid ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pricing-amount" className={label}>{pricingType === "subscription" ? t("pricing.amountMonthly") : t("pricing.amount")}</label>
                <input id="pricing-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="9.99" className={SOFT_FIELD} />
              </div>
              <div>
                <label htmlFor="pricing-currency" className={label}>{t("pricing.currency")}</label>
                <select id="pricing-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={SOFT_FIELD}>
                  {PRICING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          ) : null}

          {pricingType === "subscription" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pricing-trial" className={label}>{t("pricing.trialDays")}</label>
                  <input id="pricing-trial" inputMode="numeric" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} placeholder="0" className={SOFT_FIELD} aria-describedby="pricing-trial-hint" />
                  <p id="pricing-trial-hint" className="mt-1 text-[12px] text-foreground/70">{t("pricing.trialDaysHint")}</p>
                </div>
                <div>
                  <label htmlFor="pricing-grace" className={label}>{t("pricing.graceDays")}</label>
                  <input id="pricing-grace" inputMode="numeric" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} placeholder="3" className={SOFT_FIELD} aria-describedby="pricing-grace-hint" />
                  <p id="pricing-grace-hint" className="mt-1 text-[12px] text-foreground/70">{t("pricing.graceDaysHint")}</p>
                </div>
              </div>
              <p className="rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground/80">{t("pricing.subscriptionNote")}</p>
            </>
          ) : null}

          {error ? <p role="alert" className="flex items-center gap-1.5 text-[13px] font-semibold text-red-700 dark:text-red-300"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error}</p> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 p-4">
          <button type="button" onClick={onClose} disabled={saving} className={`${SOFT_SECONDARY} h-9 px-4 text-sm`}>{t("actions.cancel")}</button>
          <button type="button" onClick={() => void save()} disabled={saving} className={`${SOFT_PRIMARY} h-9 px-5 text-sm`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {saving ? t("pricing.saving") : t("pricing.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
