/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A), Phase 9.
 *
 * CareIntelligence candidate projections. Implements exactly the 5
 * categories frozen in Block 2C Section 12. Category 5 (emotional-tone
 * adaptation) has no approved source and is never derived — attempting to
 * request it returns an explicit rejection, not a silent no-op, so the
 * distinction between "not requested" and "requested but prohibited" is
 * always visible to a caller/test.
 */

import type { SourceProduct } from "./sources";
import type { CareDerivationMethod, CareIntelligenceProjection, ConfidenceLevel, SourceReference } from "./types";
import { careIntelligenceKey } from "./identity";
import { FOUNDER_POLICY, getProductContentEligibility } from "./policy";
import { normalizeWhitespace } from "./normalize";

function policySource(label: string): SourceReference {
  return { sourceType: "FOUNDER_POLICY", sourceId: "block-2c-governance-report", sourceVersion: FOUNDER_POLICY.version, sourceApprovalStatus: "APPROVED", label };
}

function productContentSource(product: SourceProduct, field: string): SourceReference {
  return {
    sourceType: "PRODUCT_CONTENT",
    sourceId: product.content?.id ?? `missing-content:${product.id}`,
    sourceVersion: product.content?.updatedAt.toISOString() ?? null,
    sourceApprovalStatus: product.content?.approvalStatus ?? null,
    label: `ProductContent.${field} (${product.name})`,
  };
}

function baseCareProjection(
  workflowName: string,
  trigger: string,
  derivationMethod: CareDerivationMethod,
  confidence: ConfidenceLevel,
  sources: SourceReference[]
): CareIntelligenceProjection {
  const deterministicKey = careIntelligenceKey(workflowName);
  return {
    deterministicKey,
    targetModel: "CareIntelligence",
    targetRecordType: "CARE_WORKFLOW",
    sources,
    sourcePriority: ["PRODUCT_CONTENT", "PUBLISHED_KNOWLEDGE_RECORD", "FOUNDER_POLICY"],
    governanceClassification: "FOUNDER_REVIEW_REQUIRED",
    customerSafeEligible: false,
    runtimeEligible: false,
    activeStatus: "ACTIVE",
    conflictStatus: "NONE",
    confidence,
    reviewStatus: "REQUIRED",
    mappedFields: ["workflowName", "trigger", "safeResponseSequence"],
    excludedFields: [],
    missingFields: ["emotionalToneGuidance"],
    warnings: [],
    errors: [],
    relationshipReferences: [],
    provenance: Object.fromEntries(sources.map((s, i) => [`source_${i}`, s.label])),
    proposedWriteOperation: { op: "SKIP", targetModel: "CareIntelligence", reason: "Finalized by dry-run.ts against the existing-key index." },
    proposedRollbackIdentity: { targetModel: "CareIntelligence", deterministicKey, previousVersionId: null },

    workflowName,
    slug: deterministicKey,
    trigger,
    derivationMethod,
    requiredClarification: [],
    safeResponseSequence: [],
    productRecommendationConstraints: [],
    directions: [],
    precautions: [],
    prohibitedAdvice: [],
    unsafeMixingWarnings: [],
    escalationConditions: [],
    humanHandoffConditions: [],
    emotionalToneGuidance: null,
    confidenceThreshold: FOUNDER_POLICY.confidenceThresholds.minimumForActionRecommendation,
    unsupportedClaimHandling: null,
    nonexistentProductHandling: null,
    relatedProductIntelligenceKeys: [],
    relatedProblemIntelligenceKeys: [],
  };
}

/** Category 1 — the 4 workflows Block 2C found already backed by two
 * independent real sources each. Always produced, regardless of which
 * products are passed in, since their evidence is brand-level, not
 * per-product. */
function categoryOneWorkflows(): CareIntelligenceProjection[] {
  if (!FOUNDER_POLICY.careWorkflowDerivationPolicy.allowCategory1Derivation) return [];

  const priceWorkflow = baseCareProjection(
    "Price question answered directly",
    "Customer asks the price, MRP, or availability of any product/variant",
    "SOURCE_BACKED",
    "HIGH",
    [policySource("Block 1 Section 7 + Block 2C Section 7: two independent real sources agree pricing must always resolve live, never be answered from stored content.")]
  );
  priceWorkflow.safeResponseSequence = ["Resolve the current price/MRP/availability via the Dispatcher's commerce.getPricing/commerce.getAvailability tools.", "Answer directly — do not escalate a routine, answerable price question."];
  priceWorkflow.prohibitedAdvice = ["Never state a price from PublishedKnowledgeRecord or any other stored/historical content."];

  const bleachWorkflow = baseCareProjection(
    "Bleach-mixing safety escalation",
    "Customer question combines Muv Pure Bleach with any other cleaning product",
    "SOURCE_BACKED",
    "HIGH",
    [policySource("ProductContent.safetyInformation for Muv Pure Bleach contains an explicit, real danger/mixing warning.")]
  );
  bleachWorkflow.unsafeMixingWarnings = ["Never mix Muv Pure Bleach with toilet cleaner, acids, ammonia, or any other cleaning chemical."];
  bleachWorkflow.escalationConditions = ["Any question describing bleach combined with another chemical product."];
  bleachWorkflow.safeResponseSequence = ["Surface the real, sourced danger warning verbatim.", "Never downplay or omit the warning regardless of phrasing."];

  const nonexistentWorkflow = baseCareProjection(
    "Nonexistent product — honest non-fabrication reply",
    "Customer names a product/fragrance/pack size that does not match any real, ACTIVE Product row",
    "SOURCE_BACKED",
    "HIGH",
    [policySource(`Reuses the existing Dispatcher/tool-layer non-disclosure discipline confirmed in the Governed Runtime Activation recovery audit; template: "${FOUNDER_POLICY.nonexistentProductPolicy.template}"`)]
  );
  nonexistentWorkflow.nonexistentProductHandling = FOUNDER_POLICY.nonexistentProductPolicy.template;
  nonexistentWorkflow.prohibitedAdvice = ["Never invent a product, price, ingredient, or benefit for a name that does not match a real, ACTIVE Product."];

  const unsupportedClaimWorkflow = baseCareProjection(
    "Unsupported claim — honest non-committal reply",
    "Customer asks about a claim (antibacterial, dermatologically tested, eco-friendly, hypoallergenic, etc.) not present in any approved source",
    "SOURCE_BACKED",
    "HIGH",
    [policySource(`Multiple real Knowledge Factory FAQ answers already model this exact pattern verbatim; template: "${FOUNDER_POLICY.unsupportedClaimPolicy.template}"`)]
  );
  unsupportedClaimWorkflow.unsupportedClaimHandling = FOUNDER_POLICY.unsupportedClaimPolicy.template;
  unsupportedClaimWorkflow.prohibitedAdvice = ["Never assert or deny an unsupported claim — always the honest non-committal reply."];

  return [priceWorkflow, bleachWorkflow, nonexistentWorkflow, unsupportedClaimWorkflow];
}

/** Category 2 — per-product safety escalation, derivable directly from
 * each product's real `ProductContent.safetyInformation`, but kept
 * FOUNDER_REVIEW_REQUIRED pending Block 2C Decision 1. */
function categoryTwoWorkflows(products: SourceProduct[]): CareIntelligenceProjection[] {
  if (!FOUNDER_POLICY.careWorkflowDerivationPolicy.requireReviewForCategory2) return [];

  const out: CareIntelligenceProjection[] = [];
  for (const product of products) {
    const safetyText = product.content?.safetyInformation ?? product.safety;
    if (!safetyText) continue;
    const eligible = getProductContentEligibility(product.name) !== "FOUNDER_REVIEW_REQUIRED";
    const workflow = baseCareProjection(
      `Per-product safety escalation — ${product.name}`,
      `Safety-sensitive question naming ${product.name}`,
      "DETERMINISTIC_DERIVATION",
      eligible ? "MODERATE" : "LOW",
      [productContentSource(product, "safetyInformation")]
    );
    workflow.precautions = [normalizeWhitespace(safetyText)];
    workflow.relatedProductIntelligenceKeys = [`pi-${product.id}`];
    workflow.warnings = [{ code: "CATEGORY_2_REVIEW_REQUIRED", message: "Derivable from real ProductContent, but pending Block 2C Decision 1 before promotion." }];
    out.push(workflow);
  }
  return out;
}

export type CareMapperResult = {
  projections: CareIntelligenceProjection[];
  rejected: { workflowName: string; reason: string }[];
};

/** Category 5 — explicitly requested-and-rejected, never silently
 * skipped. A caller (or a test) asking this mapper to derive emotional-
 * tone-adaptation content gets a recorded refusal, matching the Mapper
 * Governance Contract's "reject unsafe or ambiguous mappings" rule. */
export function requestEmotionalToneWorkflow(): { projection: null; rejected: { workflowName: string; reason: string } } {
  return {
    projection: null,
    rejected: {
      workflowName: "Emotional-tone adaptation",
      reason: "Block 2C Section 12, category 5: no approved source content exists for tone-adapted phrasing; requires net-new Founder authoring, never derived by this mapper.",
    },
  };
}

export function mapCareIntelligenceCandidates(products: SourceProduct[]): CareMapperResult {
  const categoryOne = categoryOneWorkflows();
  const categoryTwo = categoryTwoWorkflows(products);
  const emotionalTone = requestEmotionalToneWorkflow();

  return {
    projections: [...categoryOne, ...categoryTwo],
    rejected: [emotionalTone.rejected],
  };
}
