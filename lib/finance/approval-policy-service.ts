import type { FinanceApprovalCategory, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { decideApproval } from "@/lib/foundation/approval-service";

// Founder-configured thresholds (spec section 41: "Do not invent arbitrary
// rupee limits. Founder configures thresholds."). Defaults are conservative
// (approval required, zero threshold = every transaction) until the Founder
// tightens or relaxes them — never invented business policy, just a safe
// starting posture that requires explicit Founder action to loosen.
const DEFAULT_POLICIES: { category: FinanceApprovalCategory; thresholdAmount: number; requiresApproval: boolean }[] = [
  { category: "EXPENSE", thresholdAmount: 0, requiresApproval: true },
  { category: "VENDOR_BILL", thresholdAmount: 0, requiresApproval: false },
  { category: "PAYMENT", thresholdAmount: 0, requiresApproval: false },
  { category: "MANUAL_JOURNAL", thresholdAmount: 0, requiresApproval: false },
  { category: "REVERSAL", thresholdAmount: 0, requiresApproval: false },
  { category: "LARGE_CASH_TXN", thresholdAmount: 50000, requiresApproval: true },
  { category: "PERIOD_REOPEN", thresholdAmount: 0, requiresApproval: true },
];

export async function seedDefaultFinanceApprovalPolicies(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "finance_approval_policy:manage" });
  const results = [];
  for (const policy of DEFAULT_POLICIES) results.push(await db.seeraFinanceApprovalPolicy.upsert({ where: { category: policy.category }, update: {}, create: policy }));
  return results;
}

export async function updateFinanceApprovalPolicy(db: PrismaClient, actorId: string, input: { category: FinanceApprovalCategory; thresholdAmount: number; requiresApproval: boolean }) {
  await authorize(db, { actorId, permission: "finance_approval_policy:manage" });
  const policy = await db.seeraFinanceApprovalPolicy.upsert({ where: { category: input.category }, update: { thresholdAmount: input.thresholdAmount, requiresApproval: input.requiresApproval, updatedById: actorId }, create: { ...input, updatedById: actorId } });
  await recordAudit(db, { actorId, action: "finance.approval_policy.updated", entityType: "SeeraFinanceApprovalPolicy", entityId: policy.id, afterState: input });
  return policy;
}

export async function listFinanceApprovalPolicies(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  return db.seeraFinanceApprovalPolicy.findMany({ orderBy: { category: "asc" } });
}

// Returns true if this event actually required (and now has a PENDING)
// approval request; false if the policy says it doesn't need one at this
// amount (caller can proceed straight to APPROVED).
export async function requestFinanceApproval(db: PrismaClient, requestedById: string, input: { category: FinanceApprovalCategory; entityType: string; entityId: string; amount: number; reason: string }) {
  const policy = await db.seeraFinanceApprovalPolicy.findUnique({ where: { category: input.category } });
  const requiresApproval = policy ? policy.requiresApproval && input.amount >= Number(policy.thresholdAmount) : true;
  if (!requiresApproval) return false;
  await db.seeraApprovalItem.create({
    data: { type: `FINANCE_${input.category}`, entityType: input.entityType, entityId: input.entityId, requestedById, assignedRoleCode: "ACCOUNTS_MANAGER", status: "PENDING", request: { amount: input.amount, reason: input.reason } },
  });
  return true;
}

// Final Integration mission, Part I/§9 — requestedById was a raw user id with no display name
// resolution anywhere downstream; enriched here (once, canonically) rather than in every caller,
// so this and the new Founder Approval Hub both get a real name, never a technical id as the
// primary label.
export async function financeApprovalQueue(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "expense:approve" });
  const items = await db.seeraApprovalItem.findMany({ where: { type: { startsWith: "FINANCE_" }, status: "PENDING" }, orderBy: { createdAt: "asc" } });
  const requesterIds = [...new Set(items.map((i) => i.requestedById))];
  const requesters = requesterIds.length ? await db.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } }) : [];
  const nameById = new Map(requesters.map((u) => [u.id, u.name ?? u.email]));
  return items.map((i) => ({ ...i, requestedByName: nameById.get(i.requestedById) ?? i.requestedById }));
}

export { decideApproval };
