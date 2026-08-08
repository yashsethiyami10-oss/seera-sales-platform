import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal, requireFinancialReportingPrincipal } from "./context";
import { sumDecimal } from "./domain";
import { postSystemGeneratedJournalInTx } from "./posting-engine";
import {
  allocationInput, customerAccountInput, customerReceiptInput, pageInput, receivableInvoiceDraftInput,
} from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Stage B) — Accounts Receivable.
 * Reuses the existing, authoritative `Customer` model directly (no
 * duplicate customer identity — Section 19). Invoice issuance and receipt
 * recording post immediately through `postSystemGeneratedJournalInTx`
 * (Section 19: "AR must post through the authoritative Posting Engine"),
 * since these are already-authorized system-generated business events, not
 * manually-drafted journals needing the general DRAFT->APPROVED workflow.
 *
 * Deferred, disclosed scope (see docs/enterprise-phase2/
 * PART_3C_ENTERPRISE_FINANCE_PLATFORM.md "Known limitations"): credit
 * notes, write-off request/approval, and discount-amount posting are not
 * implemented this pass — `discountAmount` always posts as zero.
 */

async function getFinanceConfigurationOrThrow(tx: EnterpriseTx, organizationKey: string) {
  const configuration = await tx.financeConfiguration.findUnique({ where: { organizationKey } });
  if (!configuration || configuration.status !== "ACTIVE") {
    throw new AppError("Finance configuration must be active before AR can post", 422, "FINANCE_CONFIGURATION_NOT_READY");
  }
  if (!configuration.arControlAccountId) throw new AppError("An AR control account must be configured", 422, "AR_CONTROL_ACCOUNT_MISSING");
  return configuration;
}

export async function getOrCreateCustomerAccount(input: unknown) {
  const data = customerAccountInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const existing = await tx.financeCustomerAccount.findUnique({ where: { organizationKey_customerId: { organizationKey: principal.organizationKey, customerId: data.customerId } } });
    if (existing) return existing;
    const created = await tx.financeCustomerAccount.create({
      data: { organizationKey: principal.organizationKey, customerId: data.customerId, creditLimit: data.creditLimit, paymentTermsDays: data.paymentTermsDays, createdById: principal.id },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "CUSTOMER_ACCOUNT_CREATED", entityType: "FinanceCustomerAccount", entityId: created.id,
      description: "Customer finance account created",
    });
    return created;
  });
}

/**
 * Creates an invoice draft with its lines in one call and issues it
 * immediately (Section 17's separate create-draft/update-draft/issue steps
 * are collapsed to one atomic operation for this pass — the underlying
 * `FinanceReceivableInvoice.status` model still has a real DRAFT state,
 * reachable by any future caller, but no Business Service here leaves an
 * invoice sitting in DRAFT). Balances: totalAmount = subtotal + taxAmount
 * (discountAmount is always 0 this pass); posts one journal debiting the
 * AR control account for totalAmount, crediting each line's revenue
 * account, and crediting the output-tax control account for taxAmount.
 */
export async function createAndIssueReceivableInvoice(input: unknown, idempotencyKey: string) {
  const data = receivableInvoiceDraftInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_MANAGE);
  if (data.dueDate < data.issueDate) throw new AppError("dueDate cannot precede issueDate", 422, "INVALID_DUE_DATE");

  return enterpriseTransaction(async (tx) => {
    const configuration = await getFinanceConfigurationOrThrow(tx, principal.organizationKey);
    if (data.taxAmount.greaterThan(0) && !configuration.outputTaxControlAccountId) {
      throw new AppError("An output tax control account must be configured to post a taxed invoice", 422, "OUTPUT_TAX_CONTROL_ACCOUNT_MISSING");
    }

    const customerAccount = await tx.financeCustomerAccount.findUnique({ where: { organizationKey_customerId: { organizationKey: principal.organizationKey, customerId: data.customerId } } });
    if (!customerAccount) throw new NotFoundError("Customer finance account (create one first)");

    const subtotal = sumDecimal(data.lines.map((line) => line.unitPrice.times(line.quantity)));
    const totalAmount = subtotal.plus(data.taxAmount);

    const invoiceNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "AR_INVOICE", "INV");
    const invoice = await tx.financeReceivableInvoice.create({
      data: {
        organizationKey: principal.organizationKey, invoiceNumber, customerAccountId: customerAccount.id,
        sourceOrderId: data.sourceOrderId, issueDate: data.issueDate, dueDate: data.dueDate, currency: data.currency,
        subtotal, discountAmount: new Prisma.Decimal(0), taxAmount: data.taxAmount, totalAmount, outstandingAmount: totalAmount,
        status: "DRAFT", createdById: principal.id,
      },
    });

    for (let index = 0; index < data.lines.length; index += 1) {
      const line = data.lines[index]!;
      await tx.financeReceivableInvoiceLine.create({
        data: {
          organizationKey: principal.organizationKey, invoiceId: invoice.id, lineNumber: index + 1,
          description: line.description, quantity: line.quantity, unitPrice: line.unitPrice,
          lineAmount: line.unitPrice.times(line.quantity), accountId: line.accountId,
        },
      });
    }

    const journalLines = data.lines.map((line) => ({
      accountId: line.accountId, debitAmount: new Prisma.Decimal(0), creditAmount: line.unitPrice.times(line.quantity),
      description: line.description,
    }));
    journalLines.unshift({ accountId: configuration.arControlAccountId!, debitAmount: totalAmount, creditAmount: new Prisma.Decimal(0), description: `AR invoice ${invoiceNumber}` });
    if (data.taxAmount.greaterThan(0)) {
      journalLines.push({ accountId: configuration.outputTaxControlAccountId!, debitAmount: new Prisma.Decimal(0), creditAmount: data.taxAmount, description: "Output tax" });
    }

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "AR_INVOICE", postingDate: data.issueDate, documentDate: data.issueDate, currency: data.currency,
      description: `AR invoice ${invoiceNumber} issued`, sourceType: "AR_INVOICE", sourceId: invoice.id,
      idempotencyKey, lines: journalLines,
    });

    const issued = await tx.financeReceivableInvoice.update({
      where: { id: invoice.id },
      data: { status: "ISSUED", journalId: journal.id, issuedById: principal.id, issuedAt: new Date(), version: { increment: 1 } },
    });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AR_INVOICE_ISSUED", entityType: "FinanceReceivableInvoice", entityId: issued.id,
      description: `Invoice ${invoiceNumber} issued for ${totalAmount.toString()}`, next: { totalAmount: totalAmount.toString() },
    });

    return tx.financeReceivableInvoice.findUniqueOrThrow({ where: { id: issued.id }, include: { lines: true } });
  });
}

export async function recordCustomerReceipt(input: unknown, idempotencyKey: string) {
  const data = customerReceiptInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const configuration = await getFinanceConfigurationOrThrow(tx, principal.organizationKey);
    if (!configuration.defaultCashAccountId && !configuration.defaultBankAccountId) {
      throw new AppError("A default cash or bank account must be configured to record a receipt", 422, "CASH_ACCOUNT_MISSING");
    }
    const depositAccountId = configuration.defaultBankAccountId ?? configuration.defaultCashAccountId!;

    const customerAccount = await tx.financeCustomerAccount.findUnique({ where: { organizationKey_customerId: { organizationKey: principal.organizationKey, customerId: data.customerId } } });
    if (!customerAccount) throw new NotFoundError("Customer finance account (create one first)");

    const receiptNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "AR_RECEIPT", "RCT");
    const receipt = await tx.financeCustomerReceipt.create({
      data: {
        organizationKey: principal.organizationKey, receiptNumber, customerAccountId: customerAccount.id,
        receiptDate: data.receiptDate, amount: data.amount, unallocatedAmount: data.amount, currency: data.currency,
        paymentMethod: data.paymentMethod, reference: data.reference, status: "RECORDED", createdById: principal.id,
      },
    });

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "AR_RECEIPT", postingDate: data.receiptDate, currency: data.currency,
      description: `Receipt ${receiptNumber} recorded`, sourceType: "AR_RECEIPT", sourceId: receipt.id, idempotencyKey,
      lines: [
        { accountId: depositAccountId, debitAmount: data.amount, creditAmount: new Prisma.Decimal(0), description: `Receipt ${receiptNumber}` },
        { accountId: configuration.arControlAccountId!, debitAmount: new Prisma.Decimal(0), creditAmount: data.amount, description: `Receipt ${receiptNumber}` },
      ],
    });

    const updated = await tx.financeCustomerReceipt.update({ where: { id: receipt.id }, data: { journalId: journal.id, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AR_RECEIPT_RECORDED", entityType: "FinanceCustomerReceipt", entityId: updated.id,
      description: `Receipt ${receiptNumber} recorded for ${data.amount.toString()}`,
    });
    return updated;
  });
}

/** Allocates part or all of a receipt's unallocated balance to an open
 * invoice. Rejects over-allocation against either the receipt's remaining
 * balance or the invoice's remaining outstanding amount (Section 19). */
export async function allocateReceipt(receiptId: string, receiptExpectedVersion: number, input: unknown) {
  const data = allocationInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_MANAGE);
  if (data.amount.lessThanOrEqualTo(0)) throw new AppError("Allocation amount must be positive", 422, "INVALID_ALLOCATION_AMOUNT");

  return enterpriseTransaction(async (tx) => {
    const receipt = await tx.financeCustomerReceipt.findFirst({ where: { id: receiptId, organizationKey: principal.organizationKey } });
    if (!receipt) throw new NotFoundError("Receipt");
    requireVersion(receipt.version, receiptExpectedVersion);

    const invoice = await tx.financeReceivableInvoice.findFirst({ where: { id: data.invoiceId, organizationKey: principal.organizationKey } });
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.customerAccountId !== receipt.customerAccountId) throw new ConflictError("Receipt and invoice belong to different customer accounts");
    if (!["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) throw new ConflictError("This invoice is not open for allocation");

    if (data.amount.greaterThan(receipt.unallocatedAmount)) throw new ConflictError("Allocation amount exceeds the receipt's unallocated balance");
    if (data.amount.greaterThan(invoice.outstandingAmount)) throw new ConflictError("Allocation amount exceeds the invoice's outstanding balance");

    const allocation = await tx.financeReceiptAllocation.create({
      data: { organizationKey: principal.organizationKey, receiptId: receipt.id, invoiceId: invoice.id, allocatedAmount: data.amount, allocatedById: principal.id },
    });

    const newReceiptUnallocated = receipt.unallocatedAmount.minus(data.amount);
    const newInvoiceOutstanding = invoice.outstandingAmount.minus(data.amount);
    await tx.financeCustomerReceipt.update({
      where: { id: receipt.id },
      data: { unallocatedAmount: newReceiptUnallocated, status: newReceiptUnallocated.equals(0) ? "ALLOCATED" : "PARTIALLY_ALLOCATED", version: { increment: 1 } },
    });
    const updatedInvoice = await tx.financeReceivableInvoice.update({
      where: { id: invoice.id },
      data: { outstandingAmount: newInvoiceOutstanding, status: newInvoiceOutstanding.equals(0) ? "PAID" : "PARTIALLY_PAID", version: { increment: 1 } },
    });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AR_RECEIPT_ALLOCATED", entityType: "FinanceReceiptAllocation", entityId: allocation.id,
      description: `${data.amount.toString()} allocated from receipt ${receipt.receiptNumber} to invoice ${invoice.invoiceNumber}`,
      next: { invoiceStatus: updatedInvoice.status },
    });
    return allocation;
  });
}

/**
 * Reverses an allocation via a new, opposite-signed row. The original
 * allocation row is *never* updated or deleted — `finance_receipt_
 * allocations` has an unconditional, database-level append-only trigger
 * (the same one protecting `finance_ledger_entries`), so "already
 * reversed" is answered by querying for an existing reversal row that
 * references it, not by a mutable status flag stored on the original.
 * (An earlier version of this function tried to flip the original row's
 * `status` to "REVERSED" via UPDATE — the trigger correctly rejected it;
 * caught by this function's own runtime test.)
 */
export async function reverseAllocation(allocationId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const original = await tx.financeReceiptAllocation.findFirst({ where: { id: allocationId, organizationKey: principal.organizationKey } });
    if (!original) throw new NotFoundError("Allocation");
    if (original.status === "REVERSAL") throw new AppError("A reversal row cannot itself be reversed", 422, "CANNOT_REVERSE_A_REVERSAL");
    const existingReversal = await tx.financeReceiptAllocation.findFirst({ where: { reversalOfAllocationId: original.id, organizationKey: principal.organizationKey } });
    if (existingReversal) throw new ConflictError("This allocation has already been reversed");

    const [receipt, invoice] = await Promise.all([
      tx.financeCustomerReceipt.findUniqueOrThrow({ where: { id: original.receiptId } }),
      tx.financeReceivableInvoice.findUniqueOrThrow({ where: { id: original.invoiceId } }),
    ]);

    const reversal = await tx.financeReceiptAllocation.create({
      data: {
        organizationKey: principal.organizationKey, receiptId: original.receiptId, invoiceId: original.invoiceId,
        allocatedAmount: original.allocatedAmount, status: "REVERSAL", reversalOfAllocationId: original.id, allocatedById: principal.id,
      },
    });

    const newReceiptUnallocated = receipt.unallocatedAmount.plus(original.allocatedAmount);
    const newInvoiceOutstanding = invoice.outstandingAmount.plus(original.allocatedAmount);
    await tx.financeCustomerReceipt.update({
      where: { id: receipt.id },
      data: { unallocatedAmount: newReceiptUnallocated, status: newReceiptUnallocated.equals(receipt.amount) ? "RECORDED" : "PARTIALLY_ALLOCATED", version: { increment: 1 } },
    });
    await tx.financeReceivableInvoice.update({
      where: { id: invoice.id },
      data: { outstandingAmount: newInvoiceOutstanding, status: newInvoiceOutstanding.equals(invoice.totalAmount) ? "ISSUED" : "PARTIALLY_PAID", version: { increment: 1 } },
    });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AR_ALLOCATION_REVERSED", entityType: "FinanceReceiptAllocation", entityId: reversal.id,
      description: `Allocation ${original.id} reversed`, previous: { allocationId: original.id },
    });
    return reversal;
  });
}

export async function getCustomerBalance(customerId: string) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_RECEIVABLES_VIEW);
  return enterpriseTransaction(async (tx) => {
    const customerAccount = await tx.financeCustomerAccount.findUnique({ where: { organizationKey_customerId: { organizationKey: principal.organizationKey, customerId } } });
    if (!customerAccount) throw new NotFoundError("Customer finance account");
    const result = await tx.financeReceivableInvoice.aggregate({
      where: { organizationKey: principal.organizationKey, customerAccountId: customerAccount.id, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      _sum: { outstandingAmount: true },
    });
    return { customerAccountId: customerAccount.id, outstandingBalance: result._sum.outstandingAmount ?? new Prisma.Decimal(0) };
  });
}

export type ArAgingBucket = "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_90_PLUS";

/** Aging is computed as of an explicit `asOfDate`, never the implicit
 * current time, per Section 19's reproducibility requirement. */
export async function getReceivablesAging(asOfDate: Date) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_RECEIVABLES_VIEW);
  return enterpriseTransaction(async (tx) => {
    const openInvoices = await tx.financeReceivableInvoice.findMany({
      where: { organizationKey: principal.organizationKey, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      take: 5000,
    });
    const buckets: Record<ArAgingBucket, Prisma.Decimal> = {
      CURRENT: new Prisma.Decimal(0), DAYS_1_30: new Prisma.Decimal(0), DAYS_31_60: new Prisma.Decimal(0),
      DAYS_61_90: new Prisma.Decimal(0), DAYS_90_PLUS: new Prisma.Decimal(0),
    };
    const rows = openInvoices.map((invoice) => {
      const daysOverdue = Math.floor((asOfDate.getTime() - invoice.dueDate.getTime()) / 86400000);
      let bucket: ArAgingBucket = "CURRENT";
      if (daysOverdue > 90) bucket = "DAYS_90_PLUS";
      else if (daysOverdue > 60) bucket = "DAYS_61_90";
      else if (daysOverdue > 30) bucket = "DAYS_31_60";
      else if (daysOverdue > 0) bucket = "DAYS_1_30";
      buckets[bucket] = buckets[bucket].plus(invoice.outstandingAmount);
      return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, customerAccountId: invoice.customerAccountId, dueDate: invoice.dueDate, outstandingAmount: invoice.outstandingAmount, daysOverdue, bucket };
    });
    return { asOfDate, buckets, rows };
  });
}

export async function listReceivableInvoices(input: unknown) {
  const params = pageInput.parse(input ?? {});
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_VIEW);
  return enterpriseTransaction(async (tx) => {
    const pageSize = Math.min(params.pageSize, 100);
    const where = { organizationKey: principal.organizationKey, status: params.status };
    const [total, items] = await Promise.all([
      tx.financeReceivableInvoice.count({ where }),
      tx.financeReceivableInvoice.findMany({ where, orderBy: [{ issueDate: "desc" }, { id: "desc" }], skip: (params.page - 1) * pageSize, take: pageSize }),
    ]);
    return { items, total, page: params.page, pageSize };
  });
}

/** A chronological statement of every invoice and receipt for a customer,
 * bounded and organization-scoped (Section 23). */
export async function getCustomerStatement(customerId: string) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_RECEIVABLES_VIEW);
  return enterpriseTransaction(async (tx) => {
    const customerAccount = await tx.financeCustomerAccount.findUnique({ where: { organizationKey_customerId: { organizationKey: principal.organizationKey, customerId } } });
    if (!customerAccount) throw new NotFoundError("Customer finance account");

    const [invoices, receipts] = await Promise.all([
      tx.financeReceivableInvoice.findMany({ where: { organizationKey: principal.organizationKey, customerAccountId: customerAccount.id }, orderBy: [{ issueDate: "asc" }], take: 5000 }),
      tx.financeCustomerReceipt.findMany({ where: { organizationKey: principal.organizationKey, customerAccountId: customerAccount.id }, orderBy: [{ receiptDate: "asc" }], take: 5000 }),
    ]);

    const entries = [
      ...invoices.map((invoice) => ({ type: "INVOICE" as const, date: invoice.issueDate, reference: invoice.invoiceNumber, amount: invoice.totalAmount, status: invoice.status })),
      ...receipts.map((receipt) => ({ type: "RECEIPT" as const, date: receipt.receiptDate, reference: receipt.receiptNumber, amount: receipt.amount, status: receipt.status })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return { customerAccountId: customerAccount.id, entries };
  });
}
