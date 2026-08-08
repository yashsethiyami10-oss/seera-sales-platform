"use server";

import { revalidatePath } from "next/cache";
import { toErrorResponse } from "@/lib/errors";

// Frozen Part 3C services (reused as-is, never reimplemented)
import * as coa from "@/lib/enterprise-finance/chart-of-accounts-service";
import * as journal from "@/lib/enterprise-finance/journal-service";
import * as posting from "@/lib/enterprise-finance/posting-engine";
import * as ledger from "@/lib/enterprise-finance/ledger-service";
import * as ar from "@/lib/enterprise-finance/ar-service";
import * as ap from "@/lib/enterprise-finance/ap-service";
import * as banking from "@/lib/enterprise-finance/banking-service";
import * as expense from "@/lib/enterprise-finance/expense-service";
import * as period from "@/lib/enterprise-finance/period-service";
import { createCostCenter, listCostCenters as listCostCentersService, createProfitCenter, listProfitCenters as listProfitCentersService } from "@/lib/enterprise-finance/dimension-service";
import * as configuration from "@/lib/enterprise-finance/configuration-service";

// Milestone 8 services (net new)
import * as eventPosting from "@/lib/enterprise-finance/event-posting-service";
import * as costing from "@/lib/enterprise-finance/costing-service";
import * as creditDebitNote from "@/lib/enterprise-finance/credit-debit-note-service";
import * as fixedAsset from "@/lib/enterprise-finance/fixed-asset-service";
import * as budget from "@/lib/enterprise-finance/budget-service";
import * as cash from "@/lib/enterprise-finance/cash-service";
import * as creditControl from "@/lib/enterprise-finance/credit-control-service";
import * as collections from "@/lib/enterprise-finance/collections-service";
import * as approvalMatrix from "@/lib/enterprise-finance/approval-matrix-service";
import * as calendarTaxAudit from "@/lib/enterprise-finance/calendar-tax-audit-service";
import * as statements from "@/lib/enterprise-finance/financial-statements-service";
import * as kpi from "@/lib/enterprise-finance/kpi-service";

/**
 * Milestone 8 â€” Finance & Accounts. The MUV-OS-shell "use server" boundary
 * for app/os/finance/* â€” thin wrappers over lib/enterprise-finance/*
 * (frozen Part 3C services reused unchanged, plus this milestone's own new
 * services), matching Milestone 7's actions/manufacturing.ts pattern
 * exactly. Every wrapped call self-enforces its own permission/feature-flag
 * check inside requireFinancePrincipal-family functions â€” this file adds
 * no new authorization logic.
 */

const revalidateFinance = () => revalidatePath("/os/finance", "layout");
async function run<T>(fn: () => Promise<T>) {
  try { const data = await fn(); revalidateFinance(); return { success: true as const, data }; }
  catch (err) { return toErrorResponse(err); }
}
async function read<T>(fn: () => Promise<T>) {
  try { return { success: true as const, data: await fn() }; } catch (err) { return toErrorResponse(err); }
}

// --- Chart of Accounts ---
export const createAccount = async (input: unknown) => run(() => coa.createAccount(input));
export const activateAccount = async (id: string, v: number) => run(() => coa.activateAccount(id, v));
export const deactivateAccount = async (id: string, v: number) => run(() => coa.deactivateAccount(id, v));
export const exportChartOfAccounts = async () => read(() => coa.exportChartOfAccounts());

// --- Journals ---
export const createJournalDraft = async (input: unknown) => run(() => journal.createJournalDraft(input));
export const addJournalLine = async (journalId: string, v: number, input: unknown) => run(() => journal.addJournalLine(journalId, v, input));
export const submitJournal = async (id: string, v: number) => run(() => journal.submitJournal(id, v));
export const approveJournal = async (id: string, v: number) => run(() => journal.approveJournal(id, v));
export const rejectJournal = async (id: string, v: number, reason: string) => run(() => journal.rejectJournal(id, v, reason));
export const postJournal = async (id: string, v: number, idempotencyKey: string) => run(() => posting.postJournal(id, v, idempotencyKey));
export const reversePostedJournal = async (id: string, idempotencyKey: string, input: unknown) => run(() => posting.reversePostedJournal(id, idempotencyKey, input));
export const listJournals = async (input: unknown) => read(() => journal.listJournals(input));
export const getJournal = async (id: string) => read(() => journal.getJournal(id));

// --- General Ledger / Trial Balance ---
export const getTrialBalance = async (fiscalPeriodId: string) => read(() => ledger.getTrialBalance(fiscalPeriodId));
export const getAccountLedger = async (accountId: string, filters?: { from?: Date; to?: Date; page?: number; pageSize?: number }) => read(() => ledger.getAccountLedger(accountId, filters ?? {}));
export const getPeriodActivitySummary = async (fiscalPeriodId: string) => read(() => ledger.getPeriodActivitySummary(fiscalPeriodId));

// --- Accounts Receivable / Collections ---
export const getOrCreateCustomerAccount = async (input: unknown) => run(() => ar.getOrCreateCustomerAccount(input));
export const createAndIssueReceivableInvoice = async (input: unknown, idempotencyKey: string) => run(() => ar.createAndIssueReceivableInvoice(input, idempotencyKey));
export const recordCustomerReceipt = async (input: unknown, idempotencyKey: string) => run(() => ar.recordCustomerReceipt(input, idempotencyKey));
export const allocateReceipt = async (receiptId: string, v: number, input: unknown) => run(() => ar.allocateReceipt(receiptId, v, input));
export const listReceivableInvoices = async (input: unknown) => read(() => ar.listReceivableInvoices(input));
export const getReceivablesAging = async (asOfDate: Date) => read(() => ar.getReceivablesAging(asOfDate));
export const getCustomerStatement = async (customerId: string) => read(() => ar.getCustomerStatement(customerId));
export const openCollectionCase = async (input: { customerAccountId: string; invoiceId?: string; priority?: string }) => run(() => collections.openCollectionCase(input));
export const recordCollectionActivity = async (caseId: string, input: Parameters<typeof collections.recordCollectionActivity>[1]) => run(() => collections.recordCollectionActivity(caseId, input));
export const requestWriteOff = async (caseId: string, input: { invoiceId: string; amount: number; reason: string }) => run(() => collections.requestWriteOff(caseId, input));
export const approveWriteOff = async (writeOffId: string) => run(() => collections.approveWriteOff(writeOffId));
export const listCollectionCases = async (input: Parameters<typeof collections.listCollectionCases>[0]) => read(() => collections.listCollectionCases(input));

// --- Accounts Payable ---
export const getOrCreateVendorAccount = async (input: unknown) => run(() => ap.getOrCreateVendorAccount(input));
export const createAndPostVendorBill = async (input: unknown, idempotencyKey: string) => run(() => ap.createAndPostVendorBill(input, idempotencyKey));
export const requestVendorPayment = async (input: unknown) => run(() => ap.requestVendorPayment(input));
export const approveVendorPayment = async (id: string, v: number, idempotencyKey: string) => run(() => ap.approveVendorPayment(id, v, idempotencyKey));
export const allocateVendorPayment = async (id: string, v: number, input: unknown) => run(() => ap.allocateVendorPayment(id, v, input));
export const listVendorBills = async (input: unknown) => read(() => ap.listVendorBills(input));
export const getPayablesAging = async (asOfDate: Date) => read(() => ap.getPayablesAging(asOfDate));
export const getVendorStatement = async (vendorId: string) => read(() => ap.getVendorStatement(vendorId));

// --- Credit Notes / Debit Notes ---
export const createCreditNoteDraft = async (input: unknown) => run(() => creditDebitNote.createCreditNoteDraft(input));
export const approveCreditNote = async (id: string, v: number) => run(() => creditDebitNote.approveCreditNote(id, v));
export const postCreditNote = async (id: string, v: number) => run(() => creditDebitNote.postCreditNote(id, v));
export const allocateCreditNote = async (id: string, v: number, input: { invoiceId: string; amount: number }) => run(() => creditDebitNote.allocateCreditNote(id, v, input));
export const listCreditNotes = async (input: Parameters<typeof creditDebitNote.listCreditNotes>[0]) => read(() => creditDebitNote.listCreditNotes(input));
export const createDebitNoteDraft = async (input: unknown) => run(() => creditDebitNote.createDebitNoteDraft(input));
export const approveDebitNote = async (id: string, v: number) => run(() => creditDebitNote.approveDebitNote(id, v));
export const postDebitNote = async (id: string, v: number) => run(() => creditDebitNote.postDebitNote(id, v));
export const listDebitNotes = async (input: Parameters<typeof creditDebitNote.listDebitNotes>[0]) => read(() => creditDebitNote.listDebitNotes(input));

// --- Banking / Reconciliation ---
export const createBankAccount = async (input: unknown) => run(() => banking.createBankAccount(input));
export const importBankStatement = async (input: unknown) => run(() => banking.importBankStatement(input));
export const beginReconciliation = async (bankAccountId: string, statementId: string) => run(() => banking.beginReconciliation(bankAccountId, statementId));
export const matchStatementLine = async (sessionId: string, input: unknown) => run(() => banking.matchStatementLine(sessionId, input));
export const completeReconciliation = async (sessionId: string, v: number) => run(() => banking.completeReconciliation(sessionId, v));
export const listUnreconciledLines = async (statementId: string) => read(() => banking.listUnreconciledLines(statementId));
export const getBankPosition = async (bankAccountId: string, asOfDate: Date) => read(() => banking.getBankPosition(bankAccountId, asOfDate));

// --- Cash & Petty Cash ---
export const createCashAccount = async (input: Parameters<typeof cash.createCashAccount>[0]) => run(() => cash.createCashAccount(input));
export const createCashVoucherDraft = async (input: unknown) => run(() => cash.createCashVoucherDraft(input));
export const approveAndPostCashVoucher = async (id: string, v: number, contraAccountCode: string) => run(() => cash.approveAndPostCashVoucher(id, v, contraAccountCode));
export const recordCashVerification = async (input: Parameters<typeof cash.recordCashVerification>[0]) => run(() => cash.recordCashVerification(input));
export const listCashAccounts = async () => read(() => cash.listCashAccounts());
export const listCashVouchers = async (input: Parameters<typeof cash.listCashVouchers>[0]) => read(() => cash.listCashVouchers(input));
export const getCashBook = async (cashAccountId: string, from?: Date, to?: Date) => read(() => cash.getCashBook(cashAccountId, from, to));

// --- Expenses ---
export const createExpenseCategory = async (input: unknown) => run(() => expense.createExpenseCategory(input));
export const createExpenseClaimDraft = async (input: unknown) => run(() => expense.createExpenseClaimDraft(input));
export const submitExpenseClaim = async (id: string, v: number) => run(() => expense.submitExpenseClaim(id, v));
export const approveExpenseClaim = async (id: string, v: number, input: unknown) => run(() => expense.approveExpenseClaim(id, v, input));
export const rejectExpenseClaim = async (id: string, v: number, input: unknown) => run(() => expense.rejectExpenseClaim(id, v, input));
export const postApprovedExpenseClaim = async (id: string, v: number, idempotencyKey: string) => run(() => expense.postApprovedExpenseClaim(id, v, idempotencyKey));
export const reimburseExpenseClaim = async (id: string, v: number, idempotencyKey: string) => run(() => expense.reimburseExpenseClaim(id, v, idempotencyKey));
export const listExpenseClaims = async (input: unknown) => read(() => expense.listExpenseClaims(input));

// --- Fixed Assets / Depreciation ---
export const createAssetCategory = async (input: unknown) => run(() => fixedAsset.createAssetCategory(input));
export const acquireAsset = async (input: unknown) => run(() => fixedAsset.acquireAsset(input));
export const postDepreciationEntry = async (entryId: string) => run(() => fixedAsset.postDepreciationEntry(entryId));
export const transferAsset = async (assetId: string, input: { toCostCenterId?: string; reason?: string }) => run(() => fixedAsset.transferAsset(assetId, input));
export const disposeAsset = async (assetId: string, input: { disposalDate: Date; proceeds: number; reason?: string }) => run(() => fixedAsset.disposeAsset(assetId, input));
export const listFixedAssets = async (input: Parameters<typeof fixedAsset.listFixedAssets>[0]) => read(() => fixedAsset.listFixedAssets(input));
export const getAssetRegister = async (assetId: string) => read(() => fixedAsset.getAssetRegister(assetId));
export const listPendingDepreciationEntries = async (fiscalPeriodId?: string) => read(() => fixedAsset.listPendingDepreciationEntries(fiscalPeriodId));

// --- Budgets ---
export const createBudgetDraft = async (input: unknown) => run(() => budget.createBudgetDraft(input));
export const approveBudget = async (id: string, v: number) => run(() => budget.approveBudget(id, v));
export const reviseBudgetLine = async (budgetId: string, lineId: string, newAmount: number, reason: string) => run(() => budget.reviseBudgetLine(budgetId, lineId, newAmount, reason));
export const syncBudgetActuals = async (budgetId: string) => run(() => budget.syncBudgetActuals(budgetId));
export const getBudgetVsActual = async (budgetId: string) => read(() => budget.getBudgetVsActual(budgetId));
export const listBudgets = async (input: Parameters<typeof budget.listBudgets>[0]) => read(() => budget.listBudgets(input));

// --- Costing ---
export const computeAndRecordBatchCost = async (batchId: string) => run(() => costing.computeAndRecordBatchCost(batchId));
export const recordAdditionalBatchCost = async (batchId: string, input: Parameters<typeof costing.recordAdditionalBatchCost>[1]) => run(() => costing.recordAdditionalBatchCost(batchId, input));
export const listBatchCosts = async (input: Parameters<typeof costing.listBatchCosts>[0]) => read(() => costing.listBatchCosts(input));
export const getInventoryValuation = async () => read(() => costing.getInventoryValuation());

// --- Credit Control ---
export const getCustomerCreditStatus = async (customerAccountId: string) => read(() => creditControl.getCustomerCreditStatus(customerAccountId));
export const setCreditHold = async (customerAccountId: string, reason: string) => run(() => creditControl.setCreditHold(customerAccountId, reason));
export const releaseCreditHold = async (customerAccountId: string) => run(() => creditControl.releaseCreditHold(customerAccountId));
export const overrideCreditHold = async (customerAccountId: string, reason: string, expiresAt?: Date) => run(() => creditControl.overrideCreditHold(customerAccountId, reason, expiresAt));
export const setTemporaryCreditLimit = async (customerAccountId: string, amount: number, expiresAt: Date) => run(() => creditControl.setTemporaryCreditLimit(customerAccountId, amount, expiresAt));
export const setPermanentCreditLimit = async (customerAccountId: string, amount: number, riskRating?: string) => run(() => creditControl.setPermanentCreditLimit(customerAccountId, amount, riskRating));
export const listCreditHolds = async () => read(() => creditControl.listCreditHolds());

// --- Approval Matrix / Payment Terms ---
export const createApprovalRule = async (input: unknown) => run(() => approvalMatrix.createApprovalRule(input));
export const deactivateApprovalRule = async (id: string) => run(() => approvalMatrix.deactivateApprovalRule(id));
export const listApprovalRules = async (transactionType?: string) => read(() => approvalMatrix.listApprovalRules(transactionType));

// --- Financial Calendar / Tax / Internal Audit ---
export const addHoliday = async (date: Date, name: string) => run(() => calendarTaxAudit.addHoliday(date, name));
export const listHolidays = async (year?: number) => read(() => calendarTaxAudit.listHolidays(year));
export const setPeriodPostingCutoff = async (fiscalPeriodId: string, cutoffDate: Date) => run(() => calendarTaxAudit.setPeriodPostingCutoff(fiscalPeriodId, cutoffDate));
export const createTaxJurisdiction = async (input: { code: string; name: string; country: string }) => run(() => calendarTaxAudit.createTaxJurisdiction(input));
export const createTaxType = async (input: { code: string; name: string }) => run(() => calendarTaxAudit.createTaxType(input));
export const createTaxRate = async (input: unknown) => run(() => calendarTaxAudit.createTaxRate(input));
export const listTaxRates = async () => read(() => calendarTaxAudit.listTaxRates());
export const getTaxReconciliation = async (fiscalPeriodId: string) => read(() => calendarTaxAudit.getTaxReconciliation(fiscalPeriodId));
export const createAuditPlan = async (input: { title: string; periodText: string }) => run(() => calendarTaxAudit.createAuditPlan(input));
export const createAuditFinding = async (input: unknown) => run(() => calendarTaxAudit.createAuditFinding(input));
export const addCorrectiveAction = async (findingId: string, input: { description: string; ownerId: string; dueDate?: Date }) => run(() => calendarTaxAudit.addCorrectiveAction(findingId, input));
export const closeAuditFinding = async (findingId: string) => run(() => calendarTaxAudit.closeAuditFinding(findingId));
export const reopenAuditFinding = async (findingId: string) => run(() => calendarTaxAudit.reopenAuditFinding(findingId));
export const listAuditFindings = async (input: Parameters<typeof calendarTaxAudit.listAuditFindings>[0]) => read(() => calendarTaxAudit.listAuditFindings(input));

// --- Fiscal Periods ---
export const createFiscalYearWithPeriods = async (input: unknown) => run(() => period.createFiscalYearWithPeriods(input));
export const closeFiscalYear = async (id: string, v: number) => run(() => period.closeFiscalYear(id, v));
export const softClosePeriod = async (id: string, v: number) => run(() => period.softClosePeriod(id, v));
export const hardClosePeriod = async (id: string, v: number) => run(() => period.hardClosePeriod(id, v));
export const reopenPeriod = async (id: string, v: number, requestedById: string, reason: string) => run(() => period.reopenPeriod(id, v, requestedById, reason));
export const listFiscalPeriods = async (fiscalYearId?: string) => read(() => period.listFiscalPeriods(fiscalYearId));

// --- Cost / Profit Centers, Configuration ---
export const createCostCenterAction = async (input: unknown) => run(() => createCostCenter(input));
export const listCostCenters = async (status?: string) => read(() => listCostCentersService(status));
export const createProfitCenterAction = async (input: unknown) => run(() => createProfitCenter(input));
export const listProfitCenters = async (status?: string) => read(() => listProfitCentersService(status));
export const getFinanceConfiguration = async () => read(() => configuration.getFinanceConfiguration());
export const saveFinanceConfigurationDraft = async (input: unknown, v?: number) => run(() => configuration.saveFinanceConfigurationDraft(input, v));
export const activateFinanceConfiguration = async (v: number) => run(() => configuration.activateFinanceConfiguration(v));

// --- Reports / Financial Statements ---
export const getProfitAndLoss = async (fiscalPeriodId: string) => read(() => statements.getProfitAndLoss(fiscalPeriodId));
export const getBalanceSheet = async (fiscalPeriodId: string) => read(() => statements.getBalanceSheet(fiscalPeriodId));
export const getCashFlowStatement = async (fiscalPeriodId: string) => read(() => statements.getCashFlowStatement(fiscalPeriodId));
export const getCustomerProfitability = async (customerAccountId: string, from: Date, to: Date) => read(() => statements.getCustomerProfitability(customerAccountId, from, to));
export const getProductProfitability = async (productId: string, from: Date, to: Date) => read(() => statements.getProductProfitability(productId, from, to));
export const getFounderFinanceDashboard = async (fiscalPeriodId: string) => read(() => statements.getFounderFinanceDashboard(fiscalPeriodId));
export const getFinancialKpis = async (fiscalPeriodId: string, asOfDate: Date) => read(() => kpi.getFinancialKpis(fiscalPeriodId, asOfDate));

// --- Unposted Events / Finance Exceptions ---
export const listFinanceEventLog = async (input: Parameters<typeof eventPosting.listFinanceEventLog>[0]) => read(() => eventPosting.listFinanceEventLog(input));
export const retryFinanceEvent = async (logId: string) => run(() => eventPosting.retryFinanceEvent(logId));
export const listPostingRules = async () => read(() => eventPosting.listPostingRules());
