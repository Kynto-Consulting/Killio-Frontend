/**
 * Pure helpers for the pack subscriptions (no React, no DOM): what the pack page shows for a subscription, and the pricing form
 * of the author. The backend decides everything (entitlement, grace, limits); this only presents it and pre-checks the form.
 * Contract: Killio-Backend docs/PACK-SUBSCRIPTIONS.md.
 */

export type PackSubscriptionStatus = "pending" | "trialing" | "active" | "past_due" | "canceled" | "expired";

export type PackSubscription = {
  id: string;
  packId: string;
  status: PackSubscriptionStatus;
  /** Whether the team holds the pack right now (decided by the backend). */
  entitled: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  priceAmountMinor: number;
  currency: string;
  graceDays: number;
};

export type SubscriptionState = "none" | "pending" | "trialing" | "active" | "past_due" | "ending" | "ended";
export type SubscriptionAction = "subscribe" | "cancel" | "resume";

/** The state the pack page shows and the one action it offers. */
export function subscriptionView(sub: Pick<PackSubscription, "status" | "cancelAtPeriodEnd"> | null): { state: SubscriptionState; action: SubscriptionAction } {
  if (!sub) return { state: "none", action: "subscribe" };
  switch (sub.status) {
    case "pending":
      return { state: "pending", action: "subscribe" }; // the same checkout is offered again, never a second charge
    case "trialing":
    case "active":
    case "past_due":
      if (sub.cancelAtPeriodEnd) return { state: "ending", action: "resume" };
      return { state: sub.status, action: "cancel" };
    default:
      return { state: "ended", action: "subscribe" };
  }
}

export const PRICING_CURRENCIES = ["USD", "PEN"] as const;
export type PricingFormInput = { pricingType: "free" | "paid" | "subscription"; amount: string; currency: string; trialDays: string; graceDays: string };
export type PricingBody = { pricingType: "free" | "paid" | "subscription"; priceAmountMinor?: number; currency?: string; trialDays?: number; graceDays?: number };
export type PricingIssue = "amount" | "currency" | "trialDays" | "graceDays";

/** Major units text ("9.99") -> minor units, or null when it is not a positive amount with at most 2 decimals. */
export function parseAmountMinor(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  const minor = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function buildPricingBody(input: PricingFormInput): { ok: true; body: PricingBody } | { ok: false; issue: PricingIssue } {
  if (input.pricingType === "free") return { ok: true, body: { pricingType: "free" } };
  const amount = parseAmountMinor(input.amount);
  if (amount === null) return { ok: false, issue: "amount" };
  if (!/^[A-Z]{3}$/.test(input.currency)) return { ok: false, issue: "currency" };
  if (input.pricingType === "paid") return { ok: true, body: { pricingType: "paid", priceAmountMinor: amount, currency: input.currency } };
  const trial = input.trialDays.trim() === "" ? 0 : Number(input.trialDays);
  const grace = input.graceDays.trim() === "" ? 3 : Number(input.graceDays);
  if (!Number.isInteger(trial) || trial < 0 || trial > 90) return { ok: false, issue: "trialDays" };
  if (!Number.isInteger(grace) || grace < 0 || grace > 30) return { ok: false, issue: "graceDays" };
  return { ok: true, body: { pricingType: "subscription", priceAmountMinor: amount, currency: input.currency, trialDays: trial, graceDays: grace } };
}

export function formatAmountText(amountMinor: number | null | undefined): string {
  return amountMinor && amountMinor > 0 ? (amountMinor / 100).toFixed(2) : "";
}
