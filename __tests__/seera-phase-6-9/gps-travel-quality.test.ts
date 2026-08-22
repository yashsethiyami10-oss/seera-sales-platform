import { describe, expect, it } from "vitest";
import { eligibleGpsDistanceKm } from "@/lib/sales-distribution/business-rules";

const at = (minute: number) => new Date(Date.UTC(2026, 7, 22, 4, minute));

describe("governed GPS checkpoint travel estimate", () => {
  it("orders Start -> three visits -> End by timestamp and sums every accepted leg", () => {
    const result = eligibleGpsDistanceKm([
      { lat: 25.04, lng: 78, capturedAt: at(40), accuracy: 10 },
      { lat: 25, lng: 78, capturedAt: at(0), accuracy: 10 },
      { lat: 25.03, lng: 78, capturedAt: at(30), accuracy: 10 },
      { lat: 25.01, lng: 78, capturedAt: at(10), accuracy: 10 },
      { lat: 25.02, lng: 78, capturedAt: at(20), accuracy: 10 },
    ]);
    expect(result.distanceKm).toBeGreaterThan(4);
    expect(result.method).toBe("CHECKPOINT_HAVERSINE_ESTIMATE");
    expect(result.reviewRequired).toBe(false);
  });

  it("does not bill same-shop duplicate check-in/out movement", () => {
    const result = eligibleGpsDistanceKm([
      { lat: 25, lng: 78, capturedAt: at(0), accuracy: 10 },
      { lat: 25.00001, lng: 78.00001, capturedAt: at(5), accuracy: 10 },
    ]);
    expect(result.distanceKm).toBe(0);
    expect(result.excludedByReason.DUPLICATE_OR_SAME_LOCATION).toBe(1);
    expect(result.reviewRequired).toBe(false);
  });

  it.each([
    ["poor accuracy", { lat: 25.01, lng: 78, capturedAt: at(10), accuracy: 300 }, "POOR_ACCURACY"],
    ["impossible jump", { lat: 28, lng: 78, capturedAt: at(1), accuracy: 10 }, "IMPOSSIBLE_SPEED"],
    ["invalid coordinate", { lat: 125, lng: 78, capturedAt: at(10), accuracy: 10 }, "INVALID_COORDINATE"],
  ])("flags %s for review without deleting evidence", (_name, endpoint, warning) => {
    const result = eligibleGpsDistanceKm([
      { lat: 25, lng: 78, capturedAt: at(0), accuracy: 10 }, endpoint,
    ]);
    expect(result.distanceKm).toBe(0);
    expect(result.warnings).toContain(warning);
    expect(result.reviewRequired).toBe(true);
    expect(result.sampleCount).toBe(2);
  });

  it("returns no fabricated distance when GPS is missing", () => {
    const result = eligibleGpsDistanceKm([]);
    expect(result.distanceKm).toBe(0);
    expect(result.sampleCount).toBe(0);
  });
});
