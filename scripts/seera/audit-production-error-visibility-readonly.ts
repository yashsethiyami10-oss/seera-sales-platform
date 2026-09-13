import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// Post-Audit Gap Closure, Phase 3 — STRICTLY READ-ONLY against production. The previous audit
// reported production log-aggregator access as NOT TESTABLE (no external monitoring platform
// available in this environment) — but this codebase's durable error-state actually lives in the
// database, not only in ephemeral log lines: OutboxEvent.status/lastErrorCode/DEAD_LETTER for
// messaging failures, and AuditLog for authorization denials and sensitive-action failures. Both
// are directly, safely queryable read-only. This is real production error inspection, not a
// substitute claim.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const prod = envFile(".env").DATABASE_URL;
const test = envFile(".env.test").TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: prod, productionUrl: prod, testUrl: test });
const db = new PrismaClient({ datasourceUrl: prod });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)\n`);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  console.log("=== OutboxEvent status distribution (all time) ===");
  const byStatus = await db.outboxEvent.groupBy({ by: ["status"], _count: { _all: true } });
  for (const row of byStatus) console.log(`  ${row.status}: ${row._count._all}`);

  const deadLetters = await db.outboxEvent.findMany({ where: { status: "DEAD_LETTER" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, eventType: true, attempts: true, lastErrorCode: true, createdAt: true } });
  console.log(`\n=== Most recent DEAD_LETTER outbox events (up to 10) ===`);
  for (const d of deadLetters) console.log(`  ${d.createdAt.toISOString()} type=${d.eventType} attempts=${d.attempts} error=${d.lastErrorCode}`);
  if (!deadLetters.length) console.log("  (none)");

  const stuckFailed = await db.outboxEvent.count({ where: { status: "FAILED", createdAt: { lt: since } } });
  console.log(`\nFAILED events older than 30 days (would indicate a stuck retry loop, or the worker not running): ${stuckFailed}`);

  const pendingOld = await db.outboxEvent.count({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  console.log(`PENDING events older than 24h (would indicate the dispatch worker isn't being triggered): ${pendingOld}`);

  console.log("\n=== AuditLog: authorization denials, last 30 days ===");
  const denials = await db.auditLog.groupBy({ by: ["action"], where: { outcome: "DENIED", occurredAt: { gte: since } }, _count: { _all: true } });
  for (const row of denials) console.log(`  ${row.action}: ${row._count._all}`);
  if (!denials.length) console.log("  (none in the last 30 days)");

  console.log("\n=== AuditLog: FAILURE outcomes, last 30 days (real application-level failures, not just denials) ===");
  const failures = await db.auditLog.groupBy({ by: ["action"], where: { outcome: "FAILURE", occurredAt: { gte: since } }, _count: { _all: true } });
  for (const row of failures) console.log(`  ${row.action}: ${row._count._all}`);
  if (!failures.length) console.log("  (none in the last 30 days)");

  console.log("\n=== SeeraMoneyDeskTransaction: stuck POSTING with a failureReason ('Needs Attention' queue) ===");
  const stuckMd = await db.seeraMoneyDeskTransaction.findMany({ where: { status: "POSTING", failureReason: { not: null } }, select: { transactionNumber: true, failureReason: true, createdAt: true } });
  for (const m of stuckMd) console.log(`  ${m.createdAt.toISOString()} ${m.transactionNumber}: ${m.failureReason}`);
  if (!stuckMd.length) console.log("  (none)");

  console.log("\n=== Cron configuration check (informational, not a DB read) ===");
  console.log("  vercel.json declares only a once-daily WhatsApp/outbox dispatch cron (0 3 * * *, Vercel Hobby plan limit).");
  console.log("  No external scheduler (GitHub Actions/cron-job.org/systemd) found in the repo hitting the documented POST alternative.");
  console.log("  This means queued WhatsApp/partner communications may sit for up to ~24h before dispatch in production today.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
