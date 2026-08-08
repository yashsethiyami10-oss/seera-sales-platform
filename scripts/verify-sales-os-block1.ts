import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { MODULES, FROZEN_OUT_OF_SCOPE, findModulesForRoute } from "../lib/platform/module-registry";
import { PERMISSIONS } from "../lib/sales/constants";

/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 1.
 * Permanent governance verification suite.
 *
 * Deliberately pure static analysis over the source tree — no database,
 * no Next.js request context, no live server. This checks the STRUCTURE
 * of the codebase against `lib/platform/module-registry.ts` (module
 * ownership, route ownership, RBAC-key ownership, navigation integrity,
 * circular imports, and one specific security-fix regression), not its
 * runtime behavior — a different, complementary kind of test from every
 * other `scripts/verify-*.ts` suite in this repo.
 *
 * Run: `npx tsx scripts/verify-sales-os-block1.ts` (or
 * `npm run verify:sales-os-block1`).
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

// ---------------------------------------------------------------------
// 1. Module ownership: no two modules claim an overlapping route prefix
// ---------------------------------------------------------------------
function checkModuleOwnership() {
  // A shared parent hub (e.g. "/dashboard") legitimately has children
  // owned by other modules (e.g. "/dashboard/founder") — that is normal
  // longest-prefix-match routing, not a conflict (see module-registry.ts's
  // findModulesForRoute). The only genuine ownership bug this check looks
  // for is two DIFFERENT modules declaring the exact same prefix string —
  // an outright tie no router can resolve. Real cross-module ambiguity
  // for concrete routes is caught precisely by checkRouteOwnership below.
  const allPrefixes: { moduleId: string; prefix: string }[] = [];
  for (const m of MODULES) for (const p of m.routePrefixes) allPrefixes.push({ moduleId: m.id, prefix: p });

  let exactDuplicateFound = false;
  for (let i = 0; i < allPrefixes.length; i++) {
    for (let j = i + 1; j < allPrefixes.length; j++) {
      const a = allPrefixes[i]!;
      const b = allPrefixes[j]!;
      if (a.moduleId === b.moduleId) continue;
      if (a.prefix === b.prefix) {
        exactDuplicateFound = true;
        console.log("  EXACT DUPLICATE PREFIX:", a, "vs", b);
      }
    }
  }
  check(!exactDuplicateFound, "module ownership: no two registered modules declare the exact same route prefix");
  check(MODULES.length === new Set(MODULES.map((m) => m.id)).size, "module ownership: every module id in the registry is unique");
}

// ---------------------------------------------------------------------
// 2. Route ownership: every known real route resolves to exactly one
//    module or an explicit frozen-out-of-scope entry
// ---------------------------------------------------------------------
// Snapshot of the real route inventory as of Block 1 (from the exhaustive
// audit) — kept here, not derived from a live filesystem walk of `app/`,
// so this test fails LOUDLY (forcing a registry update) the moment a new
// route is added under one of the 7 governed trees without being
// assigned an owner, rather than silently expanding coverage.
const KNOWN_ROUTES: string[] = [
  "/dashboard", "/dashboard/founder", "/dashboard/institutional", "/dashboard/sales-manager", "/dashboard/sales-officer", "/dashboard/support",
  "/sales/inquiries", "/sales/opportunities", "/sales/quotations", "/sales/quotations/new", "/sales/quotations/approvals",
  "/sales/commerce", "/sales/leads", "/sales/customers", "/sales/intelligence", "/sales/loyalty",
  "/sales/ai", "/sales/ai/admin", "/sales/ai/executive", "/sales/ai/operations",
  "/sales/calendar", "/sales/assignments", "/sales/queues", "/sales/institutional", "/sales/support",
  "/sales/reports", "/sales/organization", "/sales/organization/roles", "/sales/territories", "/sales/channels", "/sales/audit",
  "/enterprise", "/enterprise/vendors", "/enterprise/procurement", "/enterprise/manufacturing", "/enterprise/formulas",
  "/enterprise/batches", "/enterprise/quality", "/enterprise/warehouses", "/enterprise/planning", "/enterprise/reports",
  "/finance", "/finance/journals", "/finance/receivables", "/finance/payables", "/finance/expenses",
  "/network", "/network/partners", "/network/agreements", "/network/claims", "/network/support",
  "/os/sales", "/os/sales/leads", "/os/sales/opportunities", "/os/sales/visits", "/os/sales/samples",
  "/os/sales/followups", "/os/sales/tasks", "/os/sales/planner", "/os/sales/expenses", "/os/sales/quotations", "/os/sales/reports",
  "/os/finance", "/os/finance/journals", "/os/finance/receivables", "/os/finance/payables", "/os/finance/reports", "/os/finance/exceptions",
  "/os/manufacturing", "/os/manufacturing/suppliers", "/os/manufacturing/procurement", "/os/manufacturing/formulas",
  "/os/manufacturing/production", "/os/manufacturing/quality", "/os/suppliers",
  "/os/support", "/os/support/tickets", "/os/support/escalations", "/os/support/faq", "/os/support/knowledge-base",
  "/os/support/feedback", "/os/support/templates", "/os/support/configuration", "/os/support/reports",
  "/os/orders", "/os/orders/direct", "/os/orders/business", "/os/operations",
  "/os/customers", "/os/employees", "/os/masters", "/os/territories",
  "/admin/analytics",
  "/admin/marketing",
];

function checkRouteOwnership() {
  const unowned: string[] = [];
  for (const route of KNOWN_ROUTES) {
    const owners = findModulesForRoute(route);
    const frozen = FROZEN_OUT_OF_SCOPE.some((f) => f.routePrefixes.some((p) => route === p || route.startsWith(`${p}/`)));
    if (owners.length === 0 && !frozen) unowned.push(route);
  }
  check(unowned.length === 0, "route ownership: every known route resolves to exactly one registered module or a frozen-out-of-scope entry", unowned);

  const multiOwned = KNOWN_ROUTES.filter((r) => findModulesForRoute(r).length > 1);
  check(multiOwned.length === 0, "route ownership: no known route resolves to more than one module", multiOwned);
}

// ---------------------------------------------------------------------
// 3. RBAC: every permission-prefix declared in the registry matches at
//    least one real, currently-defined PERMISSIONS key
// ---------------------------------------------------------------------
function checkRbacOwnership() {
  const allKeys = Object.keys(PERMISSIONS);
  let allPrefixesMatch = true;
  for (const m of MODULES) {
    for (const prefix of m.permissionPrefixes) {
      const matches = allKeys.some((k) => k.startsWith(prefix));
      if (!matches) {
        allPrefixesMatch = false;
        console.log(`  NO MATCH: module "${m.id}" declares permission prefix "${prefix}" but no PERMISSIONS key starts with it`);
      }
    }
  }
  check(allPrefixesMatch, "RBAC ownership: every module's declared permission-key prefix matches at least one real PERMISSIONS key");
  check(allKeys.length > 250, "RBAC ownership: the real PERMISSIONS registry has the expected order of magnitude of keys (drift guard)", allKeys.length);
}

// ---------------------------------------------------------------------
// 4. Permission usage: which PERMISSIONS keys are referenced anywhere in
//    application source (dead-permission detection, kept as a live,
//    re-runnable check rather than a frozen list in a document)
// ---------------------------------------------------------------------
function checkPermissionUsage() {
  const sourceFiles = [...walk(join(ROOT, "app"), [".ts", ".tsx"]), ...walk(join(ROOT, "actions"), [".ts"]), ...walk(join(ROOT, "lib"), [".ts", ".tsx"])];
  const combinedSource = sourceFiles.map((f) => readFileSync(f, "utf-8")).join("\n");

  const allKeys = Object.entries(PERMISSIONS) as [string, string][];
  const deadKeys: string[] = [];
  // Block 3, Part A moved the real PERMISSIONS definitions to
  // lib/platform-core/constants.ts; lib/sales/constants.ts is now a
  // one-line re-export shim with no literal permission strings in it at
  // all. Read the definition-only baseline from the canonical file (read
  // once, outside the loop — it was previously re-read per key).
  const definitionSource = readSource("lib/platform-core/constants.ts");
  for (const [constName, value] of allKeys) {
    // A key is "used" if either its PERMISSIONS.CONST_NAME accessor or its
    // raw string value (used by the AI module's hand-written permission
    // literals) appears anywhere outside the registry/seed files
    // themselves.
    const constUsagePattern = new RegExp(`PERMISSIONS\\.${constName}\\b`);
    const literalUsagePattern = new RegExp(`["'\`]${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);
    const usageCount = (combinedSource.match(new RegExp(constUsagePattern, "g")) ?? []).length + (combinedSource.match(new RegExp(literalUsagePattern, "g")) ?? []).length;
    // Every key appears at least twice already just from its own
    // definition line in constants.ts (const name + string literal) —
    // require at least one occurrence beyond that file's own definition.
    const definitionOnlyCount = (definitionSource.match(new RegExp(literalUsagePattern, "g")) ?? []).length;
    if (usageCount <= definitionOnlyCount) deadKeys.push(constName);
  }

  // A precise count is intentionally NOT asserted (the exact figure will
  // legitimately drift as the platform evolves) — this is a visibility
  // check, not a pass/fail gate: it must always run and report, and it
  // must never silently stop finding real dead keys because of a stale
  // hardcoded number.
  console.log(`  Dead/unreferenced PERMISSIONS keys found: ${deadKeys.length} of ${allKeys.length}`);
  check(deadKeys.length < allKeys.length, "permission usage: at least some PERMISSIONS keys are genuinely referenced in application code (sanity check on the detector itself)", deadKeys.length);
}

// ---------------------------------------------------------------------
// 5. Navigation ownership: every static nav href resolves to a real page
// ---------------------------------------------------------------------
function routeToPageFile(route: string): string {
  // Converts a static href like "/enterprise/vendors" into the concrete
  // page file that serves it, accounting for the dynamic catch-all
  // pages this codebase uses for /enterprise, /finance, /network.
  if (route === "/enterprise" || route === "/finance" || route === "/network") return `app${route}/page.tsx`;
  if (route.startsWith("/enterprise/")) return "app/enterprise/[module]/page.tsx";
  if (route.startsWith("/finance/")) return "app/finance/[entity]/page.tsx";
  if (route.startsWith("/network/")) return "app/network/[entity]/page.tsx";
  return `app${route}/page.tsx`;
}

function checkNavigationIntegrity() {
  const salesNavSource = readSource("lib/sales/navigation.ts");
  const hrefMatches = [...salesNavSource.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]!);
  check(hrefMatches.length >= 20, "navigation ownership: lib/sales/navigation.ts has the expected number of nav entries", hrefMatches.length);

  const osShellNavSource = readSource("components/os-shell/registry/navigation.ts");
  const osShellHrefMatches = [...osShellNavSource.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]!);
  check(osShellHrefMatches.length >= 30, "navigation ownership: the MUV OS shell nav registry has the expected number of entries", osShellHrefMatches.length);

  const allHrefs = [...new Set([...hrefMatches, ...osShellHrefMatches])];
  const broken = allHrefs.filter((href) => !existsSync(join(ROOT, routeToPageFile(href))));
  check(broken.length === 0, "navigation ownership: every static nav href resolves to a real page.tsx file on disk", broken);
}

// ---------------------------------------------------------------------
// 6. Circular dependency detection across the Sales OS module directories
// ---------------------------------------------------------------------
function checkCircularDependencies() {
  const scanDirs = [
    "lib/sales", "lib/founder-os", "lib/enterprise", "lib/enterprise-finance",
    "lib/enterprise-network", "lib/enterprise-phase2", "lib/support", "lib/inst-sales", "lib/muv-ai",
  ];
  const files = scanDirs.flatMap((d) => walk(join(ROOT, d), [".ts", ".tsx"]));
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

  // Simple DFS cycle detection.
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
  check(cycles.length === 0, `circular dependency detection: no import cycle exists across ${files.length} files in the Sales OS module directories (${scanDirs.join(", ")})`, cycles.length);
}

// ---------------------------------------------------------------------
// 7. Shared service integrity — the Shared Platform Core files exist and
//    export what every dependent module expects from them
// ---------------------------------------------------------------------
function checkSharedServiceIntegrity() {
  const sharedCore = MODULES.find((m) => m.id === "shared-platform-core")!;
  for (const libPath of sharedCore.libPaths) {
    const fullPath = join(ROOT, libPath);
    check(existsSync(fullPath), `shared service integrity: declared Shared Platform Core path exists on disk: ${libPath}`);
  }
  // Block 3, Part A isolated the real implementation into
  // lib/platform-core/authorization.ts; lib/sales/authorization.ts is now
  // a permanent re-export shim (`export * from "@/lib/platform-core/
  // authorization"`) so every pre-existing import keeps resolving. Check
  // the canonical file for the real exports, and the shim for the
  // re-export line, rather than string-searching the shim for names it no
  // longer contains literally.
  const shimSource = readSource("lib/sales/authorization.ts");
  check(shimSource.includes("@/lib/platform-core/authorization"), "shared service integrity: lib/sales/authorization.ts still re-exports from lib/platform-core/authorization.ts");
  const authSource = readSource("lib/platform-core/authorization.ts");
  for (const fn of ["getSalesPrincipal", "requirePermission", "requireAnyPermission", "hasPermission"]) {
    check(authSource.includes(`export`) && authSource.includes(fn), `shared service integrity: lib/platform-core/authorization.ts still exports ${fn}`);
  }
}

// ---------------------------------------------------------------------
// 8. Security-fix regression: app/os/orders/direct/[id]/page.tsx must
//    keep its permission check (the Block 1 PII-leak fix)
// ---------------------------------------------------------------------
function checkDirectOrderPageIsGated() {
  const source = readSource("app/os/orders/direct/[id]/page.tsx");
  check(source.includes("requirePermission") && source.includes("ORDER_MGMT_VIEW"), "security regression: app/os/orders/direct/[id]/page.tsx still requires ORDER_MGMT_VIEW before querying the order");
}

function main() {
  checkModuleOwnership();
  checkRouteOwnership();
  checkRbacOwnership();
  checkPermissionUsage();
  checkNavigationIntegrity();
  checkCircularDependencies();
  checkSharedServiceIntegrity();
  checkDirectOrderPageIsGated();

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main();
