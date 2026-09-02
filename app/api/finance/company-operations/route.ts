import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { createAccount, updateAccount, seedDefaultChartOfAccounts } from "@/lib/finance/chart-of-accounts";
import { createDimension, seedDefaultDimensions } from "@/lib/finance/dimension-service";
import { postJournal, reverseJournal } from "@/lib/finance/journal-service";
import { createTreasuryAccount, recordMoneyIn, recordMoneyOut, transferFunds, commitBankStatementImport, confirmBankMatch, unmatchBankLine, suggestBankMatches, setTreasuryAccountActive } from "@/lib/finance/treasury-service";
import { createVendor, updateVendor, createVendorBill, recordVendorPayment } from "@/lib/finance/vendor-service";
import { createExpenseCategory, createExpense, submitExpense, decideExpense, postExpense, payExpensePayable, reverseExpense, createRecurringExpenseTemplate, generateExpenseFromRecurringTemplate, skipRecurringOccurrence, setRecurringTemplateActive } from "@/lib/finance/expense-service";
import { quickEntryCreate, QUICK_ENTRY_TYPES } from "@/lib/finance/quick-entry-service";
import { seedQuickEntryCategoryMaster } from "@/lib/finance/chart-of-accounts";
import { createBudget } from "@/lib/finance/budget-service";
import { createLoan, recordLoanDisbursement, recordLoanRepayment, createFixedAsset, closeLoan } from "@/lib/finance/loan-asset-service";
import { recordCapitalIntroduced, recordDrawings } from "@/lib/finance/capital-service";
import { postOpeningBalances } from "@/lib/finance/opening-balance-service";
import { lockPeriod, reopenPeriod } from "@/lib/finance/period-service";
import { createPayrollEntry, accruePayrollEntry, paySalary } from "@/lib/finance/payroll-service";
import { updateFinanceApprovalPolicy, seedDefaultFinanceApprovalPolicies, decideApproval } from "@/lib/finance/approval-policy-service";
import { createMoneyDeskTransaction, decideMoneyDeskApproval, voidMoneyDeskTransaction, editMoneyDeskTransaction } from "@/lib/finance/money-desk-service";
import { MONEY_DESK_PURPOSE_CODES } from "@/lib/finance/money-desk-registry";
import { interpretSmartFinance } from "@/lib/finance/smart-finance/service";
import { treasuryContext } from "@/lib/finance/smart-finance/context";
import { confirmOtherParty, updateOtherParty, setOtherPartyActive } from "@/lib/finance/smart-finance/other-party";
import { settleAdvance } from "@/lib/finance/smart-finance/advance-lifecycle";
import { recordAndPostReceipt } from "@/lib/sales-distribution/financial-service";
import { createFactoryCashSale } from "@/lib/finance/factory-cash-sale-service";

const journalLine = z.object({ accountId: z.string(), debit: z.number().optional(), credit: z.number().optional(), partyType: z.string().optional(), partyId: z.string().optional(), dimensionId: z.string().optional(), treasuryAccountId: z.string().optional(), description: z.string().optional() });

const ACTIONS = [
  "bootstrap-coa", "bootstrap-dimensions", "bootstrap-approval-policies",
  "create-account", "update-account", "create-dimension",
  "post-manual-journal", "reverse-journal",
  "create-treasury-account", "set-treasury-account-active", "money-in", "money-out", "transfer-funds",
  "import-bank-statement", "confirm-bank-match", "unmatch-bank-line", "suggest-bank-matches",
  "create-vendor", "update-vendor", "create-vendor-bill", "record-vendor-payment",
  "create-expense-category", "create-expense", "submit-expense", "decide-expense", "post-expense", "pay-expense-payable", "reverse-expense",
  "quick-entry", "seed-quick-entry-categories",
  "create-recurring-expense", "generate-expense-from-recurring", "skip-recurring-occurrence", "set-recurring-active",
  "create-budget",
  "create-loan", "record-loan-disbursement", "record-loan-repayment", "create-fixed-asset", "close-loan",
  "record-capital-introduced", "record-drawings",
  "post-opening-balances",
  "lock-period", "reopen-period",
  "create-payroll-entry", "accrue-payroll-entry", "pay-salary",
  "update-finance-approval-policy", "decide-finance-approval",
  "money-desk-create", "money-desk-decide-approval", "money-desk-void", "money-desk-edit", "money-desk-smart-interpret",
  "money-desk-treasury-context", "money-desk-confirm-other-party", "money-desk-update-other-party",
  "money-desk-set-other-party-active", "money-desk-settle-advance",
  "guided-receipt",
  "record-factory-cash-sale",
] as const;

const body = z.object({ action: z.enum(ACTIONS), payload: z.record(z.unknown()) });

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`finance-company-operations:${user.id}`, 60, 60_000);
    const { action, payload } = body.parse(await request.json());
    let result: unknown;

    switch (action) {
      case "bootstrap-coa":
        result = await seedDefaultChartOfAccounts(prisma, user.id);
        break;
      case "bootstrap-dimensions":
        result = await seedDefaultDimensions(prisma, user.id);
        break;
      case "bootstrap-approval-policies":
        result = await seedDefaultFinanceApprovalPolicies(prisma, user.id);
        break;
      case "create-account":
        result = await createAccount(prisma, user.id, z.object({ code: z.string(), name: z.string(), type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]), parentCode: z.string().optional() }).parse(payload));
        break;
      case "update-account": {
        const v = z.object({ accountId: z.string(), name: z.string().optional(), isActive: z.boolean().optional(), parentCode: z.string().optional() }).parse(payload);
        result = await updateAccount(prisma, user.id, v.accountId, v);
        break;
      }
      case "create-dimension":
        result = await createDimension(prisma, user.id, z.object({ kind: z.string(), code: z.string(), name: z.string() }).parse(payload));
        break;
      case "post-manual-journal": {
        const v = z.object({ date: z.coerce.date(), narration: z.string(), reason: z.string(), lines: z.array(journalLine).min(2), idempotencyKey: z.string() }).parse(payload);
        result = await postJournal(prisma, user.id, { ...v, sourceType: "MANUAL" });
        break;
      }
      case "reverse-journal": {
        const v = z.object({ journalId: z.string(), reason: z.string(), idempotencyKey: z.string() }).parse(payload);
        result = await reverseJournal(prisma, user.id, v.journalId, { ...v, approverId: user.id });
        break;
      }
      case "create-treasury-account":
        result = await createTreasuryAccount(prisma, user.id, z.object({ kind: z.enum(["BANK", "CASH"]), code: z.string(), name: z.string(), bankName: z.string().optional(), accountType: z.string().optional(), maskedAccountNumber: z.string().optional(), ifsc: z.string().optional(), openingBalance: z.number().optional(), openingBalanceDate: z.coerce.date().optional() }).parse(payload));
        break;
      case "set-treasury-account-active": {
        const v = z.object({ treasuryAccountId: z.string(), isActive: z.boolean() }).parse(payload);
        result = await setTreasuryAccountActive(prisma, user.id, v);
        break;
      }
      case "money-in":
        result = await recordMoneyIn(prisma, user.id, z.object({ type: z.enum(["CUSTOMER_ADVANCE", "INVOICE_RECEIPT", "OTHER_OPERATING_REVENUE", "OTHER_INCOME", "REFUND_RECOVERY", "BANK_INTEREST", "OTHER_RECEIPT"]), date: z.coerce.date(), amount: z.number(), treasuryAccountId: z.string(), partyType: z.string().optional(), partyId: z.string().optional(), mode: z.string(), reference: z.string().optional(), description: z.string().optional(), dimensionId: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "money-out":
        result = await recordMoneyOut(prisma, user.id, z.object({ type: z.enum(["TAX_PAYMENT", "ADVANCE_TO_EMPLOYEE_VENDOR", "REIMBURSEMENT", "REFUND", "OTHER"]), date: z.coerce.date(), amount: z.number(), treasuryAccountId: z.string(), debitAccountOverride: z.string().optional(), partyType: z.string().optional(), partyId: z.string().optional(), mode: z.string(), reference: z.string().optional(), description: z.string().optional(), dimensionId: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "transfer-funds":
        result = await transferFunds(prisma, user.id, z.object({ fromTreasuryAccountId: z.string(), toTreasuryAccountId: z.string(), amount: z.number(), date: z.coerce.date(), description: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "import-bank-statement":
        result = await commitBankStatementImport(prisma, user.id, z.object({ treasuryAccountId: z.string(), fileName: z.string(), rows: z.array(z.object({ date: z.coerce.date(), valueDate: z.coerce.date().optional(), description: z.string(), reference: z.string().optional(), debit: z.number().optional(), credit: z.number().optional(), balance: z.number().optional() })) }).parse(payload));
        break;
      case "suggest-bank-matches":
        result = await suggestBankMatches(prisma, user.id, z.object({ treasuryAccountId: z.string() }).parse(payload).treasuryAccountId);
        break;
      case "confirm-bank-match":
        result = await confirmBankMatch(prisma, user.id, z.object({ bankLineId: z.string(), journalLineId: z.string() }).parse(payload));
        break;
      case "unmatch-bank-line": {
        const v = z.object({ bankLineId: z.string(), reason: z.string() }).parse(payload);
        result = await unmatchBankLine(prisma, user.id, v.bankLineId, v.reason);
        break;
      }
      case "create-vendor":
        result = await createVendor(prisma, user.id, z.object({ code: z.string(), legalName: z.string(), tradeName: z.string().optional(), gstin: z.string().optional(), pan: z.string().optional(), contactPerson: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), address: z.record(z.unknown()).optional(), state: z.string().optional(), stateCode: z.string().optional(), paymentTermsDays: z.number().int().optional(), category: z.string().optional() }).parse(payload));
        break;
      case "update-vendor": {
        const v = z.object({ vendorId: z.string() }).and(z.object({ legalName: z.string().optional(), tradeName: z.string().optional(), gstin: z.string().optional(), pan: z.string().optional(), contactPerson: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), state: z.string().optional(), stateCode: z.string().optional(), paymentTermsDays: z.number().int().optional(), category: z.string().optional(), isActive: z.boolean().optional() })).parse(payload);
        result = await updateVendor(prisma, user.id, v.vendorId, v);
        break;
      }
      case "create-vendor-bill":
        result = await createVendorBill(prisma, user.id, z.object({ vendorId: z.string(), vendorInvoiceNumber: z.string(), invoiceDate: z.coerce.date(), dueDate: z.coerce.date(), category: z.string(), description: z.string().optional(), taxable: z.number(), cgst: z.number().optional(), sgst: z.number().optional(), igst: z.number().optional(), dimensionId: z.string().optional(), documentFileId: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "record-vendor-payment":
        result = await recordVendorPayment(prisma, user.id, z.object({ vendorId: z.string(), billId: z.string().optional(), amount: z.number(), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string(), paymentMode: z.string(), reference: z.string().optional(), paymentDate: z.coerce.date(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "create-expense-category":
        result = await createExpenseCategory(prisma, user.id, z.object({ code: z.string(), name: z.string(), chartOfAccountId: z.string() }).parse(payload));
        break;
      case "create-expense":
        result = await createExpense(prisma, user.id, z.object({ date: z.coerce.date(), amount: z.number(), payeeType: z.string(), payeeId: z.string().optional(), payeeName: z.string().optional(), categoryId: z.string(), dimensionId: z.string().optional(), paymentMode: z.string(), treasuryAccountId: z.string().optional(), gstTreatment: z.string().optional(), description: z.string().optional(), documentFileId: z.string().optional(), isReimbursable: z.boolean().optional(), employeeId: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "submit-expense":
        result = await submitExpense(prisma, user.id, z.object({ expenseId: z.string() }).parse(payload).expenseId);
        break;
      case "decide-expense": {
        const v = z.object({ expenseId: z.string(), decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string() }).parse(payload);
        result = await decideExpense(prisma, user.id, v.expenseId, v);
        break;
      }
      case "post-expense": {
        const v = z.object({ expenseId: z.string(), paidNow: z.boolean(), treasuryAccountId: z.string().optional(), treasuryAccountCoaCode: z.string().optional() }).parse(payload);
        result = await postExpense(prisma, user.id, v.expenseId, v);
        break;
      }
      case "pay-expense-payable": {
        const v = z.object({ expenseId: z.string(), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string(), paymentDate: z.coerce.date(), idempotencyKey: z.string() }).parse(payload);
        result = await payExpensePayable(prisma, user.id, v.expenseId, v);
        break;
      }
      case "reverse-expense": {
        const v = z.object({ expenseId: z.string(), reason: z.string() }).parse(payload);
        result = await reverseExpense(prisma, user.id, v.expenseId, v.reason);
        break;
      }
      case "create-recurring-expense":
        result = await createRecurringExpenseTemplate(prisma, user.id, z.object({ name: z.string(), categoryId: z.string(), payeeName: z.string().optional(), expectedAmount: z.number(), frequency: z.string(), nextDueDate: z.coerce.date() }).parse(payload));
        break;
      case "generate-expense-from-recurring": {
        const v = z.object({ templateId: z.string(), idempotencyKey: z.string() }).parse(payload);
        result = await generateExpenseFromRecurringTemplate(prisma, user.id, v.templateId, v.idempotencyKey);
        break;
      }
      case "skip-recurring-occurrence":
        result = await skipRecurringOccurrence(prisma, user.id, z.object({ templateId: z.string() }).parse(payload).templateId);
        break;
      case "set-recurring-active": {
        const v = z.object({ templateId: z.string(), isActive: z.boolean() }).parse(payload);
        result = await setRecurringTemplateActive(prisma, user.id, v.templateId, v.isActive);
        break;
      }
      case "create-budget":
        result = await createBudget(prisma, user.id, z.object({ name: z.string(), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), lines: z.array(z.object({ accountId: z.string().optional(), categoryId: z.string().optional(), dimensionId: z.string().optional(), amount: z.number() })) }).parse(payload));
        break;
      case "create-loan":
        result = await createLoan(prisma, user.id, z.object({ lenderName: z.string(), principal: z.number(), interestRate: z.number().optional(), startDate: z.coerce.date(), documentFileId: z.string().optional() }).parse(payload));
        break;
      case "record-loan-disbursement":
        result = await recordLoanDisbursement(prisma, user.id, z.object({ loanId: z.string(), amount: z.number(), date: z.coerce.date(), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "record-loan-repayment":
        result = await recordLoanRepayment(prisma, user.id, z.object({ loanId: z.string(), principalAmount: z.number(), interestAmount: z.number(), date: z.coerce.date(), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "create-fixed-asset":
        result = await createFixedAsset(prisma, user.id, z.object({ name: z.string(), category: z.string(), purchaseDate: z.coerce.date(), cost: z.number(), vendorId: z.string().optional(), location: z.string().optional(), documentFileId: z.string().optional(), usefulLifeMonths: z.number().int().optional(), residualValue: z.number().optional(), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "close-loan":
        result = await closeLoan(prisma, user.id, z.object({ loanId: z.string() }).parse(payload).loanId);
        break;
      case "record-capital-introduced":
        result = await recordCapitalIntroduced(prisma, user.id, z.object({ amount: z.number(), date: z.coerce.date(), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string(), description: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "record-drawings":
        result = await recordDrawings(prisma, user.id, z.object({ amount: z.number(), date: z.coerce.date(), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string(), description: z.string().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "post-opening-balances":
        result = await postOpeningBalances(prisma, user.id, z.object({ effectiveDate: z.coerce.date(), lines: z.array(journalLine).min(2), idempotencyKey: z.string() }).parse(payload));
        break;
      case "lock-period":
        result = await lockPeriod(prisma, user.id, z.object({ periodCode: z.string() }).parse(payload).periodCode);
        break;
      case "reopen-period": {
        const v = z.object({ periodCode: z.string(), reason: z.string() }).parse(payload);
        result = await reopenPeriod(prisma, user.id, v.periodCode, v.reason);
        break;
      }
      case "create-payroll-entry":
        result = await createPayrollEntry(prisma, user.id, z.object({ employeeId: z.string(), month: z.string(), basicSalary: z.number(), allowances: z.number().optional(), incentives: z.number().optional(), reimbursements: z.number().optional(), deductions: z.number().optional(), idempotencyKey: z.string() }).parse(payload));
        break;
      case "accrue-payroll-entry":
        result = await accruePayrollEntry(prisma, user.id, z.object({ entryId: z.string() }).parse(payload).entryId);
        break;
      case "pay-salary": {
        const v = z.object({ entryId: z.string(), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string(), paymentDate: z.coerce.date(), idempotencyKey: z.string() }).parse(payload);
        result = await paySalary(prisma, user.id, v.entryId, v);
        break;
      }
      case "update-finance-approval-policy":
        result = await updateFinanceApprovalPolicy(prisma, user.id, z.object({ category: z.enum(["EXPENSE", "VENDOR_BILL", "PAYMENT", "MANUAL_JOURNAL", "REVERSAL", "LARGE_CASH_TXN", "PERIOD_REOPEN"]), thresholdAmount: z.number(), requiresApproval: z.boolean() }).parse(payload));
        break;
      case "decide-finance-approval": {
        const v = z.object({ approvalId: z.string(), decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string() }).parse(payload);
        result = await decideApproval(prisma, user.id, v.approvalId, v);
        break;
      }
      case "quick-entry":
        result = await quickEntryCreate(
          prisma,
          user.id,
          z
            .object({
              entryType: z.enum(QUICK_ENTRY_TYPES),
              date: z.coerce.date(),
              amount: z.number(),
              categoryId: z.string().optional(),
              manualCategoryName: z.string().optional(),
              saveManualCategory: z.boolean().optional(),
              paymentMode: z.enum(["CASH", "BANK", "UPI", "OTHER"]),
              treasuryAccountId: z.string().optional(),
              partyType: z.string().optional(),
              partyId: z.string().optional(),
              partyName: z.string().optional(),
              employeeId: z.string().optional(),
              remark: z.string().optional(),
              documentFileId: z.string().optional(),
              idempotencyKey: z.string(),
            })
            .parse(payload),
        );
        break;
      case "seed-quick-entry-categories":
        result = await seedQuickEntryCategoryMaster(prisma, user.id);
        break;
      case "money-desk-create":
        result = await createMoneyDeskTransaction(
          prisma,
          user.id,
          z
            .object({
              purposeCode: z.enum(MONEY_DESK_PURPOSE_CODES as [string, ...string[]]),
              direction: z.enum(["CASH_IN", "CASH_OUT", "BANK_IN", "BANK_OUT", "ADJUSTMENT"]),
              amount: z.number(),
              date: z.coerce.date(),
              treasuryAccountId: z.string().optional(),
              counterpartyType: z.string().optional(),
              counterpartyId: z.string().optional(),
              counterpartyName: z.string().optional(),
              description: z.string().optional(),
              documentFileId: z.string().optional(),
              formData: z.record(z.unknown()),
              idempotencyKey: z.string(),
            })
            .parse(payload),
        );
        break;
      case "money-desk-decide-approval": {
        const v = z.object({ transactionId: z.string(), decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string() }).parse(payload);
        result = await decideMoneyDeskApproval(prisma, user.id, v.transactionId, v);
        break;
      }
      case "money-desk-void": {
        const v = z.object({ transactionId: z.string(), reason: z.string() }).parse(payload);
        result = await voidMoneyDeskTransaction(prisma, user.id, v.transactionId, v);
        break;
      }
      case "money-desk-edit": {
        const v = z
          .object({
            transactionId: z.string(),
            amount: z.number().optional(),
            date: z.coerce.date().optional(),
            counterpartyName: z.string().optional(),
            description: z.string().optional(),
            formData: z.record(z.unknown()).optional(),
            reason: z.string(),
            idempotencyKey: z.string(),
          })
          .parse(payload);
        result = await editMoneyDeskTransaction(prisma, user.id, v.transactionId, v);
        break;
      }
      case "money-desk-smart-interpret": {
        // Interpretation only — never posts. The client posts the returned payload through
        // `money-desk-create` / `guided-receipt` above, after the user confirms the review card.
        const v = z.object({ text: z.string().min(2).max(500) }).parse(payload);
        result = await interpretSmartFinance(prisma, user.id, { text: v.text });
        break;
      }
      case "money-desk-treasury-context":
        // Read-only: every active treasury account with its real ledger balance + recent activity.
        result = await treasuryContext(prisma, user.id);
        break;
      case "money-desk-confirm-other-party": {
        // Governed create of a SeeraFinancialDimension{kind:OTHER_PARTY} after explicit user
        // confirmation on the Smart Finance review card. Requires coa:manage; audited; duplicate-safe
        // on normalized name and mobile.
        const v = z.object({ name: z.string().min(2).max(160), mobile: z.string().max(20).optional(), partyType: z.string().max(60).optional(), purpose: z.string().max(240).optional(), relationship: z.string().max(120).optional(), notes: z.string().max(500).optional() }).parse(payload);
        result = await confirmOtherParty(prisma, user.id, v);
        break;
      }
      case "money-desk-update-other-party": {
        const v = z.object({ dimensionId: z.string(), name: z.string().max(160).optional(), mobile: z.string().max(20).optional(), partyType: z.string().max(60).optional(), relationship: z.string().max(120).optional(), notes: z.string().max(500).optional() }).parse(payload);
        result = await updateOtherParty(prisma, user.id, v.dimensionId, v);
        break;
      }
      case "money-desk-set-other-party-active": {
        const v = z.object({ dimensionId: z.string(), isActive: z.boolean() }).parse(payload);
        result = await setOtherPartyActive(prisma, user.id, v.dimensionId, v.isActive);
        break;
      }
      case "money-desk-settle-advance": {
        // Advance settlement / recovery — a governed MANUAL journal (journal:post) that credits
        // account 1300 for the Other Party. Never posts more than the outstanding advance.
        const base = z.object({ dimensionId: z.string(), amount: z.number().positive(), date: z.coerce.date(), reason: z.string().min(1).max(240), idempotencyKey: z.string() });
        const v = z.discriminatedUnion("kind", [
          base.extend({ kind: z.literal("RECOVERY_CASH"), treasuryAccountId: z.string(), treasuryAccountCoaCode: z.string() }),
          base.extend({ kind: z.literal("SETTLE_TO_EXPENSE"), expenseAccountCode: z.string() }),
        ]).parse(payload);
        result = await settleAdvance(prisma, user.id, v);
        break;
      }
      case "guided-receipt":
        result = await recordAndPostReceipt(
          prisma,
          user.id,
          z
            .object({
              payerType: z.string(),
              payerId: z.string(),
              payeeType: z.string(),
              payeeId: z.string(),
              amount: z.number(),
              reference: z.string(),
              paymentMode: z.string(),
              paymentDate: z.coerce.date(),
              allocateToDocumentId: z.string().optional(),
              reason: z.string(),
              idempotencyKey: z.string(),
            })
            .parse(payload),
        );
        break;
      case "record-factory-cash-sale":
        result = await createFactoryCashSale(
          prisma,
          user.id,
          z
            .object({
              saleDate: z.coerce.date(),
              partyName: z.string().optional(),
              amount: z.number(),
              notes: z.string().optional(),
              idempotencyKey: z.string(),
            })
            .parse(payload),
        );
        break;
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiFailure(error, request);
  }
}
