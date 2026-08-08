import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties } from "@/lib/enterprise-phase2/foundation";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";
import { sumDecimal } from "./domain";
import { postSystemGeneratedJournalInTx } from "./posting-engine";
import {
  expenseApprovalInput, expenseCategoryInput, expenseClaimDraftInput, expenseRejectionInput, pageInput,
} from "./schemas";

/**
 * Enterprise UI Integration — Enterprise Finance UI. Pure read addition —
 * every other export in this file is a mutation, each returning only the
 * row it just touched, with no list/get function anywhere for a UI to
 * page through Expense Claims. `FINANCE_EXPENSES_MANAGE` is the same
 * permission every mutation in this file already requires.
 */
export async function listExpenseClaims(input: unknown) {
  const params = pageInput.parse(input ?? {});
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_EXPENSES_MANAGE);
  const pageSize = Math.min(params.pageSize, 100);
  const where: Prisma.FinanceExpenseClaimWhereInput = {
    organizationKey: principal.organizationKey,
    status: params.status,
    ...(params.search ? { claimNumber: { contains: params.search, mode: "insensitive" } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.financeExpenseClaim.count({ where }),
    prisma.financeExpenseClaim.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (params.page - 1) * pageSize, take: pageSize }),
  ]);
  return { items, total, page: params.page, pageSize };
}

/**
 * Enterprise Finance Platform (Part 3C, Stage B) — Expense Management.
 * Claimant cannot approve or reject their own claim (Section 21) — the
 * `EXPENSE_APPROVAL` SoD policy prohibits it outright for the same actor,
 * no override configured, matching every other Stage A/B policy. Approved
 * amounts post as a payable (debit each line's expense account, credit
 * `FinanceConfiguration.defaultExpensePayableAccountId`); reimbursement
 * clears that payable against cash/bank, mirroring an AP payment.
 */

async function getFinanceConfigurationOrThrow(tx: EnterpriseTx, organizationKey: string) {
  const configuration = await tx.financeConfiguration.findUnique({ where: { organizationKey } });
  if (!configuration || configuration.status !== "ACTIVE") {
    throw new AppError("Finance configuration must be active before expenses can post", 422, "FINANCE_CONFIGURATION_NOT_READY");
  }
  return configuration;
}

export async function createExpenseCategory(input: unknown) {
  const data = expenseCategoryInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const created = await tx.financeExpenseCategory.create({
      data: { organizationKey: principal.organizationKey, code: data.code, name: data.name, defaultAccountId: data.defaultAccountId, createdById: principal.id },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "EXPENSE_CATEGORY_CREATED", entityType: "FinanceExpenseCategory", entityId: created.id,
      description: `Expense category ${created.code} created`,
    });
    return created;
  });
}

export async function createExpenseClaimDraft(input: unknown) {
  const data = expenseClaimDraftInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_EXPENSES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const categoryIds = [...new Set(data.lines.map((line) => line.categoryId))];
    const categories = await tx.financeExpenseCategory.findMany({ where: { id: { in: categoryIds }, organizationKey: principal.organizationKey } });
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    for (const line of data.lines) {
      if (!categoryById.has(line.categoryId)) throw new NotFoundError("Expense category");
    }

    const totalClaimedAmount = sumDecimal(data.lines.map((line) => line.claimedAmount));
    const claimNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "EXPENSE_CLAIM", "EXP");
    const claim = await tx.financeExpenseClaim.create({
      data: {
        organizationKey: principal.organizationKey, claimNumber, claimantId: principal.id, currency: data.currency,
        totalClaimedAmount, createdById: principal.id,
      },
    });

    for (let index = 0; index < data.lines.length; index += 1) {
      const line = data.lines[index]!;
      const category = categoryById.get(line.categoryId)!;
      await tx.financeExpenseLine.create({
        data: {
          organizationKey: principal.organizationKey, claimId: claim.id, lineNumber: index + 1, categoryId: line.categoryId,
          description: line.description, expenseDate: line.expenseDate, claimedAmount: line.claimedAmount,
          accountId: line.accountId ?? category.defaultAccountId, costCenterId: line.costCenterId, profitCenterId: line.profitCenterId,
          evidenceReference: line.evidenceReference,
        },
      });
    }

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "EXPENSE_CLAIM_DRAFTED", entityType: "FinanceExpenseClaim", entityId: claim.id,
      description: `Expense claim ${claimNumber} drafted for ${totalClaimedAmount.toString()}`,
    });
    return tx.financeExpenseClaim.findUniqueOrThrow({ where: { id: claim.id }, include: { lines: true } });
  });
}

export async function submitExpenseClaim(claimId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_EXPENSES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const claim = await tx.financeExpenseClaim.findFirst({ where: { id: claimId, organizationKey: principal.organizationKey } });
    if (!claim) throw new NotFoundError("Expense claim");
    requireVersion(claim.version, expectedVersion);
    if (claim.status !== "DRAFT") throw new ConflictError("Only a draft expense claim may be submitted");

    const updated = await tx.financeExpenseClaim.update({ where: { id: claim.id }, data: { status: "SUBMITTED", submittedAt: new Date(), version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "EXPENSE_CLAIM_SUBMITTED", entityType: "FinanceExpenseClaim", entityId: updated.id,
      description: `Expense claim ${updated.claimNumber} submitted`,
    });
    return updated;
  });
}

/** Approves (fully or partially) every line named in `approvals`. Every
 * submitted line must receive an explicit approval entry — there is no
 * implicit zero-approval for an omitted line. */
export async function approveExpenseClaim(claimId: string, expectedVersion: number, input: unknown) {
  const data = expenseApprovalInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_EXPENSES_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const claim = await tx.financeExpenseClaim.findFirst({ where: { id: claimId, organizationKey: principal.organizationKey }, include: { lines: true } });
    if (!claim) throw new NotFoundError("Expense claim");
    requireVersion(claim.version, expectedVersion);
    if (claim.status !== "SUBMITTED") throw new ConflictError("Only a submitted expense claim may be approved");

    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: "EXPENSE_APPROVAL",
      subjectType: "FinanceExpenseClaim", subjectId: claim.id, preparerId: claim.claimantId,
    });

    const approvalByLine = new Map(data.approvals.map((approval) => [approval.lineId, approval.approvedAmount]));
    if (claim.lines.some((line) => !approvalByLine.has(line.id))) {
      throw new AppError("Every line must receive an explicit approval decision", 422, "MISSING_LINE_APPROVAL");
    }
    for (const line of claim.lines) {
      const approvedAmount = approvalByLine.get(line.id)!;
      if (approvedAmount.greaterThan(line.claimedAmount)) {
        throw new AppError(`Approved amount cannot exceed the claimed amount for line ${line.lineNumber}`, 422, "APPROVED_EXCEEDS_CLAIMED");
      }
      await tx.financeExpenseLine.update({ where: { id: line.id }, data: { approvedAmount } });
    }

    const totalApprovedAmount = sumDecimal([...approvalByLine.values()]);
    const fullyApproved = totalApprovedAmount.equals(claim.totalClaimedAmount);
    const status = totalApprovedAmount.equals(0) ? "REJECTED" : fullyApproved ? "APPROVED" : "PARTIALLY_APPROVED";

    const updated = await tx.financeExpenseClaim.update({
      where: { id: claim.id },
      data: { status, totalApprovedAmount, approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "EXPENSE_CLAIM_APPROVED", entityType: "FinanceExpenseClaim", entityId: updated.id,
      description: `Expense claim ${updated.claimNumber} ${status.toLowerCase()}: ${totalApprovedAmount.toString()} of ${claim.totalClaimedAmount.toString()}`,
    });
    return updated;
  });
}

export async function rejectExpenseClaim(claimId: string, expectedVersion: number, input: unknown) {
  const data = expenseRejectionInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_EXPENSES_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const claim = await tx.financeExpenseClaim.findFirst({ where: { id: claimId, organizationKey: principal.organizationKey } });
    if (!claim) throw new NotFoundError("Expense claim");
    requireVersion(claim.version, expectedVersion);
    if (claim.status !== "SUBMITTED") throw new ConflictError("Only a submitted expense claim may be rejected");

    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: "EXPENSE_APPROVAL",
      subjectType: "FinanceExpenseClaim", subjectId: claim.id, preparerId: claim.claimantId,
    });

    const updated = await tx.financeExpenseClaim.update({
      where: { id: claim.id },
      data: { status: "REJECTED", rejectedById: principal.id, rejectedAt: new Date(), rejectionReason: data.reason, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "EXPENSE_CLAIM_REJECTED", entityType: "FinanceExpenseClaim", entityId: updated.id,
      description: `Expense claim ${updated.claimNumber} rejected: ${data.reason}`,
    });
    return updated;
  });
}

export async function postApprovedExpenseClaim(claimId: string, expectedVersion: number, idempotencyKey: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_EXPENSES_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const configuration = await getFinanceConfigurationOrThrow(tx, principal.organizationKey);
    if (!configuration.defaultExpensePayableAccountId) throw new AppError("A default expense payable account must be configured", 422, "EXPENSE_PAYABLE_ACCOUNT_MISSING");

    const claim = await tx.financeExpenseClaim.findFirst({ where: { id: claimId, organizationKey: principal.organizationKey }, include: { lines: true } });
    if (!claim) throw new NotFoundError("Expense claim");
    requireVersion(claim.version, expectedVersion);
    if (!["APPROVED", "PARTIALLY_APPROVED"].includes(claim.status)) throw new ConflictError("Only an approved expense claim may be posted");

    const journalLines = claim.lines
      .filter((line) => line.approvedAmount && line.approvedAmount.greaterThan(0))
      .map((line) => ({ accountId: line.accountId, debitAmount: line.approvedAmount!, creditAmount: new Prisma.Decimal(0), description: line.description, costCenterId: line.costCenterId ?? undefined, profitCenterId: line.profitCenterId ?? undefined }));
    journalLines.push({ accountId: configuration.defaultExpensePayableAccountId, debitAmount: new Prisma.Decimal(0), creditAmount: claim.totalApprovedAmount, description: `Expense claim ${claim.claimNumber}`, costCenterId: undefined, profitCenterId: undefined });

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "EXPENSE", postingDate: new Date(), currency: claim.currency,
      description: `Expense claim ${claim.claimNumber} posted`, sourceType: "EXPENSE_CLAIM", sourceId: claim.id, idempotencyKey, lines: journalLines,
    });

    const posted = await tx.financeExpenseClaim.update({
      where: { id: claim.id },
      data: { status: "POSTED", journalId: journal.id, postedById: principal.id, postedAt: new Date(), version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "EXPENSE_CLAIM_POSTED", entityType: "FinanceExpenseClaim", entityId: posted.id,
      description: `Expense claim ${posted.claimNumber} posted for ${claim.totalApprovedAmount.toString()}`,
    });
    return posted;
  });
}

export async function reimburseExpenseClaim(claimId: string, expectedVersion: number, idempotencyKey: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_EXPENSES_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const configuration = await getFinanceConfigurationOrThrow(tx, principal.organizationKey);
    if (!configuration.defaultExpensePayableAccountId) throw new AppError("A default expense payable account must be configured", 422, "EXPENSE_PAYABLE_ACCOUNT_MISSING");
    if (!configuration.defaultCashAccountId && !configuration.defaultBankAccountId) throw new AppError("A default cash or bank account must be configured to reimburse", 422, "CASH_ACCOUNT_MISSING");
    const payAccountId = configuration.defaultBankAccountId ?? configuration.defaultCashAccountId!;

    const claim = await tx.financeExpenseClaim.findFirst({ where: { id: claimId, organizationKey: principal.organizationKey } });
    if (!claim) throw new NotFoundError("Expense claim");
    requireVersion(claim.version, expectedVersion);
    if (claim.status !== "POSTED") throw new ConflictError("Only a posted expense claim may be reimbursed");

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "EXPENSE", postingDate: new Date(), currency: claim.currency,
      description: `Expense claim ${claim.claimNumber} reimbursed`, sourceType: "EXPENSE_REIMBURSEMENT", sourceId: claim.id, idempotencyKey,
      lines: [
        { accountId: configuration.defaultExpensePayableAccountId, debitAmount: claim.totalApprovedAmount, creditAmount: new Prisma.Decimal(0), description: `Reimbursement ${claim.claimNumber}` },
        { accountId: payAccountId, debitAmount: new Prisma.Decimal(0), creditAmount: claim.totalApprovedAmount, description: `Reimbursement ${claim.claimNumber}` },
      ],
    });

    const reimbursed = await tx.financeExpenseClaim.update({ where: { id: claim.id }, data: { status: "REIMBURSED", reimbursedAt: new Date(), version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "EXPENSE_CLAIM_REIMBURSED", entityType: "FinanceExpenseClaim", entityId: reimbursed.id,
      description: `Expense claim ${reimbursed.claimNumber} reimbursed`, next: { journalId: journal.id },
    });
    return reimbursed;
  });
}
