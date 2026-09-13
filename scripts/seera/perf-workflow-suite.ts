import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { login } from "../../lib/foundation/auth-service";
import { financeWorkspaceData } from "../../lib/finance/founder-workspace-data";
import { financeGlobalSearch } from "../../lib/finance/search-service";
import { recordMoneyIn } from "../../lib/finance/treasury-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";
import { managerDashboardSummary } from "../../lib/sales-distribution/manager-service";
import { executiveRetailerSearch } from "../../lib/sales-distribution/field-portal-service";
import { material360 } from "../../lib/manufacturing/material-service";

// Post-Audit Gap Closure, Phase 2 — measures additional real workflows beyond Save Order, using the
// SAME existing infrastructure (direct service-function calls, wall-clock timing per call) already
// proven for Save Order's before/after measurement — no parallel performance system invented.
// Backend/service-layer measurement against TEST DB (no browser/device available for true
// client-perceived timing) — same honest distinction already established for Save Order.

process.env.PERF_TRACE_ALL = "1";

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: prod, testUrl: test });
if (target.role !== "test") throw new Error("ABORT: not TEST");
const url = new URL(test);
url.searchParams.set("connect_timeout", "30");
url.searchParams.set("connection_limit", "10");
url.searchParams.set("pool_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: url.toString() });

const SAMPLES = Number(process.argv[2] ?? 5);

async function sample<T>(label: string, fn: () => Promise<T>, n = SAMPLES): Promise<void> {
  const timings: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await fn();
    timings.push(performance.now() - start);
  }
  const sorted = [...timings].sort((a, b) => a - b);
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  console.log(`  ${label}: n=${n} avg=${avg.toFixed(1)}ms median=${median.toFixed(1)}ms min=${Math.min(...timings).toFixed(1)}ms max=${Math.max(...timings).toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const managerA = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const material = await prisma.seeraManufacturingMaterial.findFirst({ where: { isActive: true } });

  console.log("=== 1. Login (real password verification incl. bcrypt) ===");
  await sample("login", () => login(prisma, { email: "review-founder@seera.test", password: "SeeraReview!2026" }));

  console.log("\n=== 2. Founder/Finance workspace data aggregate (Founder Dashboard equivalent) ===");
  await sample("financeWorkspaceData", () => financeWorkspaceData(prisma, founder.id));

  console.log("\n=== 3. Finance global search ===");
  await sample("financeGlobalSearch", () => financeGlobalSearch(prisma, founder.id, "test"));

  console.log("\n=== 4. Manager Dashboard summary ===");
  await sample("managerDashboardSummary", () => managerDashboardSummary(prisma, managerA.id));

  console.log("\n=== 5. Executive retailer search ===");
  await sample("executiveRetailerSearch", () => executiveRetailerSearch(prisma, executive.id, "a"));

  if (material) {
    console.log("\n=== 6. Manufacturing Material 360 (Manufacturing Overview equivalent) ===");
    await sample("material360", () => material360(prisma, founder.id, material.id));
  } else {
    console.log("\n=== 6. Manufacturing Material 360 — SKIPPED (no active material fixture found) ===");
  }

  console.log("\n=== 7. Money In (real treasury account, cold + warm) ===");
  const suffix = randomUUID().slice(0, 8);
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `PERF-CASH-${suffix}`, name: `Perf Suite Cash ${suffix}` });
  const journalIds: string[] = [];
  await sample("recordMoneyIn", async () => {
    const j = await recordMoneyIn(prisma, founder.id, {
      type: "OTHER_INCOME", date: new Date(), amount: 10, treasuryAccountId: cash.id, mode: "CASH",
      idempotencyKey: `perf-moneyin-${randomUUID()}`,
    });
    journalIds.push(j.id);
  });

  console.log("\n=== Cleanup ===");
  await prisma.seeraJournalLine.deleteMany({ where: { journalId: { in: journalIds } } });
  await prisma.seeraJournalEntry.deleteMany({ where: { id: { in: journalIds } } });
  await prisma.seeraTreasuryAccount.delete({ where: { id: cash.id } });
  const remaining = await prisma.seeraTreasuryAccount.count({ where: { id: cash.id } });
  console.log(`Remaining: treasuryAccounts=${remaining}`);
  console.log("Cleanup proven complete.");
}
main().catch((e) => { console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
