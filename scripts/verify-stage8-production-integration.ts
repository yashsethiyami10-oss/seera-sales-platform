import { getKnowledgeFactoryIndex, getKnowledgeFactoryLoadSummary } from "../lib/runtime/knowledge-factory-loader";
import { searchKnowledgeFactories, authorityWeightFor } from "../lib/runtime/knowledge-factory-retrieval";
import { classifyIntent } from "../lib/runtime/intent-engine";
import { buildRuntimeContext } from "../lib/runtime/context-builder";
import { runFounderReasoning } from "../lib/runtime/founder-reasoning-runtime";
import { runDecisionRuntime } from "../lib/runtime/decision-runtime";
import { detectLearningSignals } from "../lib/runtime/learning-runtime";
import { assembleResponse } from "../lib/runtime/response-assembly-runtime";
import { verifyPostGenerationSafety } from "../lib/runtime/safety-runtime";
import { evaluatePriority } from "../lib/intelligence/priority-engine";
import { resolveMemory } from "../lib/intelligence/memory-resolver";
import { evaluateEmotion } from "../lib/intelligence/eq-engine";
import { evaluateCare } from "../lib/intelligence/cq-engine";
import { buildDecision } from "../lib/intelligence/decision-engine";
import { getFeatureFlags } from "../lib/production/feature-flags";
import { validateLLMProviderConfig, getLLMProvider } from "../lib/ai";
import { orchestrateExperience } from "../lib/experience/experience-orchestrator";
import type { CallerClearance } from "../lib/retrieval/types";
import type { RuntimeKnowledgeResult } from "../lib/runtime/types";

/**
 * MUV AI — Stage 8, Production Integration verification.
 *
 * Covers what is genuinely script-testable across Phases 1-4 against the
 * real repository/database — Phases 5/7 are documentation-only per the
 * Founder's protocol and have no code to verify. `orchestrateExperience()`
 * itself (Phase 4's actual live entry point) cannot be called end-to-end
 * here — it needs a real `ExperienceSession` DB row plus a real Next.js
 * request scope for `auth()`, the same structural limitation documented
 * throughout Stages 6C-6E. What IS verified: the function still exports
 * with its original signature (compiles), and — critically — that the
 * feature flags gating the new path both default to `false`, which is the
 * actual, concrete guarantee behind "no regression."
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
  // PHASE 1 — Global Integration Audit
  // -------------------------------------------------------------------
  const summary = getKnowledgeFactoryLoadSummary();
  check(summary.length === 5, `Phase 1: all 5 Knowledge Factories registered in the loader (${summary.length})`);
  for (const domain of ["PRODUCT_KF", "MARKETING_KF", "INSTITUTIONAL_SALES_KF", "FOUNDER_INTELLIGENCE_KF", "CUSTOMER_CARE_KF"] as const) {
    const row = summary.find((s) => s.domainFactory === domain);
    check(!!row && row.koCount > 0, `Phase 1: ${domain} loads with real Knowledge Objects (${row?.koCount ?? 0})`);
  }
  const index = getKnowledgeFactoryIndex();
  check(index.length > 1000, `Phase 1: full ecosystem index is substantial (${index.length} KOs across 5 factories)`);

  const ccKO = index.find((r) => r.koid === "KO-CR-001");
  check(!!ccKO && ccKO.domainFactory === "CUSTOMER_CARE_KF", "Phase 1: Customer Care KF's KO-CR-001 is reachable through the same loader as every other factory");

  // Every real relationship KO-CR-001 declares resolves to a real KOID
  // somewhere in the full ecosystem index (repository-wide citation
  // integrity, not just within Customer Care KF's own JSON files —
  // verify-customer-care-kf.ts already checked the latter).
  const allKoids = new Set(index.map((r) => r.koid));
  const ccResults = index.filter((r) => r.domainFactory === "CUSTOMER_CARE_KF");
  let brokenRepoWideCitations = 0;
  for (const r of ccResults) {
    for (const rel of r.relationships) {
      if (!allKoids.has(rel)) {
        brokenRepoWideCitations++;
        console.error(`  BROKEN repository-wide citation: ${r.koid} -> ${rel}`);
      }
    }
  }
  check(brokenRepoWideCitations === 0, `Phase 1: every Customer Care KF relationship resolves to a real KOID somewhere in the full 5-factory ecosystem (0 broken)`);

  // -------------------------------------------------------------------
  // PHASE 2 — Customer Care Integration into Runtime
  // -------------------------------------------------------------------
  const careIntent = classifyIntent("What is your warranty and replacement policy?");
  check(careIntent.domains.includes("CUSTOMER_CARE"), "Phase 2 (Intent Intelligence): warranty/replacement question routes to CUSTOMER_CARE domain");
  check(careIntent.repositoriesRequired.some((r) => r.includes("Customer Care")), "Phase 2 (Intent Intelligence): repositoriesRequired names the real Customer Care Knowledge Factory");

  const careSearch = searchKnowledgeFactories({ keywords: "warranty policy", domains: ["CUSTOMER_CARE_KF"], limit: 5 });
  check(careSearch.length > 0, "Phase 2 (Semantic Retrieval): Customer Care KF is directly searchable and returns real results");
  const warrantyGap = careSearch.find((r) => r.recordId === "KO-CR-GAP-005");
  check(!!warrantyGap, "Phase 2 (Semantic Retrieval): the real Warranty Gap Record (KO-CR-GAP-005) is retrievable by keyword search");

  check(
    authorityWeightFor({ domainFactory: "CUSTOMER_CARE_KF", approvalTier: "REVIEW_READY", isGapRecord: false }) <
      authorityWeightFor({ domainFactory: "MARKETING_KF", approvalTier: "REVIEW_READY", isGapRecord: false }),
    "Phase 2 (Conflict Resolution): Customer Care KF authority weight is below Marketing KF's — a citation can never outrank the repository it cites"
  );

  // Founder Reasoning: gap-record risk flagging + forced escalation
  const gapResult: RuntimeKnowledgeResult = careSearch.find((r) => r.recordId === "KO-CR-GAP-005")!;
  const gapIntent = classifyIntent("What is your warranty policy?");
  const gapCtx = buildRuntimeContext(
    { results: [gapResult], methodMix: ["KNOWLEDGE_FACTORY_FILE_INDEX"], candidateCount: 1, failedSourceTypes: [], fellBackToDeterministic: false },
    gapIntent,
    {}
  );
  const gapPriority = evaluatePriority([gapResult], { customerMessage: "What is your warranty policy?" });
  const gapMemory = resolveMemory(undefined, clearance);
  const gapEq = evaluateEmotion("What is your warranty policy?");
  const gapCq = evaluateCare(gapPriority, gapEq, gapCtx.intelligenceContext);
  const gapDecision = buildDecision(gapPriority, gapCtx.intelligenceContext, gapMemory, gapEq, gapCq);
  const gapFounderReasoning = await runFounderReasoning(gapPriority, gapEq, gapCq, gapDecision, gapCtx, gapIntent);
  check(gapFounderReasoning.risks.some((r) => r.includes("Founder Decision Required gap record")), "Phase 2 (Founder Reasoning): retrieving a real Gap Record is flagged as a real risk, not silently treated as a normal fact");
  check(gapFounderReasoning.escalationTrigger === true, "Phase 2 (Founder Reasoning): a turn grounded ONLY in a Gap Record forces escalationTrigger");

  const gapDecisionRuntime = runDecisionRuntime(gapDecision, gapFounderReasoning);
  check(gapDecisionRuntime.requiresHumanApproval === true, "Phase 2 (Decision Runtime): gap-record-only escalation propagates into requiresHumanApproval");

  // Response Assembly: distinct "no policy yet" framing for gap-record-only grounding
  const gapResponse = await assembleResponse({
    retrievalResults: [gapResult],
    founderReasoning: gapFounderReasoning,
    decisionRuntime: gapDecisionRuntime,
    privacy: { redactedText: "What is your warranty policy?", matches: [], placeholderMap: {}, safeToProceed: true, blockReason: null },
    confidence: { score: 10, level: "LOW", groundingScore: 20, sourceAgreement: "SINGLE_SOURCE", belowThreshold: true, missingInformation: [] },
    conflicts: { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" },
    language: "EN",
    provider: null,
  });
  check(gapResponse.responseText.includes("confirmed, finalized policy"), "Phase 2 (Response Assembly): gap-record-only turn uses the distinct 'no confirmed policy yet' framing, not the generic grounded template");
  check(gapResponse.responseText.includes("connecting you with our team"), "Phase 2 (Response Assembly): escalation notice correctly appended for the gap-record-only + requiresHumanApproval case");

  const gapSafety = verifyPostGenerationSafety(gapResponse, { requiresHumanApproval: true, confidenceLevel: "LOW", safetySensitive: false, originalPIIValues: [] });
  check(gapSafety.overallPassed === true, "Phase 2 (Safety Runtime): the gap-record-only response passes post-generation safety verification");

  // Learning Runtime: all-results-are-gaps signal
  const gapSignals = detectLearningSignals(
    gapIntent,
    { results: [gapResult], methodMix: ["KNOWLEDGE_FACTORY_FILE_INDEX"], candidateCount: 1, failedSourceTypes: [], fellBackToDeterministic: false },
    { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" },
    { score: 10, level: "LOW", groundingScore: 20, sourceAgreement: "SINGLE_SOURCE", belowThreshold: true, missingInformation: [] },
    gapSafety,
    "What is your warranty policy?"
  );
  check(gapSignals.some((s) => s.type === "RETRIEVAL_FAILURE" && s.summary.includes("Gap Record")), "Phase 2 (Learning Runtime): a gap-record-only turn is correctly logged as a retrieval-failure-equivalent learning signal");

  // -------------------------------------------------------------------
  // PHASE 3 — LLM Production Preparation
  // -------------------------------------------------------------------
  const savedProvider = process.env.LLM_PROVIDER;
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.LLM_PROVIDER;
  const noneStatus = validateLLMProviderConfig();
  check(noneStatus.configured === true && noneStatus.selectedProvider === null, "Phase 3: no LLM_PROVIDER set is reported as a valid, configured (safe-default) state");

  process.env.LLM_PROVIDER = "ANTHROPIC";
  delete process.env.ANTHROPIC_API_KEY;
  const missingKeyStatus = validateLLMProviderConfig();
  check(missingKeyStatus.configured === false && missingKeyStatus.missingEnvVars.includes("ANTHROPIC_API_KEY"), "Phase 3: ANTHROPIC selected without a key is correctly reported as NOT configured");
  check(getLLMProvider() !== null, "Phase 3: getLLMProvider() still returns a real provider instance even when unconfigured — the missing-key error surfaces at call time, not construction time (documented behavior)");

  process.env.ANTHROPIC_API_KEY = "test-key-for-config-check-only";
  const configuredStatus = validateLLMProviderConfig();
  check(configuredStatus.configured === true, "Phase 3: ANTHROPIC with a key present is correctly reported as configured (config-shape check only, never a live call)");

  if (savedProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = savedProvider;
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;

  // -------------------------------------------------------------------
  // PHASE 4 — Website Integration (what's genuinely script-testable)
  // -------------------------------------------------------------------
  const flags = getFeatureFlags();
  check(flags.RUNTIME_PIPELINE_ENABLED === false, "Phase 4: RUNTIME_PIPELINE_ENABLED defaults false");
  check(flags.WEBSITE_RUNTIME_INTEGRATION_ENABLED === false, "Phase 4: WEBSITE_RUNTIME_INTEGRATION_ENABLED defaults false — the live path is provably inert by default");
  check(typeof orchestrateExperience === "function", "Phase 4: orchestrateExperience() still exports with its original name/shape (compiles, importable exactly as before)");

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
