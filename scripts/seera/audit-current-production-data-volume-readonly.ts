import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// Final Integration mission, Part K/L/M — STRICTLY READ-ONLY. A fresh, current snapshot of real
// production data volume (not reusing any stale hard-coded ID list from an earlier cleanup pass),
// to inform an honest, reviewed cleanup PLAN. This script does not delete anything.
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const prod = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: prod, productionUrl: prod, testUrl: test });
const url = new URL(prod);
url.searchParams.set("connect_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: url.toString() });

async function main() {
  console.log(`[GUARD] role=${target.role} fp=${target.fingerprint} (READ-ONLY)\n`);

  const [
    users, treasuryAccounts, retailers, distributors, superStockists, vendors,
    visits, orders, moneyDeskTxns, commercialDocs, expenses, taClaims,
    grns, productionOrders, movements, deviations, stockCounts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.seeraTreasuryAccount.count(),
    prisma.seeraRetailer.count(),
    prisma.seeraPartner.count({ where: { type: "DISTRIBUTOR" } }),
    prisma.seeraPartner.count({ where: { type: "SUPER_STOCKIST" } }),
    prisma.seeraVendor.count(),
    prisma.seeraVisit.count(),
    prisma.seeraSalesOrder.count(),
    prisma.seeraMoneyDeskTransaction.count(),
    prisma.seeraCommercialDocument.count(),
    prisma.seeraExpense.count(),
    prisma.seeraTaClaim.count(),
    prisma.seeraGrn.count(),
    prisma.seeraProductionOrder.count(),
    prisma.seeraManufacturingMovement.count(),
    prisma.seeraDeviationRecord.count(),
    prisma.seeraStockCount.count(),
  ]);

  console.log("=== Current real production volume (whole tables, not yet classified trial-vs-genuine) ===");
  console.log({ users, treasuryAccounts, retailers, distributors, superStockists, vendors, visits, orders, moneyDeskTxns, commercialDocs, expenses, taClaims, grns, productionOrders, movements, deviations, stockCounts });

  console.log("\n=== Retailer creation timeline (to distinguish real onboarding vs bursty test activity) ===");
  const byDay = await prisma.$queryRawUnsafe<{ day: string; count: bigint }[]>(
    `SELECT to_char("createdAt", 'YYYY-MM-DD') as day, count(*) as count FROM "seera_retailers" GROUP BY 1 ORDER BY 1`,
  );
  for (const r of byDay) console.log(`  ${r.day}: ${r.count}`);

  console.log("\n=== Active Sales roster (real, not test) ===");
  const roleAssignments = await prisma.userRoleAssignment.findMany({
    where: { status: "ACTIVE", role: { code: { in: ["SALES_EXECUTIVE", "SALES_MANAGER", "SALES_HEAD", "INSTITUTIONAL_SALES_OFFICER"] } } },
    select: { user: { select: { name: true, email: true } }, role: { select: { code: true } } },
  });
  for (const ra of roleAssignments) console.log(`  ${ra.user.name} (${ra.user.email}) — ${ra.role.code}`);
}
main().finally(() => prisma.$disconnect());
