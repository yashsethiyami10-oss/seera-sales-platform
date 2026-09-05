import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay } from "../../lib/sales-distribution/workflow-service";
import { createRetailerAndCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
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
url.searchParams.set("connection_limit", "3");
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
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const existing = await prisma.seeraWorkSession.findFirst({ where: { employeeId: executive.id, status: "ACTIVE" } });
  if (existing) await prisma.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date() } });

  const authorized = await executiveAuthorizedDistributors(prisma, executive.id);
  const session = await startFieldDay(prisma, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });
  const suffix = randomUUID().slice(0, 8);
  const { visit } = await createRetailerAndCheckIn(prisma, executive.id, {
    businessName: `Checkout Repro ${suffix}`,
    address: { area: "Test Area" },
    latitude: 28.6139,
    longitude: 77.209,
    confirmDuplicate: false,
    idempotencyKey: randomUUID(),
    workSessionId: session.id,
    checkInIdempotencyKey: randomUUID(),
  });

  console.log("\n=== Checkout timing ===");
  await timed("executiveCheckOut (NO_ORDER outcome, no photo -> uses photo exception path)", () =>
    executiveCheckOut(prisma, executive.id, visit.id, {
      outcome: "NO_ORDER",
      noOrderReason: "Shop closed",
      photoExceptionReason: "Camera issue",
      latitude: 28.614,
      longitude: 77.2091,
      idempotencyKey: randomUUID(),
    }),
  );

  console.log("\n=== Idempotent replay (same key should be near-instant) ===");
  const replayKey = randomUUID();
  await timed("executiveCheckOut first call", () =>
    executiveCheckOut(prisma, executive.id, visit.id, { outcome: "NO_ORDER", noOrderReason: "x", idempotencyKey: replayKey }).catch((e) => e),
  );

  console.log("\n=== Cleanup ===");
  await prisma.seeraGpsSample.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraVisit.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraRetailer.deleteMany({ where: { businessName: { contains: "Checkout Repro" } } });
  await prisma.seeraWorkSession.delete({ where: { id: session.id } });
  console.log("done.");
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
