import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { MODULES, type ModuleId } from "../lib/platform/module-registry";
import { PUBLIC_INTERFACES, PERMISSION_CLEANUP_REVIEW, DEAD_CODE_REVIEW, TECHNICAL_DEBT } from "../lib/platform/module-validation";

/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 3.
 * Permanent governance + regression verification suite.
 *
 * Same static-analysis-only philosophy as Block 1/2's suites — no
 * database, no live server. Verifies the concrete claims made in this
 * Block's own report: Shared Platform Core isolation (Part A), the
 * security-anti-pattern fix (Part B), Founder OS visibility (Part C),
 * the two approved business integrations plus the one that must stay
 * manual (Part D), and that Block 1/2's frozen facts still hold.
 *
 * Run: `npx tsx scripts/verify-sales-os-block3.ts` (or
 * `npm run verify:sales-os-block3`).
 */

const ROOT = join(__dirname, "..");
let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string, extra?: unknown) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
};

function readSource(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

// ---------------------------------------------------------------------
// Part A — Shared Platform Core isolation
// ---------------------------------------------------------------------
function checkSharedPlatformCoreIsolation() {
  const canonicalFiles = [
    "lib/platform-core/authorization.ts", "lib/platform-core/constants.ts",
    "lib/platform-core/audit.ts", "lib/platform-core/context.ts", "lib/platform-core/governance.ts",
  ];
  for (const f of canonicalFiles) {
    check(existsSync(join(ROOT, f)), `shared platform core: canonical file exists at its new home: ${f}`);
  }

  const shims: [string, string][] = [
    ["lib/sales/authorization.ts", "@/lib/platform-core/authorization"],
    ["lib/sales/constants.ts", "@/lib/platform-core/constants"],
    ["lib/sales/audit.ts", "@/lib/platform-core/audit"],
    ["lib/enterprise/context.ts", "@/lib/platform-core/context"],
    ["lib/enterprise/governance.ts", "@/lib/platform-core/governance"],
  ];
  for (const [shimPath, target] of shims) {
    const source = readSource(shimPath);
    check(source.includes(`export * from "${target}"`), `shared platform core: ${shimPath} is a re-export shim over ${target}`);
  }

  const authSource = readSource("lib/platform-core/authorization.ts");
  for (const fn of ["principalHasPermission", "principalHasAnyPermission", "principalHasAllPermissions", "getSalesPrincipal", "requirePermission", "requireAnyPermission", "hasPermission"]) {
    check(authSource.includes(fn), `shared platform core: lib/platform-core/authorization.ts still exports/defines ${fn}`);
  }
}

// ---------------------------------------------------------------------
// Part B — Security: the hand-rolled permission check anti-pattern is gone
// ---------------------------------------------------------------------
function checkSecurityCentralization() {
  const securitySource = readSource("lib/muv-ai/security.ts");
  check(
    securitySource.includes("principalHasPermission") && securitySource.includes("principalHasAnyPermission"),
    "security: lib/muv-ai/security.ts's guards call the shared principalHasPermission/principalHasAnyPermission predicates",
  );
  // The old anti-pattern's exact shape: "!principal.isFounder && !principal.permissions.has(...)".
  // Assert it no longer appears anywhere in the AI module.
  const handRolledPattern = /!\s*principal\.isFounder\s*&&\s*!\s*principal\.permissions\.has/;
  check(!handRolledPattern.test(securitySource), "security: the hand-rolled isFounder-bypass-or-permission-membership check no longer appears in lib/muv-ai/security.ts");

  const authSource = readSource("lib/platform-core/authorization.ts");
  check(
    authSource.includes("principalHasPermission(principal, key)") && authSource.includes("principalHasAllPermissions(principal, required)") && authSource.includes("principalHasAnyPermission(principal, required)"),
    "security: requirePermission/requireAnyPermission/hasPermission each delegate to the shared predicate rather than repeating the boolean expression inline",
  );
}

// ---------------------------------------------------------------------
// Part C — Founder OS visibility across the 5 previously-blind modules
// ---------------------------------------------------------------------
function checkFounderVisibility() {
  const kpiSource = readSource("lib/founder-os/kpi-engine.ts");
  const expectedImports: [string, string][] = [
    ["getOperationalDashboard", "@/lib/enterprise/planning-reporting"],
    ["getFounderSupportDashboard", "@/lib/support/founder-integration-service"],
    ["getInstitutionalFounderDashboard", "@/actions/inst-dashboards"],
    ["requireNetworkPrincipal", "@/lib/enterprise-network/context"],
  ];
  for (const [name, from] of expectedImports) {
    check(kpiSource.includes(name) && kpiSource.includes(from), `Founder visibility: kpi-engine.ts wires in ${name} from ${from}`);
  }
  for (const section of ["manufacturingWarehouse", "institutional", "customerSupport", "network"]) {
    check(kpiSource.includes(section), `Founder visibility: getEnterpriseKpis() returns a "${section}" section`);
  }

  const dashboardSource = readSource("lib/founder-os/dashboard-service.ts");
  check(/return\s*\{[^}]*\bkpis\b/.test(dashboardSource), "Founder visibility: getFounderDashboard() returns kpis at the top level, not just threaded internally");

  const pageSource = readSource("app/dashboard/founder/page.tsx");
  for (const label of ["Manufacturing", "Institutional Sales", "Customer Support", "Network"]) {
    check(pageSource.includes(label), `Founder visibility: the Founder dashboard page renders a "${label}" section`);
  }
}

// ---------------------------------------------------------------------
// Part D — Business integrations: the two approved, and the one that
// must stay manual
// ---------------------------------------------------------------------
function checkBusinessIntegrations() {
  // Goods Receipt -> Vendor Bill, automatic.
  const procurementSource = readSource("lib/enterprise/procurement-service.ts");
  check(procurementSource.includes("createAndPostVendorBill") && procurementSource.includes("createVendorBillFromGoodsReceipt"), "business integration: receiveGoods attempts automatic FinanceVendorBill creation");
  check(procurementSource.includes("recordFinanceEvent"), "business integration: the pre-existing generic GRNI journal fallback still exists for unconfigured environments");

  // BusinessOrder -> Shipment, proper integration.
  const schemaSource = readSource("prisma/schema.prisma");
  check(/businessOrderId\s+String\?\s+@unique/.test(schemaSource), "business integration: Shipment.businessOrderId exists as an optional, unique field");
  check(/orderId\s+String\?\s+@unique/.test(schemaSource), "business integration: Shipment.orderId was relaxed to optional");
  const migrationPath = "prisma/migrations/20260809000000_business_order_shipment_integration/migration.sql";
  check(existsSync(join(ROOT, migrationPath)), "business integration: the BusinessOrder-Shipment migration file exists");
  if (existsSync(join(ROOT, migrationPath))) {
    const migrationSource = readSource(migrationPath);
    check(migrationSource.includes("shipments_exactly_one_order_ref"), "business integration: the exactly-one-of-orderId/businessOrderId CHECK constraint is in the migration");
  }
  const businessOrdersSource = readSource("actions/business-orders.ts");
  check(businessOrdersSource.includes("tx.shipment.upsert") && businessOrdersSource.includes('status: "IN_TRANSIT"'), "business integration: dispatchBusinessOrder creates/updates a Shipment row");
  check(businessOrdersSource.includes('status: "DELIVERED"') && businessOrdersSource.includes("tx.shipmentEvent.create"), "business integration: deliverBusinessOrder updates the Shipment to DELIVERED with a ShipmentEvent");

  // CRM Quotation -> Order must remain manual (Founder decision #1) —
  // regression guard: fail loudly if this is ever automated later without
  // updating this permanent test deliberately.
  const quotationWorkflowSource = readSource("lib/quotation/workflow.ts");
  check(!quotationWorkflowSource.includes("createBusinessOrderCore"), "business integration: CRM Core's transitionQuotation still does NOT auto-create an Order (Founder decision #1 — remain manual)");
}

// ---------------------------------------------------------------------
// Part F/G — permission and dead-code review artifacts are internally
// consistent (not stale relative to their own claims)
// ---------------------------------------------------------------------
function checkCleanupReviewIntegrity() {
  const categorySum = PERMISSION_CLEANUP_REVIEW.categories.length > 0;
  check(categorySum, "permission cleanup: the review records at least one category");
  check(PERMISSION_CLEANUP_REVIEW.removedCount === 0, "permission cleanup: removedCount matches the conservative 'zero removed' decision actually taken", PERMISSION_CLEANUP_REVIEW.removedCount);

  check(DEAD_CODE_REVIEW.removedCount === 0, "dead code review: removedCount matches the conservative 'zero removed' decision actually taken", DEAD_CODE_REVIEW.removedCount);
  const flaggedFiles = DEAD_CODE_REVIEW.findings.flatMap((f) => f.files);
  const missing = flaggedFiles.filter((f) => !existsSync(join(ROOT, f)));
  check(missing.length === 0, "dead code review: every file the review examined and chose to keep still exists on disk (the 'preserve' decision actually held)", missing);
}

// ---------------------------------------------------------------------
// Module freeze integrity — Block 1/2's frozen facts, re-checked
// ---------------------------------------------------------------------
const BLOCK1_FROZEN_MODULE_IDS: ModuleId[] = [
  "crm-core", "founder-os", "institutional-sales-os", "finance-os", "warehouse-os",
  "manufacturing-os", "network-os", "customer-support-os", "analytics-os", "marketing-os",
  "sales-ai-assistant", "order-management-os", "master-data-os", "shared-platform-core",
];

function checkModuleFreezeIntegrity() {
  const currentIds = MODULES.map((m) => m.id).sort();
  const frozenIds = [...BLOCK1_FROZEN_MODULE_IDS].sort();
  check(JSON.stringify(currentIds) === JSON.stringify(frozenIds), "freeze integrity: the Block 1 module list (14 modules) has not changed", currentIds);

  const contextSource = readSource("lib/platform-core/context.ts");
  check(contextSource.includes('"MUV"'), "freeze integrity: ENTERPRISE_ORGANIZATION is still hardcoded to \"MUV\" at its new canonical home (single-company freeze holds)");

  const companySwitcher = readSource("components/os-shell/Header/CompanySwitcher.tsx");
  check(companySwitcher.includes("MUV Workspace"), "freeze integrity: CompanySwitcher still renders the frozen \"MUV Workspace\" label");
  check(!/onClick|useState|<select/i.test(companySwitcher), "freeze integrity: CompanySwitcher is still non-interactive");

  const orderPage = readSource("app/os/orders/direct/[id]/page.tsx");
  check(orderPage.includes("requirePermission") && orderPage.includes("ORDER_MGMT_VIEW"), "freeze integrity: the Block 1 security fix (ORDER_MGMT_VIEW gate) still holds");

  check(TECHNICAL_DEBT.some((i) => i.resolvedInBlock === 3), "freeze integrity: at least one Block 2 technical-debt item is marked resolvedInBlock 3 (sanity check that fixes were actually recorded, not just made)");
}

function main() {
  checkSharedPlatformCoreIsolation();
  checkSecurityCentralization();
  checkFounderVisibility();
  checkBusinessIntegrations();
  checkCleanupReviewIntegrity();
  checkModuleFreezeIntegrity();

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main();
