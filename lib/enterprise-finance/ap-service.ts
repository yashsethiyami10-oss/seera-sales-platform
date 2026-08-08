import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { enforceSegregationOfDuties } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal, requireFinancialReportingPrincipal } from "./context";
import { sumDecimal } from "./domain";
import { postSystemGeneratedJournalInTx } from "./posting-engine";
import {
  pageInput, vendorAccountInput, vendorAllocationInput, vendorBillDraftInput, vendorPaymentRequestInput,
} from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Stage B) — Accounts Payable.
 * Reuses the existing Phase 1 `EnterpriseVendor` model directly (no
 * duplicate supplier master — Section 20). Unlike AR's receipts, vendor
 * payments have a real two-actor gate before posting (Section 9: "payment
 * requester approving payment" is an explicitly prohibited SoD
 * combination) — `requestVendorPayment` only records intent;
 * `approveVendorPayment` is the step that actually posts the journal, and
 * is blocked for the same actor who requested it unless an override is
 * configured (none is, matching every other Stage A/B SoD policy).
 *
 * Same deferred, disclosed scope as AR: vendor credits/debit notes are not
 * implemented this pass.
 */

async function getFinanceConfigurationOrThrow(tx: EnterpriseTx, organizationKey: string) {
  const configuration = await tx.financeConfiguration.findUnique({ where: { organizationKey } });
  if (!configuration || configuration.status !== "ACTIVE") {
    throw new AppError("Finance configuration must be active before AP can post", 422, "FINANCE_CONFIGURATION_NOT_READY");
  }
  if (!configuration.apControlAccountId) throw new AppError("An AP control account must be configured", 422, "AP_CONTROL_ACCOUNT_MISSING");
  return configuration;
}

export async function getOrCreateVendorAccount(input: unknown) {
  const data = vendorAccountInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYABLES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const existing = await tx.financeVendorAccount.findUnique({ where: { organizationKey_vendorId: { organizationKey: principal.organizationKey, vendorId: data.vendorId } } });
    if (existing) return existing;
    const vendor = await tx.enterpriseVendor.findFirst({ where: { id: data.vendorId, organizationKey: principal.organizationKey } });
    if (!vendor) throw new NotFoundError("Enterprise vendor");
    const created = await tx.financeVendorAccount.create({
      data: { organizationKey: principal.organizationKey, vendorId: data.vendorId, paymentTermsDays: data.paymentTermsDays, createdById: principal.id },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "VENDOR_ACCOUNT_CREATED", entityType: "FinanceVendorAccount", entityId: created.id,
      description: "Vendor finance account created",
    });
    return created;
  });
}

/**
 * Creates a vendor bill and posts it immediately (same one-atomic-step
 * simplification as AR invoicing this pass). Duplicate vendor-invoice
 * detection is enforced at the database level by the unique
 * `(organizationKey, vendorAccountId, supplierInvoiceNo)` index — a
 * repeated `supplierInvoiceNo` for the same vendor fails deterministically,
 * not via an app-level best-effort check.
 */
export async function createAndPostVendorBill(input: unknown, idempotencyKey: string) {
  const data = vendorBillDraftInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYABLES_MANAGE);
  if (data.dueDate < data.billDate) throw new AppError("dueDate cannot precede billDate", 422, "INVALID_DUE_DATE");

  return enterpriseTransaction(async (tx) => {
    const configuration = await getFinanceConfigurationOrThrow(tx, principal.organizationKey);
    if (data.taxAmount.greaterThan(0) && !configuration.inputTaxControlAccountId) {
      throw new AppError("An input tax control account must be configured to post a taxed bill", 422, "INPUT_TAX_CONTROL_ACCOUNT_MISSING");
    }

    const vendorAccount = await tx.financeVendorAccount.findUnique({ where: { organizationKey_vendorId: { organizationKey: principal.organizationKey, vendorId: data.vendorId } } });
    if (!vendorAccount) throw new NotFoundError("Vendor finance account (create one first)");

    const existingBill = await tx.financeVendorBill.findFirst({
      where: { organizationKey: principal.organizationKey, vendorAccountId: vendorAccount.id, supplierInvoiceNo: data.supplierInvoiceNo },
    });
    if (existingBill) throw new ConflictError(`Supplier invoice ${data.supplierInvoiceNo} has already been billed for this vendor (bill ${existingBill.billNumber})`);

    const subtotal = sumDecimal(data.lines.map((line) => line.unitPrice.times(line.quantity)));
    const totalAmount = subtotal.plus(data.taxAmount);

    const billNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "AP_BILL", "BILL");
    const bill = await tx.financeVendorBill.create({
      data: {
        organizationKey: principal.organizationKey, billNumber, vendorAccountId: vendorAccount.id,
        supplierInvoiceNo: data.supplierInvoiceNo, sourcePurchaseOrderId: data.sourcePurchaseOrderId,
        billDate: data.billDate, dueDate: data.dueDate, currency: data.currency,
        subtotal, taxAmount: data.taxAmount, totalAmount, outstandingAmount: totalAmount,
        status: "DRAFT", createdById: principal.id,
      },
    });

    for (let index = 0; index < data.lines.length; index += 1) {
      const line = data.lines[index]!;
      await tx.financeVendorBillLine.create({
        data: {
          organizationKey: principal.organizationKey, billId: bill.id, lineNumber: index + 1,
          description: line.description, quantity: line.quantity, unitPrice: line.unitPrice,
          lineAmount: line.unitPrice.times(line.quantity), accountId: line.accountId,
        },
      });
    }

    const journalLines = data.lines.map((line) => ({
      accountId: line.accountId, debitAmount: line.unitPrice.times(line.quantity), creditAmount: new Prisma.Decimal(0),
      description: line.description,
    }));
    if (data.taxAmount.greaterThan(0)) {
      journalLines.push({ accountId: configuration.inputTaxControlAccountId!, debitAmount: data.taxAmount, creditAmount: new Prisma.Decimal(0), description: "Input tax" });
    }
    journalLines.push({ accountId: configuration.apControlAccountId!, debitAmount: new Prisma.Decimal(0), creditAmount: totalAmount, description: `AP bill ${billNumber}` });

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "AP_BILL", postingDate: data.billDate, documentDate: data.billDate, currency: data.currency,
      description: `AP bill ${billNumber} posted`, sourceType: "AP_BILL", sourceId: bill.id, idempotencyKey, lines: journalLines,
    });

    const posted = await tx.financeVendorBill.update({
      where: { id: bill.id },
      data: { status: "POSTED", journalId: journal.id, approvedById: principal.id, approvedAt: new Date(), postedById: principal.id, postedAt: new Date(), version: { increment: 1 } },
    });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AP_BILL_POSTED", entityType: "FinanceVendorBill", entityId: posted.id,
      description: `Bill ${billNumber} posted for ${totalAmount.toString()}`, next: { totalAmount: totalAmount.toString() },
    });

    return tx.financeVendorBill.findUniqueOrThrow({ where: { id: posted.id }, include: { lines: true } });
  });
}

/** Records payment intent only — does not post a journal. Posting happens
 * in `approveVendorPayment`, by a different actor. */
export async function requestVendorPayment(input: unknown) {
  const data = vendorPaymentRequestInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYMENTS_PREPARE);
  return enterpriseTransaction(async (tx) => {
    const vendorAccount = await tx.financeVendorAccount.findUnique({ where: { organizationKey_vendorId: { organizationKey: principal.organizationKey, vendorId: data.vendorId } } });
    if (!vendorAccount) throw new NotFoundError("Vendor finance account (create one first)");

    const paymentNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "AP_PAYMENT", "PAY");
    const payment = await tx.financeVendorPayment.create({
      data: {
        organizationKey: principal.organizationKey, paymentNumber, vendorAccountId: vendorAccount.id,
        paymentDate: data.paymentDate, amount: data.amount, unallocatedAmount: data.amount, currency: data.currency,
        paymentMethod: data.paymentMethod, reference: data.reference, status: "REQUESTED", requestedById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AP_PAYMENT_REQUESTED", entityType: "FinanceVendorPayment", entityId: payment.id,
      description: `Payment ${paymentNumber} requested for ${data.amount.toString()}`,
    });
    return payment;
  });
}

export async function approveVendorPayment(paymentId: string, expectedVersion: number, idempotencyKey: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYMENTS_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const configuration = await getFinanceConfigurationOrThrow(tx, principal.organizationKey);
    if (!configuration.defaultCashAccountId && !configuration.defaultBankAccountId) {
      throw new AppError("A default cash or bank account must be configured to approve a payment", 422, "CASH_ACCOUNT_MISSING");
    }
    const payAccountId = configuration.defaultBankAccountId ?? configuration.defaultCashAccountId!;

    const payment = await tx.financeVendorPayment.findFirst({ where: { id: paymentId, organizationKey: principal.organizationKey } });
    if (!payment) throw new NotFoundError("Payment");
    requireVersion(payment.version, expectedVersion);
    if (payment.status !== "REQUESTED") throw new ConflictError("Only a requested payment may be approved");

    await enforceSegregationOfDuties(tx, principal, {
      organizationKey: principal.organizationKey, operationType: "VENDOR_PAYMENT_APPROVAL",
      subjectType: "FinanceVendorPayment", subjectId: payment.id, preparerId: payment.requestedById,
    });

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "AP_PAYMENT", postingDate: payment.paymentDate, currency: payment.currency,
      description: `Payment ${payment.paymentNumber} approved and posted`, sourceType: "AP_PAYMENT", sourceId: payment.id, idempotencyKey,
      lines: [
        { accountId: configuration.apControlAccountId!, debitAmount: payment.amount, creditAmount: new Prisma.Decimal(0), description: `Payment ${payment.paymentNumber}` },
        { accountId: payAccountId, debitAmount: new Prisma.Decimal(0), creditAmount: payment.amount, description: `Payment ${payment.paymentNumber}` },
      ],
    });

    const approved = await tx.financeVendorPayment.update({
      where: { id: payment.id },
      data: { status: "APPROVED", journalId: journal.id, approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AP_PAYMENT_APPROVED", entityType: "FinanceVendorPayment", entityId: approved.id,
      description: `Payment ${approved.paymentNumber} approved`,
    });
    return approved;
  });
}

export async function allocateVendorPayment(paymentId: string, paymentExpectedVersion: number, input: unknown) {
  const data = vendorAllocationInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYABLES_MANAGE);
  if (data.amount.lessThanOrEqualTo(0)) throw new AppError("Allocation amount must be positive", 422, "INVALID_ALLOCATION_AMOUNT");

  return enterpriseTransaction(async (tx) => {
    const payment = await tx.financeVendorPayment.findFirst({ where: { id: paymentId, organizationKey: principal.organizationKey } });
    if (!payment) throw new NotFoundError("Payment");
    requireVersion(payment.version, paymentExpectedVersion);
    if (payment.status !== "APPROVED") throw new ConflictError("Only an approved payment may be allocated");

    const bill = await tx.financeVendorBill.findFirst({ where: { id: data.billId, organizationKey: principal.organizationKey } });
    if (!bill) throw new NotFoundError("Bill");
    if (bill.vendorAccountId !== payment.vendorAccountId) throw new ConflictError("Payment and bill belong to different vendor accounts");
    if (!["POSTED", "PARTIALLY_PAID", "OVERDUE"].includes(bill.status)) throw new ConflictError("This bill is not open for allocation");

    if (data.amount.greaterThan(payment.unallocatedAmount)) throw new ConflictError("Allocation amount exceeds the payment's unallocated balance");
    if (data.amount.greaterThan(bill.outstandingAmount)) throw new ConflictError("Allocation amount exceeds the bill's outstanding balance");

    const allocation = await tx.financeVendorPaymentAllocation.create({
      data: { organizationKey: principal.organizationKey, paymentId: payment.id, billId: bill.id, allocatedAmount: data.amount, allocatedById: principal.id },
    });

    const newPaymentUnallocated = payment.unallocatedAmount.minus(data.amount);
    const newBillOutstanding = bill.outstandingAmount.minus(data.amount);
    await tx.financeVendorPayment.update({
      where: { id: payment.id },
      data: { unallocatedAmount: newPaymentUnallocated, status: newPaymentUnallocated.equals(0) ? "ALLOCATED" : "PARTIALLY_ALLOCATED", version: { increment: 1 } },
    });
    const updatedBill = await tx.financeVendorBill.update({
      where: { id: bill.id },
      data: { outstandingAmount: newBillOutstanding, status: newBillOutstanding.equals(0) ? "PAID" : "PARTIALLY_PAID", version: { increment: 1 } },
    });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AP_PAYMENT_ALLOCATED", entityType: "FinanceVendorPaymentAllocation", entityId: allocation.id,
      description: `${data.amount.toString()} allocated from payment ${payment.paymentNumber} to bill ${bill.billNumber}`,
      next: { billStatus: updatedBill.status },
    });
    return allocation;
  });
}

export async function reverseVendorAllocation(allocationId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYABLES_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const original = await tx.financeVendorPaymentAllocation.findFirst({ where: { id: allocationId, organizationKey: principal.organizationKey } });
    if (!original) throw new NotFoundError("Allocation");
    if (original.status === "REVERSAL") throw new AppError("A reversal row cannot itself be reversed", 422, "CANNOT_REVERSE_A_REVERSAL");
    const existingReversal = await tx.financeVendorPaymentAllocation.findFirst({ where: { reversalOfAllocationId: original.id, organizationKey: principal.organizationKey } });
    if (existingReversal) throw new ConflictError("This allocation has already been reversed");

    const [payment, bill] = await Promise.all([
      tx.financeVendorPayment.findUniqueOrThrow({ where: { id: original.paymentId } }),
      tx.financeVendorBill.findUniqueOrThrow({ where: { id: original.billId } }),
    ]);

    const reversal = await tx.financeVendorPaymentAllocation.create({
      data: {
        organizationKey: principal.organizationKey, paymentId: original.paymentId, billId: original.billId,
        allocatedAmount: original.allocatedAmount, status: "REVERSAL", reversalOfAllocationId: original.id, allocatedById: principal.id,
      },
    });

    const newPaymentUnallocated = payment.unallocatedAmount.plus(original.allocatedAmount);
    const newBillOutstanding = bill.outstandingAmount.plus(original.allocatedAmount);
    await tx.financeVendorPayment.update({
      where: { id: payment.id },
      data: { unallocatedAmount: newPaymentUnallocated, status: newPaymentUnallocated.equals(payment.amount) ? "APPROVED" : "PARTIALLY_ALLOCATED", version: { increment: 1 } },
    });
    await tx.financeVendorBill.update({
      where: { id: bill.id },
      data: { outstandingAmount: newBillOutstanding, status: newBillOutstanding.equals(bill.totalAmount) ? "POSTED" : "PARTIALLY_PAID", version: { increment: 1 } },
    });

    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "AP_ALLOCATION_REVERSED", entityType: "FinanceVendorPaymentAllocation", entityId: reversal.id,
      description: `Allocation ${original.id} reversed`,
    });
    return reversal;
  });
}

export async function getVendorBalance(vendorId: string) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_PAYABLES_VIEW);
  return enterpriseTransaction(async (tx) => {
    const vendorAccount = await tx.financeVendorAccount.findUnique({ where: { organizationKey_vendorId: { organizationKey: principal.organizationKey, vendorId } } });
    if (!vendorAccount) throw new NotFoundError("Vendor finance account");
    const result = await tx.financeVendorBill.aggregate({
      where: { organizationKey: principal.organizationKey, vendorAccountId: vendorAccount.id, status: { in: ["POSTED", "PARTIALLY_PAID", "OVERDUE"] } },
      _sum: { outstandingAmount: true },
    });
    return { vendorAccountId: vendorAccount.id, outstandingBalance: result._sum.outstandingAmount ?? new Prisma.Decimal(0) };
  });
}

export type ApAgingBucket = "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_90_PLUS";

export async function getPayablesAging(asOfDate: Date) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_PAYABLES_VIEW);
  return enterpriseTransaction(async (tx) => {
    const openBills = await tx.financeVendorBill.findMany({
      where: { organizationKey: principal.organizationKey, status: { in: ["POSTED", "PARTIALLY_PAID", "OVERDUE"] } },
      take: 5000,
    });
    const buckets: Record<ApAgingBucket, Prisma.Decimal> = {
      CURRENT: new Prisma.Decimal(0), DAYS_1_30: new Prisma.Decimal(0), DAYS_31_60: new Prisma.Decimal(0),
      DAYS_61_90: new Prisma.Decimal(0), DAYS_90_PLUS: new Prisma.Decimal(0),
    };
    const rows = openBills.map((bill) => {
      const daysOverdue = Math.floor((asOfDate.getTime() - bill.dueDate.getTime()) / 86400000);
      let bucket: ApAgingBucket = "CURRENT";
      if (daysOverdue > 90) bucket = "DAYS_90_PLUS";
      else if (daysOverdue > 60) bucket = "DAYS_61_90";
      else if (daysOverdue > 30) bucket = "DAYS_31_60";
      else if (daysOverdue > 0) bucket = "DAYS_1_30";
      buckets[bucket] = buckets[bucket].plus(bill.outstandingAmount);
      return { billId: bill.id, billNumber: bill.billNumber, vendorAccountId: bill.vendorAccountId, dueDate: bill.dueDate, outstandingAmount: bill.outstandingAmount, daysOverdue, bucket };
    });
    return { asOfDate, buckets, rows };
  });
}

export async function listVendorBills(input: unknown) {
  const params = pageInput.parse(input ?? {});
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYABLES_VIEW);
  return enterpriseTransaction(async (tx) => {
    const pageSize = Math.min(params.pageSize, 100);
    const where = { organizationKey: principal.organizationKey, status: params.status };
    const [total, items] = await Promise.all([
      tx.financeVendorBill.count({ where }),
      tx.financeVendorBill.findMany({ where, orderBy: [{ billDate: "desc" }, { id: "desc" }], skip: (params.page - 1) * pageSize, take: pageSize }),
    ]);
    return { items, total, page: params.page, pageSize };
  });
}

/** A chronological statement of every bill and payment for a vendor,
 * bounded and organization-scoped (Section 23), mirroring AR's customer
 * statement. */
export async function getVendorStatement(vendorId: string) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_PAYABLES_VIEW);
  return enterpriseTransaction(async (tx) => {
    const vendorAccount = await tx.financeVendorAccount.findUnique({ where: { organizationKey_vendorId: { organizationKey: principal.organizationKey, vendorId } } });
    if (!vendorAccount) throw new NotFoundError("Vendor finance account");

    const [bills, payments] = await Promise.all([
      tx.financeVendorBill.findMany({ where: { organizationKey: principal.organizationKey, vendorAccountId: vendorAccount.id }, orderBy: [{ billDate: "asc" }], take: 5000 }),
      tx.financeVendorPayment.findMany({ where: { organizationKey: principal.organizationKey, vendorAccountId: vendorAccount.id }, orderBy: [{ paymentDate: "asc" }], take: 5000 }),
    ]);

    const entries = [
      ...bills.map((bill) => ({ type: "BILL" as const, date: bill.billDate, reference: bill.billNumber, amount: bill.totalAmount, status: bill.status })),
      ...payments.map((payment) => ({ type: "PAYMENT" as const, date: payment.paymentDate, reference: payment.paymentNumber, amount: payment.amount, status: payment.status })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return { vendorAccountId: vendorAccount.id, entries };
  });
}
