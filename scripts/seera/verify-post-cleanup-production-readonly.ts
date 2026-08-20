import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Post-cleanup production verification per the Founder's own Part 7 checklist.

const TEST_RETAILER_IDS = [
  "cmsuh0ouf0005pxwsgvn4d9ps", "cmsuh9sgt0008it7c0ewnkcvj", "cmsurkgl5000413uxoguuh0uo",
  "cmsxbxfq50001s57bmuhff79v", "cmszdojez0001t8nv9h6xsv2t", "cmsze2n2i0001x0apruzn5kxy",
  "cmsze93kx000px0apmssv3otf", "cmszfhsxi0001wljeozptq9hp", "cmszhimdn00016m8wmf6rpija",
  "cmszk8rjv000rp7ltmggi9iq5", "cmt124mq0000112x82zcf4cty", "cmt13qq0b000fgjheb4un3we6",
  "cmt14nwhv0001v3t8offipzpw",
] as const;
const TEST_NAMES = ["MUV CARE CO.", "seera kirana", "arnav kirana", "mewadi"];

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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const prisma = new PrismaClient({ datasourceUrl: production });

let pass = 0, fail = 0;
function assert(cond: unknown, label: string) {
  if (cond) { pass++; console.log(`  PASS: ${label}`); } else { fail++; console.error(`  FAIL: ${label}`); }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  console.log("\n=== Counts ===");
  const remainingTestRetailers = await prisma.seeraRetailer.count({ where: { id: { in: [...TEST_RETAILER_IDS] } } });
  assert(remainingTestRetailers === 0, `active test retailers = 0 (found ${remainingTestRetailers})`);

  const nameHits = await prisma.seeraRetailer.findMany({ where: { businessName: { in: TEST_NAMES } } });
  assert(nameHits.length === 0, `no retailer named MUV CARE CO./seera kirana/arnav kirana/mewadi remains (found ${nameHits.length})`);

  const visitsStillLinked = await prisma.seeraVisit.count({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } } });
  assert(visitsStillLinked === 0, `visits still pointing at a deleted test retailer id = 0 (found ${visitsStillLinked})`);
  const anyOpenVisitsOrgWide = await prisma.seeraVisit.count({ where: { checkedOutAt: null } });
  console.log(`  (org-wide open visits right now, informational: ${anyOpenVisitsOrgWide})`);

  const activeTestFollowUps = await prisma.seeraFollowUp.count({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } } });
  assert(activeTestFollowUps === 0, `active test follow-ups = 0 (found ${activeTestFollowUps})`);

  const pendingTestOrders = await prisma.seeraSalesOrder.count({ where: { retailerId: { in: [...TEST_RETAILER_IDS] } } });
  assert(pendingTestOrders === 0, `orders still pointing at a deleted test retailer id = 0 (found ${pendingTestOrders})`);
  const cancelledCount = await prisma.seeraSalesOrder.count({ where: { status: "CANCELLED", retailerId: null } });
  console.log(`  (detached+CANCELLED orders now in history, informational: ${cancelledCount})`);

  const staleWhatsapp = await prisma.outboxEvent.count({ where: { aggregateType: "SeeraRetailer", aggregateId: { in: [...TEST_RETAILER_IDS] }, status: { in: ["PENDING", "FAILED"] } } });
  assert(staleWhatsapp === 0, `pending/failed test WhatsApp events = 0 (found ${staleWhatsapp})`);

  console.log("\n=== Integrity checks ===");
  const manoj = await prisma.user.findFirst({ where: { name: { contains: "Manoj Vijayvargiya", mode: "insensitive" } }, include: { roleAssignments: { where: { status: "ACTIVE" }, include: { role: true } } } });
  assert(manoj?.status === "ACTIVE" && manoj.roleAssignments.some((r) => r.role.code === "SALES_EXECUTIVE") && manoj.roleAssignments.some((r) => r.role.code === "SALES_MANAGER"), "Manoj intact (ACTIVE, both roles)");

  const bhilwara = await prisma.seeraGeographyNode.findFirst({ where: { name: { contains: "Bhilwara", mode: "insensitive" }, level: "TERRITORY" } });
  assert(!!bhilwara && bhilwara.status === "ACTIVE", "Bhilwara territory intact");

  const cdEligibility = await prisma.seeraAssignment.findFirst({ where: { assignmentType: "COMPANY_DIRECT_ELIGIBLE", subjectId: manoj?.id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
  assert(!!cdEligibility, "Manoj's Company Direct eligibility intact");

  const cdPartner = await prisma.seeraPartner.findFirst({ where: { type: "COMPANY_DIRECT", legalName: { contains: "AATMANIRBHAR", mode: "insensitive" } } });
  assert(cdPartner?.lifecycle === "ACTIVE", "Company Direct partner (AATMANIRBHAR MANUFACTURERS) intact");

  const distributorCount = await prisma.seeraPartner.count({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" } });
  assert(distributorCount > 0, `Distributors intact (${distributorCount} active)`);
  const ssCount = await prisma.seeraPartner.count({ where: { type: "SUPER_STOCKIST", lifecycle: "ACTIVE" } });
  assert(ssCount > 0, `Super Stockists intact (${ssCount} active)`);

  const coaCount = await prisma.seeraChartOfAccount.count();
  const journalCount = await prisma.seeraJournalEntry.count({ where: { status: "POSTED" } });
  assert(coaCount > 0 && journalCount > 0, `Finance intact (${coaCount} COA accounts, ${journalCount} posted journals)`);

  const materialCount = await prisma.seeraManufacturingMaterial.count();
  const mfgFlag = await prisma.featureFlag.findUnique({ where: { key: "portal.manufacturing.enabled" } });
  assert(materialCount > 0 && mfgFlag?.enabled === true, `Manufacturing intact (${materialCount} materials, flag enabled=${mfgFlag?.enabled})`);

  const outboxTotal = await prisma.outboxEvent.count();
  const outboxDeliveredOrRead = await prisma.outboxEvent.count({ where: { status: { in: ["DELIVERED", "READ", "PUBLISHED"] } } });
  assert(outboxTotal > 0 && outboxDeliveredOrRead > 0, `WhatsApp architecture intact (${outboxTotal} total outbox rows, ${outboxDeliveredOrRead} already-sent rows untouched)`);

  console.log(`\n\n========== SUMMARY: ${pass} passed, ${fail} failed ==========`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
