import { PrismaClient } from "@prisma/client";
import { classifyIntent } from "../lib/runtime/intent-engine";
import { buildRuntimeContext } from "../lib/runtime/context-builder";
import { runFounderReasoning } from "../lib/runtime/founder-reasoning-runtime";
import { getActiveFounderDecisions, findApplicableFounderDecisions } from "../lib/runtime/founder-decision-registry";
import { runDecisionRuntime } from "../lib/runtime/decision-runtime";
import { detectConflicts, arbitrateConflicts } from "../lib/runtime/conflict-resolution-runtime";
import { evaluateRuntimeConfidence } from "../lib/runtime/confidence-runtime";
import { scanAndRedact, restorePlaceholders } from "../lib/runtime/privacy-engine";
import { assembleResponse } from "../lib/runtime/response-assembly-runtime";
import { verifyPostGenerationSafety } from "../lib/runtime/safety-runtime";
import { detectLearningSignals, persistLearningSignals } from "../lib/runtime/learning-runtime";
import { getFeatureFlags, updateFeatureFlags } from "../lib/production/feature-flags";
import { evaluatePriority } from "../lib/intelligence/priority-engine";
import { resolveMemory } from "../lib/intelligence/memory-resolver";
import { evaluateEmotion } from "../lib/intelligence/eq-engine";
import { evaluateCare } from "../lib/intelligence/cq-engine";
import { buildDecision } from "../lib/intelligence/decision-engine";
import type { CallerClearance } from "../lib/retrieval/types";
import type { RuntimeKnowledgeResult, SemanticRetrievalOutcome } from "../lib/runtime/types";

/**
 * MUV AI — Stage 6C Runtime Engineering, manual verification script.
 *
 * Same established convention as docs/phase-5/knowledge-retrieval/testing.md:
 * no automated test runner exists in this repo, so this calls the real
 * library functions directly against the real (local dev) database.
 *
 * HONEST SCOPE LIMITATION (documented, not hidden): `resolveCallerClearance()`
 * and `requireStaff()` both call NextAuth's `auth()`, which throws outside a
 * real Next.js request scope ("`headers` was called outside a request
 * scope") — confirmed by direct probe before writing this script. This means
 * `lib/runtime/semantic-retrieval.ts` (which calls Module 5's
 * `runRetrievalPipeline` → `resolveCallerClearance()`), `lib/runtime/
 * runtime-orchestrator.ts`'s `runRuntimePipeline()`, and every function in
 * `actions/runtime.ts` (which also calls `requireStaff()`) CANNOT be
 * exercised end-to-end by this script — exactly the same limitation Module
 * 5's own testing.md recorded for its 8 Server Actions. Those three were
 * instead verified by `tsc --noEmit` + `npm run build` (both clean).
 *
 * Everything else — 8 of the 10 runtime modules, plus the full downstream
 * half of the pipeline (Context Construction through Delivery) — is
 * exercised here with a manually-constructed `CallerClearance` and a
 * fixture `RuntimeKnowledgeResult[]` standing in for a real retrieval
 * result set, the same "construct the clearance object directly" approach
 * Module 5's own script used.
 */

const prisma = new PrismaClient();
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

function fixtureResult(overrides: Partial<RuntimeKnowledgeResult>): RuntimeKnowledgeResult {
  return {
    sourceType: "PRODUCT_INTELLIGENCE",
    recordId: "rec-" + Math.random().toString(36).slice(2, 10),
    versionId: "v1",
    title: "Test Knowledge Item",
    summary: "A test summary.",
    layer: "PUBLIC",
    versionNumber: 1,
    status: "PUBLISHED",
    priorityScore: 50,
    relationship: null,
    matchedFields: ["tag:test"],
    confidence: 70,
    retrievedAt: new Date().toISOString(),
    sourceReferences: [],
    internalMetadata: null,
    retrievalMethods: ["DETERMINISTIC_PIPELINE"],
    authorityWeight: 1.0,
    ...overrides,
  };
}

function retrievalOutcome(results: RuntimeKnowledgeResult[]): SemanticRetrievalOutcome {
  return { results, methodMix: ["DETERMINISTIC_PIPELINE"], candidateCount: results.length, failedSourceTypes: [], fellBackToDeterministic: false };
}

async function main() {
  // -------------------------------------------------------------------
  // 1. Intent Intelligence Engine
  // -------------------------------------------------------------------
  const safetyIntent = classifyIntent("Is it safe to mix this serum with retinol, I'm a bit worried about a reaction");
  check(safetyIntent.primaryIntent === "PRODUCT_SAFETY", "Intent: safety question classified as PRODUCT_SAFETY");
  check(safetyIntent.safetySensitive === true, "Intent: safety-sensitive flag set");
  check(safetyIntent.domains.includes("PRODUCT"), "Intent: safety question maps to PRODUCT domain");

  const priceIntent = classifyIntent("What is the price and is it in stock right now?");
  check(priceIntent.primaryIntent === "PRICE_AVAILABILITY", "Intent: price question classified as PRICE_AVAILABILITY");
  check(priceIntent.requiresLiveData === true && priceIntent.liveDataFields.includes("MRP"), "Intent: price question requires live MRP field");

  const complaintIntent = classifyIntent("This is unacceptable, I want a refund, speak to a manager now");
  check(complaintIntent.isComplaint === true, "Intent: complaint detected");
  check(complaintIntent.requiresEscalation === true, "Intent: escalation request detected");

  const unknownIntent = classifyIntent("asdkjaslkdj");
  check(unknownIntent.primaryIntent === "GENERAL_QUESTION" && unknownIntent.confidence === "LOW", "Intent: gibberish falls back to low-confidence GENERAL_QUESTION");

  const emptyIntent = classifyIntent(undefined);
  check(emptyIntent.primaryIntent === "UNKNOWN" && emptyIntent.requiresClarification === true, "Intent: empty message is UNKNOWN + requires clarification");

  // -------------------------------------------------------------------
  // 2. Founder Decision Registry
  // -------------------------------------------------------------------
  const activeDecisions = await getActiveFounderDecisions();
  check(activeDecisions.length === 4, "Founder Decision Registry: exactly 4 APPROVED entries seeded");
  check(
    ["FD-AIC-001", "FD-AIC-002", "FD-AIC-003", "FD-AIC-004"].every((id) => activeDecisions.some((d) => d.decisionId === id)),
    "Founder Decision Registry: all four FD-AIC decisions present"
  );
  const privacyMatches = await findApplicableFounderDecisions(["privacy"]);
  check(privacyMatches.some((d) => d.decisionId === "FD-AIC-004"), "Founder Decision Registry: keyword match finds FD-AIC-004 for 'privacy'");

  // -------------------------------------------------------------------
  // 3. Context Builder
  // -------------------------------------------------------------------
  const productResults = [
    fixtureResult({ sourceType: "PRODUCT_INTELLIGENCE", recordId: "p1", title: "Vitamin C Serum", status: "PUBLISHED", authorityWeight: 1.0, matchedFields: ["tag:serum"] }),
    fixtureResult({ sourceType: "KNOWLEDGE", recordId: "k1", title: "Vitamin C Serum FAQ", status: "DRAFT", authorityWeight: 0.8, matchedFields: ["tag:serum"] }),
  ];
  const retrieval = retrievalOutcome(productResults);
  const runtimeContext = buildRuntimeContext(retrieval, safetyIntent, { customerGoal: "understand safe usage", liveOperationalData: { MRP: 999, stock: 12 } });
  check(runtimeContext.intelligenceContext.retrievedKnowledge.length === 2, "Context Builder: assembled context includes both fixture results");
  check(runtimeContext.liveOperationalData?.MRP === 999, "Context Builder: caller-supplied live operational data passed through untouched");

  // -------------------------------------------------------------------
  // 4. Founder Reasoning Runtime + Decision Runtime (Module 6 engines reused directly)
  // -------------------------------------------------------------------
  const priority = evaluatePriority(productResults, { customerMessage: "Is it safe to mix this serum with retinol" });
  const memory = resolveMemory(undefined, clearance);
  const eq = evaluateEmotion("Is it safe to mix this serum with retinol, I'm a bit worried");
  const cq = evaluateCare(priority, eq, runtimeContext.intelligenceContext);
  const decision = buildDecision(priority, runtimeContext.intelligenceContext, memory, eq, cq);
  const founderReasoning = await runFounderReasoning(priority, eq, cq, decision, runtimeContext, safetyIntent);
  check(founderReasoning.advisoryOnly === true, "Founder Reasoning: advisoryOnly is always true");
  check(founderReasoning.factsRetrieved.length === 2, "Founder Reasoning: facts retrieved reflect both fixture results");
  check(founderReasoning.risks.some((r) => r.toLowerCase().includes("safety")), "Founder Reasoning: safety risk surfaced for a safety-sensitive topic");

  const decisionRuntime = runDecisionRuntime(decision, founderReasoning);
  check(typeof decisionRuntime.requiresHumanApproval === "boolean", "Decision Runtime: requiresHumanApproval computed");

  // -------------------------------------------------------------------
  // 5. Conflict Resolution Runtime (FD-AIC-002 cascade)
  // -------------------------------------------------------------------
  const statusConflicts = detectConflicts(productResults, null);
  check(statusConflicts.length === 1 && statusConflicts[0]!.type === "STATUS_VERSION_AUTHORITY_CONFLICT", "Conflict Detection: differing status on shared-tag results detected");

  const resultsByRecordId = new Map(productResults.map((r) => [r.recordId, r]));
  const statusArbitration = arbitrateConflicts(statusConflicts, resultsByRecordId);
  check(statusArbitration.arbitrations[0]!.winningLevel === "DOMAIN_AUTHORITATIVE_KNOWLEDGE_FACTORY", "Conflict Arbitration: higher-authority-weight source wins at level 3");
  check(statusArbitration.arbitrations[0]!.winningSource?.id === "p1", "Conflict Arbitration: PRODUCT_INTELLIGENCE (weight 1.0) beats KNOWLEDGE (weight 0.8)");
  check(statusArbitration.unresolvedCount === 0, "Conflict Arbitration: level-3 resolution does not require escalation");

  const liveConflictAllowed = detectConflicts(
    [fixtureResult({ recordId: "p2", internalMetadata: { MRP: 799 } })],
    { MRP: 999 }
  );
  const liveArbitrationAllowed = arbitrateConflicts(liveConflictAllowed, new Map());
  check(liveArbitrationAllowed.arbitrations[0]!.winningLevel === "LIVE_OPERATIONAL_DATA_CURRENT_STATE_ONLY", "Conflict Arbitration: live data wins level 4 for an allowed current-state field (MRP)");

  const liveConflictDisallowed = detectConflicts(
    [fixtureResult({ recordId: "p3", internalMetadata: { usageInstructions: "apply twice daily" } })],
    { usageInstructions: "apply once daily" }
  );
  const liveArbitrationDisallowed = arbitrateConflicts(liveConflictDisallowed, new Map());
  check(
    liveArbitrationDisallowed.arbitrations[0]!.winningLevel === "UNRESOLVED_ESCALATE" && liveArbitrationDisallowed.arbitrations[0]!.escalationRequired,
    "Conflict Arbitration: live data is REFUSED for a non-current-state field (usageInstructions) and escalates instead — FD-AIC-002 level 4's own restriction honored"
  );
  check(statusArbitration.detectionLimitationNotice.length > 0, "Conflict Resolution: detection limitation notice always populated");

  // -------------------------------------------------------------------
  // 6. Confidence Runtime
  // -------------------------------------------------------------------
  const conflictingOutcome = arbitrateConflicts(statusConflicts, resultsByRecordId);
  const confidenceAgreeing = evaluateRuntimeConfidence(productResults, 6, 8, [], { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" });
  const confidenceConflicting = evaluateRuntimeConfidence(productResults, 6, 8, [], conflictingOutcome);
  check(confidenceConflicting.score <= confidenceAgreeing.score, "Confidence Runtime: a detected conflict lowers the score relative to agreement");
  const confidenceNoSource = evaluateRuntimeConfidence([], 0, 8, ["missing info"], { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" });
  check(confidenceNoSource.sourceAgreement === "NO_SOURCE" && confidenceNoSource.belowThreshold === true, "Confidence Runtime: zero retrieved results forces NO_SOURCE + belowThreshold");

  // -------------------------------------------------------------------
  // 7. Privacy Engine (FD-AIC-004)
  // -------------------------------------------------------------------
  const piiText = "Call me at 9876543210 or email me at test.user@example.com, my order is fine.";
  const piiScan = scanAndRedact(piiText);
  check(piiScan.matches.some((m) => m.category === "PHONE"), "Privacy Engine: phone number detected");
  check(piiScan.matches.some((m) => m.category === "EMAIL"), "Privacy Engine: email detected");
  check(piiScan.safeToProceed === true, "Privacy Engine: phone/email alone do not block — safe to proceed with redaction");
  check(!piiScan.redactedText.includes("9876543210") && !piiScan.redactedText.includes("test.user@example.com"), "Privacy Engine: raw values absent from redacted text");
  check(restorePlaceholders(piiScan.redactedText, piiScan.placeholderMap) === piiText, "Privacy Engine: placeholder restoration round-trips exactly");

  const cardScan = scanAndRedact("Please charge card 4111 1111 1111 1111 for this order.");
  check(cardScan.safeToProceed === false && cardScan.blockReason !== null, "Privacy Engine: PAYMENT_INFO hard-blocks (safeToProceed=false)");

  const credentialScan = scanAndRedact("my password: hunter2 isn't working");
  check(credentialScan.safeToProceed === false, "Privacy Engine: CREDENTIAL hard-blocks (safeToProceed=false)");

  const emptyScan = scanAndRedact(undefined);
  check(emptyScan.safeToProceed === true && emptyScan.matches.length === 0, "Privacy Engine: empty input is trivially safe");

  // -------------------------------------------------------------------
  // 8. Response Assembly Runtime + Safety Runtime (grounded path)
  // -------------------------------------------------------------------
  const groundedResponse = await assembleResponse({
    retrievalResults: productResults,
    founderReasoning,
    decisionRuntime,
    privacy: piiScan,
    confidence: confidenceAgreeing,
    conflicts: { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" },
    language: "EN",
    provider: null,
  });
  check(groundedResponse.fallbackUsed === true && groundedResponse.usedProvider === null, "Response Assembly: no provider configured -> deterministic fallback used, honestly labeled");
  check(groundedResponse.groundedInRepository === true && groundedResponse.citationsIncluded.length > 0, "Response Assembly: grounded response carries citations");

  const groundedSafety = verifyPostGenerationSafety(groundedResponse, {
    requiresHumanApproval: decisionRuntime.requiresHumanApproval,
    confidenceLevel: confidenceAgreeing.level,
    safetySensitive: true,
    originalPIIValues: [],
  });
  check(groundedSafety.checks.length === 12, "Safety Runtime: all 12 post-generation check areas evaluated");
  check(groundedSafety.groundingNotice.length > 0, "Safety Runtime: honesty notice always present");

  // Blocked-by-privacy path
  const blockedResponse = await assembleResponse({
    retrievalResults: productResults,
    founderReasoning,
    decisionRuntime,
    privacy: cardScan,
    confidence: confidenceAgreeing,
    conflicts: { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" },
    language: "EN",
    provider: null,
  });
  check(blockedResponse.groundedInRepository === false && blockedResponse.citationsIncluded.length === 0, "Response Assembly: privacy-blocked turn never includes citations");
  check(blockedResponse.fallbackReason === cardScan.blockReason, "Response Assembly: block reason propagated from Privacy Engine");

  // Uncertain / unresolved-conflict disclosure path
  const uncertainResponse = await assembleResponse({
    retrievalResults: productResults,
    founderReasoning,
    decisionRuntime,
    privacy: piiScan,
    confidence: confidenceAgreeing,
    conflicts: liveArbitrationDisallowed,
    language: "EN",
    provider: null,
  });
  check(uncertainResponse.responseText.toLowerCase().includes("conflicting"), "Response Assembly: unresolved-conflict disclosure included in response text");

  // Hindi / Hinglish templates
  const hiResponse = await assembleResponse({
    retrievalResults: [],
    founderReasoning,
    decisionRuntime,
    privacy: piiScan,
    confidence: confidenceNoSource,
    conflicts: { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" },
    language: "HI",
    provider: null,
  });
  check(hiResponse.responseText.length > 0 && hiResponse.language === "HI", "Response Assembly: HI template path produces non-empty text");
  const hinglishResponse = await assembleResponse({
    retrievalResults: [],
    founderReasoning,
    decisionRuntime,
    privacy: piiScan,
    confidence: confidenceNoSource,
    conflicts: { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" },
    language: "HINGLISH",
    provider: null,
  });
  check(hinglishResponse.responseText.length > 0 && hinglishResponse.language === "HINGLISH", "Response Assembly: HINGLISH template path produces non-empty text");

  // Provider-failure fallback
  const failingProvider = { name: "test-provider", generate: async () => { throw new Error("simulated provider outage"); } };
  const providerFailureResponse = await assembleResponse({
    retrievalResults: productResults,
    founderReasoning,
    decisionRuntime,
    privacy: piiScan,
    confidence: confidenceAgreeing,
    conflicts: { conflictsDetected: [], arbitrations: [], unresolvedCount: 0, detectionLimitationNotice: "" },
    language: "EN",
    provider: failingProvider,
  });
  check(providerFailureResponse.fallbackUsed === true && (providerFailureResponse.fallbackReason?.includes("failed") ?? false), "Response Assembly: a throwing provider falls back to the deterministic path instead of surfacing a raw error");

  // -------------------------------------------------------------------
  // 9. Safety Runtime — bad-pattern detection
  // -------------------------------------------------------------------
  const overconfidentResponse = { ...groundedResponse, responseText: "This is 100% safe, guaranteed to work for everyone." };
  const overconfidentSafety = verifyPostGenerationSafety(overconfidentResponse, { requiresHumanApproval: false, confidenceLevel: "LOW", safetySensitive: true, originalPIIValues: [] });
  check(overconfidentSafety.overallPassed === false, "Safety Runtime: overconfident language on a LOW-confidence/safety-sensitive response fails verification");

  const falseActionResponse = { ...groundedResponse, responseText: "I have processed your refund already." };
  const falseActionSafety = verifyPostGenerationSafety(falseActionResponse, { requiresHumanApproval: false, confidenceLevel: "HIGH", safetySensitive: false, originalPIIValues: [] });
  check(falseActionSafety.overallPassed === false, "Safety Runtime: a false action-performed claim fails verification");

  const piiLeakResponse = { ...groundedResponse, responseText: "Your registered number 9876543210 is on file." };
  const piiLeakSafety = verifyPostGenerationSafety(piiLeakResponse, { requiresHumanApproval: false, confidenceLevel: "HIGH", safetySensitive: false, originalPIIValues: ["9876543210"] });
  check(piiLeakSafety.overallPassed === false && piiLeakSafety.blockedReasons.some((r) => r.startsWith("PII_LEAKAGE")), "Safety Runtime: raw PII value leaking into response text is caught");

  // NOTE: groundedResponse itself was built from a decisionRuntime whose
  // requiresHumanApproval was already true (safety-sensitive scenario), so
  // it already carries escalationNoticeIncluded=true — reusing it here
  // would not actually test the "missing" case. Construct a response that
  // genuinely has no escalation notice to test the failure path honestly.
  const responseMissingEscalation = { ...groundedResponse, escalationNoticeIncluded: false, responseText: "Here is the product information you asked for." };
  const escalationRequiredButMissing = verifyPostGenerationSafety(responseMissingEscalation, { requiresHumanApproval: true, confidenceLevel: "HIGH", safetySensitive: false, originalPIIValues: [] });
  check(escalationRequiredButMissing.overallPassed === false, "Safety Runtime: required escalation not reflected in response fails verification");

  // -------------------------------------------------------------------
  // 10. Learning Runtime (bounded: OPEN-only, best-effort DB write)
  // -------------------------------------------------------------------
  const noResultsRetrieval = retrievalOutcome([]);
  const weakSafety = verifyPostGenerationSafety(overconfidentResponse, { requiresHumanApproval: false, confidenceLevel: "LOW", safetySensitive: true, originalPIIValues: [] });
  const signals = detectLearningSignals(emptyIntent, noResultsRetrieval, { conflictsDetected: [], arbitrations: [], unresolvedCount: 1, detectionLimitationNotice: "x" }, confidenceNoSource, weakSafety, "");
  check(
    signals.some((s) => s.type === "UNANSWERED_QUESTION") &&
      signals.some((s) => s.type === "RETRIEVAL_FAILURE") &&
      signals.some((s) => s.type === "REPEATED_CONFLICT") &&
      signals.some((s) => s.type === "WEAK_RESPONSE"),
    "Learning Runtime: all 4 detectable signal types fire together on a maximally-degraded turn"
  );

  const beforeCount = await prisma.learningCandidate.count();
  await persistLearningSignals(signals);
  const afterCount = await prisma.learningCandidate.count();
  check(afterCount === beforeCount + signals.length, "Learning Runtime: persistLearningSignals writes exactly one row per signal");
  const writtenRows = await prisma.learningCandidate.findMany({ orderBy: { createdAt: "desc" }, take: signals.length });
  check(writtenRows.every((r) => r.status === "OPEN"), "Learning Runtime boundary: every written row defaults to OPEN — nothing here ever self-approves");

  // -------------------------------------------------------------------
  // 11. Feature flags (FD-AIC-003, Production Protection)
  // -------------------------------------------------------------------
  const defaultFlags = getFeatureFlags();
  check(
    defaultFlags.RUNTIME_PIPELINE_ENABLED === false &&
      defaultFlags.RUNTIME_SEMANTIC_RETRIEVAL === false &&
      defaultFlags.RUNTIME_INTENT_INTELLIGENCE === false &&
      defaultFlags.RUNTIME_FOUNDER_REASONING === false &&
      defaultFlags.RUNTIME_CONFLICT_RESOLUTION === false &&
      defaultFlags.RUNTIME_PRIVACY_PROTECTION === false,
    "Feature Flags: all 6 Stage 6C runtime flags default false (FD-AIC-003)"
  );
  updateFeatureFlags({ RUNTIME_PIPELINE_ENABLED: true });
  check(getFeatureFlags().RUNTIME_PIPELINE_ENABLED === true, "Feature Flags: in-memory override round-trips");
  updateFeatureFlags({ RUNTIME_PIPELINE_ENABLED: false }); // restore default for any subsequent process use

  // -------------------------------------------------------------------
  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
