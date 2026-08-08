import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { createAccount, activateAccount } from "@/lib/enterprise-finance/chart-of-accounts-service";
import { createFiscalYearWithPeriods } from "@/lib/enterprise-finance/period-service";
import {
  addJournalLine, approveJournal, createJournalDraft, rejectJournal, submitJournal, validateJournal,
} from "@/lib/enterprise-finance/journal-service";
import { createCorrectionSuccessor, postJournal, reversePostedJournal } from "@/lib/enterprise-finance/posting-engine";
import { getAccountLedger, getJournalLedger, getPeriodActivitySummary, getSourceLedger, getTrialBalance } from "@/lib/enterprise-finance/ledger-service";

const suffix = `sa${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
let cashAccountId: string;
let cashAccountVersion: number;
let revenueAccountId: string;

/**
 * The seeded JOURNAL_APPROVAL/JOURNAL_POSTING SoD policies have
 * prohibitSameActor=true and no overridePermission configured, so — per
 * lib/enterprise-phase2/foundation.ts's enforceSegregationOfDuties —
 * *no* actor, Founder included, may both prepare and approve (or approve
 * and post) the same journal. This is correct, intentional behavior
 * (Section 25: "Founder authorization must not bypass... SoD where
 * required"), not a limitation to work around. Every lifecycle test below
 * therefore uses two real actors: Founder creates/submits/posts, and a
 * throwaway "Finance Approver" test user (granted exactly
 * finance.journals.approve/post) performs the approval step. */
async function approveAsSecondActor(journalId: string, expectedVersion: number) {
  authAs(approverUserId);
  const result = await approveJournal(journalId, expectedVersion);
  authAs(founderUserId);
  return result;
}

// Fiscal years created by tests are permanent (cannot be cleaned up once
// referenced, see the afterAll note below), and Prisma's query engine
// cannot serialize a year past 9999 (a real, observed limitation — the
// extended-ISO "+176974-04-01..." form it produces for 5-6 digit years is
// rejected by the driver), so this can't just widen into a huge random
// range to dodge collisions. A first attempt reserved a fixed per-file
// band (e.g. 2100-4099 here) and picked the next unused year within it —
// but stale years from this same session's earlier *random*-draw attempts
// (which could land anywhere up to ~7099) had already polluted the top of
// that fixed band, so the very first deterministic pick landed near the
// band's ceiling and immediately "ran out". The actual fix: this queries
// the TRUE highest fiscal year used *anywhere* for the org at or above
// 2100 (shared with every other future-anchored Finance test file —
// stageB-accounts-receivable/-payable, stageB-banking — see their
// identical helper; Wave 1's fixed 2031-2040 and stageB-jobs's
// past-anchored pool stay below 2100 so they never intersect this) and
// always picks the next year past it, so it is correct regardless of how
// much of the space is already polluted, by whom, or when.
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
let testYearStart: Date;
let testYearEnd: Date;
let midYearDate: Date;
let laterMidYearDate: Date;
let closedFyStart: Date;
let closedFyEnd: Date;
let closedFyPostingDate: Date;

describe("Part 3C Stage A — Accounting Core (Journal / Posting Engine / General Ledger)", () => {
  beforeAll(async () => {
    baseYear = await pickUnusedFiscalYear(8); // testYear (+0/+1), closedFy (+2/+3), audit-repair empty-period test (+4/+5), audit-repair large-aggregation test (+6/+7)
    testYearStart = new Date(Date.UTC(baseYear, 3, 1));
    testYearEnd = new Date(Date.UTC(baseYear + 1, 2, 31));
    midYearDate = new Date(Date.UTC(baseYear, 4, 15));
    laterMidYearDate = new Date(Date.UTC(baseYear, 5, 1));
    closedFyStart = new Date(Date.UTC(baseYear + 2, 3, 1));
    closedFyEnd = new Date(Date.UTC(baseYear + 3, 2, 31));
    closedFyPostingDate = new Date(Date.UTC(baseYear + 2, 3, 10));

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
        data: { name: "StageA Restricted Test User", email: `stagea-restricted-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      restrictedUserId = created.id;
      createdRestrictedUser = true;
    }

    const approverPermissionKeys = ["finance.journals.approve", "finance.journals.post"];
    const approverPermissions = await prisma.salesPermission.findMany({ where: { permissionKey: { in: approverPermissionKeys } } });
    if (approverPermissions.length !== approverPermissionKeys.length) throw new Error("Expected finance.journals.approve/post permissions to already be seeded");
    const approverRole = await prisma.salesRole.create({
      data: { name: `StageA Finance Approver ${suffix}`, active: true, description: "Test-only role for Stage A SoD two-actor tests" },
    });
    await prisma.salesRolePermission.createMany({ data: approverPermissions.map((p) => ({ roleId: approverRole.id, permissionId: p.id })) });
    const approverUser = await prisma.user.create({
      data: { name: "StageA Finance Approver", email: `stagea-approver-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "STAFF", salesRoleId: approverRole.id, active: true },
    });
    approverUserId = approverUser.id;

    authAs(founderUserId);
    await createFiscalYearWithPeriods({ code: `${suffix}-FY`, startDate: testYearStart, endDate: testYearEnd, periodCount: 12 });

    const cash = await createAccount({ accountCode: `${suffix}-1000`, name: "Cash", category: "ASSET", normalBalance: "DEBIT" });
    const activatedCash = await activateAccount(cash.id, cash.version);
    cashAccountId = activatedCash.id;
    cashAccountVersion = activatedCash.version;

    const revenue = await createAccount({ accountCode: `${suffix}-4000`, name: "Revenue", category: "REVENUE", normalBalance: "CREDIT" });
    const activatedRevenue = await activateAccount(revenue.id, revenue.version);
    revenueAccountId = activatedRevenue.id;
  });

  afterAll(async () => {
    // Hardcoded to `false` (the documented default) rather than restoring
    // a captured "original" — see the identical note in
    // wave1-foundation.integration.test.ts's afterAll for why a
    // snapshot-and-restore approach is fragile here.
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED", "ENTERPRISE_FINANCIAL_REPORTING_ENABLED"]) {
      await setFlag(key, false);
    }
    // Posted journals/lines/ledger entries are permanently immutable by
    // design (that is the behavior this suite tests), and every account
    // this suite created is referenced by at least one journal line under
    // an ON DELETE RESTRICT foreign key — so none of this test run's
    // finance rows (accounts, fiscal years/periods, journals, lines,
    // ledger entries) can be, or should be, deleted here. Only the
    // feature-flag state and the throwaway auth-test user are restored.
    if (createdRestrictedUser) await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
  });

  async function draftBalancedJournal(overrides?: Partial<{ postingDate: Date; journalType: string }>) {
    const journal = await createJournalDraft({
      journalType: overrides?.journalType ?? "GENERAL",
      postingDate: overrides?.postingDate ?? midYearDate,
      documentDate: overrides?.postingDate ?? midYearDate,
      currency: "INR",
      description: "Test journal",
    });
    const debitLine = await addJournalLine(journal.id, journal.version, { accountId: cashAccountId, debitAmount: 1000, creditAmount: 0 });
    await addJournalLine(journal.id, journal.version + 1, { accountId: revenueAccountId, debitAmount: 0, creditAmount: 1000 });
    return journal.id;
  }

  describe("feature flags and permissions", () => {
    it("rejects journal creation while ENTERPRISE_FINANCE_ENABLED is disabled", async () => {
      await setFlag("ENTERPRISE_FINANCE_ENABLED", false);
      authAs(founderUserId);
      await expect(createJournalDraft({ journalType: "GENERAL", postingDate: new Date(), documentDate: new Date() })).rejects.toBeInstanceOf(ForbiddenError);
      await setFlag("ENTERPRISE_FINANCE_ENABLED", true);
    });

    it("denies a principal without finance.journals.prepare", async () => {
      authAs(restrictedUserId);
      await expect(createJournalDraft({ journalType: "GENERAL", postingDate: new Date(), documentDate: new Date() })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("rejects posting while ENTERPRISE_FINANCIAL_POSTING_ENABLED is disabled", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      await submitJournal(journalId, draft.version);
      const submitted = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      await approveAsSecondActor(journalId, submitted.version);

      await setFlag("ENTERPRISE_FINANCIAL_POSTING_ENABLED", false);
      const approved = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      await expect(postJournal(journalId, approved.version, `${suffix}-flagoff`)).rejects.toBeInstanceOf(ForbiddenError);
      await setFlag("ENTERPRISE_FINANCIAL_POSTING_ENABLED", true);
    });
  });

  describe("journal line validation", () => {
    it("rejects a journal with fewer than two lines at submission", async () => {
      authAs(founderUserId);
      const journal = await createJournalDraft({ journalType: "GENERAL", postingDate: midYearDate, documentDate: midYearDate });
      await addJournalLine(journal.id, journal.version, { accountId: cashAccountId, debitAmount: 500, creditAmount: 0 });
      await expect(submitJournal(journal.id, journal.version + 1)).rejects.toThrow();
    });

    it("rejects an unbalanced journal at submission", async () => {
      authAs(founderUserId);
      const journal = await createJournalDraft({ journalType: "GENERAL", postingDate: midYearDate, documentDate: midYearDate });
      await addJournalLine(journal.id, journal.version, { accountId: cashAccountId, debitAmount: 1000, creditAmount: 0 });
      await addJournalLine(journal.id, journal.version + 1, { accountId: revenueAccountId, debitAmount: 0, creditAmount: 900 });
      await expect(submitJournal(journal.id, journal.version + 2)).rejects.toThrow();
    });

    it("rejects a zero-value line at the database level", async () => {
      authAs(founderUserId);
      const journal = await createJournalDraft({ journalType: "GENERAL", postingDate: midYearDate, documentDate: midYearDate });
      await expect(addJournalLine(journal.id, journal.version, { accountId: cashAccountId, debitAmount: 0, creditAmount: 0 })).rejects.toThrow();
    });

    it("rejects a both-sides-positive line at the database level", async () => {
      authAs(founderUserId);
      const journal = await createJournalDraft({ journalType: "GENERAL", postingDate: midYearDate, documentDate: midYearDate });
      await expect(addJournalLine(journal.id, journal.version, { accountId: cashAccountId, debitAmount: 100, creditAmount: 50 })).rejects.toThrow();
    });

    it("rejects an inactive-account line at submission", async () => {
      authAs(founderUserId);
      const draftAccount = await createAccount({ accountCode: `${suffix}-9100`, name: "Draft Account", category: "EXPENSE", normalBalance: "DEBIT" });
      const journal = await createJournalDraft({ journalType: "GENERAL", postingDate: midYearDate, documentDate: midYearDate });
      await addJournalLine(journal.id, journal.version, { accountId: draftAccount.id, debitAmount: 100, creditAmount: 0 });
      await addJournalLine(journal.id, journal.version + 1, { accountId: cashAccountId, debitAmount: 0, creditAmount: 100 });
      await expect(submitJournal(journal.id, journal.version + 2)).rejects.toThrow();
    });

    it("rejects a summary-account line at submission", async () => {
      authAs(founderUserId);
      const parent = await createAccount({ accountCode: `${suffix}-5000`, name: "Expenses", category: "EXPENSE", normalBalance: "DEBIT" });
      await activateAccount(parent.id, parent.version);
      const child = await createAccount({ accountCode: `${suffix}-5100`, name: "Office Expenses", category: "EXPENSE", normalBalance: "DEBIT", parentId: parent.id });
      await activateAccount(child.id, child.version);

      const journal = await createJournalDraft({ journalType: "GENERAL", postingDate: midYearDate, documentDate: midYearDate });
      await addJournalLine(journal.id, journal.version, { accountId: parent.id, debitAmount: 100, creditAmount: 0 });
      await addJournalLine(journal.id, journal.version + 1, { accountId: cashAccountId, debitAmount: 0, creditAmount: 100 });
      await expect(submitJournal(journal.id, journal.version + 2)).rejects.toThrow();
    });

    it("rejects posting into a hard-closed period", async () => {
      authAs(founderUserId);
      const fy = await createFiscalYearWithPeriods({ code: `${suffix}-FYCLOSED`, startDate: closedFyStart, endDate: closedFyEnd, periodCount: 12 });
      const firstPeriod = fy.periods[0]!;
      const { hardClosePeriod } = await import("@/lib/enterprise-finance/period-service");
      await hardClosePeriod(firstPeriod.id, firstPeriod.version);

      const journal = await createJournalDraft({ journalType: "GENERAL", postingDate: closedFyPostingDate, documentDate: closedFyPostingDate });
      await addJournalLine(journal.id, journal.version, { accountId: cashAccountId, debitAmount: 100, creditAmount: 0 });
      await addJournalLine(journal.id, journal.version + 1, { accountId: revenueAccountId, debitAmount: 0, creditAmount: 100 });
      await expect(submitJournal(journal.id, journal.version + 2)).rejects.toThrow();
    });
  });

  describe("lifecycle, SoD, and posting", () => {
    it("takes a journal through the full lifecycle to POSTED, creating exact ledger entries", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const validation = await validateJournal(journalId);
      expect(validation.valid).toBe(true);

      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      expect(submitted.status).toBe("SUBMITTED");
      const approved = await approveAsSecondActor(journalId, submitted.version);
      expect(approved.status).toBe("APPROVED");

      const posted = await postJournal(journalId, approved.version, `${suffix}-post-lifecycle`);
      expect(posted.status).toBe("POSTED");
      expect(posted.totalDebit.toString()).toBe("1000");
      expect(posted.totalCredit.toString()).toBe("1000");

      const journalLedger = await getJournalLedger(journalId);
      expect(journalLedger.items).toHaveLength(2);
      expect(journalLedger.total).toBe(2);
      const cashEntry = journalLedger.items.find((e) => e.accountId === cashAccountId)!;
      const revenueEntry = journalLedger.items.find((e) => e.accountId === revenueAccountId)!;
      expect(cashEntry.debitAmount.toString()).toBe("1000");
      expect(cashEntry.creditAmount.toString()).toBe("0");
      expect(revenueEntry.creditAmount.toString()).toBe("1000");
    });

    it("requires a non-empty reason to reject a journal", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      await submitJournal(journalId, draft.version);
      const submitted = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      await expect(rejectJournal(journalId, submitted.version, "")).rejects.toThrow();
    });

    it("rejects approval by the same actor who submitted the journal, with no override configured", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      // Founder both created/submitted and is now attempting to approve —
      // the JOURNAL_APPROVAL SoD policy prohibits this outright (no
      // overridePermission is configured), Founder included.
      await expect(approveJournal(journalId, submitted.version)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("allows approval by a genuinely different actor", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      expect(approved.status).toBe("APPROVED");
    });

    it("rejects posting by the same actor who approved the journal, with no override configured", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      authAs(approverUserId);
      const approved = await approveJournal(journalId, submitted.version);
      // The same approverUserId now attempts to post — JOURNAL_POSTING
      // SoD prohibits this outright.
      await expect(postJournal(journalId, approved.version, `${suffix}-sameactor-post`)).rejects.toBeInstanceOf(ForbiddenError);
      authAs(founderUserId);
    });

    it("rejects direct mutation and deletion of a posted journal, and of its lines, at the database level", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      const posted = await postJournal(journalId, approved.version, `${suffix}-post-immutable`);

      await expect(prisma.financeJournal.update({ where: { id: posted.id }, data: { description: "tampered" } })).rejects.toThrow();
      await expect(prisma.financeJournal.delete({ where: { id: posted.id } })).rejects.toThrow();

      const line = await prisma.financeJournalLine.findFirstOrThrow({ where: { journalId: posted.id } });
      await expect(prisma.financeJournalLine.update({ where: { id: line.id }, data: { description: "tampered" } })).rejects.toThrow();
      await expect(prisma.financeJournalLine.delete({ where: { id: line.id } })).rejects.toThrow();

      const entry = await prisma.financeLedgerEntry.findFirstOrThrow({ where: { journalId: posted.id } });
      await expect(prisma.financeLedgerEntry.update({ where: { id: entry.id }, data: { description: "tampered" } as any })).rejects.toThrow();
      await expect(prisma.financeLedgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
    });

    it("replays an idempotent posting exactly, without duplicating ledger entries", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);

      const key = `${suffix}-idempotent-${journalId}`;
      const first = await postJournal(journalId, approved.version, key);
      const replay = await postJournal(journalId, approved.version, key);
      expect(replay.id).toBe(first.id);

      const entries = await prisma.financeLedgerEntry.count({ where: { journalId } });
      expect(entries).toBe(2);
    });

    it("handles concurrent posting attempts without duplicating ledger entries", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);

      const key = `${suffix}-concurrent-${journalId}`;
      const results = await Promise.allSettled([
        postJournal(journalId, approved.version, key),
        postJournal(journalId, approved.version, key),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      const entries = await prisma.financeLedgerEntry.count({ where: { journalId } });
      expect(entries).toBe(2);
    });

    it("reverses a posted journal with opposite entries and links both journals", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      const posted = await postJournal(journalId, approved.version, `${suffix}-post-for-reversal`);

      // JOURNAL_REVERSAL SoD: the actor who posted the original journal
      // (founderUserId here) cannot also reverse it — a different actor
      // (approverUserId) performs the reversal, mirroring the
      // approve/post two-actor pattern used throughout this file.
      authAs(approverUserId);
      const reversal = await reversePostedJournal(posted.id, `${suffix}-reverse-${journalId}`, { reason: "Test reversal", postingDate: midYearDate });
      authAs(founderUserId);
      expect(reversal.status).toBe("POSTED");
      expect(reversal.reversalOfJournalId).toBe(posted.id);

      const original = await prisma.financeJournal.findUniqueOrThrow({ where: { id: posted.id } });
      expect(original.reversedByJournalId).toBe(reversal.id);

      const reversalEntries = (await getJournalLedger(reversal.id)).items;
      const originalEntries = (await getJournalLedger(posted.id)).items;
      const originalCash = originalEntries.find((e) => e.accountId === cashAccountId)!;
      const reversedCash = reversalEntries.find((e) => e.accountId === cashAccountId)!;
      expect(reversedCash.creditAmount.toString()).toBe(originalCash.debitAmount.toString());

      // Idempotent replay of the reversal itself, same (approver) actor.
      authAs(approverUserId);
      const replay = await reversePostedJournal(posted.id, `${suffix}-reverse-${journalId}`, { reason: "Test reversal", postingDate: midYearDate }).catch((e) => e);
      authAs(founderUserId);
      // Either a clean replay (same reversal id) or a safe conflict — both
      // are acceptable outcomes since the operation key was already
      // consumed and the journal is already reversed.
      if (replay instanceof Error) {
        expect(replay).toBeInstanceOf(ConflictError);
      } else {
        expect(replay.id).toBe(reversal.id);
      }

      // The original posted journal's core content remains immutable
      // through the reversal — only the single permitted back-reference
      // (reversedByJournalId) changed.
      expect(original.description).toBe(posted.description);
      expect(original.totalDebit.toString()).toBe(posted.totalDebit.toString());
    });

    it("rejects reversal by the same actor who posted the original journal — Founder included, no implicit bypass", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      const posted = await postJournal(journalId, approved.version, `${suffix}-post-for-sameactor-reversal`);

      // founderUserId both posted this journal and is now attempting to
      // reverse it — rejected outright, since JOURNAL_REVERSAL has no
      // overridePermission configured (matching every other Part 3C SoD
      // policy), which per enforceSegregationOfDuties' own semantics means
      // no actor, Founder included, can override it.
      await expect(reversePostedJournal(posted.id, `${suffix}-sameactor-reverse-${journalId}`, { reason: "Should be rejected" })).rejects.toBeInstanceOf(ForbiddenError);

      const stillPosted = await prisma.financeJournal.findUniqueOrThrow({ where: { id: posted.id } });
      expect(stillPosted.status).toBe("POSTED");
      expect(stillPosted.reversedByJournalId).toBeNull();
    });

    it("rejects reversal with a missing or blank reason", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      const posted = await postJournal(journalId, approved.version, `${suffix}-post-for-blank-reason`);

      authAs(approverUserId);
      await expect(reversePostedJournal(posted.id, `${suffix}-blank-reason-1`, { reason: "" })).rejects.toThrow();
      await expect(reversePostedJournal(posted.id, `${suffix}-blank-reason-2`, { reason: "   " })).rejects.toThrow();
      authAs(founderUserId);

      const stillPosted = await prisma.financeJournal.findUniqueOrThrow({ where: { id: posted.id } });
      expect(stillPosted.reversedByJournalId).toBeNull();
    });

    it("creates a correction successor draft linked to the original posted journal", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal();
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      const posted = await postJournal(journalId, approved.version, `${suffix}-post-for-correction`);

      const successor = await createCorrectionSuccessor(posted.id, { reason: "Test correction" });
      expect(successor.status).toBe("DRAFT");
      expect(successor.correctionOfJournalId).toBe(posted.id);
      expect(successor.lines).toHaveLength(2);

      const original = await prisma.financeJournal.findUniqueOrThrow({ where: { id: posted.id } });
      expect(original.successorJournalId).toBe(successor.id);
    });
  });

  describe("general ledger and trial balance", () => {
    it("returns account ledger entries and a balanced trial balance", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal({ postingDate: laterMidYearDate });
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      const posted = await postJournal(journalId, approved.version, `${suffix}-post-for-tb`);

      const ledger = await getAccountLedger(cashAccountId);
      expect(ledger.total).toBeGreaterThanOrEqual(1);

      const trialBalance = await getTrialBalance(posted.fiscalPeriodId!);
      expect(trialBalance.balanced).toBe(true);
      const cashRow = trialBalance.rows.find((row) => row.accountId === cashAccountId);
      expect(cashRow).toBeDefined();
    });

    it("rejects ledger/report access without ENTERPRISE_FINANCIAL_REPORTING_ENABLED", async () => {
      await setFlag("ENTERPRISE_FINANCIAL_REPORTING_ENABLED", false);
      authAs(founderUserId);
      await expect(getAccountLedger(cashAccountId)).rejects.toBeInstanceOf(ForbiddenError);
      await setFlag("ENTERPRISE_FINANCIAL_REPORTING_ENABLED", true);
    });
  });

  describe("period activity summary and ledger-inquiry bounding (audit repair)", () => {
    it("aggregates more than 5000 ledger rows via real database groupBy with exact totals, multiple journal types, and no truncation", async () => {
      authAs(founderUserId);
      // A dedicated, otherwise-untouched fiscal year — reusing the shared
      // testYear (as other tests in this file do via midYearDate/
      // laterMidYearDate) would make the exact row-count assertions below
      // depend on which other tests happened to post into the same period
      // first.
      const bigFyStart = new Date(Date.UTC(baseYear + 6, 3, 1));
      const bigFyEnd = new Date(Date.UTC(baseYear + 7, 2, 31));
      const bigPostingDate = new Date(Date.UTC(baseYear + 6, 4, 15));
      await createFiscalYearWithPeriods({ code: `${suffix}-FYBIG`, startDate: bigFyStart, endDate: bigFyEnd, periodCount: 12 });

      const journalId = await draftBalancedJournal({ postingDate: bigPostingDate });
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      const posted = await postJournal(journalId, approved.version, `${suffix}-post-for-activity-summary`);
      const fiscalPeriodId = posted.fiscalPeriodId!;
      const fiscalYearId = posted.fiscalYearId!;

      // Bulk-inserted directly (not through the Business Service, which
      // would take far too long one row at a time for a 5000+-row proof)
      // — all referencing the real, already-posted journal/line/account
      // to satisfy foreign keys. finance_ledger_entries only blocks
      // UPDATE/DELETE (append-only), never INSERT, so a bulk createMany
      // is not blocked by the immutability trigger.
      const cashLine = await prisma.financeJournalLine.findFirstOrThrow({ where: { journalId, accountId: cashAccountId } });
      const extraCount = 5010;
      const half = extraCount / 2;
      const syntheticGeneral = Array.from({ length: extraCount }, (_, i) => ({
        organizationKey: "MUV", journalId, journalLineId: cashLine.id, accountId: cashAccountId,
        fiscalYearId, fiscalPeriodId, postingDate: bigPostingDate,
        debitAmount: i < half ? 1 : 0, creditAmount: i < half ? 0 : 1, currency: "INR",
        journalType: "GENERAL",
      }));
      await prisma.financeLedgerEntry.createMany({ data: syntheticGeneral });
      // A second, distinct journal type in the same period, proving rows
      // are grouped correctly rather than collapsed into one bucket. Kept
      // genuinely balanced (debit side against cash, offsetting credit
      // side against revenue) — this data is permanent and immutable like
      // every other ledger entry, so leaving it unbalanced would corrupt
      // getTrialBalance's global integrity check forever (a real mistake
      // an earlier draft of this exact test made and had to be repaired).
      const revenueLine = await prisma.financeJournalLine.findFirstOrThrow({ where: { journalId, accountId: revenueAccountId } });
      await prisma.financeLedgerEntry.createMany({
        data: [
          { organizationKey: "MUV", journalId, journalLineId: cashLine.id, accountId: cashAccountId, fiscalYearId, fiscalPeriodId, postingDate: bigPostingDate, debitAmount: 200, creditAmount: 0, currency: "INR", journalType: "AR_INVOICE" },
          { organizationKey: "MUV", journalId, journalLineId: cashLine.id, accountId: cashAccountId, fiscalYearId, fiscalPeriodId, postingDate: bigPostingDate, debitAmount: 300, creditAmount: 0, currency: "INR", journalType: "AR_INVOICE" },
          { organizationKey: "MUV", journalId, journalLineId: revenueLine.id, accountId: revenueAccountId, fiscalYearId, fiscalPeriodId, postingDate: bigPostingDate, debitAmount: 0, creditAmount: 200, currency: "INR", journalType: "AR_INVOICE" },
          { organizationKey: "MUV", journalId, journalLineId: revenueLine.id, accountId: revenueAccountId, fiscalYearId, fiscalPeriodId, postingDate: bigPostingDate, debitAmount: 0, creditAmount: 300, currency: "INR", journalType: "AR_INVOICE" },
        ],
      });

      const rawCount = await prisma.financeLedgerEntry.count({ where: { organizationKey: "MUV", fiscalPeriodId } });
      expect(rawCount).toBeGreaterThan(5000);

      const summary = await getPeriodActivitySummary(fiscalPeriodId);
      const generalRow = summary.byJournalType.find((row) => row.journalType === "GENERAL")!;
      expect(generalRow).toBeDefined();
      expect(generalRow.count).toBe(2 + extraCount); // the real journal's own 2 lines + synthetic
      expect(generalRow.debit.toString()).toBe(new Prisma.Decimal(1000).plus(half).toString());
      expect(generalRow.credit.toString()).toBe(new Prisma.Decimal(1000).plus(half).toString());

      const arInvoiceRow = summary.byJournalType.find((row) => row.journalType === "AR_INVOICE")!;
      expect(arInvoiceRow).toBeDefined();
      expect(arInvoiceRow.count).toBe(4);
      expect(arInvoiceRow.debit.toString()).toBe("500");
      expect(arInvoiceRow.credit.toString()).toBe("500");

      // Every row across both groups accounts for every ledger row in the
      // period — nothing was silently dropped.
      const totalCounted = summary.byJournalType.reduce((sum, row) => sum + row.count, 0);
      expect(totalCounted).toBe(rawCount);

      // getJournalLedger pagination against this same large dataset.
      const capped = await getJournalLedger(journalId, { pageSize: 100000 });
      expect(capped.items).toHaveLength(200); // MAX_PAGE_SIZE, not the requested 100000
      expect(capped.total).toBe(rawCount);
      expect(capped.pageSize).toBe(200);

      const page1 = await getJournalLedger(journalId, { page: 1, pageSize: 50 });
      const page2 = await getJournalLedger(journalId, { page: 2, pageSize: 50 });
      expect(page1.items).toHaveLength(50);
      expect(page2.items).toHaveLength(50);
      const page1Ids = new Set(page1.items.map((e) => e.id));
      expect(page2.items.every((e) => !page1Ids.has(e.id))).toBe(true); // no overlap
      const allIdsAscending = [...page1.items, ...page2.items].every((entry, index, arr) => index === 0 || arr[index - 1]!.id <= entry.id);
      expect(allIdsAscending).toBe(true); // deterministic ordering across pages

      // Invalid page input degrades safely rather than crashing or
      // returning an unbounded result.
      const invalidPage = await getJournalLedger(journalId, { page: -5, pageSize: -10 });
      expect(invalidPage.page).toBe(1);
      expect(invalidPage.pageSize).toBeGreaterThan(0);
      expect(invalidPage.items.length).toBeGreaterThan(0);

      // getSourceLedger is bounded the same way, and returns an empty
      // result (not an error) for a source that has no ledger activity.
      const emptySource = await getSourceLedger("NO_SUCH_SOURCE_TYPE", "no-such-id");
      expect(emptySource.items).toHaveLength(0);
      expect(emptySource.total).toBe(0);
    });

    it("returns a valid empty summary for a fiscal period with no posted activity", async () => {
      authAs(founderUserId);
      const emptyFyStart = new Date(Date.UTC(baseYear + 4, 3, 1));
      const emptyFyEnd = new Date(Date.UTC(baseYear + 5, 2, 31));
      const emptyFy = await createFiscalYearWithPeriods({ code: `${suffix}-FYEMPTY`, startDate: emptyFyStart, endDate: emptyFyEnd, periodCount: 12 });
      const emptyPeriod = await prisma.financeFiscalPeriod.findFirstOrThrow({ where: { fiscalYearId: emptyFy.id } });

      const summary = await getPeriodActivitySummary(emptyPeriod.id);
      expect(summary.byJournalType).toEqual([]);
      expect(summary.journalCount).toBe(0);
    });

    it("rejects period activity summary access without ENTERPRISE_FINANCIAL_REPORTING_ENABLED", async () => {
      authAs(founderUserId);
      const journalId = await draftBalancedJournal({ postingDate: laterMidYearDate });
      const draft = await prisma.financeJournal.findUniqueOrThrow({ where: { id: journalId } });
      const submitted = await submitJournal(journalId, draft.version);
      const approved = await approveAsSecondActor(journalId, submitted.version);
      const posted = await postJournal(journalId, approved.version, `${suffix}-post-for-summary-flag`);

      await setFlag("ENTERPRISE_FINANCIAL_REPORTING_ENABLED", false);
      await expect(getPeriodActivitySummary(posted.fiscalPeriodId!)).rejects.toBeInstanceOf(ForbiddenError);
      await setFlag("ENTERPRISE_FINANCIAL_REPORTING_ENABLED", true);
    });
  });
});
