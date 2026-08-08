import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authorize } from "./authorization-service";

const metadata = z.object({ storageKey: z.string().regex(/^[A-Za-z0-9/_-]{3,500}$/), originalName: z.string().min(1).max(255), mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/), sizeBytes: z.bigint().positive().max(100_000_000n), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/), classification: z.enum(["GENERAL", "FINANCIAL", "LEGAL", "IDENTITY", "FIELD_EVIDENCE"]).default("GENERAL"), entityType: z.string().max(80).optional(), entityId: z.string().max(160).optional() });
export async function registerFileMetadata(prisma: PrismaClient, actorId: string, input: unknown) {
  await authorize(prisma, { actorId, permission: "files:manage" }); const data = metadata.parse(input);
  return prisma.storedFile.create({ data: { ...data, provider: "UNCONFIGURED_PRIVATE", uploadedById: actorId } });
}
export async function getFileMetadata(prisma: PrismaClient, actorId: string, fileId: string) {
  await authorize(prisma, { actorId, permission: "files:view" }); const file = await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } });
  const permissions = await import("./authorization-service").then(({ effectivePermissions }) => effectivePermissions(prisma, actorId));
  if (file.uploadedById !== actorId && !permissions.has("files:manage") && !permissions.has("system:super_admin")) throw Object.assign(new Error("Private file access denied"), { code: "PRIVATE_FILE_ACCESS_DENIED", status: 403 });
  return file;
}
