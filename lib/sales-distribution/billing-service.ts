import type { FinancialEntryType, Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { documentNumber } from "./phase6-9-rules";
import { requirePartyMembership } from "./scope";
import {
  buildLineSnapshots,
  draftNumber,
  partySnapshot,
  totalsOf,
  taxSplit,
  type CommercialLineInput,
} from "./document-lines";

type BillingType =
  | "TAX_INVOICE"
  | "NON_TAX_INVOICE"
  | "PRO_FORMA_INVOICE"
  | "DELIVERY_CHALLAN"
  | "RECEIPT"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE";

// Documents that move the ledger (and therefore feed credit exposure / outstanding) require a
// VERIFIED issuer billing profile before issuance. Operational documents (challan/receipt/pro
// forma) never affect the ledger, so an incomplete billing profile must not block them — nor must
// it ever block order/delivery processing, which never touches this module at all.
const LEDGER_TYPES = new Set<BillingType>(["TAX_INVOICE", "NON_TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"]);

const financialYear = (date: Date) => {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() < 3 ? year - 1 : year;
  return `${start}-${String(start + 1).slice(-2)}`;
};

// Distributor/S.S. Owners hold `document:issue` (and are already scoped to their own party by
// `requireIssuerScope` below) but not the Accounts-only `ledger:post` permission. Issuing their
// OWN tax-bearing document for their OWN scoped business is a narrower, already-authorized action
// than the general-purpose ad-hoc ledger posting `ledger:post` guards elsewhere (postLedgerEntry) —
// so this module does not require it. This intentionally does not touch rbac-catalog.ts.
async function requireIssuerScope(db: PrismaClient, actorId: string, issuerType: string, issuerId: string) {
  await authorize(db, { actorId, permission: "document:issue" });
  if (issuerType === "DISTRIBUTOR" || issuerType === "SUPER_STOCKIST")
    await requirePartyMembership(db, actorId, issuerId, issuerType);
  else throw new FoundationError("INVALID_ISSUER_TYPE", "Billing documents can only be issued by a Distributor or Super Stockist", 400);
}

async function loadOwnedDocument(db: PrismaClient, documentId: string) {
  const document = await db.seeraCommercialDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new FoundationError("DOCUMENT_NOT_FOUND", "Document not found", 404);
  return document;
}

export async function createBillingDraft(
  prisma: PrismaClient,
  actorId: string,
  input: {
    type: BillingType;
    issuerType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    issuerId: string;
    buyerType: "RETAILER" | "DISTRIBUTOR" | "SUPER_STOCKIST";
    buyerId: string;
    sourcePortal: string;
    orderId?: string;
    originalDocumentId?: string;
    paymentTerms?: string;
    notes?: string;
    lines: CommercialLineInput[];
    idempotencyKey: string;
  },
) {
  await requireIssuerScope(prisma, actorId, input.issuerType, input.issuerId);
  if ((input.type === "CREDIT_NOTE" || input.type === "DEBIT_NOTE") && !input.originalDocumentId)
    throw new FoundationError(
      "ORIGINAL_DOCUMENT_REQUIRED",
      "A Credit Note or Debit Note must reference the original document it corrects",
      400,
    );
  if (input.originalDocumentId) {
    const original = await prisma.seeraCommercialDocument.findFirst({
      where: { id: input.originalDocumentId, issuerId: input.issuerId, status: { not: "DRAFT" } },
    });
    if (!original)
      throw new FoundationError("ORIGINAL_DOCUMENT_SCOPE_DENIED", "Original document is unavailable", 403);
  }
  const existing = await prisma.seeraCommercialDocument.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const lines = await buildLineSnapshots(prisma, input.lines);
  const totals = totalsOf(lines);
  const [issuerSnapshot, buyerSnapshot] = await Promise.all([
    partySnapshot(prisma, input.issuerType, input.issuerId),
    partySnapshot(prisma, input.buyerType, input.buyerId),
  ]);
  const split = taxSplit(issuerSnapshot.gstin, buyerSnapshot.gstin, totals.taxTotal);
  const created = await prisma.seeraCommercialDocument.create({
    data: {
      documentNumber: draftNumber(input.idempotencyKey),
      type: input.type,
      source: "SYSTEM_GENERATED",
      status: "DRAFT",
      issuerType: input.issuerType,
      issuerId: input.issuerId,
      buyerType: input.buyerType,
      buyerId: input.buyerId,
      actorId,
      sourcePortal: input.sourcePortal,
      orderId: input.orderId,
      originalDocumentId: input.originalDocumentId,
      issuerSnapshot,
      buyerSnapshot,
      supplySnapshot: { channel: input.sourcePortal, notes: input.notes },
      lineSnapshot: lines as unknown as Prisma.InputJsonValue,
      taxSnapshot: {},
      subtotal: totals.subtotal,
      taxableTotal: totals.subtotal - totals.discountTotal,
      cgstTotal: split.cgst,
      sgstTotal: split.sgst,
      igstTotal: split.igst,
      grandTotal: totals.grandTotal,
      paymentTermsSnapshot: input.paymentTerms ? { text: input.paymentTerms } : undefined,
      verificationStatus: "PENDING",
      idempotencyKey: input.idempotencyKey,
    },
  });
  await recordAudit(prisma, {
    actorId,
    action: "billing.drafted",
    entityType: "SeeraCommercialDocument",
    entityId: created.id,
    afterState: { type: input.type, grandTotal: totals.grandTotal },
  });
  return created;
}

export async function updateBillingDraft(
  prisma: PrismaClient,
  actorId: string,
  documentId: string,
  input: { paymentTerms?: string; notes?: string; lines: CommercialLineInput[] },
) {
  const document = await loadOwnedDocument(prisma, documentId);
  await requireIssuerScope(prisma, actorId, document.issuerType, document.issuerId);
  if (document.status !== "DRAFT")
    throw new FoundationError("DOCUMENT_NOT_DRAFT", "Only a draft document can be edited", 409);
  const lines = await buildLineSnapshots(prisma, input.lines);
  const totals = totalsOf(lines);
  const issuerGstin = (document.issuerSnapshot as { gstin?: string } | null)?.gstin;
  const buyerGstin = (document.buyerSnapshot as { gstin?: string } | null)?.gstin;
  const split = taxSplit(issuerGstin, buyerGstin, totals.taxTotal);
  const updated = await prisma.seeraCommercialDocument.update({
    where: { id: documentId },
    data: {
      lineSnapshot: lines as unknown as Prisma.InputJsonValue,
      supplySnapshot: { channel: document.sourcePortal, notes: input.notes },
      subtotal: totals.subtotal,
      taxableTotal: totals.subtotal - totals.discountTotal,
      cgstTotal: split.cgst,
      sgstTotal: split.sgst,
      igstTotal: split.igst,
      grandTotal: totals.grandTotal,
      paymentTermsSnapshot: input.paymentTerms ? { text: input.paymentTerms } : undefined,
    },
  });
  await recordAudit(prisma, {
    actorId,
    action: "billing.draft_updated",
    entityType: "SeeraCommercialDocument",
    entityId: documentId,
    afterState: { grandTotal: totals.grandTotal },
  });
  return updated;
}

export async function issueBillingDraft(prisma: PrismaClient, actorId: string, documentId: string) {
  const document = await loadOwnedDocument(prisma, documentId);
  await requireIssuerScope(prisma, actorId, document.issuerType, document.issuerId);
  if (document.status !== "DRAFT")
    throw new FoundationError("DOCUMENT_NOT_DRAFT", "Only a draft document can be issued", 409);
  const type = document.type as BillingType;
  const now = new Date();
  let issuerSnapshot = document.issuerSnapshot as Prisma.InputJsonValue;
  let profile: Awaited<ReturnType<PrismaClient["seeraBillingProfile"]["findFirst"]>> = null;
  if (LEDGER_TYPES.has(type)) {
    profile = await prisma.seeraBillingProfile.findFirst({
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
        "A verified issuer billing profile is required to issue a tax-bearing document",
        409,
      );
    issuerSnapshot = {
      legalName: profile.legalName,
      tradeName: profile.tradeName ?? undefined,
      gstin: profile.gstin ?? undefined,
      address: JSON.stringify(profile.registeredAddress),
      state: profile.state,
      stateCode: profile.stateCode,
    } as Prisma.InputJsonValue;
  }
  return prisma.$transaction(async (tx) => {
    const fy = financialYear(now);
    const sequence = await tx.seeraDocumentSequence.upsert({
      where: {
        issuerType_issuerId_documentType_financialYear: {
          issuerType: document.issuerType,
          issuerId: document.issuerId,
          documentType: type,
          financialYear: fy,
        },
      },
      create: {
        issuerType: document.issuerType,
        issuerId: document.issuerId,
        documentType: type,
        financialYear: fy,
        prefix: profile?.invoicePrefix ?? type.slice(0, 3),
        nextNumber: 2n,
      },
      update: { nextNumber: { increment: 1 } },
    });
    const used = sequence.nextNumber - 1n;
    const number = documentNumber({ prefix: sequence.prefix, financialYear: fy, nextNumber: used, type });
    const updated = await tx.seeraCommercialDocument.update({
      where: { id: documentId },
      data: {
        documentNumber: number,
        status: "ISSUED",
        issuerSnapshot,
        issueDate: now,
        issuedAt: now,
        verificationStatus: LEDGER_TYPES.has(type) ? "VERIFIED" : document.verificationStatus,
      },
    });
    if (LEDGER_TYPES.has(type)) {
      const buyerDebit = type === "TAX_INVOICE" || type === "NON_TAX_INVOICE" || type === "DEBIT_NOTE";
      const entryType: FinancialEntryType =
        type === "CREDIT_NOTE" ? "CREDIT_NOTE" : type === "DEBIT_NOTE" ? "DEBIT_NOTE" : "INVOICE";
      await tx.seeraFinancialEntry.create({
        data: {
          entryNumber: `DOC-${number.replace(/\//g, "-")}`,
          type: entryType,
          status: "POSTED",
          debitPartyType: buyerDebit ? document.buyerType : document.issuerType,
          debitPartyId: buyerDebit ? document.buyerId : document.issuerId,
          creditPartyType: buyerDebit ? document.issuerType : document.buyerType,
          creditPartyId: buyerDebit ? document.issuerId : document.buyerId,
          amount: document.grandTotal,
          documentId: document.id,
          orderId: document.orderId ?? undefined,
          commercialSnapshot: {
            documentNumber: number,
            originalDocumentId: document.originalDocumentId,
          },
          actorId,
          reason: `${type} issuance`,
          idempotencyKey: `${document.idempotencyKey}:ledger`,
          postedAt: now,
        },
      });
    }
    await recordAudit(tx, {
      actorId,
      action: "billing.issued",
      entityType: "SeeraCommercialDocument",
      entityId: document.id,
      afterState: { documentNumber: number, type, grandTotal: document.grandTotal.toString() },
    });
    return updated;
  });
}
