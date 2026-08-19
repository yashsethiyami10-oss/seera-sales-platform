import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Traces the latest Sales Executive retailer checkout after a given cutoff
// timestamp (defaults to now-2h if not given) through the WhatsApp trigger/queue/outbox pipeline
// in PRODUCTION, and separately reports the full PENDING backlog for SeeraRetailer so a
// limit-starvation theory (an old backlog item always winning a limit:1 dispatch over the newest
// event) can be proven or ruled out from real data. Never writes/updates/deletes any row.

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

const cutoffArg = process.argv[2];
const cutoff = cutoffArg ? new Date(cutoffArg) : new Date(Date.now() - 2 * 3600_000);

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);
  console.log(`Cutoff: ${cutoff.toISOString()}\n`);

  // Full current PENDING/FAILED backlog for SeeraRetailer, oldest first — this is the exact
  // order dispatchWhatsAppOutbox's own query would process them in.
  const backlog = await prisma.outboxEvent.findMany({
    where: { aggregateType: "SeeraRetailer", status: { in: ["PENDING", "FAILED"] } },
    orderBy: { availableAt: "asc" },
  });
  console.log(`0. CURRENT SeeraRetailer PENDING/FAILED BACKLOG (oldest first, dispatch order): ${backlog.length} row(s)`);
  for (const b of backlog) {
    console.log(`   id=${b.id} status=${b.status} attempts=${b.attempts} availableAt=${b.availableAt.toISOString()} createdAt=${b.createdAt.toISOString()} templateKey=${b.templateKey}`);
  }

  const visit = await prisma.seeraVisit.findFirst({
    where: {
      retailerId: { not: null },
      checkedOutAt: { not: null, gt: cutoff },
      workSession: { employeeRole: "SALES_EXECUTIVE" },
    },
    orderBy: { checkedOutAt: "desc" },
    include: { workSession: true, retailer: true },
  });

  if (!visit) {
    console.log("\nNo Executive retailer checkout found after the cutoff yet.");
    return;
  }
  const executive = await prisma.user.findUnique({ where: { id: visit.workSession.employeeId }, select: { name: true, normalizedEmail: true } });

  console.log("\n1. LATEST EXECUTIVE CHECKOUT");
  console.log(`  visitId=${visit.id}  workSessionId=${visit.workSessionId}`);
  console.log(`  executive=${executive?.name} (${executive?.normalizedEmail})`);
  console.log(`  retailer=${visit.retailer?.businessName} (id=${visit.retailerId})  phone=${maskPhone(visit.retailer?.whatsapp || visit.retailer?.mobile)}`);
  console.log(`  checkedOutAt=${visit.checkedOutAt?.toISOString()}`);
  console.log(`  outcome=${visit.outcome}`);

  const candidates = await prisma.outboxEvent.findMany({
    where: { aggregateType: "SeeraRetailer", aggregateId: visit.retailerId!, createdAt: { gte: visit.checkedOutAt! } },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  const match = candidates.find((c) => (c.payload as any)?.visitId === visit.id) ?? candidates[0];

  console.log("\n2. OUTBOX FOR THIS CHECKOUT");
  if (!match) {
    console.log("  OUTBOX CREATED: NO");
  } else {
    console.log("  OUTBOX CREATED: YES");
    console.log(`  id=${match.id}`);
    console.log(`  createdAt=${match.createdAt.toISOString()}  updatedAt=${match.updatedAt.toISOString()}`);
    console.log(`  templateKey=${match.templateKey}`);
    console.log(`  status=${match.status}`);
    console.log(`  attempts=${match.attempts}`);
    console.log(`  providerMessageId=${match.providerMessageId ?? "(none)"}`);
    console.log(`  lastErrorCode=${match.lastErrorCode ?? "(none)"}`);

    const position = backlog.findIndex((b) => b.id === match.id);
    console.log(`\n  Position in the current oldest-first PENDING/FAILED queue: ${position === -1 ? "not in backlog (already resolved or not queued)" : `#${position + 1} of ${backlog.length}`}`);
    if (position > 0) {
      console.log(`  >>> ${position} older row(s) sit ahead of this one — a dispatch call with a small limit would process those first, not this row.`);
    }

    if (match.providerMessageId) {
      const receipts = await prisma.whatsAppWebhookReceipt.findMany({ where: { dedupeKey: { startsWith: `${match.providerMessageId}:` } }, orderBy: { receivedAt: "asc" } });
      console.log(`\n  Webhook receipts for providerMessageId: ${receipts.length}`);
      for (const r of receipts) console.log(`    ${r.dedupeKey} receivedAt=${r.receivedAt.toISOString()}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
