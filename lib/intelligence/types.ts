import type { RetrievalResult, SourceReference } from "@/lib/retrieval/types";

/**
 * MUV AI — Intelligence Core (Module 6) shared types.
 *
 * Every "Level"/"Confidence" scale in this module reuses vocabulary
 * already established elsewhere rather than inventing a fifth near-
 * identical enum: `IntelligenceLevel` mirrors Module 4's `CarePriority`
 * shape (LOW/MEDIUM/HIGH/URGENT) for priority-flavored scales, and
 * `ConfidenceLevel` mirrors Module 3's `ProblemConfidenceLevel`
 * (LOW/MODERATE/HIGH — deliberately no "certain" value, same "never
 * manufacture confidence" reasoning). Neither prior module was modified.
 */

export type IntelligenceLevel = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ConfidenceLevel = "LOW" | "MODERATE" | "HIGH";

// ---------------------------------------------------------------------------
// Pipeline input
// ---------------------------------------------------------------------------

export type MemoryItemType = "CONVERSATION" | "SESSION" | "PERSISTENT";

/**
 * "Do NOT implement long-term storage. Consume only available memory." —
 * MemoryItem is supplied BY the caller (a future Module 7 / chat surface
 * that owns real memory storage), never read from a database here.
 */
export type MemoryItem = {
  id: string;
  type: MemoryItemType;
  content: string;
  layer: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL";
  createdAt: string;
  expiresAt?: string;
  confidence?: ConfidenceLevel;
};

export type IntelligenceRequest = {
  /** Fed directly into Module 5's own retrieval pipeline — Knowledge
   * Retrieval is stage one of this module's pipeline too, reused, not
   * reimplemented. */
  retrieval: {
    knowledgeId?: string;
    slug?: string;
    tags?: string[];
    keywords?: string;
    category?: string;
    productId?: string;
    problemIntelligenceId?: string;
    careIntelligenceId?: string;
    sourceTypes?: RetrievalResult["sourceType"][];
    limit?: number;
  };
  customerMessage?: string;
  customerGoal?: string;
  conversationContext?: string;
  businessContext?: Record<string, unknown>;
  institutionalContext?: Record<string, unknown>;
  websiteContext?: Record<string, unknown>;
  memory?: MemoryItem[];
};

// ---------------------------------------------------------------------------
// Priority Engine
// ---------------------------------------------------------------------------

export type PriorityCategory =
  | "SAFETY"
  | "CUSTOMER_RISK"
  | "BUSINESS_CRITICAL"
  | "CUSTOMER_GOAL"
  | "URGENCY"
  | "PRODUCT_ISSUE"
  | "COMPLAINT"
  | "SALES_OPPORTUNITY"
  | "GENERAL_INQUIRY";

export type PriorityResult = {
  category: PriorityCategory;
  level: IntelligenceLevel;
  score: number;
  evidence: string[];
  reasoning: string;
};

// ---------------------------------------------------------------------------
// Context Engine
// ---------------------------------------------------------------------------

export type IntelligenceContext = {
  conversationContext: string | null;
  customerGoal: string | null;
  retrievedKnowledge: RetrievalResult[];
  referencedProducts: SourceReference[];
  referencedProblems: SourceReference[];
  referencedCareWorkflows: SourceReference[];
  businessContext: Record<string, unknown> | null;
  institutionalContext: Record<string, unknown> | null;
  websiteContext: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Memory Resolver
// ---------------------------------------------------------------------------

export type MemoryResolution = {
  items: MemoryItem[];
  excludedCount: number;
  excludedReasons: string[];
  overallConfidence: ConfidenceLevel;
};

// ---------------------------------------------------------------------------
// EQ Engine
// ---------------------------------------------------------------------------

export type EmotionalState =
  | "NEUTRAL" | "CONFUSED" | "FRUSTRATED" | "ANGRY" | "CONCERNED"
  | "CURIOUS" | "INTERESTED" | "SATISFIED" | "POSITIVE" | "NEGATIVE" | "UNKNOWN";

export type EQResult = {
  state: EmotionalState;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  evidence: string[];
  reasoning: string;
};

// ---------------------------------------------------------------------------
// CQ Engine
// ---------------------------------------------------------------------------

export type CQResult = {
  requiredCareLevel: IntelligenceLevel;
  reassuranceNeeded: boolean;
  transparencyNeeded: boolean;
  escalationNeed: boolean;
  empathyLevel: IntelligenceLevel;
  followUpImportance: IntelligenceLevel;
  educationNeed: boolean;
  supportPriority: IntelligenceLevel;
  trustRisk: IntelligenceLevel;
  customerEffort: IntelligenceLevel;
  reasoning: string;
  evidence: string[];
};

// ---------------------------------------------------------------------------
// Decision Engine
// ---------------------------------------------------------------------------

export type DecisionResult = {
  recommendedNextStep: string;
  recommendedKnowledge: SourceReference[];
  requiredCareWorkflow: SourceReference | null;
  escalationRequirement: boolean;
  informationStillNeeded: string[];
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  decisionReason: string;
  alternativeOptions: string[];
};

// ---------------------------------------------------------------------------
// Confidence Evaluation (shared)
// ---------------------------------------------------------------------------

export type ConfidenceEvaluation = {
  score: number;
  level: ConfidenceLevel;
  evidenceCount: number;
  missingInformation: string[];
};

// ---------------------------------------------------------------------------
// Reasoning Trace + Explainability
// ---------------------------------------------------------------------------

export type ReasoningStep = { stage: string; summary: string };
export type ReasoningTrace = ReasoningStep[];

export type ExplainabilityMetadata = {
  why: string;
  evidence: string[];
  missingInformation: string[];
  contributingModules: string[];
};

// ---------------------------------------------------------------------------
// Decision Package (the module's final output)
// ---------------------------------------------------------------------------

export type DecisionPackage = {
  priority: PriorityResult;
  context: IntelligenceContext;
  memorySummary: { itemCount: number; overallConfidence: ConfidenceLevel };
  eqSummary: EQResult;
  cqSummary: CQResult;
  decision: DecisionResult;
  confidence: ConfidenceEvaluation;
  /** Internal-only — "never expose internal reasoning." Callers without
   * staff-level access never receive this field populated; see
   * lib/intelligence/decision-package.ts. */
  reasoningTrace: ReasoningTrace | null;
  knowledgeReferences: SourceReference[];
  careReferences: SourceReference[];
  problemReferences: SourceReference[];
  productReferences: SourceReference[];
  outstandingQuestions: string[];
  requiredInformation: string[];
  escalationRecommendation: boolean;
  explainability: ExplainabilityMetadata;
  executionHints: Record<string, unknown>;
  generatedAt: string;
};
