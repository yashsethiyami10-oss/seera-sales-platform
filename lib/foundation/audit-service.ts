import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
export async function recordAudit(db: Db, input: {
  actorId?: string | null; action: string; entityType: string; entityId?: string | null;
  outcome?: "SUCCESS" | "FAILURE" | "DENIED"; reason?: string; beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue; details?: Prisma.InputJsonValue; sessionId?: string;
}) {
  return db.auditLog.create({ data: {
    actorId: input.actorId, action: input.action, entityType: input.entityType, entityId: input.entityId,
    outcome: input.outcome ?? "SUCCESS", reason: input.reason, beforeState: input.beforeState,
    afterState: input.afterState, details: input.details, sessionId: input.sessionId,
  }});
}
