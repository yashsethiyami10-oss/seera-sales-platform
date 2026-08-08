import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ConflictError, ForbiddenError } from "@/lib/errors";
import { requireOrganization, requireVersion, type EnterprisePrincipal } from "@/lib/enterprise/context";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { activateFinanceConfiguration, getFinanceConfiguration, saveFinanceConfigurationDraft } from "@/lib/enterprise-finance/configuration-service";
import { createFiscalYearWithPeriods, hardClosePeriod, reopenPeriod, softClosePeriod } from "@/lib/enterprise-finance/period-service";
import { createCostCenter, reparentCostCenter } from "@/lib/enterprise-finance/dimension-service";
import { activateAccount, assignAccountParent, createAccount, validateAccountForPosting } from "@/lib/enterprise-finance/chart-of-accounts-service";

const suffix = `w1${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function authAs(userId: string) {
  mockAuth.mockResolvedValue({ user: { id: userId } } as never);
}

let founderUserId: string;
let restrictedUserId: string;
let createdRestrictedUser = false;

async function setFlag(key: string, enabled: boolean) {
  await prisma.aiConfiguration.upsert({
    where: { organizationKey_key: { organizationKey: "MUV", key } },
    update: { value: { enabled } },
    create: { organizationKey: "MUV", key, category: "FEATURE_FLAG", value: { enabled } },
  });
}

describe("Part 3C Wave 1 — Enterprise Finance Platform foundation", () => {
  beforeAll(async () => {
    const founder = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
    if (!founder) throw new Error("A seeded, active Founder user is required for this test");
    founderUserId = founder.id;

    const support = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Customer Support", active: true } } });
    if (support) {
      restrictedUserId = support.id;
    } else {
      const supportRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Customer Support" } });
      const created = await prisma.user.create({
        data: {
          name: "Wave1 Restricted Test User",
          email: `wave1-restricted-${suffix}@example.test`,
          passwordHash: "not-a-real-hash",
          role: "CUSTOMER",
          salesRoleId: supportRole.id,
          active: true,
        },
      });
      restrictedUserId = created.id;
      createdRestrictedUser = true;
    }

    await setFlag("ENTERPRISE_OPERATIONS_ENABLED", true);
  });

  afterAll(async () => {
    // Hardcoded to `false` — the actual documented default (Section 5/7:
    // "must remain disabled by default") — rather than restoring whatever
    // was observed at beforeAll. A "restore captured original" approach is
    // fragile against exactly the failure mode found during Stage A
    // development: an earlier interrupted test run left these flags
    // enabled without ever reaching its own afterAll, so a later run's
    // "original" snapshot was already polluted `true` and every
    // subsequent run kept re-preserving that pollution instead of
    // correcting it.
    await setFlag("ENTERPRISE_OPERATIONS_ENABLED", false);
    await setFlag("ENTERPRISE_FINANCE_ENABLED", false);

    await prisma.financeAccount.deleteMany({ where: { organizationKey: "MUV", accountCode: { startsWith: suffix } } });
    await prisma.financeCostCenter.deleteMany({ where: { organizationKey: "MUV", code: { startsWith: suffix } } });
    await prisma.financeFiscalPeriod.deleteMany({ where: { organizationKey: "MUV", name: { startsWith: suffix } } });
    await prisma.financeFiscalYear.deleteMany({ where: { organizationKey: "MUV", code: { startsWith: suffix } } });
    await prisma.financeConfiguration.deleteMany({ where: { organizationKey: "MUV", createdById: founderUserId, baseCurrency: "TST" } });

    if (createdRestrictedUser) {
      await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
    }
  });

  describe("feature flag enforcement", () => {
    it("rejects a call while ENTERPRISE_FINANCE_ENABLED is disabled", async () => {
      await setFlag("ENTERPRISE_FINANCE_ENABLED", false);
      authAs(founderUserId);
      await expect(getFinanceConfiguration()).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("succeeds once ENTERPRISE_FINANCE_ENABLED is enabled", async () => {
      await setFlag("ENTERPRISE_FINANCE_ENABLED", true);
      authAs(founderUserId);
      await expect(getFinanceConfiguration()).resolves.not.toThrow();
    });
  });

  describe("permission enforcement", () => {
    it("denies a principal without any finance.* permission", async () => {
      authAs(restrictedUserId);
      await expect(createCostCenter({ code: `${suffix}-cc-denied`, name: "Denied" })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("allows the Founder principal (Founder bypasses the permission check, per lib/enterprise/context.ts)", async () => {
      authAs(founderUserId);
      const cc = await createCostCenter({ code: `${suffix}-cc-allowed`, name: "Allowed" });
      expect(cc.code).toBe(`${suffix}-cc-allowed`);
    });
  });

  describe("organization isolation (structural — see lib/enterprise/context.ts)", () => {
    it("requireOrganization rejects any key other than the trusted MUV organization", () => {
      const principal: EnterprisePrincipal = { id: founderUserId, email: null, roleName: "Founder", isFounder: true, permissions: new Set(), organizationKey: "MUV" };
      expect(() => requireOrganization(principal, "SOME_OTHER_ORG")).toThrow(ForbiddenError);
      expect(() => requireOrganization(principal, "MUV")).not.toThrow();
    });
  });

  describe("optimistic concurrency", () => {
    it("rejects a stale version on finance configuration update", () => {
      expect(() => requireVersion(2, 1)).toThrow();
      expect(() => requireVersion(2, 2)).not.toThrow();
    });

    it("rejects a stale version when reparenting a cost center", async () => {
      authAs(founderUserId);
      const parent = await createCostCenter({ code: `${suffix}-cc-parent`, name: "Parent" });
      const child = await createCostCenter({ code: `${suffix}-cc-child`, name: "Child" });
      await expect(reparentCostCenter(child.id, child.version + 99, parent.id)).rejects.toThrow();
    });
  });

  describe("finance configuration lifecycle", () => {
    it("creates a draft, then rejects activation with a stale version, then activates with the correct version", async () => {
      authAs(founderUserId);
      await prisma.financeConfiguration.deleteMany({ where: { organizationKey: "MUV" } });

      const draft = await saveFinanceConfigurationDraft({ baseCurrency: "TST" });
      expect(draft.status).toBe("DRAFT");

      await expect(activateFinanceConfiguration(draft.version + 5)).rejects.toThrow();

      const activated = await activateFinanceConfiguration(draft.version);
      expect(activated.status).toBe("ACTIVE");
    });
  });

  describe("chart of accounts", () => {
    it("rejects a hierarchy cycle", async () => {
      authAs(founderUserId);
      const root = await createAccount({ accountCode: `${suffix}-1000`, name: "Assets", category: "ASSET", normalBalance: "DEBIT" });
      const child = await createAccount({ accountCode: `${suffix}-1100`, name: "Current Assets", category: "ASSET", normalBalance: "DEBIT", parentId: root.id });
      await expect(assignAccountParent(root.id, root.version, child.id)).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects a cross-organization-shaped parent reference (invalid id)", async () => {
      authAs(founderUserId);
      await expect(createAccount({ accountCode: `${suffix}-9999`, name: "Invalid Parent", category: "ASSET", normalBalance: "DEBIT", parentId: "clsomefakeidxxxxxxxxxxxxxx" }))
        .rejects.toThrow();
    });

    it("rejects direct posting to a summary (parent) account, and allows a leaf account once active", async () => {
      authAs(founderUserId);
      const parent = await createAccount({ accountCode: `${suffix}-2000`, name: "Liabilities", category: "LIABILITY", normalBalance: "CREDIT" });
      const leaf = await createAccount({ accountCode: `${suffix}-2100`, name: "Accounts Payable", category: "LIABILITY", normalBalance: "CREDIT", parentId: parent.id });
      await activateAccount(parent.id, parent.version);
      const activatedLeaf = await activateAccount(leaf.id, leaf.version);

      await expect(validateAccountForPosting(parent.id)).rejects.toThrow("Summary accounts cannot receive direct postings");
      await expect(validateAccountForPosting(activatedLeaf.id)).resolves.toMatchObject({ id: activatedLeaf.id });
    });

    it("rejects a draft/inactive account for posting", async () => {
      authAs(founderUserId);
      const draftAccount = await createAccount({ accountCode: `${suffix}-3000`, name: "Draft Revenue", category: "REVENUE", normalBalance: "CREDIT" });
      await expect(validateAccountForPosting(draftAccount.id)).rejects.toThrow();
    });
  });

  describe("fiscal years and periods", () => {
    it("rejects an overlapping fiscal year", async () => {
      authAs(founderUserId);
      await createFiscalYearWithPeriods({ code: `${suffix}-FY1`, startDate: "2031-04-01", endDate: "2032-03-31", periodCount: 12 });
      await expect(createFiscalYearWithPeriods({ code: `${suffix}-FY1-OVERLAP`, startDate: "2031-06-01", endDate: "2032-06-01", periodCount: 12 }))
        .rejects.toBeInstanceOf(ConflictError);
    });

    it("generates twelve non-overlapping periods spanning the fiscal year", async () => {
      authAs(founderUserId);
      const fy = await createFiscalYearWithPeriods({ code: `${suffix}-FY2`, startDate: "2033-04-01", endDate: "2034-03-31", periodCount: 12 });
      expect(fy.periods).toHaveLength(12);
      expect(fy.periods[0]!.startDate.toISOString()).toBe(new Date("2033-04-01").toISOString());
      expect(fy.periods[11]!.endDate.toISOString()).toBe(new Date("2034-03-31").toISOString());
      for (let i = 0; i < fy.periods.length - 1; i += 1) {
        expect(fy.periods[i]!.endDate.getTime()).toBe(fy.periods[i + 1]!.startDate.getTime());
      }
    });

    it("rejects an invalid lifecycle transition (soft-closed period cannot jump straight back to hard-closed-then-open)", async () => {
      authAs(founderUserId);
      const fy = await createFiscalYearWithPeriods({ code: `${suffix}-FY3`, startDate: "2035-04-01", endDate: "2036-03-31", periodCount: 12 });
      const period = fy.periods[0]!;
      const softClosed = await softClosePeriod(period.id, period.version);
      expect(softClosed.status).toBe("SOFT_CLOSED");
      // OPEN -> SOFT_CLOSED already used; SOFT_CLOSED cannot go directly to
      // itself again via softClosePeriod's own transition assertion.
      await expect(softClosePeriod(softClosed.id, softClosed.version)).rejects.toThrow();
    });

    it("rejects a period reopen where the same actor is both requester and approver, with no override configured", async () => {
      authAs(founderUserId);
      const fy = await createFiscalYearWithPeriods({ code: `${suffix}-FY4`, startDate: "2037-04-01", endDate: "2038-03-31", periodCount: 12 });
      const period = fy.periods[0]!;
      const hardClosed = await hardClosePeriod(period.id, period.version);
      expect(hardClosed.status).toBe("HARD_CLOSED");

      // The seeded FISCAL_PERIOD_REOPEN policy has prohibitSameActor=true
      // and no overridePermission configured — enforceSegregationOfDuties
      // (lib/enterprise-phase2/foundation.ts) requires overridePermission
      // to be set for *any* override, Founder included (Founder only
      // bypasses the permission-possession sub-check, not the
      // "is an override configured at all" gate). So the same actor
      // requesting and approving is correctly rejected outright, with no
      // Founder bypass. This was previously asserted the other way by
      // mistake — the original assertion passed only because `npm run
      // db:seed` had never actually been run against the live dev database
      // at the time, so this policy row didn't exist yet and the
      // early-return-on-missing-policy branch silently skipped enforcement
      // (a false-positive test, not a real pass). Corrected after Stage A
      // work ran the seed for real and this test started failing honestly.
      await expect(reopenPeriod(hardClosed.id, hardClosed.version, founderUserId, "Year-end adjustment required")).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("allows a period reopen where the requester and the approving actor are genuinely different", async () => {
      authAs(founderUserId);
      const fy = await createFiscalYearWithPeriods({ code: `${suffix}-FY4B`, startDate: "2038-04-01", endDate: "2039-03-31", periodCount: 12 });
      const period = fy.periods[0]!;
      const hardClosed = await hardClosePeriod(period.id, period.version);

      // A different real user is named as the requester while the
      // authenticated Founder approves — enforceSegregationOfDuties'
      // early-return fires as soon as preparerId !== principal.id, so no
      // override configuration is needed for this legitimate two-actor
      // path.
      const reopened = await reopenPeriod(hardClosed.id, hardClosed.version, restrictedUserId, "Year-end adjustment required, requested by a different team member");
      expect(reopened.status).toBe("ADJUSTMENT");
    });

    it("requires a reason to reopen a period", async () => {
      authAs(founderUserId);
      const fy = await createFiscalYearWithPeriods({ code: `${suffix}-FY5`, startDate: "2039-04-01", endDate: "2040-03-31", periodCount: 12 });
      const period = fy.periods[0]!;
      const hardClosed = await hardClosePeriod(period.id, period.version);
      await expect(reopenPeriod(hardClosed.id, hardClosed.version, founderUserId, "")).rejects.toThrow();
    });
  });
});
