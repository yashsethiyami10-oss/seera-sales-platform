import type { JournalSourceType, Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { financeNumberFor } from "./numbering";

export type JournalLineInput = {
  accountId: string; // SeeraChartOfAccount.code (the human-governed, stable identifier — never the cuid)
  debit?: number;
  credit?: number;
  partyType?: string;
  partyId?: string;
  dimensionId?: string;
  treasuryAccountId?: string;
  description?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function assertBalanced(lines: JournalLineInput[]) {
  if (lines.length < 2) throw new FoundationError("JOURNAL_MIN_LINES", "A journal requires at least two lines", 400);
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    const debit = round2(line.debit ?? 0);
    const credit = round2(line.credit ?? 0);
    if (debit < 0 || credit < 0) throw new FoundationError("JOURNAL_NEGATIVE_AMOUNT", "Journal line amounts must not be negative", 400);
    if (debit > 0 && credit > 0) throw new FoundationError("JOURNAL_LINE_BOTH_SIDES", "A journal line cannot be both debit and credit", 400);
    if (debit === 0 && credit === 0) throw new FoundationError("JOURNAL_LINE_EMPTY", "A journal line must have a nonzero debit or credit", 400);
    debitTotal += debit;
    creditTotal += credit;
  }
  if (round2(debitTotal) !== round2(creditTotal)) throw new FoundationError("JOURNAL_IMBALANCED", `Total debits (${debitTotal}) must equal total credits (${creditTotal})`, 400);
  return { debitTotal: round2(debitTotal), creditTotal: round2(creditTotal) };
}

// Monthly accounting periods, auto-vivified on first use — Founder/Accounts
// never has to pre-create a period before posting; they only ever interact
// with locking/reopening one (period-service.ts).
export async function ensurePeriodForDate(db: Prisma.TransactionClient | PrismaClient, date: Date) {
  const existing = await db.seeraAccountingPeriod.findFirst({ where: { startsAt: { lte: date }, endsAt: { gt: date } } });
  if (existing) return existing;
  const startsAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const code = `${startsAt.getUTCFullYear()}-${String(startsAt.getUTCMonth() + 1).padStart(2, "0")}`;
  return db.seeraAccountingPeriod.upsert({ where: { code }, update: {}, create: { code, startsAt, endsAt } });
}

export type PostJournalInput = {
  date: Date;
  sourceType: JournalSourceType;
  sourceId?: string;
  narration: string;
  lines: JournalLineInput[];
  idempotencyKey: string;
  reason?: string;
};

// The within-transaction core, usable both by postJournal() below (which
// wraps it in its own $transaction) and by other services' hooks that need to
// post a journal as part of a transaction they already own (e.g. Sales OS
// invoice issuance) — Prisma does not support nesting $transaction calls, so
// this variant is required rather than every caller re-wrapping.
export async function postJournalInTx(tx: Prisma.TransactionClient, actorId: string, input: PostJournalInput) {
  const { debitTotal } = assertBalanced(input.lines);
  const existing = await tx.seeraJournalEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } });
  if (existing) return existing;

  const period = await ensurePeriodForDate(tx, input.date);
  if (period.lockedAt) throw new FoundationError("PERIOD_LOCKED", `Accounting period ${period.code} is locked — reopen it first`, 409);

  const journal = await tx.seeraJournalEntry.create({
    data: {
      journalNumber: financeNumberFor("JE", input.idempotencyKey),
      date: input.date,
      accountingPeriodId: period.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      narration: input.narration,
      status: "POSTED",
      actorId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      postedAt: new Date(),
      lines: { create: input.lines.map((line) => ({ accountId: line.accountId, debit: line.debit ?? 0, credit: line.credit ?? 0, partyType: line.partyType, partyId: line.partyId, dimensionId: line.dimensionId, treasuryAccountId: line.treasuryAccountId, description: line.description })) },
    },
    include: { lines: true },
  });
  await recordAudit(tx, { actorId, action: "finance.journal.posted", entityType: "SeeraJournalEntry", entityId: journal.id, afterState: { sourceType: input.sourceType, sourceId: input.sourceId, total: debitTotal, lines: input.lines.length } });
  return journal;
}

export async function postJournal(db: PrismaClient, actorId: string, input: PostJournalInput) {
  // Manual journals are the exceptional/restricted path (spec section 33); every
  // other sourceType is an automatic posting triggered by an already-authorized
  // business event (invoice issuance, payment verification, expense approval,
  // vendor bill approval, etc.) whose own action already required its own
  // permission — it is not re-gated behind journal:post a second time.
  if (input.sourceType === "MANUAL") await authorize(db, { actorId, permission: "journal:post" });
  return db.$transaction((tx) => postJournalInTx(tx, actorId, input));
}

// Mirrors the existing party-ledger reverseLedgerEntry() segregation-of-duties
// pattern (lib/sales-distribution/financial-service.ts): the poster of a
// journal cannot also be the one who reverses it, and posted history is never
// deleted or edited — only offset by an equal-and-opposite reversal journal.
export async function reverseJournal(db: PrismaClient, actorId: string, journalId: string, input: { reason: string; idempotencyKey: string; approverId: string }) {
  await authorize(db, { actorId, permission: "journal:reverse" });
  if (input.approverId !== actorId) throw new FoundationError("APPROVER_IDENTITY_MISMATCH", "The signed-in approver must own the decision", 403);
  return db.$transaction(async (tx) => {
    const original = await tx.seeraJournalEntry.findUniqueOrThrow({ where: { id: journalId }, include: { lines: true } });
    if (original.actorId === actorId) throw new FoundationError("JOURNAL_SELF_REVERSAL_DENIED", "Independent approval is required for reversal", 403);
    if (original.status !== "POSTED") throw new FoundationError("JOURNAL_NOT_REVERSIBLE", "Only posted journals may be reversed", 409);
    const existing = await tx.seeraJournalEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const period = await ensurePeriodForDate(tx, original.date);
    if (period.lockedAt) throw new FoundationError("PERIOD_LOCKED", `Accounting period ${period.code} is locked — reopen it first`, 409);

    const reversal = await tx.seeraJournalEntry.create({
      data: {
        journalNumber: financeNumberFor("RV", input.idempotencyKey),
        date: new Date(),
        accountingPeriodId: (await ensurePeriodForDate(tx, new Date())).id,
        sourceType: "REVERSAL",
        sourceId: original.id,
        narration: `Reversal of ${original.journalNumber}: ${input.reason}`,
        status: "POSTED",
        actorId,
        approverId: actorId,
        reason: input.reason,
        originalJournalId: original.id,
        idempotencyKey: input.idempotencyKey,
        postedAt: new Date(),
        lines: { create: original.lines.map((line) => ({ accountId: line.accountId, debit: line.credit, credit: line.debit, partyType: line.partyType, partyId: line.partyId, dimensionId: line.dimensionId, treasuryAccountId: line.treasuryAccountId, description: line.description })) },
      },
      include: { lines: true },
    });
    await tx.seeraJournalEntry.update({ where: { id: original.id }, data: { status: "REVERSED", reversedAt: new Date() } });
    await recordAudit(tx, { actorId, action: "finance.journal.reversed", entityType: "SeeraJournalEntry", entityId: original.id, afterState: { reversalId: reversal.id, reason: input.reason } });
    return reversal;
  });
}

export async function generalLedger(db: PrismaClient, actorId: string, input: { accountId: string; from?: Date; to?: Date }) {
  await authorize(db, { actorId, permission: "gl:view" });
  const lines = await db.seeraJournalLine.findMany({
    where: { accountId: input.accountId, journal: { status: "POSTED", date: { gte: input.from, lte: input.to } } },
    include: { journal: true },
    orderBy: [{ journal: { date: "asc" } }, { journal: { createdAt: "asc" } }],
  });
  let running = 0;
  const entries = lines.map((line) => {
    running += Number(line.debit) - Number(line.credit);
    return { journalId: line.journal.id, journalNumber: line.journal.journalNumber, date: line.journal.date, sourceType: line.journal.sourceType, sourceId: line.journal.sourceId, narration: line.journal.narration, debit: Number(line.debit), credit: Number(line.credit), runningBalance: running, partyType: line.partyType, partyId: line.partyId };
  });
  return { entries, closingBalance: running };
}

// Accounting Impact Panel (spec §22) — the full debit/credit breakdown of one
// journal, with Chart of Accounts names resolved, for a transaction detail
// screen to render read-only under an "ACCOUNTING IMPACT" heading.
export async function journalDetail(db: PrismaClient, actorId: string, journalId: string) {
  await authorize(db, { actorId, permission: "gl:view" });
  const journal = await db.seeraJournalEntry.findUniqueOrThrow({ where: { id: journalId }, include: { lines: true } });
  const accounts = await db.seeraChartOfAccount.findMany({ where: { code: { in: journal.lines.map((l) => l.accountId) } } });
  const nameByCode = new Map(accounts.map((a) => [a.code, a.name]));
  return { ...journal, lines: journal.lines.map((l) => ({ ...l, accountName: nameByCode.get(l.accountId) ?? l.accountId, debit: Number(l.debit), credit: Number(l.credit) })) };
}

// Recent Journals feed (spec's Accounting Impact Panel §4) — a single,
// source-type-agnostic list covering Money In/Out, Transfers, Sales Invoices,
// Credit/Debit Notes, Payroll, Capital/Drawings, Asset purchases and Manual
// Journals alike, since they are all just journals with a different
// sourceType. Expense/Vendor Bill/Loan rows link to journalDetail directly
// via their own stored journalId instead of searching this feed.
export async function recentJournals(db: PrismaClient, actorId: string, limit = 30) {
  await authorize(db, { actorId, permission: "gl:view" });
  const journals = await db.seeraJournalEntry.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { lines: true } });
  return journals.map((j) => ({ id: j.id, journalNumber: j.journalNumber, date: j.date, sourceType: j.sourceType, narration: j.narration, status: j.status, total: j.lines.reduce((s, l) => s + Number(l.debit), 0) }));
}

export async function trialBalance(db: PrismaClient, actorId: string, asOf: Date) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const lines = await db.seeraJournalLine.findMany({ where: { journal: { status: "POSTED", date: { lte: asOf } } }, select: { accountId: true, debit: true, credit: true } });
  const accounts = await db.seeraChartOfAccount.findMany({ orderBy: { code: "asc" } });
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const bucket = totals.get(line.accountId) ?? { debit: 0, credit: 0 };
    bucket.debit += Number(line.debit);
    bucket.credit += Number(line.credit);
    totals.set(line.accountId, bucket);
  }
  const rows = accounts
    .map((account) => {
      const t = totals.get(account.code) ?? { debit: 0, credit: 0 };
      const net = t.debit - t.credit;
      return { code: account.code, name: account.name, type: account.type, debit: t.debit, credit: t.credit, closingDebit: net > 0 ? net : 0, closingCredit: net < 0 ? -net : 0 };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);
  const totalDebit = round2(rows.reduce((s, r) => s + r.closingDebit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.closingCredit, 0));
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}
