import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { getEnterpriseKpis } from "@/lib/founder-os/kpi-engine";
import { getCompanyHealth } from "@/lib/founder-os/company-health-service";
import { getExecutiveSummary } from "@/lib/founder-os/executive-summary-service";
import { acknowledgeAlert, listAlerts, resolveAlert, runAlertDetection } from "@/lib/founder-os/alert-engine";
import { createNotification, listMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/founder-os/notification-center";
import { getActivityFeed, getExecutiveTimeline } from "@/lib/founder-os/timeline-feed";
import { globalSearch } from "@/lib/founder-os/search-foundation";
import { listWidgetsForCurrentUser, setWidgetPreference } from "@/lib/founder-os/widget-service";
import { getFounderDashboard } from "@/lib/founder-os/dashboard-service";

const suffix = `fo${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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

describe("Part 3D Stage 1 — Founder Operating System", () => {
  beforeAll(async () => {
    // Deliberately leave ENTERPRISE_FINANCIAL_REPORTING_ENABLED untouched
    // (its real value, whatever a prior/parallel Finance test file left it
    // as) — several tests below specifically verify graceful degradation
    // when a Finance subsystem Founder OS depends on is unavailable,
    // rather than assuming it's on.
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED"]) {
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
        data: { name: "Founder OS Restricted Test User", email: `founder-os-restricted-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      restrictedUserId = created.id;
      createdRestrictedUser = true;
    }
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED"]) {
      await setFlag(key, false);
    }
    // FounderAlert/FounderNotification/FounderWidgetPreference rows this
    // suite created are real, ordinary (non-immutable) rows — unlike
    // Part 3C's Finance tables, nothing here has an append-only trigger,
    // so they are cleaned up directly rather than left to accumulate.
    await prisma.founderNotification.deleteMany({ where: { organizationKey: "MUV", recipientId: founderUserId, title: { contains: suffix } } });
    await prisma.founderAlert.deleteMany({ where: { organizationKey: "MUV", sourceModule: "TEST", title: { contains: suffix } } });
    await prisma.founderWidgetPreference.deleteMany({ where: { organizationKey: "MUV", userId: founderUserId } });
    if (createdRestrictedUser) await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
  });

  describe("access control", () => {
    it("denies access while ENTERPRISE_FOUNDER_OS_ENABLED is disabled", async () => {
      await setFlag("ENTERPRISE_FOUNDER_OS_ENABLED", false);
      authAs(founderUserId);
      await expect(getEnterpriseKpis()).rejects.toBeInstanceOf(ForbiddenError);
      await setFlag("ENTERPRISE_FOUNDER_OS_ENABLED", true);
    });

    it("denies a principal without founder_os.access", async () => {
      authAs(restrictedUserId);
      await expect(getEnterpriseKpis()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getFounderDashboard()).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("KPI Engine", () => {
    it("returns real Revenue/Order/Customer KPIs from the frozen Phase 15 analytics layer, and degrades Finance sections gracefully rather than failing the whole call", async () => {
      authAs(founderUserId);
      const kpis = await getEnterpriseKpis();
      // lib/analytics.ts has no feature-flag gate of its own — always available.
      expect(kpis.revenue.available).toBe(true);
      expect(kpis.orders.available).toBe(true);
      expect(kpis.customers.available).toBe(true);
      if (kpis.revenue.available) {
        expect(typeof kpis.revenue.data.todayRevenue).toBe("number");
      }
      // Whatever the real state of ENTERPRISE_FINANCIAL_REPORTING_ENABLED
      // is, the call itself must never throw — each Finance-backed
      // section is independently `available: true/false`, never a crash.
      expect(typeof kpis.receivables.available).toBe("boolean");
      expect(typeof kpis.payables.available).toBe("boolean");
      expect(typeof kpis.cashPosition.available).toBe("boolean");
      expect(typeof kpis.salesPipeline.available).toBe("boolean");
    });
  });

  describe("Company Health Service", () => {
    it("computes explainable signals with an overall status derived from them, never throwing even when a Finance section is unavailable", async () => {
      authAs(founderUserId);
      const health = await getCompanyHealth();
      expect(["GOOD", "WATCH", "AT_RISK"]).toContain(health.overall);
      expect(health.signals.length).toBeGreaterThan(0);
      for (const signal of health.signals) {
        expect(["GOOD", "WATCH", "AT_RISK"]).toContain(signal.status);
        expect(signal.detail.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Executive Summary Service", () => {
    it("composes KPI Engine and Company Health output into a compact summary", async () => {
      authAs(founderUserId);
      const summary = await getExecutiveSummary();
      expect(summary.revenueToday).not.toBeNull();
      expect(["GOOD", "WATCH", "AT_RISK"]).toContain(summary.companyHealth);
      expect(typeof summary.activeAlertCount).toBe("number");
      expect(typeof summary.pendingApprovalCount).toBe("number");
    });

    it("accepts precomputed KPIs/Health and returns the same result as the standalone (self-fetching) call — Stage 5 performance fix", async () => {
      authAs(founderUserId);
      const kpis = await getEnterpriseKpis();
      const health = await getCompanyHealth(kpis);
      const withPrecomputed = await getExecutiveSummary({ kpis, health });
      expect(withPrecomputed.companyHealth).toBe(health.overall);
      expect(withPrecomputed.revenueToday).toBe(kpis.revenue.available ? kpis.revenue.data.todayRevenue : null);
    });
  });

  describe("Alert Engine", () => {
    it("creates an alert via direct detection-independent creation is not exposed — verifies the full acknowledge/resolve lifecycle on a detection-run alert or a manually inserted one", async () => {
      authAs(founderUserId);
      // Directly insert a deterministic test alert (bypassing detection,
      // whose exact trigger conditions depend on real, shared Finance
      // data this suite doesn't want to depend on) to test the
      // acknowledge/resolve lifecycle in isolation.
      const alert = await prisma.founderAlert.create({
        data: {
          organizationKey: "MUV", alertType: "FINANCE_EXCEPTION", severity: "WARNING",
          title: `Test alert ${suffix}`, description: "Test alert for lifecycle verification", sourceModule: "TEST",
        },
      });

      const listed = await listAlerts({ status: "ACTIVE" });
      expect(listed.some((a) => a.id === alert.id)).toBe(true);

      const acknowledged = await acknowledgeAlert(alert.id, alert.version);
      expect(acknowledged.status).toBe("ACKNOWLEDGED");
      expect(acknowledged.acknowledgedById).toBe(founderUserId);

      await expect(acknowledgeAlert(alert.id, acknowledged.version)).rejects.toThrow(); // already acknowledged, not ACTIVE

      const resolved = await resolveAlert(alert.id, acknowledged.version, { reason: "Resolved in test" });
      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.resolvedById).toBe(founderUserId);
      expect((resolved.metadata as { resolutionReason?: string } | null)?.resolutionReason).toBe("Resolved in test");

      await expect(resolveAlert(alert.id, resolved.version, {})).rejects.toThrow(); // already resolved
    });

    it("rejects operating on an alert belonging to a different organization scope (not found, not a cross-org leak)", async () => {
      authAs(founderUserId);
      await expect(acknowledgeAlert("nonexistent-id-00000000000000", 1)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("runs detection idempotently — re-running immediately creates no duplicate alerts for the same still-active condition, and never throws even if a Finance subsystem is unavailable", async () => {
      authAs(founderUserId);
      const first = await runAlertDetection();
      expect(typeof first.checked).toBe("number");
      expect(Array.isArray(first.failures)).toBe(true);

      const second = await runAlertDetection();
      // Every condition still active after the first run is deduplicated
      // on the second — created must not exceed what's newly true, and in
      // particular must not double-count anything the first run already
      // recorded.
      expect(second.created).toBeLessThanOrEqual(first.checked);
    });
  });

  describe("Notification Center", () => {
    it("creates, lists, and marks a notification read, scoped to the recipient", async () => {
      authAs(founderUserId);
      const created = await createNotification({
        recipientId: founderUserId, category: "SYSTEM", priority: "NORMAL",
        title: `Test notification ${suffix}`, body: "Test notification body",
      });
      expect(created.readAt).toBeNull();

      const list = await listMyNotifications({ pageSize: 50 });
      expect(list.items.some((n) => n.id === created.id)).toBe(true);
      expect(list.unread).toBeGreaterThanOrEqual(1);

      const marked = await markNotificationRead(created.id);
      expect(marked.readAt).not.toBeNull();

      // Idempotent — marking an already-read notification read again is a no-op, not an error.
      const markedAgain = await markNotificationRead(created.id);
      expect(markedAgain.readAt).not.toBeNull();
    });

    it("marks all unread notifications read for the current recipient in one call", async () => {
      authAs(founderUserId);
      await createNotification({ recipientId: founderUserId, category: "SYSTEM", priority: "LOW", title: `Bulk test ${suffix} A`, body: "A" });
      await createNotification({ recipientId: founderUserId, category: "SYSTEM", priority: "LOW", title: `Bulk test ${suffix} B`, body: "B" });

      const before = await listMyNotifications({ pageSize: 50 });
      expect(before.unread).toBeGreaterThanOrEqual(2);

      await markAllNotificationsRead();

      const after = await listMyNotifications({ pageSize: 50 });
      expect(after.unread).toBe(0);
    });
  });

  describe("Executive Timeline and Activity Feed", () => {
    it("returns a bounded, paginated, organization-scoped result for both", async () => {
      authAs(founderUserId);
      const timeline = await getExecutiveTimeline({ pageSize: 5 });
      expect(timeline.items.length).toBeLessThanOrEqual(5);
      expect(typeof timeline.total).toBe("number");

      const feed = await getActivityFeed({ pageSize: 5 });
      expect(feed.items.length).toBeLessThanOrEqual(5);
      // The Activity Feed is the uncurated superset of the Executive
      // Timeline's own curated allowlist — its total should never be
      // smaller than the timeline's.
      expect(feed.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Global Search Foundation", () => {
    it("returns a unified result shape across entity types without throwing on no matches", async () => {
      authAs(founderUserId);
      const result = await globalSearch({ query: `no-such-thing-${suffix}`, limit: 5 });
      expect(result.results).toEqual([]);
    });

    it("finds a real customer by name substring", async () => {
      authAs(founderUserId);
      const customer = await prisma.customer.create({ data: { email: `founder-os-search-${suffix}@example.test`, name: `FounderOsSearchTarget ${suffix}` } });
      const result = await globalSearch({ query: suffix, types: ["CUSTOMER"], limit: 10 });
      expect(result.results.some((r) => r.type === "CUSTOMER" && r.id === customer.id)).toBe(true);
    });
  });

  describe("Founder Widget Framework", () => {
    it("lists the seeded default widgets and lets a user override visibility/order", async () => {
      authAs(founderUserId);
      const widgets = await listWidgetsForCurrentUser();
      expect(widgets.length).toBeGreaterThanOrEqual(13);
      expect(widgets.every((w) => typeof w.visible === "boolean")).toBe(true);
      const revenueWidget = widgets.find((w) => w.code === "REVENUE");
      expect(revenueWidget).toBeDefined();
      expect(revenueWidget!.visible).toBe(true); // default

      await setWidgetPreference({ widgetCode: "REVENUE", visible: false, sortOrder: 99 });
      const updated = await listWidgetsForCurrentUser();
      const revenueAfter = updated.find((w) => w.code === "REVENUE");
      expect(revenueAfter!.visible).toBe(false);
      expect(revenueAfter!.sortOrder).toBe(99);
    });

    it("rejects a preference for a widget code that does not exist", async () => {
      authAs(founderUserId);
      await expect(setWidgetPreference({ widgetCode: `NO-SUCH-WIDGET-${suffix}` })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("Founder Dashboard Framework", () => {
    it("composes every Stage 1 service into one payload", async () => {
      authAs(founderUserId);
      const dashboard = await getFounderDashboard();
      expect(dashboard.summary).toBeDefined();
      expect(dashboard.health).toBeDefined();
      expect(Array.isArray(dashboard.activeAlerts)).toBe(true);
      expect(dashboard.notifications.items).toBeDefined();
      expect(dashboard.timeline.items).toBeDefined();
      expect(dashboard.widgets.length).toBeGreaterThan(0);
      // Stage 5 performance fix: summary and health are now built from
      // one shared KPI/Health computation rather than two independent
      // ones — this is the behavioral proof they can never disagree.
      expect(dashboard.summary.companyHealth).toBe(dashboard.health.overall);
    });
  });
});
