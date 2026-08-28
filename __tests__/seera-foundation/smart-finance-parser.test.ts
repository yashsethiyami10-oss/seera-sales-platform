import { describe, expect, it } from "vitest";
import { parseSmartFinance } from "@/lib/finance/smart-finance/parser";

// SEERA SMART FINANCE — deterministic parser unit tests (spec §28). Pure function, no DB. Proves
// the natural-language → structured-hint step for the Hindi / Hinglish / English phrasings the
// Founder actually dictates. Resolution against real master data + confidence + posting are
// covered by the integration test.

const TODAY = new Date(2026, 7, 27); // 2026-08-27 (month is 0-indexed)

describe("Smart Finance parser — amount", () => {
  it("plain digits", () => expect(parseSmartFinance("2000 diesel", TODAY).amount).toBe(2000));
  it("₹ + rs suffix", () => expect(parseSmartFinance("₹2000 diesel ke diye", TODAY).amount).toBe(2000));
  it("digit + hazar", () => expect(parseSmartFinance("2 hazar diesel", TODAY).amount).toBe(2000));
  it("spoken: do hazar", () => expect(parseSmartFinance("do hazar diesel ke diye", TODAY).amount).toBe(2000));
  it("spoken: das hazar", () => expect(parseSmartFinance("das hazar Fatehnagar distributor se aaye", TODAY).amount).toBe(10000));
  it("spoken English words", () => expect(parseSmartFinance("two thousand diesel", TODAY).amount).toBe(2000));
  it("thousands with comma", () => expect(parseSmartFinance("25,000 payment Ratan Products se", TODAY).amount).toBe(25000));
  it("lakh scale", () => expect(parseSmartFinance("1.5 lakh advertisement HDFC se", TODAY).amount).toBe(150000));
  it("no amount → null + warning", () => {
    const p = parseSmartFinance("diesel ke paise diye", TODAY);
    expect(p.amount).toBeNull();
    expect(p.warnings.join(" ")).toMatch(/amount/i);
  });
});

describe("Smart Finance parser — direction", () => {
  it("diya → MONEY_OUT", () => expect(parseSmartFinance("2000 diesel ke diye", TODAY).direction).toBe("MONEY_OUT"));
  it("aaya → MONEY_IN", () => expect(parseSmartFinance("Fatehnagar distributor se 10000 aaya", TODAY).direction).toBe("MONEY_IN"));
  it("payment received → MONEY_IN", () => expect(parseSmartFinance("Ratan Products se 25000 payment receive hua", TODAY).direction).toBe("MONEY_IN"));
  it("expense category with no verb → inferred MONEY_OUT", () => {
    const p = parseSmartFinance("4500 freight Jhansi", TODAY);
    expect(p.direction).toBe("MONEY_OUT");
    expect(p.directionInferred).toBe(true);
  });
});

describe("Smart Finance parser — category / purpose", () => {
  const cases: [string, string][] = [
    ["2000 diesel ke diye", "EXP-FUEL"],
    ["Jhansi mein 4500 freight diya", "EXP-FREIGHT"],
    ["Manoj ko 3000 salary di", "SAL-EMP"],
    ["Bank EMI pickup", "EXP-EMI"],
    ["Advertisement ke 8000 rupees HDFC bank se pay kiye", "EXP-ADVERTISEMENT"],
    ["bijli ka bill 1200 pay kiya", "EXP-ELECTRICITY"],
    ["office ka rent 15000 diya", "EXP-RENT"],
  ];
  for (const [text, code] of cases) {
    it(`"${text}" → ${code}`, () => expect(parseSmartFinance(text, TODAY).purposeCode).toBe(code));
  }
  it("money-in with no category → REC-INS", () => expect(parseSmartFinance("Aaj Fatehnagar distributor se 10000 rs payment aaya", TODAY).purposeCode).toBe("REC-INS"));
});

describe("Smart Finance parser — treasury", () => {
  it("HDFC bank", () => expect(parseSmartFinance("8000 advertisement HDFC bank se pay kiye", TODAY).treasuryHint).toEqual({ kind: "BANK", bankKeyword: "hdfc" }));
  it("cash", () => expect(parseSmartFinance("500 chai cash se diya", TODAY).treasuryHint?.kind).toBe("CASH"));
  it("UPI", () => expect(parseSmartFinance("2000 courier UPI se paid", TODAY).treasuryHint?.kind).toBe("UPI"));
  it("no treasury mentioned → null", () => expect(parseSmartFinance("2000 diesel ke diye", TODAY).treasuryHint).toBeNull());
});

describe("Smart Finance parser — party & purpose text", () => {
  it("extracts distributor name + type + purpose", () => {
    const p = parseSmartFinance("2000 rs aaj diesel ke diye Fatehnagar distributor dispatch ke liye", TODAY);
    expect(p.amount).toBe(2000);
    expect(p.direction).toBe("MONEY_OUT");
    expect(p.purposeCode).toBe("EXP-FUEL");
    expect(p.partyTypeHint).toBe("DISTRIBUTOR");
    expect(p.partyText?.toLowerCase()).toContain("fatehnagar");
    expect(p.purposeText?.toLowerCase()).toContain("dispatch");
    expect(p.date).toBe("2026-08-27");
  });
  it("extracts employee name for salary", () => {
    const p = parseSmartFinance("Manoj ko 3000 salary di", TODAY);
    expect(p.partyText?.toLowerCase()).toContain("manoj");
    expect(p.purposeCode).toBe("SAL-EMP");
  });
  it("keeps multi-word party name", () => {
    const p = parseSmartFinance("Ratan Products se 25000 payment receive hua", TODAY);
    expect(p.partyText?.toLowerCase()).toContain("ratan");
    expect(p.partyText?.toLowerCase()).toContain("products");
  });
});

describe("Smart Finance parser — date", () => {
  it("aaj → today", () => expect(parseSmartFinance("aaj 2000 diesel diya", TODAY).date).toBe("2026-08-27"));
  it("kal → yesterday", () => expect(parseSmartFinance("kal 2000 diesel diya", TODAY).date).toBe("2026-08-26"));
  it("no date word → null (caller defaults today)", () => expect(parseSmartFinance("2000 diesel diya", TODAY).date).toBeNull());
  it("explicit dd-mm-yyyy", () => expect(parseSmartFinance("15-08-2026 ko 2000 diesel diya", TODAY).date).toBe("2026-08-15"));
});

describe("Smart Finance parser — full spec examples", () => {
  it("'Aaj Fatehnagar distributor se 10000 rs payment aaya'", () => {
    const p = parseSmartFinance("Aaj Fatehnagar distributor se 10000 rs payment aaya", TODAY);
    expect(p.amount).toBe(10000);
    expect(p.direction).toBe("MONEY_IN");
    expect(p.purposeCode).toBe("REC-INS");
    expect(p.partyTypeHint).toBe("DISTRIBUTOR");
    expect(p.date).toBe("2026-08-27");
  });
  it("'Advertisement ke 8000 rupees HDFC bank se pay kiye'", () => {
    const p = parseSmartFinance("Advertisement ke 8000 rupees HDFC bank se pay kiye", TODAY);
    expect(p.amount).toBe(8000);
    expect(p.direction).toBe("MONEY_OUT");
    expect(p.purposeCode).toBe("EXP-ADVERTISEMENT");
    expect(p.treasuryHint).toEqual({ kind: "BANK", bankKeyword: "hdfc" });
  });
});
