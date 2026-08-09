import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { assistedDistributorOperation, createCompanyOrder, createPriceVersion, createSku, endFieldDay, evaluateOrderCredit, fulfilRetailerOrder, placeRetailerOrder, reconcileStock, recordInventoryMovement, startFieldDay } from "@/lib/sales-distribution/workflow-service";
import { requirePartyMembership } from "@/lib/sales-distribution/scope";

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
    const companyOrder = await createCompanyOrder(prisma, superStockistOwner, superStockistId, { idempotencyKey: `company-${suffix}`, subtotal: 5000 });
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
});
