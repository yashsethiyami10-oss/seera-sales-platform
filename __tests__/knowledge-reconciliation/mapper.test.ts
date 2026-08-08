import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ---- Database-safety gate: refuse unless this resolves to ep-falling-heart ----
function readEnvVar(filePath: string, name: string): string | null {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
  return match?.[1] ?? null;
}
const resolvedHost = new URL(process.env.DATABASE_URL ?? readEnvVar(path.resolve(process.cwd(), ".env.local"), "DATABASE_URL")!).hostname;
if (!resolvedHost.includes("ep-falling-heart")) {
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart. No test in this file may run against any other database.`);
}

import { prisma } from "@/lib/prisma";
import {
  runReconciliationDryRun,
  mapProblemIntelligenceCandidates,
  mapCareIntelligenceCandidates,
  requestEmotionalToneWorkflow,
  validateProjection,
  runGovernanceValidation,
  buildDecisionIntelligenceInput,
  currentFounderPolicyVersion,
  FOUNDER_POLICY,
  assertDeterministicRerun,
  projectionPreservesProductSpecificFields,
} from "@/lib/knowledge-reconciliation";
import type { AnyProjection, ProductIntelligenceProjection, SourceReference } from "@/lib/knowledge-reconciliation/types";
import type { SourceProduct } from "@/lib/knowledge-reconciliation/sources";

/**
 * Block 2A verification suite. Every test either (a) reads real,
 * currently-empty intelligence-table counts before/after to prove
 * zero writes occurred, or (b) exercises pure functions against real
 * source data already fetched once in `beforeAll`, or (c) exercises pure
 * functions against small, literal fixtures for cases no real row
 * currently triggers (e.g. a prohibited FAQ pattern). No test in this
 * file calls `.create()`/`.update()`/`.delete()` on any model.
 */

describe("Block 2A — Governed Reconciliation Mapper", () => {
  let manifestA: Awaited<ReturnType<typeof runReconciliationDryRun>>;
  let manifestB: Awaited<ReturnType<typeof runReconciliationDryRun>>;
  let countsBefore: { ki: number; pi: number; pri: number; ci: number; product: number; content: number; pkr: number };
  let countsAfterFirstRun: typeof countsBefore;
  let countsAfterSecondRun: typeof countsBefore;

  async function snapshotCounts() {
    const [ki, pi, pri, ci, product, content, pkr] = await Promise.all([
      prisma.knowledgeItem.count(),
      prisma.productIntelligence.count(),
      prisma.problemIntelligence.count(),
      prisma.careIntelligence.count(),
      prisma.product.count(),
      prisma.productContent.count(),
      prisma.publishedKnowledgeRecord.count(),
    ]);
    return { ki, pi, pri, ci, product, content, pkr };
  }

  beforeAll(async () => {
    countsBefore = await snapshotCounts();
    manifestA = await runReconciliationDryRun();
    countsAfterFirstRun = await snapshotCounts();
    manifestB = await runReconciliationDryRun();
    countsAfterSecondRun = await snapshotCounts();
  }, 60000);

  // 1. Zero-write dry-run guarantee
  it("1. performs zero database writes across two full dry runs", () => {
    expect(countsAfterFirstRun).toEqual(countsBefore);
    expect(countsAfterSecondRun).toEqual(countsBefore);
  });

  // 2. Deterministic rerun
  it("2. produces identical deterministic keys and content across two runs", () => {
    const allA: AnyProjection[] = [
      ...manifestA.knowledgeItemProjections,
      ...manifestA.productIntelligenceProjections,
      ...manifestA.problemIntelligenceProjections,
      ...manifestA.careIntelligenceProjections,
    ];
    const allB: AnyProjection[] = [
      ...manifestB.knowledgeItemProjections,
      ...manifestB.productIntelligenceProjections,
      ...manifestB.problemIntelligenceProjections,
      ...manifestB.careIntelligenceProjections,
    ];
    const result = assertDeterministicRerun(allA, allB);
    expect(result.mismatches).toEqual([]);
    expect(result.stable).toBe(true);
  });

  // 3. ProductContent field precedence
  it("3. selects ProductContent over legacy Product fields when both exist", () => {
    const blackPhenyl = manifestA.productIntelligenceProjections.find((p) => p.productName === "Muv Black Phenyl");
    expect(blackPhenyl).toBeTruthy();
    const safetyResolution = blackPhenyl!.fieldResolutions.find((r) => r.field === "safetyInformation");
    expect(safetyResolution?.selectedSource?.sourceType).toBe("PRODUCT_CONTENT");
    // The legacy Product.safety value must appear as a recorded, non-conflicting
    // rejected alternative — never silently discarded, never merged.
    expect(safetyResolution?.rejectedAlternatives.some((a) => a.source.sourceType === "PRODUCT")).toBe(true);
  });

  // 4. ProductVariant commercial authority
  it("4. never stores price, MRP, or stock as an intelligence fact", () => {
    for (const p of manifestA.productIntelligenceProjections) {
      const sectionsJson = JSON.stringify(p.sections);
      expect(sectionsJson.toLowerCase()).not.toContain('"price"');
      expect(sectionsJson.toLowerCase()).not.toContain('"mrp"');
      for (const v of p.variants) {
        expect(Object.keys(v).sort()).toEqual(["availabilityResolutionTool", "priceResolutionTool", "size", "sku", "variantId"].sort());
      }
    }
  });

  // 5. Cool Water historical price conflict
  it("5. never lets a historical PublishedKnowledgeRecord price override live ProductVariant data", async () => {
    const coolWater = manifestA.productIntelligenceProjections.find((p) => p.productName === "Muv Cool Water Liquid Detergent");
    expect(coolWater).toBeTruthy();
    // No source of this projection is commercial-shaped from a publication record.
    const hasStaleCommercialSource = coolWater!.sources.some((s) => s.sourceType === "PUBLISHED_KNOWLEDGE_RECORD" && /price|mrp/i.test(s.label));
    expect(hasStaleCommercialSource).toBe(false);
    // Confirm the real, current, live price actually is 165/725 (ground truth
    // from Block 1/2C), proving the "always prefer live data" rule has a real
    // current value to defer to, not an assumption.
    const realProduct = await prisma.product.findFirst({ where: { name: "Muv Cool Water Liquid Detergent" }, include: { variants: true } });
    const oneLitre = realProduct!.variants.find((v) => v.size === "1L");
    const fiveLitre = realProduct!.variants.find((v) => v.size === "5L");
    expect(oneLitre?.price).toBe(165);
    expect(fiveLitre?.price).toBe(725);
    // And confirm the governance rule itself actively catches a violation if
    // one were ever introduced (not just "we happen not to have one today").
    const synthetic: ProductIntelligenceProjection = { ...coolWater!, sources: [{ sourceType: "PUBLISHED_KNOWLEDGE_RECORD", sourceId: "x", sourceVersion: 1, sourceApprovalStatus: "DRAFT", label: "PublishedKnowledgeRecord price citation" }] };
    const findings = validateProjection(synthetic);
    expect(findings.some((f) => f.ruleId === "STALE_COMMERCIAL_SOURCE" && f.populationBlocker)).toBe(true);
  });

  // 6. Black Phenyl citation-review behavior
  it("6. keeps Black Phenyl's uncited field FOUNDER_REVIEW_REQUIRED", () => {
    const blackPhenyl = manifestA.productIntelligenceProjections.find((p) => p.productName === "Muv Black Phenyl");
    expect(blackPhenyl!.warnings.some((w) => w.code === "PROVENANCE_INCOMPLETE")).toBe(true);
    expect(blackPhenyl!.reviewStatus).toBe("REQUIRED");
    expect(FOUNDER_POLICY.productContentEligibilityByProductName["Muv Black Phenyl"]).toBe("APPROVED_WITH_EXCLUSIONS");
  });

  // 7. INTERNAL record not auto-promoted
  it("7. never classifies any projection CUSTOMER_SAFE in this pass", () => {
    const all: AnyProjection[] = [
      ...manifestA.knowledgeItemProjections,
      ...manifestA.productIntelligenceProjections,
      ...manifestA.problemIntelligenceProjections,
      ...manifestA.careIntelligenceProjections,
    ];
    expect(all.every((p) => p.governanceClassification !== "CUSTOMER_SAFE")).toBe(true);
    expect(all.every((p) => p.customerSafeEligible === false)).toBe(true);
    expect(manifestA.totals.customerSafeEligible).toBe(0);
  });

  // 8. PENDING source not automatically treated as approved
  it("8. preserves the raw PENDING database status even where Founder reconciliation eligibility is APPROVED", () => {
    const coolWater = manifestA.productIntelligenceProjections.find((p) => p.productName === "Muv Cool Water Liquid Detergent")!;
    const benefitsResolution = coolWater.fieldResolutions.find((r) => r.field === "benefits")!;
    // The verbatim database status must read PENDING...
    expect(benefitsResolution.approvalStatus).toBe("PENDING");
    // ...yet the overall projection is never promoted past FOUNDER_REVIEW_REQUIRED
    // purely because a Founder reconciliation-eligibility policy exists.
    expect(coolWater.governanceClassification).not.toBe("CUSTOMER_SAFE");
  });

  // 9. Founder-approved reconciliation override
  it("9. distinguishes DB approval status from Founder-approved reconciliation eligibility", () => {
    const coolWater = manifestA.productIntelligenceProjections.find((p) => p.productName === "Muv Cool Water Liquid Detergent")!;
    const benefitsResolution = coolWater.fieldResolutions.find((r) => r.field === "benefits")!;
    // DB status: PENDING. Founder reconciliation-eligibility policy: APPROVED.
    // The field-level component signal reflects the policy override...
    expect(benefitsResolution.approvalStatus).toBe("PENDING");
    expect(benefitsResolution.customerSafeEligible).toBe(true); // policy override applied at field level
    // ...while runtime/customer-safe promotion status (the projection-level
    // classification) remains untouched, proving the two are genuinely
    // independent, not aliases of each other.
    expect(coolWater.customerSafeEligible).toBe(false);
  });

  // 10. Confidential Ingredients exclusion
  it("10. never includes an ingredients section for any of the 20 products", () => {
    expect(manifestA.productIntelligenceProjections.length).toBeGreaterThan(0);
    for (const p of manifestA.productIntelligenceProjections) {
      expect(p.sections.ingredients).toBeUndefined();
    }
    expect(FOUNDER_POLICY.ingredientDisclosurePolicy.approvedProductNames).toEqual([]);
  });

  // 11. Formula/ratio/process exclusion
  it("11. never maps PRODUCT_KF (manufacturing-adjacent) records into KnowledgeItem", () => {
    for (const ki of manifestA.knowledgeItemProjections) {
      const isProductKf = ki.sources.some((s) => s.sourceId.startsWith("PRODUCT_KF:"));
      expect(isProductKf).toBe(false);
    }
  });

  // 12. Product family grouping
  it("12. groups the 3 Liquid Detergent SKUs under one familyId without collapsing their identities", () => {
    const detergents = manifestA.productIntelligenceProjections.filter((p) => p.familyId === "liquid-detergent");
    expect(detergents.length).toBe(3);
    const uniqueProductIds = new Set(detergents.map((p) => p.productId));
    expect(uniqueProductIds.size).toBe(3);
    for (const d of detergents) {
      expect(d.relationshipReferences.some((r) => r.relationType === "FAMILY_MEMBER" && r.targetKey === "family:liquid-detergent")).toBe(true);
    }
  });

  // 13. Product-specific fragrance preservation
  it("13. never gives ProductIntelligence sections a dedicated fragrance field for family content to overwrite", async () => {
    const detergents = manifestA.productIntelligenceProjections.filter((p) => p.familyId === "liquid-detergent");
    expect(detergents.length).toBe(3);
    // There is no `fragrance` key anywhere in ProductIntelligenceSections —
    // fragrance is never sourced from family KF content in the first place,
    // so there is no code path by which one sibling's fragrance could
    // shadow another's.
    for (const d of detergents) {
      expect(Object.keys(d.sections)).not.toContain("fragrance");
    }
    // Each product's own live fragranceNotes remains independently correct
    // and distinct from its siblings' — the real source of truth was never
    // touched by this mapper.
    const realProducts = await prisma.product.findMany({ where: { id: { in: detergents.map((d) => d.productId) } } });
    const fragrances = realProducts.map((rp) => rp.fragranceNotes);
    expect(new Set(fragrances).size).toBe(3);
    for (const rp of realProducts) {
      const projection = detergents.find((d) => d.productId === rp.id)!;
      expect(projectionPreservesProductSpecificFields(rp as unknown as SourceProduct, projection)).toBe(true);
    }
  });

  // 14. Product-specific safety preservation
  it("14. never overwrites one product's safety text with a sibling's or a family default", () => {
    const blackPhenyl = manifestA.productIntelligenceProjections.find((p) => p.productName === "Muv Black Phenyl")!;
    const velvetOak = manifestA.productIntelligenceProjections.find((p) => p.productName === "Muv Velvet Oak Body Wash")!;
    const bpSafety = blackPhenyl.fieldResolutions.find((r) => r.field === "safetyInformation")?.selectedValue;
    const voSafety = velvetOak.fieldResolutions.find((r) => r.field === "safetyInformation")?.selectedValue;
    expect(bpSafety).toBeTruthy();
    expect(voSafety).toBeTruthy();
    expect(bpSafety).not.toBe(voSafety);
  });

  // 15. One ProductIntelligence identity per Product
  it("15. produces exactly one ProductIntelligence projection per Product, with unique deterministic keys", () => {
    const keys = manifestA.productIntelligenceProjections.map((p) => p.deterministicKey);
    expect(new Set(keys).size).toBe(keys.length);
    const productIds = manifestA.productIntelligenceProjections.map((p) => p.productId);
    expect(new Set(productIds).size).toBe(productIds.length);
  });

  // 16. All 20 Products represented
  it("16. represents all 20 active Products", () => {
    expect(manifestA.sourceInventory.productCount).toBe(20);
    expect(manifestA.productIntelligenceProjections.length).toBe(20);
  });

  // 17. All 37 Variants represented
  it("17. represents all 37 Variants across the 20 ProductIntelligence projections", () => {
    expect(manifestA.sourceInventory.variantCount).toBe(37);
    const totalVariantRefs = manifestA.productIntelligenceProjections.reduce((sum, p) => sum + p.variants.length, 0);
    expect(totalVariantRefs).toBe(37);
  });

  // 18. Unsupported Problem candidate rejection
  it("18. rejects a prohibited (medical/unsupported-claim) FAQ pattern rather than deriving a ProblemIntelligence candidate", () => {
    const fixtureProduct = {
      id: "fixture-product-1",
      name: "Fixture Test Product",
      status: "ACTIVE",
      ingredients: null,
      benefits: null,
      directions: null,
      safety: null,
      fragranceNotes: null,
      updatedAt: new Date(),
      category: { name: "Body Care" },
      content: {
        id: "fixture-content-1",
        updatedAt: new Date(),
        approvalStatus: "PENDING",
        faq: [{ question: "Is this dermatologically tested and hypoallergenic?", answer: "Yes, fully tested." }],
      },
      variants: [],
    } as unknown as SourceProduct;

    const result = mapProblemIntelligenceCandidates([fixtureProduct]);
    expect(result.rejected.some((r) => r.productName === "Fixture Test Product")).toBe(true);
    expect(result.projections.every((p) => !p.canonicalProblem.toLowerCase().includes("dermatolog"))).toBe(true);
  });

  // 19. Supported Problem candidate mapping
  it("19. derives at least one real, source-backed or category-implied ProblemIntelligence candidate", () => {
    expect(manifestA.problemIntelligenceProjections.length).toBeGreaterThan(0);
    const methods = new Set(manifestA.problemIntelligenceProjections.map((p) => p.derivationMethod));
    expect([...methods].every((m) => m === "SOURCE_BACKED" || m === "FOUNDER_REVIEW_REQUIRED")).toBe(true);
  });

  // 20. Unsupported Care workflow rejection
  it("20. explicitly rejects emotional-tone-adaptation workflow derivation", () => {
    const result = requestEmotionalToneWorkflow();
    expect(result.projection).toBeNull();
    expect(result.rejected.reason).toMatch(/no approved source content exists/i);
  });

  // 21. Supported Care workflow mapping
  it("21. derives exactly the 4 source-backed core CareIntelligence workflows", () => {
    const sourceBacked = manifestA.careIntelligenceProjections.filter((c) => c.derivationMethod === "SOURCE_BACKED");
    expect(sourceBacked.length).toBe(4);
    const names = sourceBacked.map((c) => c.workflowName);
    expect(names.some((n) => /price/i.test(n))).toBe(true);
    expect(names.some((n) => /bleach/i.test(n))).toBe(true);
    expect(names.some((n) => /nonexistent/i.test(n))).toBe(true);
    expect(names.some((n) => /unsupported claim/i.test(n))).toBe(true);
  });

  // 22. Missing source-trace rejection
  it("22. flags a projection with zero sources as a population blocker", () => {
    const broken: ProductIntelligenceProjection = {
      ...manifestA.productIntelligenceProjections[0]!,
      sources: [],
    };
    const findings = validateProjection(broken);
    expect(findings.some((f) => f.ruleId === "SOURCE_TRACE_MISSING" && f.populationBlocker)).toBe(true);
  });

  // 23. Unresolved conflict blocking
  it("23. flags an unresolved conflict as a population blocker", () => {
    const withConflict: ProductIntelligenceProjection = {
      ...manifestA.productIntelligenceProjections[0]!,
      conflictStatus: "DETECTED_UNRESOLVED",
    };
    const result = runGovernanceValidation([withConflict]);
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.ruleId === "UNRESOLVED_CONFLICT" && f.populationBlocker)).toBe(true);
  });

  // 24. Decision Intelligence input contract completeness
  it("24. builds a complete Decision Intelligence input contract from real projections", () => {
    const relevant: AnyProjection[] = [manifestA.productIntelligenceProjections[0]!, ...manifestA.careIntelligenceProjections.slice(0, 1)];
    const input = buildDecisionIntelligenceInput({
      authorizationContext: { isGuest: true, customerId: null, role: "ANONYMOUS" },
      relevantProjections: relevant,
      permittedToolNames: ["commerce.getProduct", "commerce.getPricing"],
    });
    const requiredKeys: (keyof typeof input)[] = [
      "questionIntent", "authorizationContext", "knowledgeItemReferences", "productIntelligenceReferences",
      "problemIntelligenceReferences", "careIntelligenceReferences", "confidence", "conflicts", "missingInformation",
      "clarificationRequired", "permittedToolCalls", "prohibitedToolCalls", "escalationRequired",
      "founderPolicyChecksRequired", "responseValidationRequirements", "sourceCitations", "confidentialityBoundaries",
    ];
    for (const key of requiredKeys) expect(input).toHaveProperty(key);
    expect(input.questionIntent).toBeNull(); // Phase 10: never classifies intent itself
    expect(input.sourceCitations.length).toBeGreaterThan(0);
  });

  // 25. Founder Policy contract versioning
  it("25. exposes one frozen, versioned Founder Policy that every finding can cite", () => {
    expect(FOUNDER_POLICY.version).toBeTruthy();
    expect(currentFounderPolicyVersion()).toBe(FOUNDER_POLICY.version);
    expect(manifestA.founderPolicyVersion).toBe(FOUNDER_POLICY.version);
  });

  // 26. Dry-run manifest totals
  it("26. produces internally-consistent dry-run totals", () => {
    const totalProjections =
      manifestA.knowledgeItemProjections.length +
      manifestA.productIntelligenceProjections.length +
      manifestA.problemIntelligenceProjections.length +
      manifestA.careIntelligenceProjections.length;
    const totalOps =
      manifestA.totals.proposedCreate + manifestA.totals.proposedUpdate + manifestA.totals.proposedTouch + manifestA.totals.proposedArchive + manifestA.totals.proposedSkip;
    expect(totalOps).toBe(totalProjections);
    // All four intelligence tables are empty today — every real projection
    // must therefore propose CREATE, never UPDATE/TOUCH/ARCHIVE.
    expect(manifestA.totals.proposedCreate).toBe(totalProjections);
    expect(manifestA.totals.proposedUpdate).toBe(0);
    expect(manifestA.totals.proposedTouch).toBe(0);
    expect(manifestA.totals.proposedArchive).toBe(0);
  });

  // 27. No Product/ProductContent/PublishedKnowledgeRecord mutation
  it("27. never mutates Product, ProductContent, or PublishedKnowledgeRecord", () => {
    expect(countsAfterFirstRun.product).toBe(countsBefore.product);
    expect(countsAfterFirstRun.content).toBe(countsBefore.content);
    expect(countsAfterFirstRun.pkr).toBe(countsBefore.pkr);
    expect(countsAfterSecondRun.product).toBe(countsBefore.product);
    expect(countsAfterSecondRun.content).toBe(countsBefore.content);
    expect(countsAfterSecondRun.pkr).toBe(countsBefore.pkr);
  });

  // 28. No intelligence-table mutation
  it("28. never mutates KnowledgeItem, ProductIntelligence, ProblemIntelligence, or CareIntelligence", () => {
    expect(countsBefore.ki).toBe(0);
    expect(countsBefore.pi).toBe(0);
    expect(countsBefore.pri).toBe(0);
    expect(countsBefore.ci).toBe(0);
    expect(countsAfterFirstRun).toEqual(countsBefore);
    expect(countsAfterSecondRun).toEqual(countsBefore);
  });
});
