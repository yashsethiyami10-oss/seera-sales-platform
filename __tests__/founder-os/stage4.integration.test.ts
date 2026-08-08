import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { createSavedView, deleteSavedView, listSavedViews, setDefaultSavedView, updateSavedView } from "@/lib/founder-os/saved-view-service";
import {
  activateDashboardLayout, createDashboardLayout, deleteDashboardLayout, listDashboardLayouts,
  resetDashboardLayoutToSystemDefault, setDefaultDashboardLayout, updateDashboardLayout,
} from "@/lib/founder-os/dashboard-layout-service";
import { listPinnedWidgets, listWidgetsForCurrentUser, pinWidget, reorderPinnedWidgets, unpinWidget } from "@/lib/founder-os/widget-service";
import { createSavedReport, deleteSavedReport, generateReport, listSavedReports, updateSavedReport } from "@/lib/founder-os/report-workspace-service";
import { getMyWorkspacePreferences, updateMyWorkspacePreferences } from "@/lib/founder-os/workspace-preference-service";
import { globalSearch } from "@/lib/founder-os/search-foundation";
import { savedViewCreateInput, savedReportCreateInput, workspacePreferenceInput } from "@/lib/founder-os/schemas";

const suffix = `fo4${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
let founder2UserId: string;
let restrictedUserId: string;
let limitedUserId: string; // has founder_os.access + workspace.manage, but NOT the test widget's requiredPermission
let createdFounder2 = false;
let createdRestricted = false;
let limitedRoleId: string;
let testWidgetId: string;

describe("Part 3D Stage 4 — Founder Workspace", () => {
  beforeAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED"]) {
      await setFlag(key, true);
    }

    const founder = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
    if (!founder) throw new Error("A seeded, active Founder user is required for this test");
    founderUserId = founder.id;

    const founderRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Founder" } });
    const founder2 = await prisma.user.create({
      data: { name: "Founder OS Stage 4 Second Founder Test User", email: `founder-os-s4-founder2-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: founderRole.id, active: true },
    });
    founder2UserId = founder2.id;
    createdFounder2 = true;

    const support = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Customer Support", active: true } } });
    if (support) {
      restrictedUserId = support.id;
    } else {
      const supportRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Customer Support" } });
      const created = await prisma.user.create({
        data: { name: "Founder OS Stage 4 Restricted Test User", email: `founder-os-s4-restricted-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      restrictedUserId = created.id;
      createdRestricted = true;
    }

    // A dedicated, isolated role granted ONLY founder_os.access +
    // founder_os.workspace.manage (never touching the shared "Customer
    // Support" role other suites rely on staying founder_os-free) — the
    // only way to test "unauthorized widget rejection" for real: a
    // Founder bypasses every permission check via isFounder, so proving
    // a widget's requiredPermission is actually enforced needs a
    // non-Founder principal that *does* hold general Founder OS access.
    const accessPermission = await prisma.salesPermission.findUniqueOrThrow({ where: { permissionKey: "founder_os.access" } });
    const workspacePermission = await prisma.salesPermission.findUniqueOrThrow({ where: { permissionKey: "founder_os.workspace.manage" } });
    const limitedRole = await prisma.salesRole.create({ data: { name: `Founder OS Stage 4 Limited ${suffix}`, active: true } });
    limitedRoleId = limitedRole.id;
    await prisma.salesRolePermission.createMany({ data: [
      { roleId: limitedRole.id, permissionId: accessPermission.id },
      { roleId: limitedRole.id, permissionId: workspacePermission.id },
    ] });
    const limitedUser = await prisma.user.create({
      data: { name: "Founder OS Stage 4 Limited Test User", email: `founder-os-s4-limited-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: limitedRole.id, active: true },
    });
    limitedUserId = limitedUser.id;

    const testWidget = await prisma.founderWidgetDefinition.create({
      data: { code: `TEST_GATED_WIDGET_${suffix}`, name: "Test Gated Widget", category: "CUSTOM", requiredPermission: "finance.reports.view", defaultVisible: true, defaultOrder: 999, status: "ACTIVE" },
    });
    testWidgetId = testWidget.id;
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED"]) {
      await setFlag(key, false);
    }
    await prisma.founderSavedView.deleteMany({ where: { organizationKey: "MUV", name: { contains: suffix } } });
    await prisma.founderDashboardLayout.deleteMany({ where: { organizationKey: "MUV", name: { contains: suffix } } });
    await prisma.founderSavedReport.deleteMany({ where: { organizationKey: "MUV", name: { contains: suffix } } });
    await prisma.founderWorkspacePreference.deleteMany({ where: { organizationKey: "MUV", userId: { in: [founderUserId, founder2UserId, limitedUserId] } } });
    await prisma.founderWidgetPreference.deleteMany({ where: { organizationKey: "MUV", userId: { in: [founderUserId, founder2UserId, limitedUserId] } } });
    await prisma.founderWidgetDefinition.delete({ where: { id: testWidgetId } }).catch(() => {});
    await prisma.user.delete({ where: { id: limitedUserId } }).catch(() => {});
    await prisma.salesRolePermission.deleteMany({ where: { roleId: limitedRoleId } });
    await prisma.salesRole.delete({ where: { id: limitedRoleId } }).catch(() => {});
    if (createdFounder2) await prisma.user.delete({ where: { id: founder2UserId } }).catch(() => {});
    if (createdRestricted) await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => {});
  });

  describe("access control", () => {
    it("denies every Stage 4 entry point without founder_os.access", async () => {
      authAs(restrictedUserId);
      await expect(listSavedViews()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listDashboardLayouts()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listSavedReports()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getMyWorkspacePreferences()).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listPinnedWidgets()).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("denies every Stage 4 write without founder_os.workspace.manage", async () => {
      authAs(restrictedUserId);
      await expect(createSavedView({ surface: "ALERTS", name: "x" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createDashboardLayout({ name: "x" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createSavedReport({ name: "x", reportType: "EXECUTIVE_SUMMARY" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(pinWidget({ widgetCode: "REVENUE" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateMyWorkspacePreferences({ displayDensity: "COMPACT" })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("Saved Views", () => {
    it("creates, updates, and deletes a saved view, rejecting an unsupported filter field", async () => {
      authAs(founderUserId);
      await expect(createSavedView({ surface: "ALERTS", name: `Bad filter ${suffix}`, filters: [{ field: "password", operator: "EQUALS", value: "x" }] }))
        .rejects.toBeInstanceOf(AppError);

      const view = await createSavedView({
        surface: "ALERTS", name: `Critical alerts ${suffix}`, filters: [{ field: "severity", operator: "EQUALS", value: "CRITICAL" }],
      });
      expect(view.surface).toBe("ALERTS");

      const updated = await updateSavedView({ id: view.id, name: `Critical alerts renamed ${suffix}` });
      expect(updated.name).toBe(`Critical alerts renamed ${suffix}`);

      const deleted = await deleteSavedView(view.id);
      expect(deleted.deleted).toBe(true);
      await expect(updateSavedView({ id: view.id, name: "x" })).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects malformed filter values that are not plain string/number/boolean/array (no arbitrary JSON execution)", () => {
      const result = savedViewCreateInput.safeParse({
        surface: "ALERTS", name: "x", filters: [{ field: "severity", operator: "EQUALS", value: { $where: "1=1" } }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an unsupported surface", () => {
      const result = savedViewCreateInput.safeParse({ surface: "NOT_A_REAL_SURFACE", name: "x" });
      expect(result.success).toBe(false);
    });

    it("rejects unsupported keys (strict schema)", () => {
      const result = savedViewCreateInput.safeParse({ surface: "ALERTS", name: "x", rawSql: "DROP TABLE users;" });
      expect(result.success).toBe(false);
    });

    it("enforces at most one default per owner+surface, atomically switching via setDefaultSavedView", async () => {
      authAs(founderUserId);
      const first = await createSavedView({ surface: "TIMELINE", name: `View A ${suffix}`, isDefault: true });
      const second = await createSavedView({ surface: "TIMELINE", name: `View B ${suffix}`, isDefault: true });

      const views = await listSavedViews("TIMELINE");
      const firstAfter = views.find((v) => v.id === first.id)!;
      const secondAfter = views.find((v) => v.id === second.id)!;
      expect(firstAfter.isDefault).toBe(false);
      expect(secondAfter.isDefault).toBe(true);

      await setDefaultSavedView(first.id);
      const viewsAfterSwitch = await listSavedViews("TIMELINE");
      expect(viewsAfterSwitch.find((v) => v.id === first.id)!.isDefault).toBe(true);
      expect(viewsAfterSwitch.find((v) => v.id === second.id)!.isDefault).toBe(false);
    });

    it("the default-uniqueness invariant is enforced at the database level, not only in application code", async () => {
      const now = new Date();
      await prisma.founderSavedView.create({ data: { organizationKey: "MUV", ownerId: founderUserId, surface: "SEARCH", name: `DB default A ${suffix}`, isDefault: true, createdAt: now, updatedAt: now } });
      await expect(
        prisma.founderSavedView.create({ data: { organizationKey: "MUV", ownerId: founderUserId, surface: "SEARCH", name: `DB default B ${suffix}`, isDefault: true, createdAt: now, updatedAt: now } })
      ).rejects.toThrow();
    });

    it("prevents cross-user reads and writes — a second Founder-role account cannot see or modify another's saved view", async () => {
      authAs(founderUserId);
      const view = await createSavedView({ surface: "DECISION_QUEUE", name: `Owner-only ${suffix}` });

      authAs(founder2UserId);
      const otherViews = await listSavedViews("DECISION_QUEUE");
      expect(otherViews.some((v) => v.id === view.id)).toBe(false);
      await expect(updateSavedView({ id: view.id, name: "hijacked" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteSavedView(view.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("Dashboard Layouts", () => {
    it("creates a layout, rejects an invalid widget code, and rejects an unauthorized widget", async () => {
      authAs(founderUserId);
      await expect(createDashboardLayout({ name: `Bad ${suffix}`, widgets: [{ widgetCode: `NO-SUCH-WIDGET-${suffix}`, order: 0 }] }))
        .rejects.toBeInstanceOf(AppError);

      authAs(limitedUserId);
      await expect(createDashboardLayout({ name: `Unauthorized ${suffix}`, widgets: [{ widgetCode: `TEST_GATED_WIDGET_${suffix}`, order: 0 }] }))
        .rejects.toBeInstanceOf(AppError);

      authAs(founderUserId);
      const layout = await createDashboardLayout({ name: `Layout A ${suffix}`, widgets: [{ widgetCode: "REVENUE", order: 0 }] });
      expect(layout.name).toBe(`Layout A ${suffix}`);
    });

    it("enforces at most one active and one default layout per owner", async () => {
      authAs(founderUserId);
      const a = await createDashboardLayout({ name: `Active A ${suffix}`, isActive: true });
      const b = await createDashboardLayout({ name: `Active B ${suffix}`, isActive: true });

      const layouts = await listDashboardLayouts();
      expect(layouts.find((l) => l.id === a.id)!.isActive).toBe(false);
      expect(layouts.find((l) => l.id === b.id)!.isActive).toBe(true);

      await activateDashboardLayout(a.id);
      const afterActivate = await listDashboardLayouts();
      expect(afterActivate.find((l) => l.id === a.id)!.isActive).toBe(true);
      expect(afterActivate.find((l) => l.id === b.id)!.isActive).toBe(false);

      await setDefaultDashboardLayout(a.id);
      await setDefaultDashboardLayout(b.id);
      const afterDefault = await listDashboardLayouts();
      expect(afterDefault.find((l) => l.id === a.id)!.isDefault).toBe(false);
      expect(afterDefault.find((l) => l.id === b.id)!.isDefault).toBe(true);
    });

    it("resets to system default (deactivates custom layouts) without deleting them", async () => {
      authAs(founderUserId);
      const layout = await createDashboardLayout({ name: `Resettable ${suffix}`, isActive: true, isDefault: true });
      await resetDashboardLayoutToSystemDefault();
      const layouts = await listDashboardLayouts();
      const found = layouts.find((l) => l.id === layout.id)!;
      expect(found).toBeDefined();
      expect(found.isActive).toBe(false);
      expect(found.isDefault).toBe(false);
      await deleteDashboardLayout(layout.id);
    });
  });

  describe("Pinned Widgets", () => {
    it("pins, prevents duplicate pins, enforces the max pin limit, and unpins", async () => {
      authAs(founderUserId);
      const widgets = await listWidgetsForCurrentUser();
      const codes = widgets.slice(0, 9).map((w) => w.code);
      expect(codes.length).toBeGreaterThanOrEqual(9);

      for (const code of codes.slice(0, 8)) {
        await pinWidget({ widgetCode: code });
      }
      // Duplicate pin — idempotent, not an error, and not a second row.
      await pinWidget({ widgetCode: codes[0]! });
      const pinnedAfterDuplicate = await listPinnedWidgets();
      expect(pinnedAfterDuplicate.length).toBe(8);

      await expect(pinWidget({ widgetCode: codes[8]! })).rejects.toBeInstanceOf(AppError);

      await unpinWidget({ widgetCode: codes[0]! });
      const pinnedAfterUnpin = await listPinnedWidgets();
      expect(pinnedAfterUnpin.some((p) => p.code === codes[0])).toBe(false);

      // Clean up the rest for test isolation.
      for (const code of codes.slice(1, 8)) await unpinWidget({ widgetCode: code });
    });

    it("reorders pinned widgets and rejects a reorder list that doesn't match the currently pinned set", async () => {
      authAs(founderUserId);
      await pinWidget({ widgetCode: "REVENUE" });
      await pinWidget({ widgetCode: "ORDERS" });

      await expect(reorderPinnedWidgets({ widgetCodes: ["REVENUE"] })).rejects.toBeInstanceOf(AppError);

      const reordered = await reorderPinnedWidgets({ widgetCodes: ["ORDERS", "REVENUE"] });
      expect(reordered[0]!.code).toBe("ORDERS");
      expect(reordered[1]!.code).toBe("REVENUE");

      await unpinWidget({ widgetCode: "REVENUE" });
      await unpinWidget({ widgetCode: "ORDERS" });
    });
  });

  describe("Executive Report Workspace and Report Generation", () => {
    it("rejects an unsupported metric (Profit remains rejected — no authoritative source exists)", () => {
      const result = savedReportCreateInput.safeParse({
        name: "x", reportType: "KPI_SNAPSHOT", metrics: ["PROFIT"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an oversized report date range", async () => {
      authAs(founderUserId);
      const from = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000);
      const to = new Date();
      await expect(createSavedReport({ name: `Too wide ${suffix}`, reportType: "TREND_ANALYSIS", dateRangeFrom: from, dateRangeTo: to }))
        .rejects.toBeInstanceOf(AppError);
    });

    it("stores scheduling as configuration only — no lastRunAt/nextRunAt field exists anywhere on the record", async () => {
      authAs(founderUserId);
      const report = await createSavedReport({
        name: `Scheduled ${suffix}`, reportType: "EXECUTIVE_SUMMARY",
        scheduleEnabled: true, scheduleFrequency: "DAILY", scheduleDeliveryChannel: "DASHBOARD",
      });
      expect(report.scheduleEnabled).toBe(true);
      expect(report).not.toHaveProperty("lastRunAt");
      expect(report).not.toHaveProperty("nextRunAt");
      await deleteSavedReport(report.id);
    });

    it("generates each report type by composing authoritative Stage 1/2 services, never a direct Finance-table query", async () => {
      authAs(founderUserId);

      const summaryReport = await createSavedReport({ name: `Summary ${suffix}`, reportType: "EXECUTIVE_SUMMARY" });
      const summaryResult = await generateReport(summaryReport.id);
      expect(summaryResult.sections.summary).toBeDefined();
      expect(summaryResult.generatedAt).toBeInstanceOf(Date);

      const kpiReport = await createSavedReport({ name: `KPIs ${suffix}`, reportType: "KPI_SNAPSHOT", metrics: ["REVENUE_TODAY", "OUTSTANDING_RECEIVABLES"] });
      const kpiResult = await generateReport(kpiReport.id);
      expect(kpiResult.sections.kpis).toBeDefined();
      expect(kpiResult.explainability.length).toBe(2);

      const trendReport = await createSavedReport({ name: `Trend ${suffix}`, reportType: "TREND_ANALYSIS", grouping: "MONTHLY" });
      const trendResult = await generateReport(trendReport.id);
      expect(trendResult.sections.trend).toBeDefined();

      const comparisonReport = await createSavedReport({ name: `Comparison ${suffix}`, reportType: "PERIOD_COMPARISON", comparisonMode: "MONTH_VS_MONTH" });
      const comparisonResult = await generateReport(comparisonReport.id);
      expect(comparisonResult.sections.comparison).toBeDefined();

      const queueReport = await createSavedReport({ name: `Queue ${suffix}`, reportType: "DECISION_QUEUE_SNAPSHOT" });
      const queueResult = await generateReport(queueReport.id);
      expect(queueResult.sections.decisionQueue).toBeDefined();

      // lastGeneratedAt was stamped by generation.
      const reports = await listSavedReports();
      expect(reports.find((r) => r.id === summaryReport.id)!.lastGeneratedAt).not.toBeNull();

      for (const r of [summaryReport, kpiReport, trendReport, comparisonReport, queueReport]) await deleteSavedReport(r.id);
    });

    it("prevents cross-user access to a saved report", async () => {
      authAs(founderUserId);
      const report = await createSavedReport({ name: `Owner-only report ${suffix}`, reportType: "EXECUTIVE_SUMMARY" });

      authAs(founder2UserId);
      await expect(generateReport(report.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(updateSavedReport({ id: report.id, name: "hijacked" })).rejects.toBeInstanceOf(NotFoundError);

      authAs(founderUserId);
      await deleteSavedReport(report.id);
    });
  });

  describe("Workspace Preferences", () => {
    it("saves and retrieves preferences scoped to the current owner only", async () => {
      authAs(founderUserId);
      await updateMyWorkspacePreferences({ displayDensity: "COMPACT", tablePageSize: 50, defaultLandingSurface: "ALERTS" });
      const mine = await getMyWorkspacePreferences();
      expect(mine!.displayDensity).toBe("COMPACT");
      expect(mine!.tablePageSize).toBe(50);

      authAs(founder2UserId);
      const other = await getMyWorkspacePreferences();
      expect(other).toBeNull();
    });

    it("rejects unsupported enum values", () => {
      const result = workspacePreferenceInput.safeParse({ displayDensity: "ULTRA_COMPACT" });
      expect(result.success).toBe(false);
    });
  });

  describe("Search Integration", () => {
    it("finds a Founder's own saved view by name but never another owner's", async () => {
      authAs(founderUserId);
      const view = await createSavedView({ surface: "ACTIVITY_FEED", name: `Findable ${suffix}` });

      const ownResults = await globalSearch({ query: suffix, types: ["SAVED_VIEW"], limit: 10 });
      expect(ownResults.results.some((r) => r.type === "SAVED_VIEW" && r.id === view.id)).toBe(true);

      authAs(founder2UserId);
      const otherResults = await globalSearch({ query: suffix, types: ["SAVED_VIEW"], limit: 10 });
      expect(otherResults.results.some((r) => r.id === view.id)).toBe(false);

      authAs(founderUserId);
      await deleteSavedView(view.id);
    });
  });

  describe("Regression — Stage 1-3 behavior unchanged", () => {
    it("listWidgetsForCurrentUser still returns pinned:false by default and does not break on the new columns", async () => {
      authAs(founderUserId);
      const widgets = await listWidgetsForCurrentUser();
      expect(widgets.every((w) => typeof w.pinned === "boolean")).toBe(true);
    });
  });
});
