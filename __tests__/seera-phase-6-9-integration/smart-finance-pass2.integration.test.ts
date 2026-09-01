import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma, roleUsers, founderId, setup, expectCode } from "@/__tests__/seera-block3/test-context";
import { seedDefaultChartOfAccounts, seedQuickEntryCategoryMaster } from "@/lib/finance/chart-of-accounts";
import { seedDefaultFinanceApprovalPolicies, updateFinanceApprovalPolicy } from "@/lib/finance/approval-policy-service";
import { createTreasuryAccount } from "@/lib/finance/treasury-service";
import { createMoneyDeskTransaction } from "@/lib/finance/money-desk-service";
import { interpretSmartFinance } from "@/lib/finance/smart-finance/service";
import { treasuryContext } from "@/lib/finance/smart-finance/context";
import { confirmOtherParty, updateOtherParty, setOtherPartyActive, getOtherPartyIdentity, listOtherParties } from "@/lib/finance/smart-finance/other-party";
import { settleAdvance } from "@/lib/finance/smart-finance/advance-lifecycle";
import { partyLedgerStatement, ledgerPartyOptions } from "@/lib/finance/party-ledger-service";

// SEERA SMART FINANCE — Business Understanding Pass 2 (Phases 1–3) governed integration test.
// Real TEST database. Verifies the ACTUAL journal / ledger effect of every flow, not just HTTP 200.
const suffix = randomBytes(5).toString("hex");
let founder = "";
let cashId = "";
let cashCoa = "";

async function giveAdvance(dimId: string, name: string, amount: number, key: string) {
  const txn = await createMoneyDeskTransaction(prisma, founder, {
    purposeCode: "EXP-ADVANCE",
    direction: "CASH_OUT",
    amount,
    date: new Date("2026-08-10"),
    treasuryAccountId: cashId,
    counterpartyType: "OTHER_PARTY",
    counterpartyName: name,
    description: `advance ${suffix}`,
    formData: { paymentMode: "CASH", partyType: "OTHER_PARTY", partyId: dimId, treasuryAccountCoaCode: cashCoa, __smartFinance: { originalText: `advance to ${name}` } },
    idempotencyKey: key,
  });
  return txn;
}

describe("guarded Smart Finance Pass 2 — Other Party master, ledger, advance lifecycle", () => {
  beforeAll(async () => {
    await setup();
    founder = founderId;
    // COA / quick-entry categories are NOT truncated between runs — skip the (dozens of sequential
    // upserts) reseed on a warm DB. This keeps beforeAll well under the pooled-connection budget.
    if ((await prisma.seeraChartOfAccount.count()) < 30) await seedDefaultChartOfAccounts(prisma, founder);
    if ((await prisma.seeraExpenseCategory.count({ where: { code: "QE-STAFF-ADVANCE" } })) === 0) await seedQuickEntryCategoryMaster(prisma, founder);
    await seedDefaultFinanceApprovalPolicies(prisma, founder);
    await updateFinanceApprovalPolicy(prisma, founder, { category: "EXPENSE", thresholdAmount: 5_000_000, requiresApproval: true });
    await prisma.seeraTreasuryAccount.updateMany({ where: { isActive: true }, data: { isActive: false } });
    await prisma.seeraFinancialDimension.updateMany({ where: { kind: "OTHER_PARTY" }, data: { isActive: false } });
    cashId = (await createTreasuryAccount(prisma, founder, { kind: "CASH", code: `P2-CASH-${suffix}`, name: `P2 Cash ${suffix}` })).id;
    cashCoa = (await treasuryContext(prisma, founder)).accounts.find((a) => a.id === cashId)!.coaCode;
  }, 600000);
  afterAll(async () => { await prisma.$disconnect(); }, 600000);

  // ── Phase 1 — Other Party master ────────────────────────────────────────────────────────────
  it("Phase 1: confirmOtherParty stores identity (audit-backed), reads it back, dup-protects on name AND mobile", async () => {
    const name = `Bansi Lal ${suffix}`;
    const a = await confirmOtherParty(prisma, founder, { name, mobile: "98-1234-5670", partyType: "Labour / Contractor", notes: "site work" });
    expect(a.created).toBe(true);
    const id = a.dimension.id;

    const identity = await getOtherPartyIdentity(prisma, id);
    expect(identity.mobile).toBe("9812345670"); // normalized
    expect(identity.partyType).toBe("Labour / Contractor");
    expect(identity.notes).toBe("site work");

    const byName = await confirmOtherParty(prisma, founder, { name: name.toUpperCase() });
    expect(byName.created).toBe(false);
    expect(byName.dimension.id).toBe(id);
    expect(byName.matchedOn).toBe("name");

    const byMobile = await confirmOtherParty(prisma, founder, { name: `Someone Else ${suffix}`, mobile: "9812345670" });
    expect(byMobile.created).toBe(false);
    expect(byMobile.dimension.id).toBe(id);
    expect(byMobile.matchedOn).toBe("mobile");
  });

  it("Phase 1: updateOtherParty changes identity + writes an audit event; deactivation hides it", async () => {
    const { dimension } = await confirmOtherParty(prisma, founder, { name: `Chotu ${suffix}`, mobile: "9800000001" });
    await updateOtherParty(prisma, founder, dimension.id, { mobile: "9899999999", relationship: "neighbour shop", notes: "buys in bulk" });
    const after = await getOtherPartyIdentity(prisma, dimension.id);
    expect(after.mobile).toBe("9899999999");
    expect(after.relationship).toBe("neighbour shop");
    expect(await prisma.auditLog.count({ where: { entityId: dimension.id, action: "finance.other_party.updated" } })).toBe(1);

    await setOtherPartyActive(prisma, founder, dimension.id, false);
    const list = await listOtherParties(prisma, founder, {});
    expect(list.some((p) => p.id === dimension.id)).toBe(false);
    const listAll = await listOtherParties(prisma, founder, { includeInactive: true });
    expect(listAll.some((p) => p.id === dimension.id)).toBe(true);
    await setOtherPartyActive(prisma, founder, dimension.id, true); // restore for other tests
  });

  it("Phase 1: RBAC — a role without coa:manage cannot create or update an Other Party", async () => {
    const exec = roleUsers.get("SALES_EXECUTIVE");
    if (exec) {
      await expectCode(() => confirmOtherParty(prisma, exec.id, { name: `Hacker ${suffix}` }), "ACCESS_DENIED");
    }
  });

  // ── Phase 2 — Other Party ledger ────────────────────────────────────────────────────────────
  it("Phase 2: an advance posts a real Dr 1300 / Cr Cash and shows on the OTHER_PARTY Professional Ledger", async () => {
    const name = `Ledger Guy ${suffix}`;
    const { dimension } = await confirmOtherParty(prisma, founder, { name, mobile: "9700000001" });
    const txn = await giveAdvance(dimension.id, name, 5000, `p2-adv-${suffix}`);
    expect(txn.status).toBe("POSTED");

    const expense = await prisma.seeraExpense.findUniqueOrThrow({ where: { id: (txn.downstreamRefs as { expenseId: string }).expenseId } });
    expect(expense.entryType).toBe("ADVANCE");
    const cat = await prisma.seeraExpenseCategory.findUniqueOrThrow({ where: { id: expense.categoryId } });
    expect(cat.chartOfAccountId).toBe("1300"); // maps to account 1300 = ASSET, never an expense account
    const journalLines = await prisma.seeraJournalLine.findMany({ where: { journalId: expense.journalId! } });
    const dr1300 = journalLines.find((l) => l.accountId === "1300" && Number(l.debit) > 0);
    expect(Number(dr1300!.debit)).toBe(5000);

    const ledger = await partyLedgerStatement(prisma, founder, { partyType: "OTHER_PARTY", partyId: dimension.id });
    expect(ledger.party.type).toBe("OTHER_PARTY");
    expect(ledger.normalSide).toBe("DEBIT");
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]!.debit).toBe(5000);
    expect(ledger.totals.closingBalance).toBe(5000); // outstanding

    const options = await ledgerPartyOptions(prisma, founder, "OTHER_PARTY");
    expect(options.some((o) => o.id === dimension.id)).toBe(true);
  });

  // ── Phase 3 — advance lifecycle ─────────────────────────────────────────────────────────────
  it("Phase 3: RECOVERY_CASH posts Dr Cash / Cr 1300 (party-tagged); outstanding drops; ledger shows both rows", async () => {
    const name = `Recover Guy ${suffix}`;
    const { dimension } = await confirmOtherParty(prisma, founder, { name, mobile: "9700000002" });
    await giveAdvance(dimension.id, name, 7000, `p3-adv-${suffix}`);

    const res = await settleAdvance(prisma, founder, {
      dimensionId: dimension.id, amount: 2000, date: new Date("2026-08-20"), kind: "RECOVERY_CASH",
      treasuryAccountId: cashId, treasuryAccountCoaCode: cashCoa, reason: "cash returned", idempotencyKey: `p3-rec-${suffix}`,
    });
    expect(res.outstandingBefore).toBe(7000);
    expect(res.outstandingAfter).toBe(5000);

    const jl = await prisma.seeraJournalLine.findMany({ where: { journalId: (await prisma.seeraJournalEntry.findUniqueOrThrow({ where: { journalNumber: res.journalNumber } })).id } });
    const cr1300 = jl.find((l) => l.accountId === "1300");
    expect(Number(cr1300!.credit)).toBe(2000);
    expect(cr1300!.partyType).toBe("OTHER_PARTY");
    expect(cr1300!.partyId).toBe(dimension.id);
    expect(jl.some((l) => Number(l.debit) === 2000 && l.treasuryAccountId === cashId)).toBe(true);

    const ledger = await partyLedgerStatement(prisma, founder, { partyType: "OTHER_PARTY", partyId: dimension.id });
    expect(ledger.rows.map((r) => r.debit - r.credit)).toEqual([7000, -2000]);
    expect(ledger.totals.closingBalance).toBe(5000);

    // Idempotent — same key ⇒ same journal, outstanding unchanged.
    const again = await settleAdvance(prisma, founder, {
      dimensionId: dimension.id, amount: 2000, date: new Date("2026-08-20"), kind: "RECOVERY_CASH",
      treasuryAccountId: cashId, treasuryAccountCoaCode: cashCoa, reason: "cash returned", idempotencyKey: `p3-rec-${suffix}`,
    });
    expect(again.journalId).toBe(res.journalId);
    expect((await partyLedgerStatement(prisma, founder, { partyType: "OTHER_PARTY", partyId: dimension.id })).totals.closingBalance).toBe(5000);
  });

  it("Phase 3: SETTLE_TO_EXPENSE posts Dr 5230 / Cr 1300; over-settle and no-outstanding are refused", async () => {
    const name = `Settle Guy ${suffix}`;
    const { dimension } = await confirmOtherParty(prisma, founder, { name, mobile: "9700000003" });
    await giveAdvance(dimension.id, name, 3000, `p3-adv2-${suffix}`);

    await expectCode(
      () => settleAdvance(prisma, founder, { dimensionId: dimension.id, amount: 9999, date: new Date("2026-08-21"), kind: "SETTLE_TO_EXPENSE", expenseAccountCode: "5230", reason: "x", idempotencyKey: `p3-over-${suffix}` }),
      "SETTLEMENT_EXCEEDS_OUTSTANDING",
    );

    const res = await settleAdvance(prisma, founder, { dimensionId: dimension.id, amount: 3000, date: new Date("2026-08-21"), kind: "SETTLE_TO_EXPENSE", expenseAccountCode: "5230", reason: "bills submitted", idempotencyKey: `p3-set-${suffix}` });
    expect(res.outstandingAfter).toBe(0);
    const jl = await prisma.seeraJournalLine.findMany({ where: { journalId: (await prisma.seeraJournalEntry.findUniqueOrThrow({ where: { journalNumber: res.journalNumber } })).id } });
    expect(jl.some((l) => l.accountId === "5230" && Number(l.debit) === 3000)).toBe(true);
    expect(jl.some((l) => l.accountId === "1300" && Number(l.credit) === 3000 && l.partyId === dimension.id)).toBe(true);

    await expectCode(
      () => settleAdvance(prisma, founder, { dimensionId: dimension.id, amount: 100, date: new Date("2026-08-22"), kind: "SETTLE_TO_EXPENSE", expenseAccountCode: "5230", reason: "x", idempotencyKey: `p3-none-${suffix}` }),
      "NO_OUTSTANDING_ADVANCE",
    );
  });

  it("Phase 3: RBAC — a role without journal:post cannot settle an advance", async () => {
    const exec = roleUsers.get("SALES_EXECUTIVE");
    if (exec) {
      const { dimension } = await confirmOtherParty(prisma, founder, { name: `Rbac Guy ${suffix}`, mobile: "9700000009" });
      await expectCode(
        () => settleAdvance(prisma, exec.id, { dimensionId: dimension.id, amount: 100, date: new Date(), kind: "SETTLE_TO_EXPENSE", expenseAccountCode: "5230", reason: "x", idempotencyKey: `p3-rbac-${suffix}` }),
        "ACCESS_DENIED",
      );
    }
  });

  // ── Smart Finance NL → settlement (Phase 3 end-to-end) ──────────────────────────────────────
  it("Phase 3: 'X se N advance wapas mila' interprets to a settle-advance draft against the resolved Other Party", async () => {
    const name = `Kishanlal${suffix}`; // single distinctive token — not "... Guy ..." like the other fixtures
    const { dimension } = await confirmOtherParty(prisma, founder, { name, mobile: "9700000004" });
    await giveAdvance(dimension.id, name, 4000, `p3-adv3-${suffix}`);

    const draft = await interpretSmartFinance(prisma, founder, { text: `${name} se 1500 advance wapas mili cash se` });
    expect(draft.postAction).toBe("settle-advance");
    expect(draft.settlePayload).not.toBeNull();
    const sp = draft.settlePayload as Record<string, unknown>;
    expect(sp.kind).toBe("RECOVERY_CASH");
    expect(sp.dimensionId).toBe(dimension.id);
    expect(sp.amount).toBe(1500);
    expect(draft.missingRequired).not.toContain("amount-exceeds-outstanding");
    // interpretation posts nothing
    const before = await prisma.seeraJournalEntry.count();
    await interpretSmartFinance(prisma, founder, { text: `${name} se 500 advance wapas mili cash se` });
    expect(await prisma.seeraJournalEntry.count()).toBe(before);
  });
});
