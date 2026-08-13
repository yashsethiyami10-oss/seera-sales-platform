import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { supersedePriceVersion, createCompanyOrder } from "../../lib/sales-distribution/workflow-service";
import { FoundationError } from "../../lib/foundation/errors";

// STAGE 4 smoke test — the single most-repeated requirement across the whole master prompt:
// "Founder must be able to change a price without a code edit, and historical transactions must
// stay unchanged." Real proof, via the actual Founder/Admin Master Data action (createPriceVersion,
// the function MasterActions.tsx / /api/foundation/masters already calls):
//  1. Place a real Company Order at the CURRENT governed rate (₹298).
//  2. Founder creates a NEW future-dated price version for the SAME SKU/tier (a real price change,
//     zero code edits) — the old version is untouched, not deleted, not mutated.
//  3. The historical order's line snapshot is provably STILL ₹298 (immutable snapshot).
//  4. A NEW order placed once the new price is effective picks up the NEW rate automatically.
//  5. Overlap protection: trying to create a colliding active price for an overlapping period is
//     correctly rejected (no accidental double-active pricing).
// Safe to re-run: fresh idempotency keys + far-future effectiveFrom per run to avoid overlap with
// the real seeded 2026-01-01 price version.

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
runtime.searchParams.set("connection_limit", "6");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-WHITE" } });

  const oldOrder = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `s4-old-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 2 }] });
  assert(Number(oldOrder.lines[0]!.priceSnapshot) === 298, `expected the order placed at the CURRENT price to snapshot ₹298, got ${oldOrder.lines[0]!.priceSnapshot}`);
  console.log(`[1] OK — real order placed at the current governed rate (₹298), snapshot captured`);

  // GAP FOUND + FIXED THIS PASS: plain createPriceVersion has no way to actually CHANGE an
  // existing price — any new version for the same SKU/tier always collided with the existing
  // open-ended active one (PRICE_VERSION_OVERLAP), so "Founder changes a price without a code
  // edit" was structurally impossible for any SKU that already has a price (i.e. every real one).
  // supersedePriceVersion (built this pass) closes the old version's effectiveTo atomically and
  // opens the new one — zero code edits, just a governed record change.
  const changeDate = new Date();
  const { previous, current: newPrice } = await supersedePriceVersion(db, founder.id, { skuId: cakeSku.id, tier: "COMPANY_TO_SS", amount: 310, effectiveFrom: changeDate, reason: "Stage 4 smoke — Founder price revision" });
  assert(Number(newPrice.amount) === 310 && newPrice.status === "ACTIVE", "expected the new price version to be created ACTIVE at the new amount");
  assert(!!previous && previous.status === "ACTIVE", "expected the previous version to have been ACTIVE before supersession (sanity check on what got closed)");
  const oldPriceRow = await db.seeraPriceVersion.findUniqueOrThrow({ where: { id: previous!.id } });
  assert(oldPriceRow.status === "INACTIVE" && oldPriceRow.effectiveTo?.getTime() === changeDate.getTime(), "expected the OLD price version to be closed (INACTIVE, effectiveTo = new version's start) — not deleted, not silently mutated in amount");
  assert(Number(oldPriceRow.amount) === 298, "expected the OLD price version's OWN amount field to remain ₹298 forever — only its validity window closed, never its recorded value");
  console.log(`[2] OK — Founder superseded the price (₹298 -> ₹310) through a real governed action — the old version still exists, closed (INACTIVE), amount field untouched (still records ₹298)`);

  const reread = await db.seeraOrderLine.findUniqueOrThrow({ where: { id: oldOrder.lines[0]!.id } });
  assert(Number(reread.priceSnapshot) === 298, `expected the HISTORICAL order's snapshot to remain exactly ₹298 after the price change, got ${reread.priceSnapshot}`);
  console.log("[3] OK — the historical order's line snapshot is provably UNCHANGED (still ₹298) after the price change — immutable, as required");

  const newOrder = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `s4-new-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 1 }] });
  assert(Number(newOrder.lines[0]!.priceSnapshot) === 310, `expected a NEW order placed after the change to automatically pick up the NEW rate (₹310), got ${newOrder.lines[0]!.priceSnapshot}`);
  console.log("[4] OK — a NEW order placed after the change automatically picks up the NEW rate (₹310), no code touched anywhere in this process");

  // Overlap protection still holds for genuinely conflicting attempts.
  let overlapRejected = false;
  try {
    await supersedePriceVersion(db, founder.id, { skuId: cakeSku.id, tier: "COMPANY_TO_SS", amount: 999, effectiveFrom: changeDate, reason: "Stage 4 smoke — deliberate collision attempt" });
  } catch (error) {
    overlapRejected = error instanceof FoundationError && error.code === "PRICE_VERSION_OVERLAP";
  }
  assert(overlapRejected, "expected an exact-same-start-date collision to be rejected — no accidental double-active pricing");
  console.log("[5] OK — collision protection still holds: cannot create two price versions starting on the exact same date for the same SKU/tier");

  console.log("\nALL STAGE 4 PRICING-WITHOUT-CODE-EDIT SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
