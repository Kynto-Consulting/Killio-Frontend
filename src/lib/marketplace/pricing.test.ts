import assert from "node:assert/strict";
import test from "node:test";

import { formatPackPrice, newIdempotencyKey, nextHubAction, parsePurchaseReturn } from "./pricing.ts";

test("free packs and incomplete prices show as free", () => {
  assert.deepEqual(formatPackPrice({}), { kind: "free" });
  assert.deepEqual(formatPackPrice({ pricingType: "free", priceAmountMinor: 500, currency: "USD" }), { kind: "free" });
  assert.deepEqual(formatPackPrice({ pricingType: "paid", priceAmountMinor: null, currency: "USD" }), { kind: "free" });
});

test("paid packs show the amount in major units", () => {
  const price = formatPackPrice({ pricingType: "paid", priceAmountMinor: 1999, currency: "USD" }, "en");
  assert.equal(price.kind, "paid");
  assert.match((price as { label: string }).label, /19\.99/);
  const bad = formatPackPrice({ pricingType: "paid", priceAmountMinor: 500, currency: "??" });
  assert.equal((bad as { label: string }).label, "5.00 ??");
});

test("idempotency keys are unique per attempt and carry the pack id", () => {
  const a = newIdempotencyKey("p1");
  assert.ok(a.startsWith("p1:"));
  assert.notEqual(a, newIdempotencyKey("p1"));
});

test("hub action: connect first, then buy, then download", () => {
  assert.equal(nextHubAction({ connected: false, purchaseStatus: "paid" }), "connect");
  assert.equal(nextHubAction({ connected: true, purchaseStatus: null }), "checkout");
  assert.equal(nextHubAction({ connected: true, purchaseStatus: "pending" }), "checkout");
  assert.equal(nextHubAction({ connected: true, purchaseStatus: "refunded" }), "checkout");
  assert.equal(nextHubAction({ connected: true, purchaseStatus: "free" }), "import");
  assert.equal(nextHubAction({ connected: true, purchaseStatus: "paid" }), "import");
});

test("purchase return parameters are validated", () => {
  assert.deepEqual(parsePurchaseReturn("?purchase=pu_1&status=paid"), { purchaseId: "pu_1", status: "paid" });
  assert.equal(parsePurchaseReturn("?purchase=pu_1&status=hacked"), null);
  assert.equal(parsePurchaseReturn("?purchase=../x&status=paid"), null);
  assert.equal(parsePurchaseReturn("?status=paid"), null);
  assert.equal(parsePurchaseReturn(""), null);
});
