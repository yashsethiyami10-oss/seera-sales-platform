import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireKnowledgeFactoryPrincipal } from "./context";

/**
 * MUV Intelligence Factory V4 §7 — Governance and Approval Model. The
 * Founder is the implicit root authority (no row required — see
 * `resolveApprovalLevel`'s fallback). `ApprovalAuthority` records every
 * delegation away from that root. `HardMakerCheckerCategory` is the fixed,
 * small, rarely-changed list of change categories where even the Founder
 * requires a second, distinct approver (EIOS §7.2's precise, non-blanket
 * self-approval rule).
 */

export const APPROVAL_LEVEL_ORDER = ["EDITORIAL", "OPERATIONAL", "EXPERT", "GOVERNANCE", "FOUNDER"] as const;
export type ApprovalLevel = (typeof APPROVAL_LEVEL_ORDER)[number];

function levelRank(level: string): number {
  const idx = APPROVAL_LEVEL_ORDER.indexOf(level as ApprovalLevel);
  return idx === -1 ? -1 : idx;
}

const grantInput = z.object({
  principalId: z.string().cuid(),
  maxApprovalLevel: z.enum(APPROVAL_LEVEL_ORDER),
  scopeDomains: z.array(z.string()).default([]),
  validUntil: z.coerce.date().optional(),
});

/** Only the Founder may delegate authority away from themselves — V4 §7.1:
 * "The Founder is the root authority... can delegate GOVERNANCE-level
 * authority to named individuals for named domains." */
export async function grantApprovalAuthority(input: unknown) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  if (!principal.isFounder) throw new ForbiddenError("Only the Founder may grant approval authority");
  const data = grantInput.parse(input);
  const grant = await prisma.approvalAuthority.create({
    data: { organizationKey: principal.organizationKey, principalId: data.principalId, maxApprovalLevel: data.maxApprovalLevel, scopeDomains: data.scopeDomains, delegatedById: principal.id, validUntil: data.validUntil },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "APPROVAL_AUTHORITY_GRANTED", entityType: "ApprovalAuthority", entityId: grant.id,
    description: `${data.maxApprovalLevel} authority granted for [${data.scopeDomains.join(", ")}]${data.validUntil ? ` until ${data.validUntil.toISOString()}` : " (indefinite)"}`,
  }).catch(() => {});
  return grant;
}

export async function revokeApprovalAuthority(id: string, reason: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  if (!principal.isFounder) throw new ForbiddenError("Only the Founder may revoke approval authority");
  const grant = await prisma.approvalAuthority.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!grant) throw new NotFoundError("Approval authority grant");
  if (grant.revoked) throw new ConflictError("Already revoked");
  const updated = await prisma.approvalAuthority.update({ where: { id }, data: { revoked: true, revokedById: principal.id, revokedAt: new Date() } });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "APPROVAL_AUTHORITY_REVOKED", entityType: "ApprovalAuthority", entityId: id, description: reason,
  }).catch(() => {});
  return updated;
}

/**
 * The highest currently-valid delegated level a principal holds for a
 * domain, or null if none — null means "falls back to the Founder,"
 * per V4 §7.1's business-continuity rule (never a silent stall).
 */
export async function resolveApprovalLevel(principalId: string, domain: string): Promise<ApprovalLevel | null> {
  const now = new Date();
  const grants = await prisma.approvalAuthority.findMany({
    where: { principalId, revoked: false, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
  });
  const applicable = grants.filter((g) => g.scopeDomains.length === 0 || g.scopeDomains.includes(domain));
  if (applicable.length === 0) return null;
  const highest = applicable.reduce<string>((best, g) => (levelRank(g.maxApprovalLevel) > levelRank(best) ? g.maxApprovalLevel : best), "EDITORIAL");
  return highest as ApprovalLevel;
}

export async function checkApprovalSufficient(principalId: string, domain: string, requiredLevel: ApprovalLevel, isFounder: boolean): Promise<boolean> {
  if (isFounder) return true; // the Founder's implicit root authority always satisfies any level
  const held = await resolveApprovalLevel(principalId, domain);
  if (!held) return false;
  return levelRank(held) >= levelRank(requiredLevel);
}

export async function listHardMakerCheckerCategories() {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  return prisma.hardMakerCheckerCategory.findMany({ where: { organizationKey: principal.organizationKey, active: true } });
}

/**
 * EIOS §7.2's precise Founder self-approval rule: permitted everywhere
 * except the five named categories, where a second, distinct approver is
 * required regardless of who initiated the change — never a blanket
 * exception.
 */
export async function requiresSecondApprover(changeCategory: string): Promise<boolean> {
  const match = await prisma.hardMakerCheckerCategory.findFirst({ where: { category: changeCategory, active: true } });
  return !!match;
}

export async function canSelfApprove(actingPrincipalIsFounder: boolean, changeCategory: string | null): Promise<boolean> {
  if (!actingPrincipalIsFounder) return false; // non-Founder self-approval is never permitted by this function — that's the ordinary maker!=checker rule elsewhere
  if (!changeCategory) return true;
  const needsSecond = await requiresSecondApprover(changeCategory);
  return !needsSecond;
}

export async function listApprovalAuthorities(principalId?: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  return prisma.approvalAuthority.findMany({
    where: { organizationKey: principal.organizationKey, revoked: false, ...(principalId ? { principalId } : {}) },
    orderBy: { createdAt: "desc" },
  });
}
