import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { classifyDatabaseTarget } from "../../lib/database/identity-guard";

// PRODUCTION retailer test-data cleanup (Founder-approved, explicit exact list — never name/pattern
// matching at run time). Requires --confirm-production-write AND
// SEERA_ALLOW_PRODUCTION_RETAILER_CLEANUP=confirm — same narrow, single-purpose override pattern as
// deploy-seed-production-foundation.ts, used here because the shared identity-guard.ts
// (authorizeDatabaseCommand) unconditionally blocks every write:true call against production for
// every OTHER script, deliberately, with no exception. identity-guard.ts itself is untouched.
//
// Governed mechanics, not a raw cascade delete:
//   1. Close the one currently-OPEN visit among these retailers (administrative close, no WhatsApp
//      side effect — raw update, not executiveCheckOut, specifically to avoid triggering any
//      notification during cleanup).
//   2. Detach (null retailerId) every SeeraVisit and SeeraSalesOrder row instead of deleting them —
//      these are the only two real FK relations to SeeraRetailer in the schema (both onDelete:
//      Restrict; confirmed by direct schema grep, not assumed) — preserving them as anonymous
//      historical rows rather than destroying operational/audit trail. SeeraVisitPhoto.retailerId is
//      a plain denormalized field (no FK), nulled for hygiene only.
//   3. Move every one of these orders to CANCELLED (a real, pre-existing terminal status) — none of
//      them have any SeeraInventoryMovement or SeeraFinancialEntry row (confirmed by direct
//      read-only inventory before this script was written), so there is nothing to reverse.
//   4. Move only the PENDING/FAILED WhatsApp outbox rows tied to these retailers to DEAD_LETTER (the
//      existing "will never be retried" terminal state) — never touches already-PUBLISHED/
//      DELIVERED/READ rows, which are historical fact.
//   5. Only then delete the SeeraRetailer rows themselves.
// Everything runs inside one $transaction — either the whole cleanup lands, or none of it does.

// Exact, Founder-confirmed list from inventory-test-retailer-data-production-readonly.ts —
// deliberately hardcoded ids, never a name/source/date pattern match at run time.
const TEST_RETAILER_IDS = [
  "cmsuh0ouf0005pxwsgvn4d9ps", // weiufhjdsfkv
  "cmsuh9sgt0008it7c0ewnkcvj", // grdthrfddeg
  "cmsurkgl5000413uxoguuh0uo", // derver
  "cmsxbxfq50001s57bmuhff79v", // sharma traders
  "cmszdojez0001t8nv9h6xsv2t", // MUV CARE CO.
  "cmsze2n2i0001x0apruzn5kxy", // seera kirana
  "cmsze93kx000px0apmssv3otf", // arnav kirana
  "cmszfhsxi0001wljeozptq9hp", // mewadi
  "cmszhimdn00016m8wmf6rpija", // RIYA
  "cmszk8rjv000rp7ltmggi9iq5", // Akshita
  "cmt124mq0000112x82zcf4cty", // Sl kirana
  "cmt13qq0b000fgjheb4un3we6", // Awdhesh
  "cmt14nwhv0001v3t8offipzpw", // Awdhesh kirana
] as const;

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function main() {
  if (!process.argv.includes("--confirm-production-write")) {
    console.error("Refusing to run: pass --confirm-production-write to acknowledge this writes to the PRODUCTION database.");
    process.exitCode = 1;
    return;
  }
  if (process.env.SEERA_ALLOW_PRODUCTION_RETAILER_CLEANUP !== "confirm") {
    console.error("Refusing to run: set SEERA_ALLOW_PRODUCTION_RETAILER_CLEANUP=confirm to acknowledge this deletes the Founder-confirmed test retailer list from PRODUCTION.");
    process.exitCode = 1;
    return;
  }
  const root = path.resolve(import.meta.dirname, "..", "..");
  const production = envFile(path.join(root, ".env")).DATABASE_URL;
  const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
  const target = classifyDatabaseTarget({ targetUrl: production, productionUrl: production, testUrl: test });
  if (target.role !== "production") {
    console.error(`Refusing to run: resolved database role is "${target.role}", expected "production".`);
    process.exitCode = 1;
    return;
  }
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);

  const prisma = new PrismaClient({ datasourceUrl: production });
  try {
    // Pre-flight: refuse to proceed if any of these ids no longer resolve to exactly this same
    // confirmed set, or if any order among them turns out to have a real inventory/ledger effect
    // that wasn't there when the inventory was taken (race-safety, not just a formality).
    const retailers = await prisma.seeraRetailer.findMany({ where: { id: { in: [...TEST_RETAILER_IDS] } } });
    if (retailers.length !== TEST_RETAILER_IDS.length) {
      console.error(`Refusing to run: expected ${TEST_RETAILER_IDS.length} retailers, found ${retailers.length}. Aborting without changes.`);
      process.exitCode = 1;
      return;
    }
    const orders = await prisma.seeraSalesOrder.findMany({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } } });
    for (const o of orders) {
      const movements = await prisma.seeraInventoryMovement.count({ where: { sourceType: "SeeraSalesOrder", sourceId: o.id } });
      const ledger = await prisma.seeraFinancialEntry.count({ where: { orderId: o.id } });
      if (movements > 0 || ledger > 0) {
        console.error(`Refusing to run: order ${o.orderNumber} now has ${movements} inventory movement(s) / ${ledger} ledger entr(y/ies) that weren't present during inventory. Aborting without changes.`);
        process.exitCode = 1;
        return;
      }
    }
    const visits = await prisma.seeraVisit.findMany({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } } });
    const photos = await prisma.seeraVisitPhoto.findMany({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } } });
    const outbox = await prisma.outboxEvent.findMany({ where: { aggregateType: "SeeraRetailer", aggregateId: { in: [...TEST_RETAILER_IDS] }, status: { in: ["PENDING", "FAILED"] } } });
    const openVisits = visits.filter((v) => !v.checkedOutAt);

    console.log(`Pre-flight: ${retailers.length} retailers, ${orders.length} orders, ${visits.length} visits (${openVisits.length} open), ${photos.length} photos, ${outbox.length} pending/failed outbox rows to dead-letter.`);

    const result = await prisma.$transaction(async (tx) => {
      const closedVisits = await tx.seeraVisit.updateMany({
        where: { id: { in: openVisits.map((v) => v.id) } },
        data: { checkedOutAt: new Date(), outcome: "NO_ORDER", noOrderReason: "Administrative cleanup — production test-data removal", photoExceptionReason: "OTHER" },
      });
      const detachedVisits = await tx.seeraVisit.updateMany({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } }, data: { retailerId: null } });
      const detachedPhotos = await tx.seeraVisitPhoto.updateMany({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } }, data: { retailerId: null } });
      const cancelledOrders = await tx.seeraSalesOrder.updateMany({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } }, data: { retailerId: null, status: "CANCELLED" } });
      const deadLetteredOutbox = await tx.outboxEvent.updateMany({
        where: { id: { in: outbox.map((o) => o.id) } },
        data: { status: "DEAD_LETTER", lastErrorCode: "CANCELLED_TEST_RETAILER_CLEANUP" },
      });
      const deletedRetailers = await tx.seeraRetailer.deleteMany({ where: { id: { in: [...TEST_RETAILER_IDS] } } });
      return { closedVisits: closedVisits.count, detachedVisits: detachedVisits.count, detachedPhotos: detachedPhotos.count, cancelledOrders: cancelledOrders.count, deadLetteredOutbox: deadLetteredOutbox.count, deletedRetailers: deletedRetailers.count };
    });

    console.log("\nDone:");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Retailer cleanup failed");
  process.exitCode = 1;
});
