const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const activeRoles = ["Founder", "Sales Manager", "Sales Officer", "Institutional Sales Officer", "Customer Support"];
const reservedRoles = ["Corporate Sales", "Key Account Manager", "Dealer Development", "Distributor Development", "Franchise Development", "Sales Operations", "Sales Analytics"];
const expected = {
  "Sales Manager": ["dashboard.team", "users.view", "leads.view_all", "leads.assign", "customers.view_all", "quotations.view", "quotations.approve_standard", "reports.view", "followups.manage", "meetings.manage", "sales_channels.view", "inquiries.view_all", "inquiries.create", "inquiries.assign", "inquiries.reassign", "inquiries.change_status", "applications.review", "timeline.view", "reports.channels", "opportunities.view_all", "opportunities.create", "opportunities.update", "opportunities.assign", "opportunities.stage_change", "opportunities.close", "opportunities.reopen", "opportunities.probability_override", "opportunities.bulk", "opportunities.export", "opportunity_activities.manage", "opportunity_tasks.manage", "reports.opportunities"],
  "Sales Officer": ["dashboard.assigned", "leads.view_assigned", "customers.view_assigned", "crm.update", "quotations.view", "quotations.create", "followups.manage", "meetings.manage", "inquiries.view_assigned", "inquiries.create", "inquiries.change_status", "timeline.view", "opportunities.view_assigned", "opportunities.create", "opportunities.update", "opportunities.stage_change", "opportunities.close", "opportunity_activities.manage", "opportunity_tasks.manage"],
  "Institutional Sales Officer": ["dashboard.institutional", "institutional.manage", "customers.view_assigned", "quotations.view", "quotations.create", "followups.manage", "meetings.manage", "inquiries.view_assigned", "inquiries.create", "inquiries.change_status", "applications.review", "timeline.view", "opportunities.view_assigned", "opportunities.create", "opportunities.update", "opportunities.stage_change", "opportunities.close", "opportunity_activities.manage", "opportunity_tasks.manage", "reports.opportunities"],
  "Customer Support": ["dashboard.support", "support.manage", "customers.view_assigned"],
};
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) process.exitCode = 1;
}
function same(a, b) {
  return b.every((permission) => a.includes(permission));
}

async function main() {
  const roles = await prisma.salesRole.findMany({
    include: { permissions: { include: { permission: true } } },
  });
  const roleMap = new Map(roles.map((role) => [role.name, role]));
  const allPermissions = await prisma.salesPermission.findMany();
  for (const name of activeRoles) check(`${name} exists and is active`, roleMap.get(name)?.active === true);
  for (const name of reservedRoles) check(`${name} remains inactive`, roleMap.get(name)?.active === false);

  const founder = roleMap.get("Founder");
  check("Founder has every database permission", !!founder && founder.permissions.length === allPermissions.length, `${founder?.permissions.length ?? 0}/${allPermissions.length}`);
  for (const [name, keys] of Object.entries(expected)) {
    const actual = roleMap.get(name)?.permissions.map((entry) => entry.permission.permissionKey) ?? [];
    check(`${name} permission matrix`, same(actual, keys), actual);
  }

  const admin = await prisma.user.findUnique({ where: { email: "admin@muv.co.in" }, include: { salesRole: true } });
  check("Existing admin is Founder", admin?.salesRole?.name === "Founder" && admin.active, admin?.salesRole?.name);

  const coreCounts = {};
  for (const table of ["categories", "customers", "orders", "products", "users"]) {
    const [row] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    coreCounts[table] = row.count;
  }
  check("Existing production data remains present", coreCounts.categories >= 6 && coreCounts.customers >= 4 && coreCounts.orders >= 12 && coreCounts.products >= 13 && coreCounts.users >= 5, coreCounts);

  await prisma.$transaction(async (tx) => {
    const suffix = Date.now().toString();
    const root = await tx.territory.create({ data: { name: `Verify Root ${suffix}`, code: `VR${suffix}` } });
    const child = await tx.territory.create({ data: { name: `Verify Child ${suffix}`, code: `VC${suffix}`, parentTerritoryId: root.id } });
    const manager = await tx.user.create({ data: { email: `verify-manager-${suffix}@example.invalid`, name: "Verify Manager", role: "STAFF", salesRoleId: roleMap.get("Sales Manager").id, territoryId: root.id } });
    await tx.user.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ email: `verify-officer-${suffix}-${String(i).padStart(2, "0")}@example.invalid`, name: `Verify Officer ${String(i).padStart(2, "0")}`, role: "STAFF", salesRoleId: roleMap.get("Sales Officer").id, territoryId: child.id, reportingManagerId: manager.id })) });
    const loadedChild = await tx.territory.findUnique({ where: { id: child.id }, include: { parent: true } });
    check("Territory parent-child hierarchy", loadedChild?.parent?.id === root.id);
    const reports = await tx.user.findMany({ where: { reportingManagerId: manager.id } });
    check("Reporting-manager relationship", reports.length === 25 && reports.every((user) => user.territoryId === child.id), `${reports.length} reports`);
    const search = await tx.user.findMany({ where: { salesRoleId: { not: null }, name: { contains: "Verify Officer", mode: "insensitive" } }, orderBy: { name: "asc" }, skip: 20, take: 20 });
    check("Organization search and pagination query", search.length === 5 && search[0].name === "Verify Officer 20", search.map((user) => user.name));
    throw new Error("ROLLBACK_VERIFICATION_FIXTURES");
  }).catch((error) => {
    if (error.message !== "ROLLBACK_VERIFICATION_FIXTURES") throw error;
  });

  const audit = await prisma.salesAuditLog.create({ data: { userId: admin?.id, module: "verification", action: "IMMUTABILITY_TEST", recordType: "SalesAuditLog" } });
  let updateRejected = false;
  let deleteRejected = false;
  try { await prisma.$executeRawUnsafe(`UPDATE "sales_audit_logs" SET "action" = 'TAMPERED' WHERE "id" = '${audit.id}'`); } catch (error) { updateRejected = String(error).includes("immutable"); }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "sales_audit_logs" WHERE "id" = '${audit.id}'`); } catch (error) { deleteRejected = String(error).includes("immutable"); }
  const retained = await prisma.salesAuditLog.findUnique({ where: { id: audit.id } });
  check("Direct audit UPDATE is rejected", updateRejected);
  check("Direct audit DELETE is rejected", deleteRejected);
  check("Audit record remains unchanged", retained?.action === "IMMUTABILITY_TEST");

  const extensionSource = fs.readFileSync(path.join(process.cwd(), "lib/sales/extensions.ts"), "utf8");
  check("MUV AI is placeholder-only", extensionSource.includes('"muv-ai"') && extensionSource.includes("enabled: false") && !/generate|inference|completion|chat/i.test(extensionSource));
  const navigationSource = fs.readFileSync(path.join(process.cwd(), "lib/sales/navigation.ts"), "utf8");
  check("Navigation is server-generated from database permissions", navigationSource.includes("getSalesPrincipal") && navigationSource.includes("principal.permissions.has"));
  const actionSource = fs.readFileSync(path.join(process.cwd(), "actions/sales-organization.ts"), "utf8");
  check("Organization actions enforce server-side permissions", (actionSource.match(/requirePermission\(/g) ?? []).length === 4);
  check("Organization actions return standardized access-denied responses", (actionSource.match(/toErrorResponse\(error\)/g) ?? []).length === 4);
  check("Organization mutations append audit records", (actionSource.match(/appendAuditLog\(/g) ?? []).length === 4);
  const loginAudit = await prisma.salesAuditLog.count({ where: { userId: admin?.id, module: "auth", action: "LOGIN" } });
  check("Successful login generated an audit record", loginAudit > 0, `${loginAudit} login event(s)`);

  console.log(JSON.stringify({ passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
