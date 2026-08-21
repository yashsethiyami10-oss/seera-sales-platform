import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// P0 21-Aug live-UAT fix: real TEST-database coverage for checkout idempotency (Part F/G/I) and
// closed-visit immutability (Part J). Root-caused against a real production incident (Mishra
// kirana visit cmt2tqcw9001zwhr9or51qm1j): a checkout retry against an already-closed visit
// returned "Active visit unavailable" even though the FIRST checkout had already durably
// succeeded, and an order was later silently accepted against that same closed visit.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(__dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test!);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "60");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

const key = () => crypto.randomUUID();

describe("checkout idempotency + closed-visit immutability (P0 21-Aug)", () => {
  let execA: { id: string };
  let sku: { id: string; mrp: unknown };
  let sessionA: { id: string };

  beforeAll(async () => {
    console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
    const { startFieldDay, endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    const { executiveAuthorizedDistributors } = await import("../../lib/sales-distribution/scope");

    execA = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
    sku = await db.seeraSku.findFirstOrThrow({ where: { taxRate: { not: null }, hsn: { not: null } }, select: { id: true, mrp: true } });

    const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: execA.id, status: "ACTIVE" } });
    if (existing) await endFieldDay(db, execA.id, existing.id, { outcome: "COMPLETED" }).catch(() => undefined);

    const authorized = await executiveAuthorizedDistributors(db, execA.id);
    sessionA = await startFieldDay(db, execA.id, {
      employeeRole: "SALES_EXECUTIVE",
      workingType: "RETAILING",
      workingDistributorId: authorized[0]!.id,
      latitude: 28.6139,
      longitude: 77.209,
    });
  }, 60_000);

  afterAll(async () => {
    const { endFieldDay } = await import("../../lib/sales-distribution/workflow-service");
    if (sessionA) await endFieldDay(db, execA.id, sessionA.id, { outcome: "COMPLETED" }).catch(() => undefined);
    await db.$disconnect();
  }, 60_000);

  async function freshVisit() {
    const { executiveCheckIn } = await import("../../lib/sales-distribution/field-portal-service");
    const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: execA.id, mobile: { not: null } } });
    const visit = await executiveCheckIn(db, execA.id, {
      workSessionId: sessionA.id,
      retailerId: retailer.id,
      latitude: 28.6139,
      longitude: 77.209,
      idempotencyKey: `checkout-idempotency-checkin-${key()}`,
    });
    return { visit, retailer };
  }

  it("L: a zero-order NO_ORDER checkout succeeds (no prior order/photo required)", async () => {
    const { executiveCheckOut } = await import("../../lib/sales-distribution/field-portal-service");
    const { visit } = await freshVisit();
    const result = await executiveCheckOut(db, execA.id, visit.id, {
      outcome: "NO_ORDER",
      noOrderReason: "Maal pada hua hai",
      photoExceptionReason: "RETAILER_REFUSED",
      idempotencyKey: key(),
    });
    expect(result.outcome).toBe("NO_ORDER");
    expect(result.checkedOutAt).not.toBeNull();
  }, 20_000);

  it("H/I: first checkout succeeds; a same-idempotency-key retry returns the SAME completed result, not 'Active visit unavailable'", async () => {
    const { executiveCheckOut } = await import("../../lib/sales-distribution/field-portal-service");
    const { visit } = await freshVisit();
    const idempotencyKey = key();
    const first = await executiveCheckOut(db, execA.id, visit.id, {
      outcome: "NO_ORDER",
      noOrderReason: "Maal pada hua hai",
      photoExceptionReason: "RETAILER_REFUSED",
      idempotencyKey,
    });
    expect(first.checkedOutAt).not.toBeNull();

    const retry = await executiveCheckOut(db, execA.id, visit.id, {
      outcome: "NO_ORDER",
      noOrderReason: "Maal pada hua hai",
      photoExceptionReason: "RETAILER_REFUSED",
      idempotencyKey, // SAME key as the first, successful call
    });
    expect(retry.id).toBe(first.id);
    expect(retry.checkedOutAt?.getTime()).toBe(first.checkedOutAt?.getTime());
    expect(retry.outcome).toBe("NO_ORDER");
  }, 20_000);

  it("J: a retry with a DIFFERENT idempotency key against an already-closed visit is rejected (VISIT_SCOPE_DENIED / Active visit unavailable)", async () => {
    const { executiveCheckOut } = await import("../../lib/sales-distribution/field-portal-service");
    const { visit } = await freshVisit();
    await executiveCheckOut(db, execA.id, visit.id, {
      outcome: "NO_ORDER",
      noOrderReason: "Maal pada hua hai",
      photoExceptionReason: "RETAILER_REFUSED",
      idempotencyKey: key(),
    });
    await expect(
      executiveCheckOut(db, execA.id, visit.id, {
        outcome: "NO_ORDER",
        noOrderReason: "Maal pada hua hai",
        photoExceptionReason: "RETAILER_REFUSED",
        idempotencyKey: key(), // a genuinely DIFFERENT intent
      }),
    ).rejects.toMatchObject({ code: "VISIT_SCOPE_DENIED", message: "Active visit unavailable" });
  }, 20_000);

  it("K: two CONCURRENT checkout calls with the SAME idempotency key (the server-side half of the client double-tap fix) produce exactly one real checkout", async () => {
    const { executiveCheckOut } = await import("../../lib/sales-distribution/field-portal-service");
    const { visit } = await freshVisit();
    const idempotencyKey = key();
    const input = { outcome: "NO_ORDER" as const, noOrderReason: "Maal pada hua hai", photoExceptionReason: "RETAILER_REFUSED", idempotencyKey };
    const [a, b] = await Promise.all([
      executiveCheckOut(db, execA.id, visit.id, input),
      executiveCheckOut(db, execA.id, visit.id, input),
    ]);
    expect(a.checkedOutAt?.getTime()).toBe(b.checkedOutAt?.getTime());
    const row = await db.seeraVisit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(row.checkoutIdempotencyKey).toBe(idempotencyKey);
  }, 20_000);

  it("M: an order against an already-checked-out FIELD_VISIT visit is rejected with VISIT_ALREADY_CLOSED", async () => {
    const { executiveCheckOut } = await import("../../lib/sales-distribution/field-portal-service");
    const { placeRetailerOrder } = await import("../../lib/sales-distribution/workflow-service");
    const { visit, retailer } = await freshVisit();
    await executiveCheckOut(db, execA.id, visit.id, {
      outcome: "NO_ORDER",
      noOrderReason: "Maal pada hua hai",
      photoExceptionReason: "RETAILER_REFUSED",
      idempotencyKey: key(),
    });
    await expect(
      placeRetailerOrder(
        db,
        { actorId: execA.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId ?? "" },
        { retailerId: retailer.id, visitId: visit.id, source: "FIELD_VISIT", lines: [{ skuId: sku.id, quantity: 1, rate: Number(sku.mrp) }], idempotencyKey: key() },
      ),
    ).rejects.toMatchObject({ code: "VISIT_ALREADY_CLOSED" });
  }, 20_000);

  it("N: a Cloudinary photo-upload signature request against an already-checked-out visit is rejected (pre-existing guard, re-confirmed)", async () => {
    const { executiveCheckOut } = await import("../../lib/sales-distribution/field-portal-service");
    const { createFieldPhotoUploadSignature } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
    const { visit } = await freshVisit();
    await executiveCheckOut(db, execA.id, visit.id, {
      outcome: "NO_ORDER",
      noOrderReason: "Maal pada hua hai",
      photoExceptionReason: "RETAILER_REFUSED",
      idempotencyKey: key(),
    });
    await expect(createFieldPhotoUploadSignature(db, execA.id, visit.id)).rejects.toMatchObject({ code: "VISIT_SCOPE_DENIED" });
  }, 20_000);

  it("P: a phone/repeat order with NO visitId is completely unaffected by closed-visit enforcement", async () => {
    const { placeRetailerOrder } = await import("../../lib/sales-distribution/workflow-service");
    const { retailer } = await freshVisit(); // visit deliberately left open — irrelevant to this order
    const order = await placeRetailerOrder(
      db,
      { actorId: execA.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId ?? "" },
      { retailerId: retailer.id, source: "PHONE_CALL", lines: [{ skuId: sku.id, quantity: 1, rate: Number(sku.mrp) }], idempotencyKey: key() },
    );
    expect(order.visitId).toBeNull();
    expect(order.source).toBe("PHONE_CALL");
  }, 20_000);

  it("checkout audit trail: succeeded / idempotent_replay events are recorded", async () => {
    const { executiveCheckOut } = await import("../../lib/sales-distribution/field-portal-service");
    const { visit } = await freshVisit();
    const idempotencyKey = key();
    await executiveCheckOut(db, execA.id, visit.id, { outcome: "NO_ORDER", noOrderReason: "x", photoExceptionReason: "RETAILER_REFUSED", idempotencyKey });
    await executiveCheckOut(db, execA.id, visit.id, { outcome: "NO_ORDER", noOrderReason: "x", photoExceptionReason: "RETAILER_REFUSED", idempotencyKey });
    const events = await db.auditLog.findMany({ where: { entityType: "SeeraVisit", entityId: visit.id, action: { startsWith: "field_visit.checkout" } }, orderBy: { occurredAt: "asc" } });
    expect(events.map((e) => e.action)).toEqual(["field_visit.checkout_succeeded", "field_visit.checkout_idempotent_replay"]);
  }, 20_000);
});
