import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// FORCED-FAILURE proof for the End Day P0 (Founder directive: "the only way to prove the bug
// class is actually eliminated"). Mocks recomputeSessionDistance/recordGpsSample — the two
// SECONDARY, non-critical operations endFieldDay runs after the session is already durably
// ENDED — to genuinely throw, then calls the REAL endFieldDay (everything else real, against a
// real TEST database) and asserts:
//   1. endFieldDay does NOT throw (the caller/API/UI must see success).
//   2. The WorkSession row is genuinely ENDED in the database.
// This is the exact contradiction the Founder reported (session ENDED, UI showed failure) and
// proves the wrapped secondary-path structure actually prevents it, not just that the code reads
// as if it should.

vi.mock("../../lib/sales-distribution/field-travel-service", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/sales-distribution/field-travel-service")>();
  return {
    ...real,
    recomputeSessionDistance: vi.fn().mockRejectedValue(new Error("FORCED_DISTANCE_RECOMPUTE_FAILURE")),
    // Real implementation by default (spied, not replaced) — the GPS-sample forced-failure test
    // below overrides it for a single call via mockRejectedValueOnce, every other test uses the
    // genuine behavior.
    recordGpsSample: vi.fn(real.recordGpsSample),
    // Real implementation by default (spied) — one test below forces this (part of the pre-close
    // Promise.all, i.e. BEFORE the session-close write) to reject, to prove a genuine pre-close
    // failure correctly fails the whole call AND leaves the session untouched/still ACTIVE.
    evaluateHqGeofence: vi.fn(real.evaluateHqGeofence),
  };
});

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(__dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "60");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

describe("End Day P0 — forced secondary-operation failure must not surface as End Day failure", () => {
  beforeAll(() => {
    console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("recomputeSessionDistance throwing after session close still returns success and leaves the session ENDED", { timeout: 30_000 }, async () => {
    const { startFieldDay, endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    const { executiveAuthorizedDistributors } = await import("../../lib/sales-distribution/scope");
    const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
    const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
    if (existing) await db.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date(), outcome: "COMPLETED" } });
    const authorized = await executiveAuthorizedDistributors(db, exec.id);
    const session = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });

    // The real function under test — recomputeSessionDistance is mocked to reject above.
    await expect(endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED", latitude: 28.614, longitude: 77.2091 })).resolves.not.toThrow();

    const after = await db.seeraWorkSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.status).toBe("ENDED");
    expect(after.outcome).toBe("COMPLETED");
  });

  it("a second End Day call against the same now-ENDED session is also a safe no-op, not an error", { timeout: 20_000 }, async () => {
    const { endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
    const ended = await db.seeraWorkSession.findFirstOrThrow({ where: { employeeId: exec.id, status: "ENDED" }, orderBy: { endedAt: "desc" } });
    const result = await endFieldDay(db, exec.id, ended.id, { outcome: "COMPLETED" });
    expect(result).toEqual({ alreadyEnded: true });
  });

  it("recordGpsSample throwing after session close ALSO still returns success and leaves the session ENDED (Section 13)", { timeout: 30_000 }, async () => {
    const travelService = await import("../../lib/sales-distribution/field-travel-service");
    const { startFieldDay, endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    const { executiveAuthorizedDistributors } = await import("../../lib/sales-distribution/scope");
    const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-2@seera.test" } });
    const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
    if (existing) await db.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date(), outcome: "COMPLETED" } });
    const authorized = await executiveAuthorizedDistributors(db, exec.id);
    // Start Day first, with the real recordGpsSample — only the End Day GPS-sample write (not
    // Start Day's) is what this test forces to fail, isolating End Day's own secondary-path
    // handling from Start Day's (which is out of scope for this directive).
    const session = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });
    const gpsSpy = vi.mocked(travelService.recordGpsSample).mockRejectedValueOnce(new Error("FORCED_GPS_SAMPLE_FAILURE"));

    await expect(endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED", latitude: 28.614, longitude: 77.2091 })).resolves.not.toThrow();

    const after = await db.seeraWorkSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.status).toBe("ENDED");
    expect(gpsSpy).toHaveBeenCalled();
  });

  it("a genuine PRE-close failure correctly fails the call and leaves the session ACTIVE, untouched (Section 15 Test I)", { timeout: 30_000 }, async () => {
    const travelService = await import("../../lib/sales-distribution/field-travel-service");
    const { startFieldDay, endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    const { executiveAuthorizedDistributors } = await import("../../lib/sales-distribution/scope");
    const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
    const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
    if (existing) await db.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date(), outcome: "COMPLETED" } });
    const authorized = await executiveAuthorizedDistributors(db, exec.id);
    const session = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });

    vi.mocked(travelService.evaluateHqGeofence).mockRejectedValueOnce(new Error("FORCED_PRE_CLOSE_FAILURE"));
    await expect(endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED", latitude: 28.614, longitude: 77.2091 })).rejects.toThrow("FORCED_PRE_CLOSE_FAILURE");

    const after = await db.seeraWorkSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.endedAt).toBeNull();

    // Clean up: end it for real so it doesn't linger as a stuck ACTIVE session for future runs.
    await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED", latitude: 28.614, longitude: 77.2091 });
  });
});
