import type { LearningCandidateType } from "@prisma/client";
import type { ConfidenceLevel, DecisionResult, MemoryItem } from "@/lib/intelligence/types";
import type { KnowledgeSourceType, PermissionLayer, RetrievalContext, RetrievalResult, SourceReference } from "@/lib/retrieval/types";
import type { IntelligenceContext } from "@/lib/intelligence/types";

/**
 * MUV AI — Stage 6C Runtime Engineering. Shared types for `lib/runtime/*`.
 *
 * This is new, additive infrastructure that implements the Founder-approved
 * RUNTIME_ENGINEERING_MASTER.md / RUNTIME_MODULES.md / RUNTIME_PIPELINE.md
 * specification plus the four Founder Decisions issued in the Stage 6C
 * authorization (FD-AIC-001 through FD-AIC-004). It is never imported by
 * `lib/experience/experience-orchestrator.ts` (the live production entry
 * point) — see `actions/runtime.ts` for the only caller, which is itself
 * gated behind `requireStaff()` and the `RUNTIME_PIPELINE_ENABLED` feature
 * flag per FD-AIC-003 (Production Protection).
 *
 * Wherever a shape already exists in Module 5/6/7 (`ConfidenceLevel`,
 * `DecisionResult`, `MemoryItem`, `RetrievalResult`, `SourceReference`,
 * `PermissionLayer`, `KnowledgeSourceType`), it is reused directly rather
 * than redefined — the same cross-module discipline every prior module in
 * this codebase followed.
 */

// ---------------------------------------------------------------------------
// Knowledge domains — the 4 completed content Knowledge Factories plus the
// not-yet-built Customer Care KF and a catch-all. These are markdown/JSON
// repositories on disk (docs/*-knowledge-factory/), not database-backed —
// Semantic Retrieval below only ever touches the real DB-backed sources
// (KNOWLEDGE/PRODUCT_INTELLIGENCE/PROBLEM_INTELLIGENCE/CARE_INTELLIGENCE via
// Module 5's existing pipeline). Domain here is Intent Intelligence's
// classification of *which* knowledge domain a request concerns, used by
// Founder Reasoning and Conflict Arbitration — it does not by itself imply
// a new retrieval source exists for every domain.
// ---------------------------------------------------------------------------

export type KnowledgeDomain = "PRODUCT" | "MARKETING" | "INSTITUTIONAL_SALES" | "FOUNDER_INTELLIGENCE" | "CUSTOMER_CARE" | "GENERAL";

// ---------------------------------------------------------------------------
// Intent Intelligence Engine
// ---------------------------------------------------------------------------

export type IntentLabel =
  | "PRODUCT_DISCOVERY" | "PRODUCT_USAGE" | "PRODUCT_SAFETY"
  | "ORDER_STATUS" | "PRICE_AVAILABILITY"
  | "MARKETING_CONTENT" | "BRAND_GOVERNANCE"
  | "INSTITUTIONAL_INQUIRY" | "PROPOSAL_SUPPORT"
  | "FOUNDER_DECISION_SUPPORT"
  | "COMPLAINT" | "ESCALATION_REQUEST"
  | "GENERAL_QUESTION" | "UNKNOWN";

/** Stage 6E — real, detected input language/script, from
 * `query-normalizer.ts`. `MIXED` means both Devanagari and Latin script
 * tokens were present in the same message. This is the single detector
 * both Intent Classification and Semantic Retrieval rely on — never
 * duplicated as a second, possibly-inconsistent implementation. */
export type DetectedLanguage = "EN" | "HI" | "HINGLISH" | "MIXED";

export type IntentResult = {
  primaryIntent: IntentLabel;
  secondaryIntents: IntentLabel[];
  domains: KnowledgeDomain[];
  confidence: ConfidenceLevel;
  requiresLiveData: boolean;
  /** Named current-state fields only, per FD-AIC-002 level 4 — e.g. "MRP",
   * "sellingPrice", "stock". Never safety/formulation fields. */
  liveDataFields: string[];
  requiresTool: boolean;
  toolsRequired: string[];
  safetySensitive: boolean;
  isComplaint: boolean;
  requiresEscalation: boolean;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  reasoning: string;
  evidence: string[];
  /** Stage 6E — real, human-readable repository names this request
   * implicates (e.g. "Product Knowledge Factory", "Founder Decision
   * Registry"), derived deterministically from `domains`. Distinct from
   * `domains` (the internal `KnowledgeDomain` enum) — this is the
   * explicit "Repositories Required" field the Founder's protocol
   * requires as its own named output, not merely inferable from `domains`. */
  repositoriesRequired: string[];
  /** Stage 6E — which language/script the input was actually written in,
   * per `query-normalizer.ts`'s detection. */
  detectedLanguage: DetectedLanguage;
};

// ---------------------------------------------------------------------------
// Semantic Retrieval Engine
// ---------------------------------------------------------------------------

export type RetrievalMethod =
  | "KOID_LOOKUP" | "STRUCTURED_METADATA" | "DOMAIN_FILTER"
  | "SEMANTIC_KEYWORD" | "KEYWORD_FALLBACK" | "RELATIONSHIP_EXPANSION"
  | "DETERMINISTIC_PIPELINE" | "KNOWLEDGE_FACTORY_FILE_INDEX";

// ---------------------------------------------------------------------------
// Stage 6D — Knowledge Factory Integration (file-backed repositories)
// ---------------------------------------------------------------------------

/** The 4 completed, frozen, markdown/JSON Knowledge Factories under
 * docs/*-knowledge-factory/ — distinct from the 4 real DB-backed
 * `KnowledgeSourceType`s (Module 5). No Prisma migration, no schema
 * change: these are read from disk at retrieval time by
 * `knowledge-factory-loader.ts`, matching this stage's own explicit
 * "no new runtime architecture" constraint — this extends the existing
 * Semantic Retrieval Engine's data sources, it does not add a new module. */
export type KnowledgeFactorySourceType = "PRODUCT_KF" | "MARKETING_KF" | "INSTITUTIONAL_SALES_KF" | "FOUNDER_INTELLIGENCE_KF" | "CUSTOMER_CARE_KF";

/** Deterministic, 3-value classification of each KO's real `Status`/
 * `Approval Status` field text — never invented, always derived from the
 * literal string found in the source file. Drives authority weighting in
 * `semantic-retrieval.ts` and disclosure in `founder-reasoning-runtime.ts`:
 * a DRAFT-status fact is real content but must never be presented with the
 * same confidence as Founder-approved content. */
export type KOApprovalTier = "APPROVED" | "REVIEW_READY" | "DRAFT" | "OPEN_PENDING_FOUNDER_INPUT" | "UNKNOWN";

/** One real Knowledge Object, parsed from its real source markdown file —
 * never synthesized. `content` is the literal, unedited text found after
 * that KO's `**Content:**` marker in the source file. */
export type KnowledgeFactoryRecord = {
  koid: string;
  title: string;
  domainFactory: KnowledgeFactorySourceType;
  category: string | null;
  content: string;
  /** Every `- **Field:** value` pair found in the KO's metadata block,
   * keyed by the literal field name as written (e.g. "Purpose", "Scope",
   * "Evidence Classification") — preserved as-is since the 2 KO formats
   * in this codebase (Product KF vs. Marketing/Institutional/Founder KF)
   * use different field names for related concepts; never forced into one
   * rigid schema that would lose real information. */
  fields: Record<string, string>;
  relationships: string[];
  approvalTier: KOApprovalTier;
  /** True when the KO's own title/scope explicitly marks it a documented
   * gap ("Gap Record: ...", "Scope: Gap Record only — no content") — per
   * Never-Invent discipline, a Gap Record is real, retrievable content
   * (it honestly says "this isn't documented yet"), never presented as if
   * it were substantive grounding for a factual claim. */
  isGapRecord: boolean;
  sourceFile: string;
};

export type RuntimeKnowledgeResult = RetrievalResult & {
  retrievalMethods: RetrievalMethod[];
  /** Deterministic weighting by source authority (never AI-generated) —
   * see conflict-resolution-runtime.ts's use of this for level-3 arbitration. */
  authorityWeight: number;
};

export type SemanticRetrievalOutcome = {
  results: RuntimeKnowledgeResult[];
  methodMix: RetrievalMethod[];
  candidateCount: number;
  failedSourceTypes: KnowledgeSourceType[];
  /** True whenever this module could not go beyond Module 5's existing
   * deterministic pipeline (e.g. no KOID match, no tag/category match) —
   * "retain deterministic fallback; never remove existing retrieval path."
   * Reported honestly, never silently hidden. */
  fellBackToDeterministic: boolean;
};

// ---------------------------------------------------------------------------
// Context Builder
// ---------------------------------------------------------------------------

export type RuntimeContext = {
  intelligenceContext: IntelligenceContext;
  semanticRetrieval: SemanticRetrievalOutcome;
  intent: IntentResult;
  /** Current-state operational fields (MRP/stock/availability/etc) supplied
   * BY THE CALLER — this runtime never calls a live pricing/inventory
   * system itself. Absence is not an error; it just means live-data
   * questions can't be answered this turn (see confidence/safety runtimes). */
  liveOperationalData: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Founder Decision Registry (Module 4's persistence — see prisma schema)
// ---------------------------------------------------------------------------

export type FounderDecisionSummary = {
  decisionId: string;
  title: string;
  category: string;
  decisionText: string;
  scope: string;
  approvedAt: string;
};

// ---------------------------------------------------------------------------
// Founder Reasoning Runtime
// ---------------------------------------------------------------------------

export type FounderReasoningResult = {
  factsRetrieved: string[];
  /** Cites Founder Constitution Articles / Engine KO-FD ids where
   * applicable — never invented, only ever what the caller's retrieved
   * knowledge or the Founder Decision Registry actually contained. */
  principlesApplied: string[];
  options: string[];
  tradeOffs: string[];
  risks: string[];
  customerImpact: string;
  businessImpact: string;
  longTermImpact: string;
  recommendedDecision: string;
  confidence: ConfidenceLevel;
  escalationTrigger: boolean;
  /** Always true — "must remain advisory where human approval is
   * required." Founder Reasoning never becomes an autonomous actor. */
  advisoryOnly: true;
  applicableFounderDecisions: string[];
  reasoning: string;
};

// ---------------------------------------------------------------------------
// Decision Runtime
// ---------------------------------------------------------------------------

export type RuntimeDecisionResult = {
  decision: DecisionResult;
  founderReasoning: FounderReasoningResult;
  finalRecommendation: string;
  requiresHumanApproval: boolean;
};

// ---------------------------------------------------------------------------
// Conflict Resolution Runtime — detection AND arbitration (FD-AIC-002)
// ---------------------------------------------------------------------------

export type ConflictType =
  | "EXACT_FACTUAL_CONTRADICTION" | "DIFFERENT_VALUE_SAME_FIELD"
  | "STATUS_VERSION_AUTHORITY_CONFLICT" | "LIVE_DATA_VS_REPOSITORY_MISMATCH"
  | "UNSUPPORTED_CROSS_DOMAIN_DRIFT";

export type DetectedConflict = {
  type: ConflictType;
  fieldOrTopic: string;
  sourceA: SourceReference;
  sourceB: SourceReference;
  description: string;
  /** Detection is pattern/field-comparison based, never a full semantic
   * truth-check — "where full semantic detection isn't reliable, record
   * the limitation." LOW here means "flagged for human review", not "low
   * severity." */
  detectionConfidence: ConfidenceLevel;
};

/** The exact 6-level FD-AIC-002 authority cascade, in priority order. */
export type ArbitrationLevel =
  | "LATEST_FOUNDER_DECISION"
  | "FOUNDER_CONSTITUTION_AND_RULES"
  | "DOMAIN_AUTHORITATIVE_KNOWLEDGE_FACTORY"
  | "LIVE_OPERATIONAL_DATA_CURRENT_STATE_ONLY"
  | "RECENCY_CONFIDENCE_TIEBREAKER"
  | "UNRESOLVED_ESCALATE";

export type ArbitrationResult = {
  conflict: DetectedConflict;
  winningLevel: ArbitrationLevel;
  winningSource: SourceReference | null;
  rationale: string;
  escalationRequired: boolean;
};

export type ConflictResolutionOutcome = {
  conflictsDetected: DetectedConflict[];
  arbitrations: ArbitrationResult[];
  unresolvedCount: number;
  /** Honesty clause per the module's own spec — "never claim narrow
   * detection is complete semantic truth checking." Always populated. */
  detectionLimitationNotice: string;
};

// ---------------------------------------------------------------------------
// Confidence Runtime
// ---------------------------------------------------------------------------

export type SourceAgreement = "AGREEING" | "CONFLICTING" | "SINGLE_SOURCE" | "NO_SOURCE";

export type RuntimeConfidenceResult = {
  score: number;
  level: ConfidenceLevel;
  groundingScore: number;
  sourceAgreement: SourceAgreement;
  belowThreshold: boolean;
  missingInformation: string[];
};

// ---------------------------------------------------------------------------
// Privacy Engine (FD-AIC-004)
// ---------------------------------------------------------------------------

export type PIICategory =
  | "PHONE" | "EMAIL" | "POSTAL_ADDRESS" | "PAYMENT_INFO" | "CREDENTIAL"
  | "PRIVATE_ORDER_ID" | "INTERNAL_CUSTOMER_ID" | "CONFIDENTIAL_BUSINESS_DATA";

export type PIIMatch = { category: PIICategory; placeholder: string; sample: string };

export type PrivacyScanResult = {
  redactedText: string;
  matches: PIIMatch[];
  /** placeholder -> original value. Held only in-process for this turn, to
   * restore safe placeholders after generation — never logged, never sent
   * to an LLM provider. Cleared by the orchestrator once the turn ends. */
  placeholderMap: Record<string, string>;
  safeToProceed: boolean;
  blockReason: string | null;
};

// ---------------------------------------------------------------------------
// Safety and Privacy Runtime — post-generation verification
// ---------------------------------------------------------------------------

export type PostGenerationCheckArea =
  | "REPOSITORY_GROUNDING" | "CITATION_COMPLETENESS" | "UNSUPPORTED_CLAIMS"
  | "PRODUCT_SAFETY_COMPLIANCE" | "HAZARDOUS_USE_RESTRICTION"
  | "CONFIDENCE_LANGUAGE_ALIGNMENT" | "FOUNDER_RULE_COMPLIANCE"
  | "CARE_LANGUAGE_COMPLIANCE" | "PII_LEAKAGE" | "INTERNAL_INFO_LEAKAGE"
  | "UNSAFE_ACTION_REQUEST" | "REQUIRED_ESCALATION";

export type PostGenerationCheck = { area: PostGenerationCheckArea; passed: boolean; detail: string };

export type PostGenerationSafetyResult = {
  overallPassed: boolean;
  checks: PostGenerationCheck[];
  /** Honesty clause — "groundedness checks must not be falsely described
   * as truth verification." Always populated. */
  groundingNotice: string;
  blockedReasons: string[];
};

// ---------------------------------------------------------------------------
// Response Assembly Runtime — provider-independent LLM contract
// ---------------------------------------------------------------------------

export type ResponseLanguage = "EN" | "HI" | "HINGLISH";

/** Stage 6E — minimal conversation-memory shape a provider can use for
 * multi-turn context. Deliberately not `MemoryItem` (Module 6's own type,
 * which carries layer/confidence/expiry metadata this contract doesn't
 * need) — this is only what an LLM prompt actually requires: role + text. */
export type LLMConversationTurn = { role: "user" | "assistant"; content: string };

export type LLMGenerationInput = {
  systemInstructions: string;
  groundedContext: string;
  redactedUserMessage: string;
  language: ResponseLanguage;
  /** Stage 6E — prior turns for multi-turn continuity. Empty/omitted for a
   * first turn. Never contains unredacted PII — the orchestrator is
   * responsible for redacting history before it reaches this contract,
   * same as `redactedUserMessage`. */
  conversationHistory?: LLMConversationTurn[];
  /** Stage 6E — lets the prompt itself instruct the model to hedge
   * proportionally ("say so if you're not sure") rather than relying only
   * on post-generation checks to catch overconfident language. */
  confidenceLevel?: ConfidenceLevel;
  /** Stage 6E — identifies which system-instructions template produced
   * this call, for audit trace and for safely rolling out prompt changes
   * (see `lib/ai/prompt-version.ts`). */
  promptVersion: string;
};

export type LLMGenerationOutput = {
  text: string;
  providerName: string;
  /** Stage 6E — best-effort token accounting, when the provider's API
   * response includes it. Never fabricated — `undefined` when unknown. */
  usage?: { promptTokens?: number; completionTokens?: number };
};

/** Stage 6E — provider-independent LLM contract, now with a real
 * implementation behind it (`lib/ai/index.ts`'s `getLLMProvider()`), the
 * same swap-by-env-var pattern `lib/shipping/index.ts`/
 * `lib/messaging/index.ts` already establish. `generate` is required;
 * `generateStream` is optional (not every provider path needs it, and the
 * current Server Action transport does not yet consume token-by-token
 * output — see `LLM_INTEGRATION_REPORT.md`'s honest scope note). No
 * concrete provider call has been exercised against a real API in this
 * environment (no API key is configured here) — see that report for what
 * was and wasn't verified. */
export type LLMProvider = {
  name: string;
  generate: (input: LLMGenerationInput) => Promise<LLMGenerationOutput>;
  generateStream?: (input: LLMGenerationInput) => AsyncGenerator<string, void, unknown>;
};

export type ResponseAssemblyResult = {
  responseText: string;
  language: ResponseLanguage;
  usedProvider: string | null;
  groundedInRepository: boolean;
  citationsIncluded: SourceReference[];
  fallbackUsed: boolean;
  fallbackReason: string | null;
  /** True when the deterministic composer itself included an escalation/
   * human-handoff notice (any language). Set structurally, not by keyword
   * matching — the composer knows exactly when it wrote that line. Safety
   * Runtime prefers this over English-only keyword matching, which cannot
   * verify a non-English template (see safety-runtime.ts). Left `false`
   * for a real-provider response, where this runtime cannot know what the
   * provider actually wrote. */
  escalationNoticeIncluded: boolean;
  /** Stage 6E — set on every real-provider call (never on the deterministic
   * fallback path) for audit trace purposes. `null` when no provider was
   * used or usage wasn't reported by the provider. */
  usage: { promptTokens?: number; completionTokens?: number } | null;
  /** Stage 6E — which `lib/ai/prompt.ts` instruction set produced this
   * response, when a real provider was used; `null` on the fallback path. */
  promptVersion: string | null;
};

// ---------------------------------------------------------------------------
// Learning Runtime
// ---------------------------------------------------------------------------

export type LearningSignal = {
  type: LearningCandidateType;
  summary: string;
  evidence: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Turn-level input/output for the orchestrator
// ---------------------------------------------------------------------------

export type RuntimeTurnInput = {
  turnId: string;
  sessionId?: string;
  customerMessage: string;
  customerGoal?: string;
  conversationContext?: string;
  language?: ResponseLanguage;
  businessContext?: Record<string, unknown>;
  institutionalContext?: Record<string, unknown>;
  websiteContext?: Record<string, unknown>;
  /** See `RuntimeContext.liveOperationalData` — caller-supplied only. */
  liveOperationalData?: Record<string, unknown>;
  memory?: MemoryItem[];
  retrieval?: Partial<RetrievalContext>;
  /** Defaults to "PUBLIC" — the same conservative default Module 7 uses. */
  clearanceLayer?: PermissionLayer;
  /** Stage 6E — prior turns, for real multi-turn conversation continuity
   * when a real LLM provider is configured. Ignored entirely on the
   * deterministic fallback path (which has no notion of prior turns). The
   * caller is responsible for ensuring no unredacted PII is present —
   * same trust boundary as `customerMessage` itself. */
  conversationHistory?: LLMConversationTurn[];
};

export type RuntimeTurnResult = {
  turnId: string;
  intent: IntentResult;
  retrieval: SemanticRetrievalOutcome;
  founderReasoning: FounderReasoningResult;
  decision: RuntimeDecisionResult;
  conflicts: ConflictResolutionOutcome;
  confidence: RuntimeConfidenceResult;
  privacy: Omit<PrivacyScanResult, "placeholderMap">;
  response: ResponseAssemblyResult;
  safety: PostGenerationSafetyResult;
  learningSignals: LearningSignal[];
  pipelineStages: string[];
  stopped: boolean;
  stoppedAtStage: string | null;
  stopReason: string | null;
  generatedAt: string;
};
