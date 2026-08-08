export type AiPrincipal = {
  id: string; email: string | null; roleName: string; permissions: Set<string>;
  isFounder: boolean; territoryId: string | null; organizationKey: "MUV";
};
export type AiIntent = "SEARCH"|"QUESTION"|"SUMMARIZE"|"EXPLAIN"|"COMPARE"|"CALCULATE"|"GENERATE"|"RECOMMEND"|"EXECUTE_ACTION"|"HELP"|"CONFIGURATION"|"UNKNOWN";
export type EvidenceReference = { type: string; id: string; version?: string; timestamp: string; source: string };
export type GovernedResponse = {
  status: "COMPLETED"|"CLARIFICATION_REQUIRED"|"BLOCKED";
  responseType: "VERIFIED_PLATFORM_DATA"|"ORGANIZATIONAL_KNOWLEDGE"|"GENERAL_AI_KNOWLEDGE"|"MIXED";
  content: string; evidence: EvidenceReference[]; confidence: "VERY_HIGH"|"HIGH"|"MEDIUM"|"LOW"|"UNKNOWN";
  warnings: string[]; suggestedNextActions: string[]; correlationId: string;
  /** EIOS Runtime (Sprint 9) — additive, optional so every pre-existing
   * caller of GovernedResponse stays valid untouched. Populated by
   * lib/muv-ai/orchestrator.ts's submitGovernedMessage via lib/eios/runtime.ts. */
  cognitiveState?: string;
  personalityDirective?: string;
};
