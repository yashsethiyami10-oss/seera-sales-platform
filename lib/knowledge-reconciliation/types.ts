/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A).
 *
 * Shared types for the read-only, governed reconciliation mapper that
 * produces typed projections toward the four frozen intelligence layers
 * (KnowledgeItem, ProductIntelligence, ProblemIntelligence,
 * CareIntelligence). This module never writes to any of those tables —
 * every function under `lib/knowledge-reconciliation/` returns data only.
 * The actual write step is a separate, later, explicitly-approved block
 * (2D onward per the Block 1/2C governance reports).
 *
 * Naming and shapes here deliberately mirror two existing, frozen
 * precedents rather than inventing new ones:
 *  - `lib/knowledge-publisher/types.ts`'s `PublishReport`/`ValidationIssue`
 *    shape (mode, totals, warnings/errors, perDomainTotals) for the
 *    dry-run manifest.
 *  - `lib/knowledge-publisher/diff.ts`'s `PublishPlan` shape
 *    (toInsert/toUpdate/toTouch/toArchive) for idempotency.
 *  - `prisma/schema.prisma`'s own `ProblemConfidenceLevel` vocabulary
 *    (LOW/MODERATE/HIGH, deliberately no "certain" value) for confidence.
 */

import type { KnowledgeLayer, ProblemProductSuitability } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

/** Governance classification — Block 2C, Section 8. No automatic
 * INTERNAL_ONLY -> CUSTOMER_SAFE transition exists anywhere in this module;
 * every projection defaults to the most restrictive classification its
 * evidence supports. */
export type GovernanceClassification = "INTERNAL_ONLY" | "CUSTOMER_SAFE" | "FOUNDER_REVIEW_REQUIRED" | "REJECTED" | "DEPRECATED";

export type ConflictStatus = "NONE" | "DETECTED_RESOLVED" | "DETECTED_UNRESOLVED";

/** Reuses `ProblemConfidenceLevel`'s own vocabulary/rationale (schema
 * comment: "must never force a ... recommendation where information does
 * not justify one") — no "CERTAIN" value exists anywhere in this module. */
export type ConfidenceLevel = "LOW" | "MODERATE" | "HIGH";

export type SourceType =
  | "PRODUCT"
  | "PRODUCT_VARIANT"
  | "PRODUCT_CONTENT"
  | "PUBLISHED_KNOWLEDGE_RECORD"
  | "FOUNDER_POLICY"
  | "DETERMINISTIC_DERIVATION";

export type SourceReference = {
  sourceType: SourceType;
  /** The real id/sourceId from the origin row — e.g. `Product.id`,
   * `ProductContent.id`, `PublishedKnowledgeRecord.sourceId`. Never a
   * synthetic id. */
  sourceId: string;
  /** `PublishedKnowledgeRecord.version` (number), `ProductContent.updatedAt`
   * (ISO string), or null when the source has no version concept. */
  sourceVersion: string | number | null;
  /** The source's own approval-status label, preserved verbatim — never
   * upgraded, never inferred. Null when the source has no approval concept
   * (e.g. live `Product`/`ProductVariant` commercial data). */
  sourceApprovalStatus: string | null;
  /** Human-readable pointer, e.g. "ProductContent.safetyInformation" or
   * "PublishedKnowledgeRecord:PRODUCT_KF:KO-LD-MFG-001". */
  label: string;
};

export type FieldIssue = { code: string; message: string };

/** One field's precedence resolution — Phase 5. Every mapped field in every
 * projection carries one of these; nothing is selected without a recorded
 * reason. */
export type FieldResolution = {
  field: string;
  selectedValue: unknown;
  selectedSource: SourceReference | null;
  rejectedAlternatives: { value: unknown; source: SourceReference; reason: string }[];
  reason: string;
  conflictStatus: ConflictStatus;
  /** The *selected* source's own approval status, verbatim (not the
   * projection's overall governance classification). */
  approvalStatus: string | null;
  customerSafeEligible: boolean;
  reviewRequired: boolean;
};

export type ProposedWriteOperation =
  | { op: "CREATE"; targetModel: string }
  | { op: "UPDATE"; targetModel: string; existingId: string }
  | { op: "TOUCH"; targetModel: string; existingId: string }
  | { op: "ARCHIVE"; targetModel: string; existingId: string }
  | { op: "SKIP"; targetModel: string; reason: string };

export type RollbackIdentity = {
  targetModel: string;
  deterministicKey: string;
  /** All four intelligence tables are empty today (Block 1/2C baseline) —
   * this is always null in the current environment, typed now so a future,
   * separately-approved writer can populate it once real rows exist. */
  previousVersionId: string | null;
};

// ---------------------------------------------------------------------------
// Base projection — shared by all four target models
// ---------------------------------------------------------------------------

export type TargetModel = "KnowledgeItem" | "ProductIntelligence" | "ProblemIntelligence" | "CareIntelligence";

export type BaseProjection = {
  /** Deterministic, derived from source data only — see `identity.ts`.
   * Re-running the mapper against unchanged sources always produces the
   * same key (Phase 14). */
  deterministicKey: string;
  targetModel: TargetModel;
  targetRecordType: string;
  sources: SourceReference[];
  /** Ordered `SourceType`s reflecting the frozen precedence for this
   * specific projection (Section 5) — first entry is the source that was
   * actually used, when one was found. */
  sourcePriority: SourceType[];
  governanceClassification: GovernanceClassification;
  customerSafeEligible: boolean;
  /** = customerSafeEligible && conflictStatus !== "DETECTED_UNRESOLVED" &&
   * activeStatus === "ACTIVE" && sources.length > 0 && errors.length === 0.
   * Computed, never set independently — see `computeRuntimeEligibility()`. */
  runtimeEligible: boolean;
  activeStatus: "ACTIVE" | "DEPRECATED";
  conflictStatus: ConflictStatus;
  confidence: ConfidenceLevel;
  reviewStatus: "NOT_REQUIRED" | "REQUIRED";
  mappedFields: string[];
  excludedFields: { field: string; reason: string }[];
  missingFields: string[];
  warnings: FieldIssue[];
  errors: FieldIssue[];
  relationshipReferences: { targetModel: TargetModel; targetKey: string; relationType: string }[];
  /** Citation-style provenance strings, matching `ProductContent
   * .sourceProvenance`'s existing convention — one entry per mapped field. */
  provenance: Record<string, string>;
  proposedWriteOperation: ProposedWriteOperation;
  proposedRollbackIdentity: RollbackIdentity;
};

// ---------------------------------------------------------------------------
// KnowledgeItem projection
// ---------------------------------------------------------------------------

export type KnowledgeItemFileType = "KNOWLEDGE_LIBRARY" | "POLICY" | "FAQ" | "SOP";

export type KnowledgeItemProjection = BaseProjection & {
  targetModel: "KnowledgeItem";
  slug: string;
  title: string;
  fileType: KnowledgeItemFileType;
  layer: KnowledgeLayer;
  content: string;
  productId: string | null;
};

// ---------------------------------------------------------------------------
// ProductIntelligence projection
// ---------------------------------------------------------------------------

export type ProductIntelligenceSections = {
  productIdentity?: string;
  purpose?: string;
  problemsSolved?: string[];
  features?: string[];
  benefits?: string[];
  /** Internal-only by frozen policy — see Block 2C Section 13. This field
   * is populated ONLY on projections whose `governanceClassification` is
   * `INTERNAL_ONLY`; a projection carrying non-empty `ingredients` may
   * never simultaneously be `CUSTOMER_SAFE` (enforced in
   * `governance-validation.ts`, rule `CONFIDENTIAL_CONTENT_PRESENT`). */
  ingredients?: string;
  usageInstructions?: string;
  safetyInformation?: string;
  doDont?: { do: string[]; dont: string[] };
  faqs?: { question: string; answer: string }[];
  objectionHandling?: { objection: string; response: string }[];
  comparisonNotes?: string;
  crossSellSuggestions?: string[];
  storageInstructions?: string;
  shelfLife?: string;
};

export type VariantReference = {
  variantId: string;
  sku: string;
  size: string;
  /** Names the approved Dispatcher tool that resolves this variant's
   * *current* price — never a stored figure. Matches the frozen commercial
   * data rule: ProductIntelligence -> identity/reference only -> Dispatcher
   * -> `commerce.getPricing`/`commerce.getAvailability` -> current data. */
  priceResolutionTool: "commerce.getPricing";
  availabilityResolutionTool: "commerce.getAvailability";
};

export type ProductIntelligenceProjection = BaseProjection & {
  targetModel: "ProductIntelligence";
  productId: string;
  productName: string;
  productSlug: string;
  /** Grouping/relationship layer only (Block 1 Section 14, Block 2C
   * Decision 6) — never a second identity. Null for the 8 single-SKU
   * families. */
  familyId: string | null;
  layer: KnowledgeLayer;
  sections: ProductIntelligenceSections;
  fieldResolutions: FieldResolution[];
  variants: VariantReference[];
  suitability: { suitableContexts: string[]; unsuitableContexts: string[] };
};

// ---------------------------------------------------------------------------
// ProblemIntelligence projection
// ---------------------------------------------------------------------------

export type ProblemDerivationMethod = "SOURCE_BACKED" | "DETERMINISTIC_DERIVATION" | "FOUNDER_REVIEW_REQUIRED" | "PROHIBITED" | "UNSUPPORTED";

export type ProblemIntelligenceProjection = BaseProjection & {
  targetModel: "ProblemIntelligence";
  canonicalProblem: string;
  aliases: string[];
  /** Empty today for every candidate — Block 2C Decision 4 (deferred to a
   * fast-follow content pass); never machine-translated by this mapper. */
  hindiAliases: string[];
  hinglishAliases: string[];
  category: string;
  derivationMethod: ProblemDerivationMethod;
  affectedProducts: { productId: string; suitability: ProblemProductSuitability; confidence: ConfidenceLevel }[];
  affectedCategories: string[];
  requiredClarification: string[];
  suitableProductIds: string[];
  unsuitableProductIds: string[];
  safetyRisks: string[];
  relatedCareWorkflowKeys: string[];
};

// ---------------------------------------------------------------------------
// CareIntelligence projection
// ---------------------------------------------------------------------------

export type CareDerivationMethod = "SOURCE_BACKED" | "DETERMINISTIC_DERIVATION" | "FOUNDER_REVIEW_REQUIRED" | "PROHIBITED" | "UNSUPPORTED";

export type CareIntelligenceProjection = BaseProjection & {
  targetModel: "CareIntelligence";
  workflowName: string;
  slug: string;
  trigger: string;
  derivationMethod: CareDerivationMethod;
  requiredClarification: string[];
  safeResponseSequence: string[];
  productRecommendationConstraints: string[];
  directions: string[];
  precautions: string[];
  prohibitedAdvice: string[];
  unsafeMixingWarnings: string[];
  escalationConditions: string[];
  humanHandoffConditions: string[];
  emotionalToneGuidance: string | null;
  confidenceThreshold: ConfidenceLevel;
  unsupportedClaimHandling: string | null;
  nonexistentProductHandling: string | null;
  relatedProductIntelligenceKeys: string[];
  relatedProblemIntelligenceKeys: string[];
};

export type AnyProjection = KnowledgeItemProjection | ProductIntelligenceProjection | ProblemIntelligenceProjection | CareIntelligenceProjection;

// ---------------------------------------------------------------------------
// Decision Intelligence input contract (Phase 10) — a typed shape only.
// This module builds one FROM already-computed projections; it never
// classifies intent, never calls a provider, never makes a decision.
// ---------------------------------------------------------------------------

export type AuthorizationContext = {
  isGuest: boolean;
  customerId: string | null;
  role: "ANONYMOUS" | "CUSTOMER" | "STAFF" | "ADMIN";
};

export type DecisionIntelligenceInput = {
  questionIntent: string | null;
  authorizationContext: AuthorizationContext;
  knowledgeItemReferences: { deterministicKey: string; customerSafeEligible: boolean; runtimeEligible: boolean }[];
  productIntelligenceReferences: { deterministicKey: string; productId: string; customerSafeEligible: boolean; runtimeEligible: boolean }[];
  problemIntelligenceReferences: { deterministicKey: string; customerSafeEligible: boolean; runtimeEligible: boolean }[];
  careIntelligenceReferences: { deterministicKey: string; customerSafeEligible: boolean; runtimeEligible: boolean }[];
  confidence: ConfidenceLevel;
  conflicts: { deterministicKey: string; conflictStatus: ConflictStatus }[];
  missingInformation: string[];
  clarificationRequired: boolean;
  permittedToolCalls: string[];
  prohibitedToolCalls: string[];
  escalationRequired: boolean;
  founderPolicyChecksRequired: string[];
  responseValidationRequirements: string[];
  sourceCitations: SourceReference[];
  confidentialityBoundaries: string[];
};

// ---------------------------------------------------------------------------
// Governance Validation contract (Phase 11)
// ---------------------------------------------------------------------------

export type ValidationRuleId =
  | "SOURCE_UNAPPROVED"
  | "SOURCE_TRACE_MISSING"
  | "SOURCE_INACTIVE"
  | "INTERNAL_MARKED_CUSTOMER_SAFE"
  | "UNRESOLVED_CONFLICT"
  | "CONFIDENTIAL_CONTENT_PRESENT"
  | "UNSUPPORTED_CLAIM"
  | "INVALID_PRODUCT_IDENTITY"
  | "INVALID_PRODUCT_RELATIONSHIP"
  | "VARIANT_IDENTITY_UNRESOLVED"
  | "FAMILY_INHERITANCE_OVERWRITE"
  | "STALE_COMMERCIAL_SOURCE"
  | "SAFETY_DATA_CONFLICT"
  | "UNSUPPORTED_PROBLEM_MAPPING"
  | "UNSUPPORTED_CARE_WORKFLOW"
  // Corrective Confidentiality Hardening (post-Founder-audit Finding H1) —
  // see lib/knowledge-reconciliation/confidentiality-scanner.ts. Fires
  // when the content-aware scanner finds a RESTRICTED_INTERNAL_FORMULATION
  // or FOUNDER_REVIEW_REQUIRED term anywhere in a projection's own
  // content, not just the dedicated `ingredients` field.
  | "RESTRICTED_CONTENT_DETECTED";

export type ValidationFinding = {
  ruleId: ValidationRuleId;
  severity: "ERROR" | "WARNING";
  targetModel: TargetModel;
  targetKey: string;
  sourceRecord: string | null;
  failureReason: string;
  requiredCorrection: string;
  founderReviewRequired: boolean;
  populationBlocker: boolean;
};

export type GovernanceValidationResult = {
  findings: ValidationFinding[];
  blockerCount: number;
  passed: boolean;
};

// ---------------------------------------------------------------------------
// Dry-run manifest (Phase 13) — mirrors `PublishReport`'s shape/spirit.
// ---------------------------------------------------------------------------

export type DryRunManifest = {
  mode: "DRY_RUN";
  generatedAt: string;
  durationMs: number;
  founderPolicyVersion: string;

  sourceInventory: {
    productCount: number;
    variantCount: number;
    productContentCount: number;
    publishedKnowledgeRecordCount: number;
  };

  knowledgeItemProjections: KnowledgeItemProjection[];
  productIntelligenceProjections: ProductIntelligenceProjection[];
  problemIntelligenceProjections: ProblemIntelligenceProjection[];
  careIntelligenceProjections: CareIntelligenceProjection[];

  excludedRecords: { sourceId: string; sourceType: SourceType; reason: string }[];
  blockedRecords: { deterministicKey: string; targetModel: TargetModel; reason: string }[];
  conflicts: { deterministicKey: string; description: string }[];
  warnings: FieldIssue[];
  founderReviewQueue: { deterministicKey: string; targetModel: TargetModel; reason: string }[];

  totals: {
    customerSafeEligible: number;
    internalOnly: number;
    founderReviewRequired: number;
    rejected: number;
    deprecated: number;
    proposedCreate: number;
    proposedUpdate: number;
    proposedTouch: number;
    proposedArchive: number;
    proposedSkip: number;
  };

  governance: GovernanceValidationResult;
};
