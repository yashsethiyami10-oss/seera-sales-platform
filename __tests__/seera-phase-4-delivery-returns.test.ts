import { describe, expect, it } from "vitest";
import {
  derivePostDeliveryOrderStatus,
  assertDeliveryProof,
} from "@/lib/sales-distribution/delivery-service";
import {
  assertReturnDoesNotExceedDelivered,
} from "@/lib/sales-distribution/returns-service";
import { validateInitialFulfilmentDecision } from "@/lib/sales-distribution/workflow-service";

describe("Part 4 delivery/return regression guards", () => {
  it("never treats a fully refused order as DELIVERED", () => {
    expect(
      derivePostDeliveryOrderStatus(
        [{
          orderedQuantity: 10,
          cancelledQuantity: 0,
          deliveredQuantity: 0,
          refusedQuantity: 10,
          returnedQuantity: 0,
        }],
        "DISPATCHED",
      ),
    ).toBe("DISPATCHED");
  });

  it("marks an order DELIVERED only from actual delivered quantity", () => {
    expect(
      derivePostDeliveryOrderStatus(
        [{
          orderedQuantity: 10,
          cancelledQuantity: 0,
          deliveredQuantity: 10,
          refusedQuantity: 0,
          returnedQuantity: 0,
        }],
        "PARTIAL_DELIVERED",
      ),
    ).toBe("DELIVERED");
  });

  it("keeps a partial delivery partial even if another quantity was refused", () => {
    expect(
      derivePostDeliveryOrderStatus(
        [{
          orderedQuantity: 10,
          cancelledQuantity: 0,
          deliveredQuantity: 6,
          refusedQuantity: 4,
          returnedQuantity: 0,
        }],
        "DISPATCHED",
      ),
    ).toBe("PARTIAL_DELIVERED");
  });

  // FoundationError carries a governed machine-readable `.code` distinct from its human-readable
  // `.message` (see lib/foundation/errors.ts) — every throw site in this codebase follows that
  // split deliberately, so the regression guard must assert on `.code` (via objectContaining),
  // not on `.message` text via the plain-string form of toThrowError (which checks .message and
  // was failing here even though the actual application logic was already correct).
  it("requires full quantity for ACCEPT", () => {
    expect(() =>
      validateInitialFulfilmentDecision(
        "ACCEPT",
        [{ id: "l1", orderedQuantity: 10 }],
        [{ lineId: "l1", quantity: 9 }],
      ),
    ).toThrow(expect.objectContaining({ code: "FULL_ACCEPTANCE_REQUIRED" }));
  });

  it("requires an incomplete positive quantity for PARTIAL_ACCEPT", () => {
    expect(() =>
      validateInitialFulfilmentDecision(
        "PARTIAL_ACCEPT",
        [{ id: "l1", orderedQuantity: 10 }],
        [{ lineId: "l1", quantity: 10 }],
      ),
    ).toThrow(expect.objectContaining({ code: "PARTIAL_ACCEPTANCE_REQUIRED" }));
  });

  it("requires a reason for REJECT/HOLD", () => {
    expect(() =>
      validateInitialFulfilmentDecision(
        "REJECT",
        [{ id: "l1", orderedQuantity: 10 }],
        [],
      ),
    ).toThrow(expect.objectContaining({ code: "DECISION_REASON_REQUIRED" }));
  });

  it("rejects returns above the delivered-but-not-already-returned balance", () => {
    expect(() =>
      assertReturnDoesNotExceedDelivered(10, 3, 8),
    ).toThrow(expect.objectContaining({ code: "RETURN_EXCEEDS_DELIVERED" }));
  });

  it("accepts a return inside the delivered-but-not-returned balance", () => {
    expect(() =>
      assertReturnDoesNotExceedDelivered(10, 3, 7),
    ).not.toThrow();
  });
  it("requires structured proof for actual delivered outcomes and binds it to the exact delivery", () => {
    expect(() => assertDeliveryProof("DELIVERED", undefined, "order-1", "delivery-1")).toThrow(expect.objectContaining({ code: "DELIVERY_PROOF_REQUIRED" }));
    expect(() => assertDeliveryProof("DELIVERED", { mode: "PHOTO", reference: "photo-1", orderId: "order-2", deliveryId: "delivery-1" }, "order-1", "delivery-1")).toThrow(expect.objectContaining({ code: "DELIVERY_PROOF_SCOPE_DENIED" }));
    expect(() => assertDeliveryProof("DELIVERED", { mode: "PHOTO", reference: "photo-1", orderId: "order-1", deliveryId: "delivery-1" }, "order-1", "delivery-1")).not.toThrow();
    expect(() => assertDeliveryProof("REFUSED", undefined, "order-1", "delivery-1")).not.toThrow();
  });

});
