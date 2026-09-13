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
    // Section-12 fix (original): maker-checker was not actually enforced here - nothing stopped
    // the same actor who requested this item from also deciding it, and system:super_admin's
    // role-scope bypass just below made this concretely reachable for ANY super_admin holder.
    //
    // UI Implementation & Visual Gap Closure update: that blanket block created the exact same
    // "genuine dead end" money-desk-service.ts's decideMoneyDeskApproval comment already describes
    // fixing for Money Desk — found here via two real production FINANCE_EXPENSE approval items
    // (both requestedById = the Founder's own account, created 2026-09-04, ~10 days before
    // requestFinanceApproval's own Founder-bypass shipped) with literally no way to ever clear
    // them: the Founder holds system:super_admin, so the role-scope check below would pass, but
    // this check ran first and blocked them unconditionally regardless. Money Desk's own
    // decideMoneyDeskApproval already resolved the identical situation with a Founder-only
    // (system:super_admin) bypass; applying the SAME precedent here — the final-authority signal
    // this codebase already treats as authoritative everywhere else — rather than leaving a
    // second, sibling dead end for any future edge case that lands a Founder-originated item in
    // this queue despite the creation-time bypass (a stale pre-fix row, or any path that doesn't
    // go through requestFinanceApproval). Every non-Founder actor is still unconditionally denied.
    if (item.requestedById === actorId && !permissions.has("system:super_admin"))
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
