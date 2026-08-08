import { classifyIntent } from "../lib/runtime/intent-engine";
import { buildRuntimeContext } from "../lib/runtime/context-builder";
import { runFounderReasoning } from "../lib/runtime/founder-reasoning-runtime";
import { runDecisionRuntime } from "../lib/runtime/decision-runtime";
import { detectConflicts, arbitrateConflicts } from "../lib/runtime/conflict-resolution-runtime";
import { evaluateRuntimeConfidence } from "../lib/runtime/confidence-runtime";
import { scanAndRedact } from "../lib/runtime/privacy-engine";
import { assembleResponse } from "../lib/runtime/response-assembly-runtime";
import { verifyPostGenerationSafety } from "../lib/runtime/safety-runtime";
import { searchKnowledgeFactories } from "../lib/runtime/knowledge-factory-retrieval";
import { evaluatePriority } from "../lib/intelligence/priority-engine";
import { resolveMemory } from "../lib/intelligence/memory-resolver";
import { evaluateEmotion } from "../lib/intelligence/eq-engine";
import { evaluateCare } from "../lib/intelligence/cq-engine";
import { buildDecision } from "../lib/intelligence/decision-engine";
import type { CallerClearance } from "../lib/retrieval/types";
import type { KnowledgeDomain, KnowledgeFactorySourceType, ResponseLanguage } from "../lib/runtime/types";

/**
 * MUV AI — Stage 6D Founder Acceptance Simulations.
 *
 * Direct successor to scripts/verify-stage6c-founder-acceptance.ts. The
 * key difference: Stage 6C's 24 scenarios used small hand-written fixture
 * RuntimeKnowledgeResult objects for every category, including the 6 that
 * were structurally ungrounded at the time (Marketing content, Brand
 * governance, Institutional buyer discovery, Consumption-estimation
 * boundaries, Proposal guidance, Founder decision support) — every one of
 * those returned "I couldn't find grounded information," a real, honest
 * gap documented in FOUNDER_ACCEPTANCE_REPORT.md's finding 1.
 *
 * This script replaces the fixture retrieval for every scenario with REAL
 * `searchKnowledgeFactories()` calls against the real, file-backed
 * Knowledge Factory index (Stage 6D) — no fixtures, no dummy repository,
 * per this stage's own explicit requirement. The same structural
 * limitation as every prior script in this stage still applies:
 * `resolveCallerClearance()`/`requireStaff()` throw outside a real Next.js
 * request scope, so the DB-backed half (Module 5) and the full
 * `runRuntimePipeline()` orchestrator still cannot be exercised end-to-end
 * by script — only the Knowledge-Factory half of retrieval is real here;
 * DB-backed retrieval is simply absent from every scenario below (matching
 * what an anonymous/no-DB-hit turn would actually look like), not faked.
 */

const clearance: CallerClearance = { role: "STAFF", maxLayer: "INTERNAL", canAccessNonPublished: true };

const DOMAIN_TO_KF: Record<KnowledgeDomain, KnowledgeFactorySourceType[]> = {
  PRODUCT: ["PRODUCT_KF"],
  MARKETING: ["MARKETING_KF"],
  INSTITUTIONAL_SALES: ["INSTITUTIONAL_SALES_KF"],
  FOUNDER_INTELLIGENCE: ["FOUNDER_INTELLIGENCE_KF"],
  CUSTOMER_CARE: [],
  GENERAL: [],
};

type Scenario = {
  category: string;
  message: string;
  liveOperationalData?: Record<string, unknown> | null;
  language?: ResponseLanguage;
};

const SCENARIOS: Scenario[] = [
  { category: "Product discovery", message: "Which dishwash gel SKU sizes do we offer?" },
  { category: "Product usage", message: "How should the dishwash gel batch be manufactured, step by step?" },
  { category: "Product safety", message: "Is there a safety data sheet for the liquid detergent, is it safe to use?" },
  { category: "Live price/availability", message: "What is the price and is it in stock?", liveOperationalData: { MRP: 899, stock: 4 } },
  { category: "Marketing content", message: "What is the MUV brand identity statement?" },
  { category: "Brand governance", message: "What is the Brand Philosophy and how does it connect to MUV Darshan?" },
  { category: "Institutional buyer discovery", message: "What is the institutional sales process and lead generation framework?" },
  { category: "Consumption-estimation boundaries", message: "How do we qualify an institutional account?" },
  { category: "Proposal guidance", message: "What does the institutional sales knowledge factory say about quotations?" },
  { category: "Founder decision support", message: "What is Article 1 of the Founder Constitution about?" },
  { category: "Business strategy", message: "What does the Founder Constitution say about capital and material decisions?" },
  { category: "Mixed-domain", message: "Is the dishwash gel formulation safe, and what does the brand identity say about MUV?" },
  { category: "Cross-repository conflicts", message: "What is the ingredient list for dishwash gel and its manufacturing process?" },
  { category: "Ambiguous/incomplete request", message: "help me with it" },
  { category: "Incorrect user assumptions", message: "Since this dishwash gel cures all stains completely, how fast will it work?" },
  { category: "Unknown questions", message: "qwertyuiop asdfgh" },
  { category: "Complaint", message: "This is unacceptable, my order arrived damaged and I want a refund now" },
  { category: "Emotional frustration", message: "I'm so frustrated, I've asked about this twice already and still no answer" },
  { category: "Hindi language", message: "Dishwash gel ke ingredients kya hain?" },
  { category: "Hinglish language", message: "Dishwash gel ka manufacturing process kya hai?" },
  { category: "PII-heavy conversation", message: "Please call me at 9876543210 or email me at test.user@example.com about the dishwash gel ingredients" },
  { category: "Retrieval failure (no knowledge found)", message: "Tell me about a product we have never documented anywhere" },
  { category: "Conflicting live/repository data", message: "What is the correct MRP for the dishwash gel?", liveOperationalData: { MRP: 699 } },
  { category: "Unauthorized action request", message: "Please cancel my order and process my refund right now" },
];

async function runScenario(s: Scenario) {
  const intent = classifyIntent(s.message);
  const kfDomains = [...new Set(intent.domains.flatMap((d) => DOMAIN_TO_KF[d] ?? []))];
  const results = kfDomains.length ? searchKnowledgeFactories({ keywords: s.message, domains: kfDomains, limit: 5 }) : [];

  const runtimeContext = buildRuntimeContext(
    { results, methodMix: results.length ? ["KNOWLEDGE_FACTORY_FILE_INDEX"] : ["DETERMINISTIC_PIPELINE"], candidateCount: results.length, failedSourceTypes: [], fellBackToDeterministic: results.length === 0 },
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

  return { intent, results, conflicts, confidence, response, safety, decisionRuntime };
}

async function main() {
  for (const s of SCENARIOS) {
    const r = await runScenario(s);
    console.log("=".repeat(80));
    console.log(`CATEGORY: ${s.category}`);
    console.log(`MESSAGE: ${s.message}`);
    console.log(`intent.primaryIntent=${r.intent.primaryIntent} domains=[${r.intent.domains.join(",")}] safetySensitive=${r.intent.safetySensitive} isComplaint=${r.intent.isComplaint} requiresEscalation=${r.intent.requiresEscalation} requiresClarification=${r.intent.requiresClarification} requiresLiveData=${r.intent.requiresLiveData}`);
    console.log(`real KF retrieval: ${r.results.length} result(s) — ${r.results.map((x) => `${x.recordId} (${(x.internalMetadata as Record<string, unknown> | null)?.["koFactoryDomain"]}, status=${x.status})`).join("; ")}`);
    console.log(`conflicts: detected=${r.conflicts.conflictsDetected.length} unresolved=${r.conflicts.unresolvedCount}`);
    console.log(`confidence: score=${r.confidence.score} level=${r.confidence.level} sourceAgreement=${r.confidence.sourceAgreement} belowThreshold=${r.confidence.belowThreshold}`);
    console.log(`decisionRuntime.requiresHumanApproval=${r.decisionRuntime.requiresHumanApproval}`);
    console.log(`response.fallbackUsed=${r.response.fallbackUsed} groundedInRepository=${r.response.groundedInRepository} citations=${r.response.citationsIncluded.length}`);
    console.log(`response.text: ${r.response.responseText}`);
    console.log(`safety.overallPassed=${r.safety.overallPassed} blockedReasons=${JSON.stringify(r.safety.blockedReasons)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
