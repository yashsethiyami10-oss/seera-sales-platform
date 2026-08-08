import { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancialReportingPrincipal } from "./context";
import { sumDecimal } from "./domain";

/**
 * Enterprise Finance Platform (Part 3C, Stage A) — General Ledger inquiry
 * and Trial Balance (Sections 16-17). Every query reads only from
 * `FinanceLedgerEntry`, which the Posting Engine is the sole writer of —
 * there is structurally no draft-journal or mutable-source dependency here.
 * Aggregation uses Prisma's native `groupBy`/`_sum` (real database
 * aggregation, exact Decimal) rather than summing in application code.
 */

const MAX_PAGE_SIZE = 200;

/** Clamps both bounds so invalid input (zero/negative page or pageSize)
 * degrades to a safe, still-valid Prisma `skip`/`take` rather than
 * producing a negative `take` (which Prisma itself rejects) or an
 * unbounded fetch. */
function boundedPage(page = 1, pageSize = 50) {
  const safePage = Number.isFinite(page) ? Math.max(Math.trunc(page), 1) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(Math.max(Math.trunc(pageSize), 1), MAX_PAGE_SIZE) : 50;
  return { skip: (safePage - 1) * safePageSize, take: safePageSize, page: safePage, pageSize: safePageSize };
}

export async function getAccountLedger(accountId: string, filters: { from?: Date; to?: Date; page?: number; pageSize?: number } = {}) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const where: Prisma.FinanceLedgerEntryWhereInput = {
      organizationKey: principal.organizationKey, accountId,
      postingDate: filters.from || filters.to ? { gte: filters.from, lt: filters.to } : undefined,
    };
    const { skip, take } = boundedPage(filters.page, filters.pageSize);
    const [total, items] = await Promise.all([
      tx.financeLedgerEntry.count({ where }),
      tx.financeLedgerEntry.findMany({ where, orderBy: [{ postingDate: "asc" }, { id: "asc" }], skip, take }),
    ]);
    return { items, total };
  });
}

/** Repaired during the Part 3C independent-audit repair pass: previously
 * unbounded (no `take` at all), unlike every sibling function in this
 * file. Now uses the same `boundedPage`/count-and-findMany pattern as
 * `getAccountLedger`/`getFiscalPeriodLedger`, with deterministic ordering
 * and an explicit total so a caller can tell whether more pages exist. */
export async function getJournalLedger(journalId: string, filters: { page?: number; pageSize?: number } = {}) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const where: Prisma.FinanceLedgerEntryWhereInput = { organizationKey: principal.organizationKey, journalId };
    const { skip, take, page, pageSize } = boundedPage(filters.page, filters.pageSize);
    const [total, items] = await Promise.all([
      tx.financeLedgerEntry.count({ where }),
      tx.financeLedgerEntry.findMany({ where, orderBy: [{ id: "asc" }], skip, take }),
    ]);
    return { items, total, page, pageSize };
  });
}

export async function getFiscalPeriodLedger(fiscalPeriodId: string, filters: { page?: number; pageSize?: number } = {}) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const where: Prisma.FinanceLedgerEntryWhereInput = { organizationKey: principal.organizationKey, fiscalPeriodId };
    const { skip, take } = boundedPage(filters.page, filters.pageSize);
    const [total, items] = await Promise.all([
      tx.financeLedgerEntry.count({ where }),
      tx.financeLedgerEntry.findMany({ where, orderBy: [{ postingDate: "asc" }, { id: "asc" }], skip, take }),
    ]);
    return { items, total };
  });
}

/** Repaired during the Part 3C independent-audit repair pass: previously
 * unbounded, matching the same fix and rationale as `getJournalLedger`. */
export async function getSourceLedger(sourceType: string, sourceId: string, filters: { page?: number; pageSize?: number } = {}) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const where: Prisma.FinanceLedgerEntryWhereInput = { organizationKey: principal.organizationKey, sourceType, sourceId };
    const { skip, take, page, pageSize } = boundedPage(filters.page, filters.pageSize);
    const [total, items] = await Promise.all([
      tx.financeLedgerEntry.count({ where }),
      tx.financeLedgerEntry.findMany({ where, orderBy: [{ postingDate: "asc" }, { id: "asc" }], skip, take }),
    ]);
    return { items, total, page, pageSize };
  });
}

export async function getCostCenterLedger(costCenterId: string, filters: { page?: number; pageSize?: number } = {}) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const where: Prisma.FinanceLedgerEntryWhereInput = { organizationKey: principal.organizationKey, costCenterId };
    const { skip, take } = boundedPage(filters.page, filters.pageSize);
    const [total, items] = await Promise.all([
      tx.financeLedgerEntry.count({ where }),
      tx.financeLedgerEntry.findMany({ where, orderBy: [{ postingDate: "asc" }, { id: "asc" }], skip, take }),
    ]);
    return { items, total };
  });
}

export async function getProfitCenterLedger(profitCenterId: string, filters: { page?: number; pageSize?: number } = {}) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const where: Prisma.FinanceLedgerEntryWhereInput = { organizationKey: principal.organizationKey, profitCenterId };
    const { skip, take } = boundedPage(filters.page, filters.pageSize);
    const [total, items] = await Promise.all([
      tx.financeLedgerEntry.count({ where }),
      tx.financeLedgerEntry.findMany({ where, orderBy: [{ postingDate: "asc" }, { id: "asc" }], skip, take }),
    ]);
    return { items, total };
  });
}

export type TrialBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  category: string;
  openingDebit: Prisma.Decimal;
  openingCredit: Prisma.Decimal;
  periodDebit: Prisma.Decimal;
  periodCredit: Prisma.Decimal;
  closingDebit: Prisma.Decimal;
  closingCredit: Prisma.Decimal;
};

/** Trial Balance as of a fiscal period — opening = all posted activity
 * strictly before the period's start date; period = activity within
 * [startDate, endDate); closing = opening net + period net, expressed back
 * as a debit or credit per the account's resulting balance. */
export async function getTrialBalance(fiscalPeriodId: string): Promise<{ rows: TrialBalanceRow[]; balanced: boolean }> {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const period = await tx.financeFiscalPeriod.findFirst({ where: { id: fiscalPeriodId, organizationKey: principal.organizationKey } });
    if (!period) throw new NotFoundError("Fiscal period");

    const [openingSums, periodSums, accounts] = await Promise.all([
      tx.financeLedgerEntry.groupBy({
        by: ["accountId"], where: { organizationKey: principal.organizationKey, postingDate: { lt: period.startDate } },
        _sum: { debitAmount: true, creditAmount: true },
      }),
      tx.financeLedgerEntry.groupBy({
        by: ["accountId"], where: { organizationKey: principal.organizationKey, postingDate: { gte: period.startDate, lt: period.endDate } },
        _sum: { debitAmount: true, creditAmount: true },
      }),
      tx.financeAccount.findMany({ where: { organizationKey: principal.organizationKey }, orderBy: [{ accountCode: "asc" }], take: 5000 }),
    ]);

    const openingByAccount = new Map(openingSums.map((row) => [row.accountId, row._sum]));
    const periodByAccount = new Map(periodSums.map((row) => [row.accountId, row._sum]));
    const zero = new Prisma.Decimal(0);

    const rows: TrialBalanceRow[] = [];
    for (const account of accounts) {
      const opening = openingByAccount.get(account.id);
      const activity = periodByAccount.get(account.id);
      const openingDebit = opening?.debitAmount ?? zero;
      const openingCredit = opening?.creditAmount ?? zero;
      const periodDebit = activity?.debitAmount ?? zero;
      const periodCredit = activity?.creditAmount ?? zero;
      if (openingDebit.eq(0) && openingCredit.eq(0) && periodDebit.eq(0) && periodCredit.eq(0)) continue;

      const net = openingDebit.plus(periodDebit).minus(openingCredit).minus(periodCredit);
      rows.push({
        accountId: account.id, accountCode: account.accountCode, accountName: account.name, category: account.category,
        openingDebit, openingCredit, periodDebit, periodCredit,
        closingDebit: net.greaterThan(0) ? net : zero,
        closingCredit: net.lessThan(0) ? net.abs() : zero,
      });
    }

    const totalClosingDebit = sumDecimal(rows.map((row) => row.closingDebit));
    const totalClosingCredit = sumDecimal(rows.map((row) => row.closingCredit));
    const balanced = totalClosingDebit.equals(totalClosingCredit);
    if (!balanced) {
      // A structural integrity failure, not a user input error — every
      // individual posted journal is balanced by construction, so an
      // unbalanced trial balance would indicate corrupted ledger data.
      throw new AppError("Trial balance does not balance — ledger data integrity issue", 500, "TRIAL_BALANCE_INTEGRITY_ERROR");
    }

    return { rows, balanced };
  });
}

/** Total debit/credit activity within a fiscal period, grouped by journal
 * type — a quick "what kind of activity happened this period" summary
 * (Section 23's Period Activity Summary), derived the same way as Trial
 * Balance: real database aggregation over immutable ledger entries only.
 *
 * Repaired during the Part 3C independent-audit repair pass: the original
 * implementation fetched up to 5000 raw ledger entries (joined to their
 * journal for `journalType`) and reduced them in application code —
 * contrary to this very doc comment, and a real defect, since any period
 * with more than 5000 posted ledger entries produced a silently
 * incomplete, unordered summary. `journalType` is now denormalized
 * directly onto `FinanceLedgerEntry` (see the
 * `20260727191000_..._ledger_journal_type` migration), so this can use a
 * real `groupBy` — Prisma cannot group by a related model's field
 * directly, which is why the denormalization was necessary. The result
 * set is bounded by the number of distinct journal types that exist
 * (currently under a dozen, per `FinanceJournalType` in domain.ts), not by
 * raw ledger-row count, so no period-size ceiling can ever truncate it. */
export async function getPeriodActivitySummary(fiscalPeriodId: string) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const period = await tx.financeFiscalPeriod.findFirst({ where: { id: fiscalPeriodId, organizationKey: principal.organizationKey } });
    if (!period) throw new NotFoundError("Fiscal period");

    const grouped = await tx.financeLedgerEntry.groupBy({
      by: ["journalType"],
      where: { organizationKey: principal.organizationKey, fiscalPeriodId },
      _sum: { debitAmount: true, creditAmount: true },
      _count: { _all: true },
      orderBy: { journalType: "asc" },
    });

    const journalCount = await tx.financeJournal.count({ where: { organizationKey: principal.organizationKey, fiscalPeriodId, status: "POSTED" } });

    return {
      fiscalPeriodId: period.id, periodName: period.name, journalCount,
      byJournalType: grouped.map((row) => ({
        journalType: row.journalType,
        debit: row._sum.debitAmount ?? new Prisma.Decimal(0),
        credit: row._sum.creditAmount ?? new Prisma.Decimal(0),
        count: row._count._all,
      })),
    };
  });
}
