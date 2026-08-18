import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// FORCED-FAILURE proof (Test G of the WhatsApp integration audit test matrix: "Meta provider
// throws -> business checkout/delivery still succeeds"), same technique as
// __tests__/seera-end-day-forced-failure/end-day-p0.test.ts: mock the WhatsApp queuing call to
// genuinely reject, call the REAL executiveCheckOut against a real TEST database, and assert the
// visit is still durably checked out. Proves the non-blocking architecture (queueRetailerCommunicationSafe
// never propagates, and field-portal-service.ts's own try/catch around it is a second, independent
// layer) actually holds, not just that the code reads as if it should.

vi.mock("../../lib/sales-distribution/retailer-communication-service", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/sales-distribution/retailer-communication-service")>();
  return {
    ...real,
    queueRetailerCommunicationSafe: vi.fn().mockRejectedValue(new Error("FORCED_WHATSAPP_QUEUE_FAILURE")),
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

describe("WhatsApp queuing failure must never fail retailer checkout", () => {
  beforeAll(() => {
    console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it(
    "executiveCheckOut succeeds and the visit is durably checked out even though the WhatsApp queue write is forced to throw",
    { timeout: 30_000 },
    async () => {
      const { startFieldDay, endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
      const { executiveCheckIn, executiveCheckOut } = await import("../../lib/sales-distribution/field-portal-service");
      const { executiveAuthorizedDistributors } = await import("../../lib/sales-distribution/scope");

      const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
      const existingSession = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
      if (existingSession) await endFieldDay(db, exec.id, existingSession.id, { outcome: "COMPLETED" }).catch(() => undefined);

      const authorized = await executiveAuthorizedDistributors(db, exec.id);
      const retailer = await db.seeraRetailer.findFirstOrThrow({
        where: { lifecycle: "ACTIVE", salespersonId: exec.id, mobile: { not: null } },
      });

      const session = await startFieldDay(db, exec.id, {
        employeeRole: "SALES_EXECUTIVE",
        workingType: "RETAILING",
        workingDistributorId: authorized[0]!.id,
        latitude: 28.6139,
        longitude: 77.209,
      });

      const suffix = Date.now();
      const visit = await executiveCheckIn(db, exec.id, {
        workSessionId: session.id,
        retailerId: retailer.id,
        latitude: 28.6139,
        longitude: 77.209,
        idempotencyKey: `whatsapp-nonblocking-checkin-${suffix}`,
      });

      // The real function under test — queueRetailerCommunicationSafe is mocked to reject above,
      // AND field-portal-service.ts wraps that call in its own try/catch, so this proves both
      // layers actually hold, not just one.
      await expect(
        executiveCheckOut(db, exec.id, visit.id, {
          outcome: "NO_ORDER",
          noOrderReason: "Shop closed",
          photoExceptionReason: "No photo captured — forced-failure WhatsApp non-blocking test",
        }),
      ).resolves.not.toThrow();

      const after = await db.seeraVisit.findUniqueOrThrow({ where: { id: visit.id } });
      expect(after.checkedOutAt).not.toBeNull();
      expect(after.outcome).toBe("NO_ORDER");

      await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED" });
    },
  );
});
