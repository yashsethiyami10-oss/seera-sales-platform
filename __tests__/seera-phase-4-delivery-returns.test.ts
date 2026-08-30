import { describe, expect, it } from "vitest";
import {
  derivePostDeliveryOrderStatus,
} from "@/lib/sales-distribution/delivery-service";
import {
  assertReturnDoesNotExceedDelivered,
} from "@/lib/sales-distribution/returns-service";

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

  it("rejects returns above the delivered-but-not-already-returned balance", () => {
    expect(() =>
      assertReturnDoesNotExceedDelivered(10, 3, 8),
    ).toThrowError("RETURN_EXCEEDS_DELIVERED");
  });

  it("accepts a return inside the delivered-but-not-returned balance", () => {
    expect(() =>
      assertReturnDoesNotExceedDelivered(10, 3, 7),
    ).not.toThrow();
  });
});
