import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Start Day durability boundary", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/sales-distribution/workflow-service.ts"),
    "utf8",
  );

  it("commits the ACTIVE session before secondary GPS telemetry", () => {
    const start = source.indexOf("export async function startFieldDay(");
    const end = source.indexOf("// P0 fix (Founder-reported repeated live failure)", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const fn = source.slice(start, end);
    const sessionWrite = fn.indexOf("prisma.seeraWorkSession.create(");
    const gpsDeferred = fn.indexOf("const gpsSample = async () =>");
    const returnSession = fn.indexOf("return session;");
    const deferredRegistration = fn.indexOf("after(gpsSample)");
    expect(sessionWrite).toBeGreaterThanOrEqual(0);
    expect(gpsDeferred).toBeGreaterThan(sessionWrite);
    expect(deferredRegistration).toBeGreaterThan(gpsDeferred);
    expect(returnSession).toBeGreaterThan(deferredRegistration);
    expect(fn.slice(sessionWrite, gpsDeferred)).not.toContain("await recordGpsSample");
    expect(fn).toContain("workflow.startFieldDay.gps_sample_failed");
  });
});
