/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A), Phase 8.
 *
 * ProblemIntelligence candidate projections. Implements exactly the 5
 * categories frozen in Block 2C Section 11 — never a 6th. Categories 4/5
 * are implemented as an explicit, active rejection path (a candidate that
 * matches a prohibited pattern is excluded and reported, never silently
 * dropped and never promoted).
 */

import type { SourceProduct } from "./sources";
import type { ConfidenceLevel, FieldIssue, ProblemDerivationMethod, ProblemIntelligenceProjection, SourceReference } from "./types";
import { problemIntelligenceKey } from "./identity";
import { FOUNDER_POLICY, getFamilyId, getProductContentEligibility } from "./policy";
import { normalizeHeading, normalizeWhitespace } from "./normalize";

/** Category 4/5 guard — Block 2C Section 11: "no new stain-removal,
 * medical, chemical or performance claim." Any FAQ question/answer
 * matching one of these must never become a derived ProblemIntelligence
 * candidate through this deterministic path; it requires full Founder
 * authorship instead. */
const PROHIBITED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(cure|eczema|acne|medical|dermatolog|hypoallergenic|antibacterial|kills? (\d|germs|bacteria)|disinfect)\b/i, reason: "Matches a medical/health or unsupported-efficacy claim pattern — Block 2C category 4/5, never derived." },
  { pattern: /\bmix(ing)?\b.*\b(bleach|acid|ammonia|chemical)\b/i, reason: "Safety/contraindication content — Block 2C category 4, requires explicit Founder authorship, never deterministic derivation." },
];

/** Category 2 (Block 2C Section 11) — FAQ questions whose already-approved-
 * pending answer text implies a real, safely-derivable customer problem.
 * Each pattern names the canonical problem it derives, matched against
 * real `ProductContent.faq` question text at run time (never hardcoded to
 * one product's specific wording). */
const CATEGORY_2_PATTERNS: { pattern: RegExp; canonicalProblem: string; category: string }[] = [
  { pattern: /\bstain/i, canonicalProblem: "Everyday stain removal", category: "Fabric Care" },
  { pattern: /\bhow (much|do i use)|dilut|per load|per wash/i, canonicalProblem: "Correct usage / dosage guidance", category: "Usage" },
  { pattern: /\bbucket (vs\.?|or) machine|bucket wash/i, canonicalProblem: "Bucket vs. machine wash guidance", category: "Usage" },
];

function isProhibited(question: string, answer: string): { blocked: boolean; reason?: string } {
  for (const { pattern, reason } of PROHIBITED_PATTERNS) {
    if (pattern.test(question) || pattern.test(answer)) return { blocked: true, reason };
  }
  return { blocked: false };
}

export type ProblemMapperResult = {
  projections: ProblemIntelligenceProjection[];
  rejected: { question: string; productName: string; reason: string }[];
};

function faqSource(product: SourceProduct): SourceReference {
  return {
    sourceType: "PRODUCT_CONTENT",
    sourceId: product.content?.id ?? `missing-content:${product.id}`,
    sourceVersion: product.content?.updatedAt.toISOString() ?? null,
    sourceApprovalStatus: product.content?.approvalStatus ?? null,
    label: `ProductContent.faq (${product.name})`,
  };
}

function baseProjection(
  canonicalProblem: string,
  category: string,
  derivationMethod: ProblemDerivationMethod,
  confidence: ConfidenceLevel,
  sources: SourceReference[],
  warnings: FieldIssue[]
): ProblemIntelligenceProjection {
  const deterministicKey = problemIntelligenceKey(category, canonicalProblem);
  return {
    deterministicKey,
    targetModel: "ProblemIntelligence",
    targetRecordType: "PROBLEM_CANDIDATE",
    sources,
    sourcePriority: ["PRODUCT_CONTENT", "DETERMINISTIC_DERIVATION"],
    governanceClassification: derivationMethod === "SOURCE_BACKED" ? "FOUNDER_REVIEW_REQUIRED" : "FOUNDER_REVIEW_REQUIRED",
    customerSafeEligible: false,
    runtimeEligible: false,
    activeStatus: "ACTIVE",
    conflictStatus: "NONE",
    confidence,
    reviewStatus: "REQUIRED",
    mappedFields: ["canonicalProblem", "category", "affectedProducts"],
    excludedFields: [],
    missingFields: ["hindiAliases", "hinglishAliases"],
    warnings,
    errors: [],
    relationshipReferences: [],
    provenance: Object.fromEntries(sources.map((s, i) => [`source_${i}`, s.label])),
    proposedWriteOperation: { op: "SKIP", targetModel: "ProblemIntelligence", reason: "Finalized by dry-run.ts against the existing-key index." },
    proposedRollbackIdentity: { targetModel: "ProblemIntelligence", deterministicKey, previousVersionId: null },

    canonicalProblem,
    aliases: [],
    hindiAliases: [],
    hinglishAliases: [],
    category,
    derivationMethod,
    affectedProducts: [],
    affectedCategories: [category],
    requiredClarification: [],
    suitableProductIds: [],
    unsuitableProductIds: [],
    safetyRisks: [],
    relatedCareWorkflowKeys: [],
  };
}

/**
 * Category 2 — deterministic, FAQ-derived candidates. Scans every real
 * `ProductContent.faq` entry across all ACTIVE products; a question is
 * only ever turned into a candidate when (a) it matches an allowed
 * pattern and (b) it does not match a prohibited pattern. Categories 4/5
 * matches are reported in `rejected`, never silently dropped.
 */
export function mapProblemIntelligenceCandidates(products: SourceProduct[]): ProblemMapperResult {
  const projections = new Map<string, ProblemIntelligenceProjection>();
  const rejected: ProblemMapperResult["rejected"] = [];

  if (!FOUNDER_POLICY.problemDerivationPolicy.allowCategory2Derivation) {
    return { projections: [], rejected: [] };
  }

  for (const product of products) {
    const faq = Array.isArray(product.content?.faq) ? (product.content!.faq as { question: string; answer: string }[]) : [];
    for (const entry of faq) {
      const question = normalizeHeading(entry.question);
      const answer = normalizeWhitespace(entry.answer);

      const prohibited = isProhibited(question, answer);
      if (prohibited.blocked) {
        rejected.push({ question, productName: product.name, reason: prohibited.reason! });
        continue;
      }

      const match = CATEGORY_2_PATTERNS.find((p) => p.pattern.test(question));
      if (!match) continue;

      const key = problemIntelligenceKey(match.category, match.canonicalProblem);
      const eligible = getProductContentEligibility(product.name) !== "FOUNDER_REVIEW_REQUIRED";
      const source = faqSource(product);

      let projection = projections.get(key);
      if (!projection) {
        projection = baseProjection(match.canonicalProblem, match.category, "SOURCE_BACKED", "MODERATE", [source], []);
        projections.set(key, projection);
      } else {
        projection.sources.push(source);
      }
      if (eligible && !projection.affectedProducts.some((p) => p.productId === product.id)) {
        projection.affectedProducts.push({ productId: product.id, suitability: "PRIMARY", confidence: "MODERATE" });
        projection.suitableProductIds.push(product.id);
        if (!projection.affectedCategories.includes(product.category.name)) projection.affectedCategories.push(product.category.name);
      }
    }
  }

  // Category 3 — one generic, review-required candidate per product
  // family, deterministically derived from "this family exists" alone —
  // never from a specific efficacy claim. Per Block 2C, requires Founder
  // review before any promotion (`requireReviewForCategory3`).
  if (FOUNDER_POLICY.problemDerivationPolicy.requireReviewForCategory3) {
    const familyMembers = new Map<string, SourceProduct[]>();
    for (const product of products) {
      const familyId = getFamilyId(product.name);
      if (!familyId) continue;
      const list = familyMembers.get(familyId) ?? [];
      list.push(product);
      familyMembers.set(familyId, list);
    }
    for (const [familyId, members] of familyMembers) {
      const firstMember = members[0];
      if (!firstMember) continue; // unreachable — a Map value is only ever created via push()
      const canonicalProblem = `Everyday ${firstMember.category.name.toLowerCase()} need (${familyId})`;
      const key = problemIntelligenceKey("category-implied", canonicalProblem);
      const projection = baseProjection(
        canonicalProblem,
        "category-implied",
        "FOUNDER_REVIEW_REQUIRED",
        "LOW",
        members.map((m) => faqSource(m)),
        [{ code: "CATEGORY_3_REVIEW_REQUIRED", message: "Category-implied generic problem — mechanically derivable but must be Founder-spot-checked before first publish (Block 1 Section 16)." }]
      );
      projection.affectedProducts = members.map((m) => ({ productId: m.id, suitability: "SUPPORTING", confidence: "LOW" }));
      projection.suitableProductIds = members.map((m) => m.id);
      projection.affectedCategories = [firstMember.category.name];
      projections.set(key, projection);
    }
  }

  return { projections: [...projections.values()], rejected };
}
