/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A), Phase 10.
 *
 * Decision Intelligence input contract. This module builds the typed
 * input a *future*, separately-approved Decision Intelligence step would
 * consume — it does not classify intent, does not call a provider, and
 * does not make any decision itself. Every value here is assembled by
 * selecting from already-computed projections.
 */

import type { AnyProjection, AuthorizationContext, ConfidenceLevel, DecisionIntelligenceInput } from "./types";

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };

function lowestConfidence(projections: AnyProjection[]): ConfidenceLevel {
  if (projections.length === 0) return "LOW";
  return projections.reduce<ConfidenceLevel>((min, p) => (CONFIDENCE_RANK[p.confidence] < CONFIDENCE_RANK[min] ? p.confidence : min), "HIGH");
}

/**
 * Builds one `DecisionIntelligenceInput` from a set of projections already
 * judged relevant to a hypothetical question — relevance selection itself
 * belongs to the future retrieval step, not this function. Given a set,
 * this function only ever aggregates/reads from it; it never fetches or
 * infers anything additional.
 */
export function buildDecisionIntelligenceInput(input: {
  authorizationContext: AuthorizationContext;
  relevantProjections: AnyProjection[];
  permittedToolNames: string[];
}): DecisionIntelligenceInput {
  const { authorizationContext, relevantProjections, permittedToolNames } = input;

  const knowledgeItemReferences = relevantProjections
    .filter((p) => p.targetModel === "KnowledgeItem")
    .map((p) => ({ deterministicKey: p.deterministicKey, customerSafeEligible: p.customerSafeEligible, runtimeEligible: p.runtimeEligible }));

  const productIntelligenceReferences = relevantProjections
    .filter((p): p is Extract<AnyProjection, { targetModel: "ProductIntelligence" }> => p.targetModel === "ProductIntelligence")
    .map((p) => ({ deterministicKey: p.deterministicKey, productId: p.productId, customerSafeEligible: p.customerSafeEligible, runtimeEligible: p.runtimeEligible }));

  const problemIntelligenceReferences = relevantProjections
    .filter((p) => p.targetModel === "ProblemIntelligence")
    .map((p) => ({ deterministicKey: p.deterministicKey, customerSafeEligible: p.customerSafeEligible, runtimeEligible: p.runtimeEligible }));

  const careIntelligenceReferences = relevantProjections
    .filter((p) => p.targetModel === "CareIntelligence")
    .map((p) => ({ deterministicKey: p.deterministicKey, customerSafeEligible: p.customerSafeEligible, runtimeEligible: p.runtimeEligible }));

  const conflicts = relevantProjections
    .filter((p) => p.conflictStatus !== "NONE")
    .map((p) => ({ deterministicKey: p.deterministicKey, conflictStatus: p.conflictStatus }));

  const missingInformation = relevantProjections.flatMap((p) => p.missingFields.map((f) => `${p.deterministicKey}: ${f}`));

  const noneRuntimeEligible = relevantProjections.length > 0 && relevantProjections.every((p) => !p.runtimeEligible);

  return {
    // Intent classification is explicitly out of this block's scope
    // (Phase 10: "Do not build a new autonomous Decision Intelligence
    // engine") — always null here, populated only by the future runtime
    // step this contract is designed to feed.
    questionIntent: null,
    authorizationContext,
    knowledgeItemReferences,
    productIntelligenceReferences,
    problemIntelligenceReferences,
    careIntelligenceReferences,
    confidence: lowestConfidence(relevantProjections),
    conflicts,
    missingInformation,
    clarificationRequired: conflicts.length > 0 || noneRuntimeEligible,
    permittedToolCalls: permittedToolNames,
    // Every tool that could return internal-only Product fields
    // (per the Governed Runtime Activation audit's own findings) is
    // explicitly named as prohibited here, never left to be inferred.
    prohibitedToolCalls: ["commerce.getProduct.ingredients", "knowledge.fetchManufacturingDetail"],
    escalationRequired: relevantProjections.some((p) => p.targetModel === "CareIntelligence" && p.governanceClassification !== "CUSTOMER_SAFE" && p.reviewStatus === "REQUIRED"),
    founderPolicyChecksRequired: ["productContentEligibility", "customerSafePromotionList", "ingredientDisclosurePolicy"],
    responseValidationRequirements: ["grounding-check: response must cite only runtimeEligible=true references", "confidentiality-check: response must not contain any excludedFields content"],
    sourceCitations: relevantProjections.flatMap((p) => p.sources),
    confidentialityBoundaries: ["Product.ingredients", "manufacturing formula/ratios/sequence", "supplier details"],
  };
}
