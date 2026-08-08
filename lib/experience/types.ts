import type { ConfidenceLevel, DecisionPackage, IntelligenceLevel, MemoryItem } from "@/lib/intelligence/types";
import type {
  ActionType, EscalationTarget, ExecutionPackage, ExecutionStatus, SafetyOutcome,
} from "@/lib/execution/types";
import type { SourceReference } from "@/lib/retrieval/types";

/**
 * MUV AI — Experience Platform (Module 8) shared types.
 *
 * `DecisionPackage`/`ConfidenceLevel`/`IntelligenceLevel`/`MemoryItem`
 * (Module 6) and `ExecutionPackage`/`ExecutionStatus`/`ActionType`/
 * `SafetyOutcome`/`EscalationTarget` (Module 7) and `SourceReference`
 * (Module 5) are reused directly, not redefined — the same cross-module
 * reuse discipline every module since Module 5 has followed.
 */

export type { DecisionPackage, ExecutionPackage, ExecutionStatus, ActionType, SafetyOutcome, EscalationTarget, MemoryItem };

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Plain string, not a fixed union — "Website channel adaptation" is the
 * only channel this module implements, but the type should never need a
 * change just to represent a future channel being recorded. Mirrors
 * `KnowledgeSourceType`'s (Module 5) "future sources" extensibility. */
export type ExperienceChannel = string;

export type SessionStatus = "ACTIVE" | "CLOSED" | "EXPIRED";

export type ExperienceSessionRecord = {
  id: string;
  channel: ExperienceChannel;
  customerId: string | null;
  status: SessionStatus;
  memoryItems: MemoryItem[];
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  expiresAt: string | null;
};

// ---------------------------------------------------------------------------
// Experience Request — the orchestrator's input
// ---------------------------------------------------------------------------

export type ExperienceRequest = {
  sessionId: string;
  customerMessage: string;
  customerGoal?: string;
};

// ---------------------------------------------------------------------------
// Experience Response — channel-neutral, safe customer-facing output
// ---------------------------------------------------------------------------

export type ExperienceContentBlock =
  | { type: "MESSAGE"; text: string }
  // `content` is optional and populated only for a caller whose real,
  // server-resolved session role is ADMIN/STAFF (Founder Validation & Safe
  // UAT Activation, Block B1) — see experience-orchestrator.ts. An ordinary
  // customer/anonymous turn never sets it, so this block renders identically
  // to before B1 for every non-staff caller.
  | { type: "REFERENCE_CARD"; referenceType: SourceReference["type"]; id: string; label: string; content?: string }
  | { type: "FOLLOW_UP_QUESTION"; question: string }
  | { type: "ESCALATION_NOTICE"; message: string };

export type ExperienceResponse = {
  sessionId: string;
  blocks: ExperienceContentBlock[];
  requiresHandoff: boolean;
  allowFollowUp: boolean;
  /** Reused directly from Module 7's `CQResult.toneGuidance`-derived
   * blueprint field — safe to expose, these are only tone words
   * ("empathetic", "reassuring"), never internal reasoning. */
  toneHint: string[];
  /** Safe to expose — one of 7 fixed, named values, not raw safety/policy
   * detail. A future website UI can use this to decide whether to show a
   * "connecting you with a team member" banner, for example. */
  executionStatus: ExecutionStatus;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Website Channel Adapter
// ---------------------------------------------------------------------------

export type WebsiteExperienceSegment = {
  kind: ExperienceContentBlock["type"];
  content: string;
  meta?: Record<string, unknown>;
};

export type WebsiteExperienceView = {
  sessionId: string;
  segments: WebsiteExperienceSegment[];
  requiresHandoff: boolean;
  allowFollowUp: boolean;
  executionStatus: ExecutionStatus;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Human Handoff Preparation — staff-facing
// ---------------------------------------------------------------------------

export type HandoffPackage = {
  sessionId: string;
  required: boolean;
  target: EscalationTarget;
  reason: string;
  priorityLevel: IntelligenceLevel;
  safetyOutcome: SafetyOutcome;
  customerContextSummary: { customerGoal: string | null; conversationContext: string | null };
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Feedback Capture
// ---------------------------------------------------------------------------

export type FeedbackInput = { sessionId: string; rating?: number; comment?: string };

export type FeedbackResult = {
  id: string;
  sessionId: string;
  rating: number | null;
  comment: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Analytics Event Preparation — staff-facing, computation-only, no
// persistence (see architecture.md for why this differs from Feedback)
// ---------------------------------------------------------------------------

export type AnalyticsEventType =
  | "SESSION_STARTED"
  | "MESSAGE_PROCESSED"
  | "ESCALATION_TRIGGERED"
  | "FEEDBACK_RECEIVED"
  | "SESSION_CLOSED";

export type AnalyticsEvent = {
  type: AnalyticsEventType;
  sessionId: string;
  properties: Record<string, unknown>;
  occurredAt: string;
};

// ---------------------------------------------------------------------------
// Founder/Admin Review Preparation — staff-facing, full unredacted detail
// ---------------------------------------------------------------------------

export type ReviewPackage = {
  sessionId: string;
  decisionPackage: DecisionPackage;
  executionPackage: ExecutionPackage;
  experienceResponse: ExperienceResponse;
  flaggedForReview: boolean;
  generatedAt: string;
};
