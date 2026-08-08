import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  ConflictResolutionOutcome, IntentResult, LearningSignal, PostGenerationSafetyResult,
  RuntimeConfidenceResult, SemanticRetrievalOutcome,
} from "./types";

/**
 * MUV AI — Stage 6C Runtime, Learning Runtime™.
 *
 * Strict boundary per the Founder's Implementation Mission:
 *
 *   MAY: log patterns, identify unanswered questions / retrieval failures /
 *   repeated conflicts / weak responses, generate KCR candidates / Founder
 *   Decision candidates / audit queue entries.
 *
 *   MAY NOT: rewrite Knowledge Objects, approve its own learning, change
 *   Founder Rules, change product facts/policies, promote unreviewed
 *   learning into production knowledge.
 *
 * This module only ever writes rows to `LearningCandidate` with
 * `status: "OPEN"` (the Prisma column default — never set explicitly to
 * anything else here). Nothing in this file or its caller ever sets a row
 * to `REVIEWED_APPROVED`/`REVIEWED_REJECTED`, touches a Knowledge Factory
 * markdown file, or writes to `FounderDecisionRegistryEntry`. Promotion
 * requires a human to read `reviewedById`/`reviewNotes` and act outside
 * this codebase — that boundary is structural, not just documented.
 */

export function detectLearningSignals(
  intent: IntentResult,
  retrieval: SemanticRetrievalOutcome,
  conflicts: ConflictResolutionOutcome,
  confidence: RuntimeConfidenceResult,
  safety: PostGenerationSafetyResult,
  customerMessage: string
): LearningSignal[] {
  const signals: LearningSignal[] = [];

  if (intent.primaryIntent === "UNKNOWN" || (intent.requiresClarification && retrieval.results.length === 0)) {
    signals.push({
      type: "UNANSWERED_QUESTION",
      summary: `Could not classify or ground a response for: "${customerMessage.slice(0, 200)}"`,
      evidence: { primaryIntent: intent.primaryIntent, requiresClarification: intent.requiresClarification },
    });
  }

  // Stage 8 — a turn where every retrieved result is a Gap Record found
  // nothing useful in practice, even though `retrieval.results.length` is
  // non-zero (a Gap Record is a real KO). Treated as equivalent to a
  // retrieval failure for learning purposes: it is exactly the signal the
  // Founder needs to see repeated Returns/Refund/Warranty/etc. questions
  // piling up against unresolved gaps.
  const allResultsAreGaps = retrieval.results.length > 0 && retrieval.results.every((r) => (r.internalMetadata as Record<string, unknown> | null)?.["isGapRecord"] === true);

  if (retrieval.results.length === 0 || retrieval.failedSourceTypes.length > 0 || allResultsAreGaps) {
    signals.push({
      type: "RETRIEVAL_FAILURE",
      summary: allResultsAreGaps
        ? `Every retrieved result for this turn was a Founder Decision Required Gap Record — no real answer exists yet (${retrieval.results.map((r) => r.recordId).join(", ")}).`
        : retrieval.results.length === 0
          ? "No repository results retrieved for this turn."
          : `Retrieval partially failed for source type(s): ${retrieval.failedSourceTypes.join(", ")}.`,
      evidence: { candidateCount: retrieval.candidateCount, failedSourceTypes: retrieval.failedSourceTypes, methodMix: retrieval.methodMix, allResultsAreGaps },
    });
  }

  if (conflicts.unresolvedCount > 0) {
    signals.push({
      type: "REPEATED_CONFLICT",
      summary: `${conflicts.unresolvedCount} conflict(s) could not be resolved by the FD-AIC-002 cascade and required escalation.`,
      evidence: { conflicts: conflicts.arbitrations.filter((a) => a.escalationRequired).map((a) => ({ type: a.conflict.type, field: a.conflict.fieldOrTopic })) },
    });
  }

  if (confidence.belowThreshold || !safety.overallPassed) {
    signals.push({
      type: "WEAK_RESPONSE",
      summary: !safety.overallPassed
        ? `Post-generation safety verification failed: ${safety.blockedReasons.join("; ")}`
        : `Confidence below threshold (score ${confidence.score}, grounding ${confidence.groundingScore}).`,
      evidence: { confidenceScore: confidence.score, groundingScore: confidence.groundingScore, safetyChecksFailed: safety.blockedReasons },
    });
  }

  return signals;
}

/** Best-effort, never-blocking write — matches Module 5's own
 * `logRetrieval()` discipline. A learning-candidate write failure must
 * never fail the customer-facing turn. */
export async function persistLearningSignals(signals: LearningSignal[]): Promise<void> {
  if (!signals.length) return;
  try {
    await prisma.learningCandidate.createMany({
      data: signals.map((s) => ({ type: s.type, summary: s.summary, evidence: s.evidence as object })),
    });
  } catch (err) {
    logger.error("runtime:learning-candidate-write-failed", { error: err instanceof Error ? err.message : String(err) });
  }
}
