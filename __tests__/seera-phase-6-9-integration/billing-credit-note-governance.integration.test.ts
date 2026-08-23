import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { createBillingDraft, issueBillingDraft } from "@/lib/sales-distribution/billing-service";

// Billing/Quotation Finalization (23-Aug): closes two real gaps found while resuming this pass —
// a Credit Note could previously be drafted/issued with no stated reason, and with no ceiling on
// how much it reduced an already-issued invoice by (assertWithinRemainingCredit in
// billing-service.ts). Exercises the actual Distributor-facing path (createBillingDraft/
// issueBillingDraft), not issueSystemDocument's separate Accounts-facing path already covered by
// completion.integration.test.ts's "issues approved credit note" case.
const suffix = randomBytes(5).toString("hex");
let founder = "", distributorOwner = "", executive = "", issuerId = "", retailerId = "", skuId = "", invoiceId = "";

describe("guarded Billing Credit Note governance — reason required, over-credit blocked", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    distributorOwner = roleUsers.get("DISTRIBUTOR_OWNER")!.id;
    executive = roleUsers.get("SALES_EXECUTIVE")!.id;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "seera_financial_entries", "seera_commercial_documents", "seera_document_sequences", "seera_billing_profiles", "seera_retailers", "seera_party_users", "seera_skus", "seera_partners" CASCADE');
    const issuer = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `D-${suffix}`, legalName: "Credit Note Distributor", gstin: "09ABCDE1234F1Z5", lifecycle: "ACTIVE", primaryContact: { mobile: "9000000010" }, addresses: { address: "Lucknow" }, territoryIds: [], createdById: founder } });
    issuerId = issuer.id;
    await prisma.seeraPartyUser.create({ data: { partnerId: issuer.id, userId: distributorOwner, accessRole: "OWNER", createdById: founder } });
    await prisma.seeraBillingProfile.create({ data: { ownerType: "DISTRIBUTOR", ownerId: issuer.id, legalName: "Credit Note Distributor", gstRegistered: true, gstin: "09ABCDE1234F1Z5", registeredAddress: { address: "Lucknow" }, state: "Uttar Pradesh", stateCode: "09", invoicePrefix: "CND", authorizedBilling: true, verificationStatus: "VERIFIED", verifiedById: founder, effectiveFrom: new Date("2026-01-01"), createdById: founder } });
    const retailer = await prisma.seeraRetailer.create({ data: { code: `R-${suffix}`, businessName: "Credit Note Retailer", ownerName: "Owner", mobile: `97${suffix.slice(0, 8)}`, normalizedMobile: `97${suffix.slice(0, 8)}`, address: { city: "Test" }, shopType: "GENERAL_TRADE", distributorId: issuer.id, salespersonId: executive, lifecycle: "ACTIVE", createdById: founder } });
    retailerId = retailer.id;
    const sku = await prisma.seeraSku.create({ data: { code: `SKU-${suffix}`, productName: "Test Cake", brand: "Seera", category: "Detergent", packSize: 180, unitType: "g", unitsPerCase: 40, mrp: 20, hsn: "340111", taxRate: 18, status: "ACTIVE", createdById: founder } });
    skuId = sku.id;
    const invoice = await issueBillingDraft(
      prisma,
      distributorOwner,
      (await createBillingDraft(prisma, distributorOwner, {
        type: "TAX_INVOICE",
        issuerType: "DISTRIBUTOR",
        issuerId,
        buyerType: "RETAILER",
        buyerId: retailerId,
        sourcePortal: "distributor",
        lines: [{ skuId, quantity: 100, rate: 20, taxRate: 18 }],
        idempotencyKey: `invoice-${suffix}`,
      })).id,
    );
    invoiceId = invoice.id;
  }, 240000);
  afterAll(async () => {
    await prisma.$disconnect();
  }, 240000);

  it("blocks a Credit Note draft with no stated reason", async () => {
    await expect(
      createBillingDraft(prisma, distributorOwner, {
        type: "CREDIT_NOTE",
        issuerType: "DISTRIBUTOR",
        issuerId,
        buyerType: "RETAILER",
        buyerId: retailerId,
        sourcePortal: "distributor",
        originalDocumentId: invoiceId,
        lines: [{ skuId, quantity: 5, rate: 20, taxRate: 18 }],
        idempotencyKey: `credit-noreason-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "NOTE_REASON_REQUIRED" });
  });

  it("blocks a Credit Note draft that exceeds the invoice's remaining eligible credit", async () => {
    // Invoice grand total is 100 * 20 = Rs.2000 (GST-exclusive, so grandTotal = taxable + tax).
    // A Credit Note for 200 units at the same rate is well beyond what the invoice ever billed.
    await expect(
      createBillingDraft(prisma, distributorOwner, {
        type: "CREDIT_NOTE",
        issuerType: "DISTRIBUTOR",
        issuerId,
        buyerType: "RETAILER",
        buyerId: retailerId,
        sourcePortal: "distributor",
        originalDocumentId: invoiceId,
        notes: "Damaged stock return",
        lines: [{ skuId, quantity: 200, rate: 20, taxRate: 18 }],
        idempotencyKey: `credit-over-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "CREDIT_EXCEEDS_REMAINING" });
  });

  it("issues a partial Credit Note within the remaining eligible credit, and blocks a second one for the true remainder shortfall", async () => {
    const firstNote = await issueBillingDraft(
      prisma,
      distributorOwner,
      (await createBillingDraft(prisma, distributorOwner, {
        type: "CREDIT_NOTE",
        issuerType: "DISTRIBUTOR",
        issuerId,
        buyerType: "RETAILER",
        buyerId: retailerId,
        sourcePortal: "distributor",
        originalDocumentId: invoiceId,
        notes: "Damaged stock return — partial",
        lines: [{ skuId, quantity: 60, rate: 20, taxRate: 18 }],
        idempotencyKey: `credit-partial-${suffix}`,
      })).id,
    );
    expect(firstNote.status).toBe("ISSUED");
    expect(await prisma.seeraFinancialEntry.count({ where: { documentId: firstNote.id, type: "CREDIT_NOTE", status: "POSTED" } })).toBe(1);

    // Remaining eligible credit is now 40 units' worth (100 - 60). A Credit Note for another 60 must
    // be blocked even though it would have been within bounds against the ORIGINAL invoice alone.
    await expect(
      createBillingDraft(prisma, distributorOwner, {
        type: "CREDIT_NOTE",
        issuerType: "DISTRIBUTOR",
        issuerId,
        buyerType: "RETAILER",
        buyerId: retailerId,
        sourcePortal: "distributor",
        originalDocumentId: invoiceId,
        notes: "Second return attempt",
        lines: [{ skuId, quantity: 60, rate: 20, taxRate: 18 }],
        idempotencyKey: `credit-second-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "CREDIT_EXCEEDS_REMAINING" });

    // Exactly the true remainder (40 units) must still succeed.
    const secondNote = await issueBillingDraft(
      prisma,
      distributorOwner,
      (await createBillingDraft(prisma, distributorOwner, {
        type: "CREDIT_NOTE",
        issuerType: "DISTRIBUTOR",
        issuerId,
        buyerType: "RETAILER",
        buyerId: retailerId,
        sourcePortal: "distributor",
        originalDocumentId: invoiceId,
        notes: "Damaged stock return — remainder",
        lines: [{ skuId, quantity: 40, rate: 20, taxRate: 18 }],
        idempotencyKey: `credit-remainder-${suffix}`,
      })).id,
    );
    expect(secondNote.status).toBe("ISSUED");
  });
});
