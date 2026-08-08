import { requireFinancePrincipal } from "./context";
import { claimPhase2Job, completePhase2Job, failPhase2Job } from "@/lib/enterprise-phase2/jobs";
import { PERMISSIONS } from "@/lib/sales/constants";

/**
 * Enterprise Finance Platform (Part 3C, Stage B) — background jobs. Reuses
 * Part 3A's job boundary (`claimPhase2Job`/`completePhase2Job`/
 * `failPhase2Job`) unchanged — organization-scoped, idempotent,
 * correlation-tracked, transaction-backed. No new queue or scheduler is
 * introduced (Section 24); something outside this module (a cron trigger,
 * an admin action) is expected to call these periodically — no scheduler
 * is wired up here.
 *
 * Both jobs are pure status-derivation: `AR_INVOICE_OVERDUE_REFRESH` and
 * `AP_BILL_OVERDUE_REFRESH` stamp `status = 'OVERDUE'` on open invoices/
 * bills whose due date has passed. This closes a real gap — AR/AP
 * allocation logic already treats `OVERDUE` as an open, allocatable status
 * (`["ISSUED", "PARTIALLY_PAID", "OVERDUE"]` for AR,
 * `["POSTED", "PARTIALLY_PAID"]` for AP — see note below), but nothing
 * previously set it. Purely a stored-status refresh; it never changes an
 * `outstandingAmount`, never touches the ledger, and is safe to re-run
 * (idempotent by construction — an `UPDATE ... WHERE status IN (...)` is
 * naturally re-runnable, and the job claim additionally prevents
 * concurrent duplicate runs from racing each other).
 */

export async function refreshOverdueInvoiceStatus(correlationId: string = crypto.randomUUID(), asOfDate: Date = new Date()) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_MANAGE);
  const asOfDay = asOfDate.toISOString().slice(0, 10);
  const idempotencyKey = `ar-overdue-refresh:${asOfDay}`;
  const { operation, acquired } = await claimPhase2Job(principal, {
    organizationKey: principal.organizationKey, jobType: "AR_INVOICE_OVERDUE_REFRESH", idempotencyKey, correlationId,
    // Fingerprinted at the same day granularity as the idempotency key —
    // using the full millisecond timestamp here (as an earlier version of
    // this function did) made two legitimate same-day calls look like
    // "different requests" and incorrectly conflict instead of replaying,
    // caught by this job's own runtime test.
    payload: { asOfDay },
  });
  if (!acquired) return { acquired: false as const, operation };

  try {
    const { prisma } = await import("@/lib/prisma");
    const result = await prisma.financeReceivableInvoice.updateMany({
      where: { organizationKey: principal.organizationKey, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: asOfDate } },
      data: { status: "OVERDUE" },
    });
    const completed = await completePhase2Job(principal, { organizationKey: principal.organizationKey, operationId: operation.id, resultEntityType: "FinanceReceivableInvoice", resultEntityId: String(result.count) });
    return { acquired: true as const, operation: completed, updatedCount: result.count };
  } catch (err) {
    await failPhase2Job(principal, { organizationKey: principal.organizationKey, operationId: operation.id, failureCode: err instanceof Error ? err.message : "UNKNOWN_FAILURE" });
    throw err;
  }
}

export async function refreshOverdueBillStatus(correlationId: string = crypto.randomUUID(), asOfDate: Date = new Date()) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYABLES_MANAGE);
  const asOfDay = asOfDate.toISOString().slice(0, 10);
  const idempotencyKey = `ap-overdue-refresh:${asOfDay}`;
  const { operation, acquired } = await claimPhase2Job(principal, {
    organizationKey: principal.organizationKey, jobType: "AP_BILL_OVERDUE_REFRESH", idempotencyKey, correlationId,
    payload: { asOfDay },
  });
  if (!acquired) return { acquired: false as const, operation };

  try {
    const { prisma } = await import("@/lib/prisma");
    const result = await prisma.financeVendorBill.updateMany({
      where: { organizationKey: principal.organizationKey, status: { in: ["POSTED", "PARTIALLY_PAID"] }, dueDate: { lt: asOfDate } },
      data: { status: "OVERDUE" },
    });
    const completed = await completePhase2Job(principal, { organizationKey: principal.organizationKey, operationId: operation.id, resultEntityType: "FinanceVendorBill", resultEntityId: String(result.count) });
    return { acquired: true as const, operation: completed, updatedCount: result.count };
  } catch (err) {
    await failPhase2Job(principal, { organizationKey: principal.organizationKey, operationId: operation.id, failureCode: err instanceof Error ? err.message : "UNKNOWN_FAILURE" });
    throw err;
  }
}
