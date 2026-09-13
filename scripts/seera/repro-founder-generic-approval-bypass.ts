import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createExpense, submitExpense } from "../../lib/finance/expense-service";

// MASTER UX mission §10/31 — verifies the requestFinanceApproval fix: a Founder-created Expense
// must be auto-approved (never enter the generic SeeraApprovalItem PENDING queue at all), while a
// non-Founder's identical expense must still go through the normal approval gate. TEST DB only.

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

  console.log(`\n=== ${failed === 0 ? "ALL PASSED" : "SOME FAILED"} (${passed} passed, ${failed} failed) ===`);

  console.log("\n=== Cleanup ===");
  await db.seeraApprovalItem.deleteMany({ where: { entityId: { in: [founderExpense.id, acctExpense.id] } } });
  await db.seeraExpense.deleteMany({ where: { id: { in: [founderExpense.id, acctExpense.id] } } });
  console.log("Cleanup complete.");
  process.exitCode = failed === 0 ? 0 : 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
