import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";

// Global Finance Search (spec §14/§45) — no raw UUID required from the user;
// every result links straight to its detail via a stable, human-facing key.
export async function financeGlobalSearch(db: PrismaClient, actorId: string, query: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  const q = query.trim();
  if (q.length < 2) return { vendorBills: [], expenses: [], journals: [], vendors: [], treasuryAccounts: [], documents: [], loans: [] };
  const amount = Number(q.replace(/[^0-9.]/g, ""));
  const hasAmount = !Number.isNaN(amount) && amount > 0 && /[0-9]/.test(q);

  const [vendorBills, expenses, journals, vendors, treasuryAccounts, documents, loans] = await Promise.all([
    db.seeraVendorBill.findMany({ where: { OR: [{ vendorInvoiceNumber: { contains: q, mode: "insensitive" } }, { billNumber: { contains: q, mode: "insensitive" } }, ...(hasAmount ? [{ grossAmount: amount }] : [])] }, include: { vendor: true }, take: 10 }),
    db.seeraExpense.findMany({ where: { OR: [{ expenseNumber: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, ...(hasAmount ? [{ amount }] : [])] }, take: 10 }),
    db.seeraJournalEntry.findMany({ where: { OR: [{ journalNumber: { contains: q, mode: "insensitive" } }, { narration: { contains: q, mode: "insensitive" } }] }, take: 10 }),
    db.seeraVendor.findMany({ where: { OR: [{ legalName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { gstin: { contains: q, mode: "insensitive" } }] }, take: 10 }),
    db.seeraTreasuryAccount.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }, take: 10 }),
    db.seeraCommercialDocument.findMany({ where: { issuerType: "COMPANY", documentNumber: { contains: q, mode: "insensitive" } }, take: 10 }),
    db.seeraLoan.findMany({ where: { lenderName: { contains: q, mode: "insensitive" } }, take: 10 }),
  ]);

  return {
    vendorBills: vendorBills.map((b) => ({ id: b.id, label: `${b.billNumber} — ${b.vendor.legalName} (${b.vendorInvoiceNumber})`, amount: Number(b.grossAmount) })),
    expenses: expenses.map((e) => ({ id: e.id, label: `${e.expenseNumber} — ${e.description ?? e.payeeName ?? ""}`, amount: Number(e.amount) })),
    journals: journals.map((j) => ({ id: j.id, label: `${j.journalNumber} — ${j.narration}` })),
    vendors: vendors.map((v) => ({ id: v.id, label: `${v.legalName} (${v.code})` })),
    treasuryAccounts: treasuryAccounts.map((t) => ({ id: t.id, label: `${t.name} (${t.code})` })),
    documents: documents.map((d) => ({ id: d.id, label: `${d.documentNumber} — ${d.type}` })),
    loans: loans.map((l) => ({ id: l.id, label: `${l.lenderName} — ₹${Number(l.outstanding).toLocaleString("en-IN")} outstanding` })),
  };
}
