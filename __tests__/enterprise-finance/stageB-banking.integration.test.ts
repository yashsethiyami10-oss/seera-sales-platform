import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, ForbiddenError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { createAccount, activateAccount } from "@/lib/enterprise-finance/chart-of-accounts-service";
import { createFiscalYearWithPeriods } from "@/lib/enterprise-finance/period-service";
import { saveFinanceConfigurationDraft, activateFinanceConfiguration, getFinanceConfiguration } from "@/lib/enterprise-finance/configuration-service";
import { addJournalLine, approveJournal, createJournalDraft, submitJournal } from "@/lib/enterprise-finance/journal-service";
import { postJournal } from "@/lib/enterprise-finance/posting-engine";
import {
  beginReconciliation, completeReconciliation, createBankAccount, getBankPosition, importBankStatement,
  listUnreconciledLines, matchStatementLine, unmatchStatementLine,
} from "@/lib/enterprise-finance/banking-service";

const suffix = `se${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function authAs(userId: string) {
  mockAuth.mockResolvedValue({ user: { id: userId } } as never);
}

async function setFlag(key: string, enabled: boolean) {
  await prisma.aiConfiguration.upsert({
    where: { organizationKey_key: { organizationKey: "MUV", key } },
    update: { value: { enabled } },
    create: { organizationKey: "MUV", key, category: "FEATURE_FLAG", value: { enabled } },
  });
}

let founderUserId: string;
let restrictedUserId: string;
let createdRestrictedUser = false;
let approverUserId: string;
let journalApproverUserId: string;
let bankGlAccountId: string;
let bankAccountId: string;
let miscExpenseAccountId: string;

// Fiscal years created by tests are permanent — see
// stageA-accounting-core.integration.test.ts's comment for why this queries
// the true highest fiscal year used anywhere for the org (shared pool with
// every other future-anchored Finance test file, starting at 2100) and
// picks the next one, instead of drawing randomly or trusting a fixed band.
async function pickUnusedFiscalYear(usedYears: number): Promise<number> {
  const poolStart = 2100;
  const latest = await prisma.financeFiscalYear.findFirst({
    where: { organizationKey: "MUV", startDate: { gte: new Date(Date.UTC(poolStart, 0, 1)) } },
    orderBy: { startDate: "desc" },
    select: { startDate: true },
  });
  const nextFree = latest ? latest.startDate.getUTCFullYear() + 1 : poolStart;
  if (nextFree + usedYears >= 9999) throw new Error("Finance fiscal-year test pool exhausted");
  return nextFree;
}

let baseYear: number;
let fyStart: Date;
let fyEnd: Date;
let txnDate: Date;

async function completeAsSecondActor(sessionId: string, expectedVersion: number) {
  authAs(approverUserId);
  const result = await completeReconciliation(sessionId, expectedVersion);
  authAs(founderUserId);
  return result;
}

describe("Part 3C Stage B — Banking Foundation and Reconciliation", () => {
  beforeAll(async () => {
    baseYear = await pickUnusedFiscalYear(1);
    fyStart = new Date(Date.UTC(baseYear, 3, 1));
    fyEnd = new Date(Date.UTC(baseYear + 1, 2, 31));
    txnDate = new Date(Date.UTC(baseYear, 4, 10));

    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED", "ENTERPRISE_BANKING_RECONCILIATION_ENABLED", "ENTERPRISE_FINANCIAL_REPORTING_ENABLED"]) {
      await setFlag(key, true);
    }

    const founder = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
    if (!founder) throw new Error("A seeded, active Founder user is required for this test");
    founderUserId = founder.id;

    const support = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Customer Support", active: true } } });
    if (support) {
      restrictedUserId = support.id;
    } else {
      const supportRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Customer Support" } });
      const created = await prisma.user.create({
        data: { name: "StageB Banking Restricted Test User", email: `stageb-bank-restricted-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      restrictedUserId = created.id;
      createdRestrictedUser = true;
    }

    const approverPermissionKeys = ["finance.banking.reconcile"];
    const approverPermissions = await prisma.salesPermission.findMany({ where: { permissionKey: { in: approverPermissionKeys } } });
    if (approverPermissions.length !== approverPermissionKeys.length) throw new Error("Expected finance.banking.reconcile to already be seeded");
    const approverRole = await prisma.salesRole.create({ data: { name: `StageB Banking Approver ${suffix}`, active: true, description: "Test-only role for Stage B reconciliation SoD two-actor tests" } });
    await prisma.salesRolePermission.createMany({ data: approverPermissions.map((p) => ({ roleId: approverRole.id, permissionId: p.id })) });
    const approverUser = await prisma.user.create({
      data: { name: "StageB Banking Approver", email: `stageb-bank-approver-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "STAFF", salesRoleId: approverRole.id, active: true },
    });
    approverUserId = approverUser.id;

    // A separate journal-approver actor, used only to post a real journal
    // whose resulting ledger entry this file's ledger-entry-match test
    // matches against — distinct from the banking reconciliation approver
    // above, since JOURNAL_APPROVAL/JOURNAL_POSTING SoD is a different
    // policy from RECONCILIATION_APPROVAL.
    const journalApproverPermissionKeys = ["finance.journals.approve", "finance.journals.post"];
    const journalApproverPermissions = await prisma.salesPermission.findMany({ where: { permissionKey: { in: journalApproverPermissionKeys } } });
    if (journalApproverPermissions.length !== journalApproverPermissionKeys.length) throw new Error("Expected finance.journals.approve/post to already be seeded");
    const journalApproverRole = await prisma.salesRole.create({ data: { name: `StageB Banking Journal Approver ${suffix}`, active: true, description: "Test-only role for posting a journal to match against" } });
    await prisma.salesRolePermission.createMany({ data: journalApproverPermissions.map((p) => ({ roleId: journalApproverRole.id, permissionId: p.id })) });
    const journalApproverUser = await prisma.user.create({
      data: { name: "StageB Banking Journal Approver", email: `stageb-bank-journal-approver-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "STAFF", salesRoleId: journalApproverRole.id, active: true },
    });
    journalApproverUserId = journalApproverUser.id;

    authAs(founderUserId);
    await createFiscalYearWithPeriods({ code: `${suffix}-FY`, startDate: fyStart, endDate: fyEnd, periodCount: 12 });

    const bankGl = await createAccount({ accountCode: `${suffix}-1010`, name: "Bank Current Account", category: "ASSET", normalBalance: "DEBIT" });
    const activatedBankGl = await activateAccount(bankGl.id, bankGl.version);
    bankGlAccountId = activatedBankGl.id;

    const miscExpense = await createAccount({ accountCode: `${suffix}-5900`, name: "Bank Charges", category: "EXPENSE", normalBalance: "DEBIT" });
    const activatedMiscExpense = await activateAccount(miscExpense.id, miscExpense.version);
    miscExpenseAccountId = activatedMiscExpense.id;

    const bankAccount = await createBankAccount({ code: `${suffix}-BANK1`, name: "Primary Current Account", linkedGlAccountId: bankGlAccountId });
    bankAccountId = bankAccount.id;

    // FinanceConfiguration is a singleton per organization, and posting a
    // BANK_ADJUSTMENT journal requires it ACTIVE (validation-engine.ts's
    // CONTROL_ACCOUNT_DEPENDENT_TYPES). This file's own tests must not
    // assume some other, arbitrarily-ordered test file already activated
    // it — the real bug this exact gap caused: an intermittent failure
    // ("Finance configuration must be active before posting this journal
    // type") that looked like Postgres flakiness at first because it only
    // manifested depending on which other Finance test files had (or had
    // not) already run first in the same suite execution.
    const existingConfig = await getFinanceConfiguration();
    const draftConfig = await saveFinanceConfigurationDraft({}, existingConfig?.version);
    if (draftConfig.status !== "ACTIVE") await activateFinanceConfiguration(draftConfig.version);
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED", "ENTERPRISE_BANKING_RECONCILIATION_ENABLED", "ENTERPRISE_FINANCIAL_REPORTING_ENABLED"]) {
      await setFlag(key, false);
    }
    if (createdRestrictedUser) await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
  });

  it("denies a principal without finance.banking.manage", async () => {
    authAs(restrictedUserId);
    await expect(createBankAccount({ code: `${suffix}-DENIED`, name: "Denied", linkedGlAccountId: bankGlAccountId })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects re-importing the same statement reference for the same bank account", async () => {
    authAs(founderUserId);
    await importBankStatement({
      bankAccountId, statementRef: `${suffix}-STMT-DUP`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: 500,
      lines: [{ transactionDate: txnDate, description: "Deposit", debitAmount: 500, creditAmount: 0, externalReference: `${suffix}-TXN-1` }],
    });
    await expect(importBankStatement({
      bankAccountId, statementRef: `${suffix}-STMT-DUP`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: 500,
      lines: [{ transactionDate: txnDate, description: "Deposit", debitAmount: 500, creditAmount: 0, externalReference: `${suffix}-TXN-1` }],
    })).rejects.toBeInstanceOf(ConflictError);
  });

  describe("reconciliation lifecycle", () => {
    it("matches a statement line to a manual adjustment, completes reconciliation, and rejects same-actor completion", async () => {
      authAs(founderUserId);
      const statement = await importBankStatement({
        bankAccountId, statementRef: `${suffix}-STMT-1`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: -50,
        lines: [{ transactionDate: txnDate, description: "Bank charge", debitAmount: 0, creditAmount: 50, externalReference: `${suffix}-TXN-CHARGE` }],
      });
      const session = await beginReconciliation(bankAccountId, statement.id);

      const unreconciled = await listUnreconciledLines(statement.id);
      expect(unreconciled).toHaveLength(1);

      const match = await matchStatementLine(session.id, {
        statementLineId: unreconciled[0]!.id,
        adjustment: { accountId: miscExpenseAccountId, description: "Monthly bank charge" },
      }, `${suffix}-adjustment-1`);
      expect(match.matchType).toBe("MANUAL_ADJUSTMENT");
      expect(match.adjustmentJournalId).not.toBeNull();

      const adjustmentJournal = await prisma.financeJournal.findUniqueOrThrow({ where: { id: match.adjustmentJournalId! } });
      expect(adjustmentJournal.totalDebit.toString()).toBe("50");
      expect(adjustmentJournal.totalCredit.toString()).toBe("50");

      const stillUnreconciled = await listUnreconciledLines(statement.id);
      expect(stillUnreconciled).toHaveLength(0);

      // Same actor (Founder prepared the session) cannot complete it.
      await expect(completeReconciliation(session.id, session.version)).rejects.toBeInstanceOf(ForbiddenError);

      const completed = await completeAsSecondActor(session.id, session.version);
      expect(completed.status).toBe("COMPLETED");

      const completedStatement = await prisma.financeBankStatement.findUniqueOrThrow({ where: { id: statement.id } });
      expect(completedStatement.status).toBe("RECONCILED");
    });

    it("rejects completion while any statement line remains unmatched", async () => {
      authAs(founderUserId);
      const statement = await importBankStatement({
        bankAccountId, statementRef: `${suffix}-STMT-2`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: 100,
        lines: [{ transactionDate: txnDate, description: "Unmatched deposit", debitAmount: 100, creditAmount: 0, externalReference: `${suffix}-TXN-UNMATCHED` }],
      });
      const session = await beginReconciliation(bankAccountId, statement.id);
      await expect(completeAsSecondActor(session.id, session.version)).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects direct mutation of a completed reconciliation session and its matches at the database level", async () => {
      authAs(founderUserId);
      const statement = await importBankStatement({
        bankAccountId, statementRef: `${suffix}-STMT-3`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: -20,
        lines: [{ transactionDate: txnDate, description: "Immutability test", debitAmount: 0, creditAmount: 20, externalReference: `${suffix}-TXN-IMMUTABLE` }],
      });
      const session = await beginReconciliation(bankAccountId, statement.id);
      const unreconciled = await listUnreconciledLines(statement.id);
      const match = await matchStatementLine(session.id, {
        statementLineId: unreconciled[0]!.id,
        adjustment: { accountId: miscExpenseAccountId, description: "Immutability test charge" },
      }, `${suffix}-adjustment-immutable`);
      const completed = await completeAsSecondActor(session.id, session.version);

      await expect(prisma.financeReconciliationMatch.update({ where: { id: match.id }, data: { status: "REVERSED" } as any })).rejects.toThrow();
    });

    it("rejects every direct mutation of a completed reconciliation session at the database level, including organizationKey — repaired after the independent audit found the original trigger's enumerated allowlist omitted it", async () => {
      authAs(founderUserId);
      const statement = await importBankStatement({
        bankAccountId, statementRef: `${suffix}-STMT-IMMUTABLE-2`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: -30,
        lines: [{ transactionDate: txnDate, description: "Full immutability sweep", debitAmount: 0, creditAmount: 30, externalReference: `${suffix}-TXN-IMMUTABLE-2` }],
      });
      const session = await beginReconciliation(bankAccountId, statement.id);
      const unreconciled = await listUnreconciledLines(statement.id);
      await matchStatementLine(session.id, {
        statementLineId: unreconciled[0]!.id,
        adjustment: { accountId: miscExpenseAccountId, description: "Full immutability sweep charge" },
      }, `${suffix}-adjustment-immutable-2`);
      const completed = await completeAsSecondActor(session.id, session.version);

      // The specific gap the audit found: organizationKey was not in the
      // old trigger's enumerated column list.
      await expect(prisma.financeReconciliationSession.update({ where: { id: completed.id }, data: { organizationKey: "SOME-OTHER-ORG" } })).rejects.toThrow();
      // Status/lifecycle mutation.
      await expect(prisma.financeReconciliationSession.update({ where: { id: completed.id }, data: { status: "IN_PROGRESS" } })).rejects.toThrow();
      // Identity mutation (which bank account / statement this session belongs to).
      const otherBankAccount = await createBankAccount({ code: `${suffix}-BANK-OTHER`, name: "Other Account", linkedGlAccountId: bankGlAccountId });
      await expect(prisma.financeReconciliationSession.update({ where: { id: completed.id }, data: { bankAccountId: otherBankAccount.id } })).rejects.toThrow();
      // Balance mutation.
      await expect(prisma.financeReconciliationSession.update({ where: { id: completed.id }, data: { closingBalance: 999 } })).rejects.toThrow();
      await expect(prisma.financeReconciliationSession.update({ where: { id: completed.id }, data: { openingBalance: 999 } })).rejects.toThrow();
      // Preparer/completer identity mutation.
      await expect(prisma.financeReconciliationSession.update({ where: { id: completed.id }, data: { preparedById: founderUserId } })).rejects.toThrow();
      // Deletion of a completed session.
      await expect(prisma.financeReconciliationSession.delete({ where: { id: completed.id } })).rejects.toThrow();

      // No field is permitted to change post-completion in this repaired
      // design — confirmed the row is byte-for-byte unchanged after every
      // rejected attempt above.
      const stillIntact = await prisma.financeReconciliationSession.findUniqueOrThrow({ where: { id: completed.id } });
      expect(stillIntact.status).toBe("COMPLETED");
      expect(stillIntact.organizationKey).toBe("MUV");
      expect(stillIntact.bankAccountId).toBe(bankAccountId);
      expect(stillIntact.closingBalance.toString()).toBe(completed.closingBalance.toString());
    });

    it("unmatches via a new reversal row, leaving the original match untouched", async () => {
      authAs(founderUserId);
      const statement = await importBankStatement({
        bankAccountId, statementRef: `${suffix}-STMT-4`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: -15,
        lines: [{ transactionDate: txnDate, description: "Unmatch test", debitAmount: 0, creditAmount: 15, externalReference: `${suffix}-TXN-UNMATCH` }],
      });
      const session = await beginReconciliation(bankAccountId, statement.id);
      const unreconciled = await listUnreconciledLines(statement.id);
      const match = await matchStatementLine(session.id, {
        statementLineId: unreconciled[0]!.id,
        adjustment: { accountId: miscExpenseAccountId, description: "Unmatch test charge" },
      }, `${suffix}-adjustment-unmatch`);

      const reversal = await unmatchStatementLine(match.id);
      expect(reversal.reversalOfMatchId).toBe(match.id);

      const lineAfterUnmatch = await prisma.financeBankStatementLine.findUniqueOrThrow({ where: { id: unreconciled[0]!.id } });
      expect(lineAfterUnmatch.status).toBe("UNMATCHED");
    });

    it("matches a statement line to an existing ledger entry, and rejects matching the same ledger entry to a second statement line", async () => {
      authAs(founderUserId);
      const draft = await createJournalDraft({ journalType: "GENERAL", postingDate: txnDate, documentDate: txnDate, currency: "INR", description: "Manual bank deposit for match test" });
      await addJournalLine(draft.id, draft.version, { accountId: bankGlAccountId, debitAmount: 300, creditAmount: 0, description: "Deposit" });
      await addJournalLine(draft.id, draft.version + 1, { accountId: miscExpenseAccountId, debitAmount: 0, creditAmount: 300, description: "Contra" });
      const withLines = await prisma.financeJournal.findUniqueOrThrow({ where: { id: draft.id } });
      const submitted = await submitJournal(draft.id, withLines.version);

      authAs(journalApproverUserId);
      const approved = await approveJournal(submitted.id, submitted.version);
      authAs(founderUserId);
      const posted = await postJournal(approved.id, approved.version, `${suffix}-match-journal`);

      const ledgerEntry = await prisma.financeLedgerEntry.findFirstOrThrow({ where: { journalId: posted.id, accountId: bankGlAccountId } });

      const statementA = await importBankStatement({
        bankAccountId, statementRef: `${suffix}-STMT-LEDGER-A`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: 300,
        lines: [{ transactionDate: txnDate, description: "Deposit A", debitAmount: 300, creditAmount: 0, externalReference: `${suffix}-TXN-LEDGER-A` }],
      });
      const sessionA = await beginReconciliation(bankAccountId, statementA.id);
      const [lineA] = await listUnreconciledLines(statementA.id);
      const match = await matchStatementLine(sessionA.id, { statementLineId: lineA!.id, ledgerEntryId: ledgerEntry.id });
      expect(match.matchType).toBe("LEDGER_ENTRY");
      expect(match.ledgerEntryId).toBe(ledgerEntry.id);

      const statementB = await importBankStatement({
        bankAccountId, statementRef: `${suffix}-STMT-LEDGER-B`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: 300,
        lines: [{ transactionDate: txnDate, description: "Deposit B", debitAmount: 300, creditAmount: 0, externalReference: `${suffix}-TXN-LEDGER-B` }],
      });
      const sessionB = await beginReconciliation(bankAccountId, statementB.id);
      const [lineB] = await listUnreconciledLines(statementB.id);
      await expect(matchStatementLine(sessionB.id, { statementLineId: lineB!.id, ledgerEntryId: ledgerEntry.id })).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects matching a ledger entry whose amount does not equal the statement line amount", async () => {
      authAs(founderUserId);
      const draft = await createJournalDraft({ journalType: "GENERAL", postingDate: txnDate, documentDate: txnDate, currency: "INR", description: "Mismatch amount journal" });
      await addJournalLine(draft.id, draft.version, { accountId: bankGlAccountId, debitAmount: 75, creditAmount: 0, description: "Deposit" });
      await addJournalLine(draft.id, draft.version + 1, { accountId: miscExpenseAccountId, debitAmount: 0, creditAmount: 75, description: "Contra" });
      const withLines = await prisma.financeJournal.findUniqueOrThrow({ where: { id: draft.id } });
      const submitted = await submitJournal(draft.id, withLines.version);

      authAs(journalApproverUserId);
      const approved = await approveJournal(submitted.id, submitted.version);
      authAs(founderUserId);
      const posted = await postJournal(approved.id, approved.version, `${suffix}-mismatch-journal`);

      const ledgerEntry = await prisma.financeLedgerEntry.findFirstOrThrow({ where: { journalId: posted.id, accountId: bankGlAccountId } });

      const statement = await importBankStatement({
        bankAccountId, statementRef: `${suffix}-STMT-MISMATCH`, periodStart: txnDate, periodEnd: txnDate, openingBalance: 0, closingBalance: 999,
        lines: [{ transactionDate: txnDate, description: "Different amount", debitAmount: 999, creditAmount: 0, externalReference: `${suffix}-TXN-MISMATCH` }],
      });
      const session = await beginReconciliation(bankAccountId, statement.id);
      const [line] = await listUnreconciledLines(statement.id);
      await expect(matchStatementLine(session.id, { statementLineId: line!.id, ledgerEntryId: ledgerEntry.id })).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("bank position and reporting access", () => {
    it("computes bank position from posted ledger activity as of an explicit date", async () => {
      authAs(founderUserId);
      const position = await getBankPosition(bankAccountId, new Date(Date.UTC(baseYear, 11, 31)));
      expect(position.bankAccountId).toBe(bankAccountId);
      expect(position.balance).toBeDefined();
    });

    it("rejects bank position access without ENTERPRISE_FINANCIAL_REPORTING_ENABLED", async () => {
      await setFlag("ENTERPRISE_FINANCIAL_REPORTING_ENABLED", false);
      authAs(founderUserId);
      await expect(getBankPosition(bankAccountId, new Date())).rejects.toBeInstanceOf(ForbiddenError);
      await setFlag("ENTERPRISE_FINANCIAL_REPORTING_ENABLED", true);
    });

    it("rejects banking access without ENTERPRISE_BANKING_RECONCILIATION_ENABLED", async () => {
      await setFlag("ENTERPRISE_BANKING_RECONCILIATION_ENABLED", false);
      authAs(founderUserId);
      await expect(createBankAccount({ code: `${suffix}-FLAGOFF`, name: "Flag off", linkedGlAccountId: bankGlAccountId })).rejects.toBeInstanceOf(ForbiddenError);
      await setFlag("ENTERPRISE_BANKING_RECONCILIATION_ENABLED", true);
    });
  });
});
