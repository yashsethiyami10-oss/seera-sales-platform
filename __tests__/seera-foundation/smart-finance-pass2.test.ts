import { describe, expect, it } from "vitest";
import { parseSmartFinance } from "@/lib/finance/smart-finance/parser";
import { buildOtherPartyProposal, norm } from "@/lib/finance/smart-finance/other-party";

// SEERA SMART FINANCE — Business Understanding Pass 2 (Phases 1/3/5): deterministic pure-function
// tests. Master-resolution, the ledger and the actual journal postings are covered by the
// integration test.

const TODAY = new Date(2026, 7, 28);

describe("parser — advance settlement / recovery (Phase 3)", () => {
  it("'Ramesh se 1000 advance wapas mila' → RECOVERY, Money In, person isolated", () => {
    const p = parseSmartFinance("Ramesh se 1000 advance wapas mila cash se", TODAY);
    expect(p.advanceSettlement).toBe("RECOVERY");
    expect(p.direction).toBe("MONEY_IN");
    expect(p.amount).toBe(1000);
    expect(p.purposeCode).toBeNull(); // not a fresh advance
    expect(p.partyText?.toLowerCase()).toContain("ramesh");
  });
  it("'Ramesh ka 2000 advance settle hua' → SETTLE, Money Out", () => {
    const p = parseSmartFinance("Ramesh ka 2000 advance settle hua", TODAY);
    expect(p.advanceSettlement).toBe("SETTLE");
    expect(p.direction).toBe("MONEY_OUT");
    expect(p.amount).toBe(2000);
  });
  it("a fresh advance is NOT read as a settlement", () => {
    const p = parseSmartFinance("Ramesh ko 5000 advance cash se diya", TODAY);
    expect(p.advanceSettlement).toBeNull();
    expect(p.purposeCode).toBe("EXP-ADVANCE");
  });
});

describe("parser — goods / SKU (Phase 5)", () => {
  it("'Seera Cake ke 10 box ka payment Ramesh ko cash se kiya' → product + qty + unit + person", () => {
    const p = parseSmartFinance("Seera Cake ke 10 box ka payment Ramesh ko cash se kiya", TODAY);
    expect(p.quantity).toBe(10);
    expect(p.unitOfMeasure).toBe("box");
    expect(p.productText?.toLowerCase()).toContain("cake");
    expect(p.partyText?.toLowerCase()).toContain("ramesh");
    expect(p.treasuryHint?.kind).toBe("CASH");
  });
  it("'5 carton detergent powder bech diya' → qty 5, carton", () => {
    const p = parseSmartFinance("5 carton detergent powder bech diya", TODAY);
    expect(p.quantity).toBe(5);
    expect(p.unitOfMeasure).toBe("carton");
    expect(p.productText?.toLowerCase()).toContain("detergent");
  });
  it("no goods phrase → all null", () => {
    const p = parseSmartFinance("2000 diesel cash se diya", TODAY);
    expect(p.quantity).toBeNull();
    expect(p.productText).toBeNull();
  });
});

describe("parser — residual isolation does not leak a second category word into the name (regression)", () => {
  it("'travel reimbursement' both being real category keywords: partyText is just the name, not 'reimbursement ramesh'", () => {
    const p = parseSmartFinance("5000 travel reimbursement Ramesh ko diya", TODAY);
    expect(p.purposeCode).toBe("EXP-TRAVEL");
    expect(p.partyText).toBe("ramesh");
  });
  it("a bare name with no vendor/distributor/S.S. keyword still isolates cleanly on a non-person-purpose category", () => {
    const p = parseSmartFinance("2000 diesel Ramesh ko cash se diya", TODAY);
    expect(p.purposeCode).toBe("EXP-FUEL");
    expect(p.partyText).toBe("ramesh");
  });
});

describe("Other Party proposal + normalization (Phase 1)", () => {
  it("proposal is title-cased and never implies employee onboarding", () => {
    const pr = buildOtherPartyProposal("ramesh verma", "labour advance");
    expect(pr.suggestedName).toBe("Ramesh Verma");
    expect(pr.note.toLowerCase()).toContain("does not make them an employee");
  });
  it("norm collapses case/punctuation for duplicate matching", () => {
    expect(norm("Ramesh  Kumar.")).toBe("ramesh kumar");
    expect(norm("RAMESH-KUMAR")).toBe("ramesh kumar");
  });
});
