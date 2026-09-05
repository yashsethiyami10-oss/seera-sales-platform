import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { authorize } from "../../lib/foundation/authorization-service";
import { ROLE_PERMISSION_MATRIX, PHASE_1_ROLES, type Phase1Permission, type Phase1RoleCode } from "../../lib/foundation/rbac-catalog";
import { FoundationError } from "../../lib/foundation/errors";

// Final Acceptance mission — RBAC full matrix, BEHAVIORAL half. rbac-full-matrix-drift-check-
// readonly.ts (run earlier this session) proved the DB's Role/RolePermission rows exactly match
// rbac-catalog.ts's declared matrix — but that only proves the DATA is right, never that the
// authorize() FUNCTION itself correctly turns that data into a real ALLOW/DENY at runtime. This
// script instead calls the actual runtime authorize() (lib/foundation/authorization-service.ts) —
// the same function every Server Action/API route in this codebase calls — for a curated set of
// permissions spanning every domain the mission named (finance, treasury, money desk, sales,
// manufacturing, inventory, reports) against EVERY one of the 19 real roles, using the existing
// review-*@seera.test login for each role (seed-integrated-review.ts). This is backend enforcement,
// not frontend hiding: a denied call throws ACCESS_DENIED (403) from the real authorize() code path,
// the same one a Server Action would hit.
//
// "Institutional Sales" note (investigated this session): this codebase contains an entire second,
// UNWIRED code cluster inherited from the original "MUV Platform Sales OS" baseline this repo was
// bootstrapped from (commit 0192067, 2026-08-08) — lib/inst-sales, lib/sales, lib/platform-core,
// lib/growth, lib/intelligence, lib/gateway, lib/founder-os, plus actions/inst-leads.ts /
// actions/inst-opportunities.ts / actions/inst-quotations.ts / actions/inst-samples.ts /
// actions/business-orders.ts / actions/commerce.ts / actions/customers.ts / components/os-shell /
// components/sales/dashboard.tsx — using its own separate Prisma models (InstLead, etc.) and its
// own separate authorization module (lib/sales/authorization.ts -> lib/platform-core/authorization.ts,
// getSalesPrincipal/requirePermission, NOT lib/foundation/authorization-service.ts). Confirmed via
// grep: zero references from anything under app/ or components/seera/ — no live route, no nav entry,
// no page ever imports it. It is not reachable by any real Seera user and is not what "Institutional
// Sales" means in the actual shipped product — that business capability is realized instead through
// Money Desk's REC-INS ("Institutional Receipt")/SALE-OFF ("Factory/Offline Sale") purposes
// (lib/finance/money-desk-registry.ts), operated by ACCOUNTS_MANAGER/ACCOUNTS_EXECUTIVE/
// FOUNDER_SUPER_ADMIN (who hold money_desk:create) and already covered by
// repro-treasury-full-flow.ts, repro-money-desk-report-reconciliation-p2.ts and this script's own
// MONEY_DESK_ALL probes below. This finding is flagged for Part X/Y repo classification — NOT acted
// on here (deleting ~130 files inherited from a different project's baseline is a bigger decision
// than pruning scratch scripts and needs an explicit go-ahead), and does not block RBAC completion
// since the real, live institutional-sales capability IS covered.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: false, targetUrl: test, productionUrl: production, testUrl: test });
if (target.role !== "test") throw new Error("ABORT: not TEST");
const db = new PrismaClient({ datasourceUrl: test });

// One representative permission per action-type per domain the mission named. Chosen to be the
// ACTUAL gate a real Server Action opens with (grep-verified against lib/finance/*, lib/manufacturing/*).
const PROBES: { domain: string; action: string; permission: Phase1Permission }[] = [
  { domain: "finance", action: "view", permission: "financial_statements:view" },
  { domain: "finance", action: "create", permission: "expense:create" },
  { domain: "finance", action: "approve", permission: "expense:approve" },
  { domain: "finance", action: "void/correct", permission: "journal:reverse" },
  { domain: "treasury", action: "manage", permission: "treasury_account:manage" },
  { domain: "money_desk", action: "view", permission: "money_desk:view" },
  { domain: "money_desk", action: "create", permission: "money_desk:create" },
  { domain: "money_desk", action: "approve", permission: "money_desk:approve" },
  { domain: "money_desk", action: "void/correct", permission: "money_desk:reverse" },
  { domain: "sales", action: "view", permission: "field_reports:view_self" },
  { domain: "sales", action: "create", permission: "retailer:order" },
  { domain: "sales", action: "approve", permission: "manager_approval:decide" },
  { domain: "manufacturing", action: "view", permission: "mfg_ledger:view" },
  { domain: "manufacturing", action: "create", permission: "mfg_order:manage" },
  { domain: "manufacturing", action: "approve", permission: "mfg_qc:release" },
  { domain: "inventory", action: "manage", permission: "mfg_stock_adjustment:manage" },
  { domain: "reports", action: "view (finance)", permission: "financial_statements:view" },
  { domain: "reports", action: "view (manufacturing)", permission: "mfg_reports:view" },
];

let pass = 0, fail = 0;
function check(label: string, ok: boolean) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}`); if (ok) pass++; else fail++; }

async function canAuthorize(actorId: string, permission: Phase1Permission): Promise<boolean> {
  try {
    await authorize(db, { actorId, permission });
    return true;
  } catch (e) {
    if (e instanceof FoundationError && e.code === "ACCESS_DENIED") return false;
    throw e; // any other error is a real bug, not a denial — must not be swallowed as a false negative
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)\n`);
  console.log(`Behavioral RBAC matrix: ${PROBES.length} probe permissions x ${PHASE_1_ROLES.length} roles = ${PROBES.length * PHASE_1_ROLES.length} real authorize() calls\n`);

  const slugByRole: Partial<Record<Phase1RoleCode, string>> = {
    FOUNDER_SUPER_ADMIN: "founder", COMPANY_ADMIN: "company-admin", ACCOUNTS_MANAGER: "accounts-manager",
    ACCOUNTS_EXECUTIVE: "accounts-executive", SALES_HEAD: "sales-head", SALES_MANAGER: "sales-manager-1",
    SALES_EXECUTIVE: "sales-executive-1", SUPER_STOCKIST_OWNER: "ss-owner", SUPER_STOCKIST_OPERATOR: "ss-operator",
    DISTRIBUTOR_OWNER: "distributor-owner", DISTRIBUTOR_OPERATOR: "distributor-operator",
    DISTRIBUTOR_DELIVERY_USER: "delivery", RETAILER_USER: "retailer", READ_ONLY_AUDITOR: "auditor",
    MANUFACTURING_MANAGER: "mfg-manager", PRODUCTION_SUPERVISOR: "production-supervisor",
    STORE_EXECUTIVE: "store-executive", QC_USER: "qc-user", PRODUCTION_OPERATOR: "production-operator",
  };

  const userByRole = new Map<Phase1RoleCode, { id: string; email: string }>();
  for (const [code] of PHASE_1_ROLES) {
    const slug = slugByRole[code];
    if (!slug) { console.log(`  SKIP [${code}] — no review-* fixture slug mapped`); continue; }
    const email = `review-${slug}@seera.test`;
    const user = await db.user.findFirst({ where: { normalizedEmail: email }, select: { id: true, email: true } });
    if (!user) { console.log(`  SKIP [${code}] — fixture user ${email} not found (run seed-integrated-review.ts)`); continue; }
    userByRole.set(code, user);
  }
  console.log(`\nResolved ${userByRole.size}/${PHASE_1_ROLES.length} role fixtures.\n`);

  for (const probe of PROBES) {
    console.log(`=== ${probe.domain}.${probe.action} (${probe.permission}) ===`);
    for (const [code] of PHASE_1_ROLES) {
      const user = userByRole.get(code);
      if (!user) continue;
      const expected = ROLE_PERMISSION_MATRIX[code].includes(probe.permission);
      const actual = await canAuthorize(user.id, probe.permission);
      check(`[${code}] expected=${expected ? "ALLOW" : "DENY"} actual=${actual ? "ALLOW" : "DENY"}`, actual === expected);
    }
  }

  console.log(`\n\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);
  console.log("\nNo cleanup required — every check is a pure read (authorize() call), no fixtures were created.");
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
