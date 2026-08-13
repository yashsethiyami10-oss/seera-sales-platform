import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournal, postJournalInTx } from "./journal-service";
import { financeNumberFor } from "./numbering";

export async function createLoan(db: PrismaClient, actorId: string, input: { lenderName: string; principal: number; interestRate?: number; startDate: Date; documentFileId?: string }) {
  await authorize(db, { actorId, permission: "loan:manage" });
  // outstanding starts at 0, not principal: a sanctioned loan isn't actually
  // owed until money is disbursed (recordLoanDisbursement below is what grows
  // it — tranched disbursements are common and principal alone would double-count).
  const loan = await db.seeraLoan.create({ data: { lenderName: input.lenderName, principal: input.principal, outstanding: 0, interestRate: input.interestRate, startDate: input.startDate, documentFileId: input.documentFileId } });
  await recordAudit(db, { actorId, action: "finance.loan.created", entityType: "SeeraLoan", entityId: loan.id, afterState: { lenderName: input.lenderName, principal: input.principal } });
  return loan;
}

export async function recordLoanDisbursement(db: PrismaClient, actorId: string, input: { loanId: string; amount: number; date: Date; treasuryAccountId: string; treasuryAccountCoaCode: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "loan:manage" });
  return db.$transaction(async (tx) => {
    const loan = await tx.seeraLoan.findUniqueOrThrow({ where: { id: input.loanId } });
    const txn = await tx.seeraLoanTransaction.create({ data: { loanId: input.loanId, type: "DISBURSEMENT", amount: input.amount, date: input.date, treasuryAccountId: input.treasuryAccountId, actorId, idempotencyKey: input.idempotencyKey } });
    const journal = await postJournalInTx(tx, actorId, { date: input.date, sourceType: "LOAN_RECEIVED", sourceId: loan.id, narration: `Loan received — ${loan.lenderName}`, idempotencyKey: `${input.idempotencyKey}:journal`, lines: [{ accountId: input.treasuryAccountCoaCode, debit: input.amount, treasuryAccountId: input.treasuryAccountId }, { accountId: "2050", credit: input.amount, partyType: "LENDER", partyId: loan.id }] });
    await tx.seeraLoanTransaction.update({ where: { id: txn.id }, data: { journalId: journal.id } });
    await tx.seeraLoan.update({ where: { id: loan.id }, data: { outstanding: { increment: input.amount } } });
    await recordAudit(tx, { actorId, action: "finance.loan.disbursed", entityType: "SeeraLoan", entityId: loan.id, afterState: { amount: input.amount } });
    return txn;
  });
}

// Principal and interest are always split into two lines — interest is a real
// P&L expense (5180), principal repayment only reduces the liability, per
// spec section 37 ("Loan received != income", implying repayment split
// mirrors that same non-P&L treatment for the principal portion).
export async function recordLoanRepayment(db: PrismaClient, actorId: string, input: { loanId: string; principalAmount: number; interestAmount: number; date: Date; treasuryAccountId: string; treasuryAccountCoaCode: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "loan:manage" });
  if (input.principalAmount < 0 || input.interestAmount < 0) throw new FoundationError("INVALID_AMOUNT", "Amounts must not be negative", 400);
  return db.$transaction(async (tx) => {
    const loan = await tx.seeraLoan.findUniqueOrThrow({ where: { id: input.loanId } });
    if (input.principalAmount > Number(loan.outstanding)) throw new FoundationError("REPAYMENT_EXCEEDS_OUTSTANDING", "Principal repayment exceeds outstanding balance", 400);
    const total = input.principalAmount + input.interestAmount;
    const lines = [] as { accountId: string; debit?: number; credit?: number; treasuryAccountId?: string; partyType?: string; partyId?: string }[];
    if (input.principalAmount > 0) lines.push({ accountId: "2050", debit: input.principalAmount, partyType: "LENDER", partyId: loan.id });
    if (input.interestAmount > 0) lines.push({ accountId: "5180", debit: input.interestAmount });
    lines.push({ accountId: input.treasuryAccountCoaCode, credit: total, treasuryAccountId: input.treasuryAccountId });
    const journal = await postJournalInTx(tx, actorId, { date: input.date, sourceType: "LOAN_REPAYMENT", sourceId: loan.id, narration: `Loan repayment — ${loan.lenderName}`, idempotencyKey: `${input.idempotencyKey}:journal`, lines });
    const txn = await tx.seeraLoanTransaction.create({ data: { loanId: input.loanId, type: "PRINCIPAL_REPAYMENT", amount: total, date: input.date, treasuryAccountId: input.treasuryAccountId, journalId: journal.id, actorId, idempotencyKey: input.idempotencyKey } });
    const outstanding = Number(loan.outstanding) - input.principalAmount;
    await tx.seeraLoan.update({ where: { id: loan.id }, data: { outstanding, status: outstanding <= 0 ? "CLOSED" : "ACTIVE" } });
    await recordAudit(tx, { actorId, action: "finance.loan.repaid", entityType: "SeeraLoan", entityId: loan.id, afterState: { principalAmount: input.principalAmount, interestAmount: input.interestAmount, outstanding } });
    return txn;
  });
}

export async function loanOutstandingReport(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "loan:manage" });
  return db.seeraLoan.findMany({ include: { transactions: { orderBy: { date: "desc" } } }, orderBy: { startDate: "desc" } });
}

export async function loanLedger(db: PrismaClient, actorId: string, loanId: string) {
  await authorize(db, { actorId, permission: "loan:manage" });
  const loan = await db.seeraLoan.findUniqueOrThrow({ where: { id: loanId }, include: { transactions: { orderBy: { date: "asc" } } } });
  const totalDisbursed = loan.transactions.filter((t) => t.type === "DISBURSEMENT").reduce((s, t) => s + Number(t.amount), 0);
  const totalRepaid = loan.transactions.filter((t) => t.type === "PRINCIPAL_REPAYMENT").reduce((s, t) => s + Number(t.amount), 0);
  return { loan, totalDisbursed, totalRepaid };
}

export async function closeLoan(db: PrismaClient, actorId: string, loanId: string) {
  await authorize(db, { actorId, permission: "loan:manage" });
  const loan = await db.seeraLoan.findUniqueOrThrow({ where: { id: loanId } });
  if (Number(loan.outstanding) > 0) throw new FoundationError("LOAN_HAS_OUTSTANDING_BALANCE", "Loan still has an outstanding balance", 409);
  const updated = await db.seeraLoan.update({ where: { id: loanId }, data: { status: "CLOSED" } });
  await recordAudit(db, { actorId, action: "finance.loan.closed", entityType: "SeeraLoan", entityId: loanId });
  return updated;
}

// Cash/bank asset purchase only for V1 (spec section 38: "do not overbuild
// asset ERP") — a vendor-bill-funded asset purchase can be recorded as a
// normal Vendor Bill against the Fixed Assets account (1600) instead.
export async function createFixedAsset(db: PrismaClient, actorId: string, input: { name: string; category: string; purchaseDate: Date; cost: number; vendorId?: string; location?: string; documentFileId?: string; usefulLifeMonths?: number; residualValue?: number; treasuryAccountId: string; treasuryAccountCoaCode: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "asset:manage" });
  return db.$transaction(async (tx) => {
    const asset = await tx.seeraFixedAsset.create({ data: { assetCode: financeNumberFor("FA", input.idempotencyKey), name: input.name, category: input.category, purchaseDate: input.purchaseDate, cost: input.cost, vendorId: input.vendorId, location: input.location, documentFileId: input.documentFileId, usefulLifeMonths: input.usefulLifeMonths, residualValue: input.residualValue, actorId } });
    const journal = await postJournalInTx(tx, actorId, { date: input.purchaseDate, sourceType: "ASSET_PURCHASE", sourceId: asset.id, narration: `Fixed asset purchased — ${input.name}`, idempotencyKey: `${input.idempotencyKey}:journal`, lines: [{ accountId: "1600", debit: input.cost }, { accountId: input.treasuryAccountCoaCode, credit: input.cost, treasuryAccountId: input.treasuryAccountId }] });
    const posted = await tx.seeraFixedAsset.update({ where: { id: asset.id }, data: { journalId: journal.id } });
    await recordAudit(tx, { actorId, action: "finance.asset.created", entityType: "SeeraFixedAsset", entityId: asset.id, afterState: { name: input.name, cost: input.cost } });
    return posted;
  });
}

// Straight-line NBV only when the Founder has actually configured a useful
// life — otherwise labelled clearly rather than silently showing cost as NBV
// (spec §8/§38: "Do not invent depreciation engine if not currently implemented").
export async function assetRegister(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "asset:manage" });
  const assets = await db.seeraFixedAsset.findMany({ orderBy: { purchaseDate: "desc" } });
  const now = new Date();
  return assets.map((a) => {
    if (!a.usefulLifeMonths) return { ...a, netBookValue: null, netBookValueNote: "DEPRECIATION CONFIGURATION / FUTURE CALCULATION REQUIRED" };
    const monthsElapsed = Math.max(0, Math.min(a.usefulLifeMonths, Math.floor((now.getTime() - a.purchaseDate.getTime()) / (30.44 * 86_400_000))));
    const depreciable = Number(a.cost) - Number(a.residualValue ?? 0);
    const accumulated = (depreciable * monthsElapsed) / a.usefulLifeMonths;
    return { ...a, netBookValue: Number(a.cost) - accumulated, accumulatedDepreciation: accumulated, netBookValueNote: null };
  });
}
