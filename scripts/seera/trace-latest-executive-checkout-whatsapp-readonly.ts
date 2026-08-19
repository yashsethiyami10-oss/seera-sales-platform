import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Traces the latest Sales Executive retailer checkout (post whatsapp_audit_trail
// migration) end-to-end through the WhatsApp trigger/queue/outbox pipeline in PRODUCTION. Never
// writes/updates/deletes any row.

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

function maskPhone(v: string | null | undefined): string {
  if (!v) return "(none)";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const migration = await prisma.$queryRawUnsafe<Array<{ finished_at: Date }>>(
    `select finished_at from _prisma_migrations where migration_name = '20260818120000_whatsapp_audit_trail'`,
  );
  const migratedAt = migration[0]?.finished_at;
  console.log(`Migration applied at: ${migratedAt?.toISOString() ?? "NOT FOUND"}\n`);

  // 1. Latest Executive retailer checkout after the migration.
  const visit = await prisma.seeraVisit.findFirst({
    where: {
      retailerId: { not: null },
      checkedOutAt: { not: null, gt: migratedAt },
      workSession: { employeeRole: "SALES_EXECUTIVE" },
    },
    orderBy: { checkedOutAt: "desc" },
    include: { workSession: true, retailer: true },
  });

  if (!visit) {
    console.log("No Executive retailer checkout found after the migration timestamp yet.");
    return;
  }
  const executive = await prisma.user.findUnique({ where: { id: visit.workSession.employeeId }, select: { name: true, normalizedEmail: true } });

  console.log("1. LATEST EXECUTIVE CHECKOUT");
  console.log(`  visitId=${visit.id}`);
  console.log(`  executive=${executive?.name} (${executive?.normalizedEmail})`);
  console.log(`  retailer=${visit.retailer?.businessName} (id=${visit.retailerId})`);
  console.log(`  checkedOutAt=${visit.checkedOutAt?.toISOString()}`);
  console.log(`  outcome=${visit.outcome}`);
  console.log(`  noOrderReason=${visit.noOrderReason ?? "(none)"}  followUpAt=${visit.followUpAt?.toISOString() ?? "(none)"}`);

  // 2. Recipient resolution — replicate the exact precedence queueRetailerCommunication uses.
  const retailer = visit.retailer!;
  const rawUsed = retailer.whatsapp || retailer.mobile;
  const fieldUsed = retailer.whatsapp ? "whatsapp" : retailer.mobile ? "mobile" : "(none)";
  console.log("\n2. RECIPIENT RESOLUTION");
  console.log(`  field used=${fieldUsed}  masked raw=${maskPhone(rawUsed)}`);
  const digits = (rawUsed ?? "").replace(/\D/g, "");
  const normalized = /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : /^91[6-9]\d{9}$/.test(digits) ? digits : null;
  console.log(`  normalized=${normalized ? maskPhone(normalized) : "INVALID/NONE"}  valid=${normalized ? "YES" : "NO"}`);

  // 3. Trigger branch.
  const branch = visit.outcome === "PRODUCTIVE" ? "ORDER_PLACED" : visit.outcome === "NO_ORDER" ? "NO_ORDER" : visit.outcome === "FOLLOW_UP" ? "FOLLOW_UP" : "NONE";
  console.log(`\n3. TRIGGER BRANCH: ${branch}`);

  // 5. OutboxEvent lookup — matched by aggregateId + a payload.visitId match, since that's the
  // only durable link between a visit and its queued row (no direct FK by design, per this
  // codebase's existing convention of not FK-enforcing party/event references).
  const candidates = await prisma.outboxEvent.findMany({
    where: { aggregateType: "SeeraRetailer", aggregateId: visit.retailerId!, createdAt: { gte: visit.checkedOutAt! } },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  const match = candidates.find((c) => (c.payload as any)?.visitId === visit.id) ?? candidates[0];

  console.log("\n5. OUTBOX");
  if (!match) {
    console.log("  OUTBOX CREATED: NO");
    console.log(`  (${candidates.length} other OutboxEvent row(s) exist for this retailer since checkout, none reference this visitId)`);
  } else {
    console.log("  OUTBOX CREATED: YES");
    console.log(`  id=${match.id}`);
    console.log(`  channel=${match.channel}`);
    console.log(`  templateKey=${match.templateKey}`);
    console.log(`  status=${match.status}`);
    console.log(`  attempts=${match.attempts}`);
    console.log(`  lastErrorCode=${match.lastErrorCode ?? "(none)"}`);
    console.log(`  providerMessageId=${match.providerMessageId ?? "(none)"}`);
    console.log(`  createdAt=${match.createdAt.toISOString()}`);
    console.log(`  updatedAt=${match.updatedAt.toISOString()}`);
    console.log(`  publishedAt=${match.publishedAt?.toISOString() ?? "(none)"}  sentAt=${(match as any).sentAt?.toISOString() ?? "(none)"}`);
    const payload: any = match.payload;
    console.log(`  templateName=${payload?.templateName}  languageCode=${payload?.languageCode}`);
    console.log(`  templateParams (count=${payload?.templateParams?.length ?? 0}): ${JSON.stringify(payload?.templateParams)}`);

    if (match.providerMessageId) {
      const receipts = await prisma.whatsAppWebhookReceipt.findMany({ where: { dedupeKey: { startsWith: `${match.providerMessageId}:` } }, orderBy: { receivedAt: "asc" } });
      console.log(`\n9. WEBHOOK RECEIPTS for providerMessageId: ${receipts.length}`);
      for (const r of receipts) console.log(`  ${r.dedupeKey} receivedAt=${r.receivedAt.toISOString()}`);
    } else {
      console.log("\n9. No providerMessageId on this row — Meta was never actually called for it yet.");
    }
  }

  console.log("\nOther recent OutboxEvent rows for this retailer (context):");
  for (const c of candidates) console.log(`  id=${c.id} status=${c.status} createdAt=${c.createdAt.toISOString()} payload.visitId=${(c.payload as any)?.visitId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
