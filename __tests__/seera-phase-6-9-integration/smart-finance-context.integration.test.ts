import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma, founderId, setup, expectCode } from "@/__tests__/seera-block3/test-context";
import { seedDefaultChartOfAccounts, seedQuickEntryCategoryMaster } from "@/lib/finance/chart-of-accounts";
import { seedDefaultFinanceApprovalPolicies, updateFinanceApprovalPolicy } from "@/lib/finance/approval-policy-service";
import { createTreasuryAccount } from "@/lib/finance/treasury-service";
import { createVendor } from "@/lib/finance/vendor-service";
import { createMoneyDeskTransaction, moneyDeskTransactionDetail } from "@/lib/finance/money-desk-service";
import { interpretSmartFinance } from "@/lib/finance/smart-finance/service";
import { treasuryContext } from "@/lib/finance/smart-finance/context";
import { confirmOtherParty } from "@/lib/finance/smart-finance/other-party";

// SEERA SMART FINANCE — BUSINESS CONTEXT / ENTITY RESOLUTION integration test (spec §13). Runs
// against the real TEST database. Proves: treasury auto-suggest vs. clarify vs. exact-match vs.
// never-silent-select; employee vs. Other-Party vs. unknown resolution + the OTHER fallback + its
// future re-resolution; real (never fabricated) balances; no silent posting; idempotency;
// provenance.
const suffix = randomBytes(5).toString("hex");
let founder = "";
let iciciId = "";
let hdfcId = "";
let mainCashId = "";

async function post(actorId: string, text: string, key: string) {
  const draft = await interpretSmartFinance(prisma, actorId, { text });
  expect(draft.createPayload).not.toBeNull();
  const p = draft.createPayload as Record<string, unknown>;
  const result = await createMoneyDeskTransaction(prisma, actorId, {
    purposeCode: p.purposeCode as string,
    direction: p.direction as never,
    amount: p.amount as number,
    date: new Date(p.date as string),
    treasuryAccountId: p.treasuryAccountId as string | undefined,
    counterpartyType: p.counterpartyType as string | undefined,
    counterpartyName: p.counterpartyName as string | undefined,
    description: p.description as string | undefined,
    formData: { ...((p.formData ?? {}) as Record<string, unknown>), __smartFinance: { originalText: text, confidence: draft.confidence, parsed: draft.parsed } },
    idempotencyKey: key,
  });
  return { draft, result };
}

describe("guarded Smart Finance — Business Context & Entity Resolution", () => {
  beforeAll(async () => {
    await setup();
    founder = founderId;
    await seedDefaultChartOfAccounts(prisma, founder);
    await seedQuickEntryCategoryMaster(prisma, founder);
    await seedDefaultFinanceApprovalPolicies(prisma, founder);
    await updateFinanceApprovalPolicy(prisma, founder, { category: "EXPENSE", thresholdAmount: 5_000_000, requiresApproval: true });
    // The shared TEST database's seera_treasury_accounts table is NOT truncated between runs, so it
    // accumulates abandoned fixtures from every prior integration suite. Name-based treasury
    // resolution ("ICICI se") is only deterministic against a known slate — deactivate every
    // currently-active account first, then create exactly the three this suite reasons about.
    await prisma.seeraTreasuryAccount.updateMany({ where: { isActive: true }, data: { isActive: false } });
    // Same for the Other-Party fixtures left by earlier runs of this suite (resolveOtherParty only
    // considers isActive rows, so hiding them restores a clean "unknown person" baseline).
    await prisma.seeraFinancialDimension.updateMany({ where: { kind: "OTHER_PARTY" }, data: { isActive: false } });
    iciciId = (await createTreasuryAccount(prisma, founder, { kind: "BANK", code: `CTX-ICICI-${suffix}`, name: `ICICI Bank ${suffix}`, bankName: "ICICI Bank", maskedAccountNumber: "50100123451234" })).id;
    hdfcId = (await createTreasuryAccount(prisma, founder, { kind: "BANK", code: `CTX-HDFC-${suffix}`, name: `HDFC Bank ${suffix}`, bankName: "HDFC Bank" })).id;
    mainCashId = (await createTreasuryAccount(prisma, founder, { kind: "CASH", code: `CTX-CASH-${suffix}`, name: `Main Cash ${suffix}` })).id;
  }, 600000);
  afterAll(async () => { await prisma.$disconnect(); }, 600000);

  it("L: treasuryContext reports a REAL, never-fabricated balance — a freshly created account is exactly its opening balance (0)", async () => {
    const ctx = await treasuryContext(prisma, founder);
    const icici = ctx.accounts.find((a) => a.id === iciciId)!;
    expect(icici.balance).toBe(0);
    expect(icici.openingBalance).toBe(0);
    expect(icici.recentEntries).toHaveLength(0);
    expect(icici.lastEntryAt).toBeNull();
    expect(icici.maskedAccountNumber).toBe("****1234");
    expect(icici.kind).toBe("BANK");
    expect(ctx.emptyState).toBeNull();
    expect(ctx.activeCount).toBe(3);
    expect(ctx.bankCount).toBe(2);
    expect(ctx.cashCount).toBe(1);
  });

  it("A: exactly one active Cash account → 'cash se' auto-suggests it", async () => {
    const d = await interpretSmartFinance(prisma, founder, { text: "500 chai cash se diya" });
    expect(d.treasury?.id).toBe(mainCashId);
    expect(d.paymentMode).toBe("CASH");
    expect(d.explanations.treasury?.toLowerCase()).toContain("cash account");
  });

  it("B: after a second Cash account exists → 'cash se' NEVER auto-selects; it asks, and shows real balances", async () => {
    const petty = await createTreasuryAccount(prisma, founder, { kind: "CASH", code: `CTX-PETTY-${suffix}`, name: `Petty Cash ${suffix}` });
    const d = await interpretSmartFinance(prisma, founder, { text: "500 chai cash se diya" });
    expect(d.treasury).toBeNull();
    expect(d.missingRequired).toContain("treasury");
    expect(d.explanations.treasury?.toLowerCase()).toContain("cash accounts");
    const ids = d.treasuryOptions.map((o) => o.id);
    expect(ids).toContain(mainCashId);
    expect(ids).toContain(petty.id);
    expect(d.treasuryOptions.every((o) => typeof o.balance === "number")).toBe(true);
  });

  it("C: exact bank name in the sentence → resolves that treasury account uniquely", async () => {
    const d = await interpretSmartFinance(prisma, founder, { text: "5000 freight ICICI se diya" });
    expect(d.treasury?.id).toBe(iciciId);
    expect(d.explanations.treasury).toMatch(/ICICI/i);
  });

  it("D: a bank named in the sentence that does not exist → NOTHING is auto-selected", async () => {
    const d = await interpretSmartFinance(prisma, founder, { text: "5000 freight Kotak se diya" });
    expect(d.treasury).toBeNull();
    expect(d.missingRequired).toContain("treasury");
    expect(d.explanations.treasury?.toLowerCase()).toMatch(/no treasury account matches|nothing was auto-selected/);
  });

  it("B: with multiple active Cash accounts present, 'cash se' NEVER auto-selects one — it asks", async () => {
    const d = await interpretSmartFinance(prisma, founder, { text: "500 chai cash se diya" });
    expect(d.treasury).toBeNull();
    expect(d.missingRequired).toContain("treasury");
    expect(d.explanations.treasury?.toLowerCase()).toContain("cash accounts");
    expect(d.treasuryOptions.some((o) => o.id === mainCashId)).toBe(true);
    expect(d.treasuryOptions.every((o) => typeof o.balance === "number")).toBe(true);
  });

  it("E: a known employee is resolved from the directory", async () => {
    const d = await interpretSmartFinance(prisma, founder, { text: "Test Founder ko 3000 salary di ICICI se" });
    expect(d.personResolution?.role).toBe("EMPLOYEE");
    expect(d.personResolution?.status).toBe("MATCHED");
    expect(d.employee?.id).toBe(founder);
    expect(d.missingRequired).not.toContain("employee");
  });

  const RK = `Ramesh Kumar ${suffix}`;
  const RS = `Ramesh Singh ${suffix}`;

  it("F: an unknown person → UNMATCHED with a governed Other-Party proposal, and no employee is invented", async () => {
    const d = await interpretSmartFinance(prisma, founder, { text: `${RK} ko 3000 advance diya ICICI se` });
    expect(d.purposeCode).toBe("EXP-ADVANCE");
    expect(d.personResolution?.role).toBe("UNRESOLVED");
    expect(d.personResolution?.status).toBe("UNMATCHED");
    expect(d.personResolution?.proposal?.suggestedName).toContain("Ramesh Kumar");
    expect(d.missingRequired).toContain("person");
    expect(d.createPayload).not.toBeNull(); // understood, but person still needs confirming client-side
    expect(await prisma.user.count({ where: { name: RK } })).toBe(0);
  });

  it("G: after confirmOtherParty, the same name resolves automatically on the next sentence + carries prior activity", async () => {
    // suffix is a hex string (randomBytes(5).toString("hex")) — it can contain letters a-f, which
    // confirmOtherParty's digit-only mobile validation correctly strips, sometimes leaving fewer
    // than 7 digits and throwing OTHER_PARTY_MOBILE_INVALID. Use only the digit characters of
    // suffix, padded, so this fixture is deterministic instead of failing on unlucky random seeds.
    const mobileDigits = (suffix.match(/\d/g) ?? []).join("").padEnd(8, "0").slice(0, 8);
    const { dimension, created } = await confirmOtherParty(prisma, founder, { name: RK, mobile: `98${mobileDigits}`, partyType: "Labour / Contractor", purpose: "site labour advances" });
    expect(created).toBe(true);

    const first = await post(founder, `${RK} ko 3000 advance diya ICICI se`, `ctx-ramesh-1-${suffix}`);
    expect((first.result.downstreamRefs as { expenseId?: string }).expenseId).toBeTruthy();
    const exp = await prisma.seeraExpense.findUniqueOrThrow({ where: { id: (first.result.downstreamRefs as { expenseId: string }).expenseId } });
    expect(exp.payeeType).toBe("OTHER_PARTY");
    expect(exp.payeeId).toBe(dimension.id);
    expect(exp.entryType).toBe("ADVANCE");

    const d2 = await interpretSmartFinance(prisma, founder, { text: `Ramesh ${suffix} ko 2000 aur advance diya ICICI se` });
    expect(d2.personResolution?.role).toBe("OTHER_PARTY");
    expect(d2.personResolution?.status).toBe("MATCHED");
    expect(d2.personResolution?.otherParty?.id).toBe(dimension.id);
    expect(d2.personResolution?.priorActivity?.count).toBe(1);
    expect(d2.personResolution?.priorActivity?.netPaid).toBe(3000);
    expect(d2.missingRequired).not.toContain("person");

    // N: idempotent — re-posting the first entry with its key does not create a second expense.
    const retry = await createMoneyDeskTransaction(prisma, founder, {
      purposeCode: "EXP-ADVANCE", direction: "BANK_OUT", amount: 3000, date: new Date(), treasuryAccountId: iciciId,
      counterpartyName: RK, counterpartyType: "OTHER_PARTY",
      formData: { paymentMode: "BANK", partyType: "OTHER_PARTY", partyId: dimension.id, __smartFinance: { originalText: "x" } },
      idempotencyKey: `ctx-ramesh-1-${suffix}`,
    });
    expect(retry.id).toBe(first.result.id);
    expect(await prisma.seeraExpense.count({ where: { payeeId: dimension.id } })).toBe(1);
  });

  it("H: two Other-Party records that both match the spoken name → AMBIGUOUS, never a guess", async () => {
    await confirmOtherParty(prisma, founder, { name: RS });
    const d = await interpretSmartFinance(prisma, founder, { text: `Ramesh ${suffix} ko 1000 advance diya ICICI se` });
    expect(d.personResolution?.status).toBe("AMBIGUOUS");
    expect((d.personResolution?.candidates ?? []).length).toBeGreaterThanOrEqual(2);
    expect(d.missingRequired).toContain("person");
  });

  it("I: a known vendor is resolved when the sentence names one", async () => {
    await createVendor(prisma, founder, { code: `CTX-VEN-${suffix}`, legalName: `Sharma Traders ${suffix}`, tradeName: `Sharma Traders ${suffix}` });
    const d = await interpretSmartFinance(prisma, founder, { text: `5000 freight Sharma Traders ${suffix} vendor ko diya ICICI se` });
    expect(d.party?.type).toBe("VENDOR");
    expect(d.party?.name).toContain("Sharma Traders");
  });

  it("J: a known distributor is resolved and routes to the governed receipt path", async () => {
    const dist = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `CTX-D-${suffix}`, legalName: `Bhilwara Distributors ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000031" }, addresses: {}, territoryIds: [], createdById: founder } });
    const d = await interpretSmartFinance(prisma, founder, { text: `Bhilwara Distributors ${suffix} se 10000 payment aaya` });
    expect(d.direction).toBe("MONEY_IN");
    expect(d.party?.type).toBe("DISTRIBUTOR");
    expect(d.party?.id).toBe(dist.id);
    expect(d.postAction).toBe("guided-receipt");
  });

  it("M: interpretation NEVER posts — zero SeeraMoneyDeskTransaction rows created by interpret alone", async () => {
    const before = await prisma.seeraMoneyDeskTransaction.count();
    await interpretSmartFinance(prisma, founder, { text: "9999 diesel ICICI se diya for a UAT probe" });
    await interpretSmartFinance(prisma, founder, { text: "Somebody Unknown ko 4444 advance diya" });
    expect(await prisma.seeraMoneyDeskTransaction.count()).toBe(before);
  });

  it("O: provenance is preserved on a context-resolved posting", async () => {
    const text = "1200 bijli ka bill ICICI se pay kiya smart-context UAT";
    const { result } = await post(founder, text, `ctx-prov-${suffix}`);
    const detail = await moneyDeskTransactionDetail(prisma, founder, result.id);
    expect(detail.source).toBe("SMART_FINANCE");
    expect(detail.smartFinance?.originalInstruction).toBe(text);
  });

  it("balance reflects real postings — ICICI shows the net of everything posted through it", async () => {
    const ctx = await treasuryContext(prisma, founder);
    const icici = ctx.accounts.find((a) => a.id === iciciId)!;
    const lines = await prisma.seeraJournalLine.groupBy({ by: ["treasuryAccountId"], where: { treasuryAccountId: iciciId, journal: { status: "POSTED" } }, _sum: { debit: true, credit: true } });
    const expected = Number(lines[0]?._sum.debit ?? 0) - Number(lines[0]?._sum.credit ?? 0);
    expect(icici.balance).toBe(expected);
    expect(icici.balance).toBeLessThan(0); // money has only gone OUT through ICICI in this suite
  });

  it("security: a role without money_desk:create cannot interpret or read treasury context", async () => {
    const { roleUsers } = await import("@/__tests__/seera-block3/test-context");
    const exec = roleUsers.get("SALES_EXECUTIVE");
    if (exec) {
      await expectCode(() => interpretSmartFinance(prisma, exec.id, { text: "500 diesel cash se diya" }), "ACCESS_DENIED");
      await expectCode(() => treasuryContext(prisma, exec.id), "ACCESS_DENIED");
    }
  });
});
