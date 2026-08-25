import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { createCompanyOrder, cancelCompanyOrder, dispatchCompanyOrder, receiveIncomingOrder } from "@/lib/sales-distribution/workflow-service";
import { submitPaymentProof, reviewPaymentProof } from "@/lib/sales-distribution/operational-service";

// Final closure (23-Aug), Part 16/17: Company Orders had no cancellation path at all — a real gap
// surfaced by two live orders needing correction after the same-day 25x pricing regression (see
// company-order-catalog.ts's own correction note). Regression coverage for the governed
// cancelCompanyOrder path and its boundaries.
const suffix = randomBytes(5).toString("hex");
let founder = "", ssOwner = "", accounts = "", superStockistId = "", skuId = "", bagSkuId = "", bagPackRate = 0;

describe("guarded Phase 6-9 Company Order cancellation", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    ssOwner = roleUsers.get("SUPER_STOCKIST_OWNER")!.id;
    accounts = roleUsers.get("ACCOUNTS_MANAGER")!.id;
    const partner = await prisma.seeraPartner.create({ data: { type: "SUPER_STOCKIST", code: `SS-CANCEL-${suffix}`, legalName: `Cancel Test SS ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000099" }, addresses: {}, territoryIds: [], createdById: founder } });
    superStockistId = partner.id;
    await prisma.seeraPartyUser.create({ data: { partnerId: superStockistId, userId: ssOwner, accessRole: "OWNER", createdById: founder } });
    const sku = await prisma.seeraSku.create({ data: { code: `CANCEL-SKU-${suffix}`, productName: "Cancel Test SKU", brand: "Seera", category: "TEST", packSize: 1, unitType: "kg", unitsPerCase: 1, mrp: 100, status: "ACTIVE", createdById: founder } });
    skuId = sku.id;
    await prisma.seeraPriceVersion.create({ data: { skuId, tier: "COMPANY_TO_SS", amount: 500, mrpSnapshot: 100, status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), createdById: founder } });
    // The REAL SEERA-POWDER-1KG code (needed so resolveCompanyOrderLinePricing's governed
    // COMPANY_ORDER_UNIT_OVERRIDES lookup actually resolves the real BAG(25) pack factor) — this
    // SKU may already exist in TEST DB from other fixture/seed scripts, so upsert rather than
    // create to stay safe against a unique-constraint collision, and read back whatever governed
    // price is currently active rather than assuming one.
    const bagSku = await prisma.seeraSku.upsert({ where: { code: "SEERA-POWDER-1KG" }, update: {}, create: { code: "SEERA-POWDER-1KG", productName: "Powder UOM Lifecycle Test", brand: "Seera", category: "TEST", packSize: 1, unitType: "kg", unitsPerCase: 25, mrp: 130, status: "ACTIVE", createdById: founder } });
    bagSkuId = bagSku.id;
    const existingBagPrice = await prisma.seeraPriceVersion.findFirst({ where: { skuId: bagSkuId, tier: "COMPANY_TO_SS", status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, orderBy: { effectiveFrom: "desc" } });
    if (!existingBagPrice) await prisma.seeraPriceVersion.create({ data: { skuId: bagSkuId, tier: "COMPANY_TO_SS", amount: 1165.26, mrpSnapshot: 130, status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), createdById: founder } });
    bagPackRate = Number((existingBagPrice ?? await prisma.seeraPriceVersion.findFirstOrThrow({ where: { skuId: bagSkuId, tier: "COMPANY_TO_SS", status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" } })).amount);
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

  // Per-line commercial UOM full lifecycle (Founder final policy, 25-Aug §15-22) — real end-to-end
  // proof against TEST DB, not just the pure resolveCompanyOrderLinePricing unit tests: a PCS-
  // selected line for the real SEERA-POWDER-1KG SKU is priced correctly (never x25), and the
  // physical inventory movement it produces on receipt is the exact PC count ordered — never the
  // SKU's BAG(25) factor wrongly re-applied to an already-piece-denominated line.
  it("Company Order with a PCS-selected line: correct pricing end to end, and receipt posts the exact piece count (not x25)", async () => {
    const order = await createCompanyOrder(prisma, ssOwner, superStockistId, { idempotencyKey: `uom-pcs-${suffix}`, lines: [{ skuId: bagSkuId, quantity: 4, commercialUom: "PCS" }] });
    const expectedTotal = Math.round(((bagPackRate / 25) * 4 + Number.EPSILON) * 100) / 100;
    expect(Number(order.total)).toBeCloseTo(expectedTotal, 2);
    expect(Number(order.total)).not.toBeCloseTo(bagPackRate * 4, 2); // never charges 4x the full BAG rate
    const line = order.lines[0]!;
    expect(line.schemeSnapshot).toMatchObject({ selectedUom: "PCS", packFactor: 25, canonicalPieceQuantity: 4 });

    const proof = await submitPaymentProof(prisma, ssOwner, superStockistId, { orderId: order.id, amount: Number(order.total), reference: `UOM-PCS-${suffix}`, idempotencyKey: `uom-pcs-proof-${suffix}` });
    await reviewPaymentProof(prisma, accounts, { proofId: proof.id, status: "VERIFIED", reason: "Advance verified" });
    await dispatchCompanyOrder(prisma, accounts, { orderId: order.id, idempotencyKey: `uom-pcs-dispatch-${suffix}` });
    await receiveIncomingOrder(prisma, ssOwner, { partyType: "SUPER_STOCKIST", partyId: superStockistId, orderId: order.id, lines: [{ lineId: line.id, quantity: 4 }], idempotencyKey: `uom-pcs-receive-${suffix}` });

    const movement = await prisma.seeraInventoryMovement.findFirstOrThrow({ where: { partyType: "SUPER_STOCKIST", partyId: superStockistId, skuId: bagSkuId, sourceType: "IncomingReceipt", sourceId: order.id, direction: "IN" } });
    expect(Number(movement.quantity)).toBe(4); // 4 PC received == 4 physical pieces, NOT 4*25=100
  });

  it("Company Order with the default BAG unit (no commercialUom given): unchanged behavior, receipt posts the full canonical piece count", async () => {
    const order = await createCompanyOrder(prisma, ssOwner, superStockistId, { idempotencyKey: `uom-bag-${suffix}`, lines: [{ skuId: bagSkuId, quantity: 2 }] });
    expect(Number(order.total)).toBeCloseTo(bagPackRate * 2, 2);
    const line = order.lines[0]!;
    expect(line.schemeSnapshot).toMatchObject({ selectedUom: "BAG", packFactor: 25, canonicalPieceQuantity: 50 });

    const proof = await submitPaymentProof(prisma, ssOwner, superStockistId, { orderId: order.id, amount: Number(order.total), reference: `UOM-BAG-${suffix}`, idempotencyKey: `uom-bag-proof-${suffix}` });
    await reviewPaymentProof(prisma, accounts, { proofId: proof.id, status: "VERIFIED", reason: "Advance verified" });
    await dispatchCompanyOrder(prisma, accounts, { orderId: order.id, idempotencyKey: `uom-bag-dispatch-${suffix}` });
    await receiveIncomingOrder(prisma, ssOwner, { partyType: "SUPER_STOCKIST", partyId: superStockistId, orderId: order.id, lines: [{ lineId: line.id, quantity: 2 }], idempotencyKey: `uom-bag-receive-${suffix}` });

    const movement = await prisma.seeraInventoryMovement.findFirstOrThrow({ where: { partyType: "SUPER_STOCKIST", partyId: superStockistId, skuId: bagSkuId, sourceType: "IncomingReceipt", sourceId: order.id, direction: "IN" } });
    expect(Number(movement.quantity)).toBe(50); // 2 BAG x 25 PC/BAG
  });
});
