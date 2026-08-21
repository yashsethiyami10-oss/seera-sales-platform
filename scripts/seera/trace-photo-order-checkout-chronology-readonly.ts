import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Given a visitId, dumps the full chronology of that visit: check-in, every
// photo row (Cloudinary + legacy), every order placed against it, checkout, and every outbox
// event for its retailer inside the visit's time window. Built for the 21-Aug P0 photo/order/
// checkout investigation — never writes/updates/deletes any row.

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
const db = new PrismaClient({ datasourceUrl: production });

const visitId = process.argv[2];
if (!visitId) {
  console.error("Usage: tsx trace-photo-order-checkout-chronology-readonly.ts <visitId>");
  process.exit(1);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const visit = await db.seeraVisit.findUnique({
    where: { id: visitId },
    include: { workSession: true, retailer: true },
  });
  if (!visit) {
    console.log("Visit not found.");
    return;
  }
  console.log("\n== VISIT ==");
  console.log(JSON.stringify({
    id: visit.id,
    retailer: visit.retailer?.businessName,
    retailerId: visit.retailerId,
    workSessionId: visit.workSessionId,
    employeeId: visit.workSession.employeeId,
    checkedInAt: visit.checkedInAt.toISOString(),
    checkedOutAt: visit.checkedOutAt?.toISOString() ?? null,
    outcome: visit.outcome,
    noOrderReason: visit.noOrderReason,
    photoExceptionReason: visit.photoExceptionReason,
    idempotencyKey: visit.idempotencyKey,
  }, null, 2));

  const photos = await db.seeraVisitPhoto.findMany({
    where: { visitId },
    orderBy: { capturedAt: "asc" },
  });
  console.log(`\n== PHOTOS (${photos.length}) ==`);
  for (const p of photos) {
    console.log(JSON.stringify({
      id: p.id,
      photoType: p.photoType,
      storageProvider: p.storageProvider,
      publicId: p.publicId,
      secureUrl: p.secureUrl ? "(present)" : null,
      fileId: p.fileId,
      sizeBytes: p.sizeBytes?.toString() ?? null,
      width: p.width,
      height: p.height,
      format: p.format,
      capturedAt: p.capturedAt.toISOString(),
      deletedAt: p.deletedAt?.toISOString() ?? null,
      deleteReason: p.deleteReason,
    }));
  }

  const orders = await db.seeraSalesOrder.findMany({
    where: { visitId },
    orderBy: { createdAt: "asc" },
    include: { lines: true },
  });
  console.log(`\n== ORDERS REFERENCING THIS VISIT (${orders.length}) ==`);
  for (const o of orders) {
    console.log(JSON.stringify({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      source: o.source,
      createdAt: o.createdAt.toISOString(),
      lineCount: o.lines.length,
      idempotencyKey: o.idempotencyKey,
    }));
  }

  // All orders for this retailer around the same day (not just those tagged with this visitId) —
  // needed to see if a "repeat/phone order" landed on a DIFFERENT visit than expected.
  const dayStart = new Date(visit.checkedInAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const allRetailerOrders = await db.seeraSalesOrder.findMany({
    where: { retailerId: visit.retailerId!, createdAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n== ALL ORDERS FOR THIS RETAILER, SAME UTC DAY (${allRetailerOrders.length}) ==`);
  for (const o of allRetailerOrders) {
    console.log(JSON.stringify({
      id: o.id,
      orderNumber: o.orderNumber,
      visitId: o.visitId,
      source: o.source,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  // All visits for this retailer same day, to see if there were multiple check-in cycles.
  const allRetailerVisits = await db.seeraVisit.findMany({
    where: { retailerId: visit.retailerId!, checkedInAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { checkedInAt: "asc" },
  });
  console.log(`\n== ALL VISITS FOR THIS RETAILER, SAME UTC DAY (${allRetailerVisits.length}) ==`);
  for (const v of allRetailerVisits) {
    console.log(JSON.stringify({
      id: v.id,
      checkedInAt: v.checkedInAt.toISOString(),
      checkedOutAt: v.checkedOutAt?.toISOString() ?? null,
      outcome: v.outcome,
    }));
  }

  const outbox = await db.outboxEvent.findMany({
    where: { aggregateType: "SeeraRetailer", aggregateId: visit.retailerId!, createdAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n== OUTBOX EVENTS FOR THIS RETAILER, SAME UTC DAY (${outbox.length}) ==`);
  for (const e of outbox) {
    console.log(JSON.stringify({
      id: e.id,
      eventType: e.eventType,
      templateKey: e.templateKey,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
      publishedAt: e.publishedAt?.toISOString() ?? null,
      sentAt: e.sentAt?.toISOString() ?? null,
      deliveredAt: e.deliveredAt?.toISOString() ?? null,
      lastErrorCode: e.lastErrorCode,
      payload: e.payload,
    }));
  }

  // Audit log entries touching this visit or its photos, for a full action-by-action trail.
  const audit = await db.auditLog.findMany({
    where: {
      OR: [
        { entityType: "SeeraVisit", entityId: visitId },
        { entityType: "SeeraVisitPhoto", entityId: { in: photos.map((p) => p.id) } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n== AUDIT LOG (${audit.length}) ==`);
  for (const a of audit) {
    console.log(JSON.stringify({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: a.createdAt.toISOString(),
      actorId: a.actorId,
    }));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
