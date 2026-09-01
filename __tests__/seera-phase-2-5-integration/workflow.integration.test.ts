import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { assistedDistributorOperation, createCompanyOrder, createPriceVersion, createSku, endFieldDay, evaluateOrderCredit, fulfilRetailerOrder, placeRetailerOrder, reconcileStock, recordInventoryMovement, startFieldDay } from "@/lib/sales-distribution/workflow-service";
import { createRetailer } from "@/lib/sales-distribution/field-portal-service";
import { requirePartyMembership } from "@/lib/sales-distribution/scope";
import { syncOfflineOperation } from "@/lib/phase-11/offline-sync-service";

const suffix = randomBytes(5).toString("hex");
let founder = "", executive = "", manager = "", distributorOwner = "", superStockistOwner = "";
let skuId = "", distributorId = "", otherDistributorId = "", superStockistId = "", retailerId = "", orderId = "";

describe("guarded Phase 2-5 shared-truth integration", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    executive = roleUsers.get("SALES_EXECUTIVE")!.id; manager = roleUsers.get("SALES_MANAGER")!.id;
    distributorOwner = roleUsers.get("DISTRIBUTOR_OWNER")!.id; superStockistOwner = roleUsers.get("SUPER_STOCKIST_OWNER")!.id;
    const ss = await prisma.seeraPartner.create({ data: { type: "SUPER_STOCKIST", code: `SS-${suffix}`, legalName: "Integration Super Stockist", lifecycle: "ACTIVE", primaryContact: { mobile: "9000000001" }, addresses: { city: "Test" }, territoryIds: [], createdById: founder } });
    const distributor = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `D-${suffix}`, legalName: "Integration Distributor", lifecycle: "ACTIVE", primaryContact: { mobile: "9000000002" }, addresses: { city: "Test" }, territoryIds: [], assignedSuperStockistId: ss.id, createdById: founder } });
    const other = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `DX-${suffix}`, legalName: "Other Distributor", lifecycle: "ACTIVE", primaryContact: { mobile: "9000000003" }, addresses: { city: "Test" }, territoryIds: [], assignedSuperStockistId: ss.id, createdById: founder } });
    superStockistId = ss.id; distributorId = distributor.id; otherDistributorId = other.id;
    await prisma.seeraPartyUser.createMany({ data: [{ partnerId: ss.id, userId: superStockistOwner, accessRole: "OWNER", createdById: founder }, { partnerId: distributor.id, userId: distributorOwner, accessRole: "OWNER", createdById: founder }] });
    const retailer = await prisma.seeraRetailer.create({ data: { code: `R-${suffix}`, businessName: "Integration Retailer", ownerName: "Owner", mobile: `98${suffix.slice(0, 8)}`, normalizedMobile: `98${suffix.slice(0, 8)}`, address: { city: "Test" }, shopType: "GENERAL_TRADE", distributorId, salespersonId: executive, lifecycle: "ACTIVE", createdById: founder } });
    retailerId = retailer.id;
    await prisma.seeraCreditTerm.create({ data: { distributorId, creditEnabled: true, creditLimit: 100000, creditDays: 15, warningThreshold: 80000, blockThreshold: 100000, graceEnabled: true, graceDays: 5, effectiveFrom: new Date("2026-01-01"), changeReason: "Integration baseline", createdById: founder } });
  }, 240000);

  afterAll(async () => { await prisma.$executeRawUnsafe('TRUNCATE TABLE "seera_status_history", "seera_payment_promises", "seera_payment_proofs", "seera_deliveries", "seera_order_lines", "seera_sales_orders", "seera_stock_reconciliation_lines", "seera_stock_reconciliations", "seera_inventory_movements", "seera_credit_terms", "seera_party_users", "seera_retailers", "seera_prospects", "seera_assignments", "seera_joint_work", "seera_visits", "seera_work_sessions", "seera_price_versions", "seera_schemes", "seera_skus", "seera_claims", "seera_approval_items", "seera_credit_reminder_rules", "seera_geography_nodes", "seera_partners" CASCADE'); await prisma.$disconnect(); }, 240000);

  it("Phase 2 creates immutable SKU and governed price versions", async () => {
    const sku = await createSku(prisma, founder, { code: `SKU-${suffix}`, productName: "Seera Integration SKU", category: "Care", packSize: 100, unitType: "ML", unitsPerCase: 12, mrp: 199, hsn: "3304", taxRate: 18 }); skuId = sku.id;
    const price = await createPriceVersion(prisma, founder, { skuId, tier: "DISTRIBUTOR_TO_RETAILER", amount: 150, effectiveFrom: new Date("2026-01-01") });
    expect(price.mrpSnapshot.toString()).toBe("199");
    await expect(createPriceVersion(prisma, founder, { skuId, tier: "DISTRIBUTOR_TO_RETAILER", amount: 155, effectiveFrom: new Date("2026-06-01") })).rejects.toMatchObject({ code: "PRICE_VERSION_OVERLAP" });
  });

  it("Phase 3 governs one field day and snapshot order submission", async () => {
    const day = await startFieldDay(prisma, executive, { employeeRole: "SALES_EXECUTIVE", workingType: "Retailing" });
    await expect(startFieldDay(prisma, executive, { employeeRole: "SALES_EXECUTIVE", workingType: "Retailing" })).rejects.toMatchObject({ code: "ACTIVE_WORKDAY_EXISTS" });
    const order = await placeRetailerOrder(prisma, { actorId: executive, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributorId }, { retailerId, idempotencyKey: `order-${suffix}`, lines: [{ skuId, quantity: 4 }] });
    orderId = order.id; expect(order.lines[0]?.priceSnapshot.toString()).toBe("150"); expect(order.status).toBe("SUBMITTED");
    await endFieldDay(prisma, executive, day.id, { outcome: "COMPLETED" });
  });

  it("Phase 4 scopes and partially fulfils the same retailer order", async () => {
    const line = await prisma.seeraOrderLine.findFirstOrThrow({ where: { orderId } });
    const order = await fulfilRetailerOrder(prisma, distributorOwner, distributorId, { orderId, action: "PARTIAL_ACCEPT", accepted: [{ lineId: line.id, quantity: 3 }], reason: "One unit unavailable" });
    expect(order.status).toBe("PARTIAL_ACCEPTED"); expect(order.lines[0]?.acceptedQuantity.toString()).toBe("3");
    await expect(requirePartyMembership(prisma, distributorOwner, otherDistributorId, "DISTRIBUTOR")).rejects.toMatchObject({ code: "PARTY_SCOPE_DENIED" });
  });

  it("Phase 4 movement stock and reconciliation remain traceable", async () => {
    await recordInventoryMovement(prisma, distributorOwner, { partyType: "DISTRIBUTOR", partyId: distributorId, skuId, type: "OPENING", direction: "IN", quantity: 10, sourceType: "OPENING", sourceId: suffix, sourcePortal: "distributor", reason: "Opening count", idempotencyKey: `opening-${suffix}` });
    const reconciliation = await reconcileStock(prisma, distributorOwner, { partyType: "DISTRIBUTOR", partyId: distributorId, periodEnd: new Date("2026-08-31"), sourcePortal: "distributor", reason: "Month end", idempotencyKey: `recon-${suffix}`, lines: [{ skuId, opening: 10, receipts: 0, issues: 0, physicalClosing: 9, reason: "One off-system issue" }] });
    expect(reconciliation.lines[0]?.variance.toString()).toBe("-1");
  });

  it("Phase 5 enforces distributor credit and company advance", async () => {
    expect((await evaluateOrderCredit(prisma, distributorId, 1000, new Date("2026-08-08"))).decision).toBe("ALLOW");
    // createCompanyOrder now prices from real, governed SKU lines (never an arbitrary caller-supplied
    // subtotal) so the company advance order carries the same canonical, non-invented pricing every
    // other order type uses — this SKU needs its own COMPANY_TO_SS price version, separate from the
    // DISTRIBUTOR_TO_RETAILER one created in "Phase 2", before it can be ordered at this tier.
    await createPriceVersion(prisma, founder, { skuId, tier: "COMPANY_TO_SS", amount: 100, effectiveFrom: new Date("2026-01-01") });
    const companyOrder = await createCompanyOrder(prisma, superStockistOwner, superStockistId, { idempotencyKey: `company-${suffix}`, lines: [{ skuId, quantity: 5 }] });
    expect(companyOrder.contractualCreditDays).toBe(0); expect(companyOrder.status).toBe("SUBMITTED"); expect(companyOrder.financialAcceptance).toBe(false);
  });

  it("manager assisted operation preserves actor and commercial party", async () => {
    const assisted = await assistedDistributorOperation(prisma, manager, { distributorId, reason: "Distributor requested operational help", idempotencyKey: `assist-${suffix}`, subtotal: 2500 });
    expect(assisted.actorId).toBe(manager); expect(assisted.commercialPartyId).toBe(distributorId); expect(assisted.onBehalfOfPartyId).toBe(distributorId); expect(assisted.financialAcceptance).toBe(false);
  });

  it("persists per-user English to Hindi and Hindi to English preference", async () => {
    expect((await prisma.user.update({ where: { id: executive }, data: { preferredLanguage: "HI" } })).preferredLanguage).toBe("HI");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: executive } })).preferredLanguage).toBe("HI");
    expect((await prisma.user.update({ where: { id: executive }, data: { preferredLanguage: "EN" } })).preferredLanguage).toBe("EN");
  });

  it("createRetailer rejects an explicit distributorId outside the Executive's authorized scope (never trust a client-supplied Partner ID)", async () => {
    await expect(
      createRetailer(prisma, executive, {
        businessName: `Cross-Network Retailer ${suffix}`,
        address: { city: "Test" },
        distributorId: otherDistributorId,
        idempotencyKey: `xnet-retailer-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "DISTRIBUTOR_NOT_AUTHORIZED" });
    expect(await prisma.seeraRetailer.count({ where: { distributorId: otherDistributorId } })).toBe(0);
  });

  it("createRetailer accepts an explicit distributorId that IS in the Executive's authorized scope", async () => {
    const created = await createRetailer(prisma, executive, {
      businessName: `Own-Network Retailer ${suffix}`,
      address: { city: "Test" },
      distributorId,
      idempotencyKey: `ownnet-retailer-${suffix}`,
    });
    expect(created.distributorId).toBe(distributorId);
  });

  it("createRetailer duplicate detection catches a GSTIN match even with a different name/mobile (never only mobile+name)", async () => {
    const gstin = `09GSTX${suffix.slice(0, 9).toUpperCase()}Z5`;
    await createRetailer(prisma, executive, {
      businessName: `GSTIN Original ${suffix}`,
      address: { city: "Test" },
      distributorId,
      gstin,
      idempotencyKey: `gstin-original-${suffix}`,
    });
    await expect(
      createRetailer(prisma, executive, {
        businessName: `Completely Different Name ${suffix}`,
        mobile: "9999999999",
        address: { city: "Test" },
        distributorId,
        gstin,
        idempotencyKey: `gstin-duplicate-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "SIMILAR_RETAILER_EXISTS" });
  });

// Offline ORDER_DRAFT vs. work-session lifecycle (Part 3 audit, Founder-flagged critical issue):
// the sync dispatcher used to hardcode sessionActive:true for ORDER_DRAFT instead of re-checking
// the originating WorkSession at replay time, unlike VISIT_DRAFT right next to it in the same
// file, which already re-checks. Fixed in lib/phase-11/offline-sync-service.ts. These tests prove
// a stale/ended session can no longer silently become an authoritative order.
describe("offline ORDER_DRAFT replay vs. session/master-data lifecycle", () => {
  let session2 = "", visit2 = "";

  async function freshActiveVisit() {
    const session = await startFieldDay(prisma, executive, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: distributorId });
    const visit = await prisma.seeraVisit.create({ data: { workSessionId: session.id, retailerId, checkedInAt: new Date(), idempotencyKey: `offline-visit-${randomBytes(5).toString("hex")}` } });
    return { sessionId: session.id, visitId: visit.id };
  }
  function orderPayload(visitId: string, overrides: Record<string, unknown> = {}) {
    return { retailerId, commercialPartyId: distributorId, lines: [{ skuId, quantity: 1 }], visitId, ...overrides };
  }
  function offlineInput(clientOperationId: string, payload: Record<string, unknown>) {
    return {
      clientOperationId,
      deviceId: "test-device-00000001",
      sessionContext: { sessionId: "s1", appVersion: "1.0.0", platform: "android" },
      entityType: "SeeraSalesOrder",
      actionType: "ORDER_DRAFT" as const,
      localCreatedAt: new Date(),
      payloadVersion: 1 as const,
      payload,
    };
  }

  beforeAll(async () => {
    const s = await freshActiveVisit();
    session2 = s.sessionId;
    visit2 = s.visitId;
  }, 60000);

  it("1. offline order while session ACTIVE syncs successfully", async () => {
    const key = randomUUID();
    const result = await syncOfflineOperation(prisma, executive, offlineInput(key, orderPayload(visit2, { idempotencyKey: `off-order-${key}` })));
    expect(result.status).toBe("SYNCED");
    expect(await prisma.seeraSalesOrder.count({ where: { visitId: visit2 } })).toBe(1);
  });

  it("2/10. replaying the exact same clientOperationId multiple times never creates a second order", async () => {
    const key = randomUUID();
    const input = offlineInput(key, orderPayload(visit2, { idempotencyKey: `off-order-${key}` }));
    const first = await syncOfflineOperation(prisma, executive, input);
    const second = await syncOfflineOperation(prisma, executive, input);
    const third = await syncOfflineOperation(prisma, executive, input);
    expect(first.id).toBe(second.id);
    expect(second.id).toBe(third.id);
    expect(await prisma.seeraOfflineOperation.count({ where: { clientOperationId: key } })).toBe(1);
  });

  it("3. session ENDED before sync is deterministically rejected — zero order created", async () => {
    // A real employee can only have one ACTIVE WorkSession at a time (startFieldDay enforces this,
    // and session2 above is deliberately kept active for the other tests in this block), so this
    // scenario's "session existed, then ended" precondition is set up directly rather than via a
    // second startFieldDay/endFieldDay pair, which would collide with session2's own active state.
    const endedSession = await prisma.seeraWorkSession.create({ data: { employeeId: executive, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: distributorId, status: "ENDED", startedAt: new Date(Date.now() - 3600_000), endedAt: new Date(), outcome: "COMPLETED" } });
    const visit = await prisma.seeraVisit.create({ data: { workSessionId: endedSession.id, retailerId, checkedInAt: new Date(Date.now() - 1800_000), idempotencyKey: `offline-visit-ended-${randomBytes(5).toString("hex")}` } });
    const { id: visitId } = visit;
    const key = randomUUID();
    await expect(syncOfflineOperation(prisma, executive, offlineInput(key, orderPayload(visitId, { idempotencyKey: `off-order-${key}` })))).rejects.toMatchObject({
      conflict: { classification: "SERVER_REJECTED", code: "IDENTITY_OR_SESSION_REVOKED" },
    });
    expect(await prisma.seeraSalesOrder.count({ where: { visitId } })).toBe(0);
  });

  it("4. retailer deactivated before sync → conflict, zero order", async () => {
    await prisma.seeraRetailer.update({ where: { id: retailerId }, data: { lifecycle: "INACTIVE" } });
    const key = randomUUID();
    const before = await prisma.seeraSalesOrder.count({ where: { visitId: visit2 } });
    try {
      await expect(syncOfflineOperation(prisma, executive, offlineInput(key, orderPayload(visit2, { idempotencyKey: `off-order-${key}` })))).rejects.toMatchObject({
        conflict: { classification: "SERVER_REJECTED", code: "RETAILER_DEACTIVATED" },
      });
      expect(await prisma.seeraSalesOrder.count({ where: { visitId: visit2 } })).toBe(before);
    } finally {
      await prisma.seeraRetailer.update({ where: { id: retailerId }, data: { lifecycle: "ACTIVE" } });
    }
  });

  it("5. SKU disabled before sync → conflict, zero order", async () => {
    await prisma.seeraSku.update({ where: { id: skuId }, data: { status: "DISCONTINUED" } });
    const key = randomUUID();
    try {
      await expect(syncOfflineOperation(prisma, executive, offlineInput(key, orderPayload(visit2, { idempotencyKey: `off-order-${key}` })))).rejects.toMatchObject({
        conflict: { classification: "SERVER_REJECTED", code: "SKU_DISABLED" },
      });
    } finally {
      await prisma.seeraSku.update({ where: { id: skuId }, data: { status: "ACTIVE" } });
    }
  });

  it("6. stale client-side price snapshot → USER_REVIEW_REQUIRED, not silently repriced or silently posted", async () => {
    const key = randomUUID();
    await expect(
      syncOfflineOperation(prisma, executive, offlineInput(key, orderPayload(visit2, { idempotencyKey: `off-order-${key}`, lines: [{ skuId, quantity: 1, priceSnapshot: 1 }] }))),
    ).rejects.toMatchObject({ conflict: { classification: "USER_REVIEW_REQUIRED", code: "PRICE_CHANGED" } });
  });

  it("7. retailer's commercial-party assignment changed before sync → ASSIGNMENT_CHANGED conflict", async () => {
    const key = randomUUID();
    await expect(
      syncOfflineOperation(prisma, executive, offlineInput(key, orderPayload(visit2, { idempotencyKey: `off-order-${key}`, commercialPartyId: otherDistributorId }))),
    ).rejects.toMatchObject({ conflict: { classification: "USER_REVIEW_REQUIRED", code: "ASSIGNMENT_CHANGED" } });
  });

  it("9. a suspended/inactive user identity is rejected server-side even with a technically-open visit", async () => {
    await prisma.user.update({ where: { id: executive }, data: { status: "SUSPENDED" } });
    const key = randomUUID();
    try {
      await expect(syncOfflineOperation(prisma, executive, offlineInput(key, orderPayload(visit2, { idempotencyKey: `off-order-${key}` })))).rejects.toMatchObject({
        code: "OFFLINE_IDENTITY_REVOKED",
      });
    } finally {
      await prisma.user.update({ where: { id: executive }, data: { status: "ACTIVE" } });
    }
  });
});
});
