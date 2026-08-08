const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "..");
const prisma = new PrismaClient();
let passed = 0;
let failed = 0;
function source(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function check(ok, name, detail = "") {
  if (ok) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}
async function expectRejected(name, work) {
  try {
    await prisma.$transaction(work);
    check(false, name);
  } catch {
    check(true, name);
  }
}

// Structural + live-database checks for Part 3D Stage 1 (Founder OS).
// Static checks are scoped to specific functions/files, not blanket
// file-wide greps; the runtime behavior itself is covered by the real
// 16-test integration suite (__tests__/founder-os/stage1.integration.test.ts),
// which this script does not attempt to replace.
async function main() {
  const schema = source("prisma/schema.prisma");

  const models = ["FounderAlert", "FounderNotification", "FounderWidgetDefinition", "FounderWidgetPreference"];
  for (const model of models) check(schema.includes(`model ${model} `), `schema contains ${model}`);

  const migrationDir = "20260728100000_enterprise_phase2_part3d_founder_os_stage1";
  const migrationPath = `prisma/migrations/${migrationDir}/migration.sql`;
  check(fs.existsSync(path.join(root, migrationPath)), `migration ${migrationDir} exists`);
  if (fs.existsSync(path.join(root, migrationPath))) {
    const migration = source(migrationPath);
    check(!/\bDROP\s+(TABLE|COLUMN)\b/i.test(migration), "Part 3D migration is additive");
    check(!/finance_/i.test(migration.replace(/-- .*$/gm, "")), "Part 3D migration touches no finance_* table (Part 3C stays frozen)");
  }

  // No Founder OS file may write directly into any finance_* table, an
  // accounting table's Prisma model, or FinanceLedgerEntry specifically —
  // it may only call the existing Finance Business Services.
  const founderOsDir = path.join(root, "lib/founder-os");
  const founderOsFiles = fs.readdirSync(founderOsDir).filter((f) => f.endsWith(".ts"));
  const writesIntoFinance = founderOsFiles.filter((f) => {
    const content = fs.readFileSync(path.join(founderOsDir, f), "utf8");
    return /tx\.finance[A-Za-z]+\.(create|update|delete|createMany|updateMany|deleteMany|upsert)/.test(content)
      || /prisma\.finance[A-Za-z]+\.(create|update|delete|createMany|updateMany|deleteMany|upsert)/.test(content);
  });
  check(writesIntoFinance.length === 0, "no Founder OS file writes directly into any finance_* table", writesIntoFinance.join(", "));

  // Every Founder OS Business Service file requires a trusted principal.
  // alert-store.ts is an internal helper (like posting-engine.ts's own
  // postSystemGeneratedJournalInTx) — its caller already checked.
  const serviceFiles = founderOsFiles.filter((f) => !["domain.ts", "schemas.ts", "context.ts", "alert-store.ts", "approval-store.ts", "job-store.ts", "widget-catalogue.ts"].includes(f));
  for (const file of serviceFiles) {
    const content = fs.readFileSync(path.join(founderOsDir, file), "utf8");
    check(/requireFounderOsPrincipal\(/.test(content), `${file} requires a trusted Founder OS principal`);
  }

  // Reuse checks — the KPI Engine must call the real Finance/Analytics
  // functions, not recompute their calculations.
  const kpiSource = source("lib/founder-os/kpi-engine.ts");
  check(/from "@\/lib\/analytics"/.test(kpiSource), "KPI Engine imports from the frozen Phase 15 lib/analytics.ts");
  check(/getReceivablesAging/.test(kpiSource) && /getPayablesAging/.test(kpiSource) && /getBankPosition/.test(kpiSource), "KPI Engine calls the frozen Part 3C AR/AP/Banking reporting functions");

  const timelineSource = source("lib/founder-os/timeline-feed.ts");
  check(/salesTimelineEvent\.findMany/.test(timelineSource), "Executive Timeline / Activity Feed reuse the existing SalesTimelineEvent model");
  check(!/model SalesTimelineEvent/.test(source("prisma/migrations/20260728100000_enterprise_phase2_part3d_founder_os_stage1/migration.sql")), "no duplicate timeline table was introduced");

  // Permissions: the two pre-provisioned keys must exist and be reused
  // (not duplicated under a new name), and the three genuinely new keys
  // must exist too.
  const permissionKeys = [
    "founder_os.access", "founder_os.alerts.manage",
    "founder_os.notifications.view", "founder_os.notifications.manage", "founder_os.widgets.manage",
  ];
  const permissions = await prisma.salesPermission.findMany({ where: { permissionKey: { in: permissionKeys } } });
  check(permissions.length === permissionKeys.length, "all 5 Founder OS permissions used by Stage 1 are seeded", String(permissions.length));
  const founderRole = await prisma.salesRole.findUnique({ where: { name: "Founder" }, include: { permissions: { include: { permission: true } } } });
  check(Boolean(founderRole && permissionKeys.every((key) => founderRole.permissions.some((g) => g.permission.permissionKey === key))), "Founder role has every Founder OS permission Stage 1 uses");

  // Feature flag — must already exist (pre-reserved before this Stage),
  // not be newly invented, and default disabled.
  const flag = await prisma.aiConfiguration.findFirst({ where: { organizationKey: "MUV", key: "ENTERPRISE_FOUNDER_OS_ENABLED", category: "FEATURE_FLAG" } });
  check(Boolean(flag), "ENTERPRISE_FOUNDER_OS_ENABLED feature flag is seeded");
  check(Boolean(flag) && !flag.value.enabled, "ENTERPRISE_FOUNDER_OS_ENABLED defaults disabled");

  // Widget registry — 13 default widgets seeded, active.
  const widgetCount = await prisma.founderWidgetDefinition.count({ where: { status: "ACTIVE" } });
  check(widgetCount >= 13, "at least 13 default Founder OS widgets are seeded", String(widgetCount));

  // Live database checks — ordinary rows here (unlike Part 3C's
  // append-only Finance tables), so these are created and cleaned up
  // directly rather than relying on a rolled-back transaction.
  const founderUser = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
  if (founderUser) {
    const alert = await prisma.founderAlert.create({
      data: { organizationKey: "MUV", alertType: "FINANCE_EXCEPTION", severity: "INFO", title: "VERIFY", description: "VERIFY", sourceModule: "VERIFIER" },
    });
    const found = await prisma.founderAlert.findUnique({ where: { id: alert.id } });
    check(Boolean(found) && found.organizationKey === "MUV", "FounderAlert round-trips correctly with organization scope");
    const notification = await prisma.founderNotification.create({
      data: { organizationKey: "MUV", recipientId: founderUser.id, category: "SYSTEM", priority: "LOW", title: "VERIFY", body: "VERIFY", sourceAlertId: alert.id },
    });
    check(Boolean(notification.sourceAlertId === alert.id), "FounderNotification correctly links back to its source FounderAlert");
    await prisma.founderNotification.delete({ where: { id: notification.id } });
    await prisma.founderAlert.delete({ where: { id: alert.id } });
  } else {
    check(false, "a seeded Founder user is required for the live round-trip check");
  }

  // --- Stage 2 — Executive Intelligence checks ---

  // No new Prisma model was introduced for Stage 2 — Trend/Comparison/
  // Risk/Decision Queue/Drill Down/Explainability/Brief Engine all reuse
  // FounderAlert (via alert-store.ts) or read existing tables directly.
  check(!/model FounderRisk|model FounderTrend|model FounderBrief|model FounderDecision/.test(schema), "Stage 2 introduced no duplicate Alert/Trend/Brief/Decision table");

  const alertStoreSource = source("lib/founder-os/alert-store.ts");
  const riskEngineSource = source("lib/founder-os/risk-engine.ts");
  const alertEngineSource = source("lib/founder-os/alert-engine.ts");
  check(!/async function upsertAlert/.test(alertEngineSource), "alert-engine.ts no longer defines its own upsertAlert (factored into alert-store.ts)");
  check(/from ".\/alert-store"/.test(alertEngineSource), "alert-engine.ts imports the shared upsertAlert from alert-store.ts");
  check(/from ".\/alert-store"/.test(riskEngineSource), "risk-engine.ts reuses the same shared upsertAlert as alert-engine.ts (no parallel create/dedupe logic)");
  check(/upsertAlert/.test(alertStoreSource) && /founderAlert\.findFirst/.test(alertStoreSource) && /founderAlert\.create/.test(alertStoreSource), "alert-store.ts contains the single, shared dedupe-then-create implementation");

  const domainSource = source("lib/founder-os/domain.ts");
  for (const riskType of ["REVENUE_DROP", "EXPENSE_SPIKE", "COLLECTION_DELAY", "CUSTOMER_DECLINE", "BUSINESS_ANOMALY"]) {
    check(domainSource.includes(`"${riskType}"`), `domain.ts declares the ${riskType} alert type`);
  }

  const trendSource = source("lib/founder-os/trend-engine.ts");
  check(/getRevenueTrend\(/.test(trendSource) && !/financeLedgerEntry|prisma\.order\.findMany/.test(trendSource), "Trend Engine buckets the existing getRevenueTrend series rather than re-querying orders/ledger directly");

  const comparisonSource = source("lib/founder-os/comparison-engine.ts");
  check(/getGrowthComparison\(/.test(comparisonSource), "Comparison Engine calls the existing getGrowthComparison rather than reimplementing period comparison");

  const healthSource = source("lib/founder-os/company-health-service.ts");
  for (const area of ["REVENUE", "FINANCE", "SALES", "CUSTOMER", "COLLECTION"]) {
    check(new RegExp(`area: "${area}"`).test(healthSource), `Company Health computes a ${area} area signal`);
  }

  const drilldownSource = source("lib/founder-os/drilldown-service.ts");
  check(/listReceivableInvoices|listVendorBills/.test(drilldownSource), "Drill Down reuses existing paginated Finance list functions for the Record level");
  check(/getSourceLedger/.test(drilldownSource), "Drill Down reuses the existing (audit-repaired, bounded) getSourceLedger for the Transaction level");

  const briefSource = source("lib/founder-os/brief-engine.ts");
  check(/getExecutiveSummary\(\)/.test(briefSource), "Brief Engine reuses the Stage 1 Executive Summary Service rather than recomputing it");

  // --- Stage 3 — Enterprise Control Center checks ---

  // No new Prisma model was introduced for Stage 3 — Approval Center/
  // Monitoring/Exception Center/Activity Supervision/Notification Rules
  // all read existing tables (FinanceVendorPayment, FinanceExpenseClaim,
  // Phase2Operation, FounderAlert, SalesTimelineEvent, FounderNotification)
  // directly, or via the shared store modules below.
  check(!/model FounderApproval|model FounderException|model FounderMonitoring|model FounderEscalation/.test(schema), "Stage 3 introduced no duplicate Approval/Exception/Monitoring/Escalation table");

  const approvalStoreSource = source("lib/founder-os/approval-store.ts");
  const jobStoreSource = source("lib/founder-os/job-store.ts");
  const decisionQueueSource = source("lib/founder-os/decision-queue-service.ts");
  const approvalCenterSource = source("lib/founder-os/approval-center-service.ts");
  const monitoringSource = source("lib/founder-os/monitoring-service.ts");
  const exceptionCenterSource = source("lib/founder-os/exception-center-service.ts");
  const activitySupervisionSource = source("lib/founder-os/activity-supervision-service.ts");
  const notificationRulesSource = source("lib/founder-os/notification-rules.ts");

  check(/listPendingVendorPayments/.test(approvalStoreSource) && /listPendingExpenseClaims/.test(approvalStoreSource) && /listRecentlyDecidedVendorPayments/.test(approvalStoreSource) && /listRecentlyDecidedExpenseClaims/.test(approvalStoreSource), "approval-store.ts contains the single, shared pending/recently-decided query implementation");
  check(/from ".\/approval-store"/.test(decisionQueueSource), "decision-queue-service.ts reuses the shared approval-store.ts queries (no parallel implementation)");
  check(/from ".\/approval-store"/.test(approvalCenterSource), "approval-center-service.ts reuses the shared approval-store.ts queries (no parallel implementation)");
  check(!/tx\.financeVendorPayment\.findMany|tx\.financeExpenseClaim\.findMany/.test(decisionQueueSource), "decision-queue-service.ts no longer queries FinanceVendorPayment/FinanceExpenseClaim directly");
  check(!/tx\.financeVendorPayment\.findMany|tx\.financeExpenseClaim\.findMany/.test(approvalCenterSource), "approval-center-service.ts does not query FinanceVendorPayment/FinanceExpenseClaim directly (goes through approval-store.ts)");

  check(/listFailedJobs/.test(jobStoreSource) && /listActiveJobs/.test(jobStoreSource) && /listRecentCompletedJobs/.test(jobStoreSource), "job-store.ts contains the single, shared background-job query implementation");
  check(/from ".\/job-store"/.test(alertEngineSource), "alert-engine.ts reuses the shared job-store.ts queries (no parallel implementation)");
  check(/from ".\/job-store"/.test(monitoringSource), "monitoring-service.ts reuses the shared job-store.ts queries (no parallel implementation)");
  check(!/tx\.phase2Operation\.findMany/.test(alertEngineSource), "alert-engine.ts no longer queries Phase2Operation directly");
  check(!/tx\.phase2Operation\.findMany/.test(monitoringSource), "monitoring-service.ts does not query Phase2Operation directly (goes through job-store.ts)");

  check(/founderAlert\.groupBy/.test(exceptionCenterSource), "Exception Center groups active alerts by a real groupBy query, not a hardcoded module list");
  check(!/sourceModule: "FINANCE"|sourceModule: "SYSTEM"|sourceModule: "GOVERNANCE"|sourceModule: "RISK_ENGINE"/.test(exceptionCenterSource), "Exception Center does not hardcode a fixed set of source modules");

  check(/getActivityFeed\(/.test(activitySupervisionSource), "Activity Supervision reuses the existing Stage 1 getActivityFeed rather than re-querying SalesTimelineEvent");
  check(!/salesTimelineEvent\.findMany/.test(activitySupervisionSource), "Activity Supervision does not duplicate the SalesTimelineEvent query itself");

  check(/export function isEscalationDue/.test(notificationRulesSource), "Notification Rules exposes isEscalationDue as a pure, independently-testable function");
  check(/founderNotification\.update/.test(notificationRulesSource), "escalateNotification mutates the existing FounderNotification.priority column (no new escalation table)");

  // Permissions — Stage 3 reuses founder_os.access and
  // founder_os.notifications.manage (both already seeded for Stage 1);
  // no new permission key was introduced. Checked as "these exact 12
  // keys that existed as of Stage 3 are all still present" rather than a
  // bare total count — a bare count would go stale the moment any later
  // stage (correctly) adds its own new key, the way Stage 4 legitimately
  // does below.
  const stage3ExpectedPermissionKeys = [
    "founder_os.access", "founder_os.financial_intelligence.view", "founder_os.operational_intelligence.view",
    "founder_os.network_intelligence.view", "founder_os.alerts.manage", "founder_os.decisions.access",
    "founder_os.decisions.record", "founder_os.approvals.perform", "founder_os.ai_briefings.access",
    "founder_os.notifications.view", "founder_os.notifications.manage", "founder_os.widgets.manage",
  ];
  const stage3Permissions = await prisma.salesPermission.findMany({ where: { permissionKey: { in: stage3ExpectedPermissionKeys } } });
  check(stage3Permissions.length === stage3ExpectedPermissionKeys.length, "All 12 founder_os.* permissions that existed as of Stage 3 are still present (none removed/renamed by a later stage)", String(stage3Permissions.length));

  // --- Stage 4 — Founder Workspace checks ---

  const stage4MigrationDir = "20260801090000_enterprise_phase2_part3d_founder_os_stage4";
  const stage4MigrationPath = `prisma/migrations/${stage4MigrationDir}/migration.sql`;
  check(fs.existsSync(path.join(root, stage4MigrationPath)), `migration ${stage4MigrationDir} exists`);
  if (fs.existsSync(path.join(root, stage4MigrationPath))) {
    const migration = source(stage4MigrationPath);
    check(!/\bDROP\s+(TABLE|COLUMN)\b/i.test(migration), "Stage 4 migration is additive");
    check(!/finance_/i.test(migration.replace(/-- .*$/gm, "")), "Stage 4 migration touches no finance_* table (Part 3C stays frozen)");
    check(!/founder_alerts|founder_notifications|founder_widget_definitions/i.test(migration.replace(/-- .*$/gm, "")), "Stage 4 migration touches no Stage 1 founder_alerts/founder_notifications/founder_widget_definitions table");
  }

  const stage4Models = ["FounderSavedView", "FounderDashboardLayout", "FounderSavedReport", "FounderWorkspacePreference"];
  for (const model of stage4Models) check(schema.includes(`model ${model} `), `schema contains ${model}`);
  check(/pinned\s+Boolean/.test(schema) && /pinnedOrder\s+Int\?/.test(schema), "FounderWidgetPreference gained pinned/pinnedOrder columns rather than a second widget-state table");

  const widgetCatalogueSource = source("lib/founder-os/widget-catalogue.ts");
  const widgetServiceSource = source("lib/founder-os/widget-service.ts");
  const savedViewSource = source("lib/founder-os/saved-view-service.ts");
  const dashboardLayoutSource = source("lib/founder-os/dashboard-layout-service.ts");
  const reportWorkspaceSource = source("lib/founder-os/report-workspace-service.ts");
  const workspacePreferenceSource = source("lib/founder-os/workspace-preference-service.ts");
  const searchFoundationSource = source("lib/founder-os/search-foundation.ts");

  // Reuse — Stage 1 widget framework, Stage 2 engines, Stage 3 surfaces.
  check(/getAuthorizedWidgetDefinitions/.test(widgetCatalogueSource), "widget-catalogue.ts contains the single, shared authorized-widget-set implementation");
  check(/from ".\/widget-catalogue"/.test(widgetServiceSource), "widget-service.ts (Stage 1) reuses widget-catalogue.ts rather than a second filter implementation");
  check(/from ".\/widget-catalogue"/.test(dashboardLayoutSource), "Dashboard Layouts reuses the same widget-catalogue.ts authorization check pinning/listing already uses");
  check(/getExecutiveSummary|getEnterpriseKpis|getRevenueTrendSeries|getComparison|getAllComparisons|getDecisionQueue/.test(reportWorkspaceSource), "Report Generation dispatches to existing Stage 1/2 composition services");
  check(!/tx\.finance[A-Za-z]+\.findMany|prisma\.finance[A-Za-z]+\.findMany/.test(reportWorkspaceSource), "Report Generation contains no direct finance_* table query of its own");
  check(/explainMetric/.test(reportWorkspaceSource), "Report Generation attaches Explainability metadata via the existing Stage 2 service, not a new one");
  check(/SAVED_VIEW/.test(searchFoundationSource) && /SAVED_REPORT/.test(searchFoundationSource) && /DASHBOARD_LAYOUT/.test(searchFoundationSource), "Search Integration extends the existing Stage 1 globalSearch fan-out rather than a second search implementation");

  // No parallel audit system, no isolated scheduler.
  check(!/model FounderAudit|model FounderWorkspaceAudit|model FounderScheduledJob|model FounderScheduler/.test(schema), "Stage 4 introduced no parallel audit table or scheduler table");
  check(!/cron|setInterval|setTimeout/i.test(reportWorkspaceSource), "Report Scheduling stores preferences only — no cron/interval/timeout execution exists in report-workspace-service.ts");
  // Matches an actual field declaration only (name followed by its type),
  // not this file's own doc comments explaining the deliberate absence.
  check(!/(lastRunAt|nextRunAt)\s+DateTime/.test(schema), "No lastRunAt/nextRunAt column exists anywhere in the schema — scheduling cannot claim a false execution state");

  // Ownership — every Stage 4 owner-scoped query must filter by
  // ownerId/userId: principal.id, and none of the four owner-scoped
  // services may use principal.isFounder to bypass that scope (the
  // Founder role bypasses *permission* checks elsewhere in this
  // codebase, never ownership — two Founder-role accounts must still be
  // isolated from each other's saved views/layouts/reports/preferences).
  for (const [name, src] of [["saved-view-service.ts", savedViewSource], ["dashboard-layout-service.ts", dashboardLayoutSource], ["report-workspace-service.ts", reportWorkspaceSource], ["workspace-preference-service.ts", workspacePreferenceSource]]) {
    check(/ownerId: principal\.id|userId: principal\.id/.test(src), `${name} scopes every query to the current owner`);
    check(!/principal\.isFounder/.test(src), `${name} never lets isFounder bypass ownership scoping`);
  }

  // Filter/widget/metric validation.
  check(/SURFACE_FILTERABLE_FIELDS/.test(savedViewSource), "Saved Views validates filter fields against the fixed per-surface allowlist");
  check(/assertWidgetCodesAuthorized/.test(dashboardLayoutSource), "Dashboard Layouts validates every widget code against the authorized widget catalogue");
  check(/z\.enum\(SUPPORTED_REPORT_METRICS\)/.test(source("lib/founder-os/schemas.ts")), "Saved Report metrics are validated against the single authoritative SUPPORTED_REPORT_METRICS list (Profit structurally excluded)");
  check(/\.strict\(\)/.test(source("lib/founder-os/schemas.ts")), "Stage 4 schemas use .strict() to reject unsupported keys");

  // Permissions — exactly one new key this Stage. Stage 5 verifier
  // review: replaced a bare `count() === 13` with a named-list check
  // (the same durable pattern already used for the Stage 3 baseline
  // above) — a bare total silently breaks the moment any later stage
  // legitimately adds its own key, which is exactly what happened twice
  // already in this engagement (Part 3A's count, and this same Stage 4
  // check's own predecessor). A named list stays correct regardless of
  // how many stages come after it.
  const stage4ExpectedPermissionKeys = [...stage3ExpectedPermissionKeys, "founder_os.workspace.manage"];
  const stage4Permissions = await prisma.salesPermission.findMany({ where: { permissionKey: { in: stage4ExpectedPermissionKeys } } });
  check(stage4Permissions.length === stage4ExpectedPermissionKeys.length, "All 13 founder_os.* permissions expected as of Stage 4 (12 prior + workspace.manage) are present", String(stage4Permissions.length));
  const workspacePermission = await prisma.salesPermission.findUnique({ where: { permissionKey: "founder_os.workspace.manage" } });
  check(Boolean(workspacePermission), "founder_os.workspace.manage is seeded");
  const founderRoleAfterStage4 = await prisma.salesRole.findUnique({ where: { name: "Founder" }, include: { permissions: { include: { permission: true } } } });
  check(Boolean(founderRoleAfterStage4 && founderRoleAfterStage4.permissions.some((g) => g.permission.permissionKey === "founder_os.workspace.manage")), "Founder role has founder_os.workspace.manage");

  // Live database checks — partial unique indexes are real (the
  // behavioral proof is the integration suite's own DB-level test; this
  // just confirms the index objects exist in the catalog).
  const partialIndexes = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename IN ('founder_saved_views', 'founder_dashboard_layouts') AND (indexname LIKE '%one_default%' OR indexname LIKE '%one_active%')`
  );
  check(Array.isArray(partialIndexes) && partialIndexes.length >= 3, "the three partial unique 'at most one default/active' indexes exist in the database", String(Array.isArray(partialIndexes) ? partialIndexes.length : 0));

  // --- Stage 5 — Founder OS Completion (architecture/performance review) checks ---

  // Architecture review: the CRITICAL-active-alert query that
  // brief-engine.ts and activity-supervision-service.ts had each
  // independently written was factored into alert-store.ts.
  check(/export function listCriticalActiveAlerts/.test(alertStoreSource), "alert-store.ts contains the single, shared CRITICAL-active-alert query implementation");
  check(/listCriticalActiveAlerts/.test(briefSource), "brief-engine.ts reuses the shared listCriticalActiveAlerts (no parallel inline query)");
  check(/listCriticalActiveAlerts/.test(activitySupervisionSource), "activity-supervision-service.ts reuses the shared listCriticalActiveAlerts (no parallel inline query)");

  // Architecture review: listBusinessAreas() was the one entry point
  // with no principal check at all.
  check(/export async function listBusinessAreas/.test(drilldownSource), "listBusinessAreas is async and can enforce a principal check (was previously a bare sync function with none)");

  // Performance review: getCompanyHealth/getExecutiveSummary no longer
  // silently double- or triple-fetch the KPI Engine within one composed
  // dashboard load.
  const companyHealthSource = source("lib/founder-os/company-health-service.ts");
  const executiveSummarySource = source("lib/founder-os/executive-summary-service.ts");
  const dashboardServiceSource = source("lib/founder-os/dashboard-service.ts");
  check(/precomputedKpis/.test(companyHealthSource), "getCompanyHealth accepts a precomputed KPI payload to avoid a redundant KPI Engine run");
  check(/precomputed\?\.kpis|precomputed\.kpis/.test(executiveSummarySource), "getExecutiveSummary accepts precomputed KPIs/Health to avoid redundant runs");
  check(/getEnterpriseKpis\(\)/.test(dashboardServiceSource) && /getCompanyHealth\(kpis\)/.test(dashboardServiceSource), "getFounderDashboard fetches KPIs once and threads them into Health/Summary rather than three independent runs");

  // Performance review: Monitoring and Decision Queue batch their
  // independent tx-scoped reads into one transaction instead of one
  // transaction per read. Counts occurrences of the transaction-opening
  // call as a structural regression guard — should any of these grow
  // back to more than one `enterpriseTransaction(` call for the reads
  // this Stage consolidated, that's exactly the pattern being guarded
  // against here.
  const monitoringTxCalls = (monitoringSource.match(/enterpriseTransaction\(/g) || []).length;
  check(monitoringTxCalls === 1, "monitoring-service.ts batches its three job-store reads into a single transaction (not three)", String(monitoringTxCalls));
  const decisionQueueTxCalls = (decisionQueueSource.match(/enterpriseTransaction\(/g) || []).length;
  check(decisionQueueTxCalls === 1, "decision-queue-service.ts batches its four tx-scoped reads into a single transaction (not four)", String(decisionQueueTxCalls));

  // createNotification (notification-center.ts) had zero production
  // callers before this Stage — only test files invoked it.
  check(/createNotification\b/.test(source("actions/founder-os.ts")), "createNotification is wired to a Server Action (was previously test-only)");

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
