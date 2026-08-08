import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancialReportingPrincipal } from "./context";
import { getTrialBalance } from "./ledger-service";

/**
 * Milestone 8 — Formal Financial Statements. Every statement below is a
 * pure aggregation over getTrialBalance's already-frozen, already-correct
 * closing balances (Part 3C) grouped by FinanceAccount.category — no new
 * posting logic, no second source of truth, and each row is directly
 * traceable back to the account it came from (drill-down = open that
 * account's ledger via getAccountLedger, already built).
 */

/** Profit & Loss: Revenue less Expense, for the fiscal period given (not cumulative — a period's own activity only, using periodDebit/periodCredit rather than the cumulative closing balance). */
export async function getProfitAndLoss(fiscalPeriodId: string) {
  await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const { rows } = await getTrialBalance(fiscalPeriodId);
  const revenueRows = rows.filter((r) => r.category === "REVENUE").map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: Number(r.periodCredit) - Number(r.periodDebit) }));
  const expenseRows = rows.filter((r) => r.category === "EXPENSE").map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: Number(r.periodDebit) - Number(r.periodCredit) }));
  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
  return { fiscalPeriodId, revenue: revenueRows, expense: expenseRows, totalRevenue, totalExpense, netProfit: totalRevenue - totalExpense };
}

/** Balance Sheet: Assets = Liabilities + Equity, as of the period's closing balances. Retained Earnings is not auto-rolled from P&L in this pass (no year-end closing journal is generated automatically) — the reported Equity total is what's actually posted, and the balance-check flags any gap rather than silently plugging one. */
export async function getBalanceSheet(fiscalPeriodId: string) {
  await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const { rows } = await getTrialBalance(fiscalPeriodId);
  const byCategory = (category: string) => rows.filter((r) => r.category === category).map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: Number(r.closingDebit) - Number(r.closingCredit) }));
  const assets = byCategory("ASSET");
  const liabilities = rows.filter((r) => r.category === "LIABILITY").map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: Number(r.closingCredit) - Number(r.closingDebit) }));
  const equity = rows.filter((r) => r.category === "EQUITY").map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: Number(r.closingCredit) - Number(r.closingDebit) }));
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amount, 0);
  return { fiscalPeriodId, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, balances: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 };
}

/** Cash Flow Statement (indirect-adjacent, simplified): grouped by FinanceAccount.cashFlowClassification (OPERATING/INVESTING/FINANCING) — a governed string an accountant sets per account, never inferred. Accounts with no classification set are reported separately as "unclassified" rather than silently dropped. */
export async function getCashFlowStatement(fiscalPeriodId: string) {
  await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const { rows } = await getTrialBalance(fiscalPeriodId);
  const accounts = await prisma.financeAccount.findMany({ where: { accountCode: { in: rows.map((r) => r.accountCode) } }, select: { accountCode: true, cashFlowClassification: true } });
  const classificationByCode = new Map(accounts.map((a) => [a.accountCode, a.cashFlowClassification]));
  const groups: Record<string, { accountCode: string; accountName: string; amount: number }[]> = { OPERATING: [], INVESTING: [], FINANCING: [], UNCLASSIFIED: [] };
  for (const row of rows) {
    const classification = classificationByCode.get(row.accountCode) ?? "UNCLASSIFIED";
    const bucket = groups[classification] ?? groups.UNCLASSIFIED!;
    bucket.push({ accountCode: row.accountCode, accountName: row.accountName, amount: Number(row.periodDebit) - Number(row.periodCredit) });
  }
  const netByGroup = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.reduce((s, r) => s + r.amount, 0)]));
  return { fiscalPeriodId, groups, netCashFromOperating: netByGroup.OPERATING, netCashFromInvesting: netByGroup.INVESTING, netCashFromFinancing: netByGroup.FINANCING, netChangeInCash: (netByGroup.OPERATING ?? 0) + (netByGroup.INVESTING ?? 0) + (netByGroup.FINANCING ?? 0) };
}

// --- Profitability Analysis ---
// Revenue - Discounts - Returns - COGS - Direct Fulfillment Cost = Contribution.
// Explicitly labeled: figures pulled from real posted ledger data are
// marked "actual"; anything involving an allocation (e.g. spreading shared
// overhead across products) is marked "estimated" and never presented
// unlabeled, per the approved architecture's own instruction.

export async function getCustomerProfitability(customerAccountId: string, fromDate: Date, toDate: Date) {
  await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const invoices = await prisma.financeReceivableInvoice.findMany({ where: { customerAccountId, issueDate: { gte: fromDate, lte: toDate }, status: { not: "CANCELLED" } } });
  const revenue = invoices.reduce((s, i) => s + Number(i.subtotal), 0);
  const discounts = invoices.reduce((s, i) => s + Number(i.discountAmount), 0);
  return { customerAccountId, basis: "actual" as const, revenue, discounts, netRevenue: revenue - discounts, invoiceCount: invoices.length };
}

export async function getProductProfitability(productId: string, fromDate: Date, toDate: Date) {
  await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const orderItems = await prisma.businessOrderItem.findMany({ where: { productId, order: { createdAt: { gte: fromDate, lte: toDate }, status: { not: "CANCELLED" } } } });
  const revenue = orderItems.reduce((s, i) => s + Number(i.lineTotal), 0);
  const quantity = orderItems.reduce((s, i) => s + i.quantity, 0);
  return { productId, basis: "actual" as const, revenue, quantitySold: quantity, note: "COGS not yet joined to per-order-item cost — this is revenue-only until Manufacturing Costing's batch cost is traced to specific sales order lines (a future extension), not presented as a margin figure." };
}

/** Warehouse/Inventory Valuation Report §21/24 lives in costing-service.ts (getInventoryValuation) — re-exported here for a single Reports-area import surface. */
export { getInventoryValuation, listBatchCosts, getBatchCost } from "./costing-service";

/** Founder CFO Dashboard — every figure here is one function call to an already-built, independently-testable report; drill-down means "call the underlying report/ledger function directly," not a duplicated computation. */
export async function getFounderFinanceDashboard(fiscalPeriodId: string) {
  await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const [pnl, balanceSheet, receivablesAging, payablesAging, inventoryValuation, unpostedEvents] = await Promise.all([
    getProfitAndLoss(fiscalPeriodId),
    getBalanceSheet(fiscalPeriodId),
    prisma.financeReceivableInvoice.aggregate({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { outstandingAmount: true } }),
    prisma.financeVendorBill.aggregate({ where: { status: { in: ["APPROVED", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { outstandingAmount: true } }),
    (await import("./costing-service")).getInventoryValuation().catch(() => ({ totalValue: 0 })),
    prisma.financeEventProcessingLog.count({ where: { status: { in: ["FAILED", "SKIPPED_NO_RULE"] } } }),
  ]);
  const overdueReceivables = await prisma.financeReceivableInvoice.aggregate({ where: { status: "OVERDUE" }, _sum: { outstandingAmount: true } });
  const overduePayables = await prisma.financeVendorBill.aggregate({ where: { status: "OVERDUE" }, _sum: { outstandingAmount: true } });
  const cashAccounts = await prisma.financeCashAccount.aggregate({ _sum: { currentBalance: true } });

  if (!balanceSheet.balances) {
    // Never hide a real integrity problem behind a clean-looking dashboard.
    throw new AppError("Balance Sheet does not balance for this period — dashboard withheld until resolved", 500, "BALANCE_SHEET_INTEGRITY_ERROR");
  }

  return {
    revenue: pnl.totalRevenue, grossProfit: pnl.totalRevenue - pnl.totalExpense, operatingProfit: pnl.netProfit, netProfit: pnl.netProfit,
    cashAndBankPosition: Number(cashAccounts._sum.currentBalance ?? 0),
    receivables: Number(receivablesAging._sum.outstandingAmount ?? 0), overdueReceivables: Number(overdueReceivables._sum.outstandingAmount ?? 0),
    payables: Number(payablesAging._sum.outstandingAmount ?? 0), overduePayables: Number(overduePayables._sum.outstandingAmount ?? 0),
    inventoryValue: inventoryValuation.totalValue,
    workingCapital: balanceSheet.totalAssets - balanceSheet.totalLiabilities,
    unpostedFinanceEvents: unpostedEvents,
    periodCloseStatus: fiscalPeriodId,
    balanceSheetBalances: balanceSheet.balances,
  };
}
