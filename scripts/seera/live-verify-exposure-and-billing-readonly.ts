import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { canonicalDistributorExposure, creditPositionFor } from "../../lib/sales-distribution/credit-service";
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: production });
async function main() {
  console.log(`[GUARD] role=${target.role}`);
  const kuldeep = await db.seeraPartner.findFirst({ where: { code: "DIST-9108E275CD7D90" } });
  if (!kuldeep) throw new Error("Kuldeep Jha partner not found");
  console.log(`Kuldeep Jha partner id: ${kuldeep.id}`);
  const now = new Date();
  const exposure = await canonicalDistributorExposure(db, kuldeep.id, now);
  console.log("canonicalDistributorExposure:", JSON.stringify(exposure, null, 2));
  const position = await creditPositionFor(db, kuldeep.id, now);
  console.log("creditPositionFor:", JSON.stringify({ outstanding: position.outstanding, current: position.current, overdue: position.overdue, availableCredit: position.availableCredit, openOrdersCount: position.openOrders.length }, null, 2));
  const openOrders = await db.seeraSalesOrder.findMany({ where: { buyerPartnerId: kuldeep.id, status: { in: ["SUBMITTED", "ACCEPTED", "ALLOCATED", "DISPATCHED", "DELIVERED"] } }, select: { id: true, orderNumber: true, status: true, total: true } });
  console.log(`Open/uninvoiced orders (${openOrders.length}):`, JSON.stringify(openOrders, null, 2));
  const docs = await db.seeraCommercialDocument.findMany({ where: { OR: [{ issuerId: kuldeep.id }, { buyerId: kuldeep.id }] }, select: { id: true, documentNumber: true, type: true, status: true, grandTotal: true } });
  console.log(`Commercial documents involving Kuldeep (${docs.length}):`, JSON.stringify(docs, null, 2));
  const billingProfile = await db.seeraBillingProfile.findFirst({ where: { ownerType: "DISTRIBUTOR", ownerId: kuldeep.id } });
  console.log("Existing billing profile:", billingProfile ? JSON.stringify(billingProfile) : "NONE");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
