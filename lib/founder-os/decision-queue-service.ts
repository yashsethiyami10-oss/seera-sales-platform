import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireFounderOsPrincipal } from "./context";
import { getReceivablesAging } from "@/lib/enterprise-finance/ar-service";
import { listPendingExpenseClaims, listPendingVendorPayments } from "./approval-store";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 2 — Decision Queue.
 * Everything here is either a direct read of an existing table (never a
 * write) or a real Finance reporting function's own output re-filtered —
 * no calculation is duplicated. "High Value Collections" reuses
 * `getReceivablesAging`'s real rows, filtered by amount rather than by
 * days-overdue (the Alert Engine's `LARGE_OVERDUE_RECEIVABLE` requires
 * both; this is deliberately broader — "big enough to matter," overdue or
 * not). Pending-payment/pending-expense queries were factored into
 * `approval-store.ts` during Stage 3 so the Approval Center reuses the
 * exact same query rather than duplicating it.
 */

const HIGH_VALUE_RECEIVABLE_THRESHOLD = 25000;
const CRITICAL_EXPENSE_THRESHOLD = 25000;

export async function getDecisionQueue() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);

  // Stage 5 performance review: the four `tx`-scoped reads below
  // previously each opened their own Serializable transaction (four
  // BEGIN/COMMIT round-trips). Batched into a single transaction, still
  // run in parallel with the independent `getReceivablesAging` call
  // (which manages its own connection and can't share this `tx`).
  const [[pendingVendorPayments, criticalExpenses, financeExceptions, enterpriseExceptions], highValueReceivablesResult] = await Promise.all([
    enterpriseTransaction((tx) => Promise.all([
      listPendingVendorPayments(tx, principal.organizationKey),
      listPendingExpenseClaims(tx, principal.organizationKey, { minAmount: CRITICAL_EXPENSE_THRESHOLD }),
      tx.founderAlert.findMany({
        where: { organizationKey: principal.organizationKey, status: "ACTIVE", sourceModule: "FINANCE" },
        orderBy: [{ severity: "asc" }, { detectedAt: "desc" }], take: 50,
      }),
      tx.founderAlert.findMany({
        where: { organizationKey: principal.organizationKey, status: "ACTIVE" },
        orderBy: [{ severity: "asc" }, { detectedAt: "desc" }], take: 100,
      }),
    ])),
    getReceivablesAging(new Date()).catch(() => null),
  ]);

  const highValueReceivables = highValueReceivablesResult
    ? highValueReceivablesResult.rows.filter((row) => row.outstandingAmount.greaterThanOrEqualTo(HIGH_VALUE_RECEIVABLE_THRESHOLD))
    : [];

  // Pending Approvals is the union of every item elsewhere in this queue
  // that specifically represents "something needs a decision," not a
  // separate query.
  const pendingApprovalsCount = pendingVendorPayments.length + criticalExpenses.length;

  return {
    asOf: new Date(),
    pendingApprovalsCount,
    pendingVendorPayments,
    highValueReceivables,
    criticalExpenses,
    financeExceptions,
    enterpriseExceptions,
  };
}
