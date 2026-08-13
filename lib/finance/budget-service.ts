import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";

export async function createBudget(db: PrismaClient, actorId: string, input: { name: string; periodStart: Date; periodEnd: Date; lines: { accountId?: string; categoryId?: string; dimensionId?: string; amount: number }[] }) {
  await authorize(db, { actorId, permission: "budget:manage" });
  const budget = await db.seeraBudget.create({ data: { name: input.name, periodStart: input.periodStart, periodEnd: input.periodEnd, createdById: actorId, lines: { create: input.lines } }, include: { lines: true } });
  await recordAudit(db, { actorId, action: "finance.budget.created", entityType: "SeeraBudget", entityId: budget.id, afterState: { name: input.name, lines: input.lines.length } });
  return budget;
}

export async function listBudgets(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "budget:manage" });
  return db.seeraBudget.findMany({ where: { isActive: true }, include: { lines: true }, orderBy: { periodStart: "desc" } });
}

// Actual = sum of posted journal-line debits against the same account/category
// (via the category's mapped COA account) within the budget period —
// deliberately reads the same GL every statement reads, never a parallel tally.
export async function budgetVsActual(db: PrismaClient, actorId: string, budgetId: string) {
  await authorize(db, { actorId, permission: "budget:manage" });
  const budget = await db.seeraBudget.findUniqueOrThrow({ where: { id: budgetId }, include: { lines: true } });
  const categories = await db.seeraExpenseCategory.findMany();
  const categoryAccount = new Map(categories.map((c) => [c.id, c.chartOfAccountId]));

  const rows = await Promise.all(
    budget.lines.map(async (line) => {
      const accountId = line.accountId ?? (line.categoryId ? categoryAccount.get(line.categoryId) : undefined);
      let actual = 0;
      let committed = 0;
      if (accountId) {
        const posted = await db.seeraJournalLine.aggregate({ where: { accountId, dimensionId: line.dimensionId ?? undefined, journal: { status: "POSTED", date: { gte: budget.periodStart, lte: budget.periodEnd } } }, _sum: { debit: true, credit: true } });
        actual = Number(posted._sum.debit ?? 0) - Number(posted._sum.credit ?? 0);
        committed = await db.seeraExpense.count({ where: { categoryId: line.categoryId ?? undefined, status: { in: ["SUBMITTED", "APPROVED"] }, date: { gte: budget.periodStart, lte: budget.periodEnd } } }).then(async (count) => {
          if (!count) return 0;
          const sum = await db.seeraExpense.aggregate({ where: { categoryId: line.categoryId ?? undefined, status: { in: ["SUBMITTED", "APPROVED"] }, date: { gte: budget.periodStart, lte: budget.periodEnd } }, _sum: { amount: true } });
          return Number(sum._sum.amount ?? 0);
        });
      }
      const remaining = Number(line.amount) - actual - committed;
      const variance = Number(line.amount) - actual;
      const variancePct = Number(line.amount) !== 0 ? (variance / Number(line.amount)) * 100 : 0;
      return { lineId: line.id, accountId: line.accountId, categoryId: line.categoryId, dimensionId: line.dimensionId, budget: Number(line.amount), actual, committed, remaining, variance, variancePct };
    }),
  );
  return { budget, rows };
}
