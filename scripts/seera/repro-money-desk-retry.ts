import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMoneyDeskTransaction, retryMoneyDeskTransaction, moneyDeskTransactionDetail } from "../../lib/finance/money-desk-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";

// P0-8 (Money Desk 2.0 Final Gap Closure) — verifies the new "Retry a stuck Needs Attention
// transaction" mechanism, closing the real gap found while re-testing production: 8 real
// transactions were stuck in POSTING/failureReason with no way to ever complete once their root
// cause (a missing SeeraExpenseCategory master row) was fixed. Uses REC-INS (recordMoneyIn ->
// postJournal) as the exercised handler — its journal posting is already proven check-then-create
// idempotent (postJournalInTx), so a real second handler run on retry is safe to actually execute,
// not just simulated.
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const prod = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: prod, testUrl: test });
if (target.role !== "test") throw new Error("ABORT: not TEST");
const prisma = new PrismaClient({ datasourceUrl: test });

let pass = 0, fail = 0;
function check(label: string, ok: boolean) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}`); if (ok) pass++; else fail++; }

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const suffix = randomUUID().slice(0, 8);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  // ACCOUNTS_MANAGER holds money_desk:approve, so it's a legitimate retrier, not a genuine denial
  // test. ACCOUNTS_EXECUTIVE holds money_desk:create (so it clears the base authorize() gate) but
  // NOT money_desk:approve — the correct role to exercise retryMoneyDeskTransaction's OWN
  // "requester or approver" ownership check specifically, not just the base permission gate.
  const unrelatedActor = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-accounts-executive@seera.test" } });
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `RETRY-CASH-${suffix}`, name: `Retry Test Cash ${suffix}` });

  const cleanup = { moneyDeskIds: [] as string[], journalIds: [] as string[] };

  console.log("=== Reproduce a genuine stuck 'Needs Attention' entry ===");
  const key = `retry-test-${suffix}`;
  const txn = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "REC-INS", direction: "CASH_IN", amount: 500, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: `Retry Test Party ${suffix}`, formData: {}, idempotencyKey: key,
  });
  cleanup.moneyDeskIds.push(txn.id);
  check("fixture transaction posted normally first (real, proven handler)", txn.status === "POSTED");
  const realRefs = (txn.downstreamRefs ?? {}) as { journalId?: string };
  if (realRefs.journalId) cleanup.journalIds.push(realRefs.journalId);
  // Simulate the real production failure mode directly on the row: POSTING + a real failureReason,
  // exactly the shape found live in production (status="POSTING", failureReason="No
  // SeeraExpenseCategory found"). downstreamRefs is intentionally left as-is, matching
  // postJournalInTx's own check-then-return idempotency — retry will find the SAME journal again,
  // never double-post.
  await prisma.seeraMoneyDeskTransaction.update({ where: { id: txn.id }, data: { status: "POSTING", failureReason: "Simulated: No SeeraExpenseCategory found" } });

  const detailBefore = await moneyDeskTransactionDetail(prisma, founder.id, txn.id);
  check("transaction is genuinely stuck (POSTING with a real failureReason)", detailBefore.status === "POSTING" && Boolean(detailBefore.failureReason));
  check("canRetry is true for the original requester (Founder)", detailBefore.canRetry === true);

  console.log("\n=== Authorization: an unrelated actor cannot retry someone else's stuck entry ===");
  const unrelatedRetry = await retryMoneyDeskTransaction(prisma, unrelatedActor.id, txn.id).catch((e) => (e as { code?: string })?.code);
  check("an unrelated actor (not the requester, no approval authority) is denied — MONEY_DESK_RETRY_NOT_AUTHORIZED", unrelatedRetry === "MONEY_DESK_RETRY_NOT_AUTHORIZED");
  const detailStillStuckAfterDeniedAttempt = await moneyDeskTransactionDetail(prisma, founder.id, txn.id);
  check("still POSTING after the denied attempt (nothing silently changed)", detailStillStuckAfterDeniedAttempt.status === "POSTING");

  console.log("\n=== Retry succeeds for the real, correctly-authorized owner ===");
  const retried = await retryMoneyDeskTransaction(prisma, founder.id, txn.id);
  check("retry succeeds and the transaction is POSTED again", retried.status === "POSTED");
  const retriedRefs = (retried.downstreamRefs ?? {}) as { journalId?: string };
  check("retry resolved the SAME journal via idempotency (no duplicate journal posted)", retriedRefs.journalId === realRefs.journalId);
  const journalCount = realRefs.journalId ? await prisma.seeraJournalEntry.count({ where: { idempotencyKey: key } }) : 0;
  check("exactly ONE journal entry exists for this idempotencyKey after the retry", journalCount === 1);
  const detailAfter = await moneyDeskTransactionDetail(prisma, founder.id, txn.id);
  check("canRetry is now false (nothing left to retry)", detailAfter.canRetry === false);
  check("failureReason is cleared after a successful retry", detailAfter.failureReason === null);

  console.log("\n=== Retrying an already-POSTED transaction is correctly rejected ===");
  const alreadyPostedRetry = await retryMoneyDeskTransaction(prisma, founder.id, txn.id).catch((e) => (e as { code?: string })?.code);
  check("MONEY_DESK_NOT_RETRYABLE for an already-POSTED transaction", alreadyPostedRetry === "MONEY_DESK_NOT_RETRYABLE");

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  if (cleanup.journalIds.length) {
    await prisma.seeraJournalLine.deleteMany({ where: { journalId: { in: cleanup.journalIds } } });
    await prisma.seeraJournalEntry.deleteMany({ where: { id: { in: cleanup.journalIds } } });
  }
  await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { id: { in: cleanup.moneyDeskIds } } });
  await prisma.seeraTreasuryAccount.delete({ where: { id: cash.id } }).catch(() => {});
  const remainingTxns = await prisma.seeraMoneyDeskTransaction.count({ where: { id: { in: cleanup.moneyDeskIds } } });
  const remainingJournals = cleanup.journalIds.length ? await prisma.seeraJournalEntry.count({ where: { id: { in: cleanup.journalIds } } }) : 0;
  console.log(`Remaining: moneyDeskTxns=${remainingTxns} journals=${remainingJournals}`);
  if (remainingTxns !== 0 || remainingJournals !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
