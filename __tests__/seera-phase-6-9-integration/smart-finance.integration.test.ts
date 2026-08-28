import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma, roleUsers, founderId, setup, expectCode } from "@/__tests__/seera-block3/test-context";
import { seedDefaultChartOfAccounts, seedQuickEntryCategoryMaster } from "@/lib/finance/chart-of-accounts";
import { seedDefaultFinanceApprovalPolicies, updateFinanceApprovalPolicy } from "@/lib/finance/approval-policy-service";
import { createTreasuryAccount } from "@/lib/finance/treasury-service";
import { createMoneyDeskTransaction, decideMoneyDeskApproval, moneyDeskTransactionDetail } from "@/lib/finance/money-desk-service";
import { interpretSmartFinance } from "@/lib/finance/smart-finance/service";

// SEERA SMART FINANCE — governed integration test (spec §28/§32). Proves the natural-language
// entry reaches the SAME governed Money Desk posting path as the guided form: real RBAC, real
// approval policy, real maker-checker, real idempotency, real ledger effect, and the Smart Finance
// provenance surfaced on Transaction Detail. Runs against the real TEST database.
const suffix = randomBytes(5).toString("hex");
let founder = "";
let hdfcId = "";

async function postDraftAsMoneyDesk(actorId: string, text: string, idempotencyKey: string) {
  const draft = await interpretSmartFinance(prisma, actorId, { text });
  expect(draft.createPayload).not.toBeNull();
  expect(draft.postAction).toBe("money-desk-create");
  const p = draft.createPayload as Record<string, unknown>;
  const formData = (p.formData ?? {}) as Record<string, unknown>;
  return {
    draft,
    result: await createMoneyDeskTransaction(prisma, actorId, {
      purposeCode: p.purposeCode as string,
      direction: p.direction as never,
      amount: p.amount as number,
      date: new Date(p.date as string),
      treasuryAccountId: p.treasuryAccountId as string | undefined,
      counterpartyType: p.counterpartyType as string | undefined,
      counterpartyName: p.counterpartyName as string | undefined,
      description: p.description as string | undefined,
      formData: { ...formData, __smartFinance: { originalText: text, confidence: draft.confidence, parsed: draft.parsed } },
      idempotencyKey,
    }),
  };
}

describe("guarded Smart Finance — governed NL entry through the existing Money Desk", () => {
  beforeAll(async () => {
    await setup();
    founder = founderId;
    await seedDefaultChartOfAccounts(prisma, founder);
    await seedQuickEntryCategoryMaster(prisma, founder);
    await seedDefaultFinanceApprovalPolicies(prisma, founder);
    // Raise the EXPENSE approval floor for this suite so a routine 8k advertisement auto-clears to
    // POSTED (the maker-checker path is exercised separately below via the PAYMENT policy).
    await updateFinanceApprovalPolicy(prisma, founder, { category: "EXPENSE", thresholdAmount: 5_000_000, requiresApproval: true });
    const hdfc = await createTreasuryAccount(prisma, founder, { kind: "BANK", code: `SF-HDFC-${suffix}`, name: `HDFC Bank ${suffix}` });
    hdfcId = hdfc.id;
    await createTreasuryAccount(prisma, founder, { kind: "CASH", code: `SF-CASH-${suffix}`, name: `Cash Box ${suffix}` });
  }, 600000);
  afterAll(async () => { await prisma.$disconnect(); }, 600000);

  it("interprets a Hinglish expense sentence into a structured, master-resolved draft (no posting)", async () => {
    const draft = await interpretSmartFinance(prisma, founder, { text: "Advertisement ke 8000 rupees HDFC bank se pay kiye" });
    expect(draft.direction).toBe("MONEY_OUT");
    expect(draft.purposeCode).toBe("EXP-ADVERTISEMENT");
    expect(draft.amount).toBe(8000);
    expect(draft.paymentMode).toBe("BANK");
    expect(draft.treasury?.id).toBe(hdfcId); // resolved against the real treasury master by name
    expect(draft.understood).toBe(true);
    expect(draft.confidence).toBe("HIGH");
    // No SeeraMoneyDeskTransaction created by interpretation alone.
    expect(await prisma.seeraMoneyDeskTransaction.count({ where: { description: { contains: "Advertisement ke 8000" } } })).toBe(0);
  });

  it("posts through createMoneyDeskTransaction exactly once and updates the real expense ledger", async () => {
    const key = `sf-adv-${suffix}`;
    const { result } = await postDraftAsMoneyDesk(founder, "Advertisement ke 8000 rupees HDFC bank se pay kiye", key);
    expect(result.status).toBe("POSTED");

    const refs = (result.downstreamRefs ?? {}) as { expenseId?: string; journalId?: string };
    expect(refs.expenseId).toBeTruthy();
    expect(refs.journalId).toBeTruthy();
    const expense = await prisma.seeraExpense.findUniqueOrThrow({ where: { id: refs.expenseId! } });
    expect(Number(expense.amount)).toBe(8000);
    expect(expense.status).toBe("POSTED");

    // IDEMPOTENT: same key ⇒ same transaction, no second expense / journal.
    const retry = await createMoneyDeskTransaction(prisma, founder, {
      purposeCode: "EXP-ADVERTISEMENT", direction: "BANK_OUT", amount: 8000, date: new Date(),
      treasuryAccountId: hdfcId, description: "Advertisement ke 8000 rupees HDFC bank se pay kiye",
      formData: { paymentMode: "BANK", __smartFinance: { originalText: "x" } }, idempotencyKey: key,
    });
    expect(retry.id).toBe(result.id);
    expect(await prisma.seeraExpense.count({ where: { description: { contains: "Advertisement" }, amount: 8000 } })).toBe(1);
  });

  it("Transaction Detail exposes the Smart Finance source + the exact original instruction", async () => {
    const key = `sf-detail-${suffix}`;
    const text = "Jhansi mein 4500 freight diya cash se";
    const { result } = await postDraftAsMoneyDesk(founder, text, key);
    const detail = await moneyDeskTransactionDetail(prisma, founder, result.id);
    expect(detail.source).toBe("SMART_FINANCE");
    expect(detail.smartFinance?.originalInstruction).toBe(text);
    expect(detail.smartFinance?.confidence).toBeTruthy();
  });

  it("normalises spoken Hindi money words ('das hazar') against the real amount", async () => {
    const draft = await interpretSmartFinance(prisma, founder, { text: "das hazar rupees marketing HDFC bank se diye" });
    expect(draft.amount).toBe(10000);
    expect(draft.purposeCode).toBe("EXP-MKT");
  });

  it("honours maker-checker — the creator of a Smart Finance entry cannot self-approve it", async () => {
    // Make institutional receipts (PAYMENT category) approval-gated so the entry lands PENDING.
    await updateFinanceApprovalPolicy(prisma, founder, { category: "PAYMENT", thresholdAmount: 0, requiresApproval: true });
    const draft = await interpretSmartFinance(prisma, founder, { text: "Aaj Mahalaxmi Traders se 12000 rs payment aaya HDFC bank me" });
    const p = draft.createPayload as Record<string, unknown>;
    const txn = await createMoneyDeskTransaction(prisma, founder, {
      purposeCode: p.purposeCode as string, direction: p.direction as never, amount: p.amount as number,
      date: new Date(p.date as string), treasuryAccountId: p.treasuryAccountId as string | undefined,
      counterpartyType: p.counterpartyType as string | undefined, counterpartyName: p.counterpartyName as string | undefined,
      description: p.description as string | undefined,
      formData: { ...(p.formData as Record<string, unknown>), __smartFinance: { originalText: draft.originalText } },
      idempotencyKey: `sf-mc-${suffix}`,
    });
    expect(txn.status).toBe("PENDING_APPROVAL");
    await expectCode(() => decideMoneyDeskApproval(prisma, founder, txn.id, { decision: "APPROVED", reason: "self" }), "MONEY_DESK_SELF_APPROVAL_DENIED");
    await updateFinanceApprovalPolicy(prisma, founder, { category: "PAYMENT", thresholdAmount: 0, requiresApproval: false });
  });

  it("enforces permissions server-side — a role without money_desk:create cannot even interpret", async () => {
    const salesExec = roleUsers.get("SALES_EXECUTIVE");
    if (salesExec) {
      await expectCode(() => interpretSmartFinance(prisma, salesExec.id, { text: "2000 diesel ke diye" }), "ACCESS_DENIED");
    }
  });
});
