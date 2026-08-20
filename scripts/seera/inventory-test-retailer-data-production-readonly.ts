import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Full inventory of every SeeraRetailer row in production and every table that
// references it, before any cleanup decision is made — per the Founder's own explicit "Return
// inventory BEFORE deletion" instruction. Makes no judgment calls about what to delete; only
// surfaces the facts needed to make that judgment (who created it, what depends on it, whether any
// order reached a stage with real stock/ledger effects).

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

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  console.log("\n=== ALL SALES_EXECUTIVE / SALES_MANAGER users in production ===");
  const fieldUsers = await prisma.user.findMany({
    where: { roleAssignments: { some: { status: "ACTIVE", role: { code: { in: ["SALES_EXECUTIVE", "SALES_MANAGER", "SALES_HEAD"] } } } } },
    select: { id: true, name: true, email: true, status: true, createdAt: true, roleAssignments: { where: { status: "ACTIVE" }, select: { role: { select: { code: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  for (const u of fieldUsers) console.log(`  ${u.id} | ${u.name ?? "(no name)"} | ${u.email} | status=${u.status} | roles=${u.roleAssignments.map((r) => r.role.code).join(",")} | created=${u.createdAt.toISOString()}`);

  console.log("\n=== ALL SeeraRetailer rows in production ===");
  const retailers = await prisma.seeraRetailer.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`Total retailer rows: ${retailers.length}`);
  for (const r of retailers) {
    const owner = fieldUsers.find((u) => u.id === r.salespersonId);
    console.log(`\n  id=${r.id}`);
    console.log(`    businessName=${r.businessName} | code=${r.code} | lifecycle=${r.lifecycle} | source=${r.source}`);
    console.log(`    mobile=${r.mobile ?? "-"} | address=${JSON.stringify(r.address).slice(0, 120)}`);
    console.log(`    salespersonId=${r.salespersonId ?? "-"} (${owner ? `${owner.name} <${owner.email}>` : "NOT a current field user / unknown"})`);
    console.log(`    distributorId=${r.distributorId ?? "-"} | territoryId=${r.territoryId ?? "-"} | beatId=${r.beatId ?? "-"}`);
    console.log(`    createdById=${r.createdById} | createdAt=${r.createdAt.toISOString()} | updatedAt=${r.updatedAt.toISOString()}`);
  }

  console.log("\n\n=== DEPENDENCY COUNTS per retailer ===");
  for (const r of retailers) {
    const [visits, orders, followUps, collections, marketIntel, returns, photos] = await Promise.all([
      prisma.seeraVisit.findMany({ where: { retailerId: r.id }, select: { id: true, checkedInAt: true, checkedOutAt: true, outcome: true } }),
      prisma.seeraSalesOrder.findMany({ where: { retailerId: r.id }, select: { id: true, orderNumber: true, status: true, total: true, sellerPartnerId: true, createdAt: true } }),
      prisma.seeraFollowUp.findMany({ where: { retailerId: r.id }, select: { id: true, status: true, type: true } }),
      prisma.seeraCollectionEntry.findMany({ where: { retailerId: r.id }, select: { id: true } }),
      prisma.seeraMarketIntelligence.findMany({ where: { retailerId: r.id }, select: { id: true } }),
      prisma.seeraReturnRequest.findMany({ where: { retailerId: r.id }, select: { id: true, status: true } }),
      prisma.seeraVisitPhoto.findMany({ where: { retailerId: r.id }, select: { id: true } }),
    ]);
    if (visits.length + orders.length + followUps.length + collections.length + marketIntel.length + returns.length + photos.length === 0) {
      console.log(`  ${r.businessName} (${r.id}): NO DEPENDENTS — safe to hard-delete if confirmed test data`);
      continue;
    }
    console.log(`  ${r.businessName} (${r.id}):`);
    console.log(`    visits=${visits.length} (open=${visits.filter((v) => !v.checkedOutAt).length}) | orders=${orders.length} [${orders.map((o) => `${o.orderNumber}:${o.status}`).join(", ")}] | followUps=${followUps.length} (open=${followUps.filter((f) => f.status !== "COMPLETED" && f.status !== "CANCELLED").length}) | collections=${collections.length} | marketIntel=${marketIntel.length} | returns=${returns.length} | photos=${photos.length}`);

    // For each order, check for inventory movements and finance postings that would need reversal.
    for (const o of orders) {
      const movements = await prisma.seeraInventoryMovement.findMany({ where: { sourceType: "SeeraSalesOrder", sourceId: o.id }, select: { id: true, type: true, direction: true, quantity: true } });
      const ledgerEntries = await prisma.seeraFinancialEntry.findMany({ where: { orderId: o.id }, select: { id: true, type: true, amount: true } }).catch(() => []);
      if (movements.length || ledgerEntries.length) console.log(`      order ${o.orderNumber} (${o.status}, total=${o.total}): ${movements.length} inventory movement(s), ${ledgerEntries.length} ledger entr${ledgerEntries.length === 1 ? "y" : "ies"} — REAL SIDE EFFECTS, needs governed reversal not raw delete`);
    }
  }

  console.log("\n\n=== SeeraAssignment{RETAILER_USER} rows (retailer-portal login links) ===");
  const retailerAssignments = await prisma.seeraAssignment.findMany({ where: { assignmentType: "RETAILER_USER" }, select: { id: true, subjectId: true, targetId: true, effectiveTo: true } });
  console.log(`  count: ${retailerAssignments.length}`);

  console.log("\n\n=== OutboxEvent rows referencing these retailers (WhatsApp / notifications) ===");
  const retailerIds = retailers.map((r) => r.id);
  const orderIds = (await prisma.seeraSalesOrder.findMany({ where: { retailerId: { in: retailerIds } }, select: { id: true } })).map((o) => o.id);
  const outbox = await prisma.outboxEvent.findMany({
    where: { OR: [{ aggregateId: { in: retailerIds } }, { aggregateId: { in: orderIds } }] },
    select: { id: true, eventType: true, status: true, aggregateType: true, aggregateId: true, channel: true, createdAt: true },
  });
  console.log(`  relevant to these retailers/orders: ${outbox.length}`);
  const byStatus = new Map<string, number>();
  for (const o of outbox) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  console.log(`  by status: ${[...byStatus.entries()].map(([s, c]) => `${s}=${c}`).join(", ")}`);
  for (const o of outbox.filter((x) => x.status === "PENDING" || x.status === "FAILED")) {
    console.log(`    PENDING/FAILED: ${o.id} | ${o.eventType} | channel=${o.channel ?? "-"} | aggregateType=${o.aggregateType} aggregateId=${o.aggregateId} | created=${o.createdAt.toISOString()}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
