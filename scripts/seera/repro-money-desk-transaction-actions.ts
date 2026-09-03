import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMoneyDeskTransaction, moneyDeskTransactionDetail } from "../../lib/finance/money-desk-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";
import { updateFinanceApprovalPolicy, seedDefaultFinanceApprovalPolicies } from "../../lib/finance/approval-policy-service";

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
  const accountsManager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });
  await seedDefaultFinanceApprovalPolicies(prisma, founder.id);
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `ACT-CASH-${suffix}`, name: `Actions Test Cash ${suffix}` });

  console.log("=== canEdit / canVoid: Founder's own POSTED transaction ===");
  const founderTxn = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-WALKIN", direction: "CASH_IN", amount: 500, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: `Actions ${suffix}`, formData: {}, idempotencyKey: `act-founder-${suffix}`,
  });
  const founderDetail = await moneyDeskTransactionDetail(prisma, founder.id, founderTxn.id);
  check("Founder sees canEdit=true on their own POSTED transaction", founderDetail.canEdit === true);
  check("Founder sees canApprove=false (already posted, nothing pending)", founderDetail.canApprove === false);
  // SALE-WALKIN has no journalId (FactoryCashSale-based) so canVoid should still be TRUE per the flag's
  // OWN logic (permission+ownership), even though the underlying void call would separately fail with
  // MONEY_DESK_VOID_NOT_SUPPORTED — the flag only gates whether the button SHOWS, matching what the
  // real voidMoneyDeskTransaction() permission/ownership checks would allow before that later, honest
  // "not supported for this purpose" error.
  check("Founder sees canVoid=true (permission+ownership satisfied)", founderDetail.canVoid === true);

  const accountsManagerViewOfFounderTxn = await moneyDeskTransactionDetail(prisma, accountsManager.id, founderTxn.id);
  check("A different actor (Accounts Manager) does NOT see canEdit on someone else's transaction", accountsManagerViewOfFounderTxn.canEdit === false);

  console.log("\n=== canApprove: non-Founder's PENDING_APPROVAL transaction ===");
  await updateFinanceApprovalPolicy(prisma, founder.id, { category: "PAYMENT", thresholdAmount: 0, requiresApproval: true });
  const pendingTxn = await createMoneyDeskTransaction(prisma, accountsManager.id, {
    purposeCode: "REC-INS", direction: "BANK_IN", amount: 4000, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: `ActionsPending ${suffix}`, formData: { paymentMode: "BANK" }, idempotencyKey: `act-pending-${suffix}`,
  });
  check("transaction is genuinely PENDING_APPROVAL", pendingTxn.status === "PENDING_APPROVAL");
  const creatorDetail = await moneyDeskTransactionDetail(prisma, accountsManager.id, pendingTxn.id);
  check("the CREATOR does not see canApprove on their own pending transaction (self-approval)", creatorDetail.canApprove === false);
  const founderViewOfPending = await moneyDeskTransactionDetail(prisma, founder.id, pendingTxn.id);
  check("the FOUNDER (independent, holds money_desk:approve via super_admin) sees canApprove=true", founderViewOfPending.canApprove === true);
  check("canEdit is false for the Founder viewing someone else's transaction", founderViewOfPending.canEdit === false);
  await updateFinanceApprovalPolicy(prisma, founder.id, { category: "PAYMENT", thresholdAmount: 0, requiresApproval: false });

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraFactoryCashSale.deleteMany({ where: { partyName: { contains: suffix } } });
  await prisma.seeraJournalLine.deleteMany({ where: { journal: { idempotencyKey: { contains: suffix } } } }).catch(() => {});
  const pendingRefreshed = await prisma.seeraMoneyDeskTransaction.findUnique({ where: { id: pendingTxn.id } });
  if (pendingRefreshed?.status === "PENDING_APPROVAL") {
    // never posted (rejected path not exercised) — safe to delete directly, no downstream journal exists yet.
    await prisma.seeraMoneyDeskTransaction.delete({ where: { id: pendingTxn.id } });
  } else {
    const refs = (pendingRefreshed?.downstreamRefs ?? {}) as { journalId?: string };
    if (refs.journalId) await prisma.seeraJournalEntry.delete({ where: { id: refs.journalId } }).catch(() => {});
    await prisma.seeraMoneyDeskTransaction.delete({ where: { id: pendingTxn.id } });
  }
  await prisma.seeraMoneyDeskTransaction.delete({ where: { id: founderTxn.id } });
  await prisma.seeraTreasuryAccount.delete({ where: { id: cash.id } });
  const remaining = await prisma.seeraMoneyDeskTransaction.count({ where: { id: { in: [founderTxn.id, pendingTxn.id] } } });
  console.log(`Remaining money desk transactions: ${remaining}`);
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
