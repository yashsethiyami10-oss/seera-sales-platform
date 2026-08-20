import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// Strictly read-only production correlation for the Founder camera retest. Outbox rows aggregate
// by retailer and intentionally do not duplicate order/visit ids, so each event is correlated to
// the closest preceding order for that same retailer and reports the time delta explicitly.
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const root = process.cwd();
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);
  const events = await db.outboxEvent.findMany({
    where: { channel: "WHATSAPP", eventType: "ORDER_RECORDED", aggregateType: "SeeraRetailer" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, aggregateId: true, eventType: true, templateKey: true, status: true, createdAt: true, publishedAt: true, sentAt: true, deliveredAt: true, providerMessageId: true },
  });
  for (const event of events) {
    const order = await db.seeraSalesOrder.findFirst({
      where: { retailerId: event.aggregateId, createdAt: { lte: event.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, visitId: true, source: true, createdAt: true, salespersonId: true },
    });
    const salesperson = order?.salespersonId
      ? await db.user.findUnique({ where: { id: order.salespersonId }, select: { name: true, email: true } })
      : null;
    console.log(JSON.stringify({
      eventId: event.id,
      eventType: event.eventType,
      template: event.templateKey,
      status: event.status,
      outboxCreatedAt: event.createdAt.toISOString(),
      providerPublishedAt: event.publishedAt?.toISOString() ?? null,
      providerSentAt: event.sentAt?.toISOString() ?? null,
      providerDeliveredAt: event.deliveredAt?.toISOString() ?? null,
      providerMessageId: event.providerMessageId,
      orderId: order?.id ?? null,
      orderNumber: order?.orderNumber ?? null,
      visitId: order?.visitId ?? null,
      orderSource: order?.source ?? null,
      orderCreatedAt: order?.createdAt.toISOString() ?? null,
      outboxDelayMs: order ? event.createdAt.getTime() - order.createdAt.getTime() : null,
      salesperson: salesperson?.name ?? salesperson?.email ?? null,
      sourceFunction: "placeRetailerOrder -> queueRetailerCommunicationSafe",
    }));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
