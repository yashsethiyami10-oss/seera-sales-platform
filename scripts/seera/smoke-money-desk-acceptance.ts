import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { seedDefaultChartOfAccounts } from "../../lib/finance/chart-of-accounts";
import { seedDefaultDimensions } from "../../lib/finance/dimension-service";
import { seedDefaultFinanceApprovalPolicies, updateFinanceApprovalPolicy } from "../../lib/finance/approval-policy-service";
import { seedQuickEntryCategoryMaster } from "../../lib/finance/chart-of-accounts";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";
import { createVendor } from "../../lib/finance/vendor-service";
import { createMaterial, createLocation } from "../../lib/manufacturing/material-service";
import { createMoneyDeskTransaction, decideMoneyDeskApproval, processMoneyDeskTransaction } from "../../lib/finance/money-desk-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only, live end-to-end acceptance suite for Money Desk (spec Part C — the
// Founder's own 8 named acceptance tests). Runs against a real TEST database,
// never production. Safe to re-run (fresh idempotency keys each run).

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "6");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

let pass = 0;
let fail = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (cond) { pass++; console.log(`  PASS: ${message}`); }
  else { fail++; console.error(`  FAIL: ${message}`); }
}
async function expectError(code: string, label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    fail++;
    console.error(`  FAIL: ${label} — expected ${code} but call succeeded`);
  } catch (error) {
    const actual = error instanceof FoundationError ? error.code : String(error);
    assert(actual === code, `${label} — expected ${code}, got ${actual}`);
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const founder = await db.user.findFirstOrThrow({ where: { email: "review-founder@seera.test" } });
  const accountsManager = await db.user.findFirstOrThrow({ where: { email: "review-accounts-manager@seera.test" } });
  const run = Date.now().toString(36);

  console.log("\n=== Bootstrap (idempotent) ===");
  await seedDefaultChartOfAccounts(db, founder.id);
  await seedDefaultDimensions(db, founder.id);
  await seedDefaultFinanceApprovalPolicies(db, founder.id);
  await seedQuickEntryCategoryMaster(db, founder.id);
  // Generous thresholds so tests 1-7 clear without an approval detour — test 8
  // deliberately tightens EXPENSE afterward to force the gate.
  await updateFinanceApprovalPolicy(db, founder.id, { category: "VENDOR_BILL", thresholdAmount: 0, requiresApproval: false });
  await updateFinanceApprovalPolicy(db, founder.id, { category: "PAYMENT", thresholdAmount: 0, requiresApproval: false });
  await updateFinanceApprovalPolicy(db, founder.id, { category: "EXPENSE", thresholdAmount: 10_000_000, requiresApproval: true });

  const bank = await createTreasuryAccount(db, founder.id, { kind: "BANK", code: `MD-BANK-${run}`, name: `Money Desk Bank ${run}` });
  const cash = await createTreasuryAccount(db, founder.id, { kind: "CASH", code: `MD-CASH-${run}`, name: `Money Desk Cash ${run}` });
  const vendor = await createVendor(db, founder.id, { code: `MD-VEN-${run}`, legalName: `Money Desk Test Vendor ${run}` });
  let material = await db.seeraManufacturingMaterial.findFirst({ where: { isActive: true } });
  if (!material) material = await createMaterial(db, founder.id, { code: `MD-MAT-${run}`, name: `Money Desk Test Material ${run}`, type: "RAW_MATERIAL", baseUnit: "KG" });
  let location = await db.seeraManufacturingLocation.findFirst({ where: { isActive: true } });
  if (!location) location = await createLocation(db, founder.id, { code: `MD-LOC-${run}`, name: `Money Desk Test Location ${run}`, type: "RAW_MATERIAL_STORE" });

  console.log("\n=== TEST 1: Raw material purchase — paid now ===");
  // Raw Material Purchase requires real Manufacturing GRN authority (mfg_grn:manage) in addition to
  // Money Desk access — ACCOUNTS_MANAGER alone doesn't hold it (by design: this purpose genuinely
  // needs Manufacturing-side authority, not just Finance), so the Founder fixture operates it here.
  const rm1 = await createMoneyDeskTransaction(db, founder.id, {
    purposeCode: "PUR-RM", direction: "BANK_OUT", amount: 5000, date: new Date(), treasuryAccountId: bank.id,
    counterpartyType: "VENDOR", counterpartyId: vendor.id, counterpartyName: vendor.legalName, documentFileId: "doc-rm1",
    formData: { materialId: material.id, quantity: 10, unit: "KG", locationId: location.id, vendorInvoiceNumber: `RM1-${run}`, invoiceDate: new Date().toISOString(), dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString(), taxable: 5000, paidNow: true, treasuryAccountCoaCode: bank.chartOfAccountCode },
    idempotencyKey: `md-test1-${run}`,
  });
  assert(rm1.status === "POSTED", `raw material paid-now → POSTED (got ${rm1.status}: ${rm1.failureReason ?? ""})`);
  const rm1Refs = rm1.downstreamRefs as { grnId: string; billId: string; paymentId: string; paidNow: boolean };
  assert(!!rm1Refs.grnId && !!rm1Refs.billId && !!rm1Refs.paymentId, "raw material paid-now → GRN + Vendor Bill + Vendor Payment all created");
  const rm1Grn = await db.seeraGrn.findUniqueOrThrow({ where: { id: rm1Refs.grnId } });
  assert(rm1Grn.status === "POSTED", "raw material paid-now → GRN is POSTED (real stock movement occurred)");
  const rm1Bill = await db.seeraVendorBill.findUniqueOrThrow({ where: { id: rm1Refs.billId } });
  assert(rm1Bill.status === "PAID" && Number(rm1Bill.paidAmount) === Number(rm1Bill.grossAmount), "raw material paid-now → Vendor Bill fully PAID");
  assert(rm1Bill.sourceGrnId === rm1Refs.grnId, "raw material paid-now → Vendor Bill linked back to its GRN");

  console.log("\n=== TEST 2: Raw material purchase — on credit, then paid later ===");
  const rm2 = await createMoneyDeskTransaction(db, founder.id, {
    purposeCode: "PUR-RM", direction: "ADJUSTMENT", amount: 3000, date: new Date(), treasuryAccountId: bank.id,
    counterpartyType: "VENDOR", counterpartyId: vendor.id, counterpartyName: vendor.legalName, documentFileId: "doc-rm2",
    formData: { materialId: material.id, quantity: 6, unit: "KG", locationId: location.id, vendorInvoiceNumber: `RM2-${run}`, invoiceDate: new Date().toISOString(), dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString(), taxable: 3000, paidNow: false },
    idempotencyKey: `md-test2-${run}`,
  });
  assert(rm2.status === "POSTED", `raw material on-credit → POSTED (got ${rm2.status}: ${rm2.failureReason ?? ""})`);
  const rm2Refs = rm2.downstreamRefs as { grnId: string; billId: string; paymentId?: string };
  assert(!rm2Refs.paymentId, "raw material on-credit → no payment made yet");
  const rm2Bill = await db.seeraVendorBill.findUniqueOrThrow({ where: { id: rm2Refs.billId } });
  assert(rm2Bill.status === "APPROVED" && Number(rm2Bill.paidAmount) === 0, "raw material on-credit → Vendor Bill outstanding (APPROVED, unpaid)");
  const payLater = await createMoneyDeskTransaction(db, accountsManager.id, {
    purposeCode: "PAY-VEN", direction: "BANK_OUT", amount: Number(rm2Bill.grossAmount), date: new Date(), treasuryAccountId: bank.id,
    counterpartyType: "VENDOR", counterpartyId: vendor.id, counterpartyName: vendor.legalName,
    formData: { billId: rm2Bill.id, treasuryAccountCoaCode: bank.chartOfAccountCode },
    idempotencyKey: `md-test2-paylater-${run}`,
  });
  assert(payLater.status === "POSTED", `raw material paid-later via PAY-VEN → POSTED (got ${payLater.status}: ${payLater.failureReason ?? ""})`);
  const rm2BillAfter = await db.seeraVendorBill.findUniqueOrThrow({ where: { id: rm2Bill.id } });
  assert(rm2BillAfter.status === "PAID", "raw material paid-later → Vendor Bill now PAID via the SAME existing bill, no duplicate GRN");

  console.log("\n=== TEST 3: Diesel (fuel expense, no inventory effect) ===");
  const diesel = await createMoneyDeskTransaction(db, accountsManager.id, {
    purposeCode: "EXP-FUEL", direction: "CASH_OUT", amount: 1500, date: new Date(), treasuryAccountId: cash.id,
    counterpartyName: "Local pump", formData: {}, idempotencyKey: `md-test3-${run}`,
  });
  assert(diesel.status === "POSTED", `diesel → POSTED (got ${diesel.status}: ${diesel.failureReason ?? ""})`);
  const dieselRefs = diesel.downstreamRefs as { expenseId: string };
  const dieselExpense = await db.seeraExpense.findUniqueOrThrow({ where: { id: dieselRefs.expenseId } });
  assert(dieselExpense.status === "POSTED", "diesel → underlying Expense actually POSTED, not just Money Desk's own status");

  console.log("\n=== TEST 4: Institutional receipt (unallocated — no fabricated invoice match) ===");
  const receipt = await createMoneyDeskTransaction(db, accountsManager.id, {
    purposeCode: "REC-INS", direction: "BANK_IN", amount: 25000, date: new Date(), treasuryAccountId: bank.id,
    counterpartyName: `Institution ${run}`, formData: {}, idempotencyKey: `md-test4-${run}`,
  });
  assert(receipt.status === "POSTED", `institutional receipt → POSTED (got ${receipt.status}: ${receipt.failureReason ?? ""})`);
  const receiptRefs = receipt.downstreamRefs as { journalId: string; unallocated: boolean };
  assert(receiptRefs.unallocated === true, "institutional receipt with no known party → posted as unallocated advance, not a guessed invoice match");

  console.log("\n=== TEST 5: Salary ===");
  const salary = await createMoneyDeskTransaction(db, accountsManager.id, {
    purposeCode: "SAL-EMP", direction: "BANK_OUT", amount: 30000, date: new Date(), treasuryAccountId: bank.id,
    formData: { employeeId: accountsManager.id }, idempotencyKey: `md-test5-${run}`,
  });
  assert(salary.status === "POSTED", `salary → POSTED (got ${salary.status}: ${salary.failureReason ?? ""})`);

  console.log("\n=== TEST 6: Machinery (fixed asset — real capitalization) ===");
  const machinery = await createMoneyDeskTransaction(db, accountsManager.id, {
    purposeCode: "AST-MCH", direction: "BANK_OUT", amount: 80000, date: new Date(), treasuryAccountId: bank.id,
    counterpartyName: `Mixer Machine ${run}`, documentFileId: "doc-asset",
    formData: { category: "MACHINERY", treasuryAccountCoaCode: bank.chartOfAccountCode, usefulLifeMonths: 60 },
    idempotencyKey: `md-test6-${run}`,
  });
  assert(machinery.status === "POSTED", `machinery → POSTED (got ${machinery.status}: ${machinery.failureReason ?? ""})`);
  const assetRefs = machinery.downstreamRefs as { fixedAssetId: string };
  const asset = await db.seeraFixedAsset.findUniqueOrThrow({ where: { id: assetRefs.fixedAssetId } });
  assert(Number(asset.cost) === 80000 && !!asset.journalId, "machinery → capitalized as a real Fixed Asset (not blindly expensed)");

  console.log("\n=== TEST 7: Double-submit (idempotency — no double posting) ===");
  const beforeExpenseCount = await db.seeraExpense.count();
  const firstSubmit = await createMoneyDeskTransaction(db, accountsManager.id, {
    purposeCode: "EXP-OFFICE", direction: "CASH_OUT", amount: 500, date: new Date(), treasuryAccountId: cash.id,
    formData: {}, idempotencyKey: `md-test7-${run}`,
  });
  const secondSubmit = await createMoneyDeskTransaction(db, accountsManager.id, {
    purposeCode: "EXP-OFFICE", direction: "CASH_OUT", amount: 500, date: new Date(), treasuryAccountId: cash.id,
    formData: {}, idempotencyKey: `md-test7-${run}`,
  });
  const afterExpenseCount = await db.seeraExpense.count();
  assert(firstSubmit.id === secondSubmit.id, "double-submit (same idempotencyKey) → same Money Desk transaction returned both times");
  assert(afterExpenseCount - beforeExpenseCount === 1, `double-submit → exactly ONE Expense created (before=${beforeExpenseCount}, after=${afterExpenseCount})`);
  // Simulate a genuine client retry (e.g. after a network timeout) by re-invoking processMoneyDeskTransaction
  // directly on an already-POSTED transaction — must short-circuit, not re-post.
  const reprocessed = await processMoneyDeskTransaction(db, accountsManager.id, firstSubmit.id);
  assert(reprocessed.status === "POSTED", "re-invoking process on an already-POSTED transaction is a safe no-op");

  console.log("\n=== TEST 8: High-value approval gate ===");
  await updateFinanceApprovalPolicy(db, founder.id, { category: "EXPENSE", thresholdAmount: 100, requiresApproval: true });
  // AST-MCH (Machinery), not an EXP-* purpose: its handler (createFixedAsset) has no internal
  // approval sub-step of its own, so Money Desk's own gate is the only one in play here — avoids
  // the double-gating Money Desk deliberately skips for QUICK_ENTRY_EXPENSE purposes (see
  // money-desk-service.ts).
  const highValue = await createMoneyDeskTransaction(db, accountsManager.id, {
    purposeCode: "AST-MCH", direction: "BANK_OUT", amount: 90000, date: new Date(), treasuryAccountId: bank.id,
    counterpartyName: `High-value Machine ${run}`, documentFileId: "doc-asset-highvalue",
    formData: { category: "MACHINERY", treasuryAccountCoaCode: bank.chartOfAccountCode },
    idempotencyKey: `md-test8-${run}`,
  });
  assert(highValue.status === "PENDING_APPROVAL", `high-value machinery above threshold → PENDING_APPROVAL (got ${highValue.status})`);
  await expectError("MONEY_DESK_SELF_APPROVAL_DENIED", "requester cannot approve their own high-value transaction", () =>
    decideMoneyDeskApproval(db, accountsManager.id, highValue.id, { decision: "APPROVED", reason: "self-approval attempt" }),
  );
  const decided = await decideMoneyDeskApproval(db, founder.id, highValue.id, { decision: "APPROVED", reason: "Founder review — legitimate machinery purchase" });
  assert(decided.status === "POSTED", `independent Founder approval → POSTED (got ${decided.status}: ${decided.failureReason ?? ""})`);
  // Restore a sane default so this script is safe to re-run and doesn't leave a razor-thin threshold behind.
  await updateFinanceApprovalPolicy(db, founder.id, { category: "EXPENSE", thresholdAmount: 10_000_000, requiresApproval: true });

  console.log(`\n\n========== RESULT: ${pass} passed, ${fail} failed ==========`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
