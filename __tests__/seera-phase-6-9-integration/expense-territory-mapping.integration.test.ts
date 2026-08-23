import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { seedDefaultChartOfAccounts } from "@/lib/finance/chart-of-accounts";
import { createTreasuryAccount } from "@/lib/finance/treasury-service";
import { assignExecutiveTerritory } from "@/lib/sales-distribution/operational-service";
import { quickEntryCreate } from "@/lib/finance/quick-entry-service";
import { expenseByTerritory } from "@/lib/finance/reports-service";

// Money Desk maturity pass (23-Aug): territoryId didn't exist on SeeraExpense at all before this
// pass — every expense was either untagged or, at best, tagged against the unrelated generic
// "dimension" (department) slot. This exercises the real gap the Founder's spec named directly:
// auto-derive Territory from the entry's Employee when the operator doesn't pick one, let an
// explicit choice override that, and leave a Territory-less entry as a real "Corporate" bucket
// rather than guessing.
const suffix = randomBytes(5).toString("hex");
let founder = "", executive = "", jhansiId = "", bhilwaraId = "", treasuryId = "", categoryId = "";

describe("guarded Expense Territory mapping — auto-derivation, override, Corporate bucket", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    executive = roleUsers.get("SALES_EXECUTIVE")!.id;
    await seedDefaultChartOfAccounts(prisma, founder);
    const treasury = await createTreasuryAccount(prisma, founder, { kind: "CASH", code: `TERR-CASH-${suffix}`, name: `Territory Test Cash ${suffix}` });
    treasuryId = treasury.id;
    const category = await prisma.seeraExpenseCategory.findFirstOrThrow({ where: { isActive: true } });
    categoryId = category.id;
    const jhansi = await prisma.seeraGeographyNode.create({ data: { code: `TERR-JHS-${suffix}`, name: `Jhansi UAT ${suffix}`, level: "TERRITORY", status: "ACTIVE" } });
    const bhilwara = await prisma.seeraGeographyNode.create({ data: { code: `TERR-BHL-${suffix}`, name: `Bhilwara UAT ${suffix}`, level: "TERRITORY", status: "ACTIVE" } });
    jhansiId = jhansi.id;
    bhilwaraId = bhilwara.id;
    await assignExecutiveTerritory(prisma, founder, { userId: executive, territoryId: jhansiId, reason: "UAT territory expense mapping test" });
  }, 240000);
  afterAll(async () => {
    await prisma.$disconnect();
  }, 240000);

  it("auto-derives the Territory from the Employee's own governed assignment when none is chosen", async () => {
    const result = await quickEntryCreate(prisma, founder, {
      entryType: "EXPENSE",
      date: new Date(),
      amount: 500,
      categoryId,
      paymentMode: "CASH",
      treasuryAccountId: treasuryId,
      employeeId: executive,
      remark: "Diesel — auto-derive test",
      idempotencyKey: `qe-auto-${suffix}`,
    });
    expect(result.expense.territoryId).toBe(jhansiId);
  });

  it("lets an explicit Territory override the Employee's own assignment", async () => {
    const result = await quickEntryCreate(prisma, founder, {
      entryType: "EXPENSE",
      date: new Date(),
      amount: 700,
      categoryId,
      paymentMode: "CASH",
      treasuryAccountId: treasuryId,
      employeeId: executive,
      territoryId: bhilwaraId,
      remark: "Diesel — governed override test",
      idempotencyKey: `qe-override-${suffix}`,
    });
    expect(result.expense.territoryId).toBe(bhilwaraId);
  });

  it("leaves a Territory-less entry as Corporate — no employee, no explicit Territory", async () => {
    const result = await quickEntryCreate(prisma, founder, {
      entryType: "EXPENSE",
      date: new Date(),
      amount: 300,
      categoryId,
      paymentMode: "CASH",
      treasuryAccountId: treasuryId,
      remark: "Pan-India campaign — corporate test",
      idempotencyKey: `qe-corporate-${suffix}`,
    });
    expect(result.expense.territoryId).toBeNull();
  });

  it("Territory Expense Summary groups POSTED expenses correctly, including a real Corporate bucket", async () => {
    const from = new Date(new Date().getFullYear(), 0, 1);
    const to = new Date(new Date().getFullYear() + 1, 0, 1);
    const rows = await expenseByTerritory(prisma, founder, { from, to });
    const jhansiRow = rows.find((r) => r.territoryId === jhansiId);
    const bhilwaraRow = rows.find((r) => r.territoryId === bhilwaraId);
    const corporateRow = rows.find((r) => r.territoryId === null);
    expect(jhansiRow?.total).toBe(500);
    expect(bhilwaraRow?.total).toBe(700);
    expect(corporateRow?.total).toBeGreaterThanOrEqual(300);
  });
});
