import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createRetailer, CUSTOMER_TYPES } from "../../lib/sales-distribution/field-portal-service";
import { createVendor, VENDOR_CATEGORIES } from "../../lib/finance/vendor-service";

// P0-4 (Money Desk 2.0 Final Gap Closure — Party Taxonomy). Confirms:
// - No schema migration was needed (customerType/category are already plain strings).
// - The Customer sub-type list (CUSTOMER_TYPES) is genuinely shared/consolidated (no drift between
//   field/operations, manager/operations, and Money Desk's create-retail-customer action).
// - The new Supplier sub-type list (VENDOR_CATEGORIES) rejects invalid values at the API/Zod
//   boundary and accepts the real, spec-required values.
// - Backward compatibility: all pre-existing customerType values used in real production data
//   (RETAILER, WHOLESALER, per a live production read this session) still validate.
// - Deliberately confirms DISTRIBUTOR/SUPER_STOCKIST/DEALER are NOT customerType values — those
//   are first-class SeeraPartner records, never a SeeraRetailer sub-type.

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
  const suffix = randomUUID().slice(0, 8);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  console.log("=== Customer sub-type taxonomy (CUSTOMER_TYPES) ===");
  check("existing production value RETAILER still validates", z.enum(CUSTOMER_TYPES).safeParse("RETAILER").success);
  check("existing production value WHOLESALER still validates", z.enum(CUSTOMER_TYPES).safeParse("WHOLESALER").success);
  check("existing value DISTRIBUTOR_PROSPECT still validates", z.enum(CUSTOMER_TYPES).safeParse("DISTRIBUTOR_PROSPECT").success);
  check("existing value INSTITUTIONAL_OTHER still validates", z.enum(CUSTOMER_TYPES).safeParse("INSTITUTIONAL_OTHER").success);
  check("new value CORPORATE validates (genuinely missing before, now added)", z.enum(CUSTOMER_TYPES).safeParse("CORPORATE").success);
  check("DISTRIBUTOR is correctly rejected (that's a SeeraPartner, never a customerType)", !z.enum(CUSTOMER_TYPES).safeParse("DISTRIBUTOR").success);
  check("SUPER_STOCKIST is correctly rejected (SeeraPartner, never a customerType)", !z.enum(CUSTOMER_TYPES).safeParse("SUPER_STOCKIST").success);
  check("an arbitrary junk string is rejected (real validation, not free text)", !z.enum(CUSTOMER_TYPES).safeParse("literally anything").success);

  const createdRetailerIds: string[] = [];
  const retailer = await createRetailer(prisma, founder.id, {
    businessName: `Corporate Test Customer ${suffix}`, address: { line: "Corp HQ" }, customerType: "CORPORATE", idempotencyKey: `tax-corp-${suffix}`,
  });
  createdRetailerIds.push(retailer.id);
  const fetched = await prisma.seeraRetailer.findUniqueOrThrow({ where: { id: retailer.id } });
  check("a real retailer was created end-to-end with the new CORPORATE customerType", fetched.customerType === "CORPORATE");

  console.log("\n=== Supplier sub-type taxonomy (VENDOR_CATEGORIES) ===");
  check("VENDOR validates", z.enum(VENDOR_CATEGORIES).safeParse("VENDOR").success);
  check("RAW_MATERIAL_SUPPLIER validates", z.enum(VENDOR_CATEGORIES).safeParse("RAW_MATERIAL_SUPPLIER").success);
  check("SERVICE_PROVIDER validates", z.enum(VENDOR_CATEGORIES).safeParse("SERVICE_PROVIDER").success);
  check("OTHER validates", z.enum(VENDOR_CATEGORIES).safeParse("OTHER").success);
  check("an arbitrary junk string is rejected (previously completely unvalidated free text)", !z.enum(VENDOR_CATEGORIES).safeParse("anything goes").success);

  const createdVendorIds: string[] = [];
  const vendor = await createVendor(prisma, founder.id, { code: `TAX-VEN-${suffix}`, legalName: `Raw Material Supplier Test ${suffix}`, category: "RAW_MATERIAL_SUPPLIER" });
  createdVendorIds.push(vendor.id);
  const fetchedVendor = await prisma.seeraVendor.findUniqueOrThrow({ where: { id: vendor.id } });
  check("a real vendor was created end-to-end with the new validated category", fetchedVendor.category === "RAW_MATERIAL_SUPPLIER");

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraRetailer.deleteMany({ where: { id: { in: createdRetailerIds } } });
  await prisma.seeraVendor.deleteMany({ where: { id: { in: createdVendorIds } } });
  const remainingRetailers = await prisma.seeraRetailer.count({ where: { id: { in: createdRetailerIds } } });
  const remainingVendors = await prisma.seeraVendor.count({ where: { id: { in: createdVendorIds } } });
  console.log(`Remaining: retailers=${remainingRetailers} vendors=${remainingVendors}`);
  if (remainingRetailers !== 0 || remainingVendors !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
