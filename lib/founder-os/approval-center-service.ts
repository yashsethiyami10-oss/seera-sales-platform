import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireFounderOsPrincipal } from "./context";
import {
  listPendingExpenseClaims, listPendingVendorPayments,
  listRecentlyDecidedExpenseClaims, listRecentlyDecidedVendorPayments,
} from "./approval-store";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 3 — Approval
 * Center. Unified Pending/Completed/Rejected/Escalated view over the
 * exact same real approval-bearing records the Decision Queue (Stage 2)
 * and the Alert Engine (Stage 1) already read — via the shared
 * `approval-store.ts` queries, not a parallel implementation.
 *
 * "Rejected" is real only for expense claims — the frozen Part 3C
 * `FinanceVendorPayment` model has no rejection status
 * (`REQUESTED -> APPROVED` is the only real transition; there is no
 * vendor-payment rejection action anywhere in Part 3C), so nothing is
 * fabricated to fill that gap.
 *
 * "Escalated" is a real, rule-based signal (no AI, no prediction): a
 * pending item that has been waiting longer than
 * `ESCALATION_PENDING_HOURS` (see `domain.ts`). Computed from each
 * record's own real timestamp (`FinanceVendorPayment.createdAt` /
 * `FinanceExpenseClaim.submittedAt`), not a stored or inferred state.
 */

const ESCALATION_PENDING_HOURS = 48;
const RECENT_DECISIONS_LOOKBACK_DAYS = 14;

function hoursSince(date: Date, now: Date) {
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
}

export async function getApprovalCenter() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const now = new Date();
  const since = new Date(now.getTime() - RECENT_DECISIONS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [pendingVendorPayments, pendingExpenseClaims, completedVendorPayments, completedExpenseClaims] = await Promise.all([
    enterpriseTransaction((tx) => listPendingVendorPayments(tx, principal.organizationKey, { take: 100 })),
    enterpriseTransaction((tx) => listPendingExpenseClaims(tx, principal.organizationKey, { take: 100 })),
    enterpriseTransaction((tx) => listRecentlyDecidedVendorPayments(tx, principal.organizationKey, since)),
    enterpriseTransaction((tx) => listRecentlyDecidedExpenseClaims(tx, principal.organizationKey, since)),
  ]);

  const escalatedVendorPayments = pendingVendorPayments.filter((p) => hoursSince(p.createdAt, now) >= ESCALATION_PENDING_HOURS);
  const escalatedExpenseClaims = pendingExpenseClaims.filter((c) => c.submittedAt && hoursSince(c.submittedAt, now) >= ESCALATION_PENDING_HOURS);

  const rejectedExpenseClaims = completedExpenseClaims.filter((c) => c.status === "REJECTED");
  const completedExpenseClaimsOnly = completedExpenseClaims.filter((c) => c.status !== "REJECTED");

  return {
    asOf: now,
    pending: { vendorPayments: pendingVendorPayments, expenseClaims: pendingExpenseClaims, count: pendingVendorPayments.length + pendingExpenseClaims.length },
    escalated: { vendorPayments: escalatedVendorPayments, expenseClaims: escalatedExpenseClaims, count: escalatedVendorPayments.length + escalatedExpenseClaims.length, thresholdHours: ESCALATION_PENDING_HOURS },
    completed: { vendorPayments: completedVendorPayments, expenseClaims: completedExpenseClaimsOnly, count: completedVendorPayments.length + completedExpenseClaimsOnly.length, sinceDays: RECENT_DECISIONS_LOOKBACK_DAYS },
    rejected: { expenseClaims: rejectedExpenseClaims, count: rejectedExpenseClaims.length, sinceDays: RECENT_DECISIONS_LOOKBACK_DAYS, note: "Vendor payments have no rejection status in the frozen Part 3C model." },
  };
}
