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

async function main() {
  const schema = source("prisma/schema.prisma");
  const migration = source("prisma/migrations/20260727120000_enterprise_phase2_part3a_foundations/migration.sql");
  const foundation = source("lib/enterprise-phase2/foundation.ts");
  const adapters = source("lib/enterprise-phase2/adapters.ts");
  for (const model of ["Phase2Operation", "Phase2PolicyVersion", "Phase2SourceReference", "Phase2SodPolicy"]) {
    check(schema.includes(`model ${model} `), `schema contains ${model}`);
  }
  check(!/\bDROP\s+(TABLE|COLUMN)\b/i.test(migration), "migration is additive");
  check(migration.includes("phase2_source_reference_no_update"), "provenance update trigger exists");
  check(migration.includes("phase2_source_reference_no_delete"), "provenance delete trigger exists");
  check(migration.includes("phase2_policy_finalized_no_update"), "finalized policy update protection exists");
  check(foundation.includes("requireOrganization(principal"), "service records use trusted organization checks");
  check(foundation.includes("ON CONFLICT") && foundation.includes("DO NOTHING"), "duplicate operations use non-aborting database conflict handling");
  check(foundation.includes("completeOperation") && foundation.includes("failOperation") && foundation.includes("retryOperation"), "operation lifecycle supports completion, failure, and retry");
  check(foundation.includes("phase2SodPolicy.findUnique") && foundation.includes("Independent approval evidence is required"), "SoD enforcement loads policy and verifies approval evidence");
  check(foundation.includes("recordEnterpriseMutation"), "shared audit/timeline/notification mutation evidence is reused");
  check(adapters.includes("PHASE2_WORKFLOW_SUBJECTS"), "workflow adapter is allowlisted");
  check(adapters.includes("PHASE2_NOTIFICATION_EVENTS"), "notification adapter is allowlisted");

  const phase2Permissions = await prisma.salesPermission.findMany({
    where: { OR: [
      { permissionKey: { startsWith: "network." } },
      { permissionKey: { startsWith: "finance." } },
      { permissionKey: { startsWith: "founder_os." } },
    ] },
  });
  // Was 43 before Part 3D Stage 1 added 3 new founder_os.* permissions
  // (notifications.view/manage, widgets.manage) to the same
  // pre-provisioned founder_os namespace this check already counted, then
  // 46 before Part 3D Stage 4 added 1 more (founder_os.workspace.manage) —
  // no network.*/finance.* permission changed either time; each bump is a
  // legitimate count update, not a Part 3A behavior change.
  check(phase2Permissions.length === 47, "47 Phase 2 permissions seeded", String(phase2Permissions.length));
  const founder = await prisma.salesRole.findUnique({
    where: { name: "Founder" },
    include: { permissions: { include: { permission: true } } },
  });
  check(Boolean(founder && phase2Permissions.every((permission) =>
    founder.permissions.some((grant) => grant.permission.permissionKey === permission.permissionKey))),
  "Founder receives Phase 2 permissions");
  for (const roleName of ["Sales Manager", "Sales Officer", "Institutional Sales Officer", "Customer Support"]) {
    const role = await prisma.salesRole.findUnique({
      where: { name: roleName },
      include: { permissions: { include: { permission: true } } },
    });
    check(!role?.permissions.some((grant) =>
      /^(network|finance|founder_os)\./.test(grant.permission.permissionKey)),
    `${roleName} receives no Phase 2 grants`);
  }
  const flagKeys = [
    "ENTERPRISE_BUSINESS_NETWORK_ENABLED", "ENTERPRISE_PARTNER_PORTAL_ENABLED",
    "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED",
    "ENTERPRISE_BANKING_RECONCILIATION_ENABLED", "ENTERPRISE_TAX_COMPLIANCE_ENABLED",
    "ENTERPRISE_FINANCIAL_REPORTING_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED",
    "ENTERPRISE_FOUNDER_AI_INTELLIGENCE_ENABLED",
  ];
  const flags = await prisma.aiConfiguration.findMany({
    where: { organizationKey: "MUV", key: { in: flagKeys }, category: "FEATURE_FLAG" },
  });
  check(flags.length === 9, "nine Phase 2 feature flags seeded", String(flags.length));
  check(flags.every((flag) => !flag.value.enabled), "all Phase 2 feature flags disabled");

  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await expectRejected("direct provenance update is database-rejected", async (tx) => {
    const row = await tx.phase2SourceReference.create({ data: {
      organizationKey: "MUV", targetEntityType: "TEST", targetEntityId: suffix,
      sourceDomain: "TEST", sourceEntityType: "TEST", sourceEntityId: suffix,
    } });
    await tx.$executeRawUnsafe(`UPDATE "phase2_source_references" SET "processingStatus"='CHANGED' WHERE "id"='${row.id}'`);
  });
  await expectRejected("direct provenance delete is database-rejected", async (tx) => {
    const row = await tx.phase2SourceReference.create({ data: {
      organizationKey: "MUV", targetEntityType: "TEST", targetEntityId: `${suffix}_delete`,
      sourceDomain: "TEST", sourceEntityType: "TEST", sourceEntityId: `${suffix}_delete`,
    } });
    await tx.$executeRawUnsafe(`DELETE FROM "phase2_source_references" WHERE "id"='${row.id}'`);
  });
  await expectRejected("direct finalized-policy update is database-rejected", async (tx) => {
    const row = await tx.phase2PolicyVersion.create({ data: {
      organizationKey: "MUV", policyType: "TEST", policyKey: suffix, version: 1,
      status: "FINALIZED", effectiveFrom: new Date(), createdById: "verification",
    } });
    await tx.$executeRawUnsafe(`UPDATE "phase2_policy_versions" SET "status"='DRAFT' WHERE "id"='${row.id}'`);
  });
  await expectRejected("direct finalized-policy delete is database-rejected", async (tx) => {
    const row = await tx.phase2PolicyVersion.create({ data: {
      organizationKey: "MUV", policyType: "TEST", policyKey: `${suffix}_delete`, version: 1,
      status: "FINALIZED", effectiveFrom: new Date(), createdById: "verification",
    } });
    await tx.$executeRawUnsafe(`DELETE FROM "phase2_policy_versions" WHERE "id"='${row.id}'`);
  });
  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
