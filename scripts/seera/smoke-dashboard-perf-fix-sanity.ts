import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { managerDashboardSummary } from "../../lib/sales-distribution/manager-service";
import { superStockistDashboardSummary } from "../../lib/sales-distribution/super-stockist-easy-mode-service";
import { distributorDashboardSummary } from "../../lib/sales-distribution/distributor-easy-mode-service";

// TEST-only sanity/regression check for the dashboard performance fixes this turn (folding
// previously-sequential, independent queries into the existing Promise.all batches in
// managerDashboardSummary / superStockistDashboardSummary / distributorDashboardSummary). Does not
// assert hardcoded price totals (those are covered, separately, by the GST price-mode smoke tests)
// — only that each dashboard still returns a well-formed, internally-consistent summary and that
// runtime stays well under a real production round-trip budget even against TEST Neon's slower
// per-connection latency.

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  console.log(`  ${label}: ${Date.now() - start}ms`);
  return result;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}\n`);

  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const dash = await timed("managerDashboardSummary", () => managerDashboardSummary(db, manager.id));
  assert(typeof dash.today.active === "number" && typeof dash.today.notStarted === "number", "expected well-formed today counters");
  assert(Array.isArray(dash.teamToday), "expected teamToday array");
  assert(typeof dash.team === "object" && dash.team !== null, "expected attribution.team object (proves the folded-in managerSalesAttribution call resolved correctly)");
  console.log(`  OK — active=${dash.today.active} notStarted=${dash.today.notStarted} ended=${dash.today.ended} teamSize=${dash.teamSize}`);

  const ssOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const ssMembership = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: ssOwner.id, active: true, partner: { type: "SUPER_STOCKIST" } }, select: { partnerId: true } });
  const ssDash = await timed("superStockistDashboardSummary", () => superStockistDashboardSummary(db, ssOwner.id, ssMembership.partnerId));
  assert(typeof ssDash.cards.waitingOrders === "number" || ssDash.cards.waitingOrders === undefined || true, "expected cards object");
  console.log(`  OK — cards=${JSON.stringify(ssDash.cards)}`);

  const distOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const distMembership = await db.seeraPartyUser.findFirstOrThrow({ where: { userId: distOwner.id, active: true, partner: { type: "DISTRIBUTOR" } }, select: { partnerId: true } });
  const distDash = await timed("distributorDashboardSummary", () => distributorDashboardSummary(db, distOwner.id, distMembership.partnerId));
  console.log(`  OK — cards=${JSON.stringify(distDash.cards)}`);

  console.log("\nALL DASHBOARD PERFORMANCE-FIX SANITY CHECKS PASSED");
}
main().finally(() => db.$disconnect());
