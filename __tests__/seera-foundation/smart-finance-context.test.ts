import { describe, expect, it } from "vitest";
import { parseSmartFinance } from "@/lib/finance/smart-finance/parser";
import { buildOtherPartyProposal } from "@/lib/finance/smart-finance/other-party";
import { summariseTreasuryForDisplay, type TreasuryContextAccount } from "@/lib/finance/smart-finance/context";
import { resolveTreasuryFromContext } from "@/lib/finance/smart-finance/service";

const acct = (over: Partial<TreasuryContextAccount>): TreasuryContextAccount => ({
  id: over.id ?? "a1", name: over.name ?? "Acc", displayName: over.displayName ?? over.name ?? "Acc",
  kind: over.kind ?? "BANK", bankName: over.bankName ?? null, maskedAccountNumber: over.maskedAccountNumber ?? null,
  coaCode: "1000", isActive: over.isActive ?? true, balance: over.balance ?? 0, openingBalance: 0,
  lastEntryAt: null, recentEntries: [], selectable: over.isActive ?? true,
});

// SEERA SMART FINANCE — Business Context layer, deterministic pure-function tests (spec §13, the
// parts that need no DB). Master-resolution + confidence + posting are covered by the integration
// test.

const TODAY = new Date(2026, 7, 28);

describe("Smart Finance parser — advance to a person", () => {
  it("'Ramesh ko 3000 advance diya' → EXP-ADVANCE, person text captured, Money Out", () => {
    const p = parseSmartFinance("Ramesh ko 3000 advance diya", TODAY);
    expect(p.purposeCode).toBe("EXP-ADVANCE");
    expect(p.amount).toBe(3000);
    expect(p.direction).toBe("MONEY_OUT");
    expect(p.partyText?.toLowerCase()).toContain("ramesh");
  });
  it("'cash advance' and 'peshgi' both map to EXP-ADVANCE", () => {
    expect(parseSmartFinance("Manoj ko 2 hazar cash advance diya", TODAY).purposeCode).toBe("EXP-ADVANCE");
    expect(parseSmartFinance("teen hazar peshgi di labour ko", TODAY).purposeCode).toBe("EXP-ADVANCE");
  });
  it("advance is still distinct from reimbursement", () => {
    expect(parseSmartFinance("Manoj ko 1500 reimbursement diya", TODAY).purposeCode).toBe("EXP-REIMBURSEMENT");
  });
});

describe("Smart Finance — Other Party proposal", () => {
  it("suggests a title-cased name and the minimum identity fields, and never implies employee onboarding", () => {
    const proposal = buildOtherPartyProposal("ramesh kumar", "temporary labour advance");
    expect(proposal.suggestedName).toBe("Ramesh Kumar");
    expect(proposal.suggestedType).toBe("Other Person");
    expect(proposal.fields.map((f) => f.key).sort()).toEqual(["mobile", "name", "partyType", "purpose"]);
    expect(proposal.fields.find((f) => f.key === "name")!.required).toBe(true);
    expect(proposal.fields.find((f) => f.key === "mobile")!.required).toBe(false);
    expect(proposal.fields.find((f) => f.key === "purpose")!.value).toBe("temporary labour advance");
    expect(proposal.note.toLowerCase()).toContain("does not");
    expect(proposal.note.toLowerCase()).toContain("employee");
  });
});

describe("Smart Finance — treasury resolution (spec §13 A–D)", () => {
  const cash = acct({ id: "cash1", name: "Main Cash", displayName: "Main Cash", kind: "CASH" });
  const cash2 = acct({ id: "cash2", name: "Petty Cash", displayName: "Petty Cash", kind: "CASH" });
  const icici = acct({ id: "icici", name: "ICICI Bank", displayName: "ICICI Bank ****1234", kind: "BANK", bankName: "ICICI Bank", maskedAccountNumber: "****1234", balance: -8000 });
  const hdfc = acct({ id: "hdfc", name: "HDFC Bank", displayName: "HDFC Bank", kind: "BANK", bankName: "HDFC Bank" });

  it("A: exactly one active Cash account + 'cash' → auto-suggested", () => {
    const r = resolveTreasuryFromContext([cash, icici, hdfc], { kind: "CASH" });
    expect(r.treasury?.id).toBe("cash1");
    expect(r.assumed).toBe(false);
    expect(r.paymentMode).toBe("CASH");
    expect(r.explanation?.toLowerCase()).toContain("only active cash account");
  });
  it("B: multiple Cash accounts → NOTHING auto-selected, clarify prompt, both offered", () => {
    const r = resolveTreasuryFromContext([cash, cash2, icici], { kind: "CASH" });
    expect(r.treasury).toBeNull();
    expect(r.options.map((o) => o.id).sort()).toEqual(["cash1", "cash2"]);
    expect(r.explanation?.toLowerCase()).toContain("cash accounts");
  });
  it("C: exact bank keyword → the matching account resolves", () => {
    const r = resolveTreasuryFromContext([cash, icici, hdfc], { kind: "BANK", bankKeyword: "icici" });
    expect(r.treasury?.id).toBe("icici");
    expect(r.explanation).toMatch(/ICICI/i);
  });
  it("D: a bank keyword that matches no account → nothing auto-selected", () => {
    const r = resolveTreasuryFromContext([cash, icici, hdfc], { kind: "BANK", bankKeyword: "kotak" });
    expect(r.treasury).toBeNull();
    expect(r.explanation?.toLowerCase()).toMatch(/no treasury account matches|nothing was auto-selected/);
  });
  it("single bank, no name given → assumed (flagged), not silently final", () => {
    const r = resolveTreasuryFromContext([cash, icici], { kind: "BANK" });
    expect(r.treasury?.id).toBe("icici");
    expect(r.assumed).toBe(true);
    expect(r.explanation?.toLowerCase()).toContain("please confirm");
  });
  it("no treasury hint at all → no selection, all options returned", () => {
    const r = resolveTreasuryFromContext([cash, icici], null);
    expect(r.treasury).toBeNull();
    expect(r.options).toHaveLength(2);
  });
  it("inactive accounts are never offered or selected", () => {
    const r = resolveTreasuryFromContext([acct({ id: "old", kind: "CASH", isActive: false })], { kind: "CASH" });
    expect(r.treasury).toBeNull();
    expect(r.options).toHaveLength(0);
  });
});

describe("Smart Finance — treasury display summary", () => {
  it("shows name, kind, balance and last-entry date — real values only", () => {
    const s = summariseTreasuryForDisplay({ displayName: "HDFC Bank ****1234", kind: "BANK", balance: 45200, lastEntryAt: new Date("2026-08-27T10:00:00Z") });
    expect(s).toContain("HDFC Bank ****1234 (BANK)");
    expect(s).toContain("₹45,200");
    expect(s).toContain("2026-08-27");
  });
  it("omits last-entry when there is none (no fabricated activity)", () => {
    const s = summariseTreasuryForDisplay({ displayName: "Cash — Main Office", kind: "CASH", balance: 0, lastEntryAt: null });
    expect(s).toBe("Cash — Main Office (CASH) · bal ₹0");
  });
});
