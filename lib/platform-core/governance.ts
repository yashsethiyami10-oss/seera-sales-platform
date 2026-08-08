import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EnterprisePrincipal, EnterpriseTx } from "./context";

export async function nextEnterpriseNumber(
  tx: EnterpriseTx,
  organizationKey: string,
  documentType: string,
  prefix: string,
) {
  const sequence = await tx.enterpriseSequence.upsert({
    where: { organizationKey_documentType: { organizationKey, documentType } },
    create: { organizationKey, documentType, prefix, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const issued = sequence.nextValue - 1;
  return `${sequence.prefix}-${new Date().getUTCFullYear()}-${String(issued).padStart(6, "0")}`;
}

export async function recordEnterpriseMutation(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  event: {
    module: string;
    action: string;
    entityType: string;
    entityId: string;
    description: string;
    previous?: Prisma.InputJsonValue;
    next?: Prisma.InputJsonValue;
    notify?: boolean;
  },
) {
  const correlationId = crypto.randomUUID();
  await tx.salesTimelineEvent.create({
    data: {
      actorId: principal.id,
      eventType: event.action,
      relatedRecordType: event.entityType,
      relatedRecordId: event.entityId,
      description: event.description,
      metadata: {
        organizationKey: principal.organizationKey,
        correlationId,
        state: event.next ?? null,
      },
    },
  });
  await tx.salesAuditLog.create({
    data: {
      userId: principal.id,
      module: event.module,
      action: event.action,
      recordType: event.entityType,
      recordId: event.entityId,
      previousValue: event.previous,
      newValue: {
        organizationKey: principal.organizationKey,
        correlationId,
        state: event.next ?? null,
      },
    },
  });
  if (event.notify !== false) {
    await tx.notificationLog.create({
      data: {
        channel: "DASHBOARD",
        type: event.action,
        recipient: principal.email ?? principal.id,
        status: "PENDING",
      },
    });
  }
  return correlationId;
}

export async function enterpriseTransaction<T>(
  work: (tx: EnterpriseTx) => Promise<T>,
) {
  return prisma.$transaction(work, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
