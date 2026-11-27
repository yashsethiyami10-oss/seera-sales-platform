import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { notifyPartyUsers, requirePartyMembership } from "./scope";
import { numberFor } from "./workflow-service";
import {
  buildLineSnapshots,
  assertLinesTaxConfigured,
  draftNumber,
  partySnapshot,
  formatAddress,
  totalsOf,
  taxSplit,
  type CommercialLineInput,
  type CommercialLineSnapshot,
} from "./document-lines";

type Db = PrismaClient | Prisma.TransactionClient;
type QuotationLineInput = CommercialLineInput;
type QuotationLineSnapshot = CommercialLineSnapshot;

async function requireIssuerScope(db: PrismaClient, actorId: string, issuerType: string, issuerId: string) {
  if (issuerType === "DISTRIBUTOR" || issuerType === "SUPER_STOCKIST") {
    await requirePartyMembership(db, actorId, issuerId, issuerType);
    return;
  }
  // Company Quotation (Founder portal -> Finance -> Sales -> Quotations): the Company itself quotes
  // a Customer/Distributor/Super Stockist. Same gate billing-service.ts's requireIssuerScope uses
  // for a Company-issued invoice (Money Desk authority or super admin) — quoting AS the Company is
  // as sensitive as invoicing as it, never just any document:create holder.
  if (issuerType === "COMPANY" && issuerId === "COMPANY") {
    const permissions = await effectivePermissions(db, actorId);
    if (!permissions.has("money_desk:create") && !permissions.has("system:super_admin"))
      throw new FoundationError("COMPANY_ISSUER_ACCESS_DENIED", "Creating a Company quotation requires Money Desk authority", 403);
    return;
  }
  throw new FoundationError("INVALID_ISSUER_TYPE", "Quotations can only be issued by the Company, a Distributor or a Super Stockist", 400);
}

export async function createQuotationDraft(
  prisma: PrismaClient,
  actorId: string,
  input: {
    issuerType: "DISTRIBUTOR" | "SUPER_STOCKIST" | "COMPANY";
    issuerId: string;
    buyerType: "RETAILER" | "DISTRIBUTOR" | "SUPER_STOCKIST";
    buyerId: string;
    sourcePortal: string;
    validUntil?: Date;
    paymentTerms?: string;
    notes?: string;
    lines: QuotationLineInput[];
    idempotencyKey: string;
  },
) {
  await authorize(prisma, { actorId, permission: "document:create" });
  await requireIssuerScope(prisma, actorId, input.issuerType, input.issuerId);
  const existing = await prisma.seeraCommercialDocument.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  // Founder rule (P0 21-Aug): a Distributor/Super Stockist quotation's entered rate is ALWAYS the
  // final GST-inclusive selling price — never brand-dependent, never a pre-tax base the system adds
  // GST on top of. Forced here (not left to the brand-based default) since production data proved
  // every non-MUV-branded SKU (Seera/Yuva/Shine Plus — the actual detergent lines this portal
  // quotes) was silently using the GST-exclusive path and inflating the final amount.
  const lines = await buildLineSnapshots(prisma, input.lines, { enforceTax: false, forcePriceMode: "GST_INCLUSIVE" });
  const totals = totalsOf(lines);
  const [issuerSnapshot, buyerSnapshot] = await Promise.all([
    partySnapshot(prisma, input.issuerType, input.issuerId),
    partySnapshot(prisma, input.buyerType, input.buyerId),
  ]);
  const split = taxSplit(issuerSnapshot.gstin, buyerSnapshot.gstin, totals.taxTotal);
  const created = await prisma.seeraCommercialDocument.create({
    data: {
      documentNumber: draftNumber(input.idempotencyKey),
      type: "QUOTATION_DOCUMENT",
      source: "SYSTEM_GENERATED",
      status: "DRAFT",
      issuerType: input.issuerType,
      issuerId: input.issuerId,
      buyerType: input.buyerType,
      buyerId: input.buyerId,
      actorId,
      sourcePortal: input.sourcePortal,
      issuerSnapshot,
      buyerSnapshot,
      supplySnapshot: { channel: input.sourcePortal, notes: input.notes },
      lineSnapshot: lines as unknown as Prisma.InputJsonValue,
      taxSnapshot: {},
      subtotal: totals.subtotal,
      taxableTotal: totals.taxableTotal,
      cgstTotal: split.cgst,
      sgstTotal: split.sgst,
      igstTotal: split.igst,
      grandTotal: totals.grandTotal,
      validUntil: input.validUntil,
      paymentTermsSnapshot: input.paymentTerms ? { text: input.paymentTerms } : undefined,
      verificationStatus: "PENDING",
      idempotencyKey: input.idempotencyKey,
    },
  });
  await recordAudit(prisma, {
    actorId,
    action: "quotation.drafted",
    entityType: "SeeraCommercialDocument",
    entityId: created.id,
    afterState: { grandTotal: totals.grandTotal },
  });
  return created;
}

async function loadOwnedDraft(db: Db, quotationId: string) {
  const document = await db.seeraCommercialDocument.findFirst({
    where: { id: quotationId, type: "QUOTATION_DOCUMENT" },
  });
  if (!document)
    throw new FoundationError("QUOTATION_NOT_FOUND", "Quotation not found", 404);
  return document;
}

export async function updateQuotationDraft(
  prisma: PrismaClient,
  actorId: string,
  quotationId: string,
  input: {
    validUntil?: Date;
    paymentTerms?: string;
    notes?: string;
    lines: QuotationLineInput[];
  },
) {
  await authorize(prisma, { actorId, permission: "document:create" });
  const document = await loadOwnedDraft(prisma, quotationId);
  await requireIssuerScope(prisma, actorId, document.issuerType, document.issuerId);
  if (document.status !== "DRAFT")
    throw new FoundationError("QUOTATION_NOT_DRAFT", "Only a draft quotation can be edited", 409);
  // Same forced GST-inclusive rule as createQuotationDraft above — see its comment.
  const lines = await buildLineSnapshots(prisma, input.lines, { enforceTax: false, forcePriceMode: "GST_INCLUSIVE" });
  const totals = totalsOf(lines);
  const issuerGstin = (document.issuerSnapshot as { gstin?: string } | null)?.gstin;
  const buyerGstin = (document.buyerSnapshot as { gstin?: string } | null)?.gstin;
  const split = taxSplit(issuerGstin, buyerGstin, totals.taxTotal);
  const updated = await prisma.seeraCommercialDocument.update({
    where: { id: quotationId },
    data: {
      lineSnapshot: lines as unknown as Prisma.InputJsonValue,
      supplySnapshot: { channel: document.sourcePortal, notes: input.notes },
      subtotal: totals.subtotal,
      taxableTotal: totals.taxableTotal,
      cgstTotal: split.cgst,
      sgstTotal: split.sgst,
      igstTotal: split.igst,
      grandTotal: totals.grandTotal,
      validUntil: input.validUntil,
      paymentTermsSnapshot: input.paymentTerms ? { text: input.paymentTerms } : undefined,
    },
  });
  await recordAudit(prisma, {
    actorId,
    action: "quotation.draft_updated",
    entityType: "SeeraCommercialDocument",
    entityId: quotationId,
    afterState: { grandTotal: totals.grandTotal },
  });
  return updated;
}

export async function issueQuotation(prisma: PrismaClient, actorId: string, quotationId: string) {
  await authorize(prisma, { actorId, permission: "document:issue" });
  const document = await loadOwnedDraft(prisma, quotationId);
  await requireIssuerScope(prisma, actorId, document.issuerType, document.issuerId);
  if (document.status !== "DRAFT")
    throw new FoundationError("QUOTATION_NOT_DRAFT", "Only a draft quotation can be issued", 409);
  assertLinesTaxConfigured(document.lineSnapshot as unknown as QuotationLineSnapshot[]);
  const now = new Date();
  const profile = await prisma.seeraBillingProfile.findFirst({
    where: {
      ownerType: document.issuerType,
      ownerId: document.issuerId,
      authorizedBilling: true,
      verificationStatus: "VERIFIED",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!profile)
    throw new FoundationError(
      "VERIFIED_BILLING_PROFILE_REQUIRED",
      document.issuerType === "COMPANY"
        ? "Company Profile is not set up yet — fill it once under Finance → More → Settings → Company Profile, then issue the quotation"
        : "A verified issuer billing profile is required to issue a quotation",
      409,
    );
  return prisma.$transaction(async (tx) => {
    const fy = (() => {
      const y = now.getUTCFullYear();
      const start = now.getUTCMonth() < 3 ? y - 1 : y;
      return `${start}-${String(start + 1).slice(-2)}`;
    })();
    const sequence = await tx.seeraDocumentSequence.upsert({
      where: {
        issuerType_issuerId_documentType_financialYear: {
          issuerType: document.issuerType,
          issuerId: document.issuerId,
          documentType: "QUOTATION_DOCUMENT",
          financialYear: fy,
        },
      },
      create: {
        issuerType: document.issuerType,
        issuerId: document.issuerId,
        documentType: "QUOTATION_DOCUMENT",
        financialYear: fy,
        prefix: profile.invoicePrefix,
        nextNumber: 2n,
      },
      update: { nextNumber: { increment: 1 } },
    });
    const used = sequence.nextNumber - 1n;
    const documentNumber = `${sequence.prefix}/QT/${fy}/${used.toString().padStart(5, "0")}`;
    const updated = await tx.seeraCommercialDocument.update({
      where: { id: quotationId },
      data: {
        documentNumber,
        status: "ISSUED",
        // Final Master Revision (Part 6, 22-Aug) fix: was JSON.stringify(profile.registeredAddress)
        // — raw JSON dumped straight into the PDF's address line. formatAddress() is the same
        // governed formatter partySnapshot() uses for the buyer at draft time.
        issuerSnapshot: (() => {
          const contact = profile.contact as { ownerName?: string; mobile?: string } | null;
          return {
            legalName: profile.legalName,
            tradeName: profile.tradeName ?? undefined,
            gstin: profile.gstin ?? undefined,
            address: formatAddress(profile.registeredAddress),
            state: profile.state,
            stateCode: profile.stateCode,
            contactName: contact?.ownerName ?? undefined,
            mobile: contact?.mobile ?? undefined,
          };
        })(),
        issueDate: now,
        issuedAt: now,
        verificationStatus: "VERIFIED",
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "quotation.issued",
      entityType: "SeeraCommercialDocument",
      entityId: quotationId,
      afterState: { documentNumber },
    });
    if (document.issuerType !== "COMPANY") await notifyPartyUsers(
      tx,
      document.issuerId,
      {
        title: "Quotation issued",
        body: `Quotation ${documentNumber} was issued.`,
        entityType: "SeeraCommercialDocument",
        entityId: quotationId,
        actionPath: `/portal/${document.issuerType === "DISTRIBUTOR" ? "distributor" : "super-stockist"}/quotations`,
      },
    );
    return updated;
  });
}

export async function recordQuotationResponse(
  prisma: PrismaClient,
  actorId: string,
  quotationId: string,
  input: { decision: "ACCEPTED" | "REJECTED"; reason?: string },
) {
  await authorize(prisma, { actorId, permission: "document:issue" });
  const document = await loadOwnedDraft(prisma, quotationId);
  await requireIssuerScope(prisma, actorId, document.issuerType, document.issuerId);
  if (document.status !== "ISSUED")
    throw new FoundationError("QUOTATION_NOT_ISSUED", "Only an issued quotation can be decided", 409);
  if (document.validUntil && document.validUntil < new Date())
    throw new FoundationError("QUOTATION_EXPIRED", "This quotation has already expired", 409);
  const updated = await prisma.seeraCommercialDocument.update({
    where: { id: quotationId },
    data: { status: input.decision, respondedAt: new Date(), responseReason: input.reason },
  });
  await recordAudit(prisma, {
    actorId,
    action: "quotation.responded",
    entityType: "SeeraCommercialDocument",
    entityId: quotationId,
    afterState: { decision: input.decision, reason: input.reason ?? null },
  });
  return updated;
}

export async function expireQuotation(prisma: PrismaClient, actorId: string, quotationId: string) {
  await authorize(prisma, { actorId, permission: "document:issue" });
  const document = await loadOwnedDraft(prisma, quotationId);
  await requireIssuerScope(prisma, actorId, document.issuerType, document.issuerId);
  if (document.status !== "ISSUED")
    throw new FoundationError("QUOTATION_NOT_ISSUED", "Only an issued quotation can be expired", 409);
  const updated = await prisma.seeraCommercialDocument.update({
    where: { id: quotationId },
    data: { status: "EXPIRED", respondedAt: new Date(), responseReason: "Expired" },
  });
  await recordAudit(prisma, {
    actorId,
    action: "quotation.expired",
    entityType: "SeeraCommercialDocument",
    entityId: quotationId,
  });
  return updated;
}

export async function duplicateQuotation(
  prisma: PrismaClient,
  actorId: string,
  quotationId: string,
  idempotencyKey: string,
) {
  await authorize(prisma, { actorId, permission: "document:create" });
  const source = await loadOwnedDraft(prisma, quotationId);
  await requireIssuerScope(prisma, actorId, source.issuerType, source.issuerId);
  const existing = await prisma.seeraCommercialDocument.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  const created = await prisma.seeraCommercialDocument.create({
    data: {
      documentNumber: draftNumber(idempotencyKey),
      type: "QUOTATION_DOCUMENT",
      source: "SYSTEM_GENERATED",
      status: "DRAFT",
      issuerType: source.issuerType,
      issuerId: source.issuerId,
      buyerType: source.buyerType,
      buyerId: source.buyerId,
      actorId,
      sourcePortal: source.sourcePortal,
      issuerSnapshot: source.issuerSnapshot as Prisma.InputJsonValue,
      buyerSnapshot: source.buyerSnapshot as Prisma.InputJsonValue,
      supplySnapshot: source.supplySnapshot as Prisma.InputJsonValue,
      lineSnapshot: source.lineSnapshot as Prisma.InputJsonValue,
      taxSnapshot: {},
      subtotal: source.subtotal,
      taxableTotal: source.taxableTotal,
      cgstTotal: source.cgstTotal,
      sgstTotal: source.sgstTotal,
      igstTotal: source.igstTotal,
      grandTotal: source.grandTotal,
      paymentTermsSnapshot: source.paymentTermsSnapshot as Prisma.InputJsonValue | undefined,
      verificationStatus: "PENDING",
      duplicatedFromId: source.id,
      idempotencyKey,
    },
  });
  await recordAudit(prisma, {
    actorId,
    action: "quotation.duplicated",
    entityType: "SeeraCommercialDocument",
    entityId: created.id,
    afterState: { duplicatedFromId: source.id },
  });
  return created;
}

export async function convertQuotationToOrder(
  prisma: PrismaClient,
  actorId: string,
  quotationId: string,
  idempotencyKey: string,
) {
  await authorize(prisma, { actorId, permission: "document:issue" });
  const document = await loadOwnedDraft(prisma, quotationId);
  await requireIssuerScope(prisma, actorId, document.issuerType, document.issuerId);
  // Retry-safety (Billing/Quotation Finalization, 23-Aug): a retry after the FIRST conversion already
  // succeeded must return that SAME order, not an error — a network retry or double submit must never
  // read as a failure once the quotation is genuinely already converted. MUST run before the status
  // check below: a successful conversion moves status to CONVERTED (not ACCEPTED), so if this ran
  // after that check, every retry would hit QUOTATION_NOT_ACCEPTED first and this branch could never
  // be reached at all — caught live (23-Aug UAT) when a real retry against an already-converted
  // quotation returned QUOTATION_NOT_ACCEPTED instead of the existing order.
  if (document.convertedOrderId) {
    const existingOrder = await prisma.seeraSalesOrder.findUnique({ where: { id: document.convertedOrderId } });
    if (existingOrder) return existingOrder;
    throw new FoundationError("QUOTATION_ALREADY_CONVERTED", "This quotation was already converted", 409);
  }
  if (document.issuerType === "COMPANY")
    throw new FoundationError("COMPANY_QUOTATION_CONVERT_VIA_INVOICE", "A Company quotation is converted by creating an invoice from it (Finance → Sales → Quotations → Create invoice)", 409);
  if (document.status !== "ACCEPTED")
    throw new FoundationError("QUOTATION_NOT_ACCEPTED", "Only an accepted quotation can be converted", 409);
  if (document.validUntil && document.validUntil < new Date())
    throw new FoundationError("QUOTATION_EXPIRED", "This quotation has already expired", 409);
  const lines = document.lineSnapshot as unknown as QuotationLineSnapshot[];
  return prisma.$transaction(
    async (tx) => {
      const existingOrder = await tx.seeraSalesOrder.findUnique({ where: { idempotencyKey } });
      if (existingOrder) return existingOrder;
      const now = new Date();
      const orderLines = lines.map((line) => ({
        skuId: line.skuId,
        skuCodeSnapshot: line.skuCodeSnapshot,
        productNameSnapshot: line.productNameSnapshot,
        packSnapshot: line.packSnapshot,
        priceSnapshot: line.rate,
        mrpSnapshot: line.mrpSnapshot,
        schemeSnapshot: { discountPct: line.discountPct },
        taxSnapshot: { rate: line.taxRate },
        orderedQuantity: line.quantity,
        lineTotal: line.lineTotal,
      }));
      let order;
      if (document.buyerType === "RETAILER") {
        order = await tx.seeraSalesOrder.create({
          data: {
            orderNumber: numberFor("RQ", idempotencyKey),
            type: "RETAILER_ORDER",
            status: "SUBMITTED",
            retailerId: document.buyerId,
            sellerPartnerId: document.issuerId,
            actorId,
            commercialPartyType: "DISTRIBUTOR",
            commercialPartyId: document.issuerId,
            sourcePortal: document.sourcePortal,
            financialAcceptance: false,
            subtotal: document.subtotal,
            discountTotal: 0,
            taxTotal: document.igstTotal,
            total: document.grandTotal,
            notes: `Converted from quotation ${document.documentNumber}`,
            idempotencyKey,
            submittedAt: now,
            lines: { create: orderLines },
          },
          include: { lines: true },
        });
      } else {
        // Final Master Revision (Part 10, 22-Aug) fix: this used to hard-throw
        // CREDIT_TERMS_REQUIRED whenever the buying Distributor had no SeeraCreditTerm row
        // configured — a common real state for an informally-run/newly-onboarded Distributor —
        // which silently broke the "Convert to Order" button for exactly those cases. The Founder
        // already ruled (22-Aug, createDistributorReplenishment) that a Distributor's own
        // replenishment order must never be blocked by credit configuration/limit/overdue state;
        // this path creates the same DISTRIBUTOR_REPLENISHMENT order type and must follow the same
        // rule, not a stricter one of its own. Terms are now optional and purely informational —
        // canonicalDistributorExposure/evaluateDistributorCredit remain untouched and still govern
        // everywhere else (Distributor Credit page, S.S. accept-time credit check, Finance views).
        const distributor = await tx.seeraPartner.findFirstOrThrow({ where: { id: document.buyerId } });
        const terms = await tx.seeraCreditTerm.findFirst({
          where: {
            distributorId: document.buyerId,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: { effectiveFrom: "desc" },
        });
        order = await tx.seeraSalesOrder.create({
          data: {
            orderNumber: numberFor("DQ", idempotencyKey),
            type: "DISTRIBUTOR_REPLENISHMENT",
            status: "SUBMITTED",
            buyerPartnerId: document.buyerId,
            sellerPartnerId: document.issuerId,
            actorId,
            commercialPartyType: "DISTRIBUTOR",
            commercialPartyId: document.buyerId,
            sourcePortal: document.sourcePortal,
            financialAcceptance: true,
            subtotal: document.subtotal,
            discountTotal: 0,
            taxTotal: document.igstTotal,
            total: document.grandTotal,
            contractualCreditDays: terms?.creditDays ?? null,
            originalDueDate: terms ? new Date(now.getTime() + terms.creditDays * 86_400_000) : null,
            notes: `Converted from quotation ${document.documentNumber}`,
            idempotencyKey,
            submittedAt: now,
            lines: { create: orderLines },
          },
          include: { lines: true },
        });
        await notifyPartyUsers(tx, document.issuerId, {
          title: "Quotation converted",
          body: `${distributor.tradeName ?? distributor.legalName} order ${order.orderNumber} was created from quotation ${document.documentNumber}.`,
          entityType: "SeeraSalesOrder",
          entityId: order.id,
          actionPath: "/portal/super-stockist/distributor-orders",
        });
      }
      await tx.seeraCommercialDocument.update({
        where: { id: quotationId },
        data: { status: "CONVERTED", convertedOrderId: order.id },
      });
      await recordAudit(tx, {
        actorId,
        action: "quotation.converted",
        entityType: "SeeraCommercialDocument",
        entityId: quotationId,
        afterState: { orderId: order.id, orderNumber: order.orderNumber },
      });
      return order;
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
}

// Company Quotation -> Invoice (Founder portal, Finance -> Sales -> Quotations). A Company quotation
// is never turned into a Distributor/Retailer order (convertQuotationToOrder refuses COMPANY); the
// Founder instead creates a real Company invoice from it through the existing Create Invoice wizard
// (same billing engine, same GST/numbering/ledger), and this records the link once that invoice is
// ISSUED so the quotation shows CONVERTED with the invoice number instead of staying open forever.
export async function markCompanyQuotationInvoiced(
  prisma: PrismaClient,
  actorId: string,
  quotationId: string,
  invoiceDocumentId: string,
) {
  await authorize(prisma, { actorId, permission: "document:issue" });
  const quotation = await loadOwnedDraft(prisma, quotationId);
  if (quotation.issuerType !== "COMPANY")
    throw new FoundationError("NOT_A_COMPANY_QUOTATION", "Only a Company quotation can be marked as invoiced", 409);
  await requireIssuerScope(prisma, actorId, quotation.issuerType, quotation.issuerId);
  if (quotation.status === "CONVERTED") return quotation;
  if (quotation.status !== "ISSUED" && quotation.status !== "ACCEPTED")
    throw new FoundationError("QUOTATION_NOT_OPEN", "Only an issued or accepted quotation can be invoiced", 409);
  const invoice = await prisma.seeraCommercialDocument.findUnique({ where: { id: invoiceDocumentId } });
  if (
    !invoice ||
    invoice.issuerType !== "COMPANY" ||
    invoice.status !== "ISSUED" ||
    invoice.buyerType !== quotation.buyerType ||
    invoice.buyerId !== quotation.buyerId
  )
    throw new FoundationError("INVOICE_DOES_NOT_MATCH_QUOTATION", "The invoice must be an issued Company invoice for the same party", 409);
  const updated = await prisma.seeraCommercialDocument.update({
    where: { id: quotationId },
    data: { status: "CONVERTED", respondedAt: quotation.respondedAt ?? new Date(), responseReason: `Invoiced as ${invoice.documentNumber}` },
  });
  await recordAudit(prisma, {
    actorId,
    action: "quotation.invoiced",
    entityType: "SeeraCommercialDocument",
    entityId: quotationId,
    afterState: { invoiceId: invoice.id, invoiceNumber: invoice.documentNumber },
  });
  return updated;
}

// Read model for the Founder Finance -> Quotations list (Company-issued quotations only).
export async function listCompanyQuotations(prisma: PrismaClient, actorId: string) {
  await authorize(prisma, { actorId, permission: "document:create" });
  await requireIssuerScope(prisma, actorId, "COMPANY", "COMPANY");
  const rows = await prisma.seeraCommercialDocument.findMany({
    where: { type: "QUOTATION_DOCUMENT", issuerType: "COMPANY", issuerId: "COMPANY" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((q) => ({
    id: q.id,
    documentNumber: q.documentNumber,
    status: q.status,
    buyerType: q.buyerType,
    buyerId: q.buyerId,
    buyerName: (q.buyerSnapshot as { legalName?: string } | null)?.legalName ?? "Party",
    grandTotal: Number(q.grandTotal),
    validUntil: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : null,
    createdAt: q.createdAt.toISOString(),
    responseReason: q.responseReason,
    lines: ((q.lineSnapshot as unknown as QuotationLineSnapshot[] | null) ?? []).map((l) => ({
      skuId: l.skuId,
      productName: l.productNameSnapshot,
      quantity: Number(l.quantity),
      rate: Number(l.rate),
      discountPct: Number(l.discountPct ?? 0),
      taxRate: l.taxConfigured === false || l.taxRate == null ? null : Number(l.taxRate),
      lineTotal: Number(l.lineTotal),
    })),
  }));
}
