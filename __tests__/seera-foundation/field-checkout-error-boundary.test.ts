import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journey = readFileSync("components/seera/product/FieldJourney.tsx", "utf8");
const service = readFileSync("lib/sales-distribution/field-portal-service.ts", "utf8");

describe("field checkout intermittent-error regression", () => {
  it("does not couple durable checkout to secondary GPS telemetry", () => {
    const start = service.indexOf("const closeResult = await db.seeraVisit.updateMany");
    const end = service.indexOf("if (closeResult.count === 0)", start);
    const checkoutMutation = service.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(checkoutMutation).not.toContain("Promise.all");
    expect(checkoutMutation).toContain("checkedOutAt: new Date()");
    const afterCommit = service.slice(end);
    const gpsIndex = afterCommit.indexOf('source: "CHECK_OUT"');
    expect(gpsIndex).toBeGreaterThan(-1);
    expect(afterCommit.slice(Math.max(0, gpsIndex - 500), gpsIndex + 500)).toContain(".catch((error)");
  });

  it("catches unexpected client/queue exceptions inside the field action boundary", () => {
    const start = journey.indexOf("const run = async (");
    const end = journey.indexOf("  // Shared by both the primary", start);
    const run = journey.slice(start, end);
    expect(run).toContain("try {");
    expect(run).toContain("catch (error)");
    expect(run).toContain('code: "CLIENT_ACTION_ERROR"');
    expect(run).toContain("finally");
  });
});
