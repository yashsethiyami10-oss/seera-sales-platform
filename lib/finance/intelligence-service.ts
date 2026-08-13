import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { cashFlow } from "./statements-service";
import { payablesView } from "./vendor-service";
import { monthlyExpenseTrend } from "./reports-service";

export type FinanceInsight = { code: string; title: string; amount?: number; period?: string; why: string; deepLink: string };

// Deterministic only — every number here comes from a real query, no LLM
// generation, matching spec §47 ("no hallucinated AI recommendations").
export async function financialIntelligenceFeed(db: PrismaClient, actorId: string): Promise<FinanceInsight[]> {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const now = new Date();
  const insights: FinanceInsight[] = [];

  const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const [thisMonthCf, lastMonthCf] = await Promise.all([cashFlow(db, actorId, thisMonthStart, now), cashFlow(db, actorId, lastMonthStart, thisMonthStart)]);
  if (lastMonthCf.closingCash > 0 && thisMonthCf.closingCash < lastMonthCf.closingCash * 0.9) {
    const pct = Math.round((1 - thisMonthCf.closingCash / lastMonthCf.closingCash) * 100);
    insights.push({ code: "CASH_DECREASING", title: `Cash down ${pct}% vs last month`, amount: thisMonthCf.closingCash, period: "This month", why: `Closing cash ₹${Math.round(thisMonthCf.closingCash).toLocaleString("en-IN")} vs ₹${Math.round(lastMonthCf.closingCash).toLocaleString("en-IN")} last month`, deepLink: "statements" });
  }

  const trend = await monthlyExpenseTrend(db, actorId, 4);
  if (trend.length >= 2) {
    const current = trend[trend.length - 1]!;
    const priorAvg = trend.slice(0, -1).reduce((s, t) => s + t.total, 0) / (trend.length - 1);
    if (priorAvg > 0 && current.total > priorAvg * 1.3) {
      insights.push({ code: "EXPENSE_SPIKE", title: `Expenses up ${Math.round((current.total / priorAvg - 1) * 100)}% vs recent average`, amount: current.total, period: current.month, why: `₹${Math.round(current.total).toLocaleString("en-IN")} this month vs ₹${Math.round(priorAvg).toLocaleString("en-IN")} average of the prior ${trend.length - 1} month(s)`, deepLink: "expenses" });
    }
  }

  const payables = await payablesView(db, actorId);
  const dueSoon = payables.filter((b) => b.due > 0 && b.dueDate.getTime() - now.getTime() <= 7 * 86_400_000 && b.dueDate.getTime() >= now.getTime());
  if (dueSoon.length) insights.push({ code: "PAYABLES_DUE_SOON", title: `₹${Math.round(dueSoon.reduce((s, b) => s + b.due, 0)).toLocaleString("en-IN")} due in the next 7 days`, amount: dueSoon.reduce((s, b) => s + b.due, 0), why: `${dueSoon.length} vendor bill(s) due within 7 days`, deepLink: "vendors" });
  const overdue = payables.filter((b) => b.due > 0 && b.dueDate < now);
  if (overdue.length) insights.push({ code: "PAYABLES_OVERDUE", title: `₹${Math.round(overdue.reduce((s, b) => s + b.due, 0)).toLocaleString("en-IN")} overdue to vendors`, amount: overdue.reduce((s, b) => s + b.due, 0), why: `${overdue.length} vendor bill(s) past due date`, deepLink: "vendors" });

  const unappliedAdvances = await db.seeraPaymentRecord.aggregate({ where: { payeeType: "COMPANY", status: { in: ["VERIFIED", "PARTIALLY_MATCHED"] } }, _sum: { unappliedAmount: true } });
  const unapplied = Number(unappliedAdvances._sum.unappliedAmount ?? 0);
  if (unapplied > 0) insights.push({ code: "UNAPPLIED_ADVANCES", title: `₹${Math.round(unapplied).toLocaleString("en-IN")} in unapplied customer advances`, amount: unapplied, why: "Advances received but not yet allocated against an invoice", deepLink: "sales-finance" });

  const unreconciled = await db.seeraBankStatementLine.count({ where: { matchStatus: "UNMATCHED" } });
  if (unreconciled > 0) insights.push({ code: "UNRECONCILED_BANK", title: `${unreconciled} unreconciled bank line(s)`, why: "Bank statement lines with no confirmed journal match", deepLink: "bank" });

  const pendingExpenseApprovals = await db.seeraExpense.count({ where: { status: "SUBMITTED" } });
  if (pendingExpenseApprovals > 0) insights.push({ code: "EXPENSE_APPROVAL_PENDING", title: `${pendingExpenseApprovals} expense(s) awaiting approval`, why: "Submitted expenses with no decision yet", deepLink: "expenses" });

  return insights;
}
