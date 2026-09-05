import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay } from "../../lib/sales-distribution/workflow-service";
import { createRetailerAndCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { finalizeFieldPhotoUpload } from "../../lib/sales-distribution/field-photo-cloudinary-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";

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
url.searchParams.set("connection_limit", "8");
url.searchParams.set("connect_timeout", "20");
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  console.log(`  [${Date.now() - start}ms] ${label}`);
  return result;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  await prisma.$queryRaw`SELECT 1`; // warm the connection before timing anything
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const existing = await prisma.seeraWorkSession.findFirst({ where: { employeeId: executive.id, status: "ACTIVE" } });
  if (existing) await prisma.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date() } });

  console.log("=== Start Day ===");
  const authorized = await executiveAuthorizedDistributors(prisma, executive.id);
  const session = await timed("startFieldDay", () =>
    startFieldDay(prisma, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 }),
  );

  console.log("\n=== Add Customer (createRetailerAndCheckIn) ===");
  const suffix = randomUUID().slice(0, 8);
  const { visit } = await timed("createRetailerAndCheckIn", () =>
    createRetailerAndCheckIn(prisma, executive.id, {
      businessName: `Timing Repro ${suffix}`,
      address: { area: "Test Area" },
      latitude: 28.6139,
      longitude: 77.209,
      confirmDuplicate: false,
      idempotencyKey: randomUUID(),
      workSessionId: session.id,
      checkInIdempotencyKey: randomUUID(),
    }),
  );

  console.log("\n=== Photo finalize (finalizeFieldPhotoUpload, DB-write step only - no real Cloudinary call) ===");
  try {
    await timed("finalizeFieldPhotoUpload (expected to fail signature check, timing the DB path up to that point)", () =>
      finalizeFieldPhotoUpload(prisma, executive.id, {
        visitId: visit.id,
        photoType: "SHOPFRONT",
        publicId: `seera/field-photos/${visit.id}/repro-timing`,
        version: 1,
        signature: "invalid-signature-for-timing-only",
        secureUrl: `https://res.cloudinary.com/test/image/upload/v1/seera/field-photos/${visit.id}/repro-timing.jpg`,
        bytes: 500000,
        width: 1600,
        height: 1200,
        format: "jpg",
      }),
    );
  } catch (e) {
    console.log(`  (expected rejection: ${(e as { code?: string }).code})`);
  }

  console.log("\n=== Checkout ===");
  await timed("executiveCheckOut (NO_ORDER)", () =>
    executiveCheckOut(prisma, executive.id, visit.id, {
      outcome: "NO_ORDER",
      noOrderReason: "Timing repro",
      photoExceptionReason: "Timing repro - no real photo",
      latitude: 28.614,
      longitude: 77.2091,
      idempotencyKey: randomUUID(),
    }),
  );

  console.log("\n=== End Day ===");
  await timed("endFieldDay", () => endFieldDay(prisma, executive.id, session.id, { outcome: "COMPLETED" }));

  console.log("\n=== Cleanup ===");
  await prisma.seeraGpsSample.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraVisit.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraRetailer.deleteMany({ where: { businessName: { contains: "Timing Repro" } } });
  await prisma.seeraTravelEstimate.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraTaClaim.deleteMany({ where: { travelEstimateId: undefined, employeeId: executive.id, claimDate: { gte: new Date(Date.now() - 60000) } } }).catch(() => {});
  await prisma.seeraWorkSession.delete({ where: { id: session.id } });
  console.log("done.");
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
