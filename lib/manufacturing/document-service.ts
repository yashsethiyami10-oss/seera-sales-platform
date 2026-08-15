import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// Mirrors lib/finance/document-service.ts exactly (same StoredFile table,
// same magic-byte + extension validation, same generic entityType/entityId
// attach model) rather than inventing a second, weaker upload boundary or
// reusing the SeeraCommercialDocument-shaped document:upload path in
// lib/sales-distribution/document-service.ts, which is a different concept
// (invoice-like issued documents) — Manufacturing just needs "attach a file
// to a record", the same shape Finance already solved.
const MANUFACTURING_ENTITY_TYPES = ["SeeraSop", "SeeraGrn", "SeeraBatchQc", "SeeraProductionBatch", "SeeraDeviationRecord", "SeeraManufacturingMaterial", "SeeraStockCount", "SeeraBom"] as const;
export type ManufacturingDocumentEntityType = (typeof MANUFACTURING_ENTITY_TYPES)[number];

export async function uploadManufacturingDocument(db: PrismaClient, actorId: string, input: { entityType: ManufacturingDocumentEntityType; entityId: string; originalName: string; mimeType: string; bytes: Uint8Array }) {
  await authorize(db, { actorId, permission: "document:upload" });
  if (!MANUFACTURING_ENTITY_TYPES.includes(input.entityType)) throw new FoundationError("INVALID_MANUFACTURING_ENTITY", "Unknown Manufacturing document entity", 400);
  if (!input.bytes.length || input.bytes.length > 25_000_000) throw new FoundationError("INVALID_DOCUMENT_FILE", "Document file must be between 1 byte and 25 MB", 400);
  if (!/^(application\/pdf|image\/(png|jpeg))$/.test(input.mimeType)) throw new FoundationError("UNSUPPORTED_DOCUMENT_FILE", "Only PDF, PNG or JPEG files are supported", 400);
  const b = input.bytes;
  const valid = input.mimeType === "application/pdf" ? b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 : input.mimeType === "image/png" ? b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (!valid) throw new FoundationError("DOCUMENT_SIGNATURE_MISMATCH", "File content does not match its declared MIME type", 400);
  if (/\.(exe|cmd|bat|js|html?|svg|php)(?:\.|$)/i.test(input.originalName)) throw new FoundationError("MALICIOUS_DOCUMENT_EXTENSION", "Executable or active-content filename denied", 400);

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const file = await db.storedFile.create({
    data: { provider: "DATABASE_PRIVATE", storageKey: `private/manufacturing/${randomBytes(24).toString("hex")}`, originalName: input.originalName.replace(/[\\/\0<>]/g, "_"), mimeType: input.mimeType, extension: input.originalName.split(".").pop()?.toLowerCase(), sizeBytes: BigInt(input.bytes.length), sha256, classification: "GENERAL", scanStatus: "CLEAN", lifecycleStatus: "ACTIVE", entityType: input.entityType, entityId: input.entityId, uploadedById: actorId, contentBytes: Buffer.from(input.bytes) },
  });
  await recordAudit(db, { actorId, action: "mfg.document.uploaded", entityType: input.entityType, entityId: input.entityId, afterState: { fileId: file.id, originalName: file.originalName, sha256 } });
  return { id: file.id, originalName: file.originalName, mimeType: file.mimeType, createdAt: file.createdAt };
}

export async function manufacturingDocumentsFor(db: PrismaClient, actorId: string, entityType: ManufacturingDocumentEntityType, entityId: string) {
  await authorize(db, { actorId, permission: "document:view_scoped" });
  return db.storedFile.findMany({ where: { entityType, entityId, lifecycleStatus: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true, originalName: true, mimeType: true, createdAt: true } });
}

export async function downloadManufacturingDocument(db: PrismaClient, actorId: string, fileId: string) {
  await authorize(db, { actorId, permission: "document:view_scoped" });
  const file = await db.storedFile.findFirstOrThrow({ where: { id: fileId, entityType: { in: [...MANUFACTURING_ENTITY_TYPES] }, lifecycleStatus: "ACTIVE", revokedAt: null } });
  if (!file.contentBytes) throw new FoundationError("DOCUMENT_FILE_CONTENT_MISSING", "File content unavailable", 404);
  await recordAudit(db, { actorId, action: "mfg.document.downloaded", entityType: file.entityType ?? "StoredFile", entityId: file.id });
  return { bytes: new Uint8Array(file.contentBytes), mimeType: file.mimeType, filename: file.originalName };
}
