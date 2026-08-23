import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { createQuotationDraft, issueQuotation, recordQuotationResponse, convertQuotationToOrder } from "@/lib/sales-distribution/quotation-service";

// Billing/Quotation Finalization (23-Aug), live UAT finding: convertQuotationToOrder's retry-safety
// branch (return the existing order instead of erroring) was added in an EARLIER pass, but placed
// AFTER the `status !== "ACCEPTED"` guard — a successful conversion moves status to CONVERTED, so
// every retry hit QUOTATION_NOT_ACCEPTED first and the retry-safety branch was dead code. Caught by
// actually clicking Convert to Order twice against a real running app, not by code review. Fixed by
// reordering: convertedOrderId is checked FIRST. This test locks that ordering in.
const suffix = randomBytes(5).toString("hex");
let founder = "", distributorOwner = "", executive = "", issuerId = "", retailerId = "", skuId = "";

describe("guarded Quote-to-Order retry-safety — exactly one order across retries", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    distributorOwner = roleUsers.get("DISTRIBUTOR_OWNER")!.id;
    executive = roleUsers.get("SALES_EXECUTIVE")!.id;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "seera_sales_orders", "seera_order_lines", "seera_commercial_documents", "seera_document_sequences", "seera_billing_profiles", "seera_retailers", "seera_party_users", "seera_skus", "seera_partners" CASCADE');
    const issuer = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `D-${suffix}`, legalName: "Convert Retry Distributor", gstin: "09ABCDE1234F1Z5", lifecycle: "ACTIVE", primaryContact: { mobile: "9000000030" }, addresses: { address: "Lucknow" }, territoryIds: [], createdById: founder } });
    issuerId = issuer.id;
    await prisma.seeraPartyUser.create({ data: { partnerId: issuer.id, userId: distributorOwner, accessRole: "OWNER", createdById: founder } });
    await prisma.seeraBillingProfile.create({ data: { ownerType: "DISTRIBUTOR", ownerId: issuer.id, legalName: "Convert Retry Distributor", gstRegistered: true, gstin: "09ABCDE1234F1Z5", registeredAddress: { address: "Lucknow" }, state: "Uttar Pradesh", stateCode: "09", invoicePrefix: "CRD", authorizedBilling: true, verificationStatus: "VERIFIED", verifiedById: founder, effectiveFrom: new Date("2026-01-01"), createdById: founder } });
    const retailer = await prisma.seeraRetailer.create({ data: { code: `R-${suffix}`, businessName: "Convert Retry Retailer", ownerName: "Owner", mobile: `96${suffix.slice(0, 8)}`, normalizedMobile: `96${suffix.slice(0, 8)}`, address: { city: "Test" }, shopType: "GENERAL_TRADE", distributorId: issuer.id, salespersonId: executive, lifecycle: "ACTIVE", createdById: founder } });
    retailerId = retailer.id;
    const sku = await prisma.seeraSku.create({ data: { code: `SKU-${suffix}`, productName: "Test Cake", brand: "Seera", category: "Detergent", packSize: 180, unitType: "g", unitsPerCase: 40, mrp: 20, hsn: "340111", taxRate: 18, status: "ACTIVE", createdById: founder } });
    skuId = sku.id;
  }, 240000);
  afterAll(async () => {
    await prisma.$disconnect();
  }, 240000);

  it("converts an accepted quotation exactly once, returning the same order on every retry", async () => {
    const draft = await createQuotationDraft(prisma, distributorOwner, {
      issuerType: "DISTRIBUTOR",
      issuerId,
      buyerType: "RETAILER",
      buyerId: retailerId,
      sourcePortal: "distributor",
      lines: [{ skuId, quantity: 10, rate: 315, taxRate: 18 }],
      idempotencyKey: `quote-draft-${suffix}`,
    });
    await issueQuotation(prisma, distributorOwner, draft.id);
    await recordQuotationResponse(prisma, distributorOwner, draft.id, { decision: "ACCEPTED" });

    const firstOrder = await convertQuotationToOrder(prisma, distributorOwner, draft.id, `convert-1-${suffix}`);
    expect(firstOrder.orderNumber).toBeTruthy();
    expect(await prisma.seeraSalesOrder.count()).toBe(1);

    // Retry with a DIFFERENT idempotency key — simulates a real client retry (new UUID each click),
    // not merely replaying the same key. Must return the SAME order, never a second one.
    const retryOrder = await convertQuotationToOrder(prisma, distributorOwner, draft.id, `convert-2-${suffix}`);
    expect(retryOrder.id).toBe(firstOrder.id);
    expect(retryOrder.orderNumber).toBe(firstOrder.orderNumber);
    expect(await prisma.seeraSalesOrder.count()).toBe(1);

    // A third retry, for good measure — must still be exactly one order.
    const thirdOrder = await convertQuotationToOrder(prisma, distributorOwner, draft.id, `convert-3-${suffix}`);
    expect(thirdOrder.id).toBe(firstOrder.id);
    expect(await prisma.seeraSalesOrder.count()).toBe(1);

    expect((await prisma.seeraCommercialDocument.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("CONVERTED");
  });
});
