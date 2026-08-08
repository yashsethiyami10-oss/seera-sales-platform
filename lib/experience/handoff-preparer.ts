import type { ExecutionPackage, HandoffPackage } from "./types";

/**
 * MUV AI — Experience Platform (Module 8) Human Handoff Preparation.
 *
 * "Human handoff preparation" — staff-facing (see `actions/experience.ts`
 * for the RBAC split). Unlike `response-model.ts`, this file deliberately
 * DOES surface Module 7's internal fields (`safety.outcome`,
 * `escalation.reason`) — a support agent or review team needs the real
 * reason, not the generic customer-facing notice. Never called on the
 * customer-facing path itself; the orchestrator builds this only when
 * `escalation.required` is true, and only staff-gated actions expose it.
 */

export function buildHandoffPackage(sessionId: string, executionPackage: ExecutionPackage): HandoffPackage {
  const { decisionPackage, safety, escalation } = executionPackage;

  return {
    sessionId,
    required: escalation.required,
    target: escalation.target,
    reason: escalation.reason,
    priorityLevel: decisionPackage.priority.level,
    safetyOutcome: safety.outcome,
    customerContextSummary: {
      customerGoal: decisionPackage.context.customerGoal,
      conversationContext: decisionPackage.context.conversationContext,
    },
    generatedAt: new Date().toISOString(),
  };
}
