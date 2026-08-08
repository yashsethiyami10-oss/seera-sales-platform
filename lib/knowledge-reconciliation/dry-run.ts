/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A), Phase 13.
 *
 * Dry-run manifest orchestrator. Reads real source data (Product,
 * ProductContent, PublishedKnowledgeRecord, and the — currently empty —
 * four intelligence tables), runs every mapper, validates every
 * projection, and returns one structured manifest.
 *
 * Zero database writes occur anywhere in this file or anything it calls.
 * This mirrors `lib/knowledge-publisher/publisher.ts`'s own `dryRun: true`
 * branch, which stops before `applyPublishPlan()` — this module has no
 * equivalent "apply" branch at all; it cannot write even if asked to.
 */

import { fetchAllProducts, fetchExistingIntelligenceKeys, fetchPublishedKnowledgeRecords, fetchSourceCounts } from "./sources";
import { mapAllKnowledgeItemProjections } from "./knowledge-item-mapper";
import { mapAllProductIntelligenceProjections } from "./product-intelligence-mapper";
import { mapProblemIntelligenceCandidates } from "./problem-intelligence-mapper";
import { mapCareIntelligenceCandidates } from "./care-intelligence-mapper";
import { runGovernanceValidation } from "./governance-validation";
import { buildExistingKeyIndex, computeContentHash, computeProposedOperation } from "./identity";
import { FOUNDER_POLICY } from "./policy";
import type { AnyProjection, DryRunManifest, TargetModel } from "./types";

function naturalKeyFor(projection: AnyProjection): { targetModel: TargetModel; naturalKey: string } {
  switch (projection.targetModel) {
    case "KnowledgeItem":
      return { targetModel: "KnowledgeItem", naturalKey: projection.slug };
    case "ProductIntelligence":
      return { targetModel: "ProductIntelligence", naturalKey: projection.productId };
    case "ProblemIntelligence":
      return { targetModel: "ProblemIntelligence", naturalKey: projection.deterministicKey };
    case "CareIntelligence":
      return { targetModel: "CareIntelligence", naturalKey: projection.deterministicKey };
  }
}

/**
 * Runs the full, read-only reconciliation dry run against real
 * ep-falling-heart data. Safe to call repeatedly — see `identity.ts`'s
 * `assertDeterministicRerun()` and this block's own idempotency tests.
 */
export async function runReconciliationDryRun(): Promise<DryRunManifest> {
  const startedAt = new Date();

  const [products, kfRecords, counts, existing] = await Promise.all([
    fetchAllProducts(),
    fetchPublishedKnowledgeRecords(),
    fetchSourceCounts(),
    fetchExistingIntelligenceKeys(),
  ]);

  const knowledgeItemProjections = mapAllKnowledgeItemProjections(kfRecords);
  const productIntelligenceProjections = mapAllProductIntelligenceProjections(products, kfRecords);
  const { projections: problemIntelligenceProjections, rejected: rejectedProblems } = mapProblemIntelligenceCandidates(products);
  const { projections: careIntelligenceProjections, rejected: rejectedCareWorkflows } = mapCareIntelligenceCandidates(products);

  const allProjections: AnyProjection[] = [
    ...knowledgeItemProjections,
    ...productIntelligenceProjections,
    ...problemIntelligenceProjections,
    ...careIntelligenceProjections,
  ];

  // Finalize each projection's proposed write operation against the real
  // (currently empty) existing-row index — read-only comparison only.
  const existingIndex = buildExistingKeyIndex(existing);
  for (const projection of allProjections) {
    const { targetModel, naturalKey } = naturalKeyFor(projection);
    const contentHash = computeContentHash(projection);
    const { op, rollback } = computeProposedOperation(targetModel, naturalKey, contentHash, null, existingIndex);
    (projection as { proposedWriteOperation: unknown }).proposedWriteOperation = op;
    (projection as { proposedRollbackIdentity: unknown }).proposedRollbackIdentity = rollback;
  }

  const governance = runGovernanceValidation(allProjections);

  const totals = {
    customerSafeEligible: allProjections.filter((p) => p.governanceClassification === "CUSTOMER_SAFE").length,
    internalOnly: allProjections.filter((p) => p.governanceClassification === "INTERNAL_ONLY").length,
    founderReviewRequired: allProjections.filter((p) => p.governanceClassification === "FOUNDER_REVIEW_REQUIRED").length,
    rejected: allProjections.filter((p) => p.governanceClassification === "REJECTED").length,
    deprecated: allProjections.filter((p) => p.governanceClassification === "DEPRECATED").length,
    proposedCreate: allProjections.filter((p) => p.proposedWriteOperation.op === "CREATE").length,
    proposedUpdate: allProjections.filter((p) => p.proposedWriteOperation.op === "UPDATE").length,
    proposedTouch: allProjections.filter((p) => p.proposedWriteOperation.op === "TOUCH").length,
    proposedArchive: allProjections.filter((p) => p.proposedWriteOperation.op === "ARCHIVE").length,
    proposedSkip: allProjections.filter((p) => p.proposedWriteOperation.op === "SKIP").length,
  };

  const founderReviewQueue = allProjections
    .filter((p) => p.reviewStatus === "REQUIRED")
    .map((p) => ({ deterministicKey: p.deterministicKey, targetModel: p.targetModel, reason: p.warnings.map((w) => w.message).join("; ") || "Governance classification requires Founder review before promotion." }));

  const excludedRecords = [
    ...rejectedProblems.map((r) => ({ sourceId: `${r.productName}:${r.question}`, sourceType: "PRODUCT_CONTENT" as const, reason: r.reason })),
    ...rejectedCareWorkflows.map((r) => ({ sourceId: r.workflowName, sourceType: "FOUNDER_POLICY" as const, reason: r.reason })),
  ];

  const conflicts = allProjections
    .filter((p) => p.conflictStatus === "DETECTED_UNRESOLVED")
    .map((p) => ({ deterministicKey: p.deterministicKey, description: `Unresolved conflict on ${p.targetModel} ${p.deterministicKey} — see fieldResolutions/rejectedAlternatives for detail.` }));

  const warnings = allProjections.flatMap((p) => p.warnings);

  return {
    mode: "DRY_RUN",
    generatedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    founderPolicyVersion: FOUNDER_POLICY.version,

    sourceInventory: {
      productCount: counts.productCount,
      variantCount: counts.variantCount,
      productContentCount: counts.productContentCount,
      publishedKnowledgeRecordCount: counts.publishedKnowledgeRecordCount,
    },

    knowledgeItemProjections,
    productIntelligenceProjections,
    problemIntelligenceProjections,
    careIntelligenceProjections,

    excludedRecords,
    blockedRecords: governance.findings
      .filter((f) => f.populationBlocker)
      .map((f) => ({ deterministicKey: f.targetKey, targetModel: f.targetModel, reason: f.failureReason })),
    conflicts,
    warnings,
    founderReviewQueue,

    totals,
    governance,
  };
}
