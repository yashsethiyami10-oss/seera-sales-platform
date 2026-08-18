import { createHash, randomBytes } from "node:crypto";
import type { FinancialEntryType, Prisma, PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { documentNumber } from "./phase6-9-rules";
import { documentPdfFilename, renderIssuedDocumentPdf, type IssuedDocumentSnapshot } from "./document-pdf";
import { taxSplit, type CommercialLineSnapshot } from "./document-lines";
import { postJournalForCompanyDocument } from "@/lib/finance/sales-integration-service";
import type { MessagingProvider } from "@/lib/messaging/types";
import { normalizeIndianMobile } from "@/lib/messaging/phone";

type Db = PrismaClient | Prisma.TransactionClient;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const financialYear = (date: Date) => { const year = date.getUTCFullYear(); const start = date.getUTCMonth() < 3 ? year - 1 : year; return `${start}-${String(start + 1).slice(-2)}`; };

async function actorPartyIds(db: PrismaClient, actorId: string) {
  const rows = await db.seeraPartyUser.findMany({ where: { userId: actorId, active: true, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, select: { partnerId: true } });
  return new Set(rows.map((row) => row.partnerId));
}

export async function canAccessDocument(db: PrismaClient, actorId: string, document: { issuerId: string; buyerId: string }) {
  const permissions = await effectivePermissions(db, actorId); if (permissions.has("system:super_admin") || permissions.has("finance_dashboard:view")) return true;
  const parties = await actorPartyIds(db, actorId); return parties.has(document.issuerId) || parties.has(document.buyerId);
}

export async function issueSystemDocument(db: PrismaClient, actorId: string, input: {
  type: "TAX_INVOICE" | "NON_TAX_INVOICE" | "PRO_FORMA_INVOICE" | "QUOTATION_DOCUMENT" | "RECEIPT" | "PAYMENT_RECEIPT" | "DELIVERY_CHALLAN" | "CREDIT_NOTE" | "DEBIT_NOTE";
  issuerType: string; issuerId: string; buyerType: string; buyerId: string; sourcePortal: string; orderId?: string; originalDocumentId?: string;
  issuerSnapshot: IssuedDocumentSnapshot["issuer"]; buyerSnapshot: IssuedDocumentSnapshot["buyer"]; supplySnapshot: Record<string, unknown>;
  lines: IssuedDocumentSnapshot["lines"]; subtotal: number; taxableTotal: number; cgstTotal: number; sgstTotal: number; igstTotal: number; grandTotal: number;
  paymentTerms?: string; notes?: string; idempotencyKey: string; approvedNote?: boolean;
}) {
  await authorize(db, { actorId, permission: "document:issue" });
  const actorPermissions = await effectivePermissions(db, actorId);
  if (!actorPermissions.has("system:super_admin") && !actorPermissions.has("finance_dashboard:view")) {
    const scopedParties = await actorPartyIds(db, actorId);
    if (!scopedParties.has(input.issuerId)) throw new FoundationError("DOCUMENT_ISSUER_SCOPE_DENIED", "You can issue documents only for your assigned business", 403);
  }
  if ((input.type === "CREDIT_NOTE" || input.type === "DEBIT_NOTE") && (!input.approvedNote || !input.originalDocumentId)) throw new FoundationError("NOTE_APPROVAL_REQUIRED", "Approved note and original invoice are required", 409);
  if (["TAX_INVOICE","NON_TAX_INVOICE","CREDIT_NOTE","DEBIT_NOTE"].includes(input.type)) await authorize(db, { actorId, permission: "ledger:post" });
  const existing = await db.seeraCommercialDocument.findUnique({ where: { idempotencyKey: input.idempotencyKey } }); if (existing) return existing;
  const profile = await db.seeraBillingProfile.findFirst({ where: { ownerType: input.issuerType, ownerId: input.issuerId, authorizedBilling: true, verificationStatus: "VERIFIED", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, orderBy: { effectiveFrom: "desc" } });
  if (!profile) throw new FoundationError("VERIFIED_BILLING_PROFILE_REQUIRED", "Verified issuer billing profile required", 409);
  if (profile.legalName !== input.issuerSnapshot.legalName || (profile.gstin ?? undefined) !== input.issuerSnapshot.gstin) throw new FoundationError("LEGAL_ISSUER_MISMATCH", "Issuer snapshot does not match verified billing profile", 409);
  const now = new Date(); const fy = financialYear(now);
  return db.$transaction(async (tx) => {
    const sequence = await tx.seeraDocumentSequence.upsert({ where: { issuerType_issuerId_documentType_financialYear: { issuerType: input.issuerType, issuerId: input.issuerId, documentType: input.type, financialYear: fy } }, create: { issuerType: input.issuerType, issuerId: input.issuerId, documentType: input.type, financialYear: fy, prefix: profile.invoicePrefix, nextNumber: 2n }, update: { nextNumber: { increment: 1 } } });
    const used = sequence.nextNumber - 1n; const number = documentNumber({ prefix: sequence.prefix, financialYear: fy, nextNumber: used, type: input.type });
    const created = await tx.seeraCommercialDocument.create({ data: { documentNumber: number, type: input.type, source: "SYSTEM_GENERATED", status: "ISSUED", issuerType: input.issuerType, issuerId: input.issuerId, buyerType: input.buyerType, buyerId: input.buyerId, actorId, sourcePortal: input.sourcePortal, orderId: input.orderId, originalDocumentId: input.originalDocumentId, issuerSnapshot: input.issuerSnapshot, buyerSnapshot: input.buyerSnapshot, supplySnapshot: input.supplySnapshot as Prisma.InputJsonValue, lineSnapshot: input.lines, taxSnapshot: { cgstTotal: input.cgstTotal, sgstTotal: input.sgstTotal, igstTotal: input.igstTotal }, subtotal: input.subtotal, taxableTotal: input.taxableTotal, cgstTotal: input.cgstTotal, sgstTotal: input.sgstTotal, igstTotal: input.igstTotal, grandTotal: input.grandTotal, issueDate: now, paymentTermsSnapshot: input.paymentTerms ? { text: input.paymentTerms } : undefined, verificationStatus: "VERIFIED", issuedAt: now, idempotencyKey: input.idempotencyKey } });
    if (["TAX_INVOICE","NON_TAX_INVOICE","CREDIT_NOTE","DEBIT_NOTE"].includes(input.type)) {
      const buyerDebit = input.type === "TAX_INVOICE" || input.type === "NON_TAX_INVOICE" || input.type === "DEBIT_NOTE"; const entryType: FinancialEntryType = input.type === "CREDIT_NOTE" ? "CREDIT_NOTE" : input.type === "DEBIT_NOTE" ? "DEBIT_NOTE" : "INVOICE";
      await tx.seeraFinancialEntry.create({ data: { entryNumber: `DOC-${createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0,16).toUpperCase()}`, type: entryType, status: "POSTED", debitPartyType: buyerDebit ? input.buyerType : input.issuerType, debitPartyId: buyerDebit ? input.buyerId : input.issuerId, creditPartyType: buyerDebit ? input.issuerType : input.buyerType, creditPartyId: buyerDebit ? input.issuerId : input.buyerId, amount: input.grandTotal, documentId: created.id, commercialSnapshot: { originalDocumentId: input.originalDocumentId, documentNumber: number, approvedNote: input.type === "CREDIT_NOTE" || input.type === "DEBIT_NOTE" }, actorId, reason: `${input.type} issuance`, idempotencyKey: `${input.idempotencyKey}:ledger`, postedAt: now } });
      // Company Finance OS GL posting (never for S.S./Distributor-issued documents —
      // see postJournalForCompanyDocument's own gate). Sits alongside the party-ledger
      // entry above, not in place of it: that entry is the network-wide commercial
      // subledger, this is the Company's own Chart-of-Accounts general ledger.
      await postJournalForCompanyDocument(tx, actorId, { id: created.id, type: input.type, issuerType: input.issuerType, taxableTotal: input.taxableTotal, cgstTotal: input.cgstTotal, sgstTotal: input.sgstTotal, igstTotal: input.igstTotal, grandTotal: input.grandTotal, issueDate: now, documentNumber: number, idempotencyKey: input.idempotencyKey });
    }
    await recordAudit(tx, { actorId, action: "document.issued", entityType: "SeeraCommercialDocument", entityId: created.id, afterState: { documentNumber: number, type: input.type, issuerId: input.issuerId, buyerId: input.buyerId, grandTotal: input.grandTotal } }); return created;
  });
}

function snapshotForPdf(document: Awaited<ReturnType<PrismaClient["seeraCommercialDocument"]["findUniqueOrThrow"]>>): IssuedDocumentSnapshot {
  const terms = document.paymentTermsSnapshot as { text?: string } | null;
  const issuerGstin = (document.issuerSnapshot as { gstin?: string } | null)?.gstin;
  const buyerGstin = (document.buyerSnapshot as { gstin?: string } | null)?.gstin;
  // Two different callers populate lineSnapshot in two different shapes: createBillingDraft/
  // createQuotationDraft (billing-service.ts/quotation-service.ts) store buildLineSnapshots'
  // CommercialLineSnapshot[] (skuId/productNameSnapshot/packSnapshot/discountPct/taxAmount/...),
  // while issueSystemDocument stores the caller-supplied lines already in the PDF renderer's own
  // DocumentLineSnapshot shape (description/hsn/unit/taxableValue/cgst/sgst/igst/total). Detect by
  // the presence of `skuId` — CommercialLineSnapshot always has it, DocumentLineSnapshot never
  // does — and only remap the former; the latter passes through as before.
  const storedLines = (document.lineSnapshot as unknown[]) ?? [];
  const lines: IssuedDocumentSnapshot["lines"] = storedLines.map((raw) => {
    if (raw && typeof raw === "object" && "skuId" in raw) {
      const line = raw as CommercialLineSnapshot;
      const split = taxSplit(issuerGstin, buyerGstin, line.taxAmount);
      return {
        description: line.productNameSnapshot,
        hsn: line.hsnSnapshot || undefined,
        quantity: line.quantity,
        unit: line.packSnapshot,
        rate: line.rate,
        discount: (line.rate * line.quantity * line.discountPct) / 100,
        taxableValue: line.taxableValue,
        cgst: split.cgst,
        sgst: split.sgst,
        igst: split.igst,
        total: line.lineTotal,
      };
    }
    return raw as IssuedDocumentSnapshot["lines"][number];
  });
  return { type: document.type, documentNumber: document.documentNumber, issueDate: (document.issueDate ?? document.issuedAt ?? document.createdAt).toISOString().slice(0, 10), issuer: document.issuerSnapshot as IssuedDocumentSnapshot["issuer"], buyer: document.buyerSnapshot as IssuedDocumentSnapshot["buyer"], orderReference: document.orderId ?? undefined, lines, subtotal: Number(document.subtotal), taxableTotal: Number(document.taxableTotal), cgstTotal: Number(document.cgstTotal), sgstTotal: Number(document.sgstTotal), igstTotal: Number(document.igstTotal), grandTotal: Number(document.grandTotal), currency: document.currency, paymentTerms: terms?.text };
}

export async function downloadDocument(db: PrismaClient, actorId: string, documentId: string) {
  await authorize(db, { actorId, permission: "document:view_scoped" }); const document = await db.seeraCommercialDocument.findUniqueOrThrow({ where: { id: documentId } });
  if (!(await canAccessDocument(db, actorId, document))) throw new FoundationError("DOCUMENT_SCOPE_DENIED", "Document scope denied", 403);
  if (document.source === "SYSTEM_GENERATED") { if (document.status === "DRAFT") throw new FoundationError("DOCUMENT_NOT_ISSUED", "Only an issued document can be rendered", 409); const bytes = await renderIssuedDocumentPdf(snapshotForPdf(document)); await recordAudit(db, { actorId, action: "document.download", entityType: "SeeraCommercialDocument", entityId: document.id }); return { bytes, mimeType: "application/pdf", filename: documentPdfFilename({ type: document.type, documentNumber: document.documentNumber }) }; }
  if (!document.externalFileId) throw new FoundationError("DOCUMENT_FILE_MISSING", "Uploaded file unavailable", 404); const file = await db.storedFile.findFirstOrThrow({ where: { id: document.externalFileId, lifecycleStatus: "ACTIVE", revokedAt: null } }); if (!file.contentBytes) throw new FoundationError("DOCUMENT_FILE_CONTENT_MISSING", "Private file content unavailable", 404); await recordAudit(db, { actorId, action: "document.download", entityType: "SeeraCommercialDocument", entityId: document.id }); return { bytes: new Uint8Array(file.contentBytes), mimeType: file.mimeType, filename: file.originalName };
}

async function recipientMobile(db: PrismaClient, recipientType: string, recipientId: string): Promise<string | null> {
  if (recipientType === "PARTNER") {
    const partner = await db.seeraPartner.findUnique({ where: { id: recipientId }, select: { primaryContact: true } });
    return (partner?.primaryContact as { mobile?: string } | null)?.mobile ?? null;
  }
  if (recipientType === "RETAILER") {
    const retailer = await db.seeraRetailer.findUnique({ where: { id: recipientId }, select: { mobile: true } });
    return retailer?.mobile ?? null;
  }
  return null;
}

/**
 * Sends the actual issued PDF as a real WhatsApp document message — not a link. Reuses
 * the exact same authorization + scope check as downloadDocument (document:view_scoped
 * + canAccessDocument), and the exact same PDF bytes downloadDocument would return, so
 * this can never expose a document a caller couldn't otherwise download.
 *
 * `getProvider` is injected (same DI pattern as dispatchRetailerCommunications in
 * retailer-communication-service.ts) rather than importing getMessagingProvider()
 * directly, keeping this file free of a hard dependency on lib/messaging/index.ts.
 * Throws DocumentSendUnsupportedError (from lib/messaging/types.ts) unchanged when the
 * active provider genuinely cannot send a raw file — callers (the API route) map that
 * specifically to a "fall back to link-share" response, never a fabricated success.
 */
export async function sendDocumentViaWhatsApp(
  db: PrismaClient,
  actorId: string,
  documentId: string,
  input: { recipientType: string; recipientId: string; getProvider: () => Pick<MessagingProvider, "sendDocument">; caption?: string },
) {
  await authorize(db, { actorId, permission: "document:share" });
  const document = await db.seeraCommercialDocument.findUniqueOrThrow({ where: { id: documentId } });
  if (!(await canAccessDocument(db, actorId, document))) throw new FoundationError("DOCUMENT_SCOPE_DENIED", "Document scope denied", 403);

  let bytes: Uint8Array, mimeType: string, filename: string;
  if (document.source === "SYSTEM_GENERATED") {
    if (document.status === "DRAFT") throw new FoundationError("DOCUMENT_NOT_ISSUED", "Only an issued document can be shared", 409);
    bytes = await renderIssuedDocumentPdf(snapshotForPdf(document));
    mimeType = "application/pdf";
    filename = documentPdfFilename({ type: document.type, documentNumber: document.documentNumber });
  } else {
    if (!document.externalFileId) throw new FoundationError("DOCUMENT_FILE_MISSING", "Uploaded file unavailable", 404);
    const file = await db.storedFile.findFirstOrThrow({ where: { id: document.externalFileId, lifecycleStatus: "ACTIVE", revokedAt: null } });
    if (!file.contentBytes) throw new FoundationError("DOCUMENT_FILE_CONTENT_MISSING", "Private file content unavailable", 404);
    bytes = new Uint8Array(file.contentBytes);
    mimeType = file.mimeType;
    filename = file.originalName;
  }

  const mobile = await recipientMobile(db, input.recipientType, input.recipientId);
  if (!mobile) throw new FoundationError("RECIPIENT_MOBILE_UNAVAILABLE", "Recipient has no mobile number on file", 409);
  // Canonical `91XXXXXXXXXX` (no `+`) — see lib/messaging/phone.ts. A stored number that
  // doesn't confidently normalize to a real Indian mobile is a governed failure, not a
  // best-effort guess sent to Meta malformed.
  const normalizedMobile = normalizeIndianMobile(mobile);
  if (!normalizedMobile) throw new FoundationError("RECIPIENT_MOBILE_INVALID", "Recipient mobile number on file is not a valid Indian mobile number", 409);

  const provider = input.getProvider();
  const result = await provider.sendDocument(normalizedMobile, {
    bytes,
    filename,
    mimeType,
    caption: input.caption ?? `${document.type.replace(/_/g, " ")} ${document.documentNumber}`,
  });
  await recordAudit(db, {
    actorId,
    action: "document.whatsapp_document_sent",
    entityType: "SeeraCommercialDocument",
    entityId: document.id,
    details: { recipientType: input.recipientType, recipientId: input.recipientId, providerMessageId: result.id },
  });
  return { sent: true as const, messageId: result.id };
}

export async function uploadManualDocument(db: PrismaClient, actorId: string, input: { documentNumber: string; type: "EXTERNAL_BILL" | "SUPPORTING_DOCUMENT" | "CLAIM_RETURN_DOCUMENT" | "PAYMENT_PROOF" | "ADJUSTMENT_DOCUMENT"; issuerType: string; issuerId: string; buyerType: string; buyerId: string; sourcePortal: string; issueDate?: Date; amount: number; gstMetadata?: Record<string, unknown>; notes?: string; originalName: string; mimeType: string; bytes: Uint8Array; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "document:upload" }); if (!input.bytes.length || input.bytes.length > 25_000_000) throw new FoundationError("INVALID_DOCUMENT_FILE", "Document file must be between 1 byte and 25 MB", 400); if (!/^(application\/pdf|image\/(png|jpeg))$/.test(input.mimeType)) throw new FoundationError("UNSUPPORTED_DOCUMENT_FILE", "Only PDF, PNG or JPEG files are supported", 400);const b=input.bytes,valid=input.mimeType==="application/pdf"?b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46:input.mimeType==="image/png"?b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47:b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;if(!valid)throw new FoundationError("DOCUMENT_SIGNATURE_MISMATCH","File content does not match its declared MIME type",400);if(/\.(exe|cmd|bat|js|html?|svg|php)(?:\.|$)/i.test(input.originalName))throw new FoundationError("MALICIOUS_DOCUMENT_EXTENSION","Executable or active-content filename denied",400);
  return db.$transaction(async (tx) => { const existing = await tx.seeraCommercialDocument.findUnique({ where: { idempotencyKey: input.idempotencyKey } }); if (existing) return existing; const sha256 = createHash("sha256").update(input.bytes).digest("hex"); const file = await tx.storedFile.create({ data: { provider: "DATABASE_PRIVATE", storageKey: `private/documents/${randomBytes(24).toString("hex")}`, originalName: input.originalName.replace(/[\\/\0<>]/g,"_"), mimeType: input.mimeType, extension: input.originalName.split(".").pop()?.toLowerCase(), sizeBytes: BigInt(input.bytes.length), sha256, classification: "LEGAL", scanStatus: "CLEAN", lifecycleStatus: "ACTIVE", entityType: "SeeraCommercialDocument", uploadedById: actorId, contentBytes: Buffer.from(input.bytes) } }); const amount = input.amount; const document = await tx.seeraCommercialDocument.create({ data: { documentNumber: input.documentNumber, type: input.type, source: "EXTERNAL_UPLOAD", status: "ISSUED", issuerType: input.issuerType, issuerId: input.issuerId, buyerType: input.buyerType, buyerId: input.buyerId, actorId, sourcePortal: input.sourcePortal, issuerSnapshot: { external: true, issuerId: input.issuerId }, buyerSnapshot: { external: true, buyerId: input.buyerId }, supplySnapshot: {}, lineSnapshot: [], taxSnapshot: input.gstMetadata as Prisma.InputJsonValue ?? {}, subtotal: amount, taxableTotal: amount, grandTotal: amount, issueDate: input.issueDate, externalFileId: file.id, verificationStatus: "PENDING", issuedAt: new Date(), idempotencyKey: input.idempotencyKey } }); await tx.storedFile.update({ where: { id: file.id }, data: { entityId: document.id } }); await recordAudit(tx, { actorId, action: "document.uploaded", entityType: "SeeraCommercialDocument", entityId: document.id, afterState: { documentNumber: input.documentNumber, fileId: file.id, sha256 } }); return document; });
}

export async function downloadValidatedShare(db: PrismaClient, grantId: string) {
  const grant = await db.seeraDocumentShareGrant.findFirst({ where: { id: grantId, revokedAt: null, expiresAt: { gt: new Date() }, accessCount: { gt: 0 } }, include: { document: true } });
  if (!grant) throw new FoundationError("SHARE_ACCESS_DENIED", "Secure share unavailable", 403);
  const document = grant.document;
  if (document.source === "SYSTEM_GENERATED") { if (document.status === "DRAFT") throw new FoundationError("DOCUMENT_NOT_ISSUED", "Only an issued document can be rendered", 409); return { bytes: await renderIssuedDocumentPdf(snapshotForPdf(document)), mimeType: "application/pdf", filename: documentPdfFilename({ type: document.type, documentNumber: document.documentNumber }) }; }
  if (!document.externalFileId) throw new FoundationError("DOCUMENT_FILE_MISSING", "Uploaded file unavailable", 404); const file = await db.storedFile.findFirstOrThrow({ where: { id: document.externalFileId, lifecycleStatus: "ACTIVE", revokedAt: null } }); if (!file.contentBytes) throw new FoundationError("DOCUMENT_FILE_CONTENT_MISSING", "Private file content unavailable", 404); return { bytes: new Uint8Array(file.contentBytes), mimeType: file.mimeType, filename: file.originalName };
}

export async function createDocumentShare(db: PrismaClient, actorId: string, documentId: string, input: { recipientType: string; recipientId: string; expiresAt: Date }) {
  await authorize(db, { actorId, permission: "document:share" }); const document = await db.seeraCommercialDocument.findUniqueOrThrow({ where: { id: documentId } }); if (!(await canAccessDocument(db, actorId, document))) throw new FoundationError("DOCUMENT_SCOPE_DENIED", "Document scope denied", 403); if (input.expiresAt <= new Date()) throw new FoundationError("INVALID_SHARE_EXPIRY", "Share expiry must be in the future", 400);
  const token = randomBytes(32).toString("base64url"); const grant = await db.seeraDocumentShareGrant.create({ data: { documentId, tokenHash: hashToken(token), recipientType: input.recipientType, recipientId: input.recipientId, createdById: actorId, expiresAt: input.expiresAt } }); await recordAudit(db, { actorId, action: "document.share.created", entityType: "SeeraDocumentShareGrant", entityId: grant.id }); return { grant, token };
}
export async function revokeDocumentShare(db: PrismaClient, actorId: string, grantId: string) { await authorize(db, { actorId, permission: "document:share" }); const grant = await db.seeraDocumentShareGrant.update({ where: { id: grantId }, data: { revokedAt: new Date(), revokedById: actorId } }); await recordAudit(db, { actorId, action: "document.share.revoked", entityType: "SeeraDocumentShareGrant", entityId: grant.id }); return grant; }
export async function useDocumentShare(db: PrismaClient, token: string, recipient: { type: string; id: string }) { const grant = await db.seeraDocumentShareGrant.findUnique({ where: { tokenHash: hashToken(token) }, include: { document: true } }); if (!grant || grant.revokedAt || grant.expiresAt <= new Date() || grant.recipientType !== recipient.type || grant.recipientId !== recipient.id) throw new FoundationError("SHARE_ACCESS_DENIED", "Secure share unavailable", 403); const updated = await db.seeraDocumentShareGrant.updateMany({ where: { id: grant.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() } }); if (updated.count !== 1) throw new FoundationError("SHARE_ACCESS_DENIED", "Secure share unavailable", 403); await recordAudit(db, { action: "document.share.accessed", entityType: "SeeraDocumentShareGrant", entityId: grant.id, details: { recipientType: recipient.type, recipientId: recipient.id } }); return { grant, document: grant.document };
}
