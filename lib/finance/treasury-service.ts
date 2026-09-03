import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournal } from "./journal-service";
import { financeNumberFor } from "./numbering";

export async function createTreasuryAccount(
  db: PrismaClient,
  actorId: string,
  input: { kind: "BANK" | "CASH"; code: string; name: string; bankName?: string; accountType?: string; maskedAccountNumber?: string; ifsc?: string; openingBalance?: number; openingBalanceDate?: Date },
) {
  await authorize(db, { actorId, permission: "treasury_account:manage" });
  const parentCode = input.kind === "BANK" ? "1000" : "1010";
  return db.$transaction(async (tx) => {
    const coa = await tx.seeraChartOfAccount.create({ data: { code: `${parentCode}.${input.code}`, name: input.name, type: "ASSET", parentCode } });
    // openingBalance/openingBalanceDate are stored here for display only — the
    // actual GL-affecting entry is posted through the Opening Balance Wizard
    // (opening-balance-service.ts) so its offsetting side is chosen explicitly
    // rather than assumed (a lone Bank account cannot know on its own whether
    // its opening float came from Capital, a Loan, or a prior-system carry-forward).
    const account = await tx.seeraTreasuryAccount.create({
      data: { kind: input.kind, code: input.code, name: input.name, bankName: input.bankName, accountType: input.accountType, maskedAccountNumber: input.maskedAccountNumber, ifsc: input.ifsc, chartOfAccountId: coa.id, openingBalance: input.openingBalance ?? 0, openingBalanceDate: input.openingBalanceDate },
    });
    await recordAudit(tx, { actorId, action: "finance.treasury_account.created", entityType: "SeeraTreasuryAccount", entityId: account.id, afterState: { kind: account.kind, code: account.code, name: account.name } });
    return { ...account, chartOfAccountCode: coa.code };
  }, { timeout: 15_000 });
}

// Money Desk 2.0 (Rule 10): fixes "No Treasury Accounts configured" properly — an idempotent
// bootstrap, not a hard-coded fake balance. createTreasuryAccount() itself always creates a new
// row (it has no upsert path, since each call also creates a linked SeeraChartOfAccount) — this
// wraps it with a find-first-by-code check so calling it again after the accounts already exist
// is a safe no-op, never a duplicate Cash/Bank account or a duplicate deployment-time seed.
export async function ensureDefaultTreasuryAccounts(db: PrismaClient, actorId: string) {
  const defaults: { code: string; name: string; kind: "CASH" | "BANK" }[] = [
    { code: "CASH-MAIN", name: "Cash", kind: "CASH" },
    { code: "BANK-MAIN", name: "Bank Account", kind: "BANK" },
  ];
  const results = [];
  for (const d of defaults) {
    const existing = await db.seeraTreasuryAccount.findUnique({ where: { code: d.code } });
    results.push(existing ?? (await createTreasuryAccount(db, actorId, { kind: d.kind, code: d.code, name: d.name })));
  }
  return results;
}

export async function listTreasuryAccounts(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "gl:view" });
  return db.seeraTreasuryAccount.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

// Treasury Accounts management screen needs both states in view (spec section 4:
// "Create / View / Activate-Deactivate") — every other reader (Money Desk pickers,
// Money In/Out/Transfer forms) deliberately keeps using listTreasuryAccounts()'s
// active-only filter so a deactivated account can never be selected for a new
// transaction while still being visible/reactivatable from Treasury Accounts.
export async function listAllTreasuryAccounts(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "gl:view" });
  return db.seeraTreasuryAccount.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
}

export async function setTreasuryAccountActive(db: PrismaClient, actorId: string, input: { treasuryAccountId: string; isActive: boolean }) {
  await authorize(db, { actorId, permission: "treasury_account:manage" });
  const before = await db.seeraTreasuryAccount.findUniqueOrThrow({ where: { id: input.treasuryAccountId } });
  const account = await db.seeraTreasuryAccount.update({ where: { id: input.treasuryAccountId }, data: { isActive: input.isActive } });
  await recordAudit(db, { actorId, action: input.isActive ? "finance.treasury_account.activated" : "finance.treasury_account.deactivated", entityType: "SeeraTreasuryAccount", entityId: account.id, beforeState: { isActive: before.isActive }, afterState: { isActive: account.isActive } });
  return account;
}

async function treasuryCoa(db: PrismaClient, treasuryAccountId: string) {
  const account = await db.seeraTreasuryAccount.findUniqueOrThrow({ where: { id: treasuryAccountId } });
  const coa = await db.seeraChartOfAccount.findUniqueOrThrow({ where: { id: account.chartOfAccountId } });
  return { account, coa };
}

const MONEY_IN_CREDIT_ACCOUNT: Record<string, string> = {
  CUSTOMER_ADVANCE: "2010", // Customer Advances (liability) — manual entries outside the S.S./Distributor payment-proof pipeline only; that pipeline auto-posts via sales-integration-service.ts and must never be duplicated here.
  INVOICE_RECEIPT: "1100", // Trade Receivables
  OTHER_OPERATING_REVENUE: "4010",
  OTHER_INCOME: "4020",
  REFUND_RECOVERY: "1500", // Other Current Assets
  BANK_INTEREST: "4020",
  OTHER_RECEIPT: "4020",
};

export async function recordMoneyIn(
  db: PrismaClient,
  actorId: string,
  input: { type: keyof typeof MONEY_IN_CREDIT_ACCOUNT; date: Date; amount: number; treasuryAccountId: string; partyType?: string; partyId?: string; mode: string; reference?: string; description?: string; dimensionId?: string; idempotencyKey: string },
) {
  await authorize(db, { actorId, permission: "money_in:record" });
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);
  const creditAccount = MONEY_IN_CREDIT_ACCOUNT[input.type];
  if (!creditAccount) throw new FoundationError("INVALID_MONEY_IN_TYPE", "Unrecognised Money In type — Loan Receipt and Founder Capital are recorded from Loans / Capital screens", 400);
  const { coa } = await treasuryCoa(db, input.treasuryAccountId);
  const journal = await postJournal(db, actorId, {
    date: input.date,
    sourceType: "SALES_RECEIPT",
    narration: `Money In (${input.type}) — ${input.description ?? input.reference ?? input.mode}`,
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: coa.code, debit: input.amount, treasuryAccountId: input.treasuryAccountId, description: input.reference, dimensionId: input.dimensionId },
      { accountId: creditAccount, credit: input.amount, partyType: input.partyType, partyId: input.partyId, description: input.reference, dimensionId: input.dimensionId },
    ],
  });
  return journal;
}

const MONEY_OUT_DEBIT_ACCOUNT: Record<string, string> = {
  TAX_PAYMENT: "2021",
  ADVANCE_TO_EMPLOYEE_VENDOR: "1300",
  REIMBURSEMENT: "1300",
  REFUND: "2010",
  OTHER: "5230",
};

export async function recordMoneyOut(
  db: PrismaClient,
  actorId: string,
  input: { type: keyof typeof MONEY_OUT_DEBIT_ACCOUNT; date: Date; amount: number; treasuryAccountId: string; debitAccountOverride?: string; partyType?: string; partyId?: string; mode: string; reference?: string; description?: string; dimensionId?: string; idempotencyKey: string },
) {
  await authorize(db, { actorId, permission: "money_out:record" });
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);
  const debitAccount = input.debitAccountOverride ?? MONEY_OUT_DEBIT_ACCOUNT[input.type];
  if (!debitAccount) throw new FoundationError("INVALID_MONEY_OUT_TYPE", "Unrecognised Money Out type — Vendor Payment, Salary, Loan Repayment and Drawings are recorded from their own screens", 400);
  const { coa } = await treasuryCoa(db, input.treasuryAccountId);
  const journal = await postJournal(db, actorId, {
    date: input.date,
    sourceType: "EXPENSE",
    narration: `Money Out (${input.type}) — ${input.description ?? input.reference ?? input.mode}`,
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: debitAccount, debit: input.amount, partyType: input.partyType, partyId: input.partyId, description: input.reference, dimensionId: input.dimensionId },
      { accountId: coa.code, credit: input.amount, treasuryAccountId: input.treasuryAccountId, description: input.reference, dimensionId: input.dimensionId },
    ],
  });
  return journal;
}

export async function transferFunds(db: PrismaClient, actorId: string, input: { fromTreasuryAccountId: string; toTreasuryAccountId: string; amount: number; date: Date; description?: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "money_out:record" });
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);
  if (input.fromTreasuryAccountId === input.toTreasuryAccountId) throw new FoundationError("TRANSFER_SAME_ACCOUNT", "Source and destination must differ", 400);
  const { coa: fromCoa } = await treasuryCoa(db, input.fromTreasuryAccountId);
  const { coa: toCoa } = await treasuryCoa(db, input.toTreasuryAccountId);
  return postJournal(db, actorId, {
    date: input.date,
    sourceType: "TRANSFER",
    narration: input.description ?? "Internal fund transfer",
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: toCoa.code, debit: input.amount, treasuryAccountId: input.toTreasuryAccountId },
      { accountId: fromCoa.code, credit: input.amount, treasuryAccountId: input.fromTreasuryAccountId },
    ],
  });
}

// --- Bank statement import + reconciliation (spec sections 15/16) ---------

export async function previewBankStatementImport(input: { rows: { date: string; valueDate?: string; description: string; reference?: string; debit?: number; credit?: number; balance?: number }[] }) {
  // Pure, DB-free preview — the UI shows this before anything is committed.
  return input.rows.map((row) => ({ ...row, debit: row.debit ?? 0, credit: row.credit ?? 0 }));
}

export async function commitBankStatementImport(db: PrismaClient, actorId: string, input: { treasuryAccountId: string; fileName: string; rows: { date: Date; valueDate?: Date; description: string; reference?: string; debit?: number; credit?: number; balance?: number }[] }) {
  await authorize(db, { actorId, permission: "bank_statement:import" });
  return db.$transaction(async (tx) => {
    // Duplicate-import protection: same treasury account + same (date, description,
    // debit, credit) combination already imported is skipped, not re-inserted.
    const existingKeys = new Set(
      (await tx.seeraBankStatementLine.findMany({ where: { import: { treasuryAccountId: input.treasuryAccountId } }, select: { date: true, description: true, debit: true, credit: true } })).map(
        (l) => `${l.date.toISOString()}|${l.description}|${l.debit}|${l.credit}`,
      ),
    );
    const rows = input.rows.filter((r) => !existingKeys.has(`${r.date.toISOString()}|${r.description}|${r.debit ?? 0}|${r.credit ?? 0}`));
    const skipped = input.rows.length - rows.length;
    const importRecord = await tx.seeraBankStatementImport.create({
      data: { treasuryAccountId: input.treasuryAccountId, fileName: input.fileName, importedById: actorId, status: "IMPORTED", lines: { create: rows.map((r) => ({ date: r.date, valueDate: r.valueDate, description: r.description, reference: r.reference, debit: r.debit ?? 0, credit: r.credit ?? 0, balance: r.balance })) } },
      include: { lines: true },
    });
    await recordAudit(tx, { actorId, action: "finance.bank_statement.imported", entityType: "SeeraBankStatementImport", entityId: importRecord.id, afterState: { treasuryAccountId: input.treasuryAccountId, imported: rows.length, skippedDuplicates: skipped } });
    return { importRecord, skippedDuplicates: skipped };
  });
}

// Human-confirmed matching only (spec section 16: "No uncertain auto-match").
// This returns candidate suggestions; nothing is written until confirmMatch().
export async function suggestBankMatches(db: PrismaClient, actorId: string, treasuryAccountId: string) {
  await authorize(db, { actorId, permission: "reconciliation:manage" });
  const [lines, journalLines] = await Promise.all([
    db.seeraBankStatementLine.findMany({ where: { matchStatus: "UNMATCHED", import: { treasuryAccountId } } }),
    db.seeraJournalLine.findMany({ where: { treasuryAccountId, journal: { status: "POSTED" } }, include: { journal: true } }),
  ]);
  const usedJournalLineIds = new Set((await db.seeraBankStatementLine.findMany({ where: { matchStatus: "MATCHED", matchedJournalLineId: { not: null } }, select: { matchedJournalLineId: true } })).map((l) => l.matchedJournalLineId));
  return lines.map((line) => {
    const amount = Number(line.debit) > 0 ? Number(line.debit) : Number(line.credit);
    const side = Number(line.debit) > 0 ? "credit" : "debit"; // a bank debit (money out) matches a credit-side treasury journal line, and vice versa
    const candidates = journalLines.filter((jl) => {
      if (usedJournalLineIds.has(jl.id)) return false;
      const jlAmount = side === "credit" ? Number(jl.credit) : Number(jl.debit);
      if (jlAmount !== amount) return false;
      const dayDiff = Math.abs(jl.journal.date.getTime() - line.date.getTime()) / 86_400_000;
      return dayDiff <= 3;
    });
    return { bankLineId: line.id, description: line.description, amount, date: line.date, candidates: candidates.map((c) => ({ journalLineId: c.id, journalId: c.journalId, narration: c.journal.narration, date: c.journal.date })) };
  });
}

export async function confirmBankMatch(db: PrismaClient, actorId: string, input: { bankLineId: string; journalLineId: string }) {
  await authorize(db, { actorId, permission: "reconciliation:manage" });
  return db.$transaction(async (tx) => {
    const line = await tx.seeraBankStatementLine.findUniqueOrThrow({ where: { id: input.bankLineId } });
    if (line.matchStatus === "MATCHED") throw new FoundationError("ALREADY_MATCHED", "Bank line is already matched", 409);
    const updated = await tx.seeraBankStatementLine.update({ where: { id: input.bankLineId }, data: { matchStatus: "MATCHED", matchedJournalLineId: input.journalLineId } });
    await recordAudit(tx, { actorId, action: "finance.reconciliation.matched", entityType: "SeeraBankStatementLine", entityId: updated.id, afterState: { journalLineId: input.journalLineId } });
    return updated;
  });
}

export async function unmatchBankLine(db: PrismaClient, actorId: string, bankLineId: string, reason: string) {
  await authorize(db, { actorId, permission: "reconciliation:manage" });
  const before = await db.seeraBankStatementLine.findUniqueOrThrow({ where: { id: bankLineId } });
  const updated = await db.seeraBankStatementLine.update({ where: { id: bankLineId }, data: { matchStatus: "UNMATCHED", matchedJournalLineId: null } });
  await recordAudit(db, { actorId, action: "finance.reconciliation.unmatched", entityType: "SeeraBankStatementLine", entityId: bankLineId, beforeState: { matchedJournalLineId: before.matchedJournalLineId }, afterState: { reason } });
  return updated;
}

export const treasuryNumber = financeNumberFor;
