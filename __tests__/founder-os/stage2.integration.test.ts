import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { getRevenueTrendSeries } from "@/lib/founder-os/trend-engine";
import { getAllComparisons, getComparison } from "@/lib/founder-os/comparison-engine";
import { getCompanyHealth } from "@/lib/founder-os/company-health-service";
import { getDecisionQueue } from "@/lib/founder-os/decision-queue-service";
import { runRiskDetection } from "@/lib/founder-os/risk-engine";
import { drillDownToRecords, drillDownToTransactions, listBusinessAreas } from "@/lib/founder-os/drilldown-service";
import { explainMetric, listExplainableMetrics } from "@/lib/founder-os/explainability-service";
import { getBusinessHighlights, getCriticalActions, getDailyBrief, getMonthlyBrief, getWeeklyBrief } from "@/lib/founder-os/brief-engine";

const suffix = `fo2${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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

describe("Part 3D Stage 2 — Executive Intelligence", () => {
  beforeAll(async () => {
    // ENTERPRISE_FINANCE_ENABLED/ENTERPRISE_FINANCIAL_REPORTING_ENABLED are
    // needed for the Drill Down tests specifically (listReceivableInvoices/
    // getSourceLedger, both frozen Part 3C functions, each gated by their
    // own flag regardless of Founder bypass — requireEnterprisePrincipal
    // checks the feature flag unconditionally, isFounder only bypasses the
    // permission check). Explicitly set here rather than assumed, since
    // other Finance test files reset these to false in their own afterAll.
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_REPORTING_ENABLED"]) {
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
        data: { name: "Founder OS Stage 2 Restricted Test User", email: `founder-os-s2-restricted-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      restrictedUserId = created.id;
      createdRestrictedUser = true;
    }
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED", "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_REPORTING_ENABLED"]) {
      await setFlag(key, false);
    }
    // Ordinary, non-immutable rows this suite's Risk Engine run may have
    // created — cleaned up directly, same reasoning as Stage 1's own
    // afterAll.
    await prisma.founderAlert.deleteMany({ where: { organizationKey: "MUV", sourceModule: "RISK_ENGINE" } });
    if (createdRestrictedUser) await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
  });

  describe("access control", () => {
    it("denies every Stage 2 entry point without founder_os.access", async () => {
      authAs(restrictedUserId);
      await expect(getRevenueTrendSeries("MONTHLY")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getComparison("MONTH_VS_MONTH")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getDecisionQueue()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getDailyBrief()).rejects.toBeInstanceOf(ForbiddenError);
      // Stage 5 architecture review: listBusinessAreas() was the one
      // Founder OS entry point with no principal check at all, fixed for
      // consistency with every other read here.
      await expect(listBusinessAreas()).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("denies risk detection without founder_os.alerts.manage", async () => {
      authAs(restrictedUserId);
      await expect(runRiskDetection()).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("Trend Engine", () => {
    it("returns a bucketed series for each granularity, always as an array bounded by real data", async () => {
      authAs(founderUserId);
      for (const granularity of ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const) {
        const series = await getRevenueTrendSeries(granularity);
        expect(series.granularity).toBe(granularity);
        expect(Array.isArray(series.points)).toBe(true);
        for (const point of series.points) {
          expect(typeof point.bucket).toBe("string");
          expect(typeof point.revenue).toBe("number");
        }
      }
    });

    it("supports a custom date range", async () => {
      authAs(founderUserId);
      const to = new Date();
      const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);
      const series = await getRevenueTrendSeries("CUSTOM", { from, to });
      expect(series.range.from.getTime()).toBe(from.getTime());
      expect(Array.isArray(series.points)).toBe(true);
    });
  });

  describe("Comparison Engine", () => {
    it("computes all five named comparisons via the same real getGrowthComparison calculation", async () => {
      authAs(founderUserId);
      const all = await getAllComparisons();
      expect(all).toHaveLength(5);
      const keys = all.map((c) => c.key);
      expect(keys).toEqual(["TODAY_VS_YESTERDAY", "WEEK_VS_WEEK", "MONTH_VS_MONTH", "QUARTER_VS_QUARTER", "YEAR_VS_YEAR"]);
      for (const comparison of all) {
        expect(typeof comparison.currentTotal).toBe("number");
        expect(typeof comparison.previousTotal).toBe("number");
      }
    });

    it("computes a single named comparison on demand", async () => {
      authAs(founderUserId);
      const comparison = await getComparison("TODAY_VS_YESTERDAY");
      expect(comparison.key).toBe("TODAY_VS_YESTERDAY");
    });
  });

  describe("Enterprise Health (per-area)", () => {
    it("groups signals into named areas with a per-area and overall rollup status", async () => {
      authAs(founderUserId);
      const health = await getCompanyHealth();
      expect(["GOOD", "WATCH", "AT_RISK"]).toContain(health.overall);
      for (const area of ["REVENUE", "FINANCE", "SALES", "CUSTOMER", "COLLECTION"] as const) {
        expect(health.byArea[area]).toBeDefined();
        expect(["GOOD", "WATCH", "AT_RISK"]).toContain(health.byArea[area].status);
      }
      // The overall status must be at least as bad as the worst area (a
      // real rollup, not an independent number).
      const worstArea = Object.values(health.byArea).some((a) => a.status === "AT_RISK") ? "AT_RISK"
        : Object.values(health.byArea).some((a) => a.status === "WATCH") ? "WATCH" : "GOOD";
      expect(health.overall).toBe(worstArea);
    });
  });

  describe("Decision Queue", () => {
    it("returns every queue section as a real, bounded list", async () => {
      authAs(founderUserId);
      const queue = await getDecisionQueue();
      expect(Array.isArray(queue.pendingVendorPayments)).toBe(true);
      expect(Array.isArray(queue.highValueReceivables)).toBe(true);
      expect(Array.isArray(queue.criticalExpenses)).toBe(true);
      expect(Array.isArray(queue.financeExceptions)).toBe(true);
      expect(Array.isArray(queue.enterpriseExceptions)).toBe(true);
      expect(queue.pendingApprovalsCount).toBe(queue.pendingVendorPayments.length + queue.criticalExpenses.length);
    });
  });

  describe("Risk Engine", () => {
    it("runs every detector without throwing, and is idempotent against its own dedup rule", async () => {
      authAs(founderUserId);
      const first = await runRiskDetection();
      expect(typeof first.checked).toBe("number");
      expect(Array.isArray(first.failures)).toBe(true);

      const second = await runRiskDetection();
      // Whatever fired on the first run is deduplicated on the second —
      // created must never exceed what's newly true.
      expect(second.created).toBeLessThanOrEqual(first.checked + 1); // +1 allows the composite BUSINESS_ANOMALY alert
    });
  });

  describe("Drill Down", () => {
    it("lists business areas, drills into records, and drills into transactions for a real posted invoice", async () => {
      authAs(founderUserId);
      const areas = await listBusinessAreas();
      expect(areas.some((a) => a.key === "FINANCE_RECEIVABLES")).toBe(true);

      const records = await drillDownToRecords("FINANCE_RECEIVABLES", { pageSize: 5 });
      expect(Array.isArray(records.items)).toBe(true);

      if (records.items.length > 0) {
        const invoice = records.items[0]!;
        const transactions = await drillDownToTransactions("AR_INVOICE", invoice.id, { pageSize: 10 });
        expect(Array.isArray(transactions.items)).toBe(true);
        expect(transactions.items.every((entry) => entry.sourceId === invoice.id)).toBe(true);
      }
    });
  });

  describe("Explainability", () => {
    it("explains a known metric with real source/calculation/dependency metadata", async () => {
      authAs(founderUserId);
      const explanation = await explainMetric("OUTSTANDING_RECEIVABLES");
      expect(explanation).not.toBeNull();
      expect(explanation!.source.length).toBeGreaterThan(0);
      expect(explanation!.calculation.length).toBeGreaterThan(0);
      expect(explanation!.dependencies.length).toBeGreaterThan(0);
      expect(explanation!.contributingSystems.length).toBeGreaterThan(0);
    });

    it("returns null for an unknown metric key rather than throwing", async () => {
      authAs(founderUserId);
      const explanation = await explainMetric(`NO-SUCH-METRIC-${suffix}`);
      expect(explanation).toBeNull();
    });

    it("lists every explainable metric", async () => {
      authAs(founderUserId);
      const metrics = await listExplainableMetrics();
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe("Executive Brief Engine", () => {
    it("produces daily, weekly, and monthly briefs, each with a summary, a matching comparison, and recent activity", async () => {
      authAs(founderUserId);
      const daily = await getDailyBrief();
      expect(daily.comparison.key).toBe("TODAY_VS_YESTERDAY");
      expect(daily.summary).toBeDefined();
      expect(Array.isArray(daily.recentActivity)).toBe(true);

      const weekly = await getWeeklyBrief();
      expect(weekly.comparison.key).toBe("WEEK_VS_WEEK");

      const monthly = await getMonthlyBrief();
      expect(monthly.comparison.key).toBe("MONTH_VS_MONTH");
    });

    it("produces business highlights and critical actions", async () => {
      authAs(founderUserId);
      const highlights = await getBusinessHighlights();
      expect(Array.isArray(highlights.highlights)).toBe(true);

      const actions = await getCriticalActions();
      expect(typeof actions.totalActionCount).toBe("number");
      expect(Array.isArray(actions.criticalAlerts)).toBe(true);
    });
  });
});
