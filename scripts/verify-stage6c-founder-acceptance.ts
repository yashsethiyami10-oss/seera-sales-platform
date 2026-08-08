import { PrismaClient } from "@prisma/client";
import { classifyIntent } from "../lib/runtime/intent-engine";
import { buildRuntimeContext } from "../lib/runtime/context-builder";
import { runFounderReasoning } from "../lib/runtime/founder-reasoning-runtime";
import { runDecisionRuntime } from "../lib/runtime/decision-runtime";
import { detectConflicts, arbitrateConflicts } from "../lib/runtime/conflict-resolution-runtime";
import { evaluateRuntimeConfidence } from "../lib/runtime/confidence-runtime";
import { scanAndRedact } from "../lib/runtime/privacy-engine";
import { assembleResponse } from "../lib/runtime/response-assembly-runtime";
import { verifyPostGenerationSafety } from "../lib/runtime/safety-runtime";
import { evaluatePriority } from "../lib/intelligence/priority-engine";
import { resolveMemory } from "../lib/intelligence/memory-resolver";
import { evaluateEmotion } from "../lib/intelligence/eq-engine";
import { evaluateCare } from "../lib/intelligence/cq-engine";
import { buildDecision } from "../lib/intelligence/decision-engine";
import type { CallerClearance } from "../lib/retrieval/types";
import type { ResponseLanguage, RuntimeKnowledgeResult } from "../lib/runtime/types";

/**
 * MUV AI — Stage 6C Founder Acceptance Simulations.
 *
 * Same manual-chaining approach as scripts/verify-stage6c-runtime.ts, for
 * the same structural reason (resolveCallerClearance()/requireStaff() both
 * throw outside a real Next.js request scope) — real repository retrieval
 * is replaced with a small, honest fixture set per scenario. This is a
 * SIMULATION against library functions, not a live conversation through
 * the real orchestrator or a real LLM (none is configured — see
 * RUNTIME_IMPLEMENTATION_REPORT.md §2.1). Output captured here is real
 * (not fabricated) execution output of the real deterministic code.
 */

const prisma = new PrismaClient();
const clearance: CallerClearance = { role: "STAFF", maxLayer: "INTERNAL", canAccessNonPublished: true };

function fixture(overrides: Partial<RuntimeKnowledgeResult>): RuntimeKnowledgeResult {
  return {
    sourceType: "PRODUCT_INTELLIGENCE", recordId: "r-" + Math.random().toString(36).slice(2, 9),
    versionId: "v1", title: "Fixture Item", summary: "Fixture summary.", layer: "PUBLIC",
    versionNumber: 1, status: "PUBLISHED", priorityScore: 50, relationship: null,
    matchedFields: ["tag:fixture"], confidence: 70, retrievedAt: new Date().toISOString(),
    sourceReferences: [], internalMetadata: null, retrievalMethods: ["DETERMINISTIC_PIPELINE"],
    authorityWeight: 1.0, ...overrides,
  };
}

type Scenario = {
  category: string;
  message: string;
  results: RuntimeKnowledgeResult[];
  liveOperationalData?: Record<string, unknown> | null;
  language?: ResponseLanguage;
};

const SCENARIOS: Scenario[] = [
  { category: "Product discovery", message: "Which serum is best for dry skin?", results: [fixture({ title: "Hydrating Vitamin C Serum", summary: "For dry/dull skin." })] },
  { category: "Product usage", message: "How often should I use this serum?", results: [fixture({ title: "Serum Usage Guide", summary: "Once daily, evening." })] },
  { category: "Product safety", message: "Is it safe to mix this with retinol, will it cause a reaction?", results: [fixture({ sourceType: "CARE_INTELLIGENCE", title: "Serum + Retinol interaction note", authorityWeight: 0.95 })] },
  { category: "Live price/availability", message: "What is the price and is it in stock?", results: [fixture({ title: "Vitamin C Serum listing", internalMetadata: { MRP: 799 } })], liveOperationalData: { MRP: 899, stock: 4 } },
  { category: "Marketing content", message: "Can you draft a social media caption for this product?", results: [] },
  { category: "Brand governance", message: "Is this tagline on-brand for us?", results: [] },
  { category: "Institutional buyer discovery", message: "We run a chain of spas and want to place a bulk order", results: [] },
  { category: "Consumption-estimation boundaries", message: "How much product would 10 spas consume per month?", results: [] },
  { category: "Proposal guidance", message: "Can you help prepare a quotation and ROI summary for this client?", results: [] },
  { category: "Founder decision support", message: "What would the founder's view be on discounting this line?", results: [] },
  { category: "Mixed-domain", message: "Is this product safe, and can I also get a bulk institutional quote?", results: [fixture({ sourceType: "CARE_INTELLIGENCE" })] },
  {
    category: "Cross-repository conflicts",
    message: "Is this product currently published and available?",
    results: [
      fixture({ recordId: "cr1", title: "Product Page A", status: "PUBLISHED", authorityWeight: 1.0, matchedFields: ["tag:shared"] }),
      fixture({ recordId: "cr2", sourceType: "KNOWLEDGE", title: "Product Page B (older note)", status: "ARCHIVED", authorityWeight: 0.8, matchedFields: ["tag:shared"] }),
    ],
  },
  { category: "Ambiguous/incomplete request", message: "help me with it", results: [] },
  { category: "Incorrect user assumptions", message: "Since this product cures acne completely, how fast will it work?", results: [fixture({ title: "Acne-prone skin support note" })] },
  { category: "Unknown questions", message: "qwertyuiop asdfgh", results: [] },
  { category: "Complaint", message: "This is unacceptable, my order arrived damaged and I want a refund now", results: [] },
  { category: "Emotional frustration", message: "I'm so frustrated, I've asked about this twice already and still no answer", results: [] },
  { category: "Hindi language", message: "Kya yeh product meri skin ke liye safe hai?", results: [fixture({ title: "Safety note" })], language: "HI" },
  { category: "Hinglish language", message: "Yeh serum kitne din mein result dikhayega?", results: [fixture({ title: "Usage timeline note" })], language: "HINGLISH" },
  { category: "PII-heavy conversation", message: "Please call me at 9876543210 or email me at test.user@example.com about my order", results: [] },
  { category: "Retrieval failure (no knowledge found)", message: "Tell me about a product we have never documented anywhere", results: [] },
  { category: "Conflicting live/repository data", message: "What is the correct price?", results: [fixture({ recordId: "lc1", internalMetadata: { MRP: 699 } })], liveOperationalData: { MRP: 899 } },
  { category: "Unauthorized action request", message: "Please cancel my order and process my refund right now", results: [] },
];

async function runScenario(s: Scenario) {
  const intent = classifyIntent(s.message);
  const results = s.results;
  const runtimeContext = buildRuntimeContext(
    { results, methodMix: ["DETERMINISTIC_PIPELINE"], candidateCount: results.length, failedSourceTypes: [], fellBackToDeterministic: results.length === 0 },
    intent,
    { liveOperationalData: s.liveOperationalData ?? undefined }
  );
  const priority = evaluatePriority(results, { customerMessage: s.message });
  const memory = resolveMemory(undefined, clearance);
  const eq = evaluateEmotion(s.message);
  const cq = evaluateCare(priority, eq, runtimeContext.intelligenceContext);
  const decision = buildDecision(priority, runtimeContext.intelligenceContext, memory, eq, cq);
  const founderReasoning = await runFounderReasoning(priority, eq, cq, decision, runtimeContext, intent);
  const decisionRuntime = runDecisionRuntime(decision, founderReasoning);
  const resultsByRecordId = new Map(results.map((r) => [r.recordId, r]));
  const detected = detectConflicts(results, s.liveOperationalData ?? null);
  const conflicts = arbitrateConflicts(detected, resultsByRecordId);
  const evidenceCount = priority.evidence.length + eq.evidence.length + cq.evidence.length;
  const confidence = evaluateRuntimeConfidence(results, evidenceCount, 8, decision.informationStillNeeded, conflicts);
  const privacy = scanAndRedact(s.message);
  const response = await assembleResponse({
    retrievalResults: results, founderReasoning, decisionRuntime, privacy, confidence, conflicts,
    language: s.language ?? "EN", provider: null,
  });
  const safety = verifyPostGenerationSafety(response, {
    requiresHumanApproval: decisionRuntime.requiresHumanApproval, confidenceLevel: confidence.level,
    safetySensitive: intent.safetySensitive, originalPIIValues: Object.values(privacy.placeholderMap),
  });

  return { intent, conflicts, confidence, response, safety, decisionRuntime };
}

async function main() {
  for (const s of SCENARIOS) {
    const r = await runScenario(s);
    console.log("=".repeat(80));
    console.log(`CATEGORY: ${s.category}`);
    console.log(`MESSAGE: ${s.message}`);
    console.log(`intent.primaryIntent=${r.intent.primaryIntent} domains=[${r.intent.domains.join(",")}] safetySensitive=${r.intent.safetySensitive} isComplaint=${r.intent.isComplaint} requiresEscalation=${r.intent.requiresEscalation} requiresClarification=${r.intent.requiresClarification} requiresLiveData=${r.intent.requiresLiveData}`);
    console.log(`conflicts: detected=${r.conflicts.conflictsDetected.length} unresolved=${r.conflicts.unresolvedCount}`);
    console.log(`confidence: score=${r.confidence.score} level=${r.confidence.level} sourceAgreement=${r.confidence.sourceAgreement} belowThreshold=${r.confidence.belowThreshold}`);
    console.log(`decisionRuntime.requiresHumanApproval=${r.decisionRuntime.requiresHumanApproval}`);
    console.log(`response.fallbackUsed=${r.response.fallbackUsed} groundedInRepository=${r.response.groundedInRepository} citations=${r.response.citationsIncluded.length}`);
    console.log(`response.text: ${r.response.responseText}`);
    console.log(`safety.overallPassed=${r.safety.overallPassed} blockedReasons=${JSON.stringify(r.safety.blockedReasons)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
