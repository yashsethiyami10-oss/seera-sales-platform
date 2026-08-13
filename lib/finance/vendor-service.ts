import type { PrismaClient, VendorBillStatus } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournal, postJournalInTx, type JournalLineInput } from "./journal-service";
import { accountByCode } from "./chart-of-accounts";
import { financeNumberFor } from "./numbering";

export async function createVendor(db: PrismaClient, actorId: string, input: { code: string; legalName: string; tradeName?: string; gstin?: string; pan?: string; contactPerson?: string; phone?: string; email?: string; address?: object; state?: string; stateCode?: string; paymentTermsDays?: number; category?: string }) {
  await authorize(db, { actorId, permission: "vendor:manage" });
  const existing = await db.seeraVendor.findUnique({ where: { code: input.code } });
  if (existing) throw new FoundationError("VENDOR_CODE_EXISTS", "A vendor with this code already exists", 409);
  const vendor = await db.seeraVendor.create({ data: { ...input, address: input.address as never, paymentTermsDays: input.paymentTermsDays ?? 30 } });
  await recordAudit(db, { actorId, action: "finance.vendor.created", entityType: "SeeraVendor", entityId: vendor.id, afterState: { code: vendor.code, legalName: vendor.legalName } });
  return vendor;
}

export async function updateVendor(db: PrismaClient, actorId: string, vendorId: string, input: Partial<{ legalName: string; tradeName: string; gstin: string; pan: string; contactPerson: string; phone: string; email: string; state: string; stateCode: string; paymentTermsDays: number; category: string; isActive: boolean }>) {
  await authorize(db, { actorId, permission: "vendor:manage" });
  const before = await db.seeraVendor.findUniqueOrThrow({ where: { id: vendorId } });
  const after = await db.seeraVendor.update({ where: { id: vendorId }, data: input });
  await recordAudit(db, { actorId, action: "finance.vendor.updated", entityType: "SeeraVendor", entityId: vendorId, beforeState: { legalName: before.legalName, isActive: before.isActive }, afterState: { legalName: after.legalName, isActive: after.isActive } });
  return after;
}

export async function listVendors(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "vendor:manage" });
  return db.seeraVendor.findMany({ orderBy: { legalName: "asc" } });
}

export async function vendor360(db: PrismaClient, actorId: string, vendorId: string) {
  await authorize(db, { actorId, permission: "vendor:manage" });
  const [vendor, bills, payments] = await Promise.all([
    db.seeraVendor.findUniqueOrThrow({ where: { id: vendorId } }),
    db.seeraVendorBill.findMany({ where: { vendorId }, orderBy: { invoiceDate: "desc" } }),
    db.seeraVendorPayment.findMany({ where: { vendorId }, orderBy: { paymentDate: "desc" } }),
  ]);
  const outstanding = bills.filter((b) => b.status !== "PAID" && b.status !== "CANCELLED").reduce((s, b) => s + Number(b.grossAmount) - Number(b.paidAmount), 0);
  const spend = bills.filter((b) => b.status !== "CANCELLED").reduce((s, b) => s + Number(b.grossAmount), 0);
  const now = new Date();
  const ageing = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const bill of bills) {
    if (bill.status === "PAID" || bill.status === "CANCELLED") continue;
    const due = Math.max(0, Number(bill.grossAmount) - Number(bill.paidAmount));
    if (due <= 0) continue;
    const daysOverdue = Math.floor((now.getTime() - bill.dueDate.getTime()) / 86_400_000);
    if (daysOverdue <= 0) ageing.current += due;
    else if (daysOverdue <= 30) ageing.d1_30 += due;
    else if (daysOverdue <= 60) ageing.d31_60 += due;
    else if (daysOverdue <= 90) ageing.d61_90 += due;
    else ageing.d90plus += due;
  }
  return { vendor, bills, payments, outstanding, spend, ageing };
}

// Class B (accounting document/obligation): Dr Purchase/Expense account + Dr
// Input GST, Cr Trade Payables. Never posts cash — see recordVendorPayment for
// the Class C event that actually moves money.
export async function createVendorBill(
  db: PrismaClient,
  actorId: string,
  input: { vendorId: string; vendorInvoiceNumber: string; invoiceDate: Date; dueDate: Date; category: string; description?: string; taxable: number; cgst?: number; sgst?: number; igst?: number; dimensionId?: string; documentFileId?: string; idempotencyKey: string },
) {
  await authorize(db, { actorId, permission: "vendor_bill:manage" });
  const duplicate = await db.seeraVendorBill.findUnique({ where: { vendorId_vendorInvoiceNumber: { vendorId: input.vendorId, vendorInvoiceNumber: input.vendorInvoiceNumber } } });
  if (duplicate) throw new FoundationError("DUPLICATE_VENDOR_INVOICE", "This vendor invoice number has already been recorded", 409);
  const cgst = input.cgst ?? 0;
  const sgst = input.sgst ?? 0;
  const igst = input.igst ?? 0;
  const grossAmount = input.taxable + cgst + sgst + igst;
  const expenseAccount = await accountByCode(db, input.category);

  return db.$transaction(async (tx) => {
    const bill = await tx.seeraVendorBill.create({
      data: { billNumber: financeNumberFor("VB", input.idempotencyKey), vendorId: input.vendorId, vendorInvoiceNumber: input.vendorInvoiceNumber, invoiceDate: input.invoiceDate, dueDate: input.dueDate, category: input.category, description: input.description, taxable: input.taxable, cgst, sgst, igst, grossAmount, status: "APPROVED", dimensionId: input.dimensionId, documentFileId: input.documentFileId, actorId, idempotencyKey: input.idempotencyKey },
    });
    const lines: JournalLineInput[] = [{ accountId: expenseAccount.code, debit: input.taxable, dimensionId: input.dimensionId, description: input.description }];
    if (cgst > 0) lines.push({ accountId: (await accountByCode(tx as never, "1401")).code, debit: cgst, dimensionId: input.dimensionId, description: "Input CGST" });
    if (sgst > 0) lines.push({ accountId: (await accountByCode(tx as never, "1402")).code, debit: sgst, dimensionId: input.dimensionId, description: "Input SGST" });
    if (igst > 0) lines.push({ accountId: (await accountByCode(tx as never, "1403")).code, debit: igst, dimensionId: input.dimensionId, description: "Input IGST" });
    lines.push({ accountId: "2000", credit: grossAmount, partyType: "VENDOR", partyId: input.vendorId, dimensionId: input.dimensionId, description: input.vendorInvoiceNumber });
    const journal = await postJournalInTx(tx, actorId, { date: input.invoiceDate, sourceType: "VENDOR_BILL", sourceId: bill.id, narration: `Vendor bill ${input.vendorInvoiceNumber}`, idempotencyKey: `${input.idempotencyKey}:journal`, lines });
    const posted = await tx.seeraVendorBill.update({ where: { id: bill.id }, data: { journalId: journal.id } });
    await recordAudit(tx, { actorId, action: "finance.vendor_bill.created", entityType: "SeeraVendorBill", entityId: bill.id, afterState: { vendorId: input.vendorId, grossAmount } });
    return posted;
  });
}

export async function recordVendorPayment(db: PrismaClient, actorId: string, input: { vendorId: string; billId?: string; amount: number; treasuryAccountId: string; treasuryAccountCoaCode: string; paymentMode: string; reference?: string; paymentDate: Date; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "vendor_payment:record" });
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);

  return db.$transaction(async (tx) => {
    let bill = null;
    if (input.billId) {
      bill = await tx.seeraVendorBill.findUniqueOrThrow({ where: { id: input.billId } });
      const due = Number(bill.grossAmount) - Number(bill.paidAmount);
      if (input.amount > due) throw new FoundationError("PAYMENT_EXCEEDS_DUE", "Payment exceeds the amount due on this bill", 400);
    }
    const payment = await tx.seeraVendorPayment.create({ data: { paymentNumber: financeNumberFor("VP", input.idempotencyKey), vendorId: input.vendorId, billId: input.billId, amount: input.amount, treasuryAccountId: input.treasuryAccountId, paymentMode: input.paymentMode, reference: input.reference, paymentDate: input.paymentDate, actorId, idempotencyKey: input.idempotencyKey } });
    const journal = await postJournalInTx(tx, actorId, {
      date: input.paymentDate,
      sourceType: "VENDOR_PAYMENT",
      sourceId: payment.id,
      narration: `Vendor payment — ${input.reference ?? input.paymentMode}`,
      idempotencyKey: `${input.idempotencyKey}:journal`,
      lines: [
        { accountId: "2000", debit: input.amount, partyType: "VENDOR", partyId: input.vendorId, treasuryAccountId: undefined, description: input.reference },
        { accountId: input.treasuryAccountCoaCode, credit: input.amount, treasuryAccountId: input.treasuryAccountId, description: input.reference },
      ],
    });
    await tx.seeraVendorPayment.update({ where: { id: payment.id }, data: { journalId: journal.id } });
    if (bill) {
      const newPaid = Number(bill.paidAmount) + input.amount;
      const status: VendorBillStatus = newPaid >= Number(bill.grossAmount) ? "PAID" : "PARTIALLY_PAID";
      await tx.seeraVendorBill.update({ where: { id: bill.id }, data: { paidAmount: newPaid, status } });
    }
    await recordAudit(tx, { actorId, action: "finance.vendor_payment.recorded", entityType: "SeeraVendorPayment", entityId: payment.id, afterState: { vendorId: input.vendorId, amount: input.amount, billId: input.billId } });
    return payment;
  });
}

export async function payablesView(db: PrismaClient, actorId: string, filter?: "DUE_TODAY" | "DUE_7_DAYS" | "OVERDUE" | "PARTIALLY_PAID" | "PAID") {
  await authorize(db, { actorId, permission: "vendor_bill:manage" });
  const now = new Date();
  const bills = await db.seeraVendorBill.findMany({ where: { status: { not: "CANCELLED" } }, include: { vendor: true }, orderBy: { dueDate: "asc" } });
  const withDue = bills.map((b) => ({ ...b, due: Number(b.grossAmount) - Number(b.paidAmount) }));
  switch (filter) {
    case "DUE_TODAY":
      return withDue.filter((b) => b.due > 0 && b.dueDate.toDateString() === now.toDateString());
    case "DUE_7_DAYS":
      return withDue.filter((b) => b.due > 0 && b.dueDate.getTime() - now.getTime() <= 7 * 86_400_000 && b.dueDate.getTime() >= now.getTime());
    case "OVERDUE":
      return withDue.filter((b) => b.due > 0 && b.dueDate < now);
    case "PARTIALLY_PAID":
      return withDue.filter((b) => b.status === "PARTIALLY_PAID");
    case "PAID":
      return withDue.filter((b) => b.status === "PAID");
    default:
      return withDue;
  }
}
