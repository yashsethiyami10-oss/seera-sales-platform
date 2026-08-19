import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Verifies whether Meta's WhatsApp Cloud API webhook has delivered any
// status events for one specific message (the Founder's controlled test_send), by reading
// WhatsAppWebhookReceipt (dedupe ledger) and OutboxEvent (governed business-event audit) in
// PRODUCTION. Never writes, updates, or deletes any row.

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

const WAMID = process.argv[2] ?? "wamid.HBgMOTE5NzgzNzY5OTQxFQIAERgSRTIwOUYwN0NCQzZCNDRBN0Y0AA==";

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);
  console.log(`Checking wamid: ${WAMID}\n`);

  // processStatusEvent's dedupeKey is `${status.id}:${status.status}:${status.timestamp}` —
  // every status event for this message id shares this prefix regardless of which status.
  const receipts = await prisma.whatsAppWebhookReceipt.findMany({
    where: { dedupeKey: { startsWith: `${WAMID}:` } },
    orderBy: { receivedAt: "asc" },
  });
  console.log(`WhatsAppWebhookReceipt rows matching this wamid: ${receipts.length}`);
  for (const r of receipts) {
    const [, status, timestamp] = r.dedupeKey.split(":");
    console.log(`  status=${status} metaTimestamp=${timestamp ?? "n/a"} receivedAt=${r.receivedAt.toISOString()}`);
  }

  const statuses = new Set(receipts.map((r) => r.dedupeKey.split(":")[1]));
  console.log(`\nSENT: ${statuses.has("sent") ? "PASS" : "NOT OBSERVED"}`);
  console.log(`DELIVERED: ${statuses.has("delivered") ? "PASS" : "NOT OBSERVED"}`);
  console.log(`READ: ${statuses.has("read") ? "PASS" : "NOT OBSERVED"}`);
  console.log(`FAILED: ${statuses.has("failed") ? "PRESENT" : "NOT OBSERVED"}`);

  // Confirm this message has no matching governed OutboxEvent (expected — test_send is
  // deliberately outside that architecture) so "unmatched" is provably the correct, honest
  // outcome rather than an assumption.
  const matchingOutboxEvent = await prisma.outboxEvent.findFirst({ where: { providerMessageId: WAMID } });
  console.log(`\nMatching OutboxEvent found: ${matchingOutboxEvent ? "YES (unexpected — investigate)" : "NO (expected for test_send)"}`);

  // Sanity: same dedupeKey is @unique in schema, so no duplicate row could exist per exact
  // (id,status,timestamp) triple even under webhook redelivery — count re-confirms this live,
  // not just from reading the schema.
  const dedupeKeys = receipts.map((r) => r.dedupeKey);
  console.log(`Distinct dedupeKeys: ${new Set(dedupeKeys).size} / ${dedupeKeys.length} rows (must be equal — @unique constraint)`);

  console.log(`\nProduction WHATSAPP_PHONE_NUMBER_ID (server env, not a DB row): ${process.env.WHATSAPP_PHONE_NUMBER_ID ?? "not set in this local script's environment"}`);
  console.log("(Sender/WABA match for this specific send was already established via the live diagnostics reconciliation earlier this session — this script does not re-derive it, since WhatsAppWebhookReceipt does not itself store phone_number_id/WABA id, only the dedupe key.)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
