/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A).
 *
 * Public entry point. Every export from this module is read-only — no
 * function reachable from here writes to `KnowledgeItem`,
 * `ProductIntelligence`, `ProblemIntelligence`, `CareIntelligence`,
 * `PublishedKnowledgeRecord`, `Product`, `ProductContent`, or any other
 * table. A future, separately-approved Block 2D+ writer is expected to
 * import the dry-run manifest this module produces, not to extend this
 * module with a write path.
 */

export * from "./types";
export { FOUNDER_POLICY, getFamilyId, getProductContentEligibility, isIngredientDisclosureApproved, getExcludedFields } from "./policy";
export * from "./normalize";
export * from "./sources";
export * from "./identity";
export * from "./precedence";
export { mapKnowledgeItemProjection, mapAllKnowledgeItemProjections } from "./knowledge-item-mapper";
export { mapProductIntelligenceProjection, mapAllProductIntelligenceProjections, projectionPreservesProductSpecificFields } from "./product-intelligence-mapper";
export { mapProblemIntelligenceCandidates } from "./problem-intelligence-mapper";
export { mapCareIntelligenceCandidates, requestEmotionalToneWorkflow } from "./care-intelligence-mapper";
export { buildDecisionIntelligenceInput } from "./decision-input-contract";
export { validateProjection, runGovernanceValidation, currentFounderPolicyVersion } from "./governance-validation";
export { runReconciliationDryRun } from "./dry-run";
