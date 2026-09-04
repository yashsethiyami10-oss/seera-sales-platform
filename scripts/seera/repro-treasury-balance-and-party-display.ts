import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMoneyDeskTransaction } from "../../lib/finance/money-desk-service";
import { treasuryCurrentBalances } from "../../lib/finance/treasury-service";
import { journalDetail, recentJournals } from "../../lib/finance/journal-service";

// Money Desk + Founder Approvals Integration mission — §6/§7 (Treasury balance) + §8/9 (party
// display) + §10 (journal display), all proven together via the mission's own §33 acceptance
// scenario: a real ₹30,000 incoming Distributor payment into SEERA Cash.
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

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const suffix = randomUUID().slice(0, 8);

  console.log("=== Setup: real SEERA Cash treasury account + a real ABC Test Distributor ===");
  const cashAccount = await prisma.seeraTreasuryAccount.findFirstOrThrow({ where: { kind: "CASH", isActive: true } });
  const distributor = await prisma.seeraPartner.findFirstOrThrow({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" } });
  console.log(`  cash account: ${cashAccount.name} (${cashAccount.id})`);
  console.log(`  distributor: ${distributor.tradeName ?? distributor.legalName} (${distributor.id})`);

  const balancesBefore = await treasuryCurrentBalances(prisma, [cashAccount.id]);
  const cashBefore = balancesBefore.get(cashAccount.id) ?? 0;
  console.log(`  [info] Cash balance BEFORE: ₹${cashBefore}`);

  console.log("\n=== ₹30,000 Distributor payment — REC-INS, Money In, Cash ===");
  const txn = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "REC-INS",
    direction: "CASH_IN",
    amount: 30000,
    date: new Date(),
    treasuryAccountId: cashAccount.id,
    counterpartyType: "DISTRIBUTOR",
    counterpartyId: distributor.id,
    counterpartyName: distributor.tradeName ?? distributor.legalName,
    formData: {},
    idempotencyKey: `repro-treasury-30k-${suffix}`,
  });
  check("transaction POSTED (Founder auto-clears approval)", (txn as { status: string }).status === "POSTED");

  console.log("\n=== §6/§7 — Treasury Cash balance increased by EXACTLY ₹30,000 ===");
  const balancesAfter = await treasuryCurrentBalances(prisma, [cashAccount.id]);
  const cashAfter = balancesAfter.get(cashAccount.id) ?? 0;
  check(`Cash balance AFTER = before + 30,000 (${cashBefore} -> ${cashAfter})`, Math.abs(cashAfter - cashBefore - 30000) < 0.01);

  console.log("\n=== §8/9 — party name now appears in Money Desk's own transaction row ===");
  const row = await prisma.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: (txn as { id: string }).id }, select: { counterpartyName: true, counterpartyType: true, counterpartyId: true } });
  check("counterpartyName is the real Distributor firm name", row.counterpartyName === (distributor.tradeName ?? distributor.legalName));
  // REC-INS's registry entry fixes counterpartyType to the generic "CUSTOMER" bucket regardless of
  // the real entity's specific type (Retailer vs Distributor/S.S.) — counterpartyId is still the
  // real, specific, canonical SeeraPartner.id (never a duplicate free-text party store); this is
  // existing, pre-mission architecture, not something this mission asked to redesign.
  check("counterpartyId is the real canonical Distributor party relation (not a duplicate free-text store)", row.counterpartyId === distributor.id);

  console.log("\n=== §10 — Journal display resolves the same real party name on the ledger line ===");
  const downstreamRefs = (await prisma.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: (txn as { id: string }).id }, select: { downstreamRefs: true } })).downstreamRefs as { journalId?: string } | null;
  check("a real journal was posted", Boolean(downstreamRefs?.journalId));
  if (downstreamRefs?.journalId) {
    const detail = await journalDetail(prisma, founder.id, downstreamRefs.journalId);
    // The party relation lives on the CREDIT line (Trade Receivables/Customer Advance) — the DEBIT
    // (Cash) line never carries partyType/partyId, matching recordMoneyIn's own line construction.
    const receivableLine = detail.lines.find((l) => l.credit === 30000);
    check("the receivable/advance credit line resolves the real Distributor party name (not a raw id)", receivableLine?.partyName === (distributor.tradeName ?? distributor.legalName));
    const recent = await recentJournals(prisma, founder.id, 5);
    check("journal also appears in Recent Journals feed", recent.some((j) => j.id === downstreamRefs.journalId));
  }

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== §34 — Final zero-state cleanup: remove the controlled test transaction entirely ===");
  const posted = await prisma.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: (txn as { id: string }).id }, select: { downstreamRefs: true } });
  const journalId = (posted.downstreamRefs as { journalId?: string } | null)?.journalId;
  if (journalId) {
    await prisma.seeraJournalLine.deleteMany({ where: { journalId } });
    await prisma.seeraJournalEntry.delete({ where: { id: journalId } });
  }
  const financialEntry = await prisma.seeraFinancialEntry.findUnique({ where: { idempotencyKey: `${(txn as { idempotencyKey: string }).idempotencyKey}:financial_entry` } }).catch(() => null);
  if (financialEntry) await prisma.seeraFinancialEntry.delete({ where: { id: financialEntry.id } });
  await prisma.seeraMoneyDeskTransaction.delete({ where: { id: (txn as { id: string }).id } });
  const remaining = await prisma.seeraMoneyDeskTransaction.count({ where: { id: (txn as { id: string }).id } });
  console.log(`Remaining: moneyDeskTxns=${remaining}`);
  const balancesFinal = await treasuryCurrentBalances(prisma, [cashAccount.id]);
  const cashFinal = balancesFinal.get(cashAccount.id) ?? 0;
  console.log(`Cash balance back to baseline: ${Math.abs(cashFinal - cashBefore) < 0.01 ? "YES" : `NO (${cashFinal} vs ${cashBefore})`}`);
  if (remaining !== 0 || Math.abs(cashFinal - cashBefore) >= 0.01) throw new Error("CLEANUP_INCOMPLETE — did not return to clean baseline");
  console.log("Cleanup proven complete — production returned to clean baseline.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
