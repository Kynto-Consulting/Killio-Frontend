/** Price shown on a pack card. Amounts are integers in minor units (cents) of a 2-decimal currency. */
export function formatPackPrice(
  pack: { pricingType?: "free" | "paid"; priceAmountMinor?: number | null; currency?: string | null },
  locale = "en",
): { kind: "free" } | { kind: "paid"; label: string } {
  if (pack.pricingType !== "paid" || !pack.priceAmountMinor || !pack.currency) return { kind: "free" };
  try {
    return { kind: "paid", label: new Intl.NumberFormat(locale, { style: "currency", currency: pack.currency }).format(pack.priceAmountMinor / 100) };
  } catch {
    return { kind: "paid", label: `${(pack.priceAmountMinor / 100).toFixed(2)} ${pack.currency}` };
  }
}

/** A stable key per (pack, attempt) so retries of the same click never create a second purchase. */
export function newIdempotencyKey(packId: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${packId}:${random}`;
}

/** What the import button must do for a pack, given what the hub says about the buyer. */
export function nextHubAction(input: { connected: boolean; purchaseStatus: "free" | "paid" | "pending" | "failed" | "refunded" | null }): "connect" | "checkout" | "import" {
  if (!input.connected) return "connect";
  return input.purchaseStatus === "free" || input.purchaseStatus === "paid" ? "import" : "checkout";
}
