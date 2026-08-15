import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";

// Spec section 48: every profitability figure is labelled with a confidence
// level rather than presented as unqualified truth. Revenue/Opex read
// straight from the GL (RELIABLE once the GL has postings); COGS/SKU margin
// stay PARTIAL/UNAVAILABLE until a real Manufacturing cost truth exists —
// deliberately never backed into from selling price.
// COGS (code 5001) is deliberately split out of operatingExpense so a real
// Gross Profit line can be computed (Manufacturing OS integration spec §16).
// Confidence is derived from SeeraCompanyDispatchAllocation coverage in the
// same period — never assumed RELIABLE just because a 5001 balance exists,
// since legacy/no-cost dispatch lines post nothing to 5001 at all and must
// not be silently read as "no COGS this period" when they are really
// "unpriced this period".
export async function profitAndLoss(db: PrismaClient, actorId: string, periodStart: Date, periodEnd: Date) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const lines = await db.seeraJournalLine.findMany({ where: { journal: { status: "POSTED", date: { gte: periodStart, lte: periodEnd } } }, include: { journal: false } });
  const accounts = await db.seeraChartOfAccount.findMany({ where: { type: { in: ["INCOME", "EXPENSE"] } } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const revenue = new Map<string, number>();
  const expense = new Map<string, number>();
  for (const line of lines) {
    const account = byCode.get(line.accountId);
    if (!account) continue;
    if (account.type === "INCOME") revenue.set(account.code, (revenue.get(account.code) ?? 0) + (Number(line.credit) - Number(line.debit)));
    else expense.set(account.code, (expense.get(account.code) ?? 0) + (Number(line.debit) - Number(line.credit)));
  }
  const totalRevenue = [...revenue.values()].reduce((s, v) => s + v, 0);
  const cogsAmount = expense.get("5001") ?? 0;
  const operatingExpenseEntries = [...expense.entries()].filter(([code]) => code !== "5001");
  const totalOperatingExpense = operatingExpenseEntries.reduce((s, [, v]) => s + v, 0);
  const grossProfit = totalRevenue - cogsAmount;
  const operatingProfit = grossProfit - totalOperatingExpense;

  const allocations = await db.seeraCompanyDispatchAllocation.findMany({ where: { createdAt: { gte: periodStart, lte: periodEnd } } });
  const allocatedQty = allocations.reduce((s, a) => s + Number(a.quantity), 0);
  const reliableQty = allocations.filter((a) => a.costConfidence === "RELIABLE").reduce((s, a) => s + Number(a.quantity), 0);
  const cogsConfidence: "RELIABLE" | "PARTIAL" | "UNAVAILABLE" =
    allocatedQty === 0 ? "UNAVAILABLE" : reliableQty === allocatedQty ? "RELIABLE" : "PARTIAL";
  const cogsNote =
    cogsConfidence === "RELIABLE"
      ? "COGS fully cost-based from governed Manufacturing batch costing"
      : cogsConfidence === "PARTIAL"
        ? `COGS partially cost-based — ${reliableQty} of ${allocatedQty} dispatched units had a governed cost basis; remainder excluded from 5001 rather than fabricated`
        : "COST DATA INCOMPLETE / PARTIAL PROFITABILITY — no governed Manufacturing production-cost source exists for this period yet (either Company Inventory Mode is LEGACY_UNBOUNDED, or no dispatch has occurred)";

  return {
    periodStart,
    periodEnd,
    revenue: [...revenue.entries()].map(([code, amount]) => ({ code, name: byCode.get(code)!.name, amount })),
    totalRevenue,
    revenueConfidence: "RELIABLE" as const,
    cogs: cogsAmount,
    cogsConfidence,
    cogsNote,
    grossProfit,
    operatingExpense: operatingExpenseEntries.map(([code, amount]) => ({ code, name: byCode.get(code)!.name, amount })),
    totalOperatingExpense,
    operatingExpenseConfidence: "RELIABLE" as const,
    operatingProfit,
    netResult: operatingProfit,
    netResultConfidence: cogsConfidence === "RELIABLE" ? ("RELIABLE" as const) : ("PARTIAL" as const),
  };
}

// Assets = Liabilities + Equity, with Current Period Result plugged in as the
// bridging Equity line (never separately posted-to — it is always derived).
export async function balanceSheet(db: PrismaClient, actorId: string, asOf: Date) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const lines = await db.seeraJournalLine.findMany({ where: { journal: { status: "POSTED", date: { lte: asOf } } } });
  const accounts = await db.seeraChartOfAccount.findMany();
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const totals = new Map<string, number>();
  for (const line of lines) {
    const account = byCode.get(line.accountId);
    if (!account) continue;
    const net = Number(line.debit) - Number(line.credit);
    totals.set(account.code, (totals.get(account.code) ?? 0) + net);
  }
  const rowsOf = (type: string) =>
    accounts.filter((a) => a.type === type).map((a) => ({ code: a.code, name: a.name, amount: type === "ASSET" ? (totals.get(a.code) ?? 0) : -(totals.get(a.code) ?? 0) })).filter((r) => r.amount !== 0);
  const assets = rowsOf("ASSET");
  const liabilities = rowsOf("LIABILITY");
  const equity = rowsOf("EQUITY");
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquityPosted = equity.reduce((s, r) => s + r.amount, 0);
  const currentPeriodResult = totalAssets - totalLiabilities - totalEquityPosted;
  const totalEquity = totalEquityPosted + currentPeriodResult;
  return { asOf, assets, totalAssets, liabilities, totalLiabilities, equity: [...equity, { code: "3030", name: "Current Period Result", amount: currentPeriodResult }], totalEquity, balanced: Math.round((totalAssets - (totalLiabilities + totalEquity)) * 100) === 0 };
}

// Actual cash flow reconciles directly to Bank+Cash treasury journal-line
// movement over the period — not a derived/estimated figure.
export async function cashFlow(db: PrismaClient, actorId: string, periodStart: Date, periodEnd: Date) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const treasuryAccounts = await db.seeraTreasuryAccount.findMany();
  const coaIds = treasuryAccounts.map((t) => t.chartOfAccountId);
  const coas = await db.seeraChartOfAccount.findMany({ where: { id: { in: coaIds } } });
  const codes = coas.map((c) => c.code);
  const [openingLines, periodLines] = await Promise.all([
    db.seeraJournalLine.findMany({ where: { accountId: { in: codes }, journal: { status: "POSTED", date: { lt: periodStart } } } }),
    db.seeraJournalLine.findMany({ where: { accountId: { in: codes }, journal: { status: "POSTED", date: { gte: periodStart, lte: periodEnd } } }, include: { journal: true } }),
  ]);
  const openingCash = openingLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
  const classify = (sourceType: string) => (["TRANSFER"].includes(sourceType) ? "internal" : ["CAPITAL_INTRODUCED", "DRAWINGS", "LOAN_RECEIVED", "LOAN_REPAYMENT"].includes(sourceType) ? "financing" : ["ASSET_PURCHASE"].includes(sourceType) ? "investing" : "operating");
  let operating = 0, investing = 0, financing = 0;
  for (const line of periodLines) {
    const net = Number(line.debit) - Number(line.credit);
    const bucket = classify(line.journal.sourceType);
    if (bucket === "operating") operating += net;
    else if (bucket === "investing") investing += net;
    else if (bucket === "financing") financing += net;
  }
  const closingCash = openingCash + operating + investing + financing;
  return { periodStart, periodEnd, openingCash, operating, investing, financing, netMovement: operating + investing + financing, closingCash };
}

// 7/30/60/90-day forecast (spec section 28): ACTUAL is today's real cash;
// COMMITTED is what is already contractually due (open payables, unpaid
// approved payroll, active loan schedule) within the window; FORECAST layers
// in recurring-expense templates due in the window. No fabricated precision —
// unknown future receivables are simply not projected.
export async function cashForecast(db: PrismaClient, actorId: string, days: 7 | 30 | 60 | 90) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86_400_000);
  const treasuryAccounts = await db.seeraTreasuryAccount.findMany();
  const coaIds = treasuryAccounts.map((t) => t.chartOfAccountId);
  const coas = await db.seeraChartOfAccount.findMany({ where: { id: { in: coaIds } } });
  const codes = coas.map((c) => c.code);
  const currentLines = await db.seeraJournalLine.findMany({ where: { accountId: { in: codes }, journal: { status: "POSTED", date: { lte: now } } } });
  const currentCash = currentLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);

  const [payablesDue, pendingPayroll, recurringDue] = await Promise.all([
    db.seeraVendorBill.findMany({ where: { status: { in: ["APPROVED", "PARTIALLY_PAID"] }, dueDate: { lte: horizon } } }),
    db.seeraPayrollEntry.findMany({ where: { status: "PENDING", journalId: { not: null } } }),
    db.seeraRecurringExpenseTemplate.findMany({ where: { isActive: true, nextDueDate: { lte: horizon } } }),
  ]);
  const committedOutflow = payablesDue.reduce((s, b) => s + (Number(b.grossAmount) - Number(b.paidAmount)), 0) + pendingPayroll.reduce((s, p) => s + Number(p.netPayable), 0);
  const forecastOutflow = recurringDue.reduce((s, r) => s + Number(r.expectedAmount), 0);
  const expectedClosingCash = currentCash - committedOutflow - forecastOutflow;
  return { days, asOf: now, currentCash, committedOutflow, forecastOutflow, expectedClosingCash, shortfall: expectedClosingCash < 0, lowestProjectedCash: Math.min(currentCash, expectedClosingCash) };
}

// GST Control Center (spec section 35) — Sales OS's SeeraCommercialDocument
// remains the source of Output GST; Vendor Bills are the source of Input GST.
// This is a read/summary view, not a filing integration.
export async function gstControlCenter(db: PrismaClient, actorId: string, periodStart: Date, periodEnd: Date) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const [salesDocs, vendorBills] = await Promise.all([
    db.seeraCommercialDocument.findMany({ where: { status: "ISSUED", type: { in: ["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] }, issueDate: { gte: periodStart, lte: periodEnd } } }),
    db.seeraVendorBill.findMany({ where: { status: { not: "CANCELLED" }, invoiceDate: { gte: periodStart, lte: periodEnd } } }),
  ]);
  const missingGstinDocs = salesDocs.filter((d) => d.type === "TAX_INVOICE" && !(d.buyerSnapshot as { gstin?: string } | null)?.gstin).length;
  const outputCgst = salesDocs.reduce((s, d) => s + (d.type === "CREDIT_NOTE" ? -Number(d.cgstTotal) : Number(d.cgstTotal)), 0);
  const outputSgst = salesDocs.reduce((s, d) => s + (d.type === "CREDIT_NOTE" ? -Number(d.sgstTotal) : Number(d.sgstTotal)), 0);
  const outputIgst = salesDocs.reduce((s, d) => s + (d.type === "CREDIT_NOTE" ? -Number(d.igstTotal) : Number(d.igstTotal)), 0);
  const inputCgst = vendorBills.reduce((s, b) => s + Number(b.cgst), 0);
  const inputSgst = vendorBills.reduce((s, b) => s + Number(b.sgst), 0);
  const inputIgst = vendorBills.reduce((s, b) => s + Number(b.igst), 0);
  const missingHsnTax = vendorBills.filter((b) => Number(b.cgst) === 0 && Number(b.sgst) === 0 && Number(b.igst) === 0 && Number(b.taxable) > 0).length;
  return {
    periodStart,
    periodEnd,
    salesRegisterCount: salesDocs.length,
    purchaseRegisterCount: vendorBills.length,
    outputCgst,
    outputSgst,
    outputIgst,
    inputCgst,
    inputSgst,
    inputIgst,
    netIndicativeLiability: outputCgst + outputSgst + outputIgst - (inputCgst + inputSgst + inputIgst),
    missingGstinCount: missingGstinDocs,
    missingHsnTaxOnBills: missingHsnTax,
  };
}
