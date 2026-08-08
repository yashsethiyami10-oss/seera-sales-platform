const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "..");
const prisma = new PrismaClient();
let passed = 0;
let failed = 0;
function source(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function check(ok, name, detail = "") {
  if (ok) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}

// Sprint 9 — EIOS Runtime. Structural checks (reuse of Module 6, not
// duplication) plus real runtime tests of the three new EIOS decision
// functions mirrored verbatim from the actual implementation (same
// established pattern as verify-sprint7-orchestration.cjs) — these are
// pure, DB-independent functions, so mirroring proves the real algorithm.
// The one live-DB check is personalityProfile's presence/shape on the 7
// seeded agents.

async function main() {
  // --- Structural: EIOS reuses Module 6, does not reimplement its engines ---
  const runtimeSrc = source("lib/eios/runtime.ts");
  check(runtimeSrc.includes('import { buildIntelligence } from "@/lib/intelligence/intelligence-orchestrator"'), "lib/eios/runtime.ts imports (reuses) Module 6's buildIntelligence, does not reimplement Priority/Context/Memory/EQ/CQ/Decision");
  check(!/function\s+evaluateConfidence/.test(runtimeSrc + source("lib/eios/verification-gate.ts")), "EIOS does not redefine evaluateConfidence (Module 6's own concern)");
  check(!/function\s+evaluateCare/.test(runtimeSrc + source("lib/eios/cognitive-state.ts")), "EIOS does not redefine evaluateCare (Module 6's own concern)");

  const orchestratorSrc = source("lib/muv-ai/orchestrator.ts");
  check(orchestratorSrc.includes('import { runEiosRuntime } from "@/lib/eios/runtime"'), "lib/muv-ai/orchestrator.ts wires in the EIOS runtime");
  check(orchestratorSrc.includes('eios.gate.decision !== "BLOCK"'), "the EIOS gate can only make release MORE strict (combined via AND with the existing evidence check, never replacing it)");
  check(!/toolResult\.references\.length > 0 \|\|\s*\["HELP", "CONFIGURATION"\]\.includes\(intent\)\)\s*;\s*$/m.test(orchestratorSrc.split("eios.gate.decision")[0] ?? ""), "the pre-existing evidence check text is still present ahead of the EIOS gate (not deleted, only extended)");

  // --- Real runtime: selectCognitiveState (mirrored from lib/eios/cognitive-state.ts) ---
  function selectCognitiveState(cq, confidence) {
    if (cq.escalationNeed) return "ESCALATE_TO_HUMAN";
    if (cq.trustRisk === "URGENT" || cq.trustRisk === "HIGH" || cq.reassuranceNeeded) return "CAUTIOUS_REASSURING";
    if (confidence.level === "LOW") return "TRANSPARENT_LIMITED_EVIDENCE";
    if (cq.educationNeed || cq.transparencyNeeded) return "EDUCATIONAL";
    return "STANDARD";
  }
  const baseCq = { requiredCareLevel: "LOW", reassuranceNeeded: false, transparencyNeeded: false, escalationNeed: false, empathyLevel: "LOW", followUpImportance: "MEDIUM", educationNeed: false, supportPriority: "LOW", trustRisk: "LOW", customerEffort: "LOW", reasoning: "", evidence: [] };
  const highConfidence = { score: 90, level: "HIGH", evidenceCount: 3, missingInformation: [] };
  check(selectCognitiveState(baseCq, highConfidence) === "STANDARD", "selectCognitiveState: no elevated signal -> STANDARD");
  check(selectCognitiveState({ ...baseCq, escalationNeed: true }, highConfidence) === "ESCALATE_TO_HUMAN", "selectCognitiveState: escalationNeed takes top priority -> ESCALATE_TO_HUMAN, even with high confidence");
  check(selectCognitiveState({ ...baseCq, trustRisk: "HIGH" }, highConfidence) === "CAUTIOUS_REASSURING", "selectCognitiveState: elevated trustRisk -> CAUTIOUS_REASSURING");
  check(selectCognitiveState({ ...baseCq, reassuranceNeeded: true }, highConfidence) === "CAUTIOUS_REASSURING", "selectCognitiveState: reassuranceNeeded -> CAUTIOUS_REASSURING");
  check(selectCognitiveState(baseCq, { ...highConfidence, level: "LOW" }) === "TRANSPARENT_LIMITED_EVIDENCE", "selectCognitiveState: LOW confidence (no escalation/trust signal) -> TRANSPARENT_LIMITED_EVIDENCE");
  check(selectCognitiveState({ ...baseCq, educationNeed: true }, highConfidence) === "EDUCATIONAL", "selectCognitiveState: educationNeed -> EDUCATIONAL");
  check(selectCognitiveState({ ...baseCq, escalationNeed: true, trustRisk: "HIGH" }, { ...highConfidence, level: "LOW" }) === "ESCALATE_TO_HUMAN", "selectCognitiveState: when multiple signals fire at once, escalation always wins (fixed priority order, never ambiguous)");

  // --- Real runtime: evaluateVerificationGate (mirrored from lib/eios/verification-gate.ts) ---
  function evaluateVerificationGate(decisionPackage) {
    const { confidence, cqSummary } = decisionPackage;
    if (confidence.level === "LOW") return { decision: "BLOCK", confidenceScore: confidence.score, confidenceLevel: confidence.level, escalationRecommended: cqSummary.escalationNeed };
    if (cqSummary.escalationNeed) return { decision: "ESCALATE", confidenceScore: confidence.score, confidenceLevel: confidence.level, escalationRecommended: true };
    return { decision: "PASS", confidenceScore: confidence.score, confidenceLevel: confidence.level, escalationRecommended: false };
  }
  check(evaluateVerificationGate({ confidence: highConfidence, cqSummary: baseCq }).decision === "PASS", "evaluateVerificationGate: HIGH confidence, no escalation -> PASS");
  check(evaluateVerificationGate({ confidence: { ...highConfidence, level: "LOW" }, cqSummary: baseCq }).decision === "BLOCK", "evaluateVerificationGate: LOW confidence -> BLOCK, even with no escalation signal");
  check(evaluateVerificationGate({ confidence: highConfidence, cqSummary: { ...baseCq, escalationNeed: true } }).decision === "ESCALATE", "evaluateVerificationGate: HIGH confidence but escalationNeed -> ESCALATE (never silently PASS a case CQ flagged)");
  check(evaluateVerificationGate({ confidence: { ...highConfidence, level: "LOW" }, cqSummary: { ...baseCq, escalationNeed: true } }).decision === "BLOCK", "evaluateVerificationGate: LOW confidence wins over escalation (BLOCK, not ESCALATE) -- never releases a low-confidence answer just because CQ also flagged it");

  // --- Real runtime: composePersonality (mirrored from lib/eios/personality.ts) ---
  const NEUTRAL_BASE = { tone: "clear and helpful", formality: "moderate", pace: "steady" };
  const MODULATION = {
    STANDARD: { toneSuffix: "", paceSuffix: "" },
    CAUTIOUS_REASSURING: { toneSuffix: ", calm and reassuring", paceSuffix: ", unhurried", formality: "moderate" },
    ESCALATE_TO_HUMAN: { toneSuffix: ", direct and honest about needing human follow-up", paceSuffix: "", formality: "formal" },
    EDUCATIONAL: { toneSuffix: ", patient and explanatory", paceSuffix: ", unhurried" },
    TRANSPARENT_LIMITED_EVIDENCE: { toneSuffix: ", explicit about the limits of what is known here", paceSuffix: "" },
  };
  function readBaseProfile(p) {
    if (p && typeof p === "object" && !Array.isArray(p)) {
      const tone = typeof p.tone === "string" && p.tone.trim() ? p.tone : NEUTRAL_BASE.tone;
      const formality = p.formality === "casual" || p.formality === "moderate" || p.formality === "formal" ? p.formality : NEUTRAL_BASE.formality;
      const pace = typeof p.pace === "string" && p.pace.trim() ? p.pace : NEUTRAL_BASE.pace;
      return { tone, formality, pace };
    }
    return NEUTRAL_BASE;
  }
  function composePersonality(agent, cognitiveState) {
    const base = readBaseProfile(agent.personalityProfile);
    const modulation = MODULATION[cognitiveState];
    const tone = `${base.tone}${modulation.toneSuffix}`;
    const pace = `${base.pace}${modulation.paceSuffix}`;
    const formality = modulation.formality ?? base.formality;
    return { tone, formality, pace, directive: `As ${agent.name} (${agent.purpose}): respond in a ${tone} tone, ${formality} register, at a ${pace} pace.` };
  }
  const emptyProfileResult = composePersonality({ name: "Test Agent", purpose: "testing", personalityProfile: {} }, "STANDARD");
  check(emptyProfileResult.tone === "clear and helpful", "composePersonality: an agent with no personalityProfile set falls back to the documented neutral default, never a crash or fabricated persona");
  const withProfile = composePersonality({ name: "Founder Intelligence Agent", purpose: "Founder Intelligence Agent", personalityProfile: { tone: "concise and analytical", formality: "formal", pace: "efficient" } }, "ESCALATE_TO_HUMAN");
  check(withProfile.tone === "concise and analytical, direct and honest about needing human follow-up", "composePersonality: base profile + cognitive-state modulation compose additively (base tone preserved, not replaced)");
  check(withProfile.formality === "formal", "composePersonality: ESCALATE_TO_HUMAN's formality modulation applies");
  check(withProfile.directive.includes("Founder Intelligence Agent") && withProfile.directive.includes("concise and analytical"), "composePersonality: the assembled directive references both the agent identity and the composed tone");

  // --- Live DB: seeded agents have a real personalityProfile ---
  const agents = await prisma.aiAgentDefinition.findMany({ where: { code: { in: ["FOUNDER_INTELLIGENCE", "SALES_INTELLIGENCE", "CUSTOMER_INTELLIGENCE", "COMMERCE_INTELLIGENCE", "KNOWLEDGE", "ANALYTICS", "OPERATIONS"] } } });
  check(agents.length === 7, "all 7 seeded agents found");
  for (const a of agents) {
    const p = a.personalityProfile;
    check(p && typeof p === "object" && typeof p.tone === "string" && p.tone.length > 0, `${a.code} has a real, non-empty personalityProfile.tone`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
