import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// Partner KYC documents for distributor / super stockist onboarding.
//
// Who may work a subject's KYC:
//   - PROSPECT: the prospect's own owner (any role holding prospect:create — Sales Executive,
//     Sales Manager), or anyone with network:manage (Manager, Founder/Admin) for any prospect.
//   - PARTNER (already appointed S.S. / Distributor): network:manage only.
// Every read and write re-checks this; a caller having opened the page is never assumed.

export const KYC_DOC_TYPES = [
  "GST_CERTIFICATE",
  "PAN_CARD",
  "AADHAAR_CARD",
  "CANCELLED_CHEQUE",
  "BANK_STATEMENT",
  "APPLICATION_FORM",
  "SHOP_PHOTO",
  "OTHER",
] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];
export type KycSubjectType = "PROSPECT" | "PARTNER";

// Required before a prospect can be called "KYC complete"; the rest are optional extras.
export const KYC_REQUIRED: readonly KycDocType[] = ["GST_CERTIFICATE", "PAN_CARD", "AADHAAR_CARD", "CANCELLED_CHEQUE", "APPLICATION_FORM"];

export const KYC_MAX_BYTES = 10_000_000;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export const KYC_PATTERNS = {
  gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  pan: /^[A-Z]{5}\d{4}[A-Z]$/,
  aadhaarLast4: /^\d{4}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  bankAccountNumber: /^\d{9,18}$/,
} as const;

// Magic-byte check so a renamed executable or HTML file can never be stored as a "PDF"/"photo".
export function kycFileSignatureValid(mimeType: string, b: Uint8Array) {
  if (b.length < 12) return false;
  if (mimeType === "application/pdf") return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (mimeType === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mimeType === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mimeType === "image/webp") return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return false;
}

async function subjectAccess(db: PrismaClient, actorId: string, subjectType: KycSubjectType, subjectId: string) {
  const permissions = await effectivePermissions(db, actorId);
  const admin = permissions.has("system:super_admin") || permissions.has("network:manage");
  if (subjectType === "PROSPECT") {
    const prospect = await db.seeraProspect.findUnique({ where: { id: subjectId } });
    if (!prospect) throw new FoundationError("KYC_SUBJECT_NOT_FOUND", "Prospect not found", 404);
    const owner = prospect.ownerEmployeeId === actorId && permissions.has("prospect:create");
    if (!admin && !owner) throw new FoundationError("KYC_SCOPE_DENIED", "You can only manage KYC for your own prospects", 403);
    return { name: prospect.businessName, kind: prospect.prospectType, mobile: prospect.normalizedMobile, stage: prospect.stage };
  }
  if (subjectType === "PARTNER") {
    if (!admin) throw new FoundationError("KYC_SCOPE_DENIED", "Partner KYC needs network management access", 403);
    const partner = await db.seeraPartner.findUnique({ where: { id: subjectId } });
    if (!partner) throw new FoundationError("KYC_SUBJECT_NOT_FOUND", "Partner not found", 404);
    return { name: partner.tradeName ?? partner.legalName, kind: partner.type, mobile: null as string | null, stage: partner.lifecycle };
  }
  throw new FoundationError("KYC_SUBJECT_INVALID", "Unknown KYC subject", 400);
}

async function requireAnyKycPermission(db: PrismaClient, actorId: string) {
  const permissions = await effectivePermissions(db, actorId);
  if (!["system:super_admin", "network:manage", "prospect:create"].some((p) => permissions.has(p as never)))
    throw new FoundationError("ACCESS_DENIED", "Required permission denied", 403);
  return permissions;
}

export async function listKycSubjects(db: PrismaClient, actorId: string) {
  const permissions = await requireAnyKycPermission(db, actorId);
  const admin = permissions.has("system:super_admin") || permissions.has("network:manage");
  const [prospects, partners] = await Promise.all([
    db.seeraProspect.findMany({
      where: { ...(admin ? {} : { ownerEmployeeId: actorId }), status: { not: "REJECTED" } },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: { id: true, businessName: true, prospectType: true, normalizedMobile: true, stage: true },
    }),
    admin
      ? db.seeraPartner.findMany({
          where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] }, lifecycle: { not: "CLOSED" } },
          orderBy: { updatedAt: "desc" },
          take: 150,
          select: { id: true, legalName: true, tradeName: true, type: true, code: true },
        })
      : Promise.resolve([]),
  ]);
  const ids = [...prospects.map((p) => p.id), ...partners.map((p) => p.id)];
  const docs = ids.length
    ? await db.seeraPartnerKycDocument.findMany({ where: { subjectId: { in: ids }, removedAt: null }, select: { subjectType: true, subjectId: true, docType: true } })
    : [];
  const doneTypes = new Map<string, Set<string>>();
  for (const d of docs) {
    const k = `${d.subjectType}:${d.subjectId}`;
    if (!doneTypes.has(k)) doneTypes.set(k, new Set());
    doneTypes.get(k)!.add(d.docType);
  }
  const requiredDone = (k: string) => KYC_REQUIRED.filter((t) => doneTypes.get(k)?.has(t)).length;
  return [
    ...prospects.map((p) => ({
      subjectType: "PROSPECT" as const,
      subjectId: p.id,
      name: p.businessName,
      kind: p.prospectType,
      meta: `${p.normalizedMobile} · ${p.stage}`,
      requiredDone: requiredDone(`PROSPECT:${p.id}`),
      requiredTotal: KYC_REQUIRED.length,
    })),
    ...partners.map((p) => ({
      subjectType: "PARTNER" as const,
      subjectId: p.id,
      name: p.tradeName ?? p.legalName,
      kind: p.type,
      meta: p.code,
      requiredDone: requiredDone(`PARTNER:${p.id}`),
      requiredTotal: KYC_REQUIRED.length,
    })),
  ];
}

export async function getKycSubject(db: PrismaClient, actorId: string, subjectType: KycSubjectType, subjectId: string) {
  const subject = await subjectAccess(db, actorId, subjectType, subjectId);
  const [documents, details] = await Promise.all([
    db.seeraPartnerKycDocument.findMany({
      where: { subjectType, subjectId, removedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, docType: true, originalName: true, mimeType: true, sizeBytes: true, note: true, createdAt: true, uploadedById: true },
    }),
    db.seeraPartnerKycDetails.findUnique({ where: { subjectType_subjectId: { subjectType, subjectId } } }),
  ]);
  return {
    subjectType,
    subjectId,
    ...subject,
    documents: documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    details: details
      ? {
          gstin: details.gstin,
          pan: details.pan,
          aadhaarLast4: details.aadhaarLast4,
          bankAccountName: details.bankAccountName,
          bankAccountNumber: details.bankAccountNumber,
          ifsc: details.ifsc,
          bankName: details.bankName,
        }
      : null,
  };
}

export async function uploadKycDocument(
  db: PrismaClient,
  actorId: string,
  input: { subjectType: KycSubjectType; subjectId: string; docType: KycDocType; originalName: string; mimeType: string; bytes: Uint8Array; note?: string },
) {
  await subjectAccess(db, actorId, input.subjectType, input.subjectId);
  if (!KYC_DOC_TYPES.includes(input.docType)) throw new FoundationError("KYC_DOC_TYPE_INVALID", "Unknown document type", 400);
  if (!input.bytes.length || input.bytes.length > KYC_MAX_BYTES)
    throw new FoundationError("KYC_FILE_SIZE", "File must be between 1 byte and 10 MB", 400);
  const mimeType = input.mimeType === "image/jpg" ? "image/jpeg" : input.mimeType;
  if (!ALLOWED_MIME.has(mimeType)) throw new FoundationError("KYC_FILE_TYPE", "Only a photo (JPG, PNG, WEBP) or a PDF can be uploaded", 400);
  if (!kycFileSignatureValid(mimeType, input.bytes))
    throw new FoundationError("KYC_FILE_SIGNATURE_MISMATCH", "File content does not match its type — please retake the photo or re-save the PDF", 400);
  const originalName = (input.originalName || "document").replace(/[\\/\0<>"']/g, "_").slice(0, 160);
  if (/\.(exe|cmd|bat|js|html?|svg|php|sh)(?:\.|$)/i.test(originalName))
    throw new FoundationError("KYC_FILE_EXTENSION_DENIED", "Executable or active-content filename denied", 400);
  return db.$transaction(async (tx) => {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const file = await tx.storedFile.create({
      data: {
        provider: "DATABASE_PRIVATE",
        storageKey: `private/partner-kyc/${randomBytes(24).toString("hex")}`,
        originalName,
        mimeType,
        extension: originalName.includes(".") ? originalName.split(".").pop()?.toLowerCase() : mimeType.split("/")[1],
        sizeBytes: BigInt(input.bytes.length),
        sha256,
        classification: "IDENTITY",
        scanStatus: "CLEAN",
        lifecycleStatus: "ACTIVE",
        entityType: "SeeraPartnerKycDocument",
        uploadedById: actorId,
        contentBytes: Buffer.from(input.bytes),
      },
    });
    const doc = await tx.seeraPartnerKycDocument.create({
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        docType: input.docType,
        fileId: file.id,
        originalName,
        mimeType,
        sizeBytes: input.bytes.length,
        note: input.note?.trim().slice(0, 500) || undefined,
        uploadedById: actorId,
      },
    });
    await tx.storedFile.update({ where: { id: file.id }, data: { entityId: doc.id } });
    await recordAudit(tx, {
      actorId,
      action: "partner_kyc.document_uploaded",
      entityType: "SeeraPartnerKycDocument",
      entityId: doc.id,
      afterState: { subjectType: input.subjectType, subjectId: input.subjectId, docType: input.docType, sha256, sizeBytes: input.bytes.length },
    });
    return { id: doc.id, docType: doc.docType, originalName: doc.originalName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, createdAt: doc.createdAt.toISOString() };
  });
}

export async function removeKycDocument(db: PrismaClient, actorId: string, documentId: string, reason: string) {
  const doc = await db.seeraPartnerKycDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.removedAt) throw new FoundationError("KYC_DOCUMENT_NOT_FOUND", "Document not found", 404);
  await subjectAccess(db, actorId, doc.subjectType as KycSubjectType, doc.subjectId);
  if (!reason.trim()) throw new FoundationError("KYC_REMOVE_REASON_REQUIRED", "A reason is required to remove a document", 400);
  await db.seeraPartnerKycDocument.update({ where: { id: doc.id }, data: { removedAt: new Date(), removedById: actorId } });
  await recordAudit(db, { actorId, action: "partner_kyc.document_removed", entityType: "SeeraPartnerKycDocument", entityId: doc.id, reason: reason.trim().slice(0, 300) });
  return { id: doc.id };
}

export type KycDetailsInput = {
  gstin?: string;
  pan?: string;
  aadhaarLast4?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  ifsc?: string;
  bankName?: string;
};

// Normalises and validates typed KYC numbers; blank strings clear a field. Exported for tests.
export function normalizeKycDetails(input: KycDetailsInput) {
  const clean = (v?: string) => (v ?? "").replace(/\s+/g, "").toUpperCase();
  const out = {
    gstin: clean(input.gstin) || null,
    pan: clean(input.pan) || null,
    aadhaarLast4: clean(input.aadhaarLast4) || null,
    bankAccountName: (input.bankAccountName ?? "").trim().slice(0, 120) || null,
    bankAccountNumber: clean(input.bankAccountNumber) || null,
    ifsc: clean(input.ifsc) || null,
    bankName: (input.bankName ?? "").trim().slice(0, 120) || null,
  };
  const errors: string[] = [];
  if (out.gstin && !KYC_PATTERNS.gstin.test(out.gstin)) errors.push("GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5");
  if (out.pan && !KYC_PATTERNS.pan.test(out.pan)) errors.push("PAN must look like ABCDE1234F");
  if (out.aadhaarLast4 && !KYC_PATTERNS.aadhaarLast4.test(out.aadhaarLast4)) errors.push("Enter only the last 4 digits of Aadhaar");
  if (out.ifsc && !KYC_PATTERNS.ifsc.test(out.ifsc)) errors.push("IFSC must look like SBIN0001234");
  if (out.bankAccountNumber && !KYC_PATTERNS.bankAccountNumber.test(out.bankAccountNumber)) errors.push("Bank account number must be 9–18 digits");
  if (out.gstin && out.pan && out.gstin.slice(2, 12) !== out.pan) errors.push("PAN does not match the PAN inside the GSTIN");
  return { value: out, errors };
}

export async function saveKycDetails(db: PrismaClient, actorId: string, subjectType: KycSubjectType, subjectId: string, input: KycDetailsInput) {
  await subjectAccess(db, actorId, subjectType, subjectId);
  const { value, errors } = normalizeKycDetails(input);
  if (errors.length) throw new FoundationError("KYC_DETAILS_INVALID", errors.join(". "), 400);
  const saved = await db.seeraPartnerKycDetails.upsert({
    where: { subjectType_subjectId: { subjectType, subjectId } },
    create: { subjectType, subjectId, ...value, updatedById: actorId },
    update: { ...value, updatedById: actorId },
  });
  await recordAudit(db, {
    actorId,
    action: "partner_kyc.details_saved",
    entityType: "SeeraPartnerKycDetails",
    entityId: `${subjectType}:${subjectId}`,
    // Never log the bank account number itself in the audit trail.
    afterState: { gstin: value.gstin, pan: value.pan, ifsc: value.ifsc, bankAccountLast4: value.bankAccountNumber?.slice(-4) ?? null },
  });
  return saved;
}

export async function readKycFile(db: PrismaClient, actorId: string, documentId: string) {
  const doc = await db.seeraPartnerKycDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.removedAt) throw new FoundationError("KYC_DOCUMENT_NOT_FOUND", "Document not found", 404);
  await subjectAccess(db, actorId, doc.subjectType as KycSubjectType, doc.subjectId);
  const file = await db.storedFile.findFirst({ where: { id: doc.fileId, lifecycleStatus: "ACTIVE", revokedAt: null } });
  if (!file?.contentBytes) throw new FoundationError("KYC_FILE_MISSING", "File content unavailable", 404);
  await recordAudit(db, { actorId, action: "partner_kyc.document_viewed", entityType: "SeeraPartnerKycDocument", entityId: doc.id });
  return { bytes: new Uint8Array(file.contentBytes), mimeType: file.mimeType, filename: file.originalName };
}
