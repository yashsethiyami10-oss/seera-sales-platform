import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay } from "../../lib/sales-distribution/workflow-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";
import { syncOfflineOperation } from "../../lib/phase-11/offline-sync-service";

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
const prisma = new PrismaClient({ datasourceUrl: test });

let pass = 0, fail = 0;
function check(label: string, ok: boolean) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}`); if (ok) pass++; else fail++; }

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const existing = await prisma.seeraWorkSession.findFirst({ where: { employeeId: executive.id, status: "ACTIVE" } });
  if (existing) await prisma.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date() } });

  const authorized = await executiveAuthorizedDistributors(prisma, executive.id);
  const session = await startFieldDay(prisma, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });

  console.log("Test 1 — ADD_CUSTOMER_DRAFT replay while session is ACTIVE succeeds and creates retailer+visit");
  const suffix = randomUUID().slice(0, 8);
  const clientOpId = randomUUID();
  const result1 = await syncOfflineOperation(prisma, executive.id, {
    clientOperationId: clientOpId,
    deviceId: "test-device-001",
    sessionContext: { sessionId: session.id, appVersion: "1", platform: "android" },
    entityType: "SeeraRetailer",
    actionType: "ADD_CUSTOMER_DRAFT",
    localCreatedAt: new Date(),
    payloadVersion: 1,
    payload: {
      businessName: `Offline Add Customer ${suffix}`,
      address: { area: "Test Area" },
      latitude: 28.6139,
      longitude: 77.209,
      confirmDuplicate: false,
      workSessionId: session.id,
    },
  });
  check("first replay succeeds", result1.status === "SYNCED");
  const createdRetailer = await prisma.seeraRetailer.findFirst({ where: { businessName: `Offline Add Customer ${suffix}` } });
  check("retailer actually created", Boolean(createdRetailer));
  const createdVisit = createdRetailer ? await prisma.seeraVisit.findFirst({ where: { retailerId: createdRetailer.id, workSessionId: session.id } }) : null;
  check("visit actually created and checked in", Boolean(createdVisit?.checkedInAt));

  console.log("\nTest 2 — replaying the SAME clientOperationId again is a safe idempotent no-op, not a duplicate");
  const beforeCount = await prisma.seeraRetailer.count({ where: { businessName: `Offline Add Customer ${suffix}` } });
  const result2 = await syncOfflineOperation(prisma, executive.id, {
    clientOperationId: clientOpId,
    deviceId: "test-device-001",
    sessionContext: { sessionId: session.id, appVersion: "1", platform: "android" },
    entityType: "SeeraRetailer",
    actionType: "ADD_CUSTOMER_DRAFT",
    localCreatedAt: new Date(),
    payloadVersion: 1,
    payload: {
      businessName: `Offline Add Customer ${suffix}`,
      address: { area: "Test Area" },
      latitude: 28.6139,
      longitude: 77.209,
      confirmDuplicate: false,
      workSessionId: session.id,
    },
  });
  check("replay of same clientOperationId also reports SYNCED (idempotent)", result2.status === "SYNCED");
  const afterCount = await prisma.seeraRetailer.count({ where: { businessName: `Offline Add Customer ${suffix}` } });
  check("no duplicate retailer created on replay", afterCount === beforeCount);

  console.log("\nTest 3 — ADD_CUSTOMER_DRAFT against a STALE (ended) session is correctly rejected, not silently accepted");
  await endFieldDay(prisma, executive.id, session.id, { outcome: "COMPLETED" });
  const suffix2 = randomUUID().slice(0, 8);
  let staleRejected = false;
  let staleCode: string | undefined;
  try {
    await syncOfflineOperation(prisma, executive.id, {
      clientOperationId: randomUUID(),
      deviceId: "test-device-001",
      sessionContext: { sessionId: session.id, appVersion: "1", platform: "android" },
      entityType: "SeeraRetailer",
      actionType: "ADD_CUSTOMER_DRAFT",
      localCreatedAt: new Date(),
      payloadVersion: 1,
      payload: {
        businessName: `Offline Add Customer Stale ${suffix2}`,
        address: { area: "Test Area" },
        latitude: 28.6139,
        longitude: 77.209,
        confirmDuplicate: false,
        workSessionId: session.id,
      },
    });
  } catch (e) {
    staleRejected = true;
    staleCode = (e as { code?: string }).code;
  }
  // syncOfflineOperation may catch internally and return a FAILED/CONFLICT status instead of throwing —
  // check both possibilities.
  const staleRetailer = await prisma.seeraRetailer.findFirst({ where: { businessName: `Offline Add Customer Stale ${suffix2}` } });
  check("stale-session replay did NOT create a retailer (rejected one way or another)", !staleRetailer);
  console.log(`  (stale replay: threw=${staleRejected}${staleCode ? ` code=${staleCode}` : ""})`);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  const cleanupRetailers = await prisma.seeraRetailer.findMany({ where: { businessName: { contains: "Offline Add Customer" } }, select: { id: true } });
  const retailerIds = cleanupRetailers.map((r) => r.id);
  await prisma.seeraGpsSample.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraVisit.deleteMany({ where: { retailerId: { in: retailerIds } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "SeeraRetailer", entityId: { in: retailerIds } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "SeeraOfflineOperation" } }).catch(() => {});
  await prisma.seeraOfflineOperation.deleteMany({ where: { deviceId: "test-device-001" } }).catch(() => {});
  await prisma.seeraRetailer.deleteMany({ where: { id: { in: retailerIds } } });
  await prisma.seeraWorkSession.delete({ where: { id: session.id } });
  console.log("done.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
