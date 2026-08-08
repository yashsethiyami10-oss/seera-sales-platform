import { describe, expect, it } from "vitest";
import { assertAssistedAction, inventoryPosition, reconciliationVariance } from "@/lib/sales-distribution/business-rules";

describe("Phase 4 distributor integrity", () => {
  it("derives stock only from traceable movements", () => expect(inventoryPosition([{ direction: "IN", quantity: 20 }, { direction: "RESERVE", quantity: 8 }, { direction: "RELEASE", quantity: 3 }, { direction: "OUT", quantity: 5 }])).toEqual({ onHand: 15, reserved: 5 }));
  it("rejects negative stock manipulation", () => expect(() => inventoryPosition([{ direction: "OUT", quantity: 1 }])).toThrow("INVALID_INVENTORY_POSITION"));
  it("creates explicit physical variance", () => expect(reconciliationVariance(12.125, 10)).toBe(-2.125));
  it("preserves actor and on-behalf-of for assisted work", () => expect(() => assertAssistedAction({ actorId: "manager", commercialPartyId: "dist", onBehalfOfPartyId: "dist", sourcePortal: "sales-manager", reason: "Partner requires assistance", financialAcceptance: false })).not.toThrow());
});
