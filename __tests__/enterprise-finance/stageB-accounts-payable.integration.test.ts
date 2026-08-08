import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { createAccount, activateAccount } from "@/lib/enterprise-finance/chart-of-accounts-service";
import { createFiscalYearWithPeriods } from "@/lib/enterprise-finance/period-service";
import { saveFinanceConfigurationDraft, activateFinanceConfiguration, getFinanceConfiguration } from "@/lib/enterprise-finance/configuration-service";
import {
  allocateVendorPayment, approveVendorPayment, createAndPostVendorBill, getOrCreateVendorAccount,
  getPayablesAging, getVendorBalance, requestVendorPayment, reverseVendorAllocation,
} from "@/lib/enterprise-finance/ap-service";

const suffix = `sc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function authAs(userId: string) {
  mockAuth.mockResolvedValue({ user: { id: userId } } as never);
}

async function setFlag(key: string, enabled: boolean) {
  await prisma.aiConfiguration.upsert({
    where: { organizationKey_key: { organizationKey: "MUV", key } },
    update: { value: { enabled } },
    create: { organizationKey: "MUV", key, category: "FEATURE_FLAG", value: { enabled } },
  });
}

let founderUserId: string;
let restrictedUserId: string;
let createdRestrictedUser = false;
let approverUserId: string;
let vendorId: string;
let expenseAccountId: string;

// Fiscal years created by tests are permanent — see
// stageA-accounting-core.integration.test.ts's comment for why this queries
// the true highest fiscal year used anywhere for the org (shared pool with
// every other future-anchored Finance test file, starting at 2100) and
// picks the next one, instead of drawing randomly or trusting a fixed band.
async function pickUnusedFiscalYear(usedYears: number): Promise<number> {
  const poolStart = 2100;
  const latest = await prisma.financeFiscalYear.findFirst({
    where: { organizationKey: "MUV", startDate: { gte: new Date(Date.UTC(poolStart, 0, 1)) } },
    orderBy: { startDate: "desc" },
    select: { startDate: true },
  });
  const nextFree = latest ? latest.startDate.getUTCFullYear() + 1 : poolStart;
  if (nextFree + usedYears >= 9999) throw new Error("Finance fiscal-year test pool exhausted");
  return nextFree;
}

let baseYear: number;
let fyStart: Date;
let fyEnd: Date;
let billDate: Date;
let dueDate: Date;

async function approvePaymentAsSecondActor(paymentId: string, expectedVersion: number, idempotencyKey: string) {
  authAs(approverUserId);
  const result = await approveVendorPayment(paymentId, expectedVersion, idempotencyKey);
  authAs(founderUserId);
  return result;
}

describe("Part 3C Stage B — Accounts Payable", () => {
  beforeAll(async () => {
    baseYear = await pickUnusedFiscalYear(1);
    fyStart = new Date(Date.UTC(baseYear, 3, 1));
    fyEnd = new Date(Date.UTC(baseYear + 1, 2, 31));
    billDate = new Date(Date.UTC(baseYear, 4, 10));
    dueDate = new Date(Date.UTC(baseYear, 5, 9));

    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED", "ENTERPRISE_FINANCIAL_REPORTING_ENABLED"]) {
      await setFlag(key, true);
    }

    const founder = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
    if (!founder) throw new Error("A seeded, active Founder user is required for this test");
    founderUserId = founder.id;

    const support = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Customer Support", active: true } } });
    if (support) {
      restrictedUserId = support.id;
    } else {
      const supportRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Customer Support" } });
      const created = await prisma.user.create({
        data: { name: "StageB AP Restricted Test User", email: `stageb-ap-restricted-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      restrictedUserId = created.id;
      createdRestrictedUser = true;
    }

    const approverPermissionKeys = ["finance.payments.approve"];
    const approverPermissions = await prisma.salesPermission.findMany({ where: { permissionKey: { in: approverPermissionKeys } } });
    if (approverPermissions.length !== approverPermissionKeys.length) throw new Error("Expected finance.payments.approve to already be seeded");
    const approverRole = await prisma.salesRole.create({ data: { name: `StageB AP Approver ${suffix}`, active: true, description: "Test-only role for Stage B AP SoD two-actor tests" } });
    await prisma.salesRolePermission.createMany({ data: approverPermissions.map((p) => ({ roleId: approverRole.id, permissionId: p.id })) });
    const approverUser = await prisma.user.create({
      data: { name: "StageB AP Approver", email: `stageb-ap-approver-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "STAFF", salesRoleId: approverRole.id, active: true },
    });
    approverUserId = approverUser.id;

    const vendor = await prisma.enterpriseVendor.create({
      data: { organizationKey: "MUV", vendorCode: `${suffix}-V1`, legalName: "Stage B Test Vendor Pvt Ltd", displayName: "Stage B Test Vendor", createdById: founderUserId },
    });
    vendorId = vendor.id;

    authAs(founderUserId);
    await createFiscalYearWithPeriods({ code: `${suffix}-FY`, startDate: fyStart, endDate: fyEnd, periodCount: 12 });

    const ap = await createAccount({ accountCode: `${suffix}-2100`, name: "Accounts Payable", category: "LIABILITY", normalBalance: "CREDIT", isControlAccount: true });
    const activatedAp = await activateAccount(ap.id, ap.version);

    const cash = await createAccount({ accountCode: `${suffix}-1000`, name: "Cash", category: "ASSET", normalBalance: "DEBIT" });
    const activatedCash = await activateAccount(cash.id, cash.version);

    const inputTax = await createAccount({ accountCode: `${suffix}-1300`, name: "Input Tax Receivable", category: "ASSET", normalBalance: "DEBIT" });
    const activatedInputTax = await activateAccount(inputTax.id, inputTax.version);

    const expense = await createAccount({ accountCode: `${suffix}-5000`, name: "Operating Expense", category: "EXPENSE", normalBalance: "DEBIT" });
    const activatedExpense = await activateAccount(expense.id, expense.version);
    expenseAccountId = activatedExpense.id;

    const existingConfig = await getFinanceConfiguration();
    const draftConfig = await saveFinanceConfigurationDraft(
      { apControlAccountId: activatedAp.id, defaultCashAccountId: activatedCash.id, inputTaxControlAccountId: activatedInputTax.id },
      existingConfig?.version,
    );
    if (draftConfig.status !== "ACTIVE") await activateFinanceConfiguration(draftConfig.version);

    await getOrCreateVendorAccount({ vendorId });
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED", "ENTERPRISE_FINANCIAL_REPORTING_ENABLED"]) {
      await setFlag(key, false);
    }
    if (createdRestrictedUser) await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
  });

  describe("permissions and vendor identity reuse", () => {
    it("denies a principal without finance.payables.manage", async () => {
      authAs(restrictedUserId);
      await expect(getOrCreateVendorAccount({ vendorId })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("rejects creating a vendor account for a vendor that doesn't exist", async () => {
      authAs(founderUserId);
      await expect(getOrCreateVendorAccount({ vendorId: "clsomefakeidxxxxxxxxxxxxxx" })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("bill posting and duplicate detection", () => {
    it("posts a balanced bill with input tax", async () => {
      authAs(founderUserId);
      const bill = await createAndPostVendorBill({
        vendorId, supplierInvoiceNo: `${suffix}-SUP-1`, billDate, dueDate, taxAmount: 90,
        lines: [{ description: "Office supplies", unitPrice: 1000, accountId: expenseAccountId }],
      }, `${suffix}-bill-1`);

      expect(bill.status).toBe("POSTED");
      expect(bill.totalAmount.toString()).toBe("1090");
      expect(bill.outstandingAmount.toString()).toBe("1090");

      const journal = await prisma.financeJournal.findUniqueOrThrow({ where: { id: bill.journalId! } });
      expect(journal.totalDebit.toString()).toBe("1090");
      expect(journal.totalCredit.toString()).toBe("1090");
    });

    it("rejects a duplicate supplier invoice number for the same vendor", async () => {
      authAs(founderUserId);
      await createAndPostVendorBill({
        vendorId, supplierInvoiceNo: `${suffix}-SUP-DUP`, billDate, dueDate, taxAmount: 0,
        lines: [{ description: "First", unitPrice: 100, accountId: expenseAccountId }],
      }, `${suffix}-bill-dup-1`);

      await expect(createAndPostVendorBill({
        vendorId, supplierInvoiceNo: `${suffix}-SUP-DUP`, billDate, dueDate, taxAmount: 0,
        lines: [{ description: "Duplicate", unitPrice: 200, accountId: expenseAccountId }],
      }, `${suffix}-bill-dup-2`)).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects direct mutation of a posted bill and its lines at the database level", async () => {
      authAs(founderUserId);
      const bill = await createAndPostVendorBill({
        vendorId, supplierInvoiceNo: `${suffix}-SUP-IMMUTABLE`, billDate, dueDate, taxAmount: 0,
        lines: [{ description: "Immutable test", unitPrice: 500, accountId: expenseAccountId }],
      }, `${suffix}-bill-immutable`);

      await expect(prisma.financeVendorBill.update({ where: { id: bill.id }, data: { supplierInvoiceNo: "tampered" } })).rejects.toThrow();
      const line = await prisma.financeVendorBillLine.findFirstOrThrow({ where: { billId: bill.id } });
      await expect(prisma.financeVendorBillLine.update({ where: { id: line.id }, data: { description: "tampered" } })).rejects.toThrow();
    });
  });

  describe("payment request/approval SoD and allocation", () => {
    it("rejects approval by the same actor who requested the payment", async () => {
      authAs(founderUserId);
      const payment = await requestVendorPayment({ vendorId, paymentDate: billDate, amount: 100 });
      await expect(approveVendorPayment(payment.id, payment.version, `${suffix}-sameactor-pay`)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("approves a payment by a genuinely different actor and posts a balanced journal", async () => {
      authAs(founderUserId);
      const payment = await requestVendorPayment({ vendorId, paymentDate: billDate, amount: 700 });
      const approved = await approvePaymentAsSecondActor(payment.id, payment.version, `${suffix}-pay-approve-1`);
      expect(approved.status).toBe("APPROVED");
      const journal = await prisma.financeJournal.findUniqueOrThrow({ where: { id: approved.journalId! } });
      expect(journal.totalDebit.toString()).toBe("700");
      expect(journal.totalCredit.toString()).toBe("700");
    });

    it("allocates an approved payment to a bill and rejects over-allocation on either side", async () => {
      authAs(founderUserId);
      const bill = await createAndPostVendorBill({
        vendorId, supplierInvoiceNo: `${suffix}-SUP-ALLOC`, billDate, dueDate, taxAmount: 0,
        lines: [{ description: "Alloc test", unitPrice: 900, accountId: expenseAccountId }],
      }, `${suffix}-bill-alloc`);
      const payment = await requestVendorPayment({ vendorId, paymentDate: billDate, amount: 900 });
      const approved = await approvePaymentAsSecondActor(payment.id, payment.version, `${suffix}-pay-approve-alloc`);

      await expect(allocateVendorPayment(approved.id, approved.version, { billId: bill.id, amount: 1000 })).rejects.toBeInstanceOf(ConflictError);

      const allocation = await allocateVendorPayment(approved.id, approved.version, { billId: bill.id, amount: 900 });
      expect(allocation.allocatedAmount.toString()).toBe("900");

      const updatedBill = await prisma.financeVendorBill.findUniqueOrThrow({ where: { id: bill.id } });
      expect(updatedBill.status).toBe("PAID");
      expect(updatedBill.outstandingAmount.toString()).toBe("0");
    });

    it("reverses an allocation via a new row without mutating the original", async () => {
      authAs(founderUserId);
      const bill = await createAndPostVendorBill({
        vendorId, supplierInvoiceNo: `${suffix}-SUP-REV`, billDate, dueDate, taxAmount: 0,
        lines: [{ description: "Reversal test", unitPrice: 400, accountId: expenseAccountId }],
      }, `${suffix}-bill-rev`);
      const payment = await requestVendorPayment({ vendorId, paymentDate: billDate, amount: 400 });
      const approved = await approvePaymentAsSecondActor(payment.id, payment.version, `${suffix}-pay-approve-rev`);
      const allocation = await allocateVendorPayment(approved.id, approved.version, { billId: bill.id, amount: 400 });

      await expect(prisma.financeVendorPaymentAllocation.update({ where: { id: allocation.id }, data: { allocatedAmount: 1 } as any })).rejects.toThrow();

      const reversal = await reverseVendorAllocation(allocation.id);
      expect(reversal.reversalOfAllocationId).toBe(allocation.id);

      const restoredBill = await prisma.financeVendorBill.findUniqueOrThrow({ where: { id: bill.id } });
      expect(restoredBill.outstandingAmount.toString()).toBe("400");
      expect(restoredBill.status).toBe("POSTED");
    });
  });

  describe("balances, aging, and reporting access", () => {
    it("computes an accurate outstanding vendor balance across open bills", async () => {
      authAs(founderUserId);
      const freshVendor = await prisma.enterpriseVendor.create({
        data: { organizationKey: "MUV", vendorCode: `${suffix}-V2`, legalName: "Balance Vendor Pvt Ltd", displayName: "Balance Vendor", createdById: founderUserId },
      });
      await getOrCreateVendorAccount({ vendorId: freshVendor.id });
      await createAndPostVendorBill({ vendorId: freshVendor.id, supplierInvoiceNo: `${suffix}-BAL-1`, billDate, dueDate, taxAmount: 0, lines: [{ description: "X", unitPrice: 300, accountId: expenseAccountId }] }, `${suffix}-balance-bill-1`);
      await createAndPostVendorBill({ vendorId: freshVendor.id, supplierInvoiceNo: `${suffix}-BAL-2`, billDate, dueDate, taxAmount: 0, lines: [{ description: "Y", unitPrice: 200, accountId: expenseAccountId }] }, `${suffix}-balance-bill-2`);

      const balance = await getVendorBalance(freshVendor.id);
      expect(balance.outstandingBalance.toString()).toBe("500");
    });

    it("buckets an overdue bill correctly using an explicit as-of date", async () => {
      authAs(founderUserId);
      const freshVendor = await prisma.enterpriseVendor.create({
        data: { organizationKey: "MUV", vendorCode: `${suffix}-V3`, legalName: "Aging Vendor Pvt Ltd", displayName: "Aging Vendor", createdById: founderUserId },
      });
      await getOrCreateVendorAccount({ vendorId: freshVendor.id });
      const overdueDue = new Date(Date.UTC(baseYear, 4, 1));
      const bill = await createAndPostVendorBill({
        vendorId: freshVendor.id, supplierInvoiceNo: `${suffix}-AGING`, billDate: new Date(Date.UTC(baseYear, 3, 1)), dueDate: overdueDue, taxAmount: 0,
        lines: [{ description: "Overdue", unitPrice: 750, accountId: expenseAccountId }],
      }, `${suffix}-aging-bill`);

      const asOfDate = new Date(Date.UTC(baseYear, 5, 15)); // 45 days after the due date
      const aging = await getPayablesAging(asOfDate);
      const row = aging.rows.find((r) => r.billId === bill.id);
      expect(row?.bucket).toBe("DAYS_31_60");
    });

    it("rejects aging/report access without ENTERPRISE_FINANCIAL_REPORTING_ENABLED", async () => {
      await setFlag("ENTERPRISE_FINANCIAL_REPORTING_ENABLED", false);
      authAs(founderUserId);
      await expect(getPayablesAging(new Date())).rejects.toBeInstanceOf(ForbiddenError);
      await setFlag("ENTERPRISE_FINANCIAL_REPORTING_ENABLED", true);
    });
  });
});
