import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireFinancePrincipal } from "./context";
import { postSystemGeneratedJournalInTx } from "./posting-engine";

/**
 * Milestone 8 — Collections Management. Outstanding invoice -> Reminder ->
 * Follow-up -> Promise to Pay -> Partial Receipt -> Escalation -> Dispute
 * -> Final Notice -> Legal-Ready -> Bad-Debt Recommendation -> Write-off
 * Approval. Partial receipts themselves reuse ar-service's existing
 * recordCustomerReceipt/allocateReceipt unchanged — this service only adds
 * the case/activity/write-off tracking layer around them.
 */

function agingBucket(daysOverdue: number) {
  if (daysOverdue <= 0) return "CURRENT";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export async function openCollectionCase(input: { customerAccountId: string; invoiceId?: string; priority?: string }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_COLLECTIONS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    let bucket: string | undefined;
    if (input.invoiceId) {
      const invoice = await tx.financeReceivableInvoice.findFirst({ where: { id: input.invoiceId, organizationKey: principal.organizationKey } });
      if (invoice) bucket = agingBucket(Math.floor((Date.now() - invoice.dueDate.getTime()) / 86400000));
    }
    const caseNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "COLLECTION_CASE", "COL");
    const entity = await tx.financeCollectionCase.create({
      data: { organizationKey: principal.organizationKey, caseNumber, customerAccountId: input.customerAccountId, invoiceId: input.invoiceId, priority: input.priority ?? "NORMAL", agingBucket: bucket, createdById: principal.id },
    });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "COLLECTION_CASE_OPENED", entityType: "FinanceCollectionCase", entityId: entity.id, description: `Collection case ${caseNumber} opened` });
    return entity;
  });
}

const STATUS_FLOW: Record<string, string[]> = {
  OPEN: ["REMINDER_SENT", "CLOSED"], REMINDER_SENT: ["FOLLOW_UP", "PROMISE_TO_PAY", "ESCALATED"],
  FOLLOW_UP: ["PROMISE_TO_PAY", "ESCALATED", "DISPUTE"], PROMISE_TO_PAY: ["FOLLOW_UP", "ESCALATED", "CLOSED"],
  ESCALATED: ["DISPUTE", "FINAL_NOTICE"], DISPUTE: ["ESCALATED", "CLOSED"],
  FINAL_NOTICE: ["LEGAL_READY", "BAD_DEBT_RECOMMENDED", "CLOSED"], LEGAL_READY: ["CLOSED"],
  BAD_DEBT_RECOMMENDED: ["WRITTEN_OFF", "CLOSED"], WRITTEN_OFF: [], CLOSED: [],
};

export async function recordCollectionActivity(caseId: string, input: { activityType: string; notes?: string; promiseDate?: Date; promiseAmount?: number; communicationReference?: string; nextStatus?: string }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_COLLECTIONS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const collectionCase = await tx.financeCollectionCase.findFirst({ where: { id: caseId, organizationKey: principal.organizationKey } });
    if (!collectionCase) throw new NotFoundError("Collection case");
    if (input.nextStatus && !(STATUS_FLOW[collectionCase.status] ?? []).includes(input.nextStatus)) {
      throw new AppError(`Cannot move a ${collectionCase.status} case to ${input.nextStatus}`, 409, "INVALID_TRANSITION");
    }
    const activity = await tx.financeCollectionActivity.create({
      data: { organizationKey: principal.organizationKey, caseId, activityType: input.activityType, notes: input.notes, promiseDate: input.promiseDate, promiseAmount: input.promiseAmount, communicationReference: input.communicationReference, performedById: principal.id },
    });
    if (input.nextStatus) {
      await tx.financeCollectionCase.update({ where: { id: caseId }, data: { status: input.nextStatus, version: { increment: 1 } } });
    }
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "COLLECTION_ACTIVITY_RECORDED", entityType: "FinanceCollectionCase", entityId: caseId, description: `${collectionCase.caseNumber}: ${input.activityType}${input.nextStatus ? ` -> ${input.nextStatus}` : ""}` });
    return activity;
  });
}

/** Flags a promise-to-pay as broken (past its promised date with no matching receipt) — a collector or a scheduled sweep calls this; no automatic scheduler is built (matches "actual external communication integrations remain out of scope"). */
export async function flagBrokenPromise(activityId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_COLLECTIONS_MANAGE);
  const activity = await prisma.financeCollectionActivity.findFirst({ where: { id: activityId, organizationKey: principal.organizationKey } });
  if (!activity) throw new NotFoundError("Collection activity");
  return prisma.financeCollectionActivity.update({ where: { id: activityId }, data: { brokenPromise: true } });
}

export async function requestWriteOff(caseId: string, input: { invoiceId: string; amount: number; reason: string }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_COLLECTIONS_MANAGE);
  const collectionCase = await prisma.financeCollectionCase.findFirst({ where: { id: caseId, organizationKey: principal.organizationKey } });
  if (!collectionCase) throw new NotFoundError("Collection case");
  return prisma.financeWriteOffRequest.create({ data: { organizationKey: principal.organizationKey, caseId, invoiceId: input.invoiceId, amount: input.amount, reason: input.reason, requestedById: principal.id } });
}

/** Dr Bad Debt Expense, Cr Accounts Receivable — a distinct approval authority from ordinary collection activity (Finance Manager+, matching the approved architecture's own approval-matrix framing). */
export async function approveWriteOff(writeOffId: string, badDebtExpenseAccountCode = "6900", arAccountCode = "1100") {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const writeOff = await tx.financeWriteOffRequest.findFirst({ where: { id: writeOffId, organizationKey: principal.organizationKey } });
    if (!writeOff) throw new NotFoundError("Write-off request");
    if (writeOff.status !== "PENDING") throw new AppError("Only a pending write-off can be approved", 409, "INVALID_TRANSITION");
    const [badDebtAccount, arAccount] = await Promise.all([
      tx.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: badDebtExpenseAccountCode, status: "ACTIVE" } }),
      tx.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: arAccountCode, status: "ACTIVE" } }),
    ]);
    if (!badDebtAccount || !arAccount) throw new AppError("Bad debt / AR control account is not configured");

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "WRITE_OFF", postingDate: new Date(), description: `Write-off approved: ${writeOff.reason}`,
      sourceType: "FinanceWriteOffRequest", sourceId: writeOff.id, idempotencyKey: `finance_write_off:POST:${writeOff.id}`,
      lines: [
        { accountId: badDebtAccount.id, debitAmount: writeOff.amount, creditAmount: new Prisma.Decimal(0) },
        { accountId: arAccount.id, debitAmount: new Prisma.Decimal(0), creditAmount: writeOff.amount },
      ],
    });
    const updated = await tx.financeWriteOffRequest.update({ where: { id: writeOffId }, data: { status: "POSTED", journalId: journal.id, approvedById: principal.id, approvedAt: new Date() } });
    await tx.financeCollectionCase.update({ where: { id: writeOff.caseId }, data: { status: "WRITTEN_OFF", version: { increment: 1 } } });
    return updated;
  });
}

export async function listCollectionCases(input: { status?: string; assignedCollectorId?: string; page?: number; pageSize?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}), ...(input.assignedCollectorId ? { assignedCollectorId: input.assignedCollectorId } : {}) };
  const [items, total] = await Promise.all([
    prisma.financeCollectionCase.findMany({ where, include: { activities: { orderBy: { createdAt: "desc" }, take: 5 } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeCollectionCase.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function assignCollector(caseId: string, collectorId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_COLLECTIONS_MANAGE);
  return prisma.financeCollectionCase.update({ where: { id: caseId }, data: { assignedCollectorId: collectorId, version: { increment: 1 } } });
}
