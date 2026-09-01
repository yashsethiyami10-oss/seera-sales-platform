import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Start Day durability boundary", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/sales-distribution/workflow-service.ts"),
    "utf8",
  );

  it("does not make the durable ACTIVE session depend on GPS telemetry", () => {
    const start = source.indexOf("export async function startFieldDay(");
    const end = source.indexOf("// P0 fix (Founder-reported repeated live failure)", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const fn = source.slice(start, end);
    const sessionWrite = fn.indexOf("prisma.seeraWorkSession.create(");
    const gps = fn.indexOf('source: "START_DAY"');
    expect(sessionWrite).toBeGreaterThanOrEqual(0);
    expect(gps).toBeGreaterThan(sessionWrite);
    expect(fn.slice(sessionWrite, gps)).not.toMatch(/await\s+recordGpsSample\s*\(/);
    expect(fn).toContain("after(gpsSample)");
    expect(fn).toContain("workflow.startFieldDay.gps_sample_failed");
  });
});
