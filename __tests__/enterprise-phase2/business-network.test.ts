import { describe, expect, it } from "vitest";
import {
  AGREEMENT_TRANSITIONS,
  calculateCommercialAmount,
  NETWORK_PARTNER_TYPES,
  PARTNER_TRANSITIONS,
  assertEditable,
  assertTransition,
} from "@/lib/enterprise-network/domain";

describe("Enterprise Business Network deterministic domain", () => {
  it("supports exactly the six frozen partner types", () => {
    expect(NETWORK_PARTNER_TYPES).toEqual([
      "FRANCHISE", "DISTRIBUTOR", "SUPER_STOCKIST", "DEALER", "OUTLET", "INSTITUTIONAL_PARTNER",
    ]);
  });

  it("enforces governed partner and agreement transitions", () => {
    expect(() => assertTransition("DRAFT", "ACTIVE", PARTNER_TRANSITIONS)).toThrow();
    expect(() => assertTransition("DRAFT", "ONBOARDING", PARTNER_TRANSITIONS)).not.toThrow();
    expect(() => assertTransition("APPROVED", "ACTIVE", AGREEMENT_TRANSITIONS)).toThrow();
    expect(() => assertTransition("APPROVED", "PENDING_EXECUTION", AGREEMENT_TRANSITIONS)).not.toThrow();
  });

  it("prevents in-place edits to finalized records", () => {
    expect(() => assertEditable("ACTIVE")).toThrow(/immutable/);
    expect(() => assertEditable("DRAFT")).not.toThrow();
  });

  it("calculates fixed, percentage, tiered, minimum, cap, and exclusions deterministically", () => {
    expect(calculateCommercialAmount(1000, { mode: "FIXED", fixedAmount: 25 }).amount).toBe(25);
    expect(calculateCommercialAmount(1000, { mode: "PERCENTAGE", ratePercent: 2.5 }).amount).toBe(25);
    expect(calculateCommercialAmount(1500, {
      mode: "TIERED", tiers: [{ upTo: 1000, ratePercent: 1 }, { ratePercent: 2 }],
    }).amount).toBe(20);
    expect(calculateCommercialAmount(100, { mode: "PERCENTAGE", ratePercent: 1, minimum: 10 }).amount).toBe(10);
    expect(calculateCommercialAmount(1000, { mode: "PERCENTAGE", ratePercent: 50, cap: 100 }).amount).toBe(100);
    expect(calculateCommercialAmount(1000, { mode: "PERCENTAGE", ratePercent: 50, excluded: true }).amount).toBe(0);
  });

  it("rejects invalid financial rule inputs", () => {
    expect(() => calculateCommercialAmount(-1, { mode: "FIXED", fixedAmount: 1 })).toThrow();
    expect(() => calculateCommercialAmount(100, { mode: "TIERED", tiers: [] })).toThrow();
    expect(() => calculateCommercialAmount(100, {
      mode: "TIERED", tiers: [{ upTo: 100, ratePercent: 1 }, { upTo: 50, ratePercent: 2 }],
    })).toThrow();
  });
});

