import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { NotFoundError, ConflictError } from "@/lib/errors";
import type { KnowledgeGovernanceReviewStatus, ProposeClassificationInput } from "./types";

/**
 * MUV AI Gateway — Phase 6.1, Knowledge Governance service.
 *
 * "No automatic promotion": every function below only reads or writes
 * `KnowledgeGovernanceClassification` rows. None of them touch
 * `lib/gateway/knowledge/authorization.ts`'s frozen `kfDomainLayer` map
 * (Phase 5.2.1) or Module 5's `PermissionLayer` — approving a proposal
 * here changes this table's own `status` column and nothing else in the
 * running system. Applying an approved classification to real
 * enforcement is a distinct, separately authorized future change to
 * `authorization.ts` itself, not a side effect of anything here.
 *
 * `proposeClassification` is intentionally NOT admin-gated (any
 * authenticated staff/founder workflow can propose one for review) —
 * `approveClassification`/`rejectClassification` ARE `requireAdmin()`
 * -gated, since only the Founder (or a delegate with ADMIN) should be
 * able to move a proposal out of PENDING_REVIEW.
 */

export async function proposeClassification(input: ProposeClassificationInput) {
  return prisma.knowledgeGovernanceClassification.upsert({
    where: { targetType_targetId: { targetType: input.targetType, targetId: input.targetId } },
    update: {
      proposedTier: input.proposedTier,
      status: "PENDING_REVIEW",
      proposedById: input.proposedById,
      notes: input.notes,
      reviewedById: null,
      reviewedAt: null,
    },
    create: {
      targetType: input.targetType,
      targetId: input.targetId,
      proposedTier: input.proposedTier,
      proposedById: input.proposedById,
      notes: input.notes,
    },
  });
}

export async function listClassifications(status?: KnowledgeGovernanceReviewStatus) {
  return prisma.knowledgeGovernanceClassification.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function listPendingClassifications() {
  return listClassifications("PENDING_REVIEW");
}

async function requireReviewableClassification(id: string) {
  const row = await prisma.knowledgeGovernanceClassification.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Knowledge classification proposal");
  if (row.status !== "PENDING_REVIEW") {
    throw new ConflictError(`This proposal is already ${row.status.toLowerCase()} — re-propose it to review again`);
  }
  return row;
}

export async function approveClassification(id: string) {
  const reviewer = await requireAdmin();
  await requireReviewableClassification(id);
  return prisma.knowledgeGovernanceClassification.update({
    where: { id },
    data: { status: "APPROVED", reviewedById: reviewer.id, reviewedAt: new Date() },
  });
}

export async function rejectClassification(id: string, notes?: string) {
  const reviewer = await requireAdmin();
  await requireReviewableClassification(id);
  return prisma.knowledgeGovernanceClassification.update({
    where: { id },
    data: { status: "REJECTED", reviewedById: reviewer.id, reviewedAt: new Date(), notes: notes ?? undefined },
  });
}
