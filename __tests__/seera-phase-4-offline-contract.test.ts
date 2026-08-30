import { describe, expect, it } from "vitest";
import { OFFLINE_ACTIONS, offlineOperationSchema } from "@/lib/phase-11/offline-contract";

describe("Part 4 distributor offline contract", () => {
  it("exposes governed distributor fulfilment replay actions", () => {
    expect(OFFLINE_ACTIONS).toEqual(expect.arrayContaining([
      "DISTRIBUTOR_DECISION_DRAFT",
      "DISTRIBUTOR_DELIVERY_DRAFT",
      "DISTRIBUTOR_REMAINING_DRAFT",
    ]));
  });

  it("requires session identity and a stable device id on offline operations", () => {
    expect(() => offlineOperationSchema.parse({
      clientOperationId: crypto.randomUUID(),
      deviceId: "device-12345678",
      sessionContext: { sessionId: "session-1", appVersion: "web", platform: "test" },
      entityType: "easy-decide",
      actionType: "DISTRIBUTOR_DECISION_DRAFT",
      localCreatedAt: new Date(),
      payloadVersion: 1,
      payload: { orderId: "order-1" },
    })).not.toThrow();
  });
});
