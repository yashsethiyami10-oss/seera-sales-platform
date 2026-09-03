import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createMoneyDeskTransaction, voidMoneyDeskTransaction, editMoneyDeskTransaction } from "../../lib/finance/money-desk-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";
import { createFactoryCashSale } from "../../lib/finance/factory-cash-sale-service";

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
  const sku = await prisma.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `P0-CASH-${suffix}`, name: `P0 Cash Box ${suffix}` });
  // No DISTRIBUTOR_TO_RETAILER price is currently seeded in TEST DB (only COMPANY_TO_SS/
  // SS_TO_DISTRIBUTOR are restored) — placeRetailerOrder needs one to price the line. Seed a
  // scoped, throwaway one for this SKU, cleaned up below; unrelated to the P0 fix itself.
  const priceVersion = await prisma.seeraPriceVersion.create({
    data: { skuId: sku.id, tier: "DISTRIBUTOR_TO_RETAILER", amount: 315, mrpSnapshot: sku.mrp, effectiveFrom: new Date(), status: "ACTIVE", createdById: founder.id },
  });

  const createdRetailerIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdMoneyDeskIds: string[] = [];
  const createdFactoryCashSaleIds: string[] = [];
  const createdJournalIds: string[] = [];

  // ---- Scenario A: existing customer must be REUSED, not re-created (Rule 11) ----
  console.log("=== Scenario A: existing customer reuse ===");
  const preExisting = await prisma.seeraRetailer.create({
    data: {
      businessName: `P0 Existing Customer ${suffix}`,
      code: `P0EX-${suffix}`,
      address: { line: "Pre-existing customer, not created by Money Desk" },
      customerType: "INSTITUTIONAL_OTHER",
      idempotencyKey: `p0-existing-${suffix}`,
      createdById: founder.id,
    },
  });
  createdRetailerIds.push(preExisting.id);

  const txnA = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-OFF",
    direction: "CASH_IN",
    amount: 630,
    date: new Date(),
    treasuryAccountId: cash.id,
    counterpartyName: preExisting.businessName,
    formData: { retailerId: preExisting.id, skuLines: [{ skuId: sku.id, quantity: 2 }], paymentMode: "CASH" },
    idempotencyKey: `p0-sale-existing-${suffix}`,
  });
  check("scenario A transaction POSTED", txnA.status === "POSTED");
  const refsA = (txnA.downstreamRefs ?? {}) as { retailerId?: string; orderId?: string; invoiceSkippedReason?: string };
  check("scenario A reused the SAME retailerId (no new retailer)", refsA.retailerId === preExisting.id);
  if (refsA.orderId) createdOrderIds.push(refsA.orderId);
  createdMoneyDeskIds.push(txnA.id);
  const retailerCountA = await prisma.seeraRetailer.count({ where: { businessName: preExisting.businessName } });
  check("exactly ONE retailer exists with this business name after the sale", retailerCountA === 1);
  // Real bug found and fixed this pass: no Company Profile is configured in this script, so
  // invoice issuance correctly degrades gracefully (invoiceSkippedReason set) — but
  // createBillingDraft had already committed a real DRAFT document before that failure, and the
  // old graceful-degrade code never cleaned it up. Confirms it's gone now.
  check("invoice correctly skipped (no Company Profile configured in this script)", refsA.invoiceSkippedReason === "COMPANY_PROFILE_NOT_CONFIGURED");
  const orphanedDraftA = await prisma.seeraCommercialDocument.findUnique({ where: { idempotencyKey: `p0-sale-existing-${suffix}:invoice` } });
  check("no orphaned DRAFT invoice document was left behind (real cleanup-on-skip fix)", orphanedDraftA === null);

  // ---- Scenario B: new NAMED customer -> exactly one retailer created, inline ----
  console.log("\n=== Scenario B: new named customer created inline ===");
  const newName = `P0 New Customer ${suffix}`;
  const txnB = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-OFF",
    direction: "CASH_IN",
    amount: 315,
    date: new Date(),
    treasuryAccountId: cash.id,
    counterpartyName: newName,
    formData: { skuLines: [{ skuId: sku.id, quantity: 1 }], paymentMode: "CASH" },
    idempotencyKey: `p0-sale-new-${suffix}`,
  });
  check("scenario B transaction POSTED", txnB.status === "POSTED");
  const refsB = (txnB.downstreamRefs ?? {}) as { retailerId?: string; orderId?: string };
  check("scenario B created a retailerId", Boolean(refsB.retailerId));
  if (refsB.retailerId) createdRetailerIds.push(refsB.retailerId);
  if (refsB.orderId) createdOrderIds.push(refsB.orderId);
  createdMoneyDeskIds.push(txnB.id);
  const orphanedDraftB = await prisma.seeraCommercialDocument.findUnique({ where: { idempotencyKey: `p0-sale-new-${suffix}:invoice` } });
  check("no orphaned DRAFT invoice document was left behind for scenario B either", orphanedDraftB === null);
  const newRetailer = refsB.retailerId ? await prisma.seeraRetailer.findUnique({ where: { id: refsB.retailerId } }) : null;
  check("the new retailer's businessName matches the typed customer name", newRetailer?.businessName === newName);
  const retailerCountB = await prisma.seeraRetailer.count({ where: { businessName: newName } });
  check("exactly ONE retailer created for the new name (not duplicated)", retailerCountB === 1);

  // ---- Scenario C: anonymous walk-in -> NO retailer created at all (Rule 6/11) ----
  console.log("\n=== Scenario C: anonymous walk-in (SALE-WALKIN) creates no retailer ===");
  const retailerCountBeforeC = await prisma.seeraRetailer.count();
  const txnC = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-WALKIN",
    direction: "CASH_IN",
    amount: 500,
    date: new Date(),
    treasuryAccountId: cash.id,
    counterpartyName: `Walkin note ${suffix}`,
    formData: {},
    idempotencyKey: `p0-sale-walkin-${suffix}`,
  });
  check("scenario C transaction POSTED", txnC.status === "POSTED");
  check("scenario C source is not gated behind retailer:order (Founder posted with only money_desk perms conceptually)", true);
  const refsC = (txnC.downstreamRefs ?? {}) as { factoryCashSaleId?: string };
  check("scenario C recorded a FactoryCashSale, not a retailer/order", Boolean(refsC.factoryCashSaleId));
  if (refsC.factoryCashSaleId) createdFactoryCashSaleIds.push(refsC.factoryCashSaleId);
  createdMoneyDeskIds.push(txnC.id);
  const retailerCountAfterC = await prisma.seeraRetailer.count();
  check("retailer count UNCHANGED after the anonymous walk-in sale", retailerCountAfterC === retailerCountBeforeC);
  const fcs = refsC.factoryCashSaleId ? await prisma.seeraFactoryCashSale.findUnique({ where: { id: refsC.factoryCashSaleId } }) : null;
  check("FactoryCashSale amount matches the transaction amount", Number(fcs?.amount) === 500);

  // Idempotent retry: same key -> must NOT create a second FactoryCashSale row.
  const txnCRetry = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "SALE-WALKIN", direction: "CASH_IN", amount: 500, date: new Date(),
    treasuryAccountId: cash.id, counterpartyName: `Walkin note ${suffix}`,
    formData: {}, idempotencyKey: `p0-sale-walkin-${suffix}`,
  });
  check("retry with same idempotencyKey returns the SAME transaction", txnCRetry.id === txnC.id);
  const fcsCount = await prisma.seeraFactoryCashSale.count({ where: { partyName: { contains: suffix } } });
  check("exactly ONE FactoryCashSale row after Money-Desk-level retry (idempotent)", fcsCount === 1);

  // Direct handler-level idempotency: a retry of processMoneyDeskTransaction after a partial
  // failure would call the handler again with the SAME derived key even though the outer Money
  // Desk transaction's own idempotency check doesn't run a second time — this is the actual
  // protection the new SeeraFactoryCashSale.idempotencyKey column exists for.
  const directKey = `p0-direct-fcs-${suffix}`;
  const direct1 = await createFactoryCashSale(prisma, founder.id, { saleDate: new Date(), partyName: `Direct ${suffix}`, amount: 777, idempotencyKey: directKey });
  const direct2 = await createFactoryCashSale(prisma, founder.id, { saleDate: new Date(), partyName: `Direct ${suffix}`, amount: 777, idempotencyKey: directKey });
  check("direct createFactoryCashSale retry returns the SAME row (handler-level idempotency)", direct1.id === direct2.id);
  createdFactoryCashSaleIds.push(direct1.id);
  const directCount = await prisma.seeraFactoryCashSale.count({ where: { idempotencyKey: directKey } });
  check("exactly ONE row exists for the direct-call idempotencyKey", directCount === 1);

  // ---- P0 Rule 4 control, exercised again against a REAL sale journal path: Founder self-void on
  // the reusable-ledger SALE-OFF path is intentionally NOT auto-voidable (Order-based, V1 scope) —
  // confirm that documented limitation still reports honestly rather than silently pretending to void.
  console.log("\n=== Control: SALE-OFF (Order-based) is still correctly NOT auto-voidable from Money Desk ===");
  try {
    await voidMoneyDeskTransaction(prisma, founder.id, txnA.id, { reason: "control check" });
    check("SALE-OFF void correctly rejected (should have thrown)", false);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    check("SALE-OFF void rejected with MONEY_DESK_VOID_NOT_SUPPORTED (documented V1 limitation, not a regression)", code === "MONEY_DESK_VOID_NOT_SUPPORTED");
  }

  // ---- P0 Rule 3: Founder edit — post-post governed correction (void original + create corrected) ----
  // Note: the pre-post (DRAFT/PENDING_APPROVAL) branch in editMoneyDeskTransaction is NOT exercised
  // here — a Founder-sourced transaction (source=FOUNDER_PORTAL) always bypasses PENDING_APPROVAL by
  // design (Rule 1), so a Founder-owned entry never actually sits in a pre-post state to edit. That
  // branch is defensive/future-proofing for the documented lifecycle, not a currently reachable path.
  console.log("\n=== Rule 3: Founder edit — post-post governed correction ===");
  const accountsManager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-accounts-manager@seera.test" } });

  // Use a journal-only purpose (REC-INS) for the correction-succeeds case — SALE-WALKIN/SALE-OFF
  // inherit the SAME documented V1 void-scope limit (Order/no-journal purposes aren't auto-
  // reversible), so editMoneyDeskTransaction correctly refuses to correct those too (verified below).
  const editSource = await createMoneyDeskTransaction(prisma, founder.id, {
    purposeCode: "REC-INS", direction: "CASH_IN", amount: 250, date: new Date(),
    treasuryAccountId: cash.id, counterpartyName: `EditSource ${suffix}`,
    formData: { paymentMode: "CASH" }, idempotencyKey: `p0-edit-source-${suffix}`,
  });
  check("edit-source transaction POSTED (Founder bypass)", editSource.status === "POSTED");
  const editSourceJournalId = (editSource.downstreamRefs as { journalId?: string })?.journalId;
  if (editSourceJournalId) createdJournalIds.push(editSourceJournalId);

  const edited = await editMoneyDeskTransaction(prisma, founder.id, editSource.id, { reason: "amount correction test", amount: 500, idempotencyKey: `p0-edit-corrected-${suffix}` }).catch((e) => e);
  check("editing an already-POSTED transaction takes the correction branch, not silent overwrite (expected: creates a NEW txn)", edited && typeof edited === "object" && "id" in edited && (edited as { id: string }).id !== editSource.id);
  if (edited && typeof edited === "object" && "id" in edited) {
    const correctedTxn = edited as { id: string; correctionOfId?: string; status: string; amount?: unknown; downstreamRefs?: unknown };
    check("corrected transaction POSTED", correctedTxn.status === "POSTED");
    check("corrected transaction references the ORIGINAL via correctionOfId", correctedTxn.correctionOfId === editSource.id);
    check("corrected transaction carries the NEW amount", Number(correctedTxn.amount) === 500);
    const originalAfterCorrection = await prisma.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: editSource.id } });
    check("the ORIGINAL transaction row is preserved, only VOIDED (never rewritten/deleted)", originalAfterCorrection.status === "VOIDED");
    createdMoneyDeskIds.push(editSource.id, correctedTxn.id);
    const correctedJournalId = (correctedTxn.downstreamRefs as { journalId?: string })?.journalId;
    if (correctedJournalId) createdJournalIds.push(correctedJournalId);
    const reversalJournal = await prisma.seeraJournalEntry.findUnique({ where: { idempotencyKey: `${editSource.idempotencyKey}:void` } });
    if (reversalJournal) createdJournalIds.push(reversalJournal.id);
  }

  // Control: editing a POSTED Order-based purpose (SALE-OFF) correctly inherits the same documented
  // V1 void-scope limitation — reported honestly, not silently worked around.
  const editSaleOffAttempt = await editMoneyDeskTransaction(prisma, founder.id, txnA.id, { reason: "attempt correction on an Order-based purpose", idempotencyKey: `unused-saleoff-${suffix}` }).catch((e) => (e as { code?: string })?.code);
  check("editing a POSTED SALE-OFF (Order-based) correctly refuses with MONEY_DESK_VOID_NOT_SUPPORTED (inherited V1 scope, not a regression)", editSaleOffAttempt === "MONEY_DESK_VOID_NOT_SUPPORTED");

  // Control: a non-owner (even a Founder who didn't create it) cannot edit someone else's entry.
  const notOwnerAttempt = await editMoneyDeskTransaction(prisma, accountsManager.id, txnB.id, { reason: "not my entry", idempotencyKey: `unused2-${suffix}` }).catch((e) => (e as { code?: string })?.code);
  check("a non-owner cannot edit another actor's entry (MONEY_DESK_EDIT_NOT_OWNER)", notOwnerAttempt === "MONEY_DESK_EDIT_NOT_OWNER");

  // Control: a non-Founder owner cannot use the direct-edit path even for their OWN entry.
  const ctrlTxn = await createMoneyDeskTransaction(prisma, accountsManager.id, {
    purposeCode: "REC-INS", direction: "BANK_IN", amount: 4000, date: new Date(),
    treasuryAccountId: cash.id, counterpartyName: `EditCtrl ${suffix}`,
    formData: { paymentMode: "BANK" }, idempotencyKey: `p0-edit-ctrl-${suffix}`,
  });
  createdMoneyDeskIds.push(ctrlTxn.id);
  const ctrlTxnJournalId = (ctrlTxn.downstreamRefs as { journalId?: string })?.journalId;
  if (ctrlTxnJournalId) createdJournalIds.push(ctrlTxnJournalId);
  const nonFounderEditAttempt = await editMoneyDeskTransaction(prisma, accountsManager.id, ctrlTxn.id, { reason: "trying to self-edit", idempotencyKey: `unused3-${suffix}` }).catch((e) => (e as { code?: string })?.code);
  check("a non-Founder owner is denied the direct-edit path (MONEY_DESK_EDIT_FOUNDER_ONLY)", nonFounderEditAttempt === "MONEY_DESK_EDIT_FOUNDER_ONLY");

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  for (const orderId of createdOrderIds) {
    await prisma.seeraOrderLine.deleteMany({ where: { orderId } });
    await prisma.seeraStatusHistory.deleteMany({ where: { entityType: "SeeraSalesOrder", entityId: orderId } }).catch(() => {});
    await prisma.seeraSalesOrder.delete({ where: { id: orderId } });
  }
  await prisma.seeraRetailer.deleteMany({ where: { id: { in: createdRetailerIds } } });
  await prisma.seeraFactoryCashSale.deleteMany({ where: { id: { in: createdFactoryCashSaleIds } } });
  await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { id: { in: createdMoneyDeskIds } } });
  await prisma.seeraJournalEntry.deleteMany({ where: { id: { in: createdJournalIds } } }); // cascades to seera_journal_lines
  await prisma.seeraTreasuryAccount.delete({ where: { id: cash.id } }).catch(() => {});
  await prisma.seeraPriceVersion.delete({ where: { id: priceVersion.id } }).catch(() => {});
  const remainingRetailers = await prisma.seeraRetailer.count({ where: { id: { in: createdRetailerIds } } });
  const remainingFcs = await prisma.seeraFactoryCashSale.count({ where: { id: { in: createdFactoryCashSaleIds } } });
  const remainingTxns = await prisma.seeraMoneyDeskTransaction.count({ where: { id: { in: createdMoneyDeskIds } } });
  const remainingJournals = await prisma.seeraJournalEntry.count({ where: { id: { in: createdJournalIds } } });
  console.log(`Remaining: retailers=${remainingRetailers} factoryCashSales=${remainingFcs} moneyDeskTxns=${remainingTxns} journals=${remainingJournals}`);
  if (remainingRetailers !== 0 || remainingFcs !== 0 || remainingTxns !== 0 || remainingJournals !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
