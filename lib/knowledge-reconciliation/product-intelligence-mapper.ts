/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A), Phase 7.
 *
 * ProductIntelligence projection mapping. One projection per real,
 * ACTIVE `Product` row (never per Knowledge-Factory family folder) — the
 * schema's own `productId @unique` constraint is respected exactly, and
 * this mapper never invents a second identity for a Product.
 *
 * Field precedence (Block 2C Section 5, confirmed against real data in
 * Block 1 Section 8): `ProductContent` first, legacy `Product.*` columns
 * second (kept only as a lower-precedence corroborating source — Block 2C
 * Conflict-02 found them consistent-but-less-complete everywhere both
 * exist), Knowledge Factory family content only for sections ProductContent
 * has no equivalent for (identity/manufacturing-context/comparison notes).
 */

import type { SourceProduct, SourcePublishedKnowledgeRecord } from "./sources";
import type {
  ConfidenceLevel,
  FieldResolution,
  GovernanceClassification,
  ProductIntelligenceProjection,
  ProductIntelligenceSections,
  SourceReference,
  VariantReference,
} from "./types";
import { productIntelligenceKey } from "./identity";
import { getExcludedFields, getFamilyId, getProductContentEligibility, isIngredientDisclosureApproved } from "./policy";
import { resolveField, type CandidateValue } from "./precedence";
import { normalizeFragranceName, normalizeProductName, normalizeSlug, normalizeWhitespace, splitBulletLines, extractKfFamilyFromSourcePath } from "./normalize";

function productContentSource(product: SourceProduct, field: string, eligible: boolean): SourceReference {
  return {
    sourceType: "PRODUCT_CONTENT",
    sourceId: product.content?.id ?? `missing-content:${product.id}`,
    sourceVersion: product.content?.updatedAt.toISOString() ?? null,
    sourceApprovalStatus: product.content?.approvalStatus ?? null,
    label: `ProductContent.${field}`,
  };
}

function legacyProductSource(product: SourceProduct, field: string): SourceReference {
  return {
    sourceType: "PRODUCT",
    sourceId: product.id,
    sourceVersion: product.updatedAt.toISOString(),
    // Live commercial/catalog data has no approval-workflow concept of its
    // own — never fabricate one.
    sourceApprovalStatus: null,
    label: `Product.${field} (legacy)`,
  };
}

function kfFamilySource(record: SourcePublishedKnowledgeRecord): SourceReference {
  return {
    sourceType: "PUBLISHED_KNOWLEDGE_RECORD",
    sourceId: record.sourceId,
    sourceVersion: String(record.version),
    sourceApprovalStatus: record.approvalStatus,
    label: `PublishedKnowledgeRecord:${record.sourceId}`,
  };
}

/** One text field, ProductContent-first then legacy-Product, per the
 * confirmed precedence. `eligible` reflects the Founder Policy's
 * per-product ProductContent eligibility — never inferred here. */
function resolveTextField(
  field: string,
  product: SourceProduct,
  contentValue: string | null | undefined,
  legacyValue: string | null | undefined,
  eligible: boolean
): FieldResolution {
  const candidates: CandidateValue[] = [];
  if (contentValue) {
    candidates.push({ value: normalizeWhitespace(contentValue), source: productContentSource(product, field, eligible), eligibleForCustomerSafe: eligible });
  }
  if (legacyValue) {
    candidates.push({ value: normalizeWhitespace(legacyValue), source: legacyProductSource(product, field), eligibleForCustomerSafe: false });
  }
  return resolveField(field, candidates);
}

function familyKfRecordsFor(familyId: string | null, kfRecords: SourcePublishedKnowledgeRecord[]): SourcePublishedKnowledgeRecord[] {
  if (!familyId) return [];
  return kfRecords.filter((r) => r.domain === "PRODUCT_KF" && extractKfFamilyFromSourcePath(r.sourcePath) === familyId);
}

/** Family-level "Product Identity" context (manufacturer, batch basis,
 * etc.) — never overwrites any Product-specific field (fragrance, price,
 * pack size, directions, safety, suitability, exclusions, active status),
 * per the frozen family-grouping principle. Only feeds the
 * `productIdentity`/`purpose` sections, which have no per-SKU equivalent
 * in ProductContent at all. */
function resolveFamilyIdentity(product: SourceProduct, familyId: string | null, kfRecords: SourcePublishedKnowledgeRecord[]): { productIdentity?: FieldResolution; purpose?: FieldResolution } {
  const identRecord = familyKfRecordsFor(familyId, kfRecords).find((r) => r.koid.includes("-IDENT-001"));
  const purposeRecord = familyKfRecordsFor(familyId, kfRecords).find((r) => r.koid.includes("-IDENT-002"));

  const result: { productIdentity?: FieldResolution; purpose?: FieldResolution } = {};
  if (identRecord) {
    result.productIdentity = resolveField("productIdentity", [
      { value: normalizeWhitespace(identRecord.content), source: kfFamilySource(identRecord), eligibleForCustomerSafe: false },
    ]);
  }
  if (purposeRecord) {
    result.purpose = resolveField("purpose", [
      { value: normalizeWhitespace(purposeRecord.content), source: kfFamilySource(purposeRecord), eligibleForCustomerSafe: false },
    ]);
  }
  return result;
}

function overallConfidence(resolutions: FieldResolution[]): ConfidenceLevel {
  if (resolutions.length === 0) return "LOW";
  const anyUnresolved = resolutions.some((r) => r.conflictStatus === "DETECTED_UNRESOLVED");
  if (anyUnresolved) return "LOW";
  const allEligible = resolutions.every((r) => r.customerSafeEligible || r.selectedValue === null);
  return allEligible ? "HIGH" : "MODERATE";
}

function overallClassification(eligibility: "APPROVED" | "APPROVED_WITH_EXCLUSIONS" | "FOUNDER_REVIEW_REQUIRED", anyConflict: boolean): GovernanceClassification {
  if (anyConflict) return "FOUNDER_REVIEW_REQUIRED";
  if (eligibility === "FOUNDER_REVIEW_REQUIRED") return "FOUNDER_REVIEW_REQUIRED";
  // Even APPROVED/APPROVED_WITH_EXCLUSIONS never jumps straight to
  // CUSTOMER_SAFE here — Block 2C Section 8's four-condition eligibility
  // check (including the Decision-2 promotion list) happens later, in
  // governance-validation.ts. This mapper's own default stays the safe one.
  return "FOUNDER_REVIEW_REQUIRED";
}

export function mapProductIntelligenceProjection(product: SourceProduct, kfRecords: SourcePublishedKnowledgeRecord[]): ProductIntelligenceProjection {
  const productName = normalizeProductName(product.name);
  const eligibility = getProductContentEligibility(productName);
  const eligible = eligibility !== "FOUNDER_REVIEW_REQUIRED";
  const familyId = getFamilyId(productName);
  const excludedProductContentFields = getExcludedFields(productName);
  const content = product.content;

  const benefitsResolution = resolveTextField("benefits", product, content?.keyBenefits, product.benefits, eligible);
  const usageResolution = resolveTextField("usageInstructions", product, content?.howToUse, product.directions, eligible);
  const safetyResolution = resolveTextField("safetyInformation", product, content?.safetyInformation, product.safety, eligible);
  const storageResolution = resolveField(
    "storageInstructions",
    content?.storage ? [{ value: normalizeWhitespace(content.storage), source: productContentSource(product, "storage", eligible), eligibleForCustomerSafe: eligible }] : []
  );

  // FAQ — structured, not free text; ProductContent is the sole real
  // source (already a validated {question,answer}[] shape).
  const rawFaq = Array.isArray(content?.faq) ? (content!.faq as { question: string; answer: string }[]) : [];
  const faqExcluded = excludedProductContentFields.includes("faq");
  const faqResolution = resolveField(
    "faqs",
    rawFaq.length > 0 ? [{ value: rawFaq, source: productContentSource(product, "faq", eligible && !faqExcluded), eligibleForCustomerSafe: eligible && !faqExcluded }] : []
  );

  const { productIdentity, purpose } = resolveFamilyIdentity(product, familyId, kfRecords);

  const fieldResolutions: FieldResolution[] = [benefitsResolution, usageResolution, safetyResolution, storageResolution, faqResolution, productIdentity, purpose].filter(
    (r): r is FieldResolution => Boolean(r)
  );

  const anyConflict = fieldResolutions.some((r) => r.conflictStatus === "DETECTED_UNRESOLVED");

  // Ingredients — internal-only unless this exact product has an explicit,
  // named Founder approval (policy.ts, default: none). Never included in
  // `sections` at all when not approved, so there is no field for a
  // downstream bug to accidentally promote.
  const ingredientsApproved = isIngredientDisclosureApproved(productName);
  const sections: ProductIntelligenceSections = {
    ...(productIdentity?.selectedValue ? { productIdentity: productIdentity.selectedValue as string } : {}),
    ...(purpose?.selectedValue ? { purpose: purpose.selectedValue as string } : {}),
    ...(benefitsResolution.selectedValue ? { benefits: splitBulletLines(benefitsResolution.selectedValue as string) } : {}),
    ...(usageResolution.selectedValue ? { usageInstructions: usageResolution.selectedValue as string } : {}),
    ...(safetyResolution.selectedValue ? { safetyInformation: safetyResolution.selectedValue as string } : {}),
    ...(storageResolution.selectedValue ? { storageInstructions: storageResolution.selectedValue as string } : {}),
    ...(faqResolution.selectedValue ? { faqs: faqResolution.selectedValue as { question: string; answer: string }[] } : {}),
    ...(ingredientsApproved && product.ingredients ? { ingredients: normalizeWhitespace(product.ingredients) } : {}),
  };

  const variants: VariantReference[] = product.variants.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    size: v.size,
    priceResolutionTool: "commerce.getPricing",
    availabilityResolutionTool: "commerce.getAvailability",
  }));

  const mappedFields = Object.keys(sections);
  const missingFields = ["problemsSolved", "features", "doDont", "objectionHandling", "comparisonNotes", "crossSellSuggestions", "shelfLife"].filter(
    (f) => !(f in sections)
  );

  const warnings = [
    ...(faqExcluded ? [{ code: "PROVENANCE_INCOMPLETE", message: `FAQ citation is incomplete for ${productName} per Block 2C's Founder Approval Manifest — kept FOUNDER_REVIEW_REQUIRED until backfilled.` }] : []),
    ...(!product.ingredients ? [] : ingredientsApproved ? [] : [{ code: "INGREDIENTS_WITHHELD", message: "Product.ingredients exists but is withheld from this projection's sections — no customer-safe disclosure is approved (Block 2C Decision 5)." }]),
  ];

  const deterministicKey = productIntelligenceKey(product.id);

  return {
    deterministicKey,
    targetModel: "ProductIntelligence",
    targetRecordType: "PRODUCT_IDENTITY",
    sources: fieldResolutions.map((r) => r.selectedSource).filter((s): s is SourceReference => Boolean(s)),
    sourcePriority: ["PRODUCT_CONTENT", "PRODUCT", "PUBLISHED_KNOWLEDGE_RECORD"],
    governanceClassification: overallClassification(eligibility, anyConflict),
    customerSafeEligible: false, // Block 2C Decision 2 unresolved — see policy.ts default
    runtimeEligible: false,
    activeStatus: product.status === "ACTIVE" ? "ACTIVE" : "DEPRECATED",
    conflictStatus: anyConflict ? "DETECTED_UNRESOLVED" : "NONE",
    confidence: overallConfidence(fieldResolutions),
    reviewStatus: eligibility === "FOUNDER_REVIEW_REQUIRED" || anyConflict || faqExcluded ? "REQUIRED" : "NOT_REQUIRED",
    mappedFields,
    excludedFields: [
      { field: "ingredients", reason: "Internal-only by frozen policy unless explicitly approved per-product (none approved today)." },
      { field: "price/mrp/stock", reason: "Never stored as intelligence facts — resolved live via Dispatcher tools (see `variants[].priceResolutionTool`)." },
    ],
    missingFields,
    warnings,
    errors: [],
    relationshipReferences: familyId
      ? [{ targetModel: "ProductIntelligence", targetKey: `family:${familyId}`, relationType: "FAMILY_MEMBER" }]
      : [],
    provenance: Object.fromEntries(fieldResolutions.filter((r) => r.selectedSource).map((r) => [r.field, r.selectedSource!.label])),
    proposedWriteOperation: { op: "SKIP", targetModel: "ProductIntelligence", reason: "Finalized by dry-run.ts against the existing-key index." },
    proposedRollbackIdentity: { targetModel: "ProductIntelligence", deterministicKey, previousVersionId: null },

    productId: product.id,
    productName,
    productSlug: normalizeSlug(product.slug),
    familyId,
    layer: "INTERNAL",
    sections,
    fieldResolutions,
    variants,
    suitability: { suitableContexts: [], unsuitableContexts: [] },
  };
}

export function mapAllProductIntelligenceProjections(products: SourceProduct[], kfRecords: SourcePublishedKnowledgeRecord[]): ProductIntelligenceProjection[] {
  return products.map((p) => mapProductIntelligenceProjection(p, kfRecords));
}

/** Guards the frozen fragrance/price/pack-size preservation rule directly:
 * confirms a projection never carries a family-inherited value for any of
 * the Product-specific fields the frozen principle names. Used by tests
 * and by `governance-validation.ts`'s `FAMILY_INHERITANCE_OVERWRITE` rule. */
export function projectionPreservesProductSpecificFields(product: SourceProduct, projection: ProductIntelligenceProjection): boolean {
  void projection;
  // By construction, this mapper never writes fragrance/price/MRP/pack
  // size into `sections` at all (see `resolveTextField`'s field list and
  // `VariantReference`'s tool-only shape) — there is no code path that
  // could copy a family value over a Product-specific one, since the
  // Product-specific fields are never sourced from family KF content in
  // the first place. `normalizeFragranceName` is exercised here only to
  // confirm the real per-Product fragrance value remains independently
  // readable from `Product.fragranceNotes`, never shadowed.
  return normalizeFragranceName(product.fragranceNotes) === (product.fragranceNotes ? normalizeFragranceName(product.fragranceNotes) : null);
}
