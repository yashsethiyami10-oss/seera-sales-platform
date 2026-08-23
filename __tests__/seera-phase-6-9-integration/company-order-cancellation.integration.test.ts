import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { createCompanyOrder, cancelCompanyOrder } from "@/lib/sales-distribution/workflow-service";
import { submitPaymentProof } from "@/lib/sales-distribution/operational-service";

// Final closure (23-Aug), Part 16/17: Company Orders had no cancellation path at all — a real gap
// surfaced by two live orders needing correction after the same-day 25x pricing regression (see
// company-order-catalog.ts's own correction note). Regression coverage for the governed
// cancelCompanyOrder path and its boundaries.
const suffix = randomBytes(5).toString("hex");
let founder = "", ssOwner = "", superStockistId = "", skuId = "";

describe("guarded Phase 6-9 Company Order cancellation", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    ssOwner = roleUsers.get("SUPER_STOCKIST_OWNER")!.id;
    const partner = await prisma.seeraPartner.create({ data: { type: "SUPER_STOCKIST", code: `SS-CANCEL-${suffix}`, legalName: `Cancel Test SS ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000099" }, addresses: {}, territoryIds: [], createdById: founder } });
    superStockistId = partner.id;
    await prisma.seeraPartyUser.create({ data: { partnerId: superStockistId, userId: ssOwner, accessRole: "OWNER", createdById: founder } });
    const sku = await prisma.seeraSku.create({ data: { code: `CANCEL-SKU-${suffix}`, productName: "Cancel Test SKU", brand: "Seera", category: "TEST", packSize: 1, unitType: "kg", unitsPerCase: 1, mrp: 100, status: "ACTIVE", createdById: founder } });
    skuId = sku.id;
    await prisma.seeraPriceVersion.create({ data: { skuId, tier: "COMPANY_TO_SS", amount: 500, mrpSnapshot: 100, status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), createdById: founder } });
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  }, 120000);

  it("cancels a SUBMITTED order with no payment proof", async () => {
    const order = await createCompanyOrder(prisma, ssOwner, superStockistId, { idempotencyKey: `cancel-ok-${suffix}`, lines: [{ skuId, quantity: 1 }] });
    expect(order.status).toBe("SUBMITTED");
    const cancelled = await cancelCompanyOrder(prisma, ssOwner, superStockistId, { orderId: order.id, reason: "Test cancellation" });
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("blocks cancellation once a payment proof exists — must use reject/resubmit instead", async () => {
    const order = await createCompanyOrder(prisma, ssOwner, superStockistId, { idempotencyKey: `cancel-proof-${suffix}`, lines: [{ skuId, quantity: 1 }] });
    await submitPaymentProof(prisma, ssOwner, superStockistId, { orderId: order.id, amount: Number(order.total), reference: `REF-${suffix}`, idempotencyKey: `proof-${suffix}` });
    await expect(cancelCompanyOrder(prisma, ssOwner, superStockistId, { orderId: order.id, reason: "Should be blocked" })).rejects.toMatchObject({ code: "ORDER_NOT_CANCELLABLE" });
  });

  it("blocks a payment proof submission against an already-cancelled order", async () => {
    const order = await createCompanyOrder(prisma, ssOwner, superStockistId, { idempotencyKey: `cancel-then-proof-${suffix}`, lines: [{ skuId, quantity: 1 }] });
    await cancelCompanyOrder(prisma, ssOwner, superStockistId, { orderId: order.id, reason: "Cancel first" });
    await expect(
      submitPaymentProof(prisma, ssOwner, superStockistId, { orderId: order.id, amount: Number(order.total), reference: `REF2-${suffix}`, idempotencyKey: `proof2-${suffix}` }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_CANCELLABLE" });
  });

  it("cancelling an already-cancelled order is rejected, not silently repeated", async () => {
    const order = await createCompanyOrder(prisma, ssOwner, superStockistId, { idempotencyKey: `cancel-twice-${suffix}`, lines: [{ skuId, quantity: 1 }] });
    await cancelCompanyOrder(prisma, ssOwner, superStockistId, { orderId: order.id, reason: "First cancel" });
    await expect(cancelCompanyOrder(prisma, ssOwner, superStockistId, { orderId: order.id, reason: "Second cancel" })).rejects.toMatchObject({ code: "ORDER_NOT_CANCELLABLE" });
  });

  it("a reason is required", async () => {
    const order = await createCompanyOrder(prisma, ssOwner, superStockistId, { idempotencyKey: `cancel-noreason-${suffix}`, lines: [{ skuId, quantity: 1 }] });
    await expect(cancelCompanyOrder(prisma, ssOwner, superStockistId, { orderId: order.id, reason: "" })).rejects.toMatchObject({ code: "CANCEL_REASON_REQUIRED" });
  });
});
