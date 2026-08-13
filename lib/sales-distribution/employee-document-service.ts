import type { PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";

export async function listMyEmployeeDocuments(
  db: PrismaClient,
  actorId: string,
  type: "SALARY_SLIP" | "POLICY",
) {
  return db.seeraEmployeeDocument.findMany({
    where: { employeeId: actorId, type },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function downloadEmployeeDocument(db: PrismaClient, actorId: string, documentId: string) {
  const document = await db.seeraEmployeeDocument.findFirst({ where: { id: documentId } });
  if (!document || (document.employeeId !== actorId && document.issuedById !== actorId))
    throw new FoundationError("EMPLOYEE_DOCUMENT_SCOPE_DENIED", "Document unavailable", 403);
  const file = await db.storedFile.findFirstOrThrow({
    where: { id: document.fileId, lifecycleStatus: "ACTIVE", revokedAt: null },
  });
  if (!file.contentBytes)
    throw new FoundationError("EMPLOYEE_DOCUMENT_CONTENT_MISSING", "File content unavailable", 404);
  return { bytes: new Uint8Array(file.contentBytes), mimeType: file.mimeType, filename: file.originalName };
}
