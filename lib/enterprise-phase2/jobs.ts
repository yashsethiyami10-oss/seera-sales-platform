import { Prisma } from "@prisma/client";
import { requireOrganization, type EnterprisePrincipal } from "@/lib/enterprise/context";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import type { EnterpriseTx } from "@/lib/enterprise/context";
import {
  claimOperation,
  completeOperation,
  failOperation,
  operationWasAcquired,
  requestFingerprint,
  retryOperation,
} from "./foundation";

export type Phase2JobCommand = {
  organizationKey: string;
  jobType: string;
  idempotencyKey: string;
  correlationId: string;
  payload: unknown;
};

export async function phase2SerializableTransaction<T>(work: (tx: EnterpriseTx) => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await enterpriseTransaction(work);
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (
        error.code === "P2034" ||
        (error.code === "P2010" &&
          ["40001", "40P01"].includes(String(error.meta?.code)))
      );
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
  throw new Error("Unreachable transaction retry state");
}

// Shared job boundary only. Domain job execution is intentionally deferred.
export async function claimPhase2Job(principal: EnterprisePrincipal, command: Phase2JobCommand) {
  return phase2SerializableTransaction(async (tx) => {
    const operation = await claimOperation(tx, principal, {
      organizationKey: command.organizationKey,
      operationType: `JOB:${command.jobType}`,
      idempotencyKey: command.idempotencyKey,
      requestFingerprint: requestFingerprint(command.payload),
      correlationId: command.correlationId,
    });
    const acquired = operationWasAcquired(operation, command.correlationId);
    if (acquired && operation.status === "PENDING") {
      return {
        operation: await tx.phase2Operation.update({
          where: { id: operation.id },
          data: { status: "RUNNING" },
        }),
        acquired: true,
      };
    }
    return { operation, acquired: false };
  });
}

export function completePhase2Job(
  principal: EnterprisePrincipal,
  input: {
    organizationKey: string;
    operationId: string;
    resultEntityType?: string;
    resultEntityId?: string;
  },
) {
  return phase2SerializableTransaction((tx) => completeOperation(tx, principal, input));
}

export function failPhase2Job(
  principal: EnterprisePrincipal,
  input: { organizationKey: string; operationId: string; failureCode: string },
) {
  return phase2SerializableTransaction((tx) => failOperation(tx, principal, input));
}

export function retryPhase2Job(
  principal: EnterprisePrincipal,
  input: {
    organizationKey: string;
    operationId: string;
    correlationId: string;
    staleBefore?: Date;
  },
) {
  return phase2SerializableTransaction((tx) => retryOperation(tx, principal, input));
}

export async function findStalePhase2Jobs(
  principal: EnterprisePrincipal,
  input: { organizationKey: string; staleBefore: Date; take?: number },
) {
  requireOrganization(principal, input.organizationKey);
  return phase2SerializableTransaction((tx) => tx.phase2Operation.findMany({
    where: {
      organizationKey: principal.organizationKey,
      operationType: { startsWith: "JOB:" },
      status: "RUNNING",
      updatedAt: { lte: input.staleBefore },
    },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(input.take ?? 100, 1), 500),
  }));
}
