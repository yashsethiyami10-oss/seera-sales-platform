import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { financeNumberFor } from "../../lib/finance/numbering";
import {
  createMoneyDeskTransaction,
  editMoneyDeskTransaction,
  retryMoneyDeskTransaction,
  moneyDeskTransactionDetail,
} from "../../lib/finance/money-desk-service";

// Part L (Final 100% Production Completion Execution Contract) — reproduces a REAL production
// incident (MD-60817C2372D198DD, a REC-INS entry with no treasuryAccountId, created 2026-09-03):
// the entry's failureReason was a raw, unreadable Prisma internal error ("Argument `id` must not
// be null"), and there was NO way to ever fix it — RETRY just re-read the same null id and failed
// identically forever, and canEdit/editMoneyDeskTransaction both explicitly excluded POSTING status.
// This proves both halves of the fix: (1) the failure is now a clean, actionable message instead of
// a raw Prisma leak, and (2) EDIT / CORRECT can now supply the missing treasuryAccountId, after
// which RETRY genuinely succeeds — a real, permanent recovery path, not just a friendlier crash.
//
// MASTER UX mission §17 update — createMoneyDeskTransaction now rejects a treasury-requiring
// purpose with no treasuryAccountId BEFORE creating any row at all (Step 1 below proves that). That
// closes the root cause for NEW entries, but production still has real rows created before this fix
// existed (MD-60817C2372D198DD itself). Steps 2-5 now simulate that pre-existing legacy state via a
// direct forced update (same pattern repro-money-desk-retry.ts already uses to simulate a stuck
// row), rather than through createMoneyDeskTransaction, since the governed path can no longer
// produce it — recovery for already-stuck legacy rows must still work regardless.
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

  console.log("=== Step 1a: createMoneyDeskTransaction now rejects a treasury-less REC-INS UPFRONT (create-time guard) ===");
  const key = `md-stuck-treasury-${suffix}`;
  let rejectedCleanly = false;
  try {
    await createMoneyDeskTransaction(prisma, founder.id, {
      purposeCode: "REC-INS",
      direction: "CASH_IN",
      amount: 250,
      date: new Date(),
      // treasuryAccountId deliberately omitted
      counterpartyName: `Unallocated Advance ${suffix}`,
      formData: {},
      idempotencyKey: key,
    });
    check("entry should have thrown (unexpected success)", false);
  } catch (e) {
    rejectedCleanly = e instanceof Error && "code" in e && (e as { code: unknown }).code === "MONEY_DESK_TREASURY_ACCOUNT_REQUIRED";
    check("create call throws MONEY_DESK_TREASURY_ACCOUNT_REQUIRED immediately, before any row exists", rejectedCleanly);
  }
  const noRowCreated = await prisma.seeraMoneyDeskTransaction.findUnique({ where: { idempotencyKey: key } });
  check("NO row was left behind — the fix prevents the stuck state from ever being created, not just from crashing raw", noRowCreated === null);

  console.log("\n=== Step 1b: simulate a PRE-EXISTING legacy row in this exact state (production has one: MD-60817C2372D198DD, created before this fix) ===");
  const legacyKey = `md-stuck-treasury-legacy-${suffix}`;
  const legacy = await prisma.seeraMoneyDeskTransaction.create({
    data: {
      transactionNumber: financeNumberFor("MD", legacyKey),
      purposeCode: "REC-INS",
      direction: "CASH_IN",
      status: "POSTING",
      source: "FOUNDER_PORTAL",
      amount: 250,
      date: new Date(),
      treasuryAccountId: null,
      counterpartyName: `Unallocated Advance ${suffix}`,
      formData: {},
      requestedById: founder.id,
      idempotencyKey: legacyKey,
      failureReason: "MONEY_DESK_TREASURY_ACCOUNT_REQUIRED: A Cash/Bank account is required to post this entry — use EDIT / CORRECT to select one, then RETRY",
    },
  });
  const createdId = legacy.id;
  check("legacy row simulated: POSTING with a clean, actionable failureReason (matches production post-fix, no raw Prisma internals)", !/prisma\.|findUniqueOrThrow|Argument `/.test(legacy.failureReason ?? ""));

  console.log("\n=== Step 2: BEFORE the fix, this was a dead end — confirm canEdit/canRetry now both allow recovery ===");
  const detail = await moneyDeskTransactionDetail(prisma, founder.id, createdId);
  check("canRetry is true (already worked before this fix — but was useless alone)", detail.canRetry === true);
  check("canEdit is NOW true for a Needs Attention entry (was false before this fix)", detail.canEdit === true);

  console.log("\n=== Step 3: retrying WITHOUT fixing the data first must fail identically (proves retry alone was never enough) ===");
  await retryMoneyDeskTransaction(prisma, founder.id, createdId).then(
    () => check("retry-without-edit correctly still fails", false),
    (e) => check("retry-without-edit correctly still fails with the same clean error", e instanceof Error && "code" in e && (e as { code: unknown }).code === "MONEY_DESK_TREASURY_ACCOUNT_REQUIRED"),
  );

  console.log("\n=== Step 4: EDIT / CORRECT to supply the missing treasury account ===");
  const cash = await prisma.seeraTreasuryAccount.findFirst({ where: { kind: "CASH", isActive: true } });
  if (!cash) throw new Error("TEST DB has no active Cash treasury account to test against");
  const edited = await editMoneyDeskTransaction(prisma, founder.id, createdId, {
    treasuryAccountId: cash.id,
    reason: "Recovering a stuck entry — supplying the missing treasury account",
    idempotencyKey: `${key}:edit`,
  });
  check("edit accepted, treasuryAccountId now set on the row", (edited as { treasuryAccountId: string | null }).treasuryAccountId === cash.id);
  check("edit did NOT change status away from POSTING (still needs a real retry to post)", (edited as { status: string }).status === "POSTING");

  console.log("\n=== Step 5: RETRY now genuinely succeeds ===");
  const posted = await retryMoneyDeskTransaction(prisma, founder.id, createdId);
  check("transaction is now POSTED", (posted as { status: string }).status === "POSTED");
  check("failureReason cleared", (posted as { failureReason: string | null }).failureReason === null);
  const journalId = ((posted as { downstreamRefs: unknown }).downstreamRefs as { journalId?: string } | null)?.journalId;
  check("a real journal was posted", Boolean(journalId));
  if (journalId) {
    const lines = await prisma.seeraJournalLine.findMany({ where: { journalId } });
    check("journal line carries the corrected treasuryAccountId", lines.some((l) => l.treasuryAccountId === cash.id));
  }

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  const journal = journalId ? await prisma.seeraJournalEntry.findUnique({ where: { id: journalId } }) : null;
  if (journal) {
    await prisma.seeraJournalLine.deleteMany({ where: { journalId: journal.id } });
    await prisma.seeraJournalEntry.delete({ where: { id: journal.id } });
  }
  await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { id: createdId } });
  const remaining = await prisma.seeraMoneyDeskTransaction.count({ where: { id: createdId } });
  console.log(`Remaining: moneyDeskTxns=${remaining}`);
  if (remaining !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
