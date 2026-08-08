import { Prisma } from "@prisma/client";
import { AppError, ConflictError } from "@/lib/errors";
import { assertLifecycleTransition } from "@/lib/enterprise-phase2/foundation";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3C, Wave 1 — Finance Foundation
 * domain rules. Reuses `assertLifecycleTransition` from the frozen Part 3A
 * foundation (same function Part 3B's `assertTransition` wraps) rather than
 * writing a second transition-checking implementation.
 */

export const FINANCE_ACCOUNT_CATEGORIES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export type FinanceAccountCategory = (typeof FINANCE_ACCOUNT_CATEGORIES)[number];

export const FINANCE_NORMAL_BALANCES = ["DEBIT", "CREDIT"] as const;
export type FinanceNormalBalance = (typeof FINANCE_NORMAL_BALANCES)[number];

/** The conventional normal balance for each account category — used only
 * to validate the caller's declared `normalBalance`, never to silently
 * override it, since a handful of contra accounts legitimately differ. */
export const CONVENTIONAL_NORMAL_BALANCE: Record<FinanceAccountCategory, FinanceNormalBalance> = {
  ASSET: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  REVENUE: "CREDIT",
};

export const FINANCE_CONFIGURATION_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["ACTIVE"],
};

export const FISCAL_YEAR_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  OPEN: ["CLOSED"],
  CLOSED: [],
};

export const FISCAL_PERIOD_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  OPEN: ["SOFT_CLOSED", "HARD_CLOSED"],
  SOFT_CLOSED: ["OPEN", "HARD_CLOSED"],
  HARD_CLOSED: ["ADJUSTMENT"],
  ADJUSTMENT: ["HARD_CLOSED"],
};

export const DIMENSION_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const FINANCE_ACCOUNT_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["ACTIVE", "INACTIVE"],
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export function assertFinanceTransition(current: string, next: string, graph: Readonly<Record<string, readonly string[]>>) {
  assertLifecycleTransition(current, next, graph);
}

export function assertNoOverlap(input: { startDate: Date; endDate: Date }, existing: Array<{ startDate: Date; endDate: Date }>) {
  const overlaps = existing.some((row) => input.startDate < row.endDate && row.startDate < input.endDate);
  if (overlaps) throw new ConflictError("The date range overlaps an existing fiscal period");
}

/** Breadth-first ancestor walk — same cycle-detection shape as
 * `wouldCreateCycle` in `lib/enterprise-network/partner-service.ts`,
 * generalized for any organization-scoped self-referencing dimension. */
export async function wouldCreateHierarchyCycle(
  findChildren: (parentId: string) => Promise<string[]>,
  parentId: string,
  childId: string,
): Promise<boolean> {
  const queue = [childId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(await findChildren(id)));
  }
  return false;
}

export function assertPostingEnabled(account: { status: string; postingEnabled: boolean }) {
  if (account.status !== "ACTIVE") throw new ConflictError("Only active accounts may be referenced for posting");
  if (!account.postingEnabled) throw new AppError("This account does not accept direct postings", 422, "ACCOUNT_NOT_POSTING_ENABLED");
}

// ---------------------------------------------------------------------------
// Part 3C, Stage A — Accounting Core.
// ---------------------------------------------------------------------------

export const FINANCE_JOURNAL_TYPES = [
  "GENERAL", "OPENING_BALANCE", "ADJUSTMENT", "REVERSAL", "CORRECTION",
  "AR_INVOICE", "AR_CREDIT_NOTE", "AR_RECEIPT",
  "AP_BILL", "AP_CREDIT", "AP_PAYMENT",
  "EXPENSE", "BANK_ADJUSTMENT",
  // Milestone 8 — Finance & Accounts (MUV OS). Additive only — nothing
  // above this line is changed. New journal types for the event-driven
  // postings and new domains this milestone adds (§8 Event-Driven
  // Accounting Architecture; Credit/Debit Notes; Fixed Assets; Cash).
  "SALES_REVENUE", "PURCHASE_RECEIPT", "MATERIAL_CONSUMPTION", "FINISHED_GOODS_TRANSFER",
  "MANUFACTURING_COST", "FIXED_ASSET_CAPITALIZATION", "DEPRECIATION", "ASSET_DISPOSAL",
  "CREDIT_NOTE", "DEBIT_NOTE", "CASH_VOUCHER", "WRITE_OFF",
] as const;
export type FinanceJournalType = (typeof FINANCE_JOURNAL_TYPES)[number];

/** Journal types a non-Founder actor may post into an ADJUSTMENT-state
 * (reopened) period. Ordinary GENERAL activity should not land in a period
 * that was reopened specifically for a correction. */
export const ADJUSTMENT_PERIOD_JOURNAL_TYPES = new Set<FinanceJournalType>(["ADJUSTMENT", "REVERSAL", "CORRECTION"]);

/**
 * DRAFT is the only editable state. POSTED is terminal — a reversal or
 * correction is always a *new* journal (Section 18), never a status change
 * on the original, so POSTED has no outgoing transition here.
 */
export const FINANCE_JOURNAL_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  REJECTED: ["DRAFT"],
  APPROVED: ["POSTED"],
  POSTED: [],
  CANCELLED: [],
};

export function sumDecimal(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total: Prisma.Decimal, value) => total.plus(value), new Prisma.Decimal(0));
}

/** Section 5, rules 4-8: at least two lines, each with exactly one positive
 * side (the database CHECK constraint on finance_journal_lines/
 * finance_ledger_entries enforces the same rule as defense in depth — this
 * is the structured, pre-database validation pass). */
export function assertValidJournalLines(lines: readonly { debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }[]) {
  if (lines.length < 2) throw new AppError("A journal must have at least two lines", 422, "JOURNAL_MINIMUM_LINES");
  for (const line of lines) {
    const debitPositive = line.debitAmount.greaterThan(0);
    const creditPositive = line.creditAmount.greaterThan(0);
    if (debitPositive === creditPositive) {
      throw new AppError("Each journal line must have exactly one positive side (debit xor credit)", 422, "JOURNAL_LINE_INVALID_SIDE");
    }
    if (line.debitAmount.lessThan(0) || line.creditAmount.lessThan(0)) {
      throw new AppError("Negative journal-line amounts are prohibited", 422, "JOURNAL_LINE_NEGATIVE");
    }
  }
}

/** Exact-decimal balance check — total debit must equal total credit using
 * `Prisma.Decimal` arithmetic throughout; never coerced to `number`. */
export function assertJournalBalances(lines: readonly { debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }[]) {
  const totalDebit = sumDecimal(lines.map((line) => line.debitAmount));
  const totalCredit = sumDecimal(lines.map((line) => line.creditAmount));
  if (!totalDebit.equals(totalCredit)) {
    throw new AppError(`Journal does not balance: total debit ${totalDebit.toString()} does not equal total credit ${totalCredit.toString()}`, 422, "JOURNAL_UNBALANCED");
  }
  return { totalDebit, totalCredit };
}

export function assertPeriodAcceptsPosting(period: { status: string }, journalType: FinanceJournalType) {
  if (period.status === "HARD_CLOSED") {
    throw new ConflictError("This fiscal period is hard-closed and does not accept postings");
  }
  if (period.status === "ADJUSTMENT" && !ADJUSTMENT_PERIOD_JOURNAL_TYPES.has(journalType)) {
    throw new ConflictError("This fiscal period is open only for adjustment/reversal/correction journals");
  }
  // OPEN and SOFT_CLOSED both accept ordinary posting — SOFT_CLOSED is a
  // soft warning boundary for period-end review, not a posting block
  // (only HARD_CLOSED and non-adjustment-typed ADJUSTMENT postings reject).
}
