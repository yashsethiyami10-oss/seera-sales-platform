import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. PART H production data review for the Distributor + Sales Manager portal
// closure pass (Kuldeep Jha orders/pricing, Manager AWDHESH KUMAR MISHRA oversight/beat plans).
// Never mutates anything.

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
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const kuldeep = await db.user.findUniqueOrThrow({ where: { phone: "9956736641" } });
  const kuldeepParty = await db.seeraPartyUser.findFirst({ where: { userId: kuldeep.id, active: true }, include: { partner: true } });
  const distributorId = kuldeepParty?.partnerId;
  console.log(`\n== KULDEEP JHA DISTRIBUTOR ==`);
  console.log(`distributorId=${distributorId} partnerName=${kuldeepParty?.partner.legalName} assignedSuperStockistId=${kuldeepParty ? (await db.seeraPartner.findUnique({ where: { id: distributorId! } }))?.assignedSuperStockistId : null}`);

  const retailers = await db.seeraRetailer.findMany({ where: { distributorId: distributorId ?? "___none___" }, select: { id: true, businessName: true, marketId: true } });
  console.log(`\n== RETAILERS MAPPED TO KULDEEP (${retailers.length}) ==`);
  for (const r of retailers) console.log(`  id=${r.id} businessName=${r.businessName} marketId=${r.marketId}`);

  const ordersForKuldeep = await db.seeraSalesOrder.findMany({
    where: { sellerPartnerId: distributorId ?? "___none___", type: "RETAILER_ORDER" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, orderNumber: true, status: true, retailerId: true, createdAt: true, sourcePortal: true, source: true },
  });
  console.log(`\n== RETAILER_ORDER rows with sellerPartnerId = Kuldeep's distributor (${ordersForKuldeep.length}) ==`);
  for (const o of ordersForKuldeep) console.log(`  ${o.orderNumber} status=${o.status} retailerId=${o.retailerId} source=${o.source} sourcePortal=${o.sourcePortal} createdAt=${o.createdAt.toISOString()}`);

  const nullSellerCount = await db.seeraSalesOrder.count({ where: { type: "RETAILER_ORDER", sellerPartnerId: null } });
  const totalRetailerOrders = await db.seeraSalesOrder.count({ where: { type: "RETAILER_ORDER" } });
  console.log(`\n== UNASSIGNED BACKLOG ==`);
  console.log(`RETAILER_ORDER total=${totalRetailerOrders} with sellerPartnerId=NULL: ${nullSellerCount}`);

  const recentAnyRetailerOrders = await db.seeraSalesOrder.findMany({
    where: { type: "RETAILER_ORDER" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { orderNumber: true, sellerPartnerId: true, retailerId: true, status: true, createdAt: true },
  });
  console.log(`\n== MOST RECENT 5 RETAILER_ORDER (ANY DISTRIBUTOR) ==`);
  for (const o of recentAnyRetailerOrders) console.log(`  ${o.orderNumber} sellerPartnerId=${o.sellerPartnerId} retailerId=${o.retailerId} status=${o.status} createdAt=${o.createdAt.toISOString()}`);

  const skuCodes = ["SEERA-CAKE-BLUE", "SEERA-CAKE-WHITE", "SEERA-POWDER-1KG", "SEERA-YUVA-CAKE-BLUE", "SEERA-SHINEPLUS-POWDER-1KG", "SEERA-BARTAN-300G"];
  console.log(`\n== SEERA SKU + PRICE STATE (PRODUCTION) ==`);
  for (const code of skuCodes) {
    const sku = await db.seeraSku.findUnique({ where: { code } });
    if (!sku) { console.log(`  ${code}: SKU MISSING IN PRODUCTION`); continue; }
    const companyToSs = await db.seeraPriceVersion.findFirst({ where: { skuId: sku.id, tier: "COMPANY_TO_SS", status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" } });
    const ssToDist = await db.seeraPriceVersion.findFirst({ where: { skuId: sku.id, tier: "SS_TO_DISTRIBUTOR", status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" } });
    console.log(`  ${code}: status=${sku.status} category=${sku.category} COMPANY_TO_SS=${companyToSs ? companyToSs.amount : "NONE"} SS_TO_DISTRIBUTOR=${ssToDist ? ssToDist.amount : "NONE"}`);
  }

  const activeSkuCount = await db.seeraSku.count({ where: { status: "ACTIVE" } });
  console.log(`\nTotal ACTIVE SeeraSku rows in production: ${activeSkuCount}`);

  const creditTerms = await db.seeraCreditTerm.findFirst({ where: { distributorId: distributorId ?? "___none___" }, orderBy: { effectiveFrom: "desc" } });
  console.log(`\n== CREDIT TERMS FOR KULDEEP'S DISTRIBUTOR ==`);
  console.log(creditTerms ? JSON.stringify({ creditEnabled: creditTerms.creditEnabled, creditLimit: creditTerms.creditLimit.toString(), creditDays: creditTerms.creditDays }) : "NONE CONFIGURED");

  const manager = await db.user.findFirst({ where: { name: { contains: "AWDHESH", mode: "insensitive" } } });
  console.log(`\n== MANAGER AWDHESH KUMAR MISHRA ==`);
  console.log(`userId=${manager?.id} name=${manager?.name}`);
  if (manager) {
    const beatPlans = await db.seeraJourneyPlan.findMany({ where: { employeeId: manager.id }, take: 10, orderBy: { createdAt: "desc" } });
    console.log(`Beat plans for this manager: ${beatPlans.length}`);
    for (const p of beatPlans) console.log(`  id=${p.id} dayOfWeek=${p.dayOfWeek} status=${p.status} territoryId=${p.territoryId} beatId=${p.beatId} distributorId=${p.distributorId}`);
  }

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
