import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveCallerClearance } from "@/lib/retrieval/permissions";
import { getFeatureFlags } from "@/lib/production/feature-flags";
import { getLLMProvider } from "@/lib/ai";
import { evaluatePriority } from "@/lib/intelligence/priority-engine";
import { resolveMemory } from "@/lib/intelligence/memory-resolver";
import { evaluateEmotion } from "@/lib/intelligence/eq-engine";
import { evaluateCare } from "@/lib/intelligence/cq-engine";
import { buildDecision } from "@/lib/intelligence/decision-engine";
import type { RetrievalContext } from "@/lib/retrieval/types";
import { classifyIntent, refineIntentWithProvider } from "./intent-engine";
import { runSemanticRetrieval } from "./semantic-retrieval";
import { buildRuntimeContext } from "./context-builder";
import { runFounderReasoning } from "./founder-reasoning-runtime";
import { runDecisionRuntime } from "./decision-runtime";
import { detectConflicts, arbitrateConflicts } from "./conflict-resolution-runtime";
import { evaluateRuntimeConfidence } from "./confidence-runtime";
import { scanAndRedact } from "./privacy-engine";
import { assembleResponse } from "./response-assembly-runtime";
import { verifyPostGenerationSafety } from "./safety-runtime";
import { detectLearningSignals, persistLearningSignals } from "./learning-runtime";
import type { RuntimeKnowledgeResult, RuntimeTurnInput, RuntimeTurnResult } from "./types";

/**
 * DEPRECATED (Phase 5.2.1, Foundation Stabilization). This Stage 6C-6E/8
 * runtime pipeline (`lib/runtime/*`, `lib/ai/*`) is a real, previously-
 * built alternative path toward the same eventual goal as the new
 * `lib/gateway/*` stack (Phase 5.2): giving the storefront a real,
 * LLM-backed, knowledge-grounded answer. The two were never reconciled.
 *
 * `lib/gateway/*` is now the ONE canonical AI request path for all new
 * work. This file is kept, unmodified, ONLY for backward compatibility
 * with the existing staff-only diagnostics surface (`actions/runtime.ts`)
 * and remains fully inert in production: both feature flags it needs
 * (`RUNTIME_PIPELINE_ENABLED`, `WEBSITE_RUNTIME_INTEGRATION_ENABLED`)
 * default `false` and are unset in every environment. Do not add new
 * capability here — new provider/knowledge/retrieval work belongs in
 * `lib/gateway/*`. See `docs/ai-intelligence-core/FOUNDATION_STABILIZATION_5_2_1.md`
 * for the full retirement/coexistence decision.
 */

/**
 * MUV AI — Stage 6C Runtime, Runtime Orchestrator. Implements FD-AIC-001's
 * exact mandatory pipeline order (Repository-First Response Assembly),
 * verbatim from the Founder's Stage 6C authorization:
 *
 *   User Input → Intent Classification → Repository Retrieval → Context
 *   Construction → Founder Reasoning → Decision and Conflict Resolution →
 *   Confidence Evaluation → PII Protection → LLM Response Assembly →
 *   Post-generation Safety Verification → Delivery
 *
 * NOT wired into `lib/experience/experience-orchestrator.ts`'s
 * `orchestrateExperience()` — that is the live, production entry point and
 * must never be modified by this stage (per FD-AIC-003, Production
 * Protection). The only caller of this function is `actions/runtime.ts`,
 * itself gated by `requireStaff()` and the `RUNTIME_PIPELINE_ENABLED`
 * feature flag (default `false`).
 *
 * Deliberately does NOT call Module 7's `executePipeline()` — FD-AIC-001's
 * named stages ("Decision and Conflict Resolution", "Confidence
 * Evaluation", "PII Protection", "Post-generation Safety Verification")
 * are a distinct, Founder-approved sequence from Module 7's own
 * (Safety/Policy/Escalation/Action/Response-Composer) pipeline — this
 * reuses Module 6's individual engines (Priority/Memory/EQ/CQ/Decision)
 * directly, the same "function-level reuse, not whole-orchestrator reuse"
 * approach Module 6 itself used for Module 5's retrieval pipeline.
 */
export async function runRuntimePipeline(input: RuntimeTurnInput): Promise<RuntimeTurnResult> {
  const pipelineStages: string[] = [];

  // Stage: User Input (implicit — input.customerMessage is the entry point)
  pipelineStages.push("user-input");

  // Stage: Intent Classification
  let intent = classifyIntent(input.customerMessage);
  // Stage 6E — optional provider-assisted refinement, only for an
  // already-LOW-confidence deterministic result, only when explicitly
  // enabled (RUNTIME_INTENT_INTELLIGENCE flag, default false per
  // FD-AIC-003) and only when a provider is actually configured. Never
  // the sole classification step — see intent-engine.ts's own docs.
  const flags = getFeatureFlags();
  const provider = getLLMProvider();
  if (flags.RUNTIME_INTENT_INTELLIGENCE && provider) {
    intent = await refineIntentWithProvider(intent, input.customerMessage, provider);
  }
  pipelineStages.push("intent-classification");

  // Response language: explicit input.language wins; otherwise mirror the
  // detected input language (Stage 6E) so a Hindi/Hinglish question gets a
  // Hindi/Hinglish-templated answer by default rather than always English.
  const language = input.language ?? (intent.detectedLanguage === "MIXED" ? "HINGLISH" : intent.detectedLanguage);

  // Stage: Repository Retrieval
  const clearance = await resolveCallerClearance();
  const retrievalContext: RetrievalContext = {
    limit: 10,
    ...input.retrieval,
    keywords: input.retrieval?.keywords ?? input.customerMessage,
  };
  const retrieval = await runSemanticRetrieval("runRuntimePipeline", retrievalContext, input.customerMessage, intent.domains);
  pipelineStages.push("repository-retrieval");

  // Stage: Context Construction
  const runtimeContext = buildRuntimeContext(retrieval, intent, {
    conversationContext: input.conversationContext,
    customerGoal: input.customerGoal,
    businessContext: input.businessContext,
    institutionalContext: input.institutionalContext,
    websiteContext: input.websiteContext,
    liveOperationalData: input.liveOperationalData,
  });
  pipelineStages.push("context-construction");

  // Stage: Founder Reasoning (internally uses Module 6's Priority/Memory/EQ/CQ/Decision engines as evidence)
  const priority = evaluatePriority(retrieval.results, {
    customerMessage: input.customerMessage,
    customerGoal: input.customerGoal,
    businessContext: input.businessContext ?? null,
    institutionalContext: input.institutionalContext ?? null,
  });
  const memory = resolveMemory(input.memory, clearance);
  const eq = evaluateEmotion(input.customerMessage);
  const cq = evaluateCare(priority, eq, runtimeContext.intelligenceContext);
  const decision = buildDecision(priority, runtimeContext.intelligenceContext, memory, eq, cq);
  const founderReasoning = await runFounderReasoning(priority, eq, cq, decision, runtimeContext, intent);
  pipelineStages.push("founder-reasoning");

  // Stage: Decision and Conflict Resolution
  const decisionRuntime = runDecisionRuntime(decision, founderReasoning);
  const resultsByRecordId = new Map<string, RuntimeKnowledgeResult>(retrieval.results.map((r) => [r.recordId, r]));
  const detectedConflicts = detectConflicts(retrieval.results, runtimeContext.liveOperationalData);
  const conflicts = arbitrateConflicts(detectedConflicts, resultsByRecordId);
  pipelineStages.push("decision-and-conflict-resolution");

  // Stage: Confidence Evaluation
  const evidenceCount = priority.evidence.length + eq.evidence.length + cq.evidence.length;
  const confidence = evaluateRuntimeConfidence(retrieval.results, evidenceCount, 8, decision.informationStillNeeded, conflicts);
  pipelineStages.push("confidence-evaluation");

  // Stage: PII Protection
  const privacy = scanAndRedact(input.customerMessage);
  pipelineStages.push("pii-protection");

  // Stage: LLM Response Assembly. `provider` is `null` unless the deployment
  // has explicitly set LLM_PROVIDER (lib/ai/index.ts) — see that file and
  // response-assembly-runtime.ts for the deterministic-fallback discipline
  // this preserves by default.
  const response = await assembleResponse({
    retrievalResults: retrieval.results,
    founderReasoning,
    decisionRuntime,
    privacy,
    confidence,
    conflicts,
    language,
    provider,
    conversationHistory: input.conversationHistory,
  });
  pipelineStages.push("llm-response-assembly");

  // Stage: Post-generation Safety Verification
  const safety = verifyPostGenerationSafety(response, {
    requiresHumanApproval: decisionRuntime.requiresHumanApproval,
    confidenceLevel: confidence.level,
    safetySensitive: intent.safetySensitive,
    originalPIIValues: Object.values(privacy.placeholderMap),
  });
  pipelineStages.push("post-generation-safety-verification");

  // Learning Runtime — best-effort, non-blocking, never gates Delivery.
  // Uses privacy.redactedText, never the raw input.customerMessage — this
  // module persists LearningCandidate.evidence.summary to the database
  // (FD-AIC-004 requires minimization at every persistence point, not only
  // the LLM-call boundary).
  const learningSignals = detectLearningSignals(intent, retrieval, conflicts, confidence, safety, privacy.redactedText);
  await persistLearningSignals(learningSignals);

  // Stage: Delivery
  pipelineStages.push("delivery");

  const result: RuntimeTurnResult = {
    turnId: input.turnId,
    intent,
    retrieval,
    founderReasoning,
    decision: decisionRuntime,
    conflicts,
    confidence,
    privacy: { redactedText: privacy.redactedText, matches: privacy.matches, safeToProceed: privacy.safeToProceed, blockReason: privacy.blockReason },
    response,
    safety,
    learningSignals,
    pipelineStages,
    stopped: false,
    stoppedAtStage: null,
    stopReason: null,
    generatedAt: new Date().toISOString(),
  };

  await writeAuditLog(input, intent, retrieval, conflicts, confidence, safety, response, pipelineStages);

  return result;
}

/** Best-effort, never-blocking — matches Module 5's `logRetrieval()` and
 * this stage's own `learning-runtime.ts` discipline. Never customer
 * message content, only structural per-stage metadata (RuntimeAuditLog has
 * no free-text message field). `stageTrace` is a JSON column (no schema
 * migration needed) — Stage 6E folds LLM audit fields (provider, token
 * usage, prompt version, whether the deterministic fallback was used) into
 * it rather than adding new columns, the same "prefer computation over
 * storage, keep the footprint additive-minimal" discipline this stage's
 * own `LLM_INTEGRATION_REPORT.md` documents as a deliberate tradeoff. */
async function writeAuditLog(
  input: RuntimeTurnInput,
  intent: RuntimeTurnResult["intent"],
  retrieval: RuntimeTurnResult["retrieval"],
  conflicts: RuntimeTurnResult["conflicts"],
  confidence: RuntimeTurnResult["confidence"],
  safety: RuntimeTurnResult["safety"],
  response: RuntimeTurnResult["response"],
  pipelineStages: string[]
): Promise<void> {
  try {
    await prisma.runtimeAuditLog.create({
      data: {
        sessionId: input.sessionId,
        turnId: input.turnId,
        intentPrimary: intent.primaryIntent,
        retrievalMethodMix: retrieval.methodMix as unknown as object,
        conflictStatus: conflicts.unresolvedCount > 0 ? "UNRESOLVED" : conflicts.conflictsDetected.length > 0 ? "RESOLVED" : "NONE",
        confidenceScore: confidence.score,
        safetyVerdict: safety.overallPassed ? "PASSED" : "FAILED",
        stageTrace: {
          stages: pipelineStages,
          detectedLanguage: intent.detectedLanguage,
          llm: {
            provider: response.usedProvider,
            fallbackUsed: response.fallbackUsed,
            promptVersion: response.promptVersion,
            usage: response.usage,
          },
        } as unknown as object,
      },
    });
  } catch (err) {
    logger.error("runtime:audit-log-write-failed", { turnId: input.turnId, error: err instanceof Error ? err.message : String(err) });
  }
}
