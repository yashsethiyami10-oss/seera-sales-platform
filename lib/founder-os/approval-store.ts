import type { EnterpriseTx } from "@/lib/enterprise/context";

/**
 * Part 3D — shared "what's pending a decision" queries, factored out
 * during Stage 3 so the Approval Center and the Decision Queue (Stage 2)
 * read pending vendor payments/expense claims through the exact same
 * query instead of each defining its own — mirroring the `alert-store.ts`
 * refactor Stage 2 already did for alert creation. Both callers pass
 * their own `minAmount` (Decision Queue's "critical" threshold; the
 * Approval Center passes none, since it shows every pending item, not
 * just high-value ones) — the query itself is identical either way.
 * Read-only; never writes.
 */

export function listPendingVendorPayments(tx: EnterpriseTx, organizationKey: string, options: { minAmount?: number; take?: number } = {}) {
  return tx.financeVendorPayment.findMany({
    where: {
      organizationKey, status: "REQUESTED",
      ...(options.minAmount !== undefined ? { amount: { gte: options.minAmount } } : {}),
    },
    orderBy: [{ amount: "desc" }], take: options.take ?? 50,
  });
}

export function listPendingExpenseClaims(tx: EnterpriseTx, organizationKey: string, options: { minAmount?: number; take?: number } = {}) {
  return tx.financeExpenseClaim.findMany({
    where: {
      organizationKey, status: "SUBMITTED",
      ...(options.minAmount !== undefined ? { totalClaimedAmount: { gte: options.minAmount } } : {}),
    },
    orderBy: [{ totalClaimedAmount: "desc" }], take: options.take ?? 50,
  });
}

/** Recently decided items — for the Approval Center's "Completed"/
 * "Rejected" sections. Vendor payments have no REJECTED status in the
 * frozen Part 3C model (`REQUESTED -> APPROVED` only — no vendor-payment
 * rejection action exists), so "Rejected" is real only for expense
 * claims; not fabricated for payments. */
export function listRecentlyDecidedVendorPayments(tx: EnterpriseTx, organizationKey: string, since: Date, take = 50) {
  return tx.financeVendorPayment.findMany({
    where: { organizationKey, status: "APPROVED", approvedAt: { gte: since } },
    orderBy: [{ approvedAt: "desc" }], take,
  });
}

export function listRecentlyDecidedExpenseClaims(tx: EnterpriseTx, organizationKey: string, since: Date, take = 50) {
  return tx.financeExpenseClaim.findMany({
    where: {
      organizationKey,
      OR: [
        { status: { in: ["APPROVED", "PARTIALLY_APPROVED", "POSTED", "REIMBURSED"] }, approvedAt: { gte: since } },
        { status: "REJECTED", rejectedAt: { gte: since } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }], take,
  });
}

