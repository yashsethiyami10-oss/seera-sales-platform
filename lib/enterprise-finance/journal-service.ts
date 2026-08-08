import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";
import { assertFinanceTransition, FINANCE_JOURNAL_TRANSITIONS } from "./domain";
import { validateJournalForPosting, type JournalValidationLineInput } from "./validation-engine";
import { journalDraftInput, journalLineInput, pageInput } from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Stage A) — journal lifecycle
 * (DRAFT -> SUBMITTED -> APPROVED -> POSTED, with REJECTED/CANCELLED side
 * states). `postJournal` itself lives in `posting-engine.ts`, which is the
 * only module allowed to create `FinanceLedgerEntry` rows — this file only
 * carries a journal up to APPROVED.
 */

const MAX_PAGE_SIZE = 100;

export async function createJournalDraft(input: unknown) {
  const data = journalDraftInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const journalNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "FINANCE_JOURNAL", "JRN");
    const journal = await tx.financeJournal.create({
      data: {
        organizationKey: principal.organizationKey,
        journalNumber,
        journalType: data.journalType,
        postingDate: data.postingDate,
        documentDate: data.documentDate,
        currency: data.currency,
        description: data.description,
        reference: data.reference,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        sourceVersion: data.sourceVersion,
        createdById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_DRAFT_CREATED", entityType: "FinanceJournal", entityId: journal.id,
      description: `Journal ${journal.journalNumber} drafted`, next: { journalType: journal.journalType },
    });
    return journal;
  });
}

async function loadDraftJournal(tx: EnterpriseTx, organizationKey: string, journalId: string) {
  const journal = await tx.financeJournal.findFirst({ where: { id: journalId, organizationKey } });
  if (!journal) throw new NotFoundError("Journal");
  if (journal.status !== "DRAFT") throw new ConflictError("Only draft journals may be edited directly");
  return journal;
}

export async function updateJournalDraft(journalId: string, expectedVersion: number, input: unknown) {
  const data = journalDraftInput.partial().omit({ journalType: true }).parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const current = await loadDraftJournal(tx, principal.organizationKey, journalId);
    requireVersion(current.version, expectedVersion);
    const updated = await tx.financeJournal.update({
      where: { id: current.id },
      data: { ...data, updatedById: principal.id, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_DRAFT_UPDATED", entityType: "FinanceJournal", entityId: updated.id,
      description: `Journal ${updated.journalNumber} draft updated`, previous: { version: current.version }, next: { version: updated.version },
    });
    return updated;
  });
}

export async function addJournalLine(journalId: string, journalExpectedVersion: number, input: unknown) {
  const data = journalLineInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const journal = await loadDraftJournal(tx, principal.organizationKey, journalId);
    requireVersion(journal.version, journalExpectedVersion);
    const maxLine = await tx.financeJournalLine.aggregate({ where: { journalId: journal.id }, _max: { lineNumber: true } });
    const lineNumber = (maxLine._max.lineNumber ?? 0) + 1;
    const line = await tx.financeJournalLine.create({
      data: {
        organizationKey: principal.organizationKey, journalId: journal.id, lineNumber,
        accountId: data.accountId,
        debitAmount: data.debitAmount, creditAmount: data.creditAmount, currency: data.currency ?? journal.currency,
        description: data.description, costCenterId: data.costCenterId, profitCenterId: data.profitCenterId,
        sourceLineType: data.sourceLineType, sourceLineId: data.sourceLineId,
      },
    });
    await tx.financeJournal.update({ where: { id: journal.id }, data: { updatedById: principal.id, version: { increment: 1 } } });
    return line;
  });
}

export async function updateJournalLine(journalId: string, journalExpectedVersion: number, lineId: string, input: unknown) {
  const data = journalLineInput.partial().parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const journal = await loadDraftJournal(tx, principal.organizationKey, journalId);
    requireVersion(journal.version, journalExpectedVersion);
    const line = await tx.financeJournalLine.findFirst({ where: { id: lineId, journalId: journal.id, organizationKey: principal.organizationKey } });
    if (!line) throw new NotFoundError("Journal line");
    const updated = await tx.financeJournalLine.update({ where: { id: line.id }, data });
    await tx.financeJournal.update({ where: { id: journal.id }, data: { updatedById: principal.id, version: { increment: 1 } } });
    return updated;
  });
}

export async function removeJournalLine(journalId: string, journalExpectedVersion: number, lineId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const journal = await loadDraftJournal(tx, principal.organizationKey, journalId);
    requireVersion(journal.version, journalExpectedVersion);
    const line = await tx.financeJournalLine.findFirst({ where: { id: lineId, journalId: journal.id, organizationKey: principal.organizationKey } });
    if (!line) throw new NotFoundError("Journal line");
    await tx.financeJournalLine.delete({ where: { id: line.id } });
    await tx.financeJournal.update({ where: { id: journal.id }, data: { updatedById: principal.id, version: { increment: 1 } } });
    return { deleted: true as const };
  });
}

export async function getJournal(journalId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction((tx) => tx.financeJournal.findFirst({
    where: { id: journalId, organizationKey: principal.organizationKey },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  }));
}

export async function listJournals(input: unknown) {
  const params = pageInput.parse(input ?? {});
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const where: Prisma.FinanceJournalWhereInput = {
      organizationKey: principal.organizationKey,
      status: params.status,
      ...(params.search ? { OR: [{ journalNumber: { contains: params.search, mode: "insensitive" } }, { description: { contains: params.search, mode: "insensitive" } }] } : {}),
    };
    const pageSize = Math.min(params.pageSize, MAX_PAGE_SIZE);
    const [total, items] = await Promise.all([
      tx.financeJournal.count({ where }),
      tx.financeJournal.findMany({ where, orderBy: [{ postingDate: "desc" }, { id: "desc" }], skip: (params.page - 1) * pageSize, take: pageSize }),
    ]);
    return { items, total, page: params.page, pageSize };
  });
}

export async function validateJournal(journalId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({ where: { id: journalId, organizationKey: principal.organizationKey }, include: { lines: true } });
    if (!journal) throw new NotFoundError("Journal");
    return validateJournalForPosting(tx, principal.organizationKey, journal, toValidationLines(journal.lines), );
  });
}

export async function submitJournal(journalId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({ where: { id: journalId, organizationKey: principal.organizationKey }, include: { lines: true } });
    if (!journal) throw new NotFoundError("Journal");
    requireVersion(journal.version, expectedVersion);
    assertFinanceTransition(journal.status, "SUBMITTED", FINANCE_JOURNAL_TRANSITIONS);
    const validation = await validateJournalForPosting(tx, principal.organizationKey, journal, toValidationLines(journal.lines));
    if (!validation.valid) {
      throw new AppError(`Journal cannot be submitted: ${validation.findings.map((f) => f.message).join("; ")}`, 422, "JOURNAL_VALIDATION_FAILED");
    }
    const updated = await tx.financeJournal.update({
      where: { id: journal.id },
      data: { status: "SUBMITTED", submittedById: principal.id, submittedAt: new Date(), totalDebit: validation.totalDebit, totalCredit: validation.totalCredit, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_SUBMITTED", entityType: "FinanceJournal", entityId: updated.id,
      description: `Journal ${updated.journalNumber} submitted`, previous: { status: journal.status }, next: { status: updated.status },
    });
    return updated;
  });
}

export async function approveJournal(journalId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({ where: { id: journalId, organizationKey: principal.organizationKey } });
    if (!journal) throw new NotFoundError("Journal");
    requireVersion(journal.version, expectedVersion);
    assertFinanceTransition(journal.status, "APPROVED", FINANCE_JOURNAL_TRANSITIONS);

    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: "JOURNAL_APPROVAL",
      subjectType: "FinanceJournal", subjectId: journal.id, preparerId: journal.submittedById ?? journal.createdById,
    });

    const updated = await tx.financeJournal.update({
      where: { id: journal.id },
      data: { status: "APPROVED", approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_APPROVED", entityType: "FinanceJournal", entityId: updated.id,
      description: `Journal ${updated.journalNumber} approved`, previous: { status: journal.status }, next: { status: updated.status },
    });
    return updated;
  });
}

export async function rejectJournal(journalId: string, expectedVersion: number, reason: string) {
  if (!reason?.trim()) throw new AppError("A reason is required to reject a journal", 422, "REASON_REQUIRED");
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({ where: { id: journalId, organizationKey: principal.organizationKey } });
    if (!journal) throw new NotFoundError("Journal");
    requireVersion(journal.version, expectedVersion);
    assertFinanceTransition(journal.status, "REJECTED", FINANCE_JOURNAL_TRANSITIONS);
    const updated = await tx.financeJournal.update({
      where: { id: journal.id },
      data: { status: "REJECTED", rejectedById: principal.id, rejectedAt: new Date(), reason: reason.trim(), version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_REJECTED", entityType: "FinanceJournal", entityId: updated.id,
      description: `Journal ${updated.journalNumber} rejected: ${reason.trim()}`, previous: { status: journal.status }, next: { status: updated.status },
    });
    return updated;
  });
}

export async function returnRejectedJournalToDraft(journalId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({ where: { id: journalId, organizationKey: principal.organizationKey } });
    if (!journal) throw new NotFoundError("Journal");
    requireVersion(journal.version, expectedVersion);
    assertFinanceTransition(journal.status, "DRAFT", FINANCE_JOURNAL_TRANSITIONS);
    const updated = await tx.financeJournal.update({ where: { id: journal.id }, data: { status: "DRAFT", version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_RETURNED_TO_DRAFT", entityType: "FinanceJournal", entityId: updated.id,
      description: `Journal ${updated.journalNumber} returned to draft for correction`, previous: { status: journal.status }, next: { status: updated.status },
    });
    return updated;
  });
}

export async function cancelJournal(journalId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const journal = await tx.financeJournal.findFirst({ where: { id: journalId, organizationKey: principal.organizationKey } });
    if (!journal) throw new NotFoundError("Journal");
    requireVersion(journal.version, expectedVersion);
    assertFinanceTransition(journal.status, "CANCELLED", FINANCE_JOURNAL_TRANSITIONS);
    const updated = await tx.financeJournal.update({
      where: { id: journal.id },
      data: { status: "CANCELLED", cancelledById: principal.id, cancelledAt: new Date(), version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_CANCELLED", entityType: "FinanceJournal", entityId: updated.id,
      description: `Journal ${updated.journalNumber} cancelled`, previous: { status: journal.status }, next: { status: updated.status },
    });
    return updated;
  });
}

export function toValidationLines(lines: readonly { lineNumber: number; accountId: string; debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal; currency: string; costCenterId: string | null; profitCenterId: string | null }[]): JournalValidationLineInput[] {
  return lines.map((line) => ({
    lineNumber: line.lineNumber, accountId: line.accountId, debitAmount: line.debitAmount, creditAmount: line.creditAmount,
    currency: line.currency, costCenterId: line.costCenterId, profitCenterId: line.profitCenterId,
  }));
}
