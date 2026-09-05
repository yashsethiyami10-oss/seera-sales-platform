import { readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createRetailer } from "../../lib/sales-distribution/field-portal-service";

// Lightweight, direct verification of the Part 2 fixes (distributor-scope authorization on
// createRetailer + GSTIN duplicate detection) — deliberately avoids the heavy TRUNCATE-based
// test-context.ts setup() (which has hit repeated transient Neon connectivity drops today).
// Creates a handful of disposable TEST fixtures directly, verifies, then cleans them up itself.

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

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const suffix = randomBytes(5).toString("hex");
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });

  const ownDistributor = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `D-SCOPE-${suffix}`, legalName: `Own Distributor ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000001" }, addresses: { city: "Test" }, territoryIds: [], createdById: founder.id } });
  const otherDistributor = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `D-OTHER-${suffix}`, legalName: `Unrelated Distributor ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000002" }, addresses: { city: "Test" }, territoryIds: [], createdById: founder.id } });
  // Give the Executive retailer-derived authorization to ownDistributor only.
  const seedRetailer = await prisma.seeraRetailer.create({ data: { code: `R-SCOPE-${suffix}`, businessName: `Seed Retailer ${suffix}`, address: { city: "Test" }, normalizedMobile: "", distributorId: ownDistributor.id, salespersonId: executive.id, lifecycle: "ACTIVE", createdById: founder.id } });

  const createdRetailerIds: string[] = [seedRetailer.id];
  let failures = 0;
  try {
    console.log("Test 1 — createRetailer with an UNRELATED distributorId must be rejected");
    try {
      await createRetailer(prisma, executive.id, { businessName: `Cross-Network ${suffix}`, address: { city: "Test" }, distributorId: otherDistributor.id, idempotencyKey: `xnet-${suffix}` });
      console.log("  FAIL — did not throw");
      failures++;
    } catch (e) {
      const ok = (e as { code?: string })?.code === "DISTRIBUTOR_NOT_AUTHORIZED";
      console.log(`  ${ok ? "PASS" : "FAIL"} — code=${(e as { code?: string })?.code}`);
      if (!ok) failures++;
    }
    const leaked = await prisma.seeraRetailer.count({ where: { distributorId: otherDistributor.id } });
    console.log(`  retailers created under unrelated distributor (expect 0): ${leaked}`);
    if (leaked !== 0) failures++;

    console.log("\nTest 2 — createRetailer with the Executive's OWN authorized distributorId must succeed");
    const created = await createRetailer(prisma, executive.id, { businessName: `Own-Network ${suffix}`, address: { city: "Test" }, distributorId: ownDistributor.id, idempotencyKey: `ownnet-${suffix}` });
    createdRetailerIds.push(created.id);
    const ok2 = created.distributorId === ownDistributor.id;
    console.log(`  ${ok2 ? "PASS" : "FAIL"} — distributorId=${created.distributorId}`);
    if (!ok2) failures++;

    console.log("\nTest 3 — GSTIN duplicate detection catches a match even with a different name/mobile");
    const gstin = `09GSTX${suffix.slice(0, 9).toUpperCase()}Z5`;
    const original = await createRetailer(prisma, executive.id, { businessName: `GSTIN Original ${suffix}`, address: { city: "Test" }, distributorId: ownDistributor.id, gstin, idempotencyKey: `gstin-orig-${suffix}` });
    createdRetailerIds.push(original.id);
    try {
      const dup = await createRetailer(prisma, executive.id, { businessName: `Totally Different Name ${suffix}`, mobile: "9999999999", address: { city: "Test" }, distributorId: ownDistributor.id, gstin, idempotencyKey: `gstin-dup-${suffix}` });
      createdRetailerIds.push(dup.id);
      console.log("  FAIL — did not throw SIMILAR_RETAILER_EXISTS");
      failures++;
    } catch (e) {
      const ok3 = (e as { code?: string })?.code === "SIMILAR_RETAILER_EXISTS";
      console.log(`  ${ok3 ? "PASS" : "FAIL"} — code=${(e as { code?: string })?.code}`);
      if (!ok3) failures++;
    }

    console.log(`\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`} ===`);
  } finally {
    console.log("\nCleanup — removing disposable TEST fixtures...");
    await prisma.seeraRetailer.deleteMany({ where: { id: { in: createdRetailerIds } } });
    await prisma.seeraPartner.deleteMany({ where: { id: { in: [ownDistributor.id, otherDistributor.id] } } });
    console.log("done.");
  }
  if (failures > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
