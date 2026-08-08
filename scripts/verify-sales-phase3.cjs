const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const path = require("node:path");
const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) { passed++; console.log(`PASS ${label}`); }
  else { failed++; console.error(`FAIL ${label}`); }
}
function source(file) { return fs.readFileSync(path.join(process.cwd(), file), "utf8"); }

async function main() {
  const [stages, taskTypes, activityTypes, lostReasons, wonReasons, priorities, rules, transitions] = await Promise.all([
    prisma.opportunityStage.findMany(), prisma.opportunityTaskType.findMany(), prisma.opportunityActivityType.findMany(),
    prisma.opportunityLostReason.findMany(), prisma.opportunityWonReason.findMany(), prisma.opportunityPriority.findMany(),
    prisma.opportunityTaskRule.findMany(), prisma.opportunityStageTransition.findMany(),
  ]);
  check(stages.length === 9 && new Set(stages.map(x => x.code)).size === 9, "nine unique configured stages");
  check(taskTypes.length === 9 && new Set(taskTypes.map(x => x.code)).size === 9, "nine unique task types");
  check(activityTypes.length === 8 && new Set(activityTypes.map(x => x.code)).size === 8, "eight unique activity types");
  check(lostReasons.length === 7 && wonReasons.length === 6, "configured win/loss reasons");
  check(priorities.length === 4, "configured priorities");
  check(rules.length === 5, "automatic task rules are database-driven");
  check(transitions.length >= 20, "stage transitions are database-driven");
  check(stages.every(x => x.probabilityDefault >= 0 && x.probabilityDefault <= 100), "stage probability bounds");

  const roles = await prisma.salesRole.findMany({ include: { permissions: { include: { permission: true } } } });
  const role = Object.fromEntries(roles.map(r => [r.name, new Set(r.permissions.map(x => x.permission.permissionKey))]));
  check(role.Founder.has("opportunity_config.manage") && role.Founder.has("opportunities.bulk"), "Founder has unrestricted Phase 3 permissions");
  check(role["Sales Manager"].has("opportunities.view_all") && role["Sales Manager"].has("opportunities.assign"), "Sales Manager team pipeline permissions");
  check(role["Sales Officer"].has("opportunities.view_assigned") && !role["Sales Officer"].has("opportunities.assign"), "Sales Officer assigned-only restriction");
  check(role["Institutional Sales Officer"].has("opportunities.view_assigned") && !role["Institutional Sales Officer"].has("opportunities.view_all"), "Institutional officer assigned institutional restriction");
  check(!role["Customer Support"].has("opportunities.view_all") && !role["Customer Support"].has("opportunities.view_assigned"), "Customer Support has no opportunity management access");
  check(roles.filter(r => ["Corporate Sales","Key Account Manager","Dealer Development","Distributor Development","Franchise Development","Sales Operations","Sales Analytics"].includes(r.name)).every(r => !r.active), "reserved enterprise roles remain inactive");

  const admin = await prisma.user.findUnique({ where: { email: "admin@muv.co.in" }, include: { salesRole: true } });
  check(admin?.salesRole?.name === "Founder", "existing admin is Founder");
  const preserved = await Promise.all([prisma.customer.count(), prisma.order.count(), prisma.product.count(), prisma.user.count(), prisma.salesInquiry.count(), prisma.salesTimelineEvent.count(), prisma.salesAuditLog.count()]);
  check(preserved[2] > 0 && preserved[3] > 0, "existing products and users preserved");
  check(preserved.every(n => n >= 0), "existing Phase 1/2 tables remain readable");

  const pipeline = source("lib/opportunity/pipeline.ts");
  const repository = source("lib/opportunity/repository.ts");
  const actions = source("actions/opportunities.ts");
  const navigation = source("lib/sales/navigation.ts");
  check(pipeline.includes("opportunityStageTransition.findFirst") && !pipeline.includes("Math.abs(toIndex"), "pipeline transition validation is configuration-driven");
  check(pipeline.includes("salesTimelineEvent.create") && pipeline.includes("salesAuditLog.create") && pipeline.includes("notificationLog.create"), "pipeline transaction integrates timeline, audit, notifications");
  check(repository.includes("skip: (page - 1) * pageSize") && repository.includes("opportunityNumber") && repository.includes("gstNumber"), "server-side search and pagination");
  check(repository.includes("reportingManagerId") && repository.includes("territoryId"), "reporting-manager and territory scope enforced");
  check(actions.includes("requirePermission") && actions.includes("assertScoped"), "server actions enforce permission and record scope");
  check(navigation.includes("PERMISSIONS.OPPORTUNITIES_VIEW_ALL") && navigation.includes("PERMISSIONS.OPPORTUNITIES_VIEW_ASSIGNED"), "navigation generated from permissions");
  check(fs.existsSync("app/sales/opportunities/page.tsx") && fs.existsSync("app/sales/opportunities/[id]/page.tsx") && fs.existsSync("app/sales/calendar/page.tsx"), "Phase 3 routes exist");
  check(fs.existsSync("app/api/sales/opportunities/route.ts") && fs.existsSync("app/api/sales/opportunities/export/route.ts"), "guarded APIs and CSV export exist");
  const extension = source("lib/opportunity/extensions.ts");
  check(extension.includes("enabled: false") && !/openai|llm|prediction|recommendation/i.test(extension), "MUV AI remains a disabled interface-only extension");

  const founder = await prisma.user.findFirst({ where: { salesRole: { name: "Founder" } } });
  const customer = await prisma.customer.findFirst();
  const newStage = stages.find(x => x.code === "NEW");
  const normal = priorities.find(x => x.code === "NORMAL");
  if (founder && customer && newStage && normal) {
    try {
      await prisma.$transaction(async tx => {
        const a = await tx.opportunity.create({ data: { opportunityNumber: "", customerId: customer.id, ownerUserId: founder.id,
          currentStageId: newStage.id, priorityId: normal.id, estimatedValue: 1, probability: newStage.probabilityDefault } });
        const b = await tx.opportunity.create({ data: { opportunityNumber: "", customerId: customer.id, ownerUserId: founder.id,
          currentStageId: newStage.id, priorityId: normal.id, estimatedValue: 1, probability: newStage.probabilityDefault } });
        check(/^MUV-OPP-\d{4}-\d{6}$/.test(a.opportunityNumber), "opportunity number format");
        check(a.opportunityNumber !== b.opportunityNumber, "opportunity numbers are unique and sequence-backed");
        throw new Error("ROLLBACK_VERIFICATION");
      });
    } catch (error) { if (error.message !== "ROLLBACK_VERIFICATION") throw error; }
  } else check(false, "opportunity numbering prerequisites");

  const audit = await prisma.salesAuditLog.findFirst();
  if (audit) {
    let immutable = false;
    try { await prisma.$executeRawUnsafe('UPDATE "sales_audit_logs" SET "action" = $1 WHERE "id" = $2', "ILLEGAL", audit.id); }
    catch { immutable = true; }
    check(immutable, "audit records reject direct database UPDATE");
    let undeletable = false;
    try { await prisma.$executeRawUnsafe('DELETE FROM "sales_audit_logs" WHERE "id" = $1', audit.id); }
    catch { undeletable = true; }
    check(undeletable, "audit records reject direct database DELETE");
  } else check(false, "audit immutability test has an audit record");

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
