import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, ForbiddenError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { createAccount, activateAccount } from "@/lib/enterprise-finance/chart-of-accounts-service";
import { createFiscalYearWithPeriods } from "@/lib/enterprise-finance/period-service";
import { saveFinanceConfigurationDraft, activateFinanceConfiguration, getFinanceConfiguration } from "@/lib/enterprise-finance/configuration-service";
import {
  approveExpenseClaim, createExpenseCategory, createExpenseClaimDraft, postApprovedExpenseClaim,
  reimburseExpenseClaim, rejectExpenseClaim, submitExpenseClaim,
} from "@/lib/enterprise-finance/expense-service";

const suffix = `sd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
let categoryId: string;

async function approveAsSecondActor(claimId: string, expectedVersion: number, approvals: { lineId: string; approvedAmount: number }[]) {
  authAs(approverUserId);
  const result = await approveExpenseClaim(claimId, expectedVersion, { approvals });
  authAs(founderUserId);
  return result;
}

describe("Part 3C Stage B — Expense Management", () => {
  beforeAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED"]) {
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
        data: { name: "StageB Expense Restricted Test User", email: `stageb-exp-restricted-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      restrictedUserId = created.id;
      createdRestrictedUser = true;
    }

    const approverPermissionKeys = ["finance.expenses.approve"];
    const approverPermissions = await prisma.salesPermission.findMany({ where: { permissionKey: { in: approverPermissionKeys } } });
    if (approverPermissions.length !== approverPermissionKeys.length) throw new Error("Expected finance.expenses.approve to already be seeded");
    const approverRole = await prisma.salesRole.create({ data: { name: `StageB Expense Approver ${suffix}`, active: true, description: "Test-only role for Stage B expense SoD two-actor tests" } });
    await prisma.salesRolePermission.createMany({ data: approverPermissions.map((p) => ({ roleId: approverRole.id, permissionId: p.id })) });
    const approverUser = await prisma.user.create({
      data: { name: "StageB Expense Approver", email: `stageb-exp-approver-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "STAFF", salesRoleId: approverRole.id, active: true },
    });
    approverUserId = approverUser.id;

    authAs(founderUserId);
    // Expense posting/reimbursement use the real current date (Section 21
    // has no caller-supplied posting date for this event), so — unlike
    // the AR/AP tests, which control postingDate explicitly with fixed
    // fake years — a fiscal period covering *today* must actually exist.
    // Guarded by an existence check so repeated local test runs (which
    // would otherwise collide with a previous run's fiscal year covering
    // the same real calendar year via assertNoOverlap) are safe.
    const today = new Date();
    const existingPeriod = await prisma.financeFiscalPeriod.findFirst({
      where: { organizationKey: "MUV", startDate: { lte: today }, endDate: { gt: today } },
    });
    if (!existingPeriod) {
      const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      const yearEnd = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));
      await createFiscalYearWithPeriods({ code: `${suffix}-CALENDAR-FY`, startDate: yearStart, endDate: yearEnd, periodCount: 12 });
    }

    const expenseAccount = await createAccount({ accountCode: `${suffix}-5100`, name: "Travel Expense", category: "EXPENSE", normalBalance: "DEBIT" });
    const activatedExpenseAccount = await activateAccount(expenseAccount.id, expenseAccount.version);

    const payable = await createAccount({ accountCode: `${suffix}-2300`, name: "Expense Payable", category: "LIABILITY", normalBalance: "CREDIT" });
    const activatedPayable = await activateAccount(payable.id, payable.version);

    const cash = await createAccount({ accountCode: `${suffix}-1000`, name: "Cash", category: "ASSET", normalBalance: "DEBIT" });
    const activatedCash = await activateAccount(cash.id, cash.version);

    const existingConfig = await getFinanceConfiguration();
    const draftConfig = await saveFinanceConfigurationDraft(
      { defaultExpensePayableAccountId: activatedPayable.id, defaultCashAccountId: activatedCash.id },
      existingConfig?.version,
    );
    if (draftConfig.status !== "ACTIVE") await activateFinanceConfiguration(draftConfig.version);

    const category = await createExpenseCategory({ code: `${suffix}-TRAVEL`, name: "Travel", defaultAccountId: activatedExpenseAccount.id });
    categoryId = category.id;
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED"]) {
      await setFlag(key, false);
    }
    if (createdRestrictedUser) await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
  });

  it("denies a principal without finance.expenses.manage", async () => {
    authAs(restrictedUserId);
    await expect(createExpenseClaimDraft({ lines: [{ categoryId, description: "Test", expenseDate: new Date(), claimedAmount: 100 }] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects approval by the claimant themselves (self-approval)", async () => {
    authAs(founderUserId);
    const claim = await createExpenseClaimDraft({ lines: [{ categoryId, description: "Self-approve test", expenseDate: new Date(), claimedAmount: 500 }] });
    const submitted = await submitExpenseClaim(claim.id, claim.version);
    await expect(approveExpenseClaim(claim.id, submitted.version, { approvals: [{ lineId: claim.lines[0]!.id, approvedAmount: 500 }] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an approved amount exceeding the claimed amount", async () => {
    authAs(founderUserId);
    const claim = await createExpenseClaimDraft({ lines: [{ categoryId, description: "Over-approve test", expenseDate: new Date(), claimedAmount: 200 }] });
    const submitted = await submitExpenseClaim(claim.id, claim.version);
    authAs(approverUserId);
    await expect(approveExpenseClaim(claim.id, submitted.version, { approvals: [{ lineId: claim.lines[0]!.id, approvedAmount: 300 }] })).rejects.toThrow();
    authAs(founderUserId);
  });

  it("fully approves, posts, and reimburses a single-line claim end to end", async () => {
    authAs(founderUserId);
    const claim = await createExpenseClaimDraft({ lines: [{ categoryId, description: "Full flow", expenseDate: new Date(), claimedAmount: 1200 }] });
    const submitted = await submitExpenseClaim(claim.id, claim.version);
    const approved = await approveAsSecondActor(claim.id, submitted.version, [{ lineId: claim.lines[0]!.id, approvedAmount: 1200 }]);
    expect(approved.status).toBe("APPROVED");
    expect(approved.totalApprovedAmount.toString()).toBe("1200");

    const posted = await postApprovedExpenseClaim(claim.id, approved.version, `${suffix}-post-1`);
    expect(posted.status).toBe("POSTED");
    const postJournal = await prisma.financeJournal.findUniqueOrThrow({ where: { id: posted.journalId! } });
    expect(postJournal.totalDebit.toString()).toBe("1200");

    const reimbursed = await reimburseExpenseClaim(claim.id, posted.version, `${suffix}-reimburse-1`);
    expect(reimbursed.status).toBe("REIMBURSED");
    expect(reimbursed.reimbursedAt).not.toBeNull();
  });

  it("partially approves a multi-line claim and posts only the approved amounts", async () => {
    authAs(founderUserId);
    const claim = await createExpenseClaimDraft({
      lines: [
        { categoryId, description: "Line A", expenseDate: new Date(), claimedAmount: 1000 },
        { categoryId, description: "Line B", expenseDate: new Date(), claimedAmount: 500 },
      ],
    });
    const submitted = await submitExpenseClaim(claim.id, claim.version);
    const approved = await approveAsSecondActor(claim.id, submitted.version, [
      { lineId: claim.lines[0]!.id, approvedAmount: 800 },
      { lineId: claim.lines[1]!.id, approvedAmount: 0 },
    ]);
    expect(approved.status).toBe("PARTIALLY_APPROVED");
    expect(approved.totalApprovedAmount.toString()).toBe("800");

    const posted = await postApprovedExpenseClaim(claim.id, approved.version, `${suffix}-post-partial`);
    const journal = await prisma.financeJournal.findUniqueOrThrow({ where: { id: posted.journalId! } });
    expect(journal.totalDebit.toString()).toBe("800");
  });

  it("rejects a claim requiring a reason, by a different actor than the claimant", async () => {
    authAs(founderUserId);
    const claim = await createExpenseClaimDraft({ lines: [{ categoryId, description: "Reject test", expenseDate: new Date(), claimedAmount: 300 }] });
    const submitted = await submitExpenseClaim(claim.id, claim.version);
    authAs(approverUserId);
    await expect(rejectExpenseClaim(claim.id, submitted.version, { reason: "" })).rejects.toThrow();
    const rejected = await rejectExpenseClaim(claim.id, submitted.version, { reason: "Not a business expense" });
    expect(rejected.status).toBe("REJECTED");
    authAs(founderUserId);
  });

  it("rejects direct mutation of a submitted claim at the database level", async () => {
    authAs(founderUserId);
    const claim = await createExpenseClaimDraft({ lines: [{ categoryId, description: "Immutable test", expenseDate: new Date(), claimedAmount: 100 }] });
    const submitted = await submitExpenseClaim(claim.id, claim.version);
    await expect(prisma.financeExpenseClaim.update({ where: { id: submitted.id }, data: { currency: "USD" } })).rejects.toThrow();
  });
});
