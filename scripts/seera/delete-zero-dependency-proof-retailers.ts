import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { inspectDatabaseUrl } from "../../lib/database/identity-guard";

// Final Integration mission, Part K — the ONE cleanup step this agent's read-only audit
// (classify-trial-vs-genuine-production-data-readonly.ts) found to be unambiguous and provably
// zero-risk: two QA-fixture retailers created during this session's own earlier testing
// ("Jhansi Handoff Proof Retailer", "Stop Snapshot Immutability Proof Retailer"), each confirmed
// via Prisma's own relation _count to have ZERO SeeraSalesOrder and ZERO SeeraVisit rows — the only
// two onDelete: Restrict foreign keys SeeraRetailer has. See cleanup-trial-data-PLAYBOOK.md for the
// full classification and why every other candidate is left to Founder judgment instead of being
// auto-deleted here.
//
// This script is meant to be run BY THE FOUNDER, not by this agent — it deliberately does NOT call
// authorizeDatabaseCommand({ write: true, intendedRole: "production" }), because that call is
// architecturally guaranteed to throw PRODUCTION_WRITE_PROHIBITED unconditionally (see
// lib/database/identity-guard.ts — there is no bypass flag; it exists specifically to stop
// automated agent scripts from writing to production). inspectDatabaseUrl() below still verifies
// the target is the real, known production database (not a mistyped/blank URL) before doing
// anything, and re-verifies BOTH target retailers still have zero orders/visits immediately before
// deleting, in case production data changed since the last audit run.
//
// Usage:
//   npx tsx scripts/seera/delete-zero-dependency-proof-retailers.ts             (dry run, default)
//   npx tsx scripts/seera/delete-zero-dependency-proof-retailers.ts --execute   (actually deletes)
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
const identity = inspectDatabaseUrl(prod, "production");
const url = new URL(prod);
url.searchParams.set("connect_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: url.toString() });

const TARGET_RETAILER_IDS = [
  "cmt584m1n000m19nq1k9f3u9n", // "Jhansi Handoff Proof Retailer"
  "cmt5g3p10000f42xh4z1yj93e", // "Stop Snapshot Immutability Proof Retailer"
];

const execute = process.argv.includes("--execute");

async function main() {
  console.log(`[TARGET] role=${identity.role} fp=${identity.fingerprint} mode=${execute ? "EXECUTE (will delete)" : "DRY RUN (no changes)"}\n`);

  for (const id of TARGET_RETAILER_IDS) {
    const retailer = await prisma.seeraRetailer.findUnique({ where: { id }, select: { id: true, businessName: true, lifecycle: true, _count: { select: { orders: true, visits: true } } } });
    if (!retailer) {
      console.log(`  [${id}] NOT FOUND — already removed or id is wrong. Skipping.`);
      continue;
    }
    const safe = retailer._count.orders === 0 && retailer._count.visits === 0;
    console.log(`  [${id}] "${retailer.businessName}" lifecycle=${retailer.lifecycle} orders=${retailer._count.orders} visits=${retailer._count.visits} — ${safe ? "SAFE to delete (re-verified now)" : "NOT SAFE — has dependent rows, refusing to delete"}`);
    if (!safe) continue;
    if (execute) {
      await prisma.seeraRetailer.delete({ where: { id } });
      console.log(`    -> DELETED`);
    } else {
      console.log(`    -> would DELETE (dry run — pass --execute to actually delete)`);
    }
  }
  console.log(`\nDone. ${execute ? "Changes were applied." : "No changes were made (dry run)."}`);
}
main().finally(() => prisma.$disconnect());
