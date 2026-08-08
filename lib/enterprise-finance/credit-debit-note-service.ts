import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireFinancePrincipal } from "./context";
import { postSystemGeneratedJournalInTx } from "./posting-engine";

/**
 * Milestone 8 — Credit Notes / Debit Notes. Explicitly deferred by Part 3C's
 * own freeze document; built here as first-class documents with the same
 * Draft->Approve->Post discipline as every other Part 3C document, never
 * conflated with a refund (a refund moves cash/bank; a Credit Note only
 * ever reduces what a customer owes — allocation against an invoice is a
 * separate, explicit step, and a cash payout on top of a credit note is a
 * FinanceCashVoucher, not part of this flow).
 */

const creditNoteInput = z.object({
  customerAccountId: z.string().cuid(),
  invoiceId: z.string().cuid().optional(),
  reasonCode: z.string().min(2).max(80),
  lines: z.array(z.object({
    description: z.string().min(1).max(300), quantity: z.coerce.number().positive().optional(), unitPrice: z.coerce.number().nonnegative().optional(),
    discountAmount: z.coerce.number().nonnegative().default(0), taxAmount: z.coerce.number().nonnegative().default(0),
    lineAmount: z.coerce.number().positive(), accountId: z.string().cuid(),
  })).min(1),
});

export async function createCreditNoteDraft(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CREDIT_NOTES_MANAGE);
  const data = creditNoteInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const customerAccount = await tx.financeCustomerAccount.findFirst({ where: { id: data.customerAccountId, organizationKey: principal.organizationKey } });
    if (!customerAccount) throw new NotFoundError("Customer account");
    const totalAmount = data.lines.reduce((sum, l) => sum.plus(l.lineAmount), new Prisma.Decimal(0));
    const creditNoteNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "CREDIT_NOTE", "CN");
    const entity = await tx.financeCreditNote.create({
      data: {
        organizationKey: principal.organizationKey, creditNoteNumber, customerAccountId: data.customerAccountId, invoiceId: data.invoiceId,
        reasonCode: data.reasonCode, totalAmount, createdById: principal.id,
        lines: { create: data.lines.map((l, i) => ({ organizationKey: principal.organizationKey, lineNumber: i + 1, ...l })) },
      },
      include: { lines: true },
    });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "CREDIT_NOTE_CREATED", entityType: "FinanceCreditNote", entityId: entity.id, description: `Credit note ${creditNoteNumber} drafted`, next: { totalAmount: totalAmount.toString() } });
    return entity;
  });
}

export async function approveCreditNote(id: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeCreditNote.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Credit note");
    if (current.version !== expectedVersion) throw new ConflictError("Record changed; refresh and retry");
    if (current.status !== "DRAFT") throw new AppError("Only a draft credit note can be approved", 409, "INVALID_TRANSITION");
    const entity = await tx.financeCreditNote.update({ where: { id }, data: { status: "APPROVED", approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "CREDIT_NOTE_APPROVED", entityType: "FinanceCreditNote", entityId: id, description: `Credit note ${current.creditNoteNumber} approved` });
    return entity;
  });
}

/** AR_CREDIT_NOTE journal: Dr the lines' own revenue/discount accounts, Cr Accounts Receivable — reduces AR, never touches cash/bank. */
export async function postCreditNote(id: string, expectedVersion: number, arAccountCode = "1100") {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_POST);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeCreditNote.findFirst({ where: { id, organizationKey: principal.organizationKey }, include: { lines: true } });
    if (!current) throw new NotFoundError("Credit note");
    if (current.version !== expectedVersion) throw new ConflictError("Record changed; refresh and retry");
    if (current.status !== "APPROVED") throw new AppError("Only an approved credit note can be posted", 409, "INVALID_TRANSITION");
    const arAccount = await tx.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: arAccountCode, status: "ACTIVE" } });
    if (!arAccount) throw new AppError("Accounts Receivable control account is not configured");

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "CREDIT_NOTE", postingDate: new Date(), description: `Credit note ${current.creditNoteNumber}: ${current.reasonCode}`,
      sourceType: "FinanceCreditNote", sourceId: current.id, idempotencyKey: `finance_credit_note:POST:${current.id}`,
      lines: [
        ...current.lines.map((l) => ({ accountId: l.accountId, debitAmount: l.lineAmount, creditAmount: new Prisma.Decimal(0), description: l.description })),
        { accountId: arAccount.id, debitAmount: new Prisma.Decimal(0), creditAmount: current.totalAmount, description: `Credit note ${current.creditNoteNumber}` },
      ],
    });
    const entity = await tx.financeCreditNote.update({ where: { id }, data: { status: "POSTED", journalId: journal.id, version: { increment: 1 } } });
    return entity;
  });
}

export async function allocateCreditNote(creditNoteId: string, expectedVersion: number, input: { invoiceId: string; amount: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CREDIT_NOTES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const note = await tx.financeCreditNote.findFirst({ where: { id: creditNoteId, organizationKey: principal.organizationKey } });
    if (!note) throw new NotFoundError("Credit note");
    if (note.version !== expectedVersion) throw new ConflictError("Record changed; refresh and retry");
    if (note.status !== "POSTED") throw new AppError("Only a posted credit note can be allocated", 409, "INVALID_TRANSITION");
    const remaining = note.totalAmount.minus(note.allocatedAmount);
    const amount = new Prisma.Decimal(input.amount);
    if (amount.greaterThan(remaining)) throw new AppError(`Allocation exceeds remaining credit note balance (${remaining.toString()})`, 422, "VALIDATION_ERROR");
    const invoice = await tx.financeReceivableInvoice.findFirst({ where: { id: input.invoiceId, organizationKey: principal.organizationKey } });
    if (!invoice) throw new NotFoundError("Invoice");
    if (amount.greaterThan(invoice.outstandingAmount)) throw new AppError("Allocation exceeds invoice outstanding amount", 422, "VALIDATION_ERROR");

    await tx.financeCreditNoteAllocation.create({ data: { organizationKey: principal.organizationKey, creditNoteId, invoiceId: input.invoiceId, allocatedAmount: amount, allocatedById: principal.id } });
    await tx.financeCreditNote.update({ where: { id: creditNoteId }, data: { allocatedAmount: { increment: amount }, version: { increment: 1 } } });
    const updatedInvoice = await tx.financeReceivableInvoice.update({ where: { id: input.invoiceId }, data: { outstandingAmount: { decrement: amount }, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "CREDIT_NOTE_ALLOCATED", entityType: "FinanceCreditNote", entityId: creditNoteId, description: `Credit note ${note.creditNoteNumber} allocated ${amount.toString()} to invoice ${invoice.invoiceNumber}` });
    return { creditNote: note, invoice: updatedInvoice };
  });
}

export async function listCreditNotes(input: { status?: string; page?: number; pageSize?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.financeCreditNote.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeCreditNote.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

// --- Debit Notes (vendor-side mirror) ---

const debitNoteInput = z.object({
  vendorAccountId: z.string().cuid(),
  billId: z.string().cuid().optional(),
  reasonCode: z.string().min(2).max(80),
  lines: z.array(z.object({
    description: z.string().min(1).max(300), quantity: z.coerce.number().positive().optional(), unitPrice: z.coerce.number().nonnegative().optional(),
    taxAmount: z.coerce.number().nonnegative().default(0), lineAmount: z.coerce.number().positive(), accountId: z.string().cuid(),
  })).min(1),
});

export async function createDebitNoteDraft(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_DEBIT_NOTES_MANAGE);
  const data = debitNoteInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const vendorAccount = await tx.financeVendorAccount.findFirst({ where: { id: data.vendorAccountId, organizationKey: principal.organizationKey } });
    if (!vendorAccount) throw new NotFoundError("Vendor account");
    const totalAmount = data.lines.reduce((sum, l) => sum.plus(l.lineAmount), new Prisma.Decimal(0));
    const debitNoteNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "DEBIT_NOTE", "DN");
    const entity = await tx.financeDebitNote.create({
      data: {
        organizationKey: principal.organizationKey, debitNoteNumber, vendorAccountId: data.vendorAccountId, billId: data.billId,
        reasonCode: data.reasonCode, totalAmount, createdById: principal.id,
        lines: { create: data.lines.map((l, i) => ({ organizationKey: principal.organizationKey, lineNumber: i + 1, ...l })) },
      },
      include: { lines: true },
    });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "DEBIT_NOTE_CREATED", entityType: "FinanceDebitNote", entityId: entity.id, description: `Debit note ${debitNoteNumber} drafted`, next: { totalAmount: totalAmount.toString() } });
    return entity;
  });
}

export async function approveDebitNote(id: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeDebitNote.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Debit note");
    if (current.version !== expectedVersion) throw new ConflictError("Record changed; refresh and retry");
    if (current.status !== "DRAFT") throw new AppError("Only a draft debit note can be approved", 409, "INVALID_TRANSITION");
    const entity = await tx.financeDebitNote.update({ where: { id }, data: { status: "APPROVED", approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "DEBIT_NOTE_APPROVED", entityType: "FinanceDebitNote", entityId: id, description: `Debit note ${current.debitNoteNumber} approved` });
    return entity;
  });
}

/** AP_CREDIT-style journal: Dr Accounts Payable (reduces what we owe the vendor), Cr the lines' own accounts. */
export async function postDebitNote(id: string, expectedVersion: number, apAccountCode = "2000") {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_JOURNALS_POST);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeDebitNote.findFirst({ where: { id, organizationKey: principal.organizationKey }, include: { lines: true } });
    if (!current) throw new NotFoundError("Debit note");
    if (current.version !== expectedVersion) throw new ConflictError("Record changed; refresh and retry");
    if (current.status !== "APPROVED") throw new AppError("Only an approved debit note can be posted", 409, "INVALID_TRANSITION");
    const apAccount = await tx.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: apAccountCode, status: "ACTIVE" } });
    if (!apAccount) throw new AppError("Accounts Payable control account is not configured");

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "DEBIT_NOTE", postingDate: new Date(), description: `Debit note ${current.debitNoteNumber}: ${current.reasonCode}`,
      sourceType: "FinanceDebitNote", sourceId: current.id, idempotencyKey: `finance_debit_note:POST:${current.id}`,
      lines: [
        { accountId: apAccount.id, debitAmount: current.totalAmount, creditAmount: new Prisma.Decimal(0), description: `Debit note ${current.debitNoteNumber}` },
        ...current.lines.map((l) => ({ accountId: l.accountId, debitAmount: new Prisma.Decimal(0), creditAmount: l.lineAmount, description: l.description })),
      ],
    });
    const entity = await tx.financeDebitNote.update({ where: { id }, data: { status: "POSTED", journalId: journal.id, version: { increment: 1 } } });
    return entity;
  });
}

export async function listDebitNotes(input: { status?: string; page?: number; pageSize?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYABLES_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.financeDebitNote.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeDebitNote.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
