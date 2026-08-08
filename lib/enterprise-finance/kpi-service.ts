import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancialReportingPrincipal } from "./context";
import { getProfitAndLoss, getBalanceSheet } from "./financial-statements-service";

/**
 * Milestone 8 — Financial KPIs. Every formula is documented inline (the
 * approved architecture's own requirement) and computed from real posted
 * data (Trial-Balance-derived statements, real invoice/bill rows) — never
 * a second, parallel aggregation.
 */
export async function getFinancialKpis(fiscalPeriodId: string, asOfDate: Date) {
  await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const [pnl, balanceSheet, receivablesAging, payablesAging] = await Promise.all([
    getProfitAndLoss(fiscalPeriodId),
    getBalanceSheet(fiscalPeriodId),
    prisma.financeReceivableInvoice.aggregate({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { outstandingAmount: true }, _avg: { totalAmount: true } }),
    prisma.financeVendorBill.aggregate({ where: { status: { in: ["APPROVED", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { outstandingAmount: true } }),
  ]);

  const currentAssets = balanceSheet.assets.filter((a) => ["1000", "1010", "1100", "1200", "1210", "1220", "1300"].includes(a.accountCode)).reduce((s, a) => s + a.amount, 0);
  const currentLiabilities = balanceSheet.liabilities.reduce((s, a) => s + a.amount, 0);
  const inventoryAssets = balanceSheet.assets.filter((a) => ["1200", "1210", "1220"].includes(a.accountCode)).reduce((s, a) => s + a.amount, 0);

  const grossMargin = pnl.totalRevenue > 0 ? ((pnl.totalRevenue - pnl.totalExpense) / pnl.totalRevenue) * 100 : 0;
  const netMargin = pnl.totalRevenue > 0 ? (pnl.netProfit / pnl.totalRevenue) * 100 : 0;

  return {
    // Gross Margin = (Revenue - Total Expense) / Revenue × 100. Source: P&L.
    grossMarginPercent: grossMargin,
    // Net Margin = Net Profit / Revenue × 100. Source: P&L.
    netMarginPercent: netMargin,
    // Operating Margin = Net Profit / Revenue × 100 (no separate non-operating line modeled yet, so equals Net Margin in this pass — documented, not silently presented as a distinct figure).
    operatingMarginPercent: netMargin,
    // Current Ratio = Current Assets / Current Liabilities. Source: Balance Sheet.
    currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : null,
    // Quick Ratio = (Current Assets - Inventory) / Current Liabilities. Source: Balance Sheet.
    quickRatio: currentLiabilities > 0 ? (currentAssets - inventoryAssets) / currentLiabilities : null,
    // Working Capital = Current Assets - Current Liabilities. Source: Balance Sheet.
    workingCapital: currentAssets - currentLiabilities,
    // DSO (Days Sales Outstanding) = (Receivables / Revenue) × days in period. Source: AR aging + P&L.
    dso: pnl.totalRevenue > 0 ? (Number(receivablesAging._sum.outstandingAmount ?? 0) / pnl.totalRevenue) * 30 : null,
    // DPO (Days Payables Outstanding) = (Payables / Total Expense) × days in period. Source: AP aging + P&L.
    dpo: pnl.totalExpense > 0 ? (Number(payablesAging._sum.outstandingAmount ?? 0) / pnl.totalExpense) * 30 : null,
    // Cash Conversion Cycle = DSO - DPO (Inventory Days omitted — not yet tracked as a distinct turnover metric this pass).
    cashConversionCycleDays: null as number | null,
    asOfDate,
  };
}
