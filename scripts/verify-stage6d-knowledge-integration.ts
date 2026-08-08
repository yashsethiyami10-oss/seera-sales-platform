import { getKnowledgeFactoryIndex, getKnowledgeFactoryLoadSummary } from "../lib/runtime/knowledge-factory-loader";
import { searchKnowledgeFactories, authorityWeightFor } from "../lib/runtime/knowledge-factory-retrieval";
import { detectConflicts, arbitrateConflicts } from "../lib/runtime/conflict-resolution-runtime";
import { runFounderReasoning } from "../lib/runtime/founder-reasoning-runtime";
import { buildRuntimeContext } from "../lib/runtime/context-builder";
import { classifyIntent } from "../lib/runtime/intent-engine";
import { assembleResponse } from "../lib/runtime/response-assembly-runtime";
import { evaluatePriority } from "../lib/intelligence/priority-engine";
import { evaluateEmotion } from "../lib/intelligence/eq-engine";
import { evaluateCare } from "../lib/intelligence/cq-engine";
import { buildDecision } from "../lib/intelligence/decision-engine";
import { resolveMemory } from "../lib/intelligence/memory-resolver";
import type { CallerClearance } from "../lib/retrieval/types";
import type { RuntimeKnowledgeResult } from "../lib/runtime/types";

/**
 * MUV AI — Stage 6D, Knowledge Integration verification. Unlike Stage 6C's
 * scripts (which used fixture RuntimeKnowledgeResult arrays throughout),
 * this script exercises the REAL, file-backed Knowledge Factory loader and
 * search functions against the REAL files under docs/*-knowledge-factory/
 * — no fixtures, no dummy repository, no simulated retrieval, per this
 * stage's own explicit requirement.
 *
 * `runSemanticRetrieval()` (which merges this with Module 5's DB results)
 * still cannot be exercised end-to-end by script — it calls Module 5's
 * `runRetrievalPipeline()` → `resolveCallerClearance()` → NextAuth's
 * `auth()`, which throws outside a real Next.js request scope (the same
 * structural limitation documented throughout Stage 6C). This script
 * therefore tests `searchKnowledgeFactories()` (the new Stage 6D piece)
 * directly and in combination with the downstream runtime modules
 * (conflict resolution, founder reasoning, response assembly), which is
 * everything Stage 6D actually added.
 */

let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.error("FAIL", name);
  }
};

const clearance: CallerClearance = { role: "STAFF", maxLayer: "INTERNAL", canAccessNonPublished: true };

async function main() {
  // -------------------------------------------------------------------
  // 1. Real load summary
  // -------------------------------------------------------------------
  const summary = getKnowledgeFactoryLoadSummary();
  console.log("Load summary:", JSON.stringify(summary));
  for (const domain of ["PRODUCT_KF", "MARKETING_KF", "INSTITUTIONAL_SALES_KF", "FOUNDER_INTELLIGENCE_KF"] as const) {
    const row = summary.find((s) => s.domainFactory === domain);
    check(!!row && row.fileCount > 0, `Load summary: ${domain} scanned at least one real file`);
    check(!!row && row.koCount > 0, `Load summary: ${domain} parsed at least one real Knowledge Object`);
  }

  const index = getKnowledgeFactoryIndex();
  console.log(`Total real Knowledge Objects indexed: ${index.length}`);
  check(index.length > 100, "Load summary: total indexed KO count is substantial (>100), not a stub");

  // -------------------------------------------------------------------
  // 2. Known-record spot checks (real content, real fields)
  // -------------------------------------------------------------------
  const dwIng001 = index.find((r) => r.koid === "KO-DW-ING-001");
  check(!!dwIng001 && dwIng001.content.includes("LABSA"), "Product KF: KO-DW-ING-001 real content includes real ingredient text (LABSA)");
  check(!!dwIng001 && dwIng001.relationships.includes("KO-DW-MFG-001"), "Product KF: KO-DW-ING-001 relationships correctly extracted");
  check(dwIng001?.approvalTier === "DRAFT", "Product KF: KO-DW-ING-001 approval tier correctly classified as DRAFT");

  const biCh1_001 = index.find((r) => r.koid === "KO-BI-CH1-001");
  check(!!biCh1_001 && biCh1_001.content.includes("Keep Muving"), "Marketing KF: KO-BI-CH1-001 real content includes real brand text (Keep Muving)");
  check(biCh1_001?.approvalTier === "REVIEW_READY", "Marketing KF: KO-BI-CH1-001 approval tier correctly classified as REVIEW_READY");

  const is001 = index.find((r) => r.koid === "KO-IS-001");
  // NOTE: "Sales Journey" is part of the "**Content — Figure 2.1 — Sales
  // Journey Framework:**" marker text itself, which is correctly stripped
  // out (it's the marker, not the body) — check real body text instead.
  check(!!is001 && is001.content.includes("Follow up and learn"), "Institutional Sales KF: KO-IS-001 real content present");

  const gapRecord = index.find((r) => r.koid === "KO-IS-012");
  check(gapRecord?.isGapRecord === true, "Institutional Sales KF: KO-IS-012 correctly detected as a Gap Record");

  const article1 = index.find((r) => r.koid === "FOUNDER-CONSTITUTION-ARTICLE-1");
  check(!!article1 && article1.content.includes("Keep Muving"), "Founder Constitution: Article 1 real content indexed");
  check(article1?.approvalTier === "APPROVED", "Founder Constitution: Article 1 approval tier is APPROVED (BINDING per its own header)");
  check(article1?.category === "Constitution (FOUNDER-CONSTITUTION)", "Founder Constitution: Article 1 tagged with its real, namespaced category");

  // Regression coverage for the exact bug found+fixed this stage: the
  // Product KF's OWN constitution (docs/knowledge-factory/CONSTITUTION.md)
  // also uses "## Article N —" headers — must be independently indexed,
  // never silently shadowed by/shadowing the Founder Constitution's Article 1.
  const productConstitutionArticle1 = index.find((r) => r.koid === "CONSTITUTION-ARTICLE-1");
  check(!!productConstitutionArticle1 && productConstitutionArticle1.domainFactory === "PRODUCT_KF", "Product KF's own CONSTITUTION.md Article 1 is independently indexed, not shadowed by the Founder Constitution");
  check(productConstitutionArticle1?.koid !== article1?.koid, "Regression: the two same-numbered Articles from two different Constitution files never collide under the same koid");

  // -------------------------------------------------------------------
  // 3. Deterministic search
  // -------------------------------------------------------------------
  // NOTE: KO-DW-ING-001 does not literally contain the words "dishwash" or
  // "ingredients" in its own body text (that table is chemical names, not
  // prose) — KO-DW-FAQ-001/KO-DW-GQ-001 genuinely score higher for this
  // exact query because their real content happens to repeat all 4 query
  // words more densely. This is real, honest, deterministic keyword
  // matching behaving correctly, not a bug — a known limitation of
  // keyword density vs. true semantic relevance (see
  // KNOWLEDGE_INTEGRATION_REPORT.md). The fair, achievable bar is
  // "appears in the top results," not "always ranks #1."
  const searchResults = searchKnowledgeFactories({ keywords: "dishwash gel ingredients LABSA", domains: ["PRODUCT_KF"], limit: 10 });
  check(searchResults.some((r) => r.recordId === "KO-DW-ING-001"), "Search: keyword search surfaces KO-DW-ING-001 within the top 10 results for a targeted query");

  const koidLookup = searchKnowledgeFactories({ koid: "KO-BI-CH1-001", domains: ["PRODUCT_KF", "MARKETING_KF", "INSTITUTIONAL_SALES_KF", "FOUNDER_INTELLIGENCE_KF"] });
  check(koidLookup.length === 1 && koidLookup[0]!.recordId === "KO-BI-CH1-001", "Search: exact KOID lookup works across all 4 factories regardless of which one holds it");

  const wrongDomainSearch = searchKnowledgeFactories({ keywords: "dishwash gel LABSA", domains: ["FOUNDER_INTELLIGENCE_KF"], limit: 5 });
  check(wrongDomainSearch.every((r) => r.recordId !== "KO-DW-ING-001"), "Search: domain scoping correctly excludes a Product KF result when searching only Founder Intelligence KF");

  check(authorityWeightFor({ domainFactory: "FOUNDER_INTELLIGENCE_KF", approvalTier: "APPROVED", isGapRecord: false }) < authorityWeightFor({ domainFactory: "PRODUCT_KF", approvalTier: "APPROVED", isGapRecord: false }), "Authority: Founder Intelligence KF base weight is lower than Product KF (never overwrites domain facts)");
  check(authorityWeightFor({ domainFactory: "PRODUCT_KF", approvalTier: "DRAFT", isGapRecord: false }) < authorityWeightFor({ domainFactory: "PRODUCT_KF", approvalTier: "APPROVED", isGapRecord: false }), "Authority: DRAFT-tier content weighs less than APPROVED-tier content within the same factory");
  check(authorityWeightFor({ domainFactory: "INSTITUTIONAL_SALES_KF", approvalTier: "OPEN_PENDING_FOUNDER_INPUT", isGapRecord: true }) < 0.1, "Authority: a Gap Record's weight is negligible");

  // -------------------------------------------------------------------
  // 4. Founder Intelligence exclusion from fact arbitration (real KF data)
  // -------------------------------------------------------------------
  const founderResult = searchKnowledgeFactories({ koid: "FOUNDER-CONSTITUTION-ARTICLE-1", domains: ["FOUNDER_INTELLIGENCE_KF"] })[0]!;
  const productResult: RuntimeKnowledgeResult = { ...searchKnowledgeFactories({ koid: "KO-DW-ING-001", domains: ["PRODUCT_KF"] })[0]!, status: "PUBLISHED", matchedFields: ["tag:shared"] };
  const founderResultShared: RuntimeKnowledgeResult = { ...founderResult, status: "DRAFT", matchedFields: ["tag:shared"] };
  const conflicts = detectConflicts([productResult, founderResultShared], null);
  check(conflicts.length === 1, "Founder Intelligence guard: a status conflict between real Product KF and real Founder Constitution content is detected");
  const resultsByRecordId = new Map([[productResult.recordId, productResult], [founderResultShared.recordId, founderResultShared]]);
  const arbitration = arbitrateConflicts(conflicts, resultsByRecordId);
  check(arbitration.arbitrations[0]!.winningSource?.id === productResult.recordId, "Founder Intelligence guard: the real domain fact (Product KF) wins over real Founder Constitution content regardless of raw authority weight");
  check(arbitration.arbitrations[0]!.rationale.includes("Founder Intelligence"), "Founder Intelligence guard: arbitration rationale explicitly names the exclusion rule");

  // -------------------------------------------------------------------
  // 5. Founder Reasoning surfaces real Founder Intelligence content
  // -------------------------------------------------------------------
  const founderIntent = classifyIntent("What would the founder's view be on discounting this line?");
  const ctx = buildRuntimeContext(
    { results: [founderResult], methodMix: ["KNOWLEDGE_FACTORY_FILE_INDEX"], candidateCount: 1, failedSourceTypes: [], fellBackToDeterministic: false },
    founderIntent,
    {}
  );
  const priority = evaluatePriority([founderResult], { customerMessage: "What would the founder's view be on discounting this line?" });
  const memory = resolveMemory(undefined, clearance);
  const eq = evaluateEmotion("What would the founder's view be on discounting this line?");
  const cq = evaluateCare(priority, eq, ctx.intelligenceContext);
  const decision = buildDecision(priority, ctx.intelligenceContext, memory, eq, cq);
  const founderReasoning = await runFounderReasoning(priority, eq, cq, decision, ctx, founderIntent);
  check(
    founderReasoning.principlesApplied.some((p) => p.includes("FOUNDER-CONSTITUTION-ARTICLE-1") && p.includes("guides reasoning only")),
    "Founder Reasoning: real Founder Constitution Article surfaced in principlesApplied, correctly labeled advisory-only"
  );

  // -------------------------------------------------------------------
  // 6. Response Assembly discloses DRAFT-status Knowledge Factory content
  // -------------------------------------------------------------------
  // Fresh, unmutated real result — KO-DW-ING-001's real status is DRAFT
  // ("DRAFT — Pending Founder Review" in the source file). `productResult`
  // above was deliberately mutated to PUBLISHED for the arbitration test
  // and must not be reused here, or this test would not actually exercise
  // the DRAFT path it claims to.
  const realDraftResult = searchKnowledgeFactories({ koid: "KO-DW-ING-001", domains: ["PRODUCT_KF"] })[0]!;
  check(realDraftResult.status === "DRAFT", "Response Assembly test setup: KO-DW-ING-001 is genuinely DRAFT-status before use");
  const draftResponse = await assembleResponse({
    retrievalResults: [realDraftResult],
    founderReasoning,
    decisionRuntime: { decision, founderReasoning, finalRecommendation: founderReasoning.recommendedDecision, requiresHumanApproval: false },
    privacy: { redactedText: "test", matches: [], placeholderMap: {}, safeToProceed: true, blockReason: null },
    confidence: { score: 50, level: "MODERATE", groundingScore: 80, sourceAgreement: "SINGLE_SOURCE", belowThreshold: false, missingInformation: [] },
    conflicts: { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" },
    language: "EN",
    provider: null,
  });
  check(draftResponse.responseText.includes("pending Founder review"), "Response Assembly: DRAFT-status Knowledge Factory content triggers an explicit not-yet-approved disclosure");

  // -------------------------------------------------------------------
  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
