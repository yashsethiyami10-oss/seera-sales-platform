import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { ageingBucket } from "@/lib/sales-distribution/phase6-9-rules";
import { partyOutstanding } from "@/lib/sales-distribution/financial-service";
import { deriveCostCentre } from "./cost-centre";

// Create Invoice wizard (Finance + Money Desk UI/UX Restructure, §6) — a lightweight, read-only
// SKU catalog for the wizard's Items step. Deliberately no price-tier filter (unlike the
// Distributor/Retailer catalog readers elsewhere): a Company-issued invoice's rate is typed
// manually by the Founder, same "never invent a price" convention QuickEntry/Manager Retailing
// already use, so this never assumes a specific price tier applies. taxRate/hsn are surfaced (not
// silently defaulted) so the wizard can show — before the user gets to Review — exactly which
// products have no governed GST configured yet (assertTaxConfigured in document-lines.ts is still
// the real, server-side enforcement at issue time; this is purely an earlier, friendlier warning).
export async function invoiceWizardSkuCatalog(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "money_desk:create" });
  const skus = await db.seeraSku.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, productName: true, brand: true, packSize: true, unitType: true, taxRate: true, hsn: true },
    orderBy: [{ brand: "asc" }, { productName: "asc" }],
    take: 500,
  });
  return skus.map((s) => ({
    value: s.id,
    label: `${s.productName} — ${s.packSize} ${s.unitType}`,
    brand: s.brand,
    meta: s.code,
    taxRate: s.taxRate != null ? Number(s.taxRate) : null,
    hsn: s.hsn,
  }));
}

// Sales Register (spec §9/§10C) — reads the SAME authoritative Company
// commercial documents Sales V1 already issues; never a parallel sales table.
export async function salesRegister(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const documents = await db.seeraCommercialDocument.findMany({
    where: { issuerType: "COMPANY", status: "ISSUED", type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] }, issueDate: { gte: input.from, lte: input.to } },
    orderBy: { issueDate: "desc" },
  });
  const documentIds = documents.map((d) => d.id);
  const allocations = await db.seeraPaymentAllocation.findMany({ where: { documentId: { in: documentIds }, status: "ACTIVE" } });
  const paidByDoc = new Map<string, number>();
  for (const a of allocations) paidByDoc.set(a.documentId, (paidByDoc.get(a.documentId) ?? 0) + Number(a.amount));
  return documents.map((d) => {
    const buyer = d.buyerSnapshot as { legalName?: string; gstin?: string; state?: string } | null;
    const paid = paidByDoc.get(d.id) ?? 0;
    return { id: d.id, documentNumber: d.documentNumber, type: d.type, issueDate: d.issueDate, buyerName: buyer?.legalName ?? d.buyerId, gstin: buyer?.gstin ?? null, state: buyer?.state ?? null, taxable: Number(d.taxableTotal), cgst: Number(d.cgstTotal), sgst: Number(d.sgstTotal), igst: Number(d.igstTotal), gross: Number(d.grandTotal), paid, balance: Number(d.grandTotal) - paid, status: paid >= Number(d.grandTotal) ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID" };
  });
}

export async function customerAdvanceRegister(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const payments = await db.seeraPaymentRecord.findMany({ where: { payeeType: "COMPANY", status: { in: ["VERIFIED", "PARTIALLY_MATCHED"] } }, include: { allocations: { where: { status: "ACTIVE" } } }, orderBy: { paymentDate: "desc" } });
  return payments.map((p) => ({ id: p.id, paymentNumber: p.paymentNumber, payerId: p.payerId, payerType: p.payerType, date: p.paymentDate, amountMatched: Number(p.amountMatched), applied: p.allocations.reduce((s, a) => s + Number(a.amount), 0), unapplied: Number(p.unappliedAmount), linkedInvoices: p.allocations.map((a) => a.documentId) }));
}

export async function receiptsRegister(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "document:view_scoped" });
  const receipts = await db.seeraCommercialDocument.findMany({ where: { issuerType: "COMPANY", type: { in: ["RECEIPT", "PAYMENT_RECEIPT"] }, status: "ISSUED" }, orderBy: { issueDate: "desc" }, take: 200 });
  return receipts.map((r) => { const buyer = r.buyerSnapshot as { legalName?: string } | null; return { id: r.id, documentNumber: r.documentNumber, date: r.issueDate, buyerName: buyer?.legalName ?? r.buyerId, amount: Number(r.grandTotal), supply: r.supplySnapshot }; });
}

// Receivables ageing — same pattern accountsDashboardSummary already uses
// (distinct buyer parties from ISSUED Company docs -> partyOutstanding each).
export async function receivablesAgeing(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const now = new Date();
  const docs = await db.seeraCommercialDocument.findMany({ where: { issuerType: "COMPANY", status: "ISSUED", type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE", "DEBIT_NOTE"] } }, select: { buyerType: true, buyerId: true, buyerSnapshot: true } });
  const distinct = new Map<string, { partyType: string; partyId: string; name: string }>();
  for (const d of docs) { const buyer = d.buyerSnapshot as { legalName?: string } | null; distinct.set(`${d.buyerType}:${d.buyerId}`, { partyType: d.buyerType, partyId: d.buyerId, name: buyer?.legalName ?? d.buyerId }); }
  const buckets = { NOT_DUE: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_PLUS": 0 };
  const rows = [];
  for (const party of distinct.values()) {
    const { outstanding, outstandingTotal } = await partyOutstanding(db, party.partyType, party.partyId, now);
    for (const o of outstanding) { const bucket = ageingBucket(o.originalDueDate, now); buckets[bucket] += o.amount; }
    if (outstandingTotal > 0) rows.push({ ...party, outstandingTotal });
  }
  return { rows, buckets };
}

export async function expenseByCategory(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const [expenses, categories] = await Promise.all([
    db.seeraExpense.groupBy({ by: ["categoryId"], where: { status: { in: ["POSTED"] }, date: { gte: input.from, lte: input.to } }, _sum: { amount: true } }),
    db.seeraExpenseCategory.findMany(),
  ]);
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  return expenses.map((e) => ({ categoryId: e.categoryId, categoryName: nameById.get(e.categoryId) ?? e.categoryId, total: Number(e._sum.amount ?? 0) })).sort((a, b) => b.total - a.total);
}

export async function expenseByDepartment(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const [expenses, dimensions] = await Promise.all([
    db.seeraExpense.groupBy({ by: ["dimensionId"], where: { status: "POSTED", date: { gte: input.from, lte: input.to }, dimensionId: { not: null } }, _sum: { amount: true } }),
    db.seeraFinancialDimension.findMany(),
  ]);
  const nameById = new Map(dimensions.map((d) => [d.id, d.name]));
  return expenses.map((e) => ({ dimensionId: e.dimensionId, name: e.dimensionId ? (nameById.get(e.dimensionId) ?? e.dimensionId) : "Unassigned", total: Number(e._sum.amount ?? 0) })).sort((a, b) => b.total - a.total);
}

// Territory Expense Summary (Money Desk maturity pass, 23-Aug spec §14/§28) — mirrors
// expenseByDepartment's exact groupBy pattern, just against `territoryId` instead of
// `dimensionId`. A null territoryId is a real state (Corporate/central expense — pan-India
// marketing, HQ salary, etc.), reported explicitly as "Corporate" rather than dropped or
// force-mapped to a fabricated territory.
export async function expenseByTerritory(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const [assigned, unassignedTotal, territories] = await Promise.all([
    db.seeraExpense.groupBy({ by: ["territoryId"], where: { status: "POSTED", date: { gte: input.from, lte: input.to }, territoryId: { not: null } }, _sum: { amount: true } }),
    db.seeraExpense.aggregate({ where: { status: "POSTED", date: { gte: input.from, lte: input.to }, territoryId: null }, _sum: { amount: true } }),
    db.seeraGeographyNode.findMany({ where: { level: "TERRITORY" }, select: { id: true, name: true } }),
  ]);
  const nameById = new Map(territories.map((t) => [t.id, t.name]));
  const rows = assigned.map((e) => ({ territoryId: e.territoryId as string, name: nameById.get(e.territoryId as string) ?? e.territoryId, total: Number(e._sum.amount ?? 0) }));
  const corporateTotal = Number(unassignedTotal._sum.amount ?? 0);
  if (corporateTotal > 0) rows.push({ territoryId: null as unknown as string, name: "Corporate", total: corporateTotal });
  return rows.sort((a, b) => b.total - a.total);
}

// Cost Centre Summary (Founder closure pass, 24-Aug §8-9) — coexists with, never duplicates,
// Territory: an expense with a real Territory is excluded here entirely (it already has a "where");
// only Territory-less expenses get a derived Cost Centre label. See cost-centre.ts for the
// derivation rule and its one known honest limitation (Electricity can't distinguish Warehouse
// from Head Office from category alone).
export async function costCentreSummary(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const [expenses, categories] = await Promise.all([
    db.seeraExpense.findMany({ where: { status: "POSTED", date: { gte: input.from, lte: input.to }, territoryId: null }, select: { amount: true, categoryId: true } }),
    db.seeraExpenseCategory.findMany({ select: { id: true, chartOfAccountId: true, parentGroup: true } }),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    const costCentre = deriveCostCentre(categoryById.get(expense.categoryId), false) ?? "Corporate";
    totals.set(costCentre, (totals.get(costCentre) ?? 0) + Number(expense.amount));
  }
  return [...totals.entries()].map(([costCentre, total]) => ({ costCentre, total })).sort((a, b) => b.total - a.total);
}

export async function monthlyExpenseTrend(db: PrismaClient, actorId: string, months: number) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
  const expenses = await db.seeraExpense.findMany({ where: { status: "POSTED", date: { gte: from } }, select: { date: true, amount: true } });
  const byMonth = new Map<string, number>();
  for (const e of expenses) { const k = `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, "0")}`; byMonth.set(k, (byMonth.get(k) ?? 0) + Number(e.amount)); }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total }));
}

const MARKETING_CATEGORY_CODES = new Set(["5070", "5080", "5090", "5100", "5110"]);
export async function marketingSpendReport(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const categories = await db.seeraExpenseCategory.findMany({ where: { chartOfAccountId: { in: [...MARKETING_CATEGORY_CODES] } } });
  const categoryIds = categories.map((c) => c.id);
  const expenses = await db.seeraExpense.findMany({ where: { categoryId: { in: categoryIds }, status: "POSTED", date: { gte: input.from, lte: input.to } } });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + Number(e.amount));
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  return { total, byCategory: [...byCategory.entries()].map(([categoryId, amount]) => ({ categoryId, name: nameById.get(categoryId) ?? categoryId, amount })), count: expenses.length };
}

export async function companySalesBySS(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const docs = await db.seeraCommercialDocument.findMany({ where: { issuerType: "COMPANY", status: "ISSUED", type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE"] }, issueDate: { gte: input.from, lte: input.to } }, select: { buyerId: true, buyerSnapshot: true, grandTotal: true } });
  const byParty = new Map<string, { name: string; total: number }>();
  for (const d of docs) { const buyer = d.buyerSnapshot as { legalName?: string } | null; const key = d.buyerId; const bucket = byParty.get(key) ?? { name: buyer?.legalName ?? key, total: 0 }; bucket.total += Number(d.grandTotal); byParty.set(key, bucket); }
  return [...byParty.entries()].map(([partyId, v]) => ({ partyId, ...v })).sort((a, b) => b.total - a.total);
}

// Purchase Register (Money Desk 2.0 Rule 19) — the vendor-side mirror of salesRegister above,
// reading the SAME authoritative SeeraVendorBill rows createVendorBill already posts; never a
// parallel purchase table.
export async function purchaseRegister(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const bills = await db.seeraVendorBill.findMany({
    where: { status: { not: "CANCELLED" }, invoiceDate: { gte: input.from, lte: input.to } },
    orderBy: { invoiceDate: "desc" },
  });
  const vendorIds = [...new Set(bills.map((b) => b.vendorId))];
  const vendors = vendorIds.length ? await db.seeraVendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, legalName: true, tradeName: true, gstin: true, state: true } }) : [];
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  return bills.map((b) => {
    const vendor = vendorById.get(b.vendorId);
    const paid = Number(b.paidAmount);
    const gross = Number(b.grossAmount);
    return {
      id: b.id, billNumber: b.billNumber, vendorInvoiceNumber: b.vendorInvoiceNumber, invoiceDate: b.invoiceDate,
      vendorName: vendor?.tradeName ?? vendor?.legalName ?? b.vendorId, gstin: vendor?.gstin ?? null, state: vendor?.state ?? null,
      taxable: Number(b.taxable), cgst: Number(b.cgst), sgst: Number(b.sgst), igst: Number(b.igst), gross, paid, balance: gross - paid,
      status: paid >= gross ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID",
    };
  });
}

// Payables ageing — same pattern receivablesAgeing above uses, from the Vendor side: distinct
// vendors with any non-cancelled/non-paid bill -> bucket each bill's overdue-vs-dueDate amount.
// Reuses SeeraVendorBill.dueDate directly (vendor360's own per-vendor ageing logic, applied
// company-wide instead of one vendor at a time).
export async function payablesAgeing(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const now = new Date();
  const bills = await db.seeraVendorBill.findMany({ where: { status: { notIn: ["PAID", "CANCELLED"] } }, select: { vendorId: true, dueDate: true, grossAmount: true, paidAmount: true } });
  const vendorIds = [...new Set(bills.map((b) => b.vendorId))];
  const vendors = vendorIds.length ? await db.seeraVendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, legalName: true, tradeName: true } }) : [];
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const buckets = { NOT_DUE: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_PLUS": 0 };
  const totalByVendor = new Map<string, number>();
  for (const bill of bills) {
    const due = Math.max(0, Number(bill.grossAmount) - Number(bill.paidAmount));
    if (due <= 0) continue;
    const bucket = ageingBucket(bill.dueDate, now);
    buckets[bucket] += due;
    totalByVendor.set(bill.vendorId, (totalByVendor.get(bill.vendorId) ?? 0) + due);
  }
  const rows = [...totalByVendor.entries()].map(([vendorId, outstandingTotal]) => {
    const vendor = vendorById.get(vendorId);
    return { partyType: "VENDOR", partyId: vendorId, name: vendor?.tradeName ?? vendor?.legalName ?? vendorId, outstandingTotal };
  }).sort((a, b) => b.outstandingTotal - a.outstandingTotal);
  return { rows, buckets };
}

export async function companySalesByProduct(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const docs = await db.seeraCommercialDocument.findMany({ where: { issuerType: "COMPANY", status: "ISSUED", type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE"] }, issueDate: { gte: input.from, lte: input.to } }, select: { lineSnapshot: true } });
  const byProduct = new Map<string, number>();
  for (const d of docs) {
    const lines = (d.lineSnapshot as { description?: string; productNameSnapshot?: string; total?: number; lineTotal?: number }[]) ?? [];
    for (const line of lines) { const name = line.productNameSnapshot ?? line.description ?? "Unknown"; const amount = line.lineTotal ?? line.total ?? 0; byProduct.set(name, (byProduct.get(name) ?? 0) + amount); }
  }
  return [...byProduct.entries()].map(([product, total]) => ({ product, total })).sort((a, b) => b.total - a.total);
}
