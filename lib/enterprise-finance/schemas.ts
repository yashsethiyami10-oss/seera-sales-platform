import { z } from "zod";
import { Prisma } from "@prisma/client";
import { FINANCE_ACCOUNT_CATEGORIES, FINANCE_JOURNAL_TYPES, FINANCE_NORMAL_BALANCES } from "./domain";

/** Money enters the system as a number or string and is converted to
 * `Prisma.Decimal` at the validation boundary — nothing downstream ever
 * holds a raw JS `number` for an authoritative amount. */
const decimalAmount = z.union([z.number(), z.string()]).transform((value) => new Prisma.Decimal(value));

export const financeConfigurationInput = z.object({
  baseCurrency: z.string().trim().length(3).default("INR"),
  accountingTimezone: z.string().trim().min(1).max(80).default("Asia/Kolkata"),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12).default(4),
  retainedEarningsAccountId: z.string().cuid().optional(),
  arControlAccountId: z.string().cuid().optional(),
  apControlAccountId: z.string().cuid().optional(),
  inputTaxControlAccountId: z.string().cuid().optional(),
  outputTaxControlAccountId: z.string().cuid().optional(),
  defaultCashAccountId: z.string().cuid().optional(),
  defaultBankAccountId: z.string().cuid().optional(),
  roundingAccountId: z.string().cuid().optional(),
  defaultExpensePayableAccountId: z.string().cuid().optional(),
});

export const fiscalYearInput = z.object({
  code: z.string().trim().min(2).max(40),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  periodCount: z.coerce.number().int().min(1).max(24).default(12),
});

export const fiscalPeriodTransitionInput = z.object({
  reason: z.string().trim().max(500).optional(),
  overrideReason: z.string().trim().max(500).optional(),
});

export const costCenterInput = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  parentId: z.string().cuid().optional(),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().optional(),
});

export const profitCenterInput = costCenterInput;

export const financeAccountInput = z.object({
  accountCode: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  category: z.enum(FINANCE_ACCOUNT_CATEGORIES),
  subtype: z.string().trim().max(80).optional(),
  normalBalance: z.enum(FINANCE_NORMAL_BALANCES),
  isControlAccount: z.boolean().default(false),
  postingEnabled: z.boolean().default(true),
  parentId: z.string().cuid().optional(),
  financialStatementClassification: z.string().trim().max(120).optional(),
  cashFlowClassification: z.string().trim().max(120).optional(),
  taxRelevant: z.boolean().default(false),
  reconciliationRequired: z.boolean().default(false),
});

export const journalDraftInput = z.object({
  journalType: z.enum(FINANCE_JOURNAL_TYPES),
  postingDate: z.coerce.date(),
  documentDate: z.coerce.date(),
  currency: z.string().trim().length(3).default("INR"),
  description: z.string().trim().max(500).optional(),
  reference: z.string().trim().max(120).optional(),
  sourceType: z.string().trim().max(80).optional(),
  sourceId: z.string().trim().max(191).optional(),
  sourceVersion: z.coerce.number().int().min(1).optional(),
});

export const journalLineInput = z.object({
  accountId: z.string().cuid(),
  debitAmount: decimalAmount,
  creditAmount: decimalAmount,
  currency: z.string().trim().length(3).optional(),
  description: z.string().trim().max(500).optional(),
  costCenterId: z.string().cuid().optional(),
  profitCenterId: z.string().cuid().optional(),
  sourceLineType: z.string().trim().max(80).optional(),
  sourceLineId: z.string().trim().max(191).optional(),
});

export const reversalInput = z.object({
  reason: z.string().trim().min(1).max(500),
  postingDate: z.coerce.date().optional(),
});

export const correctionInput = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const customerAccountInput = z.object({
  customerId: z.string().cuid(),
  creditLimit: decimalAmount.optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
});

export const receivableInvoiceLineInput = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: decimalAmount.default(1),
  unitPrice: decimalAmount,
  accountId: z.string().cuid(),
});

export const receivableInvoiceDraftInput = z.object({
  customerId: z.string().cuid(),
  sourceOrderId: z.string().trim().max(191).optional(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  currency: z.string().trim().length(3).default("INR"),
  taxAmount: decimalAmount.default(0),
  lines: z.array(receivableInvoiceLineInput).min(1),
});

export const customerReceiptInput = z.object({
  customerId: z.string().cuid(),
  receiptDate: z.coerce.date(),
  amount: decimalAmount,
  currency: z.string().trim().length(3).default("INR"),
  paymentMethod: z.string().trim().max(80).optional(),
  reference: z.string().trim().max(191).optional(),
});

export const allocationInput = z.object({
  invoiceId: z.string().cuid(),
  amount: decimalAmount,
});

export const vendorAccountInput = z.object({
  vendorId: z.string().cuid(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
});

export const vendorBillLineInput = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: decimalAmount.default(1),
  unitPrice: decimalAmount,
  accountId: z.string().cuid(),
});

export const vendorBillDraftInput = z.object({
  vendorId: z.string().cuid(),
  supplierInvoiceNo: z.string().trim().min(1).max(120),
  sourcePurchaseOrderId: z.string().trim().max(191).optional(),
  billDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  currency: z.string().trim().length(3).default("INR"),
  taxAmount: decimalAmount.default(0),
  lines: z.array(vendorBillLineInput).min(1),
});

export const vendorPaymentRequestInput = z.object({
  vendorId: z.string().cuid(),
  paymentDate: z.coerce.date(),
  amount: decimalAmount,
  currency: z.string().trim().length(3).default("INR"),
  paymentMethod: z.string().trim().max(80).optional(),
  reference: z.string().trim().max(191).optional(),
});

export const vendorAllocationInput = z.object({
  billId: z.string().cuid(),
  amount: decimalAmount,
});

export const expenseCategoryInput = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  defaultAccountId: z.string().cuid(),
});

export const expenseLineInput = z.object({
  categoryId: z.string().cuid(),
  description: z.string().trim().min(1).max(500),
  expenseDate: z.coerce.date(),
  claimedAmount: decimalAmount,
  accountId: z.string().cuid().optional(),
  costCenterId: z.string().cuid().optional(),
  profitCenterId: z.string().cuid().optional(),
  evidenceReference: z.string().trim().max(500).optional(),
});

export const expenseClaimDraftInput = z.object({
  currency: z.string().trim().length(3).default("INR"),
  lines: z.array(expenseLineInput).min(1),
});

export const expenseLineApprovalInput = z.object({
  lineId: z.string().cuid(),
  approvedAmount: decimalAmount,
});

export const expenseApprovalInput = z.object({
  approvals: z.array(expenseLineApprovalInput).min(1),
});

export const expenseRejectionInput = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const bankAccountInput = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  institutionName: z.string().trim().max(200).optional(),
  maskedAccountNumber: z.string().trim().max(40).optional(),
  currency: z.string().trim().length(3).default("INR"),
  linkedGlAccountId: z.string().cuid(),
});

export const bankStatementLineInput = z.object({
  transactionDate: z.coerce.date(),
  description: z.string().trim().min(1).max(500),
  debitAmount: decimalAmount.default(0),
  creditAmount: decimalAmount.default(0),
  externalReference: z.string().trim().min(1).max(191),
});

export const bankStatementImportInput = z.object({
  bankAccountId: z.string().cuid(),
  statementRef: z.string().trim().min(1).max(120),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  openingBalance: decimalAmount,
  closingBalance: decimalAmount,
  lines: z.array(bankStatementLineInput).min(1),
});

export const reconciliationMatchInput = z.object({
  statementLineId: z.string().cuid(),
  ledgerEntryId: z.string().cuid().optional(),
  adjustment: z.object({ accountId: z.string().cuid(), description: z.string().trim().min(1).max(500) }).optional(),
});

export const pageInput = z.object({
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().trim().max(40).optional(),
});
