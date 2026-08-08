/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A), Phase 11.
 *
 * Governance Validation contract. Read-only: inspects already-computed
 * projections and reports findings — never mutates a projection, never
 * touches the database.
 */

import type { AnyProjection, GovernanceValidationResult, ProductIntelligenceProjection, ValidationFinding } from "./types";
import { FOUNDER_POLICY } from "./policy";
import { scanValueForConfidentiality, hasBlockingConfidentialityFindings } from "./confidentiality-scanner";

function isProductIntelligence(p: AnyProjection): p is ProductIntelligenceProjection {
  return p.targetModel === "ProductIntelligence";
}

/** The content-bearing subset of a projection worth scanning — excludes
 * bookkeeping fields (ids, sources, provenance, deterministicKey) that
 * are never free-text content a customer could ever see, so the scanner
 * never wastes a finding on an internal id string. */
function contentBearingSubset(projection: AnyProjection): unknown {
  switch (projection.targetModel) {
    case "KnowledgeItem":
      return { title: projection.title, content: projection.content };
    case "ProductIntelligence":
      return { sections: projection.sections, variants: projection.variants };
    case "ProblemIntelligence":
      return {
        canonicalProblem: projection.canonicalProblem,
        aliases: projection.aliases,
        category: projection.category,
        affectedCategories: projection.affectedCategories,
        requiredClarification: projection.requiredClarification,
        safetyRisks: projection.safetyRisks,
      };
    case "CareIntelligence":
      return {
        workflowName: projection.workflowName,
        trigger: projection.trigger,
        requiredClarification: projection.requiredClarification,
        safeResponseSequence: projection.safeResponseSequence,
        productRecommendationConstraints: projection.productRecommendationConstraints,
        directions: projection.directions,
        precautions: projection.precautions,
        prohibitedAdvice: projection.prohibitedAdvice,
        unsafeMixingWarnings: projection.unsafeMixingWarnings,
        escalationConditions: projection.escalationConditions,
        humanHandoffConditions: projection.humanHandoffConditions,
        emotionalToneGuidance: projection.emotionalToneGuidance,
        unsupportedClaimHandling: projection.unsupportedClaimHandling,
        nonexistentProductHandling: projection.nonexistentProductHandling,
      };
  }
}

export function validateProjection(projection: AnyProjection): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const push = (finding: Omit<ValidationFinding, "targetModel" | "targetKey">) =>
    findings.push({ ...finding, targetModel: projection.targetModel, targetKey: projection.deterministicKey });

  // SOURCE_UNAPPROVED / SOURCE_TRACE_MISSING
  if (projection.sources.length === 0) {
    push({
      ruleId: "SOURCE_TRACE_MISSING",
      severity: "ERROR",
      sourceRecord: null,
      failureReason: "Projection has zero source references.",
      requiredCorrection: "Do not populate this record until a real source is found.",
      founderReviewRequired: true,
      populationBlocker: true,
    });
  }

  // SOURCE_INACTIVE
  if (projection.activeStatus === "DEPRECATED") {
    push({
      ruleId: "SOURCE_INACTIVE",
      severity: "WARNING",
      sourceRecord: null,
      failureReason: "Projection's underlying source is no longer active.",
      requiredCorrection: "Archive rather than populate.",
      founderReviewRequired: false,
      populationBlocker: true,
    });
  }

  // INTERNAL_MARKED_CUSTOMER_SAFE — the core Block 2C Section 8 rule.
  if (projection.governanceClassification === "CUSTOMER_SAFE") {
    const allEligible = projection.sources.every((s) => s.sourceApprovalStatus === "APPROVED");
    if (!allEligible) {
      push({
        ruleId: "INTERNAL_MARKED_CUSTOMER_SAFE",
        severity: "ERROR",
        sourceRecord: null,
        failureReason: "Marked CUSTOMER_SAFE without every source being APPROVED — violates the no-automatic-promotion rule.",
        requiredCorrection: "Downgrade to FOUNDER_REVIEW_REQUIRED until an explicit promotion decision exists.",
        founderReviewRequired: true,
        populationBlocker: true,
      });
    }
  }

  // UNRESOLVED_CONFLICT
  if (projection.conflictStatus === "DETECTED_UNRESOLVED") {
    push({
      ruleId: "UNRESOLVED_CONFLICT",
      severity: "ERROR",
      sourceRecord: null,
      failureReason: "One or more fields have conflicting source values with no Founder resolution.",
      requiredCorrection: "Route to the Founder-review queue; never silently pick a side.",
      founderReviewRequired: true,
      populationBlocker: true,
    });
  }

  // CONFIDENTIAL_CONTENT_PRESENT — Ingredients/formulation must never
  // coexist with a CUSTOMER_SAFE classification.
  if (isProductIntelligence(projection)) {
    const hasIngredients = Boolean(projection.sections.ingredients);
    if (hasIngredients && projection.governanceClassification === "CUSTOMER_SAFE") {
      push({
        ruleId: "CONFIDENTIAL_CONTENT_PRESENT",
        severity: "ERROR",
        sourceRecord: projection.productId,
        failureReason: "Ingredients section is populated on a CUSTOMER_SAFE-classified projection.",
        requiredCorrection: "Remove the ingredients section, or downgrade the classification — never both stay true.",
        founderReviewRequired: true,
        populationBlocker: true,
      });
    }

    // INVALID_PRODUCT_IDENTITY
    if (!projection.productId || !projection.productSlug) {
      push({
        ruleId: "INVALID_PRODUCT_IDENTITY",
        severity: "ERROR",
        sourceRecord: projection.productId || null,
        failureReason: "Missing productId or productSlug.",
        requiredCorrection: "Do not populate without a valid Product identity.",
        founderReviewRequired: false,
        populationBlocker: true,
      });
    }

    // VARIANT_IDENTITY_UNRESOLVED
    if (projection.variants.length === 0) {
      push({
        ruleId: "VARIANT_IDENTITY_UNRESOLVED",
        severity: "WARNING",
        sourceRecord: projection.productId,
        failureReason: "No ProductVariant could be resolved for this Product.",
        requiredCorrection: "Confirm the Product genuinely has zero variants before populating.",
        founderReviewRequired: true,
        populationBlocker: false,
      });
    }

    // STALE_COMMERCIAL_SOURCE — a projection must never carry a
    // PublishedKnowledgeRecord-sourced price/mrp/stock value.
    const commercialFromStaleSource = projection.sources.some(
      (s) => s.sourceType === "PUBLISHED_KNOWLEDGE_RECORD" && /price|mrp|stock/i.test(s.label)
    );
    if (commercialFromStaleSource) {
      push({
        ruleId: "STALE_COMMERCIAL_SOURCE",
        severity: "ERROR",
        sourceRecord: projection.productId,
        failureReason: "Commercial data appears to be sourced from a publication record rather than live ProductVariant data.",
        requiredCorrection: "Route all price/MRP/stock through the Dispatcher's live commerce tools only.",
        founderReviewRequired: false,
        populationBlocker: true,
      });
    }

    // FAMILY_INHERITANCE_OVERWRITE — a family relationship must never be
    // accompanied by a family-sourced fragrance/price/pack-size field.
    const familyRelationship = projection.relationshipReferences.some((r) => r.relationType === "FAMILY_MEMBER");
    if (familyRelationship) {
      const familySourcedProductSpecificField = projection.fieldResolutions.some(
        (r) => ["fragrance", "price", "mrp", "packSize"].includes(r.field) && r.selectedSource?.sourceType === "PUBLISHED_KNOWLEDGE_RECORD"
      );
      if (familySourcedProductSpecificField) {
        push({
          ruleId: "FAMILY_INHERITANCE_OVERWRITE",
          severity: "ERROR",
          sourceRecord: projection.productId,
          failureReason: "A Product-specific field appears to have been inherited from family-level content.",
          requiredCorrection: "Product-specific facts must always come from Product/ProductVariant/ProductContent, never family KF content.",
          founderReviewRequired: true,
          populationBlocker: true,
        });
      }
    }
  }

  // RESTRICTED_CONTENT_DETECTED — Corrective Confidentiality Hardening
  // (post-Founder-audit Finding H1). The prior CONFIDENTIAL_CONTENT_PRESENT
  // rule above only ever checked the dedicated `sections.ingredients`
  // field; real raw-material identifiers (SLES/CAPB/CDEA) were found
  // inside `productIdentity`, a field with no such check. This rule scans
  // every free-text field of the projection's own content (recursively,
  // including nested arrays/objects) via the centralized scanner. Mirrors
  // CONFIDENTIAL_CONTENT_PRESENT's own severity/condition exactly — it
  // only ever blocks when the projection is marked CUSTOMER_SAFE, since
  // an INTERNAL/FOUNDER_REVIEW_REQUIRED projection carrying this content
  // is the correct, safe, already-governed state (see the Hand Wash
  // family's own real classification). Findings are always attached for
  // evidence, even when non-blocking, so Founder review always has the
  // full picture rather than only a pass/fail signal.
  const confidentialityFindings = scanValueForConfidentiality(contentBearingSubset(projection), "content", {
    sourceReference: isProductIntelligence(projection) ? projection.productId : projection.deterministicKey,
  });
  if (hasBlockingConfidentialityFindings(confidentialityFindings)) {
    const restricted = confidentialityFindings.filter((f) => f.classification === "RESTRICTED_INTERNAL_FORMULATION" || f.classification === "FOUNDER_REVIEW_REQUIRED");
    const evidence = restricted.map((f) => `${f.fieldPath}: "${f.originalMatch}" (${f.category})`).join("; ");
    push({
      ruleId: "RESTRICTED_CONTENT_DETECTED",
      severity: "ERROR",
      sourceRecord: isProductIntelligence(projection) ? projection.productId : null,
      failureReason: `Content-aware scan found restricted/ambiguous formulation content: ${evidence}.`,
      requiredCorrection: "Never permit this projection to become CUSTOMER_SAFE/PUBLIC while this content remains. If CUSTOMER_SAFE was requested, downgrade to FOUNDER_REVIEW_REQUIRED.",
      founderReviewRequired: true,
      // Only a population-blocking condition when the projection is
      // simultaneously marked CUSTOMER_SAFE — an INTERNAL/FOUNDER_REVIEW_
      // REQUIRED projection carrying this content may still populate
      // (exactly like CONFIDENTIAL_CONTENT_PRESENT above), it simply can
      // never simultaneously be customer-safe-eligible.
      populationBlocker: projection.governanceClassification === "CUSTOMER_SAFE",
    });
  }

  // Field-resolution-level checks common to any projection with them.
  const fieldResolutions = isProductIntelligence(projection) ? projection.fieldResolutions : [];
  for (const resolution of fieldResolutions) {
    if (resolution.approvalStatus === "PENDING" && resolution.customerSafeEligible && projection.governanceClassification === "CUSTOMER_SAFE") {
      push({
        ruleId: "SOURCE_UNAPPROVED",
        severity: "ERROR",
        sourceRecord: resolution.selectedSource?.sourceId ?? null,
        failureReason: `Field "${resolution.field}" is sourced from a PENDING record but marked customer-safe-eligible on a CUSTOMER_SAFE projection.`,
        requiredCorrection: "PENDING is never treated as APPROVED without an explicit Founder policy override (Decision 1).",
        founderReviewRequired: true,
        populationBlocker: true,
      });
    }
  }

  return findings;
}

export function runGovernanceValidation(projections: AnyProjection[]): GovernanceValidationResult {
  const findings = projections.flatMap(validateProjection);
  const blockerCount = findings.filter((f) => f.populationBlocker).length;
  return { findings, blockerCount, passed: blockerCount === 0 };
}

/** Exposed separately so tests/callers can confirm the Founder Policy
 * version referenced by every finding traces back to one frozen,
 * versioned document — never an unversioned inline assumption. */
export function currentFounderPolicyVersion(): string {
  return FOUNDER_POLICY.version;
}
