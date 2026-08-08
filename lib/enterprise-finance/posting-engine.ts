import type { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx, type EnterprisePrincipal } from "@/lib/enterprise/context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { claimOperation, enforceSegregationOfDuties, operationWasAcquired, recordSourceReference, requestFingerprint } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal, requireFinancialPostingPrincipal } from "./context";
import { assertFinanceTransition, FINANCE_JOURNAL_TRANSITIONS, sumDecimal, type FinanceJournalType } from "./domain";
import { assertJournalValidForPosting } from "./validation-engine";
import { toValidationLines } from "./journal-service";
import { correctionInput, reversalInput } from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Stage A) — the one authoritative
 * Posting Engine (Section 13). No other module creates `FinanceLedgerEntry`
 * rows. Idempotency reuses Part 3A's `Phase2Operation` claim/replay
 * infrastructure unchanged (Section 14) — never an in-memory lock.
 */

async function loadApprovedJournal(tx: EnterpriseTx, organizationKey: string, journalId: string) {
  const journal = await tx.financeJournal.findFirst({ where: { id: journalId, organizationKey }, include: { lines: true } });
  if (!journal) throw new NotFoundError("Journal");
  return journal;
}

/**
 * Posts an APPROVED journal: re-validates unconditionally (never trusts a
 * prior validation), resolves the fiscal period, creates immutable ledger
 * entries one-for-one with the journal's lines, and marks the journal
 * POSTED. Idempotent by `idempotencyKey` — concurrent or repeated calls
 * with the same key against the same journal return the same result
 * without duplicating ledger entries.
 */
export async function postJournal(
  journalId: string,
  expectedVersion: number,
  idempotencyKey: string,
  correlationId: string = crypto.randomUUID(),
) {
  const principal = await requireFinancialPostingPrincipal(PERMISSIONS.FINANCE_JOURNALS_POST);
  return enterpriseTransaction(async (tx) => {
    const operation = await claimOperation(tx, principal, {
      organizationKey: principal.organizationKey,
      operationType: "FINANCE_JOURNAL_POST",
      idempotencyKey,
      requestFingerprint: requestFingerprint({ journalId, expectedVersion }),
      source: { sourceDomain: "FINANCE", sourceEntityType: "FinanceJournal", sourceEntityId: journalId },
      correlationId,
    });

    if (!operationWasAcquired(operation, correlationId)) {
      if (operation.status === "COMPLETED" && operation.resultEntityId) {
        const posted = await tx.financeJournal.findUnique({ where: { id: operation.resultEntityId } });
        if (posted) return posted;
      }
      throw new ConflictError("This posting operation is already in progress or did not complete; retry with a fresh idempotency key once resolved");
    }

    const journal = await loadApprovedJournal(tx, principal.organizationKey, journalId);
    requireVersion(journal.version, expectedVersion);
    assertFinanceTransition(journal.status, "POSTED", FINANCE_JOURNAL_TRANSITIONS);

    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: "JOURNAL_POSTING",
      subjectType: "FinanceJournal", subjectId: journal.id, preparerId: journal.approvedById ?? journal.submittedById ?? journal.createdById,
    });

    const validation = await assertJournalValidForPosting(tx, principal.organizationKey, journal, toValidationLines(journal.lines));
    if (!validation.fiscalPeriodId) throw new AppError("No fiscal period resolved for this posting date", 422, "NO_FISCAL_PERIOD");
    const period = await tx.financeFiscalPeriod.findUniqueOrThrow({ where: { id: validation.fiscalPeriodId } });

    for (const line of journal.lines) {
      await tx.financeLedgerEntry.create({
        data: {
          organizationKey: principal.organizationKey,
          journalId: journal.id,
          journalLineId: line.id,
          accountId: line.accountId,
          fiscalYearId: period.fiscalYearId,
          fiscalPeriodId: period.id,
          postingDate: journal.postingDate,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
          currency: line.currency,
          costCenterId: line.costCenterId,
          profitCenterId: line.profitCenterId,
          sourceType: journal.sourceType,
          sourceId: journal.sourceId,
          sourceVersion: journal.sourceVersion,
          journalType: journal.journalType,
        },
      });
    }

    const posted = await tx.financeJournal.update({
      where: { id: journal.id },
      data: {
        status: "POSTED", postedById: principal.id, postedAt: new Date(),
        fiscalYearId: period.fiscalYearId, fiscalPeriodId: period.id,
        totalDebit: validation.totalDebit, totalCredit: validation.totalCredit,
        version: { increment: 1 },
      },
    });

    if (journal.sourceType && journal.sourceId) {
      await recordSourceReference(tx, principal, { entityType: "FinanceJournal", entityId: posted.id }, {
        organizationKey: principal.organizationKey, sourceDomain: journal.sourceType,
        sourceEntityType: journal.sourceType, sourceEntityId: journal.sourceId, sourceVersion: journal.sourceVersion ?? undefined,
      });
    }

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_POSTED", entityType: "FinanceJournal", entityId: posted.id,
      description: `Journal ${posted.journalNumber} posted (${journal.lines.length} lines)`,
      previous: { status: journal.status }, next: { status: posted.status, totalDebit: posted.totalDebit.toString() },
    });

    await tx.phase2Operation.update({
      where: { id: operation.id },
      data: { status: "COMPLETED", resultEntityType: "FinanceJournal", resultEntityId: posted.id, completedAt: new Date() },
    });

    return posted;
  });
}

/**
 * Reverses a POSTED journal: creates a new journal with every line's debit
 * and credit swapped, posts it immediately (Section 18 — "opposite debit
 * and credit entries must be generated"), and links both journals to each
 * other. The original journal's own rows are never mutated except the
 * single, database-trigger-permitted `reversedByJournalId` back-reference.
 */
export async function reversePostedJournal(originalJournalId: string, idempotencyKey: string, input: unknown, correlationId: string = crypto.randomUUID()) {
  const data = reversalInput.parse(input);
  const principal = await requireFinancialPostingPrincipal(PERMISSIONS.FINANCE_JOURNALS_POST);

  return enterpriseTransaction(async (tx) => {
    const operation = await claimOperation(tx, principal, {
      organizationKey: principal.organizationKey,
      operationType: "FINANCE_JOURNAL_REVERSE",
      idempotencyKey,
      requestFingerprint: requestFingerprint({ originalJournalId, reason: data.reason }),
      source: { sourceDomain: "FINANCE", sourceEntityType: "FinanceJournal", sourceEntityId: originalJournalId },
      correlationId,
    });
    if (!operationWasAcquired(operation, correlationId)) {
      if (operation.status === "COMPLETED" && operation.resultEntityId) {
        const reversal = await tx.financeJournal.findUnique({ where: { id: operation.resultEntityId } });
        if (reversal) return reversal;
      }
      throw new ConflictError("This reversal operation is already in progress or did not complete");
    }

    const original = await tx.financeJournal.findFirst({ where: { id: originalJournalId, organizationKey: principal.organizationKey }, include: { lines: true } });
    if (!original) throw new NotFoundError("Journal");
    if (original.status !== "POSTED") throw new ConflictError("Only a posted journal can be reversed");
    if (original.reversedByJournalId) throw new ConflictError("This journal has already been reversed");

    // Added during the Part 3C independent-audit repair pass: reversal
    // previously had no maker-checker control at all, unlike every other
    // sensitive Part 3C mutation. The actor who posted the original journal
    // cannot also be the one who reverses it — no overridePermission is
    // configured on JOURNAL_REVERSAL (matching every other Part 3C SoD
    // policy), so this applies to every actor, Founder included.
    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: "JOURNAL_REVERSAL",
      subjectType: "FinanceJournal", subjectId: original.id, preparerId: original.postedById ?? original.approvedById ?? original.createdById,
    });

    const reversalPostingDate = data.postingDate ?? new Date();
    const period = await tx.financeFiscalPeriod.findFirst({
      where: { organizationKey: principal.organizationKey, startDate: { lte: reversalPostingDate }, endDate: { gt: reversalPostingDate } },
    });
    if (!period) throw new AppError("No fiscal period covers the reversal posting date", 422, "NO_FISCAL_PERIOD");

    const journalNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "FINANCE_JOURNAL", "JRN");
    const reversal = await tx.financeJournal.create({
      data: {
        organizationKey: principal.organizationKey, journalNumber, journalType: "REVERSAL",
        status: "APPROVED", // system-generated reversal, approved by construction; still passes through the same posting path below
        postingDate: reversalPostingDate, documentDate: reversalPostingDate, currency: original.currency,
        description: `Reversal of ${original.journalNumber}`, reference: original.reference,
        reversalOfJournalId: original.id, reason: data.reason,
        createdById: principal.id, approvedById: principal.id, approvedAt: new Date(),
        version: 1,
      },
    });

    for (const line of original.lines) {
      await tx.financeJournalLine.create({
        data: {
          organizationKey: principal.organizationKey, journalId: reversal.id, lineNumber: line.lineNumber,
          accountId: line.accountId, debitAmount: line.creditAmount, creditAmount: line.debitAmount, currency: line.currency,
          description: `Reversal of ${original.journalNumber} line ${line.lineNumber}`,
          costCenterId: line.costCenterId, profitCenterId: line.profitCenterId,
        },
      });
    }

    const reversalLines = await tx.financeJournalLine.findMany({ where: { journalId: reversal.id } });
    const totalDebit = sumDecimal(reversalLines.map((l) => l.debitAmount));
    const totalCredit = sumDecimal(reversalLines.map((l) => l.creditAmount));

    for (const line of reversalLines) {
      await tx.financeLedgerEntry.create({
        data: {
          organizationKey: principal.organizationKey, journalId: reversal.id, journalLineId: line.id, accountId: line.accountId,
          fiscalYearId: period.fiscalYearId, fiscalPeriodId: period.id, postingDate: reversalPostingDate,
          debitAmount: line.debitAmount, creditAmount: line.creditAmount, currency: line.currency,
          costCenterId: line.costCenterId, profitCenterId: line.profitCenterId,
          sourceType: "FINANCE_JOURNAL_REVERSAL", sourceId: original.id, journalType: reversal.journalType,
        },
      });
    }

    const postedReversal = await tx.financeJournal.update({
      where: { id: reversal.id },
      data: { status: "POSTED", postedById: principal.id, postedAt: new Date(), fiscalYearId: period.fiscalYearId, fiscalPeriodId: period.id, totalDebit, totalCredit, version: { increment: 1 } },
    });

    // The single database-trigger-permitted write-back onto the original
    // posted journal: NULL -> the new reversal's id, nothing else changes.
    await tx.financeJournal.update({ where: { id: original.id }, data: { reversedByJournalId: postedReversal.id } });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_REVERSED", entityType: "FinanceJournal", entityId: postedReversal.id,
      description: `Journal ${original.journalNumber} reversed by ${postedReversal.journalNumber}: ${data.reason}`,
      previous: { originalJournalId: original.id }, next: { reversalJournalId: postedReversal.id },
    });

    await tx.phase2Operation.update({
      where: { id: operation.id },
      data: { status: "COMPLETED", resultEntityType: "FinanceJournal", resultEntityId: postedReversal.id, completedAt: new Date() },
    });

    return postedReversal;
  });
}

/**
 * Creates a correction successor: a new DRAFT journal pre-populated from
 * the original's lines (for the preparer to adjust before submitting
 * through the normal lifecycle), linked back to the journal it corrects.
 * The original posted journal's own evidence is never altered beyond the
 * same narrow `successorJournalId` back-reference pattern as reversal.
 */
export async function createCorrectionSuccessor(originalJournalId: string, input: unknown) {
  const data = correctionInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const original = await tx.financeJournal.findFirst({ where: { id: originalJournalId, organizationKey: principal.organizationKey }, include: { lines: true } });
    if (!original) throw new NotFoundError("Journal");
    if (original.status !== "POSTED") throw new ConflictError("Only a posted journal can receive a correction successor");
    if (original.successorJournalId) throw new ConflictError("This journal already has a correction successor");

    const journalNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "FINANCE_JOURNAL", "JRN");
    const successor = await tx.financeJournal.create({
      data: {
        organizationKey: principal.organizationKey, journalNumber, journalType: "CORRECTION", status: "DRAFT",
        postingDate: new Date(), documentDate: new Date(), currency: original.currency,
        description: `Correction of ${original.journalNumber}: ${data.reason}`, reference: original.reference,
        correctionOfJournalId: original.id, reason: data.reason, createdById: principal.id,
      },
    });
    for (const line of original.lines) {
      await tx.financeJournalLine.create({
        data: {
          organizationKey: principal.organizationKey, journalId: successor.id, lineNumber: line.lineNumber,
          accountId: line.accountId, debitAmount: line.debitAmount, creditAmount: line.creditAmount, currency: line.currency,
          description: line.description, costCenterId: line.costCenterId, profitCenterId: line.profitCenterId,
        },
      });
    }

    await tx.financeJournal.update({ where: { id: original.id }, data: { successorJournalId: successor.id } });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "JOURNAL_CORRECTION_CREATED", entityType: "FinanceJournal", entityId: successor.id,
      description: `Correction successor ${successor.journalNumber} created for ${original.journalNumber}: ${data.reason}`,
      next: { originalJournalId: original.id },
    });

    return tx.financeJournal.findUniqueOrThrow({ where: { id: successor.id }, include: { lines: true } });
  });
}

/**
 * Creates and posts a journal for an already-authorized, system-generated
 * business event (an AR invoice being issued, a receipt being recorded,
 * and — later — the AP equivalents) in one atomic step, reusing exactly
 * the same idempotent-claim, re-validation, and immutable-ledger-entry
 * logic `postJournal` uses for a manually-approved journal, rather than
 * routing every such event through the full DRAFT->SUBMITTED->APPROVED
 * manual lifecycle. The event's own domain permission (e.g.
 * `finance.receivables.manage`) is the authorization gate for this path —
 * no separate `finance.journals.*` permission is required of the caller,
 * since the caller is a Business Service, not an end user directly
 * preparing a manual journal. Must be called from inside an existing
 * `enterpriseTransaction` (`tx` is not opened here) so the caller's own
 * domain-record writes (e.g. creating the invoice row) commit atomically
 * with the journal/ledger writes.
 */
export async function postSystemGeneratedJournalInTx(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  input: {
    journalType: FinanceJournalType;
    postingDate: Date;
    documentDate?: Date;
    currency?: string;
    description: string;
    sourceType: string;
    sourceId: string;
    sourceVersion?: number;
    idempotencyKey: string;
    correlationId?: string;
    lines: Array<{ accountId: string; debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal; description?: string; costCenterId?: string; profitCenterId?: string }>;
  },
) {
  const correlationId = input.correlationId ?? crypto.randomUUID();
  const currency = input.currency ?? "INR";
  const documentDate = input.documentDate ?? input.postingDate;

  const operation = await claimOperation(tx, principal, {
    organizationKey: principal.organizationKey,
    operationType: `FINANCE_SYSTEM_JOURNAL:${input.journalType}`,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: requestFingerprint({ sourceType: input.sourceType, sourceId: input.sourceId, lines: input.lines.map((l) => ({ a: l.accountId, d: l.debitAmount.toString(), c: l.creditAmount.toString() })) }),
    source: { sourceDomain: input.sourceType, sourceEntityType: input.sourceType, sourceEntityId: input.sourceId },
    correlationId,
  });
  if (!operationWasAcquired(operation, correlationId)) {
    if (operation.status === "COMPLETED" && operation.resultEntityId) {
      const existing = await tx.financeJournal.findUnique({ where: { id: operation.resultEntityId } });
      if (existing) return existing;
    }
    throw new ConflictError("This system posting operation is already in progress or did not complete");
  }

  const validationLines = input.lines.map((line, index) => ({
    lineNumber: index + 1, accountId: line.accountId, debitAmount: line.debitAmount, creditAmount: line.creditAmount,
    currency, costCenterId: line.costCenterId ?? null, profitCenterId: line.profitCenterId ?? null,
  }));
  const validation = await assertJournalValidForPosting(tx, principal.organizationKey, {
    journalType: input.journalType, postingDate: input.postingDate, documentDate, currency,
    sourceType: input.sourceType, sourceId: input.sourceId,
  }, validationLines);
  if (!validation.fiscalPeriodId) throw new AppError("No fiscal period resolved for this posting date", 422, "NO_FISCAL_PERIOD");
  const period = await tx.financeFiscalPeriod.findUniqueOrThrow({ where: { id: validation.fiscalPeriodId } });

  const journalNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "FINANCE_JOURNAL", "JRN");
  const journal = await tx.financeJournal.create({
    data: {
      organizationKey: principal.organizationKey, journalNumber, journalType: input.journalType, status: "POSTED",
      postingDate: input.postingDate, documentDate, currency,
      description: input.description, sourceType: input.sourceType, sourceId: input.sourceId, sourceVersion: input.sourceVersion,
      fiscalYearId: period.fiscalYearId, fiscalPeriodId: period.id,
      totalDebit: validation.totalDebit, totalCredit: validation.totalCredit,
      createdById: principal.id, approvedById: principal.id, approvedAt: new Date(),
      postedById: principal.id, postedAt: new Date(),
    },
  });

  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index]!;
    const createdLine = await tx.financeJournalLine.create({
      data: {
        organizationKey: principal.organizationKey, journalId: journal.id, lineNumber: index + 1, accountId: line.accountId,
        debitAmount: line.debitAmount, creditAmount: line.creditAmount, currency, description: line.description,
        costCenterId: line.costCenterId, profitCenterId: line.profitCenterId,
      },
    });
    await tx.financeLedgerEntry.create({
      data: {
        organizationKey: principal.organizationKey, journalId: journal.id, journalLineId: createdLine.id, accountId: line.accountId,
        fiscalYearId: period.fiscalYearId, fiscalPeriodId: period.id, postingDate: input.postingDate,
        debitAmount: line.debitAmount, creditAmount: line.creditAmount, currency,
        costCenterId: line.costCenterId, profitCenterId: line.profitCenterId,
        sourceType: input.sourceType, sourceId: input.sourceId, sourceVersion: input.sourceVersion,
        journalType: input.journalType,
      },
    });
  }

  await recordSourceReference(tx, principal, { entityType: "FinanceJournal", entityId: journal.id }, {
    organizationKey: principal.organizationKey, sourceDomain: input.sourceType,
    sourceEntityType: input.sourceType, sourceEntityId: input.sourceId, sourceVersion: input.sourceVersion,
  });
  await recordEnterpriseMutation(tx, principal, {
    module: "enterprise_finance", action: `${input.journalType}_JOURNAL_POSTED`, entityType: "FinanceJournal", entityId: journal.id,
    description: input.description, next: { journalNumber: journal.journalNumber },
  });
  await tx.phase2Operation.update({
    where: { id: operation.id },
    data: { status: "COMPLETED", resultEntityType: "FinanceJournal", resultEntityId: journal.id, completedAt: new Date() },
  });

  return journal;
}
