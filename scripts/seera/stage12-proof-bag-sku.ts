import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createCompanyOrder, dispatchCompanyOrder, receiveIncomingOrder } from "../../lib/sales-distribution/workflow-service";
import { submitPaymentProof, reviewPaymentProof } from "../../lib/sales-distribution/operational-service";

// STAGE 12 proof: BAG-unit SKU (Shine Plus Powder 3kg — 1 Bag = 10 pcs, Founder-explicit "NOT per
// piece"). Same wholesaleOrderUnitToCanonicalPieces conversion boundary as the BOX SKUs already
// proven (Cake Blue/White) — this closes the explicit "another BAG SKU" requirement.

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
const db = new PrismaClient({ datasourceUrl: test });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const accountsManager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const bagSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-SHINEPLUS-POWDER-3KG" } });

  const before = await db.seeraInventoryMovement.aggregate({ where: { partyType: "SUPER_STOCKIST", partyId: ss1.id, skuId: bagSku.id, direction: "IN" }, _sum: { quantity: true } });
  const beforeSum = Number(before._sum.quantity ?? 0);

  const co = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `s12-bag-${suffix}`, lines: [{ skuId: bagSku.id, quantity: 3 }] });
  assert(Number(co.total) === 1380 * 3, `expected 3 x Bag rate 1380 = 4140, got ${co.total}`);
  const proof = await submitPaymentProof(db, ss1Owner.id, ss1.id, { orderId: co.id, amount: Number(co.total), reference: `UTR-BAG-${suffix}`, idempotencyKey: `s12-bag-proof-${suffix}` });
  await reviewPaymentProof(db, accountsManager.id, { proofId: proof.id, status: "VERIFIED", reason: "Stage 12 BAG SKU proof" });
  await dispatchCompanyOrder(db, accountsManager.id, { orderId: co.id, idempotencyKey: `s12-bag-dispatch-${suffix}`, vehicleNumber: "MH-04-BAG-0001" });
  await receiveIncomingOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: co.id, lines: [{ lineId: co.lines[0]!.id, quantity: 3 }], idempotencyKey: `s12-bag-receive-${suffix}` });

  const after = await db.seeraInventoryMovement.aggregate({ where: { partyType: "SUPER_STOCKIST", partyId: ss1.id, skuId: bagSku.id, direction: "IN" }, _sum: { quantity: true } });
  const afterSum = Number(after._sum.quantity ?? 0);
  assert(afterSum - beforeSum === 30, `expected physical onHand to increase by exactly 30 pieces (3 Bags x 10 pcs/Bag), got delta=${afterSum - beforeSum}`);
  console.log(`[RESULT] OK — BAG SKU (Shine Plus Powder 3kg): ordered 3 Bags, physical ledger correctly increased by 30 pieces (not 3)`);

  console.log("\nALL STAGE 12 BAG-SKU PROOF CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
