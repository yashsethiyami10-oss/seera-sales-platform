import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createExpense, submitExpense } from "../../lib/finance/expense-service";
import { decideApproval } from "../../lib/foundation/approval-service";

// MASTER UX mission §10/31 — verifies the requestFinanceApproval fix: a Founder-created Expense
// must be auto-approved (never enter the generic SeeraApprovalItem PENDING queue at all), while a
// non-Founder's identical expense must still go through the normal approval gate. TEST DB only.
//
// UI Implementation & Visual Gap Closure update — also verifies decideApproval's own Founder
// bypass: production had 2 real PENDING FINANCE_EXPENSE items requested by the Founder BEFORE the
// requestFinanceApproval fix existed (created 2026-09-04), permanently stuck because decideApproval
// unconditionally denied self-approval regardless of role. Simulates that exact pre-existing state
// (a stale item, bypassing requestFinanceApproval since that path can no longer produce one) and
// confirms the Founder can now resolve it, while a non-Founder's stale self-request is still denied.

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
authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: prod, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });

let passed = 0, failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS — ${label}`); }
  else { failed++; console.log(`  FAIL — ${label}${detail ? ` (${detail})` : ""}`); }
}

async function main() {
  const founder = await db.user.findFirstOrThrow({ where: { roleAssignments: { some: { status: "ACTIVE", role: { code: "FOUNDER_SUPER_ADMIN" } } } } });
  const accountsUser = await db.user.findFirstOrThrow({ where: { roleAssignments: { some: { status: "ACTIVE", role: { code: "ACCOUNTS_MANAGER" } } } } });
  const category = await db.seeraExpenseCategory.findFirstOrThrow({ where: { isActive: true } });
  await db.seeraFinanceApprovalPolicy.upsert({ where: { category: "EXPENSE" }, update: { requiresApproval: true, thresholdAmount: 0 }, create: { category: "EXPENSE", requiresApproval: true, thresholdAmount: 0 } });

  console.log("\n=== Founder-created expense ===");
  const founderExpense = await createExpense(db, founder.id, { date: new Date(), amount: 500, payeeType: "OTHER", categoryId: category.id, paymentMode: "CASH", idempotencyKey: randomUUID() });
  const founderSubmitted = await submitExpense(db, founder.id, founderExpense.id);
  check("status is APPROVED immediately (not SUBMITTED)", founderSubmitted.status === "APPROVED", `status=${founderSubmitted.status}`);
  const founderApprovalItem = await db.seeraApprovalItem.findFirst({ where: { entityType: "SeeraExpense", entityId: founderExpense.id } });
  check("no SeeraApprovalItem was created at all", founderApprovalItem === null, founderApprovalItem ? `found id=${founderApprovalItem.id}` : undefined);

  console.log("\n=== Non-Founder (Accounts Manager) expense — unchanged behavior ===");
  const acctExpense = await createExpense(db, accountsUser.id, { date: new Date(), amount: 500, payeeType: "OTHER", categoryId: category.id, paymentMode: "CASH", idempotencyKey: randomUUID() });
  const acctSubmitted = await submitExpense(db, accountsUser.id, acctExpense.id);
  check("status is SUBMITTED (still requires approval)", acctSubmitted.status === "SUBMITTED", `status=${acctSubmitted.status}`);
  const acctApprovalItem = await db.seeraApprovalItem.findFirst({ where: { entityType: "SeeraExpense", entityId: acctExpense.id } });
  check("a PENDING SeeraApprovalItem WAS created", acctApprovalItem?.status === "PENDING", acctApprovalItem ? `status=${acctApprovalItem.status}` : "none found");

  console.log("\n=== Simulate a PRE-EXISTING stale Founder-requested item (production has 2, from before this fix) ===");
  const staleFounderExpense = await createExpense(db, founder.id, { date: new Date(), amount: 500, payeeType: "OTHER", categoryId: category.id, paymentMode: "CASH", idempotencyKey: randomUUID() });
  await db.seeraExpense.update({ where: { id: staleFounderExpense.id }, data: { status: "SUBMITTED" } });
  const staleItem = await db.seeraApprovalItem.create({
    data: { type: "FINANCE_EXPENSE", entityType: "SeeraExpense", entityId: staleFounderExpense.id, requestedById: founder.id, assignedRoleCode: "ACCOUNTS_MANAGER", status: "PENDING", request: { amount: 500, reason: "stale legacy fixture" } },
  });
  const decided = await decideApproval(db, founder.id, staleItem.id, { decision: "APPROVED", reason: "Founder resolving their own stale pre-fix item" });
  check("Founder can now decide their own stale pre-existing item (was a permanent dead end before)", decided.status === "APPROVED");

  console.log("\n=== A non-Founder's stale self-request is STILL correctly denied (guard not weakened for anyone else) ===");
  // Needs a real requester who ALSO holds approval:decide (so the fixture actually reaches the
  // self-approval check rather than failing earlier on plain authority) but is NOT system:super_admin.
  const salesManager = await db.user.findFirstOrThrow({ where: { roleAssignments: { some: { status: "ACTIVE", role: { code: "SALES_MANAGER" } } } } });
  // Direct fixture insert (not createExpense — SALES_MANAGER lacks expense:create; only decideApproval's
  // own authorization is under test here, so the expense row itself is just supporting data).
  const staleAcctExpense = await db.seeraExpense.create({
    data: { expenseNumber: `EXP-STALE-${randomUUID().slice(0, 10).toUpperCase()}`, date: new Date(), amount: 500, payeeType: "OTHER", categoryId: category.id, paymentMode: "CASH", status: "SUBMITTED", requestedById: salesManager.id, idempotencyKey: randomUUID() },
  });
  const staleAcctItem = await db.seeraApprovalItem.create({
    data: { type: "FINANCE_EXPENSE", entityType: "SeeraExpense", entityId: staleAcctExpense.id, requestedById: salesManager.id, assignedRoleCode: "SALES_MANAGER", status: "PENDING", request: { amount: 500, reason: "stale legacy fixture" } },
  });
  await decideApproval(db, salesManager.id, staleAcctItem.id, { decision: "APPROVED", reason: "attempting self-approval" }).then(
    () => check("non-Founder self-approval should have been denied (unexpected success)", false),
    (e) => {
      const code = e instanceof Error && "code" in e ? (e as { code: unknown }).code : undefined;
      console.log(`  [debug] actual error: ${e instanceof Error ? e.message : e}, code=${code}`);
      check("non-Founder self-approval still correctly denied — SELF_APPROVAL_DENIED", code === "SELF_APPROVAL_DENIED");
    },
  );

  console.log(`\n=== ${failed === 0 ? "ALL PASSED" : "SOME FAILED"} (${passed} passed, ${failed} failed) ===`);

  console.log("\n=== Cleanup ===");
  await db.seeraApprovalItem.deleteMany({ where: { entityId: { in: [founderExpense.id, acctExpense.id, staleFounderExpense.id, staleAcctExpense.id] } } });
  await db.seeraExpense.deleteMany({ where: { id: { in: [founderExpense.id, acctExpense.id, staleFounderExpense.id, staleAcctExpense.id] } } });
  console.log("Cleanup complete.");
  process.exitCode = failed === 0 ? 0 : 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
