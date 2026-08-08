import type { KnowledgeGovernanceTier, KnowledgeGovernanceReviewStatus } from "@prisma/client";
import type { PermissionLayer } from "@/lib/retrieval/types";

export type { KnowledgeGovernanceTier, KnowledgeGovernanceReviewStatus };

/**
 * MUV AI Gateway — Phase 6.1, Knowledge Governance. The 6-tier
 * classification the Founder asked for, kept entirely separate from
 * Module 5's frozen `PermissionLayer` (PUBLIC/INTERNAL/CONFIDENTIAL) —
 * this file only defines how the two vocabularies WOULD map if a
 * classification were ever applied; `mapTierToPermissionLayer` is never
 * called by anything that touches real enforcement in this phase (see
 * `classification-service.ts`'s own header for why).
 */
export const TIER_TO_PERMISSION_LAYER: Record<KnowledgeGovernanceTier, PermissionLayer> = {
  PUBLIC: "PUBLIC",
  CUSTOMER: "PUBLIC",
  PARTNER: "INTERNAL",
  INTERNAL: "INTERNAL",
  FOUNDER: "CONFIDENTIAL",
  CONFIDENTIAL: "CONFIDENTIAL",
};

export function mapTierToPermissionLayer(tier: KnowledgeGovernanceTier): PermissionLayer {
  return TIER_TO_PERMISSION_LAYER[tier];
}

export type ClassificationTargetType = "KF_DOMAIN";

export type ProposeClassificationInput = {
  targetType: ClassificationTargetType;
  targetId: string;
  proposedTier: KnowledgeGovernanceTier;
  proposedById?: string;
  notes?: string;
};
