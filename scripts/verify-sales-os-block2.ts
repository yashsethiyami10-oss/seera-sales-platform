import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { MODULES, type ModuleId } from "../lib/platform/module-registry";
import {
  PUBLIC_INTERFACES,
  CROSS_MODULE_FLOWS,
  SHARED_PLATFORM_CORE_PLAN,
  AI_READINESS_MATRIX,
  DATA_FLOWS,
  TECHNICAL_DEBT,
  DOCUMENTED_SHARED_ACTION_FILES,
} from "../lib/platform/module-validation";

/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 2.
 * Permanent governance verification suite.
 *
 * Same philosophy as scripts/verify-sales-os-block1.ts: pure static
 * analysis, no database, no live server. Block 1's suite verified WHO OWNS
 * WHAT (routes, permissions, navigation). This suite verifies the shape and
 * internal consistency of Block 2's validation data (public interfaces,
 * cross-module flow evidence, AI readiness, data-flow ownership, technical
 * debt) against the still-frozen Block 1 registry, plus a regression check
 * that Block 1's frozen facts have not silently drifted.
 *
 * Run: `npx tsx scripts/verify-sales-os-block2.ts` (or
 * `npm run verify:sales-os-block2`).
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

function walk(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      results.push(...walk(fullPath, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

const MODULE_IDS = new Set<ModuleId>(MODULES.map((m) => m.id));

// ---------------------------------------------------------------------
// 1. Module validation (Part A): every registered module has a public
//    interface entry, and every file it declares as an entry point exists.
// ---------------------------------------------------------------------
function checkModuleValidation() {
  const missing = MODULES.filter((m) => !(m.id in PUBLIC_INTERFACES)).map((m) => m.id);
  check(missing.length === 0, "module validation: every registered module has a PUBLIC_INTERFACES entry", missing);

  const badEntryPoints: string[] = [];
  for (const [moduleId, iface] of Object.entries(PUBLIC_INTERFACES)) {
    for (const entry of iface.entryPoints) {
      // Entry points are files (actions/*.ts) or single lib files (lib/analytics.ts) — both checkable on disk.
      if (!existsSync(join(ROOT, entry))) badEntryPoints.push(`${moduleId}: ${entry}`);
    }
  }
  check(badEntryPoints.length === 0, "module validation: every declared entry-point file exists on disk", badEntryPoints);
}

// ---------------------------------------------------------------------
// 2. Boundary validation (Part B): every exit point / flow step targets a
//    real module id (or the explicit "external" escape hatch) — no
//    reference to a module that doesn't exist in the frozen registry.
// ---------------------------------------------------------------------
function checkBoundaryValidation() {
  const badExitTargets: string[] = [];
  for (const [moduleId, iface] of Object.entries(PUBLIC_INTERFACES)) {
    for (const exit of iface.exitPoints) {
      if (exit.targetModule !== "external" && !MODULE_IDS.has(exit.targetModule as ModuleId)) {
        badExitTargets.push(`${moduleId} -> ${exit.targetModule}`);
      }
    }
  }
  check(badExitTargets.length === 0, "boundary validation: every declared exit point targets a real module or 'external'", badExitTargets);

  const nonShared = MODULES.filter((m) => m.id !== "shared-platform-core");
  const actionFileOwners = new Map<string, ModuleId[]>();
  for (const m of nonShared) {
    for (const f of m.actionFiles) {
      actionFileOwners.set(f, [...(actionFileOwners.get(f) ?? []), m.id]);
    }
  }
  const undocumentedDuplicates: string[] = [];
  for (const [file, owners] of actionFileOwners) {
    if (owners.length <= 1) continue;
    // A shared action file is allowed only if Block 2's own
    // DOCUMENTED_SHARED_ACTION_FILES explains it — module-registry.ts's
    // knownIssues is frozen, so this Block's own documentation record is
    // deliberately the source of truth for anything found by this check.
    if (!(file in DOCUMENTED_SHARED_ACTION_FILES)) undocumentedDuplicates.push(`${file}: ${owners.join(", ")}`);
  }
  check(undocumentedDuplicates.length === 0, "boundary validation: no undocumented duplicate actionFile ownership across modules", undocumentedDuplicates);

  const libPathOwners = new Map<string, ModuleId[]>();
  for (const m of nonShared) {
    for (const p of m.libPaths) {
      libPathOwners.set(p, [...(libPathOwners.get(p) ?? []), m.id]);
    }
  }
  const duplicateLibPaths = [...libPathOwners.entries()].filter(([, owners]) => owners.length > 1);
  check(duplicateLibPaths.length === 0, "boundary validation: no two non-shared modules declare the same libPath (Shared Platform Core overlap excluded, that's by design)", duplicateLibPaths);
}

// ---------------------------------------------------------------------
// 3. Cross-module integrity (Part C): every flow step references real
//    modules and a valid classification.
// ---------------------------------------------------------------------
function checkCrossModuleIntegrity() {
  const validClassifications = new Set(["DIRECT_CALL", "EVENT_DRIVEN", "MANUAL_STEP", "NOT_CONNECTED"]);
  const badSteps: string[] = [];
  for (const flow of CROSS_MODULE_FLOWS) {
    for (const step of flow.steps) {
      if (!MODULE_IDS.has(step.from)) badSteps.push(`${flow.name}: unknown 'from' module ${step.from}`);
      if (step.to !== "external" && !MODULE_IDS.has(step.to as ModuleId)) badSteps.push(`${flow.name}: unknown 'to' module ${step.to}`);
      if (!validClassifications.has(step.classification)) badSteps.push(`${flow.name}: invalid classification ${step.classification}`);
      if (!step.evidence || step.evidence.startsWith("PENDING")) badSteps.push(`${flow.name}: missing/pending evidence for step ${step.from}->${step.to}`);
    }
  }
  check(badSteps.length === 0, "cross-module integrity: every flow step references real modules, a valid classification, and cites evidence", badSteps);
  check(CROSS_MODULE_FLOWS.length >= 6, "cross-module integrity: all 6 brief-named business flows are represented", CROSS_MODULE_FLOWS.map((f) => f.name));
}

// ---------------------------------------------------------------------
// 4. Shared Platform Core report (Part D): every planned path exists.
// ---------------------------------------------------------------------
function checkSharedPlatformCoreReport() {
  const missing = SHARED_PLATFORM_CORE_PLAN.filter((p) => !existsSync(join(ROOT, p.path))).map((p) => p.path);
  check(missing.length === 0, "shared platform core report: every planned path exists on disk", missing);
  const validDispositions = new Set(["KEEP_SHARED", "MOVE_INTO_MODULE", "ISOLATE_AS_OWN_PACKAGE"]);
  const badDispositions = SHARED_PLATFORM_CORE_PLAN.filter((p) => !validDispositions.has(p.disposition));
  check(badDispositions.length === 0, "shared platform core report: every entry has a valid disposition", badDispositions);
}

// ---------------------------------------------------------------------
// 5. AI readiness (Part E): every registered module has a profile; no
//    provider/prompt/Gateway reference anywhere in the readiness data
//    (this phase must stay extension-points-only, never real integration).
// ---------------------------------------------------------------------
function checkAiReadiness() {
  const missing = MODULES.filter((m) => !(m.id in AI_READINESS_MATRIX)).map((m) => m.id);
  check(missing.length === 0, "AI readiness: every registered module has an AI_READINESS_MATRIX profile", missing);

  const FORBIDDEN_TERMS = ["anthropic.messages.create", "openai.chat", "gateway/provider", "lib/gateway/"];
  const validationSource = readSource("lib/platform/module-validation.ts");
  const foundForbidden = FORBIDDEN_TERMS.filter((t) => validationSource.includes(t));
  check(foundForbidden.length === 0, "AI readiness: no live provider/Gateway call or import appears in the readiness data (extension points only, per Part E)", foundForbidden);

  const incompleteProfiles: string[] = [];
  for (const [moduleId, profile] of Object.entries(AI_READINESS_MATRIX)) {
    for (const [field, value] of Object.entries(profile)) {
      if (typeof value !== "string" || value.trim().length === 0) incompleteProfiles.push(`${moduleId}.${field}`);
    }
  }
  check(incompleteProfiles.length === 0, "AI readiness: every profile field is populated (N/A is an acceptable explicit value, empty is not)", incompleteProfiles);
}

// ---------------------------------------------------------------------
// 6. Data flow validation (Part F): every producer/consumer/owner is a
//    real module id (or the explicit "external" producer for Payments).
// ---------------------------------------------------------------------
function checkDataFlowValidation() {
  const bad: string[] = [];
  for (const flow of DATA_FLOWS) {
    if (flow.producer !== "external" && !MODULE_IDS.has(flow.producer as ModuleId)) bad.push(`${flow.entity}: unknown producer ${flow.producer}`);
    if (!MODULE_IDS.has(flow.owner)) bad.push(`${flow.entity}: unknown owner ${flow.owner}`);
    for (const c of flow.consumers) if (!MODULE_IDS.has(c)) bad.push(`${flow.entity}: unknown consumer ${c}`);
  }
  check(bad.length === 0, "data flow validation: every producer/owner/consumer is a real module id", bad);

  const REQUIRED_ENTITIES = ["Orders", "Customers", "Inventory", "Products", "Employees", "Territories", "Payments", "Invoices", "Manufacturing", "Reports", "Notifications", "Audit Logs"];
  const missingEntities = REQUIRED_ENTITIES.filter((e) => !DATA_FLOWS.some((f) => f.entity === e));
  check(missingEntities.length === 0, "data flow validation: all 12 brief-named data entities are tracked", missingEntities);
}

// ---------------------------------------------------------------------
// 7. Integration validation (Part G): every technical-debt item is well-
//    formed and references real modules; severities are valid.
// ---------------------------------------------------------------------
function checkTechnicalDebtRanking() {
  const validSeverities = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  const bad: string[] = [];
  for (const item of TECHNICAL_DEBT) {
    if (!validSeverities.has(item.severity)) bad.push(`"${item.title}": invalid severity ${item.severity}`);
    for (const m of item.modules) if (!MODULE_IDS.has(m)) bad.push(`"${item.title}": unknown module ${m}`);
    if (item.modules.length === 0) bad.push(`"${item.title}": no module attributed`);
  }
  check(bad.length === 0, "technical debt: every item has a valid severity and references real modules", bad);
  check(TECHNICAL_DEBT.some((i) => i.severity === "CRITICAL"), "technical debt: at least one CRITICAL item is tracked (sanity check — a governance pass that finds nothing critical after this much coupling is more likely under-scoped than clean)");
}

// ---------------------------------------------------------------------
// 8. Dependency graph (Part D, broadened): no import cycle across the
//    FULL lib/ tree — a stronger check than Block 1's 9-directory scan,
//    since this Block explicitly audits "what creates unnecessary
//    coupling" platform-wide, not just within the 9 Sales OS directories.
// ---------------------------------------------------------------------
function checkFullDependencyGraph() {
  const files = walk(join(ROOT, "lib"), [".ts", ".tsx"]);
  const fileSet = new Set(files.map((f) => f.replace(ROOT + "\\", "").replace(ROOT + "/", "").replace(/\\/g, "/")));

  const graph = new Map<string, Set<string>>();
  for (const file of files) {
    const rel = file.replace(ROOT + "\\", "").replace(ROOT + "/", "").replace(/\\/g, "/");
    const source = readFileSync(file, "utf-8");
    const imports = [...source.matchAll(/from\s+["']@\/([^"']+)["']/g)].map((m) => m[1]!);
    const edges = new Set<string>();
    for (const imp of imports) {
      for (const candidate of [`${imp}.ts`, `${imp}.tsx`, `${imp}/index.ts`]) {
        if (fileSet.has(candidate)) edges.add(candidate);
      }
    }
    graph.set(rel, edges);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]) {
    color.set(node, GRAY);
    for (const neighbor of graph.get(node) ?? []) {
      const neighborColor = color.get(neighbor) ?? WHITE;
      if (neighborColor === GRAY) {
        const cycleStart = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStart), neighbor]);
      } else if (neighborColor === WHITE) {
        dfs(neighbor, [...path, neighbor]);
      }
    }
    color.set(node, BLACK);
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) dfs(node, [node]);
  }

  if (cycles.length > 0) for (const cycle of cycles) console.log("  CYCLE:", cycle.join(" -> "));
  check(cycles.length === 0, `dependency graph: no import cycle exists across the full lib/ tree (${files.length} files)`, cycles.length);
}

// ---------------------------------------------------------------------
// 9. Cross-module regression: Block 1's frozen facts must not have
//    silently drifted while Block 2 was in progress.
// ---------------------------------------------------------------------
const BLOCK1_FROZEN_MODULE_IDS: ModuleId[] = [
  "crm-core", "founder-os", "institutional-sales-os", "finance-os", "warehouse-os",
  "manufacturing-os", "network-os", "customer-support-os", "analytics-os", "marketing-os",
  "sales-ai-assistant", "order-management-os", "master-data-os", "shared-platform-core",
];

function checkFreezeRegression() {
  const currentIds = MODULES.map((m) => m.id).sort();
  const frozenIds = [...BLOCK1_FROZEN_MODULE_IDS].sort();
  check(JSON.stringify(currentIds) === JSON.stringify(frozenIds), "freeze regression: the Block 1 module list (14 modules) has not changed", currentIds);

  // Block 3, Part A moved the real ENTERPRISE_ORGANIZATION constant to
  // lib/platform-core/context.ts; lib/enterprise/context.ts is now a
  // re-export shim with no literal "MUV" string in it.
  const enterpriseContext = readSource("lib/platform-core/context.ts");
  check(enterpriseContext.includes('"MUV"'), "freeze regression: ENTERPRISE_ORGANIZATION is still hardcoded to \"MUV\" (single-company freeze holds)");

  const companySwitcher = readSource("components/os-shell/Header/CompanySwitcher.tsx");
  check(companySwitcher.includes("MUV Workspace"), "freeze regression: CompanySwitcher still renders the frozen \"MUV Workspace\" label");
  check(!/onClick|useState|<select/i.test(companySwitcher), "freeze regression: CompanySwitcher is still non-interactive (no onClick/useState/<select> introduced)");

  const orderPage = readSource("app/os/orders/direct/[id]/page.tsx");
  check(orderPage.includes("requirePermission") && orderPage.includes("ORDER_MGMT_VIEW"), "freeze regression: the Block 1 security fix (ORDER_MGMT_VIEW gate) still holds");
}

function main() {
  checkModuleValidation();
  checkBoundaryValidation();
  checkCrossModuleIntegrity();
  checkSharedPlatformCoreReport();
  checkAiReadiness();
  checkDataFlowValidation();
  checkTechnicalDebtRanking();
  checkFullDependencyGraph();
  checkFreezeRegression();

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main();
