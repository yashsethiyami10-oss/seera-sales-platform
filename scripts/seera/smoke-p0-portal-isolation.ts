// P0 bug bash (P0-2) — proves requireSurfaceAccess actually rejects a Sales Executive trying to
// use the founder-admin portal's "sales" item (the exact spoofing path OperationalWorkspace.tsx
// now guards against), while a Founder and the Executive's own portal are unaffected. Safe to
// re-run: creates its own throwaway employee, TEST DB only.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { requireSurfaceAccess } from "../../lib/foundation/surface-access";
import { surfaceItem } from "../../lib/foundation/product-surface";

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) values[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const production = envFile(".env").DATABASE_URL;
const test = envFile(".env.test").TEST_DATABASE_URL;
authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  ✓", msg);
}

async function main() {
  const suffix = Date.now().toString(36);
  const execRole = await db.role.findUnique({ where: { code: "SALES_EXECUTIVE" } });
  if (!execRole) throw new Error("SALES_EXECUTIVE role not found — run the review-user seed first");
  const founder = await db.user.findFirst({ where: { email: "review-founder@seera.test" } });
  if (!founder) throw new Error("review-founder@seera.test not found — run npm run seed:seera:review-users first");

  const exec = await db.user.create({ data: { email: `p0-iso-${suffix}@seera.test`, normalizedEmail: `p0-iso-${suffix}@seera.test`, name: "P0 Isolation Fixture", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: exec.id, roleId: execRole.id, status: "ACTIVE" } });

  // Permission set doesn't matter for surfaceItem's "sales" lookup (that item declares none), but
  // requireSurfaceAccess re-derives real permissions from the DB itself — never trusts a caller's
  // own claim of what portal/permissions apply, which is the actual point being proven here.
  // system:super_admin here is ONLY to make surfaceItem's own permission filter resolve the item
  // definition regardless of which item it is — it does not affect requireSurfaceAccess below,
  // which always re-derives the ACTOR's real permissions fresh from the DB, never trusting this.
  const allItemsVisible = new Set(["system:super_admin"]);
  const founderSalesItem = surfaceItem("founder-admin", "sales", allItemsVisible)!;
  const execTodayItem = surfaceItem("sales-executive", "today", allItemsVisible)!;

  console.log("=== A Sales Executive must be REJECTED from founder-admin's 'sales' item ===");
  let rejected = false;
  try {
    await requireSurfaceAccess(db, exec.id, "founder-admin", founderSalesItem);
  } catch (e) {
    rejected = e instanceof Error && /ACCESS_DENIED|permission/i.test(e.message);
  }
  assert(rejected, "Executive spoofing portal=founder-admin is rejected (this is the exact P0-2 exploit path: OperationalWorkspace used to trust `portal` as a plain string with no check)");

  console.log("\n=== The SAME Executive CAN use their own portal's 'today' item ===");
  const ownScope = await requireSurfaceAccess(db, exec.id, "sales-executive", execTodayItem);
  assert(JSON.stringify(ownScope.employeeIds) === JSON.stringify([exec.id]), "own-portal scope is restricted to exactly this employee, never organization-wide");
  assert(ownScope.organizationWide === false, "sales-executive is never flagged organization-wide");

  console.log("\n=== A Founder legitimately CAN use founder-admin's 'sales' item (no over-correction) ===");
  const founderScope = await requireSurfaceAccess(db, founder.id, "founder-admin", founderSalesItem);
  assert(founderScope.organizationWide === true, "Founder's founder-admin scope is correctly organization-wide");

  await db.$disconnect();
  console.log("\nALL PORTAL-ISOLATION ASSERTIONS PASSED.");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
