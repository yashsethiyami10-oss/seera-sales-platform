import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { hashPassword } from "../../lib/foundation/auth-service";
import { createQuotationDraft, issueQuotation, recordQuotationResponse, convertQuotationToOrder, duplicateQuotation } from "../../lib/sales-distribution/quotation-service";
import { createBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";
import { createReturnRequest, decideReturnRequest } from "../../lib/sales-distribution/returns-service";

// TEST-only, additive supplement to seed-integrated-review.ts's fixture, covering entities that
// did not exist when that script was written: Beat assignment (SeeraJourneyPlan), field Visit +
// Photo, and the newer Quotation / Billing-draft / Returns-and-Damage lifecycles. Everything below
// is idempotent (upsert or "find existing, else create") and calls the REAL service functions
// (not raw inserts) so this doubles as an acceptance smoke test for those flows.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({
  intendedRole: "test",
  write: true,
  targetUrl: test,
  productionUrl: production,
  testUrl: test,
});
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });
const prefix = "IV26";

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);

  const founder = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const ssOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: `${prefix}-D-01` } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: `${prefix}-SS-01` } });
  const retailers = await db.seeraRetailer.findMany({ where: { code: { startsWith: `${prefix}-R-` } }, orderBy: { code: "asc" } });
  const skus = await db.seeraSku.findMany({ where: { code: { startsWith: `${prefix}-` } }, orderBy: { code: "asc" } });
  const beatNorth = await db.seeraGeographyNode.findUniqueOrThrow({ where: { code: `${prefix}-B-NORTH-1` } });

  // A second Distributor Owner so the Returns & Damage maker-checker demo has two distinct
  // authorized actors on the same party (the seeded fixture only had one Owner per party).
  const passwordHash = await hashPassword("SeeraReview!2026");
  const distributorOwner2 = await db.user.upsert({
    where: { normalizedEmail: "review-distributor-owner-2@seera.test" },
    update: { name: "Distributor Owner Review Two", status: "ACTIVE" },
    create: { email: "review-distributor-owner-2@seera.test", normalizedEmail: "review-distributor-owner-2@seera.test", name: "Distributor Owner Review Two", passwordHash, status: "ACTIVE", emailVerified: new Date() },
  });
  const ownerRole = await db.role.findUniqueOrThrow({ where: { code: "DISTRIBUTOR_OWNER" } });
  if (!(await db.userRoleAssignment.findFirst({ where: { userId: distributorOwner2.id, roleId: ownerRole.id, status: "ACTIVE" } })))
    await db.userRoleAssignment.create({ data: { userId: distributorOwner2.id, roleId: ownerRole.id, assignedById: founder.id, assignmentReason: "Scale-to-90 maker-checker fixture" } });
  if (!(await db.seeraPartyUser.findFirst({ where: { partnerId: distributor1.id, userId: distributorOwner2.id, active: true } })))
    await db.seeraPartyUser.create({ data: { partnerId: distributor1.id, userId: distributorOwner2.id, accessRole: "OWNER", createdById: founder.id } });

  // ---- Beat + Visit + Photo -------------------------------------------------------------
  const plan = await db.seeraJourneyPlan.upsert({
    where: {
      employeeId_dayOfWeek_geographyId_effectiveFrom: {
        employeeId: executive1.id,
        dayOfWeek: new Date().getDay(),
        geographyId: beatNorth.id,
        effectiveFrom: new Date("2026-01-01"),
      },
    },
    update: {},
    create: {
      employeeId: executive1.id,
      dayOfWeek: new Date().getDay(),
      geographyType: "BEAT",
      geographyId: beatNorth.id,
      effectiveFrom: new Date("2026-01-01"),
      ownerId: manager.id,
    },
  });

  let session = await db.seeraWorkSession.findFirst({ where: { employeeId: executive1.id, status: "ACTIVE" } });
  if (!session)
    session = await db.seeraWorkSession.create({
      data: { employeeId: executive1.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", plannedGeographyId: beatNorth.id, startedAt: new Date() },
    });

  let visit = await db.seeraVisit.findFirst({ where: { workSessionId: session.id, retailerId: retailers[0].id } });
  if (!visit)
    visit = await db.seeraVisit.create({
      data: {
        workSessionId: session.id,
        retailerId: retailers[0].id,
        sequence: 1,
        checkedInAt: new Date(),
        checkInLatitude: 19.076,
        checkInLongitude: 72.8777,
        outcome: "PRODUCTIVE",
        idempotencyKey: `${prefix}-VISIT-01`,
      },
    });

  const existingPhoto = await db.seeraVisitPhoto.findFirst({ where: { visitId: visit.id } });
  let photoFile = existingPhoto ? null : await db.storedFile.findFirst({ where: { storageKey: `${prefix}-fixture-photo` } });
  if (!existingPhoto) {
    if (!photoFile)
      photoFile = await db.storedFile.create({
        data: {
          provider: "DATABASE_PRIVATE",
          storageKey: `${prefix}-fixture-photo`,
          originalName: "shelf.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 3n,
          sha256: "0000000000000000000000000000000000000000000000000000000000000",
          classification: "FIELD_EVIDENCE",
          scanStatus: "CLEAN",
          lifecycleStatus: "ACTIVE",
          entityType: "SeeraVisitPhoto",
          uploadedById: executive1.id,
          contentBytes: Buffer.from([0xff, 0xd8, 0xff]),
        },
      });
    await db.seeraVisitPhoto.create({
      data: { visitId: visit.id, retailerId: retailers[0].id, actorId: executive1.id, photoType: "SHELF", fileId: photoFile.id, latitude: 19.076, longitude: 72.8777 },
    });
  }

  // ---- Quotation lifecycle (Distributor -> Retailer): draft, issued, accepted, converted ----
  const quoteLines = [{ skuId: skus[0].id, quantity: 12, rate: Number(skus[0].mrp) * 0.8, discountPct: 5, taxRate: 18 }];
  let quotationDraft = await db.seeraCommercialDocument.findUnique({ where: { idempotencyKey: `${prefix}-QUOTE-01` } });
  if (!quotationDraft)
    quotationDraft = await createQuotationDraft(db, distributorOwner.id, {
      issuerType: "DISTRIBUTOR",
      issuerId: distributor1.id,
      buyerType: "RETAILER",
      buyerId: retailers[1].id,
      sourcePortal: "distributor",
      validUntil: new Date(Date.now() + 30 * 86_400_000),
      paymentTerms: "Net 15",
      lines: quoteLines,
      idempotencyKey: `${prefix}-QUOTE-01`,
    });
  if (quotationDraft.status === "DRAFT") quotationDraft = await issueQuotation(db, distributorOwner.id, quotationDraft.id);
  if (quotationDraft.status === "ISSUED") quotationDraft = await recordQuotationResponse(db, distributorOwner.id, quotationDraft.id, { decision: "ACCEPTED" });
  if (quotationDraft.status === "ACCEPTED")
    await convertQuotationToOrder(db, distributorOwner.id, quotationDraft.id, `${prefix}-QUOTE-01-CONVERT`);

  // A second quotation left ISSUED (not yet responded) and one DUPLICATEd, so the review fixture
  // shows more than one lifecycle stage at once.
  let quotationTwo = await db.seeraCommercialDocument.findUnique({ where: { idempotencyKey: `${prefix}-QUOTE-02` } });
  if (!quotationTwo)
    quotationTwo = await createQuotationDraft(db, distributorOwner.id, {
      issuerType: "DISTRIBUTOR",
      issuerId: distributor1.id,
      buyerType: "RETAILER",
      buyerId: retailers[2].id,
      sourcePortal: "distributor",
      lines: quoteLines,
      idempotencyKey: `${prefix}-QUOTE-02`,
    });
  if (quotationTwo.status === "DRAFT") quotationTwo = await issueQuotation(db, distributorOwner.id, quotationTwo.id);
  if (!(await db.seeraCommercialDocument.findUnique({ where: { idempotencyKey: `${prefix}-QUOTE-02-DUP` } })))
    await duplicateQuotation(db, distributorOwner.id, quotationTwo.id, `${prefix}-QUOTE-02-DUP`);

  // ---- Billing draft lifecycle (Distributor -> Retailer): one left DRAFT, one ISSUED --------
  const billLines = [{ skuId: skus[1].id, quantity: 6, rate: Number(skus[1].mrp) * 0.82, taxRate: 18 }];
  if (!(await db.seeraCommercialDocument.findUnique({ where: { idempotencyKey: `${prefix}-BILL-DRAFT-01` } })))
    await createBillingDraft(db, distributorOwner.id, {
      type: "TAX_INVOICE",
      issuerType: "DISTRIBUTOR",
      issuerId: distributor1.id,
      buyerType: "RETAILER",
      buyerId: retailers[0].id,
      sourcePortal: "distributor",
      lines: billLines,
      idempotencyKey: `${prefix}-BILL-DRAFT-01`,
    });

  let billTwo = await db.seeraCommercialDocument.findUnique({ where: { idempotencyKey: `${prefix}-BILL-DRAFT-02` } });
  if (!billTwo)
    billTwo = await createBillingDraft(db, distributorOwner.id, {
      type: "TAX_INVOICE",
      issuerType: "DISTRIBUTOR",
      issuerId: distributor1.id,
      buyerType: "RETAILER",
      buyerId: retailers[1].id,
      sourcePortal: "distributor",
      lines: billLines,
      idempotencyKey: `${prefix}-BILL-DRAFT-02`,
    });
  if (billTwo.status === "DRAFT") await issueBillingDraft(db, distributorOwner.id, billTwo.id);

  // ---- Returns & Damage: one SUBMITTED, one APPROVED (usable, restores available stock) -----
  let returnUsable = await db.seeraReturnRequest.findUnique({ where: { idempotencyKey: `${prefix}-RETURN-01` } });
  if (!returnUsable)
    returnUsable = await createReturnRequest(db, distributorOwner.id, {
      partyType: "DISTRIBUTOR",
      partyId: distributor1.id,
      retailerId: retailers[0].id,
      skuId: skus[0].id,
      quantity: 2,
      condition: "USABLE",
      reason: "Near-expiry stock returned by retailer, still sellable",
      creditNoteRequested: true,
      sourcePortal: "distributor",
      idempotencyKey: `${prefix}-RETURN-01`,
    });
  if (returnUsable.status === "SUBMITTED")
    await decideReturnRequest(db, distributorOwner2.id, returnUsable.id, { decision: "APPROVED", reason: "Verified condition, restocked" });

  if (!(await db.seeraReturnRequest.findUnique({ where: { idempotencyKey: `${prefix}-RETURN-02` } })))
    await createReturnRequest(db, ssOwner.id, {
      partyType: "SUPER_STOCKIST",
      partyId: ss1.id,
      skuId: skus[2].id,
      quantity: 3,
      condition: "DAMAGED",
      reason: "Warehouse shelf-check found damaged cartons",
      sourcePortal: "super-stockist",
      idempotencyKey: `${prefix}-RETURN-02`,
    });

  // A third return, tied to a real PARTIAL_DELIVERED order (12 delivered of 24 ordered, none
  // returned yet) — proves the Flow-E fix: approving it must increment that order line's
  // returnedQuantity, which eligibleDelivered()/managerDeliveredSales() then reads directly, so
  // the sales-performance credit for the returned units is pulled back.
  const partialOrder = await db.seeraSalesOrder.findUniqueOrThrow({ where: { idempotencyKey: `${prefix}-ORDER-PARTIAL` } });
  const lineBefore = await db.seeraOrderLine.findFirstOrThrow({ where: { orderId: partialOrder.id } });
  let returnAgainstOrder = await db.seeraReturnRequest.findUnique({ where: { idempotencyKey: `${prefix}-RETURN-03` } });
  if (!returnAgainstOrder)
    returnAgainstOrder = await createReturnRequest(db, distributorOwner.id, {
      partyType: "DISTRIBUTOR",
      partyId: distributor1.id,
      retailerId: partialOrder.retailerId ?? undefined,
      sourceOrderId: partialOrder.id,
      skuId: lineBefore.skuId,
      quantity: 2,
      condition: "USABLE",
      reason: "Retailer returned 2 units from the partially delivered order",
      sourcePortal: "distributor",
      idempotencyKey: `${prefix}-RETURN-03`,
    });
  if (returnAgainstOrder.status === "SUBMITTED")
    await decideReturnRequest(db, distributorOwner2.id, returnAgainstOrder.id, { decision: "APPROVED", reason: "Confirmed against order, sales credit adjusted" });
  const lineAfter = await db.seeraOrderLine.findFirstOrThrow({ where: { orderId: partialOrder.id } });
  console.log(
    `[FLOW-E CHECK] order line returnedQuantity before=${lineBefore.returnedQuantity.toString()} after=${lineAfter.returnedQuantity.toString()} (expected after >= before + 2 once approved)`,
  );

  console.log(
    JSON.stringify({
      journeyPlanId: plan.id,
      workSessionId: session.id,
      visitId: visit.id,
      quotationConvertedId: quotationDraft.id,
      quotationIssuedId: quotationTwo.id,
      billingDraftId: `${prefix}-BILL-DRAFT-01`,
      billingIssuedId: billTwo.id,
      returnApprovedId: returnUsable.id,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Scale-to-90 supplement seed failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
