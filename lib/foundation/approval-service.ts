import type { Prisma, PrismaClient } from "@prisma/client";
import { effectivePermissions } from "./authorization-service";
import { recordAudit } from "./audit-service";
import { FoundationError } from "./errors";

export async function decideApproval(
  db: PrismaClient,
  actorId: string,
  approvalId: string,
  input: { decision: "APPROVED" | "REJECTED"; reason: string },
) {
  const permissions = await effectivePermissions(db, actorId);
  if (
    !permissions.has("approval:decide") &&
    !permissions.has("manager_approval:decide")
  )
    throw new FoundationError(
      "ACCESS_DENIED",
      "Approval authority required",
      403,
    );
  return db.$transaction(async (tx) => {
    const item = await tx.seeraApprovalItem.findUnique({
      where: { id: approvalId },
    });
    if (!item)
      throw new FoundationError(
        "APPROVAL_NOT_FOUND",
        "Approval unavailable",
        404,
      );
    // Section-12 fix: maker-checker was not actually enforced here - nothing stopped the same
    // actor who requested this item from also deciding it, and system:super_admin's role-scope
    // bypass just below made this concretely reachable (a super_admin whose own request landed in
    // this queue could approve/reject their own transaction). Founder-final-authority actions
    // (Money Desk's finalizeForFounder) are unaffected - those never enter this generic approval
    // queue at all, by design.
    if (item.requestedById === actorId)
      throw new FoundationError(
        "SELF_APPROVAL_DENIED",
        "You cannot decide your own request",
        403,
      );
    const roles = await tx.userRoleAssignment.findMany({
      where: { userId: actorId, status: "ACTIVE" },
      select: { role: { select: { code: true } } },
    });
    const assigned = roles.some(
      (assignment) => assignment.role.code === item.assignedRoleCode,
    );
    if (!assigned && !permissions.has("system:super_admin"))
      throw new FoundationError(
        "APPROVAL_SCOPE_DENIED",
        "Approval is assigned to another authority",
        403,
      );
    const changed = await tx.seeraApprovalItem.updateMany({
      where: { id: item.id, status: "PENDING" },
      data: {
        status: input.decision,
        decision: { decision: input.decision } as Prisma.InputJsonValue,
        reason: input.reason,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    if (changed.count !== 1)
      throw new FoundationError(
        "APPROVAL_ALREADY_DECIDED",
        "Approval was already decided",
        409,
      );
    await recordAudit(tx, {
      actorId,
      action: "approval.decided",
      entityType: "SeeraApprovalItem",
      entityId: item.id,
      beforeState: { status: item.status },
      afterState: { status: input.decision, reason: input.reason },
    });
    return tx.seeraApprovalItem.findUniqueOrThrow({ where: { id: item.id } });
  });
}
