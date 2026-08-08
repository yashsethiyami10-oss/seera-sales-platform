import { randomUUID } from "node:crypto"; import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authorize } from "./authorization-service";
import { recordAudit } from "./audit-service";

const metadata = z.object({ originalName: z.string().min(1).max(255).refine(value=>!/[\\/\0<>]/.test(value)&&value!=="."&&value!=="..","Unsafe filename"), mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/), sizeBytes: z.bigint().positive().max(100_000_000n), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/), classification: z.enum(["GENERAL", "FINANCIAL", "LEGAL", "IDENTITY", "FIELD_EVIDENCE"]).default("GENERAL"), entityType: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/).optional(), entityId: z.string().max(160).optional() }).strict();
export async function registerFileMetadata(prisma: PrismaClient, actorId: string, input: unknown) {
  await authorize(prisma, { actorId, permission: "files:manage" }); const data = metadata.parse(input);
  const storageKey=`private/${actorId}/${randomUUID()}`; const file=await prisma.storedFile.create({ data: { ...data, storageKey, provider: "UNCONFIGURED_PRIVATE", uploadedById: actorId } }); await recordAudit(prisma,{actorId,action:"file.register",entityType:"StoredFile",entityId:file.id,afterState:{classification:file.classification,sizeBytes:file.sizeBytes.toString()}}); return file;
}
export async function getFileMetadata(prisma: PrismaClient, actorId: string, fileId: string) {
  await authorize(prisma, { actorId, permission: "files:view" }); const file = await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } });
  const permissions = await import("./authorization-service").then(({ effectivePermissions }) => effectivePermissions(prisma, actorId));
  if (file.uploadedById !== actorId && !permissions.has("files:manage") && !permissions.has("system:super_admin")) throw Object.assign(new Error("Private file access denied"), { code: "PRIVATE_FILE_ACCESS_DENIED", status: 403 });
  return file;
}
