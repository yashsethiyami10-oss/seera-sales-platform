/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A).
 *
 * Founder Policy contract (Phase 12). Every rule the mapper applies that
 * could plausibly change (a threshold, an approval override, a family
 * grouping) lives here, once, versioned — never scattered as inline
 * assumptions across the mapper files. This module holds configuration
 * only; it performs no I/O and makes no database calls.
 *
 * `FOUNDER_POLICY` below encodes exactly the six decisions frozen in
 * Block 2C's governance report — no additional assumption is introduced
 * here that Block 2C did not already recommend. Where Block 2C left a
 * decision open (e.g. the final CUSTOMER_SAFE promotion list), this
 * policy's default is the safe, non-promoting one, matching Block 2C
 * Section 8's "no automatic INTERNAL -> CUSTOMER_SAFE" rule.
 */

import type { GovernanceClassification, ConfidenceLevel } from "./types";

export type ProductContentEligibility = "APPROVED" | "APPROVED_WITH_EXCLUSIONS" | "FOUNDER_REVIEW_REQUIRED";

export type FounderPolicy = {
  version: string;
  frozenAt: string;

  /**
   * Block 2C Decision 1: 19 ProductContent records are approved as
   * authoritative reconciliation sources for their verified customer-facing
   * fields; Black Phenyl is approved with a citation-backfill condition.
   * Keyed by `Product.name` (stable, human-auditable) rather than by
   * database id, since this policy is meant to be readable/reviewable by
   * the Founder without a database lookup.
   */
  productContentEligibilityByProductName: Record<string, ProductContentEligibility>;
  /** The exact fields Block 2C flagged as citation-incomplete for a given
   * product. That specific field must stay FOUNDER_REVIEW_REQUIRED and
   * must never become CUSTOMER_SAFE until its source trace is complete —
   * enforced in `governance-validation.ts`. */
  productContentFieldExclusions: Record<string, string[]>;

  /** Block 2C Section 8: the safe default for any content this mapper
   * judges "customer-relevant-shaped" but has not been explicitly told to
   * promote further. Never CUSTOMER_SAFE by default. */
  defaultGovernanceClassification: GovernanceClassification;

  /** Block 2C Decision 5 (confirmed as understood, Option A): Ingredients
   * remain internal-only for all 20 products; no customer-safe disclosure
   * is approved. An empty array is the frozen, current state — populating
   * it requires a future, separately-approved Founder decision naming the
   * exact product and exact approved phrase, never a blanket toggle. */
  ingredientDisclosurePolicy: {
    defaultInternalOnly: true;
    approvedProductNames: string[];
  };

  /**
   * Block 1 Section 14 / Block 2C Decision 6: the interim family-grouping
   * convention — a plain string, not a schema relation. Keyed by
   * `Product.name`. The 12 families below match the exact Knowledge
   * Factory folder structure discovered in Block 1, Section 7
   * ("Product-folder coverage") — not re-derived or guessed here.
   */
  familyGroupingByProductName: Record<string, string>;

  conflictResolutionPolicy: {
    neverOverrideApprovedWithPending: true;
    /** Block 2C Conflict-01 (Cool Water historical pricing): the live
     * `ProductVariant` value is always authoritative for any customer
     * answer, regardless of what a historical source document says. */
    alwaysPreferLiveCommercialData: true;
  };

  dynamicCommercialDataPolicy: {
    neverStorePriceInIntelligence: true;
    neverStoreMrpInIntelligence: true;
    neverStoreStockInIntelligence: true;
  };

  problemDerivationPolicy: {
    /** Block 2C Section 11, category 2: FAQ-derived problems where the
     * resolution is already approved-pending ProductContent text. */
    allowCategory2Derivation: true;
    /** Category 3 (category-implied generic problems) requires Founder
     * review before promotion, per Block 1 Section 16 — the mapper may
     * propose these but must classify them FOUNDER_REVIEW_REQUIRED. */
    requireReviewForCategory3: true;
    /** Categories 4/5 (safety/contraindication, health/medical inference)
     * are never derived by this mapper under any condition. */
    prohibitCategories: ["SAFETY_CONTRAINDICATION", "HEALTH_MEDICAL_INFERENCE"];
  };

  careWorkflowDerivationPolicy: {
    /** Block 2C Section 12, category 1: the 4 workflows already backed by
     * two independent real sources (pricing, bleach-mixing, nonexistent
     * product, unsupported claim). */
    allowCategory1Derivation: true;
    /** Category 2 (per-product safety escalation) is derivable but stays
     * FOUNDER_REVIEW_REQUIRED pending Decision 1. */
    requireReviewForCategory2: true;
    /** Category 5 (emotional-tone adaptation) has no approved source
     * content at all — never derived. */
    prohibitCategories: ["EMOTIONAL_TONE_ADAPTATION"];
  };

  confidenceThresholds: {
    minimumForCustomerSafe: ConfidenceLevel;
    minimumForActionRecommendation: ConfidenceLevel;
  };

  /** Templates matching the Knowledge Factory's own already-real FAQ
   * phrasing (Block 2C Section 12, category 3) — reused verbatim rather
   * than inventing new copy. */
  unsupportedClaimPolicy: {
    template: string;
  };
  nonexistentProductPolicy: {
    template: string;
  };
};

export const FOUNDER_POLICY: FounderPolicy = {
  version: "2026-08-06.block2c-frozen",
  frozenAt: "2026-08-06T00:00:00.000Z",

  productContentEligibilityByProductName: {
    "Muv Black Phenyl": "APPROVED_WITH_EXCLUSIONS",
    "Muv Citrus Blast Hand Wash": "APPROVED",
    "Muv Cloud Walk Floor Cleaner": "APPROVED",
    "Muv Cool Water Liquid Detergent": "APPROVED",
    "Muv Crimson Veil Body Wash": "APPROVED",
    "Muv Crystal Glass Cleaner": "APPROVED",
    "Muv Floral Toilet Cleaner": "APPROVED",
    "Muv Fresh Bathroom Cleaner": "APPROVED",
    "Muv Indian Rose Liquid Detergent": "APPROVED",
    "Muv Lavender Garden Liquid Detergent": "APPROVED",
    "Muv Life Shield Hand Wash": "APPROVED",
    "Muv Midnight Frost Body Wash": "APPROVED",
    "Muv Ocean Fresh Hand Wash": "APPROVED",
    "Muv Pure Bleach": "APPROVED",
    "Muv Radiance Car Wash": "APPROVED",
    "Muv Silk Blossom Hand Wash": "APPROVED",
    "Muv Spark Dishwash Gel": "APPROVED",
    "Muv Velvet Mist Floor Cleaner": "APPROVED",
    "Muv Velvet Oak Body Wash": "APPROVED",
    "Muv White Phenyl": "APPROVED",
  },
  productContentFieldExclusions: {
    "Muv Black Phenyl": ["faq", "seoDescription"],
  },

  defaultGovernanceClassification: "FOUNDER_REVIEW_REQUIRED",

  ingredientDisclosurePolicy: {
    defaultInternalOnly: true,
    approvedProductNames: [],
  },

  familyGroupingByProductName: {
    "Muv Indian Rose Liquid Detergent": "liquid-detergent",
    "Muv Cool Water Liquid Detergent": "liquid-detergent",
    "Muv Lavender Garden Liquid Detergent": "liquid-detergent",
    "Muv Cloud Walk Floor Cleaner": "floor-cleaner",
    "Muv Velvet Mist Floor Cleaner": "floor-cleaner",
    "Muv Citrus Blast Hand Wash": "hand-wash",
    "Muv Silk Blossom Hand Wash": "hand-wash",
    "Muv Life Shield Hand Wash": "hand-wash",
    "Muv Ocean Fresh Hand Wash": "hand-wash",
    "Muv Crimson Veil Body Wash": "body-wash",
    "Muv Velvet Oak Body Wash": "body-wash",
    "Muv Midnight Frost Body Wash": "body-wash",
    // Single-SKU families (Block 1, Section 7) — familyId still assigned,
    // one member, purely for consistency; no fan-out ever occurs for these.
    "Muv Black Phenyl": "black-phenyl",
    "Muv White Phenyl": "white-phenyl",
    "Muv Radiance Car Wash": "car-wash",
    "Muv Crystal Glass Cleaner": "crystal-glass-cleaner",
    "Muv Spark Dishwash Gel": "dishwash-gel",
    "Muv Fresh Bathroom Cleaner": "fresh-bathroom-cleaner",
    "Muv Pure Bleach": "pure-bleach",
    "Muv Floral Toilet Cleaner": "toilet-cleaner",
  },

  conflictResolutionPolicy: {
    neverOverrideApprovedWithPending: true,
    alwaysPreferLiveCommercialData: true,
  },

  dynamicCommercialDataPolicy: {
    neverStorePriceInIntelligence: true,
    neverStoreMrpInIntelligence: true,
    neverStoreStockInIntelligence: true,
  },

  problemDerivationPolicy: {
    allowCategory2Derivation: true,
    requireReviewForCategory3: true,
    prohibitCategories: ["SAFETY_CONTRAINDICATION", "HEALTH_MEDICAL_INFERENCE"],
  },

  careWorkflowDerivationPolicy: {
    allowCategory1Derivation: true,
    requireReviewForCategory2: true,
    prohibitCategories: ["EMOTIONAL_TONE_ADAPTATION"],
  },

  confidenceThresholds: {
    minimumForCustomerSafe: "HIGH",
    minimumForActionRecommendation: "HIGH",
  },

  unsupportedClaimPolicy: {
    template: "We don't have confirmed information to answer this yet.",
  },
  nonexistentProductPolicy: {
    template: "This information isn't available in our records yet.",
  },
};

export function getProductContentEligibility(productName: string): ProductContentEligibility {
  return FOUNDER_POLICY.productContentEligibilityByProductName[productName] ?? "FOUNDER_REVIEW_REQUIRED";
}

export function getFamilyId(productName: string): string | null {
  return FOUNDER_POLICY.familyGroupingByProductName[productName] ?? null;
}

export function isIngredientDisclosureApproved(productName: string): boolean {
  return FOUNDER_POLICY.ingredientDisclosurePolicy.approvedProductNames.includes(productName);
}

export function getExcludedFields(productName: string): string[] {
  return FOUNDER_POLICY.productContentFieldExclusions[productName] ?? [];
}
