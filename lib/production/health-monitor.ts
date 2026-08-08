import { prisma } from "@/lib/prisma";
import { layerAllowed } from "@/lib/retrieval/permissions";
import { evaluatePriority } from "@/lib/intelligence/priority-engine";
import { executePipeline } from "@/lib/execution/execution-orchestrator";
import type { CallerClearance } from "@/lib/retrieval/types";
import type { DecisionPackage } from "@/lib/intelligence/types";
import type { LayerHealth, LayerStatus, SystemHealthReport } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) AI Health Monitor.
 *
 * "Return deterministic health reports." No network calls, no LLM, no
 * benchmarking. Each of the 5 layers gets one cheap, deterministic check:
 * a real DB round-trip for the two layers that own persistence
 * (Knowledge, Experience), and a fixed-input smoke test of pure logic for
 * the three that don't (Retrieval, Intelligence, Execution) — the same
 * "known input, known expected output" discipline this project's own
 * verification scripts have used in every module since Module 6.
 *
 * `buildSmokeDecisionPackage()` is exported so `performance-validator.ts`
 * can reuse the exact same fixture rather than defining its own —
 * "do not create duplicate abstractions."
 */

const SMOKE_CLEARANCE: CallerClearance = { role: "ANONYMOUS", maxLayer: "PUBLIC", canAccessNonPublished: false };

export function buildSmokeDecisionPackage(): DecisionPackage {
  return {
    priority: { category: "GENERAL_INQUIRY", level: "LOW", score: 10, evidence: ["smoke test — no signal expected"], reasoning: "health check fixture" },
    context: { conversationContext: null, customerGoal: null, retrievedKnowledge: [], referencedProducts: [], referencedProblems: [], referencedCareWorkflows: [], businessContext: null, institutionalContext: null, websiteContext: null },
    memorySummary: { itemCount: 0, overallConfidence: "LOW" },
    eqSummary: { state: "UNKNOWN", confidence: 0, confidenceLevel: "LOW", evidence: [], reasoning: "health check fixture" },
    cqSummary: { requiredCareLevel: "MEDIUM", reassuranceNeeded: false, transparencyNeeded: false, escalationNeed: false, empathyLevel: "LOW", followUpImportance: "MEDIUM", educationNeed: false, supportPriority: "LOW", trustRisk: "LOW", customerEffort: "LOW", reasoning: "health check fixture", evidence: [] },
    decision: { recommendedNextStep: "health check fixture", recommendedKnowledge: [], requiredCareWorkflow: null, escalationRequirement: false, informationStillNeeded: [], confidence: 80, confidenceLevel: "HIGH", decisionReason: "health check fixture", alternativeOptions: [] },
    confidence: { score: 80, level: "HIGH", evidenceCount: 4, missingInformation: [] },
    reasoningTrace: null,
    knowledgeReferences: [], careReferences: [], problemReferences: [], productReferences: [],
    outstandingQuestions: [], requiredInformation: [], escalationRecommendation: false,
    explainability: { why: "health check fixture", evidence: [], missingInformation: [], contributingModules: [] },
    executionHints: {}, generatedAt: new Date().toISOString(),
  };
}

async function checkKnowledge(): Promise<LayerHealth> {
  const checkedAt = new Date().toISOString();
  try {
    await prisma.knowledgeItem.count();
    return { layer: "KNOWLEDGE", status: "HEALTHY", detail: "Knowledge table reachable.", checkedAt };
  } catch (err) {
    return { layer: "KNOWLEDGE", status: "UNAVAILABLE", detail: `Database check failed: ${err instanceof Error ? err.message : "unknown error"}`, checkedAt };
  }
}

function checkRetrieval(): LayerHealth {
  const checkedAt = new Date().toISOString();
  try {
    const publicAllowed = layerAllowed("PUBLIC", SMOKE_CLEARANCE);
    const confidentialBlocked = !layerAllowed("CONFIDENTIAL", SMOKE_CLEARANCE);
    if (publicAllowed && confidentialBlocked) {
      return { layer: "RETRIEVAL", status: "HEALTHY", detail: "Permission logic returned expected results for a fixed smoke input.", checkedAt };
    }
    return { layer: "RETRIEVAL", status: "DEGRADED", detail: "Permission logic returned an unexpected result for a fixed smoke input.", checkedAt };
  } catch (err) {
    return { layer: "RETRIEVAL", status: "UNAVAILABLE", detail: `Smoke check threw: ${err instanceof Error ? err.message : "unknown error"}`, checkedAt };
  }
}

function checkIntelligence(): LayerHealth {
  const checkedAt = new Date().toISOString();
  try {
    const result = evaluatePriority([], {});
    if (result.category === "GENERAL_INQUIRY") {
      return { layer: "INTELLIGENCE", status: "HEALTHY", detail: "Priority Engine returned the expected category for an empty smoke input.", checkedAt };
    }
    return { layer: "INTELLIGENCE", status: "DEGRADED", detail: `Priority Engine returned unexpected category "${result.category}" for an empty smoke input.`, checkedAt };
  } catch (err) {
    return { layer: "INTELLIGENCE", status: "UNAVAILABLE", detail: `Smoke check threw: ${err instanceof Error ? err.message : "unknown error"}`, checkedAt };
  }
}

function checkExecution(): LayerHealth {
  const checkedAt = new Date().toISOString();
  try {
    const pkg = executePipeline({ decisionPackage: buildSmokeDecisionPackage(), clearanceLayer: "PUBLIC" });
    if (pkg.executionStatus === "EXECUTED") {
      return { layer: "EXECUTION", status: "HEALTHY", detail: "Execution pipeline returned EXECUTED for a benign smoke Decision Package.", checkedAt };
    }
    return { layer: "EXECUTION", status: "DEGRADED", detail: `Execution pipeline returned unexpected status "${pkg.executionStatus}" for a benign smoke input.`, checkedAt };
  } catch (err) {
    return { layer: "EXECUTION", status: "UNAVAILABLE", detail: `Smoke check threw: ${err instanceof Error ? err.message : "unknown error"}`, checkedAt };
  }
}

async function checkExperience(): Promise<LayerHealth> {
  const checkedAt = new Date().toISOString();
  try {
    await prisma.experienceSession.count();
    return { layer: "EXPERIENCE", status: "HEALTHY", detail: "Experience Session table reachable.", checkedAt };
  } catch (err) {
    return { layer: "EXPERIENCE", status: "UNAVAILABLE", detail: `Database check failed: ${err instanceof Error ? err.message : "unknown error"}`, checkedAt };
  }
}

function worstStatus(layers: LayerHealth[]): LayerStatus {
  if (layers.some((l) => l.status === "UNAVAILABLE")) return "UNAVAILABLE";
  if (layers.some((l) => l.status === "DEGRADED")) return "DEGRADED";
  return "HEALTHY";
}

export async function getSystemHealth(): Promise<SystemHealthReport> {
  const layers: LayerHealth[] = [
    await checkKnowledge(),
    checkRetrieval(),
    checkIntelligence(),
    checkExecution(),
    await checkExperience(),
  ];

  return { overallStatus: worstStatus(layers), layers, generatedAt: new Date().toISOString() };
}
