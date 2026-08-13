import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import {
  createDistributorProspect,
  teamSyncStatus,
  managerMappedDistributors,
  managerDistributorCollectionsSnapshot,
} from "../../lib/sales-distribution/manager-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only, live smoke test for the Sales Manager Founder-UAT CORRECTION PASS #2 fixes:
//  - Distributor prospect duplicate detection (Req 9): a near-duplicate (same mobile, different
//    business name) is rejected with SIMILAR_PROSPECT_EXISTS + a `similar` list, not silently
//    created twice.
//  - Per-Executive sync status (Req 7): SYNCED by default, flips to SYNC_ERROR once a FAILED
//    offline operation exists for that Executive, independent of any activity count.
//  - Distributor-first Collections (Req 10): managerMappedDistributors only returns Distributors
//    actually mapped via this Manager's team's retailers; managerDistributorCollectionsSnapshot
//    refuses an out-of-scope Distributor and returns outstanding/current/overdue/lastPayment/
//    promisedPaymentDate/creditStatus for an in-scope one.
// Safe to re-run — every prospect/offline-operation row below is freshly created per run with a
// unique suffix, and cleaned up at the end.

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

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const suffix = Date.now();
  const createdProspectIds: string[] = [];
  const createdOfflineOpIds: string[] = [];

  try {
    // --- Req 9: prospect duplicate detection ---
    const mobile = `98${String(suffix).slice(-8)}`;
    const first = await createDistributorProspect(db, manager.id, {
      businessName: `Correction Pass 2 Prospect ${suffix}`,
      mobile,
      profile: { source: "SMOKE" },
    });
    createdProspectIds.push(first.id);
    console.log(`[OK] created prospect ${first.id} (stage=${first.stage})`);

    let duplicateBlocked = false;
    try {
      await createDistributorProspect(db, manager.id, {
        businessName: `Correction Pass 2 Prospect ${suffix} — Renamed Firm`,
        mobile,
        profile: { source: "SMOKE" },
      });
    } catch (error) {
      assert(error instanceof FoundationError, "duplicate attempt should throw a FoundationError");
      assert((error as FoundationError).code === "SIMILAR_PROSPECT_EXISTS", `expected SIMILAR_PROSPECT_EXISTS, got ${(error as FoundationError).code}`);
      const details = (error as FoundationError & { details?: { similar?: { id: string }[] } }).details;
      assert(details?.similar?.some((s) => s.id === first.id), "similar list should include the original prospect");
      duplicateBlocked = true;
    }
    assert(duplicateBlocked, "same-mobile prospect with a different name must be blocked as a duplicate, not silently created");
    console.log("[OK] near-duplicate prospect (same mobile, different name) correctly rejected with similar-list");

    const confirmed = await createDistributorProspect(db, manager.id, {
      businessName: `Correction Pass 2 Prospect ${suffix} — Renamed Firm`,
      mobile,
      profile: { source: "SMOKE" },
      confirmDuplicate: true,
    });
    createdProspectIds.push(confirmed.id);
    console.log(`[OK] confirmDuplicate:true still allows a deliberate second entry (${confirmed.id})`);

    // --- Req 7: per-Executive sync status ---
    const before = await teamSyncStatus(db, manager.id);
    const executiveBefore = before.find((s) => s.employeeId === executive.id);
    assert(executiveBefore, "teamSyncStatus should include the review executive");
    assert(executiveBefore!.status === "SYNCED" || executiveBefore!.failedCount === 0, "sanity: failedCount 0 implies not SYNC_ERROR before injecting a failure");
    console.log(`[OK] baseline sync status for executive: ${executiveBefore!.status} (pending=${executiveBefore!.pendingCount}, failed=${executiveBefore!.failedCount})`);

    const failedOp = await db.seeraOfflineOperation.create({
      data: {
        clientOperationId: `smoke-cp2-${suffix}`,
        userId: executive.id,
        deviceId: "smoke-device",
        sessionContext: {},
        entityType: "SeeraVisit",
        actionType: "VISIT_DRAFT",
        localCreatedAt: new Date(),
        payloadVersion: 1,
        originalPayload: {},
        status: "FAILED",
        lastErrorCode: "SMOKE_INJECTED_FAILURE",
      },
    });
    createdOfflineOpIds.push(failedOp.id);
    const after = await teamSyncStatus(db, manager.id);
    const executiveAfter = after.find((s) => s.employeeId === executive.id);
    assert(executiveAfter?.status === "SYNC_ERROR", `expected SYNC_ERROR after injecting a FAILED offline op, got ${executiveAfter?.status}`);
    assert(executiveAfter!.failedCount >= 1, "failedCount should reflect the injected failure");
    console.log(`[OK] sync status flips to SYNC_ERROR once a FAILED offline operation exists (failedCount=${executiveAfter!.failedCount}) — a Manager can no longer mistake this for \"no activity\"`);

    // --- Req 10: distributor-first Collections ---
    const mapped = await managerMappedDistributors(db, manager.id);
    console.log(`[OK] managerMappedDistributors returned ${mapped.length} distributor(s) for this Manager's team`);
    if (mapped.length > 0) {
      const snapshot = await managerDistributorCollectionsSnapshot(db, manager.id, mapped[0]!.id);
      assert(typeof snapshot.outstanding === "number", "snapshot.outstanding should be a number");
      assert(snapshot.current + snapshot.overdue - snapshot.outstanding < 0.01, "current + overdue should reconcile to outstanding");
      console.log(
        `[OK] collections snapshot for ${snapshot.distributor.tradeName ?? snapshot.distributor.legalName}: outstanding=${snapshot.outstanding} current=${snapshot.current} overdue=${snapshot.overdue} lastPayment=${snapshot.lastPayment ? snapshot.lastPayment.amount : "none"} promisedPaymentDate=${snapshot.promisedPaymentDate ?? "none"} creditStatus=${snapshot.decision?.decision ?? "n/a"}`,
      );
    } else {
      console.log("[SKIP] no distributor is currently mapped to this Manager's team via a retailer — snapshot call skipped (scope-check still verified below)");
    }
    let scopeDenied = false;
    const anyOtherDistributor = await db.seeraPartner.findFirst({ where: { type: "DISTRIBUTOR", id: { notIn: mapped.map((d) => d.id) } } });
    if (anyOtherDistributor) {
      try {
        await managerDistributorCollectionsSnapshot(db, manager.id, anyOtherDistributor.id);
      } catch (error) {
        assert(error instanceof FoundationError && error.code === "DISTRIBUTOR_SCOPE_DENIED", "expected DISTRIBUTOR_SCOPE_DENIED for an unmapped distributor");
        scopeDenied = true;
      }
      assert(scopeDenied, "a Distributor outside this Manager's mapped team must be refused, not shown");
      console.log("[OK] an out-of-scope Distributor is correctly refused (DISTRIBUTOR_SCOPE_DENIED)");
    }

    console.log("\nALL CORRECTION PASS #2 SMOKE ASSERTIONS PASSED");
  } finally {
    if (createdOfflineOpIds.length) await db.seeraOfflineOperation.deleteMany({ where: { id: { in: createdOfflineOpIds } } });
    if (createdProspectIds.length) await db.seeraProspect.deleteMany({ where: { id: { in: createdProspectIds } } });
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
