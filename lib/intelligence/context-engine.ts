import type { RetrievalResult, SourceReference } from "@/lib/retrieval/types";
import type { IntelligenceContext } from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) Context Engine.
 *
 * "Context must be deterministic. No AI." — this is pure structural
 * assembly: every field is either passed straight through from the
 * caller's request or derived by grouping the already-retrieved
 * knowledge by `sourceType`. Nothing is inferred, summarized, or
 * generated.
 */

export function buildContext(
  retrievedKnowledge: RetrievalResult[],
  request: {
    conversationContext?: string;
    customerGoal?: string;
    businessContext?: Record<string, unknown>;
    institutionalContext?: Record<string, unknown>;
    websiteContext?: Record<string, unknown>;
  }
): IntelligenceContext {
  const toReference = (r: RetrievalResult): SourceReference => ({
    type: r.sourceType,
    id: r.recordId,
    label: r.title,
    linkKind: "direct",
  });

  return {
    conversationContext: request.conversationContext ?? null,
    customerGoal: request.customerGoal ?? null,
    retrievedKnowledge,
    referencedProducts: retrievedKnowledge.filter((r) => r.sourceType === "PRODUCT_INTELLIGENCE").map(toReference),
    referencedProblems: retrievedKnowledge.filter((r) => r.sourceType === "PROBLEM_INTELLIGENCE").map(toReference),
    referencedCareWorkflows: retrievedKnowledge.filter((r) => r.sourceType === "CARE_INTELLIGENCE").map(toReference),
    businessContext: request.businessContext ?? null,
    institutionalContext: request.institutionalContext ?? null,
    websiteContext: request.websiteContext ?? null,
  };
}
