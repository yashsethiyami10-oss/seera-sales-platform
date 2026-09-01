import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Field visit scope regression", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/sales-distribution/field-portal-service.ts"),
    "utf8",
  );

  it("never lets an open visit from an ended workday block a new active session", () => {
    const standalone = source.indexOf("export async function executiveCheckIn(");
    const combined = source.indexOf("export async function createRetailerAndCheckIn(");
    expect(standalone).toBeGreaterThanOrEqual(0);
    expect(combined).toBeGreaterThan(standalone);

    const standaloneFn = source.slice(standalone, combined);
    const combinedFn = source.slice(combined, source.indexOf("export async function retailer360(", combined));

    for (const fn of [standaloneFn, combinedFn]) {
      const openVisit = fn.indexOf("checkedOutAt: null");
      expect(openVisit).toBeGreaterThanOrEqual(0);
      const queryStart = fn.lastIndexOf("db.seeraVisit.findFirst({", openVisit);
      const query = fn.slice(queryStart, openVisit + 80);
      expect(query).toContain("status: "ACTIVE"");
      expect(query).toContain("employeeId: actorId");
    }
  });
});
