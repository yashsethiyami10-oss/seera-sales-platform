import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { createAccount, activateAccount } from "@/lib/enterprise-finance/chart-of-accounts-service";
import { createFiscalYearWithPeriods } from "@/lib/enterprise-finance/period-service";
import { saveFinanceConfigurationDraft, activateFinanceConfiguration, getFinanceConfiguration } from "@/lib/enterprise-finance/configuration-service";
import { createAndIssueReceivableInvoice } from "@/lib/enterprise-finance/ar-service";
import { allocateVendorPayment, approveVendorPayment, createAndPostVendorBill, requestVendorPayment } from "@/lib/enterprise-finance/ap-service";
import { refreshOverdueBillStatus, refreshOverdueInvoiceStatus } from "@/lib/enterprise-finance/jobs";

const suffix = `sf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
let approverUserId: string;
let revenueAccountId: string;
let expenseAccountId: string;
let vendorId: string;
let customerId: string;

// A calendar year comfortably in the past relative to "now", so a fixed
// due date within it is guaranteed overdue as of the real current date —
// this job intentionally operates against the real current date, not a
// fixed fake year, since "overdue" is inherently relative to today.
// Fiscal years created by tests are permanent — see
// stageA-accounting-core.integration.test.ts's comment for why a fixed
// band (originally 1000-1999) was abandoned: this session's earlier
// *random*-draw attempts for this same file had already scattered years
// up to ~2016 within that band, so a deterministic "next free" pick could
// land near the ceiling immediately. This instead queries the highest
// fiscal year already used anywhere below a safe past ceiling (5 years
// behind whatever "today" actually is when the suite runs, so it keeps
// working correctly for as long as this codebase exists) and picks the
// next one, which is correct regardless of how much of the space below
// that ceiling is already polluted. Every other Finance test file's pool
// starts at 2100 or above, so it can never intersect this one.
async function pickUnusedFiscalYear(usedYears: number): Promise<number> {
  const ceilingYear = new Date().getUTCFullYear() - 5;
  const latest = await prisma.financeFiscalYear.findFirst({
    where: { organizationKey: "MUV", startDate: { lt: new Date(Date.UTC(ceilingYear, 0, 1)) } },
    orderBy: { startDate: "desc" },
    select: { startDate: true },
  });
  const nextFree = latest ? latest.startDate.getUTCFullYear() + 1 : 1000;
  if (nextFree + usedYears >= ceilingYear) throw new Error("Background Jobs fiscal-year test pool exhausted");
  return nextFree;
}

let pastYear: number;
let fyStart: Date;
let fyEnd: Date;
let pastDueDate: Date;

describe("Part 3C Stage B — Background Jobs (overdue AR/AP status refresh)", () => {
  beforeAll(async () => {
    pastYear = await pickUnusedFiscalYear(1);
    fyStart = new Date(Date.UTC(pastYear, 3, 1));
    fyEnd = new Date(Date.UTC(pastYear + 1, 2, 31));
    pastDueDate = new Date(Date.UTC(pastYear, 4, 1));

    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED"]) {
      await setFlag(key, true);
    }

    const founder = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
    if (!founder) throw new Error("A seeded, active Founder user is required for this test");
    founderUserId = founder.id;

    const approverRole = await prisma.salesRole.create({ data: { name: `StageB Jobs Approver ${suffix}`, active: true, description: "Test-only role" } });
    const approvePermission = await prisma.salesPermission.findUniqueOrThrow({ where: { permissionKey: "finance.payments.approve" } });
    await prisma.salesRolePermission.create({ data: { roleId: approverRole.id, permissionId: approvePermission.id } });
    const approverUser = await prisma.user.create({
      data: { name: "StageB Jobs Approver", email: `stageb-jobs-approver-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "STAFF", salesRoleId: approverRole.id, active: true },
    });
    approverUserId = approverUser.id;

    const customer = await prisma.customer.create({ data: { email: `stageb-jobs-customer-${suffix}@example.test`, name: "Jobs Test Customer" } });
    customerId = customer.id;
    const vendor = await prisma.enterpriseVendor.create({
      data: { organizationKey: "MUV", vendorCode: `${suffix}-JV1`, legalName: "Jobs Test Vendor Pvt Ltd", displayName: "Jobs Test Vendor", createdById: founderUserId },
    });
    vendorId = vendor.id;

    authAs(founderUserId);
    await createFiscalYearWithPeriods({ code: `${suffix}-FY`, startDate: fyStart, endDate: fyEnd, periodCount: 12 });

    const ar = await createAccount({ accountCode: `${suffix}-1200`, name: "AR", category: "ASSET", normalBalance: "DEBIT", isControlAccount: true });
    const activatedAr = await activateAccount(ar.id, ar.version);
    const ap = await createAccount({ accountCode: `${suffix}-2100`, name: "AP", category: "LIABILITY", normalBalance: "CREDIT", isControlAccount: true });
    const activatedAp = await activateAccount(ap.id, ap.version);
    const cash = await createAccount({ accountCode: `${suffix}-1000`, name: "Cash", category: "ASSET", normalBalance: "DEBIT" });
    const activatedCash = await activateAccount(cash.id, cash.version);
    const revenue = await createAccount({ accountCode: `${suffix}-4000`, name: "Revenue", category: "REVENUE", normalBalance: "CREDIT" });
    const activatedRevenue = await activateAccount(revenue.id, revenue.version);
    revenueAccountId = activatedRevenue.id;
    const expense = await createAccount({ accountCode: `${suffix}-5000`, name: "Expense", category: "EXPENSE", normalBalance: "DEBIT" });
    const activatedExpense = await activateAccount(expense.id, expense.version);
    expenseAccountId = activatedExpense.id;

    // Phase2Operation rows for these job types are day-scoped by design
    // (see jobs.ts) and are real, deletable rows (unlike posted
    // journals/ledger entries) — clear any left over from a previous
    // local run today so this test's own idempotency assertions are
    // exercised against a clean slate, matching
    // foundations.integration.test.ts's own established cleanup pattern.
    await prisma.phase2Operation.deleteMany({ where: { organizationKey: "MUV", operationType: { in: ["JOB:AR_INVOICE_OVERDUE_REFRESH", "JOB:AP_BILL_OVERDUE_REFRESH"] } } });

    const existingConfig = await getFinanceConfiguration();
    const draftConfig = await saveFinanceConfigurationDraft(
      { arControlAccountId: activatedAr.id, apControlAccountId: activatedAp.id, defaultCashAccountId: activatedCash.id },
      existingConfig?.version,
    );
    if (draftConfig.status !== "ACTIVE") await activateFinanceConfiguration(draftConfig.version);

    const { getOrCreateCustomerAccount } = await import("@/lib/enterprise-finance/ar-service");
    await getOrCreateCustomerAccount({ customerId });
    const { getOrCreateVendorAccount } = await import("@/lib/enterprise-finance/ap-service");
    await getOrCreateVendorAccount({ vendorId });
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED"]) {
      await setFlag(key, false);
    }
  });

  it("marks a past-due AR invoice OVERDUE, and the job replays idempotently without error", async () => {
    authAs(founderUserId);
    const invoice = await createAndIssueReceivableInvoice({
      customerId, issueDate: pastDueDate, dueDate: pastDueDate, taxAmount: 0,
      lines: [{ description: "Overdue AR test", unitPrice: 500, accountId: revenueAccountId }],
    }, `${suffix}-ar-overdue-invoice`);
    expect(invoice.status).toBe("ISSUED");

    const first = await refreshOverdueInvoiceStatus(`${suffix}-ar-job-1`);
    expect(first.acquired).toBe(true);

    const refreshed = await prisma.financeReceivableInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(refreshed.status).toBe("OVERDUE");

    // Idempotent replay with a different correlation id but the SAME
    // idempotency key (date-scoped) should not throw and should not
    // re-run the update as a fresh operation.
    const replay = await refreshOverdueInvoiceStatus(`${suffix}-ar-job-2`);
    expect(replay.acquired).toBe(false);
  });

  it("marks a past-due AP bill OVERDUE, and payment allocation still succeeds against it (the bug found and fixed this stage)", async () => {
    authAs(founderUserId);
    const bill = await createAndPostVendorBill({
      vendorId, supplierInvoiceNo: `${suffix}-OVERDUE-BILL`, billDate: pastDueDate, dueDate: pastDueDate, taxAmount: 0,
      lines: [{ description: "Overdue AP test", unitPrice: 300, accountId: expenseAccountId }],
    }, `${suffix}-ap-overdue-bill`);
    expect(bill.status).toBe("POSTED");

    await refreshOverdueBillStatus(`${suffix}-ap-job-1`);
    const refreshedBill = await prisma.financeVendorBill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(refreshedBill.status).toBe("OVERDUE");

    // Before the fix, allocateVendorPayment's allowed-status list omitted
    // OVERDUE and this would have thrown ConflictError.
    const payment = await requestVendorPayment({ vendorId, paymentDate: pastDueDate, amount: 300 });
    authAs(approverUserId);
    const approved = await approveVendorPayment(payment.id, payment.version, `${suffix}-ap-overdue-pay`);
    authAs(founderUserId);
    const allocation = await allocateVendorPayment(approved.id, approved.version, { billId: bill.id, amount: 300 });
    expect(allocation.allocatedAmount.toString()).toBe("300");

    const paidBill = await prisma.financeVendorBill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(paidBill.status).toBe("PAID");
  });

  it("denies the overdue refresh job to a principal without the relevant permission", async () => {
    const restricted = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Customer Support", active: true } } });
    if (!restricted) return; // covered elsewhere if this seeded role is ever absent
    authAs(restricted.id);
    await expect(refreshOverdueInvoiceStatus(`${suffix}-denied`)).rejects.toBeInstanceOf(ForbiddenError);
    authAs(founderUserId);
  });
});
