import assert from "node:assert/strict";
import test from "node:test";

import { buildPricingBody, formatAmountText, parseAmountMinor, subscriptionView } from "./subscription.ts";
import { formatPackPrice } from "./pricing.ts";

test("the pack page offers one action per subscription state", () => {
  assert.deepEqual(subscriptionView(null), { state: "none", action: "subscribe" });
  assert.deepEqual(subscriptionView({ status: "pending", cancelAtPeriodEnd: false }), { state: "pending", action: "subscribe" });
  assert.deepEqual(subscriptionView({ status: "trialing", cancelAtPeriodEnd: false }), { state: "trialing", action: "cancel" });
  assert.deepEqual(subscriptionView({ status: "active", cancelAtPeriodEnd: false }), { state: "active", action: "cancel" });
  assert.deepEqual(subscriptionView({ status: "past_due", cancelAtPeriodEnd: false }), { state: "past_due", action: "cancel" });
  assert.deepEqual(subscriptionView({ status: "active", cancelAtPeriodEnd: true }), { state: "ending", action: "resume" });
  assert.deepEqual(subscriptionView({ status: "canceled", cancelAtPeriodEnd: false }), { state: "ended", action: "subscribe" });
  assert.deepEqual(subscriptionView({ status: "expired", cancelAtPeriodEnd: false }), { state: "ended", action: "subscribe" });
});

test("amounts are parsed to minor units with at most two decimals", () => {
  assert.equal(parseAmountMinor("9.99"), 999);
  assert.equal(parseAmountMinor("10"), 1000);
  assert.equal(parseAmountMinor(" 4,5 "), 450);
  for (const bad of ["", "0", "0.00", "-1", "1.234", "abc", "1e3", "99999999"]) assert.equal(parseAmountMinor(bad), null, bad);
  assert.equal(formatAmountText(1999), "19.99");
  assert.equal(formatAmountText(null), "");
});

test("pricing form: free needs nothing; paid and subscription need amount and currency; terms are bounded", () => {
  assert.deepEqual(buildPricingBody({ pricingType: "free", amount: "", currency: "USD", trialDays: "", graceDays: "" }), { ok: true, body: { pricingType: "free" } });
  assert.deepEqual(buildPricingBody({ pricingType: "paid", amount: "5", currency: "USD", trialDays: "", graceDays: "" }), { ok: true, body: { pricingType: "paid", priceAmountMinor: 500, currency: "USD" } });
  assert.deepEqual(buildPricingBody({ pricingType: "subscription", amount: "5", currency: "PEN", trialDays: "", graceDays: "" }), { ok: true, body: { pricingType: "subscription", priceAmountMinor: 500, currency: "PEN", trialDays: 0, graceDays: 3 } });
  assert.deepEqual(buildPricingBody({ pricingType: "subscription", amount: "5", currency: "USD", trialDays: "14", graceDays: "7" }), { ok: true, body: { pricingType: "subscription", priceAmountMinor: 500, currency: "USD", trialDays: 14, graceDays: 7 } });
  assert.deepEqual(buildPricingBody({ pricingType: "subscription", amount: "0", currency: "USD", trialDays: "", graceDays: "" }), { ok: false, issue: "amount" });
  assert.deepEqual(buildPricingBody({ pricingType: "subscription", amount: "5", currency: "us", trialDays: "", graceDays: "" }), { ok: false, issue: "currency" });
  assert.deepEqual(buildPricingBody({ pricingType: "subscription", amount: "5", currency: "USD", trialDays: "91", graceDays: "" }), { ok: false, issue: "trialDays" });
  assert.deepEqual(buildPricingBody({ pricingType: "subscription", amount: "5", currency: "USD", trialDays: "", graceDays: "31" }), { ok: false, issue: "graceDays" });
  assert.deepEqual(buildPricingBody({ pricingType: "subscription", amount: "5", currency: "USD", trialDays: "1.5", graceDays: "" }), { ok: false, issue: "trialDays" });
});

test("a subscription pack shows its monthly price", () => {
  const price = formatPackPrice({ pricingType: "subscription", priceAmountMinor: 500, currency: "USD" }, "en");
  assert.equal(price.kind, "subscription");
  assert.match((price as { label: string }).label, /5\.00/);
  assert.deepEqual(formatPackPrice({ pricingType: "subscription", priceAmountMinor: null, currency: "USD" }), { kind: "free" });
});
