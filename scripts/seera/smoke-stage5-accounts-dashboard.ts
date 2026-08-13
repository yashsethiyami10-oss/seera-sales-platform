import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createCompanyOrder } from "../../lib/sales-distribution/workflow-service";
import { submitPaymentProof } from "../../lib/sales-distribution/operational-service";
import { submitPartnerPayment } from "../../lib/sales-distribution/operational-service";
import { accountsDashboardSummary } from "../../lib/sales-distribution/financial-service";

// STAGE 5 smoke test — the Accounts dashboard had NO real aggregation function (only a UI label) —
// proves the new accountsDashboardSummary reflects REAL pending work, not fabricated/static counts.

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
  const suffix = Date.now();
  const accountsManager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });

  const before = await accountsDashboardSummary(db, accountsManager.id);

  const order = await createCompanyOrder(db, ss1Owner.id, ss1.id, { idempotencyKey: `s5-order-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 1 }] });
  await submitPaymentProof(db, ss1Owner.id, ss1.id, { orderId: order.id, amount: Number(order.total), reference: `UTR-S5-${suffix}`, idempotencyKey: `s5-proof-${suffix}` });
  await submitPartnerPayment(db, distributorOwner.id, { partnerType: "DISTRIBUTOR", partnerId: distributor1.id, amount: 1000, reference: `UTR-S5B-${suffix}`, paymentMode: "BANK_TRANSFER", paymentDate: new Date(), idempotencyKey: `s5-payment-${suffix}` });

  const after = await accountsDashboardSummary(db, accountsManager.id);
  assert(after.cards.companyProofsPending === before.cards.companyProofsPending + 1, `expected companyProofsPending to increase by exactly 1, went ${before.cards.companyProofsPending} -> ${after.cards.companyProofsPending}`);
  assert(after.cards.partnerPaymentsPending === before.cards.partnerPaymentsPending + 1, `expected partnerPaymentsPending to increase by exactly 1, went ${before.cards.partnerPaymentsPending} -> ${after.cards.partnerPaymentsPending}`);
  const hasCompanyAttention = after.attention.some((a) => a.code === "COMPANY_PROOF_PENDING");
  const hasPartnerAttention = after.attention.some((a) => a.code === "PARTNER_PAYMENT_PENDING");
  assert(hasCompanyAttention && hasPartnerAttention, "expected both new pending items to surface as actionable, deep-linked attention items");
  console.log(`[1] OK — accountsDashboardSummary reflects REAL pending work: companyProofsPending ${before.cards.companyProofsPending}->${after.cards.companyProofsPending}, partnerPaymentsPending ${before.cards.partnerPaymentsPending}->${after.cards.partnerPaymentsPending}, both surfaced as actionable deep-linked attention items`);

  console.log("\nALL STAGE 5 ACCOUNTS DASHBOARD SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
