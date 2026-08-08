/**
 * Final Customer Experience Sprint, Phase 10 — the ₹499 offer (free
 * delivery + a complimentary surprise sample) is keyed off the same real,
 * admin-editable `StoreSettings.freeShippingThreshold` already used for
 * shipping-fee calculation (actions/orders.ts) — one number, not a
 * duplicated constant.
 */
export function getOfferProgress(subtotal: number, threshold: number) {
  const remaining = Math.max(0, threshold - subtotal);
  return { remaining, unlocked: remaining === 0 };
}
