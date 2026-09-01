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
    const postCommit = fn.slice(gps);
    const gpsDeferred = postCommit.indexOf("const gpsSample = async () =>");
    const returnSession = postCommit.indexOf("return session;");
    expect(gpsDeferred).toBeGreaterThanOrEqual(0);
    expect(returnSession).toBeGreaterThan(gpsDeferred);
    expect(postCommit.slice(0, gpsDeferred)).not.toContain("await recordGpsSample");
    expect(fn).toContain("after(gpsSample)");
    expect(fn).toContain("workflow.startFieldDay.gps_sample_failed");
  });
});
