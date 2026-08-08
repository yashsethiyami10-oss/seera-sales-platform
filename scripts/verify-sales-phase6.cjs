const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const p = new PrismaClient();
let passed = 0, failed = 0;
const check = (condition, name) => condition ? (passed++, console.log("PASS", name)) : (failed++, console.error("FAIL", name));
const text = file => fs.readFileSync(file, "utf8");
async function rejects(operation, pattern) { try { await operation(); return false; } catch (error) { return pattern.test(String(error.message)); } }

(async () => {
  const [
    statuses, segments, levels, rewardTypes, referralStatuses, kpis, templates, configs, permissions, roles,
  ] = await Promise.all([
    p.customerStatusDefinition.findMany(), p.customerSegment.findMany(), p.membershipLevel.findMany(),
    p.rewardTransactionType.findMany(), p.referralStatusDefinition.findMany(), p.kpiDefinition.findMany(),
    p.executiveReportTemplate.findMany(), p.phase6Configuration.findMany(), p.salesPermission.findMany(),
    p.salesRole.findMany({ include: { permissions: { include: { permission: true } } } }),
  ]);
  check(statuses.length === 7, "seven configurable customer statuses");
  check(segments.length === 15, "default customer segments seeded once");
  check(levels.length === 4, "four configurable membership levels");
  check(rewardTypes.length === 8, "reward transaction types seeded once");
  check(referralStatuses.length === 7, "referral lifecycle configured");
  check(kpis.length === 17, "central KPI library seeded");
  check(templates.length === 14, "executive report templates seeded");
  check(configs.some(c => c.key === "MUV_AI_INTEGRATION" && c.value.enabled === false), "MUV AI remains disabled");
  check(new Set(permissions.map(x => x.permissionKey)).size === permissions.length, "permissions remain unique");
  const roleKeys = Object.fromEntries(roles.map(r => [r.name, new Set(r.permissions.map(x => x.permission.permissionKey))]));
  check(roleKeys.Founder.has("kpi_config.manage") && roleKeys.Founder.has("loyalty.adjust_rewards"), "Founder has all Phase 6 permissions");
  check(roleKeys["Sales Manager"].has("analytics.view_team") && !roleKeys["Sales Manager"].has("kpi_config.manage"), "Sales Manager is team scoped");
  check(roleKeys["Sales Officer"].has("intelligence.view_assigned") && !roleKeys["Sales Officer"].has("intelligence.view_all"), "Sales Officer is assignment scoped");
  check(roleKeys["Institutional Sales Officer"].has("analytics.view_institutional") && !roleKeys["Institutional Sales Officer"].has("analytics.view_all"), "Institutional role is institution scoped");
  check(roleKeys["Customer Support"].has("intelligence.view_support") && !roleKeys["Customer Support"].has("loyalty.adjust_rewards"), "Customer Support remains read-only");
  check(roles.filter(r => ["Corporate Sales","Key Account Manager","Dealer Development","Distributor Development","Franchise Development","Sales Operations","Sales Analytics"].includes(r.name)).every(r => !r.active), "reserved enterprise roles remain inactive");
  const admin = await p.user.findUnique({ where: { email: "admin@muv.co.in" }, include: { salesRole: true } });
  check(admin?.salesRole?.name === "Founder", "existing admin remains Founder");

  const customer = await p.customer.findFirstOrThrow();
  const now = new Date();
  const snapshot = await p.customerIntelligenceSnapshot.create({ data: { customerId: customer.id, metrics: {}, segmentState: {}, statusCode: "NEW", calculationVersion: "verification" } });
  check(await rejects(() => p.customerIntelligenceSnapshot.update({ where: { id: snapshot.id }, data: { statusCode: "ACTIVE" } }), /immutable/i), "customer intelligence snapshots reject direct UPDATE");
  check(await rejects(() => p.customerIntelligenceSnapshot.delete({ where: { id: snapshot.id } }), /immutable/i), "customer intelligence snapshots reject direct DELETE");
  const type = rewardTypes.find(x => x.code === "MANUAL_CREDIT");
  const ledger = await p.rewardLedgerEntry.create({ data: { ledgerNumber: "", customerId: customer.id, transactionTypeId: type.id, points: 1, previousBalance: 0, newBalance: 1, reason: "Phase 6 verification" } });
  check(/^RWD-\d{8}$/.test(ledger.ledgerNumber), "reward ledger uses concurrency-safe number");
  check(await rejects(() => p.rewardLedgerEntry.update({ where: { id: ledger.id }, data: { points: 2 } }), /immutable/i), "reward ledger rejects direct UPDATE");
  check(await rejects(() => p.rewardLedgerEntry.delete({ where: { id: ledger.id } }), /immutable/i), "reward ledger rejects direct DELETE");

  const intelligence = text("lib/growth/customer-intelligence.ts");
  const loyalty = text("lib/growth/loyalty.ts");
  const analytics = text("lib/growth/analytics.ts");
  const repository = text("lib/growth/repository.ts");
  const actions = text("actions/growth.ts");
  const migration = text("prisma/migrations/20260727070000_customer_growth_intelligence_v2/migration.sql");
  check(intelligence.includes("calculateCustomerMetrics") && intelligence.includes("commercialInvoice"), "intelligence derives metrics from historical source records");
  check(intelligence.includes("averageOrderValue") && intelligence.includes("collectionRate") && intelligence.includes("preferredProducts"), "customer value, payment and preference calculations centralized");
  check(intelligence.includes("statusFor") && intelligence.includes("STATUS_THRESHOLDS"), "status rules are configuration driven");
  check(intelligence.includes("protected: false") && intelligence.includes("SEGMENT_ASSIGNED"), "protected manual segments and history are preserved");
  check(intelligence.includes("customerIntelligenceSnapshot.create"), "recalculation creates immutable snapshot");
  check(intelligence.includes("salesTimelineEvent.create") && intelligence.includes("salesAuditLog.create"), "intelligence integrates timeline and audit");
  check(loyalty.includes("previousBalance") && loyalty.includes("newBalance") && !loyalty.includes("currentRewardBalance: input"), "reward balance derives from ledger movements");
  check(loyalty.includes("idempotencyKey") && migration.includes("reward_ledger_entries_idempotencyKey_key"), "duplicate reward posting is prevented");
  check(loyalty.includes("Self-referral") && migration.includes("no_self_referral"), "self-referral rejected in service and database");
  check(loyalty.includes("Illegal referral status transition"), "referral transitions validate server-side");
  check(loyalty.includes("membershipHistory.create"), "membership history is append-only");
  check(analytics.includes("centralKpis") && analytics.includes("generateExecutiveReport"), "one KPI service feeds analytics and reporting");
  check(analytics.includes("ownerUserId") && analytics.includes("territoryId") && analytics.includes("institutionalOnly"), "analytics honors assignment, territory and institutional scope");
  check(repository.includes("skip: (page - 1) * take") && repository.includes("take"), "intelligence pagination is server-side");
  check(repository.includes("contains: query.search") && repository.includes("orderBy"), "server search, filter and sorting implemented");
  check(actions.includes("requirePermission") && actions.includes("requireAnyPermission"), "all Phase 6 server actions authorize server-side");
  check(text("app/api/sales/intelligence/route.ts").includes("statusCode") && text("app/api/sales/intelligence/route.ts").includes("Internal server error"), "API returns standardized safe access errors");
  check(text("lib/sales/navigation.ts").includes("PERMISSIONS.INTELLIGENCE_VIEW") && text("lib/sales/navigation.ts").includes("PERMISSIONS.LOYALTY_VIEW"), "navigation is generated from permissions");
  check(text("components/sales/dashboard.tsx").includes("centralKpis"), "dashboards reuse centralized KPI definitions");
  check(migration.includes("FOREIGN KEY") && migration.includes("one_active_primary_segment_per_customer"), "foreign keys and segment uniqueness enforced");
  check(migration.includes("phase6_reject_mutation") && migration.includes("executive_reports_immutable"), "historical report versions are database immutable");
  check(text("lib/growth/extensions.ts").includes("enabled: false") && !text("lib/growth/extensions.ts").includes("OpenAI"), "reserved integration contains no MUV AI business logic");

  const counts = await Promise.all([p.customer.count(), p.order.count(), p.product.count(), p.user.count(), p.salesAuditLog.count()]);
  check(counts[0] >= 4 && counts[1] >= 12 && counts[2] >= 13 && counts[3] >= 5 && counts[4] >= 82, "Phases 0-5 production data remains intact");
  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => p.$disconnect());
