import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { BUILTIN_LIBRARY_DOCUMENTS, LIBRARY_CATEGORIES, type LibraryCategory } from "./company-library";
import { resolveDistributorPurchaseRate } from "./distributor-pricing";

// Company documents library. Readers: anyone on the Sales Executive or Sales Manager portal, plus
// the Founder/Admin (settings:manage). Writers (upload / archive): settings:manage only.
const VIEW_PERMISSIONS = ["portal:sales_executive", "portal:sales_manager", "settings:manage", "system:super_admin"];
const MAX_BYTES = 25_000_000;

export async function canViewCompanyLibrary(db: PrismaClient, actorId: string) {
  const permissions = await effectivePermissions(db, actorId);
  return VIEW_PERMISSIONS.some((p) => permissions.has(p));
}

export async function assertCanViewCompanyLibrary(db: PrismaClient, actorId: string) {
  if (!(await canViewCompanyLibrary(db, actorId))) {
    await recordAudit(db, { actorId, action: "authorization.denied", entityType: "CompanyLibrary", outcome: "DENIED", reason: "MISSING_PERMISSION" });
    throw new FoundationError("ACCESS_DENIED", "Required permission denied", 403);
  }
}

// A database that has not applied the company-library migration yet must not break the section:
// built-in documents still show and uploads report that they are unavailable.
function isMissingTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022");
}

export type UploadedLibraryDocument = {
  id: string; title: string; category: string; description: string | null; createdAt: Date;
  fileName: string; sizeBytes: number; mimeType: string;
};

export async function listUploadedLibraryDocuments(db: PrismaClient, actorId: string): Promise<{ available: boolean; documents: UploadedLibraryDocument[] }> {
  await assertCanViewCompanyLibrary(db, actorId);
  try {
    const rows = await db.seeraCompanyLibraryDocument.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 200 });
    const files = await db.storedFile.findMany({
      where: { id: { in: rows.map((r) => r.fileId) }, lifecycleStatus: "ACTIVE", revokedAt: null },
      select: { id: true, originalName: true, sizeBytes: true, mimeType: true },
    });
    const byId = new Map(files.map((f) => [f.id, f]));
    return {
      available: true,
      documents: rows.flatMap((r) => {
        const f = byId.get(r.fileId);
        return f ? [{ id: r.id, title: r.title, category: r.category, description: r.description, createdAt: r.createdAt, fileName: f.originalName, sizeBytes: Number(f.sizeBytes), mimeType: f.mimeType }] : [];
      }),
    };
  } catch (error) {
    if (isMissingTable(error)) return { available: false, documents: [] };
    throw error;
  }
}

export function validateLibraryFile(input: { originalName: string; mimeType: string; bytes: Uint8Array }) {
  const b = input.bytes;
  if (!b.length || b.length > MAX_BYTES) throw new FoundationError("INVALID_DOCUMENT_FILE", "File must be between 1 byte and 25 MB", 400);
  if (!/^(application\/pdf|image\/(png|jpeg))$/.test(input.mimeType)) throw new FoundationError("UNSUPPORTED_DOCUMENT_FILE", "Only PDF, PNG or JPEG files are supported", 400);
  const valid = input.mimeType === "application/pdf" ? b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46
    : input.mimeType === "image/png" ? b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (!valid) throw new FoundationError("DOCUMENT_SIGNATURE_MISMATCH", "File content does not match its declared type", 400);
  if (/\.(exe|cmd|bat|js|html?|svg|php)(?:\.|$)/i.test(input.originalName)) throw new FoundationError("MALICIOUS_DOCUMENT_EXTENSION", "Executable or active-content filename denied", 400);
}

export async function uploadCompanyLibraryDocument(db: PrismaClient, actorId: string, input: {
  title: string; category: string; description?: string; originalName: string; mimeType: string; bytes: Uint8Array;
}) {
  await authorize(db, { actorId, permission: "settings:manage" });
  const title = input.title.trim();
  if (title.length < 3 || title.length > 160) throw new FoundationError("INVALID_TITLE", "Title must be 3–160 characters", 400);
  if (!LIBRARY_CATEGORIES.includes(input.category as LibraryCategory)) throw new FoundationError("INVALID_CATEGORY", "Unknown document category", 400);
  const description = input.description?.trim().slice(0, 500) || null;
  validateLibraryFile(input);
  try {
    return await db.$transaction(async (tx) => {
      const sha256 = createHash("sha256").update(input.bytes).digest("hex");
      const file = await tx.storedFile.create({ data: {
        provider: "DATABASE_PRIVATE", storageKey: `private/company-library/${randomBytes(24).toString("hex")}`,
        originalName: input.originalName.replace(/[\\/\0<>"\r\n]/g, "_").slice(0, 200), mimeType: input.mimeType,
        extension: input.originalName.split(".").pop()?.toLowerCase(), sizeBytes: BigInt(input.bytes.length), sha256,
        classification: "GENERAL", scanStatus: "CLEAN", lifecycleStatus: "ACTIVE", entityType: "SeeraCompanyLibraryDocument",
        uploadedById: actorId, contentBytes: Buffer.from(input.bytes),
      } });
      const document = await tx.seeraCompanyLibraryDocument.create({ data: { title, category: input.category, description, fileId: file.id, uploadedById: actorId } });
      await tx.storedFile.update({ where: { id: file.id }, data: { entityId: document.id } });
      await recordAudit(tx, { actorId, action: "company_library.uploaded", entityType: "SeeraCompanyLibraryDocument", entityId: document.id, afterState: { title, category: input.category, fileId: file.id, sha256 } });
      return document;
    });
  } catch (error) {
    if (isMissingTable(error)) throw new FoundationError("COMPANY_LIBRARY_NOT_READY", "Document uploads are not enabled on this database yet (migration pending)", 503);
    throw error;
  }
}

export async function archiveCompanyLibraryDocument(db: PrismaClient, actorId: string, documentId: string) {
  await authorize(db, { actorId, permission: "settings:manage" });
  const existing = await db.seeraCompanyLibraryDocument.findUnique({ where: { id: documentId } });
  if (!existing || existing.archivedAt) throw new FoundationError("DOCUMENT_NOT_FOUND", "Document not found", 404);
  const document = await db.seeraCompanyLibraryDocument.update({ where: { id: documentId }, data: { archivedAt: new Date(), archivedById: actorId } });
  await recordAudit(db, { actorId, action: "company_library.archived", entityType: "SeeraCompanyLibraryDocument", entityId: documentId, beforeState: { title: existing.title } });
  return document;
}

export async function downloadCompanyLibraryDocument(db: PrismaClient, actorId: string, documentId: string) {
  await assertCanViewCompanyLibrary(db, actorId);
  const document = await db.seeraCompanyLibraryDocument.findFirst({ where: { id: documentId, archivedAt: null } });
  if (!document) throw new FoundationError("DOCUMENT_NOT_FOUND", "Document not found", 404);
  const file = await db.storedFile.findFirst({ where: { id: document.fileId, lifecycleStatus: "ACTIVE", revokedAt: null } });
  if (!file?.contentBytes) throw new FoundationError("DOCUMENT_CONTENT_MISSING", "File content unavailable", 404);
  return { bytes: new Uint8Array(file.contentBytes), mimeType: file.mimeType, filename: file.originalName };
}

export function builtinLibraryCount() {
  return BUILTIN_LIBRARY_DOCUMENTS.length;
}

// Live price list from the governed price versions — the same source orders are priced from, so a
// rate changed by the Company in masters shows here immediately (no separate copy to update).
export type LivePriceRow = {
  skuId: string; code: string; productName: string; brand: string; packSize: number; unitType: string; unitsPerCase: number;
  mrp: number; taxRatePercent: number | null; ssRate: number | null; distributorRate: number | null;
  distributorRateSource: "SS_TO_DISTRIBUTOR" | "DERIVED_FROM_COMPANY_TO_SS" | null; effectiveFrom: Date | null;
};

export async function livePriceList(db: PrismaClient, actorId: string, now = new Date()): Promise<LivePriceRow[]> {
  await assertCanViewCompanyLibrary(db, actorId);
  const skus = await db.seeraSku.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ brand: "asc" }, { category: "asc" }, { productName: "asc" }],
    include: { prices: { where: { tier: "COMPANY_TO_SS", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }, orderBy: { effectiveFrom: "desc" }, take: 1 } },
  });
  return Promise.all(skus.map(async (sku) => {
    const ss = sku.prices[0];
    const dist = await resolveDistributorPurchaseRate(db, sku.id, sku.code, now);
    const tax = sku.taxRate == null ? null : Number(sku.taxRate);
    return {
      skuId: sku.id, code: sku.code, productName: sku.productName, brand: sku.brand, packSize: Number(sku.packSize), unitType: sku.unitType,
      unitsPerCase: sku.unitsPerCase, mrp: Number(sku.mrp), taxRatePercent: tax == null ? null : (tax <= 1 ? tax * 100 : tax),
      ssRate: ss ? Number(ss.amount) : null, distributorRate: dist?.amount ?? null, distributorRateSource: dist?.source ?? null,
      effectiveFrom: ss?.effectiveFrom ?? null,
    };
  }));
}
