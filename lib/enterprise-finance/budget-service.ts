import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireFinancePrincipal } from "./context";

/**
 * Milestone 8 — Budget Control and Forecasting. checkBudgetAvailability is
 * the one function Purchase Requisition / Expense Claim approval flows call
 * before granting approval (§6 Procurement Financial Approval's "Budget
 * Availability Check" step) — a soft warning at softWarningPercent, a hard
 * block only when the line's own hardBlock flag is set, never a global
 * default (a budget owner opts a specific line into hard enforcement).
 */

const budgetInput = z.object({
  fiscalYearId: z.string().cuid(), name: z.string().min(2).max(160),
  lines: z.array(z.object({
    fiscalPeriodId: z.string().cuid(), accountId: z.string().cuid(), costCenterId: z.string().cuid().optional(), profitCenterId: z.string().cuid().optional(),
    budgetedAmount: z.coerce.number().nonnegative(), hardBlock: z.boolean().default(false), softWarningPercent: z.number().int().min(1).max(100).default(90),
  })).min(1),
});

export async function createBudgetDraft(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_BUDGETS_MANAGE);
  const data = budgetInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const fiscalYear = await tx.financeFiscalYear.findFirst({ where: { id: data.fiscalYearId, organizationKey: principal.organizationKey } });
    if (!fiscalYear) throw new NotFoundError("Fiscal year");
    const budgetNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "BUDGET", "BUD");
    const entity = await tx.financeBudget.create({
      data: {
        organizationKey: principal.organizationKey, budgetNumber, fiscalYearId: data.fiscalYearId, name: data.name, createdById: principal.id,
        lines: { create: data.lines.map((l) => ({ organizationKey: principal.organizationKey, ...l, budgetedAmount: l.budgetedAmount })) },
      },
      include: { lines: true },
    });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "BUDGET_CREATED", entityType: "FinanceBudget", entityId: entity.id, description: `Budget ${budgetNumber} drafted for ${fiscalYear.code}` });
    return entity;
  });
}

export async function approveBudget(id: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_BUDGETS_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeBudget.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Budget");
    if (current.version !== expectedVersion) throw new ConflictError("Record changed; refresh and retry");
    if (current.status !== "DRAFT") throw new AppError("Only a draft budget can be approved", 409, "INVALID_TRANSITION");
    const entity = await tx.financeBudget.update({ where: { id }, data: { status: "ACTIVE", approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "BUDGET_APPROVED", entityType: "FinanceBudget", entityId: id, description: `Budget ${current.budgetNumber} approved and active` });
    return entity;
  });
}

export async function reviseBudgetLine(budgetId: string, lineId: string, newAmount: number, reason: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_BUDGETS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const budget = await tx.financeBudget.findFirst({ where: { id: budgetId, organizationKey: principal.organizationKey } });
    if (!budget) throw new NotFoundError("Budget");
    const line = await tx.financeBudgetLine.findFirst({ where: { id: lineId, budgetId } });
    if (!line) throw new NotFoundError("Budget line");
    const revisionCount = await tx.financeBudgetRevision.count({ where: { budgetId } });
    await tx.financeBudgetRevision.create({ data: { organizationKey: principal.organizationKey, budgetId, revisionNumber: revisionCount + 1, reason, changedById: principal.id } });
    const updated = await tx.financeBudgetLine.update({ where: { id: lineId }, data: { budgetedAmount: new Prisma.Decimal(newAmount) } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "BUDGET_REVISED", entityType: "FinanceBudget", entityId: budgetId, description: `Budget ${budget.budgetNumber} line revised: ${reason}`, previous: { amount: line.budgetedAmount.toString() }, next: { amount: newAmount } });
    return updated;
  });
}

export type BudgetAvailabilityResult = {
  available: boolean; hardBlocked: boolean; softWarning: boolean;
  budgetedAmount: number; committedAmount: number; actualAmount: number; remainingAmount: number; utilizationPercent: number;
};

/** Called by Purchase Requisition / Expense Claim approval before granting approval — never bypassed silently (§4 "must not silently bypass the applicable ... rule" applied here to budget too). No matching budget line = no constraint (not every account/cost-center combination is required to have a budget). */
export async function checkBudgetAvailability(input: { accountId: string; costCenterId?: string; fiscalPeriodId: string; amount: number }): Promise<BudgetAvailabilityResult | null> {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const line = await prisma.financeBudgetLine.findFirst({
    where: { organizationKey: principal.organizationKey, accountId: input.accountId, costCenterId: input.costCenterId ?? null, fiscalPeriodId: input.fiscalPeriodId, budget: { status: "ACTIVE" } },
  });
  if (!line) return null;
  const remaining = line.budgetedAmount.minus(line.committedAmount).minus(line.actualAmount);
  const requested = new Prisma.Decimal(input.amount);
  const utilization = line.budgetedAmount.greaterThan(0) ? line.committedAmount.plus(line.actualAmount).plus(requested).dividedBy(line.budgetedAmount).times(100) : new Prisma.Decimal(0);
  const hardBlocked = line.hardBlock && requested.greaterThan(remaining);
  return {
    available: !hardBlocked, hardBlocked, softWarning: utilization.greaterThanOrEqualTo(line.softWarningPercent),
    budgetedAmount: Number(line.budgetedAmount), committedAmount: Number(line.committedAmount), actualAmount: Number(line.actualAmount),
    remainingAmount: Number(remaining), utilizationPercent: Number(utilization),
  };
}

export async function recordBudgetCommitment(lineId: string, amount: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_BUDGETS_MANAGE);
  const line = await prisma.financeBudgetLine.findFirst({ where: { id: lineId, organizationKey: principal.organizationKey } });
  if (!line) throw new NotFoundError("Budget line");
  return prisma.financeBudgetLine.update({ where: { id: lineId }, data: { committedAmount: { increment: amount } } });
}

/** Actuals are synced from the real GL, never entered manually — one line, one account/period/cost-center combination, summed from posted FinanceLedgerEntry rows. */
export async function syncBudgetActuals(budgetId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_BUDGETS_MANAGE);
  const budget = await prisma.financeBudget.findFirst({ where: { id: budgetId, organizationKey: principal.organizationKey }, include: { lines: true } });
  if (!budget) throw new NotFoundError("Budget");
  for (const line of budget.lines) {
    const aggregate = await prisma.financeLedgerEntry.aggregate({
      where: { organizationKey: principal.organizationKey, accountId: line.accountId, fiscalPeriodId: line.fiscalPeriodId, costCenterId: line.costCenterId },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const actual = (aggregate._sum.debitAmount ?? new Prisma.Decimal(0)).minus(aggregate._sum.creditAmount ?? new Prisma.Decimal(0));
    await prisma.financeBudgetLine.update({ where: { id: line.id }, data: { actualAmount: actual } });
  }
  return prisma.financeBudget.findUniqueOrThrow({ where: { id: budgetId }, include: { lines: true } });
}

export async function getBudgetVsActual(budgetId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const budget = await prisma.financeBudget.findFirst({
    where: { id: budgetId, organizationKey: principal.organizationKey },
    include: { lines: { include: { } } },
  });
  if (!budget) throw new NotFoundError("Budget");
  return {
    budget: { id: budget.id, budgetNumber: budget.budgetNumber, name: budget.name, status: budget.status },
    lines: budget.lines.map((l) => ({
      id: l.id, accountId: l.accountId, costCenterId: l.costCenterId, budgeted: Number(l.budgetedAmount), committed: Number(l.committedAmount),
      actual: Number(l.actualAmount), variance: Number(l.budgetedAmount) - Number(l.actualAmount), utilizationPercent: Number(l.budgetedAmount) > 0 ? (Number(l.actualAmount) / Number(l.budgetedAmount)) * 100 : 0,
    })),
  };
}

export async function listBudgets(input: { status?: string; page?: number; pageSize?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.financeBudget.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeBudget.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
