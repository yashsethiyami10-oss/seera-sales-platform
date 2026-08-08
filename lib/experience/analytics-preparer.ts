import type { AnalyticsEvent, ExecutionPackage } from "./types";

/**
 * MUV AI — Experience Platform (Module 8) Analytics Event Preparation.
 *
 * "Analytics event preparation" — computation-only, no persistence. This
 * mirrors Module 6/7's own "prepare, don't execute/store" ethos: returns
 * structured event objects for a future analytics ingestion pipeline
 * (not built) to consume, rather than writing to a new table itself. The
 * module prompt said "preparation," not "capture" or "storage" — contrast
 * with Feedback Capture, which explicitly says "capture" and does persist
 * (see `feedback-capture.ts`). Staff-facing: event `properties` carry
 * internal classification (priority category, safety outcome) not meant
 * for a customer-facing surface.
 */

export function prepareAnalyticsEvents(sessionId: string, executionPackage: ExecutionPackage): AnalyticsEvent[] {
  const { decisionPackage, safety, escalation, action, executionStatus } = executionPackage;
  const now = new Date().toISOString();

  const events: AnalyticsEvent[] = [
    {
      type: "MESSAGE_PROCESSED",
      sessionId,
      properties: {
        priorityCategory: decisionPackage.priority.category,
        priorityLevel: decisionPackage.priority.level,
        emotionalState: decisionPackage.eqSummary.state,
        safetyOutcome: safety.outcome,
        executionStatus,
        actionType: action.action,
        confidenceLevel: decisionPackage.confidence.level,
      },
      occurredAt: now,
    },
  ];

  if (escalation.required) {
    events.push({
      type: "ESCALATION_TRIGGERED",
      sessionId,
      properties: { target: escalation.target, safetyOutcome: safety.outcome },
      occurredAt: now,
    });
  }

  return events;
}
