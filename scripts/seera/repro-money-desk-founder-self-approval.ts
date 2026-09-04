import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { decideMoneyDeskApproval, moneyDeskHome, moneyDeskTransactionDetail } from "../../lib/finance/money-desk-service";

// Money Desk + Founder Approvals Integration mission, §1/§3 — reproduces a REAL production
// incident: two real production Money Desk transactions (both requestedById = the Founder's own
// account) are permanently stuck in PENDING_APPROVAL because decideMoneyDeskApproval's maker-
// checker self-check had NO Founder bypass (unlike voidMoneyDeskTransaction's own, which already
// had one — P0 architecture correction Rule 4). "Founder cannot actually perform the required
// approval action" was literally true for any entry a Founder created that ended up needing
// approval (pre-fix residue from before createMoneyDeskTransaction's own FOUNDER_PORTAL auto-clear
// existed, or any other path that can still produce this state). This proves the fix end to end:
// a Founder CAN now approve their own pending entry; a non-Founder still cannot; a Founder can
// still reject their own entry too.
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
const testUrl = new URL(test);
testUrl.searchParams.set("connect_timeout", "30");
testUrl.searchParams.set("connection_limit", "10");
testUrl.searchParams.set("pool_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: testUrl.toString() });

let pass = 0, fail = 0;
function check(label: string, ok: boolean) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}`); if (ok) pass++; else fail++; }

async function makePendingTxn(founderId: string, suffix: string) {
  return prisma.seeraMoneyDeskTransaction.create({
    data: {
      transactionNumber: `MD-REPRO-SELFAPPR-${suffix}`,
      purposeCode: "EXP-FUEL",
      direction: "CASH_OUT",
      status: "PENDING_APPROVAL",
      source: "FOUNDER_PORTAL",
      amount: 500,
      date: new Date(),
      counterpartyName: "Repro Fuel Vendor",
      description: "Repro — simulating pre-fix stuck-in-approval residue",
      formData: {},
      requestedById: founderId,
      idempotencyKey: `repro-self-approval-${suffix}`,
    },
  });
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  // review-accounts-manager holds money_desk:approve WITHOUT system:super_admin — the real actor
  // this test needs to prove self-approval is still blocked for someone who CAN approve others'
  // entries but isn't the Founder-final-authority bypass; review-sales-executive-1 lacks
  // money_desk:approve entirely, so it would be denied at the authorize() gate before ever
  // reaching the self-approval check, proving nothing about THIS specific fix.
  const accountsManager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });
  const suffix = randomUUID().slice(0, 8);
  const createdIds: string[] = [];

  console.log("=== BEFORE the fix would have been a permanent dead end: Founder's own pending entry ===");
  const txn1 = await makePendingTxn(founder.id, `a-${suffix}`);
  createdIds.push(txn1.id);

  const homeBefore = await moneyDeskHome(prisma, founder.id);
  const rowBefore = homeBefore.pendingApprovals.find((t) => t.id === txn1.id);
  check("entry appears in the Founder's own Pending Approvals list", Boolean(rowBefore));
  check("list-view isSelf is now FALSE for the Founder (buttons render, not the blocked message)", rowBefore?.isSelf === false);

  const detailBefore = await moneyDeskTransactionDetail(prisma, founder.id, txn1.id);
  check("detail-view canApprove is now TRUE for the Founder's own entry", detailBefore.canApprove === true);
  check("detail-view isSelf is now FALSE (no longer claims 'cannot approve it yourself')", detailBefore.isSelf === false);

  console.log("\n=== Founder can now genuinely approve their own entry ===");
  const approved = await decideMoneyDeskApproval(prisma, founder.id, txn1.id, { decision: "APPROVED", reason: "Founder self-approval — governed bypass" });
  check("status moved to POSTING (approval accepted, now processing)", (approved as { status: string }).status === "POSTING" || (approved as { status: string }).status === "POSTED");
  const afterApprove = await prisma.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: txn1.id } });
  check("approvedById recorded as the Founder themselves", afterApprove.approvedById === founder.id);
  check("no longer sitting in PENDING_APPROVAL", afterApprove.status !== "PENDING_APPROVAL");

  console.log("\n=== A non-Founder (no system:super_admin) is STILL correctly denied self-approval ===");
  const txn2 = await makePendingTxn(accountsManager.id, `b-${suffix}`);
  createdIds.push(txn2.id);
  await decideMoneyDeskApproval(prisma, accountsManager.id, txn2.id, { decision: "APPROVED", reason: "attempted self-approval" }).then(
    () => check("non-Founder self-approval correctly rejected", false),
    (e) => check("non-Founder self-approval correctly rejected (MONEY_DESK_SELF_APPROVAL_DENIED)", (e as { code?: string }).code === "MONEY_DESK_SELF_APPROVAL_DENIED"),
  );

  console.log("\n=== Founder can also REJECT their own entry (not just approve) ===");
  const txn3 = await makePendingTxn(founder.id, `c-${suffix}`);
  createdIds.push(txn3.id);
  const rejected = await decideMoneyDeskApproval(prisma, founder.id, txn3.id, { decision: "REJECTED", reason: "Founder self-reject — governed bypass" });
  check("Founder can reject their own entry too", (rejected as { status: string }).status === "REJECTED");

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  const posted = await prisma.seeraMoneyDeskTransaction.findMany({ where: { id: { in: createdIds } }, select: { downstreamRefs: true, idempotencyKey: true } });
  const journalIds = posted.map((p) => (p.downstreamRefs as { journalId?: string } | null)?.journalId).filter((id): id is string => Boolean(id));
  if (journalIds.length) {
    await prisma.seeraJournalLine.deleteMany({ where: { journalId: { in: journalIds } } });
    await prisma.seeraJournalEntry.deleteMany({ where: { id: { in: journalIds } } });
  }
  const expenseIds = posted.map((p) => (p.downstreamRefs as { expenseId?: string } | null)?.expenseId).filter((id): id is string => Boolean(id));
  if (expenseIds.length) await prisma.seeraExpense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { id: { in: createdIds } } });
  const remaining = await prisma.seeraMoneyDeskTransaction.count({ where: { id: { in: createdIds } } });
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
