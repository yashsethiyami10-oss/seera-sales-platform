import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";
import { assertFinanceTransition, assertNoOverlap, FISCAL_PERIOD_TRANSITIONS, FISCAL_YEAR_TRANSITIONS } from "./domain";
import { fiscalYearInput } from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Wave 1) — fiscal years and periods.
 * Overlap is checked at the Business Service layer inside a serializable
 * transaction (the same precedent `assignPartnerParent` in
 * `lib/enterprise-network/partner-service.ts` already established for
 * NetworkPartnerHierarchy) rather than a Postgres exclusion constraint,
 * since no other part of this schema uses `btree_gist` and introducing it
 * here would be new infrastructure for one table.
 */

export async function createFiscalYearWithPeriods(input: unknown) {
  const data = fiscalYearInput.parse(input);
  if (data.endDate <= data.startDate) throw new AppError("endDate must be after startDate", 422, "INVALID_RANGE");
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);

  return enterpriseTransaction(async (tx) => {
    const existingYears = await tx.financeFiscalYear.findMany({
      where: { organizationKey: principal.organizationKey },
      select: { startDate: true, endDate: true },
    });
    assertNoOverlap({ startDate: data.startDate, endDate: data.endDate }, existingYears);

    const fiscalYear = await tx.financeFiscalYear.create({
      data: {
        organizationKey: principal.organizationKey,
        code: data.code,
        startDate: data.startDate,
        endDate: data.endDate,
        createdById: principal.id,
      },
    });

    const totalMs = data.endDate.getTime() - data.startDate.getTime();
    const periodMs = Math.floor(totalMs / data.periodCount);
    const periods = Array.from({ length: data.periodCount }, (_, index) => {
      const start = new Date(data.startDate.getTime() + index * periodMs);
      const end = index === data.periodCount - 1 ? data.endDate : new Date(data.startDate.getTime() + (index + 1) * periodMs);
      return {
        organizationKey: principal.organizationKey,
        fiscalYearId: fiscalYear.id,
        periodNumber: index + 1,
        name: `${data.code}-P${String(index + 1).padStart(2, "0")}`,
        startDate: start,
        endDate: end,
      };
    });
    await tx.financeFiscalPeriod.createMany({ data: periods });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FISCAL_YEAR_CREATED",
      entityType: "FinanceFiscalYear", entityId: fiscalYear.id,
      description: `Fiscal year ${fiscalYear.code} created with ${data.periodCount} periods`,
      next: { code: fiscalYear.code, periodCount: data.periodCount },
    });

    return tx.financeFiscalYear.findUniqueOrThrow({ where: { id: fiscalYear.id }, include: { periods: { orderBy: { periodNumber: "asc" } } } });
  });
}

export async function closeFiscalYear(fiscalYearId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PERIODS_CLOSE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeFiscalYear.findFirst({ where: { id: fiscalYearId, organizationKey: principal.organizationKey }, include: { periods: true } });
    if (!current) throw new NotFoundError("Fiscal year");
    requireVersion(current.version, expectedVersion);
    assertFinanceTransition(current.status, "CLOSED", FISCAL_YEAR_TRANSITIONS);
    if (current.periods.some((period) => period.status !== "HARD_CLOSED")) {
      throw new ConflictError("All periods must be hard-closed before the fiscal year can be closed");
    }
    const closed = await tx.financeFiscalYear.update({ where: { id: current.id }, data: { status: "CLOSED", version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FISCAL_YEAR_CLOSED",
      entityType: "FinanceFiscalYear", entityId: closed.id,
      description: `Fiscal year ${closed.code} closed`,
      previous: { status: current.status }, next: { status: closed.status },
    });
    return closed;
  });
}

async function loadPeriod(tx: EnterpriseTx, organizationKey: string, periodId: string) {
  const period = await tx.financeFiscalPeriod.findFirst({ where: { id: periodId, organizationKey } });
  if (!period) throw new NotFoundError("Fiscal period");
  return period;
}

export async function softClosePeriod(periodId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PERIODS_CLOSE);
  return enterpriseTransaction(async (tx) => {
    const current = await loadPeriod(tx, principal.organizationKey, periodId);
    requireVersion(current.version, expectedVersion);
    assertFinanceTransition(current.status, "SOFT_CLOSED", FISCAL_PERIOD_TRANSITIONS);
    const updated = await tx.financeFiscalPeriod.update({ where: { id: current.id }, data: { status: "SOFT_CLOSED", version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FISCAL_PERIOD_SOFT_CLOSED",
      entityType: "FinanceFiscalPeriod", entityId: updated.id,
      description: `Period ${updated.name} soft-closed`,
      previous: { status: current.status }, next: { status: updated.status },
    });
    return updated;
  });
}

export async function hardClosePeriod(periodId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PERIODS_CLOSE);
  return enterpriseTransaction(async (tx) => {
    const current = await loadPeriod(tx, principal.organizationKey, periodId);
    requireVersion(current.version, expectedVersion);
    assertFinanceTransition(current.status, "HARD_CLOSED", FISCAL_PERIOD_TRANSITIONS);
    const now = new Date();
    const updated = await tx.financeFiscalPeriod.update({
      where: { id: current.id },
      data: { status: "HARD_CLOSED", closedById: principal.id, closedAt: now, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FISCAL_PERIOD_HARD_CLOSED",
      entityType: "FinanceFiscalPeriod", entityId: updated.id,
      description: `Period ${updated.name} hard-closed`,
      previous: { status: current.status }, next: { status: updated.status },
    });
    return updated;
  });
}

/**
 * Reopening a hard-closed period is the one Wave-1 operation the Production
 * Codex explicitly calls out as requiring governed approval and SoD
 * (Section 8). `enforceSegregationOfDuties` loads the
 * `FISCAL_PERIOD_REOPEN` policy seeded in prisma/seed.ts and throws unless
 * either a different actor requested it, or the caller holds the
 * configured override permission with independently recorded approval
 * evidence and a reason.
 */
export async function reopenPeriod(periodId: string, expectedVersion: number, requestedById: string, reason: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PERIODS_REOPEN);
  if (!reason?.trim()) throw new AppError("A reason is required to reopen a closed period", 422, "REASON_REQUIRED");
  return enterpriseTransaction(async (tx) => {
    const current = await loadPeriod(tx, principal.organizationKey, periodId);
    requireVersion(current.version, expectedVersion);
    assertFinanceTransition(current.status, "ADJUSTMENT", FISCAL_PERIOD_TRANSITIONS);

    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey,
      operationType: "FISCAL_PERIOD_REOPEN",
      subjectType: "FinanceFiscalPeriod",
      subjectId: current.id,
      preparerId: requestedById,
      overrideReason: reason,
    });

    const now = new Date();
    const updated = await tx.financeFiscalPeriod.update({
      where: { id: current.id },
      data: { status: "ADJUSTMENT", reopenedById: principal.id, reopenedAt: now, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FISCAL_PERIOD_REOPENED",
      entityType: "FinanceFiscalPeriod", entityId: updated.id,
      description: `Period ${updated.name} reopened for adjustment: ${reason.trim()}`,
      previous: { status: current.status }, next: { status: updated.status, reason: reason.trim() },
    });
    return updated;
  });
}

export async function resolvePeriodForPostingDate(postingDate: Date) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction((tx) =>
    tx.financeFiscalPeriod.findFirst({
      where: { organizationKey: principal.organizationKey, startDate: { lte: postingDate }, endDate: { gt: postingDate } },
    }));
}

export async function listFiscalPeriods(fiscalYearId?: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction((tx) =>
    tx.financeFiscalPeriod.findMany({
      where: { organizationKey: principal.organizationKey, fiscalYearId },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      take: 5000, // bounded — Section 37 "no unbounded exports/queries"
    }));
}
