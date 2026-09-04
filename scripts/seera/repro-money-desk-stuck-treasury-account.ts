import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
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

  console.log("=== Step 1: create a REC-INS entry with NO treasuryAccountId (matches the real production entry) ===");
  const key = `md-stuck-treasury-${suffix}`;
  // createMoneyDeskTransaction chains straight into processMoneyDeskTransaction (STEP 1 + STEP 2 in
  // one call for an auto-cleared Founder entry) and processMoneyDeskTransaction re-throws on failure
  // after durably recording failureReason on the row — exactly like the real production incident,
  // where the ORIGINAL create call itself is what failed and left the entry sitting in Needs
  // Attention. Catch it here the same way the real money-desk-create API route already does.
  let createdId: string;
  try {
    const created = await createMoneyDeskTransaction(prisma, founder.id, {
      purposeCode: "REC-INS",
      direction: "CASH_IN",
      amount: 250,
      date: new Date(),
      // treasuryAccountId deliberately omitted
      counterpartyName: `Unallocated Advance ${suffix}`,
      formData: {},
      idempotencyKey: key,
    });
    createdId = created.id;
    check("entry should have thrown (unexpected success)", false);
  } catch (e) {
    check("create call itself throws the SAME clean error (matches real production: failure happens on original submit)", e instanceof Error && "code" in e && (e as { code: unknown }).code === "MONEY_DESK_TREASURY_ACCOUNT_REQUIRED");
    const row = await prisma.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { idempotencyKey: key } });
    createdId = row.id;
  }

  const stuck = await prisma.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: createdId } });
  check("entry landed in POSTING (Founder auto-clears approval) despite the create-time throw", stuck.status === "POSTING");
  console.log(`  [info] failureReason: ${stuck.failureReason}`);
  check("BEFORE FIX would have leaked a raw Prisma error — now a clean, actionable message", stuck.failureReason === "MONEY_DESK_TREASURY_ACCOUNT_REQUIRED: A Cash/Bank account is required to post this entry — use EDIT / CORRECT to select one, then RETRY");
  check("failureReason contains NO raw Prisma internals", !/prisma\.|findUniqueOrThrow|Argument `/.test(stuck.failureReason ?? ""));

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
