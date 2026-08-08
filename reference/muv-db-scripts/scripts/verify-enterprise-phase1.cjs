const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "..");
const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function check(condition, name, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function source(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

async function expectImmutable(name, table, createSql, updateSql, deleteSql) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(createSql);
      await tx.$executeRawUnsafe(updateSql);
    });
    check(false, `${name} update rejected`);
  } catch {
    check(true, `${name} update rejected`);
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(createSql);
      await tx.$executeRawUnsafe(deleteSql);
    });
    check(false, `${name} delete rejected`);
  } catch {
    check(true, `${name} delete rejected`);
  }
}

async function main() {
  const schema = source("prisma/schema.prisma");
  const migration = source("prisma/migrations/20260727100000_enterprise_operations_v3_phase1/migration.sql");
  const context = source("lib/enterprise/context.ts");
  const governance = source("lib/enterprise/governance.ts");
  const services = [
    "lib/enterprise/vendor-service.ts", "lib/enterprise/procurement-service.ts",
    "lib/enterprise/operations-services.ts", "lib/enterprise/warehouse-service.ts",
    "lib/enterprise/planning-reporting.ts",
  ].map(source).join("\n");
  const ai = source("lib/enterprise/ai-adapter.ts");
  const actions = source("actions/enterprise.ts");
  const api = [
    "app/api/enterprise/vendors/route.ts", "app/api/enterprise/requisitions/route.ts",
    "app/api/enterprise/search/route.ts", "app/api/enterprise/reports/route.ts",
  ].map(source).join("\n");

  const requiredModels = [
    "EnterpriseSequence", "EnterpriseVendor", "EnterpriseVendorContact", "EnterpriseVendorDocument",
    "EnterprisePurchaseRequisition", "EnterprisePurchaseRequisitionItem", "EnterpriseRfq", "EnterpriseRfqVendor",
    "EnterpriseVendorQuotation", "EnterpriseVendorQuotationItem", "EnterprisePurchaseOrder",
    "EnterprisePurchaseOrderItem", "EnterpriseGoodsReceipt", "EnterpriseGoodsReceiptItem",
    "EnterpriseFormula", "EnterpriseFormulaRevision", "EnterpriseFormulaIngredient",
    "EnterpriseFormulaPackaging", "EnterpriseMachine", "EnterpriseWorkCenter", "EnterpriseProductionLine",
    "EnterpriseProductionPlan", "EnterpriseProductionOrder", "EnterpriseMaterialAllocation", "EnterpriseBatch",
    "EnterpriseBatchLot", "EnterpriseBatchStatusHistory", "EnterpriseQualityParameter", "EnterpriseInspection",
    "EnterpriseInspectionResult", "EnterpriseQualityDecision", "EnterpriseWarehouseZone",
    "EnterpriseWarehouseBin", "EnterpriseWarehouseMovement", "EnterpriseDemandPlan",
    "EnterpriseDemandPlanItem", "EnterprisePlanningSnapshot",
  ];
  for (const model of requiredModels) check(schema.includes(`model ${model} `), `schema model ${model}`);
  check(!/\bDROP\s+(TABLE|COLUMN)\b/i.test(migration), "migration contains no destructive table/column drop");
  check(migration.includes("reject_enterprise_immutable_change"), "database immutability function installed");
  check((migration.match(/CREATE TRIGGER enterprise_/g) || []).length >= 6, "six operational immutability triggers installed");
  check(context.includes("ENTERPRISE_ORGANIZATION = \"MUV\""), "trusted organization context is server-defined");
  check(context.includes("Cross-organization access denied"), "cross-organization references are rejected");
  check(context.includes("Enterprise Operations module is disabled"), "feature flags gate service access");
  check(governance.includes("TransactionIsolationLevel.Serializable"), "mutations use serializable transactions");
  check(governance.includes("salesTimelineEvent.create"), "shared timeline is reused");
  check(governance.includes("salesAuditLog.create"), "shared immutable audit is reused");
  check(governance.includes("notificationLog.create"), "shared notification framework is reused");
  check(services.includes("nextEnterpriseNumber"), "human-readable numbers are service generated");
  check(services.includes("requireVersion"), "optimistic concurrency checks are present");
  check(services.includes("organizationKey: principal.organizationKey"), "service persistence is organization scoped");
  check(services.includes("stockLedgerEntry.create"), "warehouse operations reuse authoritative stock ledger");
  check(actions.includes("createVendor(input)") && actions.includes("createPurchaseRequisition(input)"), "Server Actions call Business Services");
  check(!actions.includes("prisma."), "Server Actions contain no direct database writes");
  check(api.includes("createVendor(await request.json())") && api.includes("createPurchaseRequisition(await request.json())"), "API mutations call Business Services");
  check(!/prisma\.enterprise[A-Z]\w*\.(create|update|delete|upsert)\s*\(/.test(api), "API routes contain no direct operational mutation");
  check(ai.includes("Advisory boundary only"), "Enterprise AI adapter is advisory");
  check(!/\b(create|update|delete|upsert)\s*\(/.test(ai), "Enterprise AI adapter exposes no mutation");

  const enterprisePermissions = await prisma.salesPermission.findMany({ where: { permissionKey: { startsWith: "enterprise." } } });
  check(enterprisePermissions.length === 48, "48 Enterprise permissions seeded", String(enterprisePermissions.length));
  const founder = await prisma.salesRole.findUnique({ where: { name: "Founder" }, include: { permissions: { include: { permission: true } } } });
  check(founder && enterprisePermissions.every((permission) => founder.permissions.some((grant) => grant.permission.permissionKey === permission.permissionKey)), "Founder has every Enterprise permission");
  for (const roleName of ["Procurement Manager", "Production Manager", "Quality Manager", "Warehouse Manager", "System Administrator"]) {
    const role = await prisma.salesRole.findUnique({ where: { name: roleName }, include: { permissions: { include: { permission: true } } } });
    check(Boolean(role?.active), `${roleName} role is active`);
    check(Boolean(role?.permissions.some((grant) => grant.permission.permissionKey.startsWith("enterprise."))), `${roleName} has scoped Enterprise grants`);
  }
  for (const roleName of ["Sales Manager", "Sales Officer", "Institutional Sales Officer", "Customer Support"]) {
    const role = await prisma.salesRole.findUnique({ where: { name: roleName }, include: { permissions: { include: { permission: true } } } });
    check(!role?.permissions.some((grant) => grant.permission.permissionKey.startsWith("enterprise.")), `${roleName} received no Enterprise grants`);
  }
  const phase1FlagKeys = [
    "ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_VENDOR_ENABLED",
    "ENTERPRISE_PROCUREMENT_ENABLED", "ENTERPRISE_MANUFACTURING_ENABLED",
    "ENTERPRISE_FORMULA_BOM_ENABLED", "ENTERPRISE_BATCH_ENABLED",
    "ENTERPRISE_QUALITY_ENABLED", "ENTERPRISE_WAREHOUSE_ENABLED",
    "ENTERPRISE_PLANNING_ENABLED", "ENTERPRISE_REPORTING_ENABLED",
    "ENTERPRISE_AI_EXTENSIONS_ENABLED",
  ];
  const flags = await prisma.aiConfiguration.findMany({ where: { organizationKey: "MUV", key: { in: phase1FlagKeys }, category: "FEATURE_FLAG" } });
  check(flags.length === 11, "11 Enterprise feature flags seeded", String(flags.length));
  check(flags.every((flag) => !(flag.value || {}).enabled), "Enterprise feature flags default disabled");
  const tools = await prisma.aiToolDefinition.findMany({ where: { code: { startsWith: "ENTERPRISE_" } } });
  check(tools.length === 6, "six Enterprise advisory AI tools seeded");
  check(tools.every((tool) => tool.category === "ENTERPRISE_READ" && tool.featureFlag === "ENTERPRISE_AI_EXTENSIONS_ENABLED"), "AI tools are read-only and feature gated");

  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const snapshotId = `test_snapshot_${suffix}`;
  const snapshotCreate = `INSERT INTO "enterprise_planning_snapshots" ("id","organizationKey","snapshotNumber","snapshotType","snapshotAt","inputReferences","demandQuantities","availableInventory","reservedInventory","incomingSupply","requiredMaterials","recommendedProcurement","recommendedProduction","policyReferences","calculationVersion","createdById","createdAt") VALUES ('${snapshotId}','MUV','TEST-${suffix}','TEST',NOW(),'{}','{}','{}','{}','{}','{}','{}','{}','{}','TEST','test',NOW())`;
  await expectImmutable("planning snapshot", "enterprise_planning_snapshots", snapshotCreate, `UPDATE "enterprise_planning_snapshots" SET "snapshotType"='CHANGED' WHERE "id"='${snapshotId}'`, `DELETE FROM "enterprise_planning_snapshots" WHERE "id"='${snapshotId}'`);

  const movementId = `test_movement_${suffix}`;
  const movementCreate = `INSERT INTO "enterprise_warehouse_movements" ("id","organizationKey","movementNumber","movementType","variantId","quantity","unitOfMeasure","businessReferenceType","businessReferenceId","actorId","correlationId","createdAt") SELECT '${movementId}','MUV','TEST-WM-${suffix}','PUTAWAY',pv.id,1,'EA','TEST','${suffix}',u.id,'${suffix}',NOW() FROM "product_variants" pv CROSS JOIN "users" u LIMIT 1`;
  await expectImmutable("warehouse movement", "enterprise_warehouse_movements", movementCreate, `UPDATE "enterprise_warehouse_movements" SET "quantity"=2 WHERE "id"='${movementId}'`, `DELETE FROM "enterprise_warehouse_movements" WHERE "id"='${movementId}'`);

  const migrationRows = await prisma.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = '20260727100000_enterprise_operations_v3_phase1'`;
  check(migrationRows.length === 1 && migrationRows[0].finished_at, "Enterprise migration recorded as applied");

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
