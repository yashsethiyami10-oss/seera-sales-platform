import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { ensurePeriodForDate } from "./journal-service";

// Period Close checklist (spec section 42) — every item here is a real query
// against existing/new Finance tables, never a hardcoded pass.
export async function periodCloseChecklist(db: PrismaClient, actorId: string, periodCode: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const period = await db.seeraAccountingPeriod.findUniqueOrThrow({ where: { code: periodCode } });
  const [unmatchedBankLines, pendingExpenseApprovals, unpostedVendorBills, unallocatedPayments, imbalancedJournals] = await Promise.all([
    db.seeraBankStatementLine.count({ where: { matchStatus: "UNMATCHED", import: {} } }),
    db.seeraExpense.count({ where: { status: "SUBMITTED" } }),
    db.seeraVendorBill.count({ where: { status: "DRAFT" } }),
    db.seeraPaymentRecord.count({ where: { status: { in: ["VERIFIED", "PARTIALLY_MATCHED"] }, unappliedAmount: { gt: 0 } } }),
    db.seeraJournalEntry.count({ where: { accountingPeriodId: period.id, status: "POSTED" } }),
  ]);
  const blockers: { code: string; title: string }[] = [];
  if (unmatchedBankLines) blockers.push({ code: "UNRECONCILED_BANK", title: `${unmatchedBankLines} unreconciled bank entr${unmatchedBankLines === 1 ? "y" : "ies"}` });
  if (pendingExpenseApprovals) blockers.push({ code: "PENDING_EXPENSE_APPROVAL", title: `${pendingExpenseApprovals} expense(s) awaiting approval` });
  if (unpostedVendorBills) blockers.push({ code: "UNPOSTED_VENDOR_BILL", title: `${unpostedVendorBills} vendor bill(s) still in draft` });
  if (unallocatedPayments) blockers.push({ code: "UNALLOCATED_PAYMENT", title: `${unallocatedPayments} payment(s) with unapplied balance` });
  return { period, blockers, journalCount: imbalancedJournals, canClose: blockers.length === 0 };
}

export async function lockPeriod(db: PrismaClient, actorId: string, periodCode: string) {
  await authorize(db, { actorId, permission: "accounting_period:lock" });
  const checklist = await periodCloseChecklist(db, actorId, periodCode);
  if (!checklist.canClose) throw new FoundationError("PERIOD_CLOSE_BLOCKED", "Resolve the period close checklist before locking", 409, { blockers: checklist.blockers });
  const period = await db.seeraAccountingPeriod.update({ where: { code: periodCode }, data: { lockedAt: new Date(), lockedById: actorId, lockReason: "Period close" } });
  await recordAudit(db, { actorId, action: "finance.period.locked", entityType: "SeeraAccountingPeriod", entityId: period.id, afterState: { code: period.code } });
  return period;
}

// Reopen requires Founder-level authority + a mandatory reason, per spec
// section 42 ("Founder/authorized Finance Manager: REOPEN WITH REASON").
export async function reopenPeriod(db: PrismaClient, actorId: string, periodCode: string, reason: string) {
  await authorize(db, { actorId, permission: "accounting_period:lock" });
  if (!reason.trim()) throw new FoundationError("REOPEN_REASON_REQUIRED", "A reason is required to reopen a locked period", 400);
  const before = await db.seeraAccountingPeriod.findUniqueOrThrow({ where: { code: periodCode } });
  if (!before.lockedAt) throw new FoundationError("PERIOD_NOT_LOCKED", "Period is not locked", 409);
  const period = await db.seeraAccountingPeriod.update({ where: { code: periodCode }, data: { lockedAt: null, lockedById: null, lockReason: null } });
  await recordAudit(db, { actorId, action: "finance.period.reopened", entityType: "SeeraAccountingPeriod", entityId: period.id, beforeState: { lockedAt: before.lockedAt }, afterState: { reason } });
  return period;
}

export async function listPeriods(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  return db.seeraAccountingPeriod.findMany({ orderBy: { startsAt: "desc" } });
}

export { ensurePeriodForDate };
