import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { seedDetergentCakeMaterials, seedDefaultManufacturingLocation } from "../../lib/manufacturing/material-service";
import { ensureDefaultTreasuryAccounts } from "../../lib/finance/treasury-service";
import { createRetailer } from "../../lib/sales-distribution/field-portal-service";
import { partyLedgerStatement, partyOutstandingForGuidedReceipt, ledgerPartyOptions } from "../../lib/finance/party-ledger-service";

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

  // ---- Rule 7/9: idempotent detergent-cake material + location seed ----
  console.log("=== Rule 7/9: material + location bootstrap (idempotent) ===");
  const materialsFirst = await seedDetergentCakeMaterials(prisma, founder.id);
  check("14 detergent-cake materials created/found", materialsFirst.length === 14);
  const materialsSecond = await seedDetergentCakeMaterials(prisma, founder.id);
  check("re-running is idempotent (still 14, no dupes)", materialsSecond.length === 14);
  const materialCountInDb = await prisma.seeraManufacturingMaterial.count({ where: { code: { startsWith: "RM-" } } });
  check("exactly 14 RM- rows exist in the DB (no duplicates from double-seed)", materialCountInDb === 14);
  const expectedCodes = ["RM-SLURRY", "RM-SODA-ASH", "RM-DOLOMITE", "RM-CHINA-CLAY", "RM-AOS", "RM-SLES", "RM-POLYMER", "RM-SODIUM-SILICATE", "RM-COLOUR", "RM-PERFUME", "RM-CAUSTIC", "RM-SALT", "RM-COLOUR-GRADIENTS", "RM-CBSX"];
  const actualCodes = new Set(materialsFirst.map((m) => m.code));
  check("all 14 named materials present (Slurry..CBSX)", expectedCodes.every((c) => actualCodes.has(c)));

  const locationFirst = await seedDefaultManufacturingLocation(prisma, founder.id);
  const locationSecond = await seedDefaultManufacturingLocation(prisma, founder.id);
  check("location bootstrap is idempotent (same id both calls)", locationFirst.id === locationSecond.id);
  const locationCountInDb = await prisma.seeraManufacturingLocation.count({ where: { code: "RM-STORE-MAIN" } });
  check("exactly 1 RM-STORE-MAIN location exists", locationCountInDb === 1);

  // ---- Rule 10: idempotent treasury bootstrap ----
  console.log("\n=== Rule 10: treasury bootstrap (idempotent) ===");
  const treasuryFirst = await ensureDefaultTreasuryAccounts(prisma, founder.id);
  check("2 default treasury accounts created/found (Cash + Bank)", treasuryFirst.length === 2);
  const treasurySecond = await ensureDefaultTreasuryAccounts(prisma, founder.id);
  check("re-running returns the SAME account ids (idempotent, no dupes)", treasuryFirst.map((t) => t.id).sort().join(",") === treasurySecond.map((t) => t.id).sort().join(","));
  const treasuryCountInDb = await prisma.seeraTreasuryAccount.count({ where: { code: { in: ["CASH-MAIN", "BANK-MAIN"] } } });
  check("exactly 2 rows exist in the DB (no duplicate accounts)", treasuryCountInDb === 2);

  // ---- Rule 11/12: Retail Customer ledger (RETAILER party type) ----
  console.log("\n=== Rule 11/12: Retail Customer ledger extension ===");
  const retailer = await createRetailer(prisma, founder.id, {
    businessName: `P0.2 Ledger Test Customer ${suffix}`,
    address: { line: "Test address" },
    mobile: "9876543210",
    idempotencyKey: `md2-retailer-${suffix}`,
  });
  check("test retailer created", Boolean(retailer.id));

  const optionsIncludeRetailer = await ledgerPartyOptions(prisma, founder.id, "RETAILER");
  check("ledgerPartyOptions(RETAILER) includes the new retailer", optionsIncludeRetailer.some((p) => p.id === retailer.id));

  // Simulate a real, already-posted retailer invoice the way billing-service.ts's issueBillingDraft
  // actually creates one (debitPartyType/Id = buyer, creditPartyType/Id = issuer) — verifying the
  // READ side (retailerLedger) against a realistically-shaped row. The WRITE side (billing-service.ts
  // genuinely using buyerType "RETAILER") was confirmed by direct code inspection, not re-run here —
  // reproducing the full order->fulfilment->billing-draft->issue pipeline was out of scope for this
  // pass; see the final report for this explicit limitation.
  const invoiceEntry = await prisma.seeraFinancialEntry.create({
    data: {
      entryNumber: `TESTINV-${suffix}`,
      type: "INVOICE",
      status: "POSTED",
      debitPartyType: "RETAILER",
      debitPartyId: retailer.id,
      creditPartyType: "COMPANY",
      creditPartyId: "COMPANY",
      amount: 5000,
      commercialSnapshot: {},
      actorId: founder.id,
      reason: "Test invoice for ledger verification",
      idempotencyKey: `md2-invoice-${suffix}`,
      postedAt: new Date(),
    },
  });
  const paymentEntry = await prisma.seeraFinancialEntry.create({
    data: {
      entryNumber: `TESTPAY-${suffix}`,
      type: "PAYMENT",
      status: "POSTED",
      debitPartyType: "COMPANY",
      debitPartyId: "COMPANY",
      creditPartyType: "RETAILER",
      creditPartyId: retailer.id,
      amount: 2000,
      commercialSnapshot: {},
      actorId: founder.id,
      reason: "Test payment for ledger verification",
      idempotencyKey: `md2-payment-${suffix}`,
      postedAt: new Date(),
    },
  });

  const statement = await partyLedgerStatement(prisma, founder.id, { partyType: "RETAILER", partyId: retailer.id });
  check("statement party name matches the retailer", statement.party.name === retailer.businessName);
  check("statement normalSide is DEBIT (receivable)", statement.normalSide === "DEBIT");
  check("statement shows exactly 2 rows (invoice + payment)", statement.rows.length === 2);
  check("closing balance = 5000 - 2000 = 3000 (real receivable outstanding)", statement.totals.closingBalance === 3000);

  const outstanding = await partyOutstandingForGuidedReceipt(prisma, founder.id, { partyType: "RETAILER", partyId: retailer.id });
  check("partyOutstandingForGuidedReceipt(RETAILER) does not throw for a real retailer", outstanding !== undefined);

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraFinancialEntry.deleteMany({ where: { id: { in: [invoiceEntry.id, paymentEntry.id] } } });
  await prisma.seeraRetailer.delete({ where: { id: retailer.id } });
  const remainingEntries = await prisma.seeraFinancialEntry.count({ where: { id: { in: [invoiceEntry.id, paymentEntry.id] } } });
  const remainingRetailer = await prisma.seeraRetailer.count({ where: { id: retailer.id } });
  console.log(`Remaining: financialEntries=${remainingEntries} retailer=${remainingRetailer}`);
  if (remainingEntries !== 0 || remainingRetailer !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete. (Materials/location/treasury bootstrap rows are intentionally PERMANENT master data, not cleaned up.)");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
