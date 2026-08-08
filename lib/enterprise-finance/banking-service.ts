import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion } from "@/lib/enterprise/context";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireBankingPrincipal, requireFinancialReportingPrincipal } from "./context";
import { postSystemGeneratedJournalInTx } from "./posting-engine";
import { bankAccountInput, bankStatementImportInput, reconciliationMatchInput } from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Stage B) — Banking Foundation and
 * Reconciliation. No real bank integration anywhere — `importBankStatement`
 * accepts caller-supplied line data only (Section 22's "governed Business
 * Services", never scraping or connecting to a real institution). Matches
 * are unconditionally append-only (reversal is a new row, same pattern as
 * receipt/vendor-payment allocations — a lesson this Part already learned
 * the hard way once); completed reconciliation sessions are immutable.
 *
 * An intermittent test failure surfaced during this stage's development
 * that initially looked like Postgres contention; the real cause was
 * simpler — `FinanceConfiguration` is a singleton per organization, and
 * this file's own runtime test didn't ensure it was ACTIVE itself before
 * posting a `BANK_ADJUSTMENT` journal (which requires it), instead
 * silently depending on whichever other Finance test file happened to run
 * first in the same suite. Fixed in the test file's own `beforeAll`, not
 * here.
 */

export async function createBankAccount(input: unknown) {
  const data = bankAccountInput.parse(input);
  const principal = await requireBankingPrincipal(PERMISSIONS.FINANCE_BANKING_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const glAccount = await tx.financeAccount.findFirst({ where: { id: data.linkedGlAccountId, organizationKey: principal.organizationKey } });
    if (!glAccount || glAccount.status !== "ACTIVE") throw new AppError("Linked GL account must be a valid, active account", 422, "INVALID_GL_ACCOUNT");

    const created = await tx.financeBankAccount.create({
      data: {
        organizationKey: principal.organizationKey, code: data.code, name: data.name, institutionName: data.institutionName,
        maskedAccountNumber: data.maskedAccountNumber, currency: data.currency, linkedGlAccountId: data.linkedGlAccountId, createdById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "BANK_ACCOUNT_CREATED", entityType: "FinanceBankAccount", entityId: created.id,
      description: `Bank account ${created.code} created`,
    });
    return created;
  });
}

/** Re-importing the same `statementRef` for the same bank account fails
 * deterministically via the database unique constraint — not an
 * app-level best-effort check. */
export async function importBankStatement(input: unknown) {
  const data = bankStatementImportInput.parse(input);
  const principal = await requireBankingPrincipal(PERMISSIONS.FINANCE_BANKING_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const bankAccount = await tx.financeBankAccount.findFirst({ where: { id: data.bankAccountId, organizationKey: principal.organizationKey } });
    if (!bankAccount) throw new NotFoundError("Bank account");

    const existing = await tx.financeBankStatement.findFirst({ where: { organizationKey: principal.organizationKey, bankAccountId: bankAccount.id, statementRef: data.statementRef } });
    if (existing) throw new ConflictError(`Statement ${data.statementRef} has already been imported for this bank account`);

    const statement = await tx.financeBankStatement.create({
      data: {
        organizationKey: principal.organizationKey, bankAccountId: bankAccount.id, statementRef: data.statementRef,
        periodStart: data.periodStart, periodEnd: data.periodEnd, openingBalance: data.openingBalance, closingBalance: data.closingBalance,
        importedById: principal.id,
      },
    });

    for (let index = 0; index < data.lines.length; index += 1) {
      const line = data.lines[index]!;
      await tx.financeBankStatementLine.create({
        data: {
          organizationKey: principal.organizationKey, statementId: statement.id, lineNumber: index + 1,
          transactionDate: line.transactionDate, description: line.description, debitAmount: line.debitAmount,
          creditAmount: line.creditAmount, externalReference: line.externalReference,
        },
      });
    }

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "BANK_STATEMENT_IMPORTED", entityType: "FinanceBankStatement", entityId: statement.id,
      description: `Statement ${data.statementRef} imported (${data.lines.length} lines)`,
    });
    return tx.financeBankStatement.findUniqueOrThrow({ where: { id: statement.id }, include: { lines: true } });
  });
}

export async function beginReconciliation(bankAccountId: string, statementId: string) {
  const principal = await requireBankingPrincipal(PERMISSIONS.FINANCE_BANKING_RECONCILE);
  return enterpriseTransaction(async (tx) => {
    const statement = await tx.financeBankStatement.findFirst({ where: { id: statementId, bankAccountId, organizationKey: principal.organizationKey } });
    if (!statement) throw new NotFoundError("Bank statement");

    const session = await tx.financeReconciliationSession.create({
      data: {
        organizationKey: principal.organizationKey, bankAccountId, statementId, openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance, preparedById: principal.id,
      },
    });
    await tx.financeBankStatement.update({ where: { id: statement.id }, data: { status: "RECONCILING" } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "RECONCILIATION_STARTED", entityType: "FinanceReconciliationSession", entityId: session.id,
      description: `Reconciliation started for statement ${statement.statementRef}`,
    });
    return session;
  });
}

/**
 * Matches a statement line either to an existing ledger entry (the normal
 * case — a receipt or payment already posted) or, when no matching ledger
 * entry exists, creates and posts a `BANK_ADJUSTMENT` journal and matches
 * against the ledger entry that journal produces (interest, bank charges,
 * etc.) — the manual adjustment always posts through the authoritative
 * Posting Engine, never as a direct ledger write.
 */
export async function matchStatementLine(sessionId: string, input: unknown, idempotencyKey?: string) {
  const data = reconciliationMatchInput.parse(input);
  const principal = await requireBankingPrincipal(PERMISSIONS.FINANCE_BANKING_RECONCILE);
  if (Boolean(data.ledgerEntryId) === Boolean(data.adjustment)) {
    throw new AppError("Provide exactly one of ledgerEntryId or adjustment", 422, "INVALID_MATCH_TARGET");
  }

  return enterpriseTransaction(async (tx) => {
    const session = await tx.financeReconciliationSession.findFirst({ where: { id: sessionId, organizationKey: principal.organizationKey } });
    if (!session) throw new NotFoundError("Reconciliation session");
    if (session.status !== "IN_PROGRESS") throw new ConflictError("This reconciliation session is not in progress");

    const statementLine = await tx.financeBankStatementLine.findFirst({ where: { id: data.statementLineId, organizationKey: principal.organizationKey, statementId: session.statementId } });
    if (!statementLine) throw new NotFoundError("Statement line");
    if (statementLine.status !== "UNMATCHED") throw new ConflictError("This statement line is already matched");

    let match;
    if (data.ledgerEntryId) {
      const ledgerEntry = await tx.financeLedgerEntry.findFirst({ where: { id: data.ledgerEntryId, organizationKey: principal.organizationKey } });
      if (!ledgerEntry) throw new NotFoundError("Ledger entry");
      const entryAmount = ledgerEntry.debitAmount.greaterThan(0) ? ledgerEntry.debitAmount : ledgerEntry.creditAmount;
      const lineAmount = statementLine.debitAmount.greaterThan(0) ? statementLine.debitAmount : statementLine.creditAmount;
      if (!entryAmount.equals(lineAmount)) throw new ConflictError("The ledger entry amount does not match the statement line amount");

      // Nothing at the database level stops the same ledger entry from
      // being matched to two different statement lines (no schema
      // uniqueness on ledgerEntryId, since a reversed match legitimately
      // frees it up again) — enforced here instead, the same way AR/AP
      // guard against over-allocation.
      const alreadyMatched = await tx.financeReconciliationMatch.findFirst({
        where: { organizationKey: principal.organizationKey, ledgerEntryId: ledgerEntry.id, status: { not: "REVERSAL" } },
      });
      if (alreadyMatched) throw new ConflictError("This ledger entry is already matched to another statement line");

      match = await tx.financeReconciliationMatch.create({
        data: { organizationKey: principal.organizationKey, sessionId: session.id, statementLineId: statementLine.id, matchType: "LEDGER_ENTRY", ledgerEntryId: ledgerEntry.id, matchedById: principal.id },
      });
    } else {
      const bankAccount = await tx.financeBankAccount.findUniqueOrThrow({ where: { id: session.bankAccountId } });
      const lineAmount = statementLine.debitAmount.greaterThan(0) ? statementLine.debitAmount : statementLine.creditAmount;
      const isDeposit = statementLine.debitAmount.greaterThan(0);
      const journal = await postSystemGeneratedJournalInTx(tx, principal, {
        journalType: "BANK_ADJUSTMENT", postingDate: statementLine.transactionDate, currency: bankAccount.currency,
        description: `Bank adjustment: ${data.adjustment!.description}`, sourceType: "BANK_ADJUSTMENT", sourceId: statementLine.id,
        idempotencyKey: idempotencyKey ?? `bank-adjustment:${statementLine.id}`,
        lines: isDeposit
          ? [
              { accountId: bankAccount.linkedGlAccountId, debitAmount: lineAmount, creditAmount: new Prisma.Decimal(0), description: data.adjustment!.description },
              { accountId: data.adjustment!.accountId, debitAmount: new Prisma.Decimal(0), creditAmount: lineAmount, description: data.adjustment!.description },
            ]
          : [
              { accountId: data.adjustment!.accountId, debitAmount: lineAmount, creditAmount: new Prisma.Decimal(0), description: data.adjustment!.description },
              { accountId: bankAccount.linkedGlAccountId, debitAmount: new Prisma.Decimal(0), creditAmount: lineAmount, description: data.adjustment!.description },
            ],
      });
      match = await tx.financeReconciliationMatch.create({
        data: { organizationKey: principal.organizationKey, sessionId: session.id, statementLineId: statementLine.id, matchType: "MANUAL_ADJUSTMENT", adjustmentJournalId: journal.id, matchedById: principal.id },
      });
    }

    await tx.financeBankStatementLine.update({ where: { id: statementLine.id }, data: { status: "MATCHED" } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "RECONCILIATION_LINE_MATCHED", entityType: "FinanceReconciliationMatch", entityId: match.id,
      description: `Statement line ${statementLine.lineNumber} matched`,
    });
    return match;
  });
}

/** Unmatches via a new reversal row — the original match is never updated
 * or deleted (database-enforced, append-only, same pattern as AR/AP
 * allocation reversal). */
export async function unmatchStatementLine(matchId: string) {
  const principal = await requireBankingPrincipal(PERMISSIONS.FINANCE_BANKING_RECONCILE);
  return enterpriseTransaction(async (tx) => {
    const original = await tx.financeReconciliationMatch.findFirst({ where: { id: matchId, organizationKey: principal.organizationKey } });
    if (!original) throw new NotFoundError("Match");
    if (original.status === "REVERSAL") throw new AppError("A reversal row cannot itself be reversed", 422, "CANNOT_REVERSE_A_REVERSAL");
    const existingReversal = await tx.financeReconciliationMatch.findFirst({ where: { reversalOfMatchId: original.id, organizationKey: principal.organizationKey } });
    if (existingReversal) throw new ConflictError("This match has already been reversed");

    const session = await tx.financeReconciliationSession.findUniqueOrThrow({ where: { id: original.sessionId } });
    if (session.status !== "IN_PROGRESS") throw new ConflictError("Cannot unmatch a line in a completed reconciliation session");

    const reversal = await tx.financeReconciliationMatch.create({
      data: {
        organizationKey: principal.organizationKey, sessionId: original.sessionId, statementLineId: original.statementLineId,
        matchType: original.matchType, ledgerEntryId: original.ledgerEntryId, adjustmentJournalId: original.adjustmentJournalId,
        status: "REVERSAL", reversalOfMatchId: original.id, matchedById: principal.id,
      },
    });
    await tx.financeBankStatementLine.update({ where: { id: original.statementLineId }, data: { status: "UNMATCHED" } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "RECONCILIATION_LINE_UNMATCHED", entityType: "FinanceReconciliationMatch", entityId: reversal.id,
      description: `Match ${original.id} reversed`,
    });
    return reversal;
  });
}

/** Completion requires every statement line matched, and enforces the
 * `RECONCILIATION_APPROVAL` SoD policy (preparer != completer). */
export async function completeReconciliation(sessionId: string, expectedVersion: number) {
  const principal = await requireBankingPrincipal(PERMISSIONS.FINANCE_BANKING_RECONCILE);
  return enterpriseTransaction(async (tx) => {
    const session = await tx.financeReconciliationSession.findFirst({ where: { id: sessionId, organizationKey: principal.organizationKey } });
    if (!session) throw new NotFoundError("Reconciliation session");
    requireVersion(session.version, expectedVersion);
    if (session.status !== "IN_PROGRESS") throw new ConflictError("This session is not in progress");

    const unmatchedCount = await tx.financeBankStatementLine.count({ where: { organizationKey: principal.organizationKey, statementId: session.statementId, status: "UNMATCHED" } });
    if (unmatchedCount > 0) throw new ConflictError(`${unmatchedCount} statement line(s) remain unmatched`);

    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: "RECONCILIATION_APPROVAL",
      subjectType: "FinanceReconciliationSession", subjectId: session.id, preparerId: session.preparedById,
    });

    const completed = await tx.financeReconciliationSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", completedById: principal.id, completedAt: new Date(), version: { increment: 1 } },
    });
    await tx.financeBankStatement.update({ where: { id: session.statementId }, data: { status: "RECONCILED" } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "RECONCILIATION_COMPLETED", entityType: "FinanceReconciliationSession", entityId: completed.id,
      description: `Reconciliation session ${completed.id} completed`,
    });
    return completed;
  });
}

export async function listUnreconciledLines(statementId: string) {
  const principal = await requireBankingPrincipal(PERMISSIONS.FINANCE_BANKING_MANAGE);
  return enterpriseTransaction((tx) => tx.financeBankStatementLine.findMany({
    where: { organizationKey: principal.organizationKey, statementId, status: "UNMATCHED" },
    orderBy: [{ lineNumber: "asc" }],
    take: 5000,
  }));
}

/** Bank position as of an explicit date — sum of posted ledger activity
 * against the bank account's linked GL account, never implicit "now"
 * (Section 19's reproducibility requirement, same as AR/AP aging). */
export async function getBankPosition(bankAccountId: string, asOfDate: Date) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_BANKING_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const bankAccount = await tx.financeBankAccount.findFirst({ where: { id: bankAccountId, organizationKey: principal.organizationKey } });
    if (!bankAccount) throw new NotFoundError("Bank account");
    const result = await tx.financeLedgerEntry.aggregate({
      where: { organizationKey: principal.organizationKey, accountId: bankAccount.linkedGlAccountId, postingDate: { lte: asOfDate } },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const debit = result._sum.debitAmount ?? new Prisma.Decimal(0);
    const credit = result._sum.creditAmount ?? new Prisma.Decimal(0);
    return { bankAccountId: bankAccount.id, asOfDate, balance: debit.minus(credit) };
  });
}
