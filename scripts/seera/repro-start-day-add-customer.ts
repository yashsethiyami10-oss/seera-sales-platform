import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay } from "../../lib/sales-distribution/workflow-service";
import { createRetailerAndCheckIn } from "../../lib/sales-distribution/field-portal-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";

// Reproduces the EXACT Start Day -> Add Customer sequence the Sales Executive field app performs,
// with real timing measurements per step, against TEST DB, using a fresh employee identity so no
// stale prior-session state can mask a real bug.

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
url.searchParams.set("connection_limit", "3");
url.searchParams.set("connect_timeout", "20");
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`  [${Date.now() - start}ms] ${label} OK`);
    return result;
  } catch (e) {
    console.log(`  [${Date.now() - start}ms] ${label} THREW: ${e instanceof Error ? `${e.name}: ${e.message} (code=${(e as { code?: string }).code})` : e}`);
    throw e;
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });

  // Clean slate: end any existing active session for this executive (mirrors what a real fresh
  // "Start Day" screen would see if a prior test left one open).
  const existing = await prisma.seeraWorkSession.findFirst({ where: { employeeId: executive.id, status: "ACTIVE" } });
  if (existing) await prisma.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date() } });

  const authorized = await timed("executiveAuthorizedDistributors (Start Day dropdown population)", () => executiveAuthorizedDistributors(prisma, executive.id));
  if (!authorized.length) throw new Error("No authorized distributor for review-sales-executive-1 in current TEST DB state — cannot reproduce realistically");
  console.log(`  authorized distributors: ${authorized.length}`);

  console.log("\nStep 1 — Start Day");
  const session = await timed("startFieldDay", () =>
    startFieldDay(prisma, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 }),
  );

  console.log("\nStep 2 — Add Customer + auto check-in (createRetailerAndCheckIn), immediately after Start Day");
  const suffix = randomUUID().slice(0, 8);
  const result = await timed("createRetailerAndCheckIn", () =>
    createRetailerAndCheckIn(prisma, executive.id, {
      businessName: `Repro Customer ${suffix}`,
      address: { area: "Test Area" },
      ownerName: "Owner Name",
      mobile: "9876543210",
      customerType: "RETAILER",
      latitude: 28.6139,
      longitude: 77.209,
      accuracy: 15,
      confirmDuplicate: false,
      idempotencyKey: randomUUID(),
      workSessionId: session.id,
      checkInIdempotencyKey: randomUUID(),
    }),
  );
  console.log(`\n  retailer.id=${result.retailer.id} visit.id=${result.visit.id}`);

  console.log("\nStep 3 — repeat Add Customer for a SECOND customer in the same session (mimics 'multiple photos'-style repeated real usage)");
  const suffix2 = randomUUID().slice(0, 8);
  await timed("createRetailerAndCheckIn (2nd customer)", () =>
    createRetailerAndCheckIn(prisma, executive.id, {
      businessName: `Repro Customer 2 ${suffix2}`,
      address: { area: "Test Area 2" },
      latitude: 28.62,
      longitude: 77.21,
      confirmDuplicate: false,
      idempotencyKey: randomUUID(),
      workSessionId: session.id,
      checkInIdempotencyKey: randomUUID(),
    }).catch((e) => {
      console.log(`  (expected if visit 1 still open) code=${(e as { code?: string }).code}`);
      throw e;
    }),
  ).catch(() => undefined);

  console.log("\n=== Cleanup ===");
  await prisma.seeraGpsSample.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraVisit.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraRetailer.deleteMany({ where: { businessName: { contains: "Repro Customer" } } });
  await prisma.seeraWorkSession.delete({ where: { id: session.id } });
  console.log("done.");
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
