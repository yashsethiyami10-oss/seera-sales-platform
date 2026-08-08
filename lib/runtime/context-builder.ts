import { buildContext } from "@/lib/intelligence/context-engine";
import type { IntentResult, RuntimeContext, SemanticRetrievalOutcome } from "./types";

/**
 * MUV AI — Stage 6C Runtime, Context Builder™.
 *
 * Reuses Module 6's `buildContext()` unmodified for the product/problem/
 * care reference assembly it already does well, then wraps it with the two
 * things Module 6 never had: the Semantic Retrieval outcome (method mix,
 * fallback flag) and the Intent Engine result, plus caller-supplied
 * current-state live operational data (never fetched by this runtime
 * itself — see `types.ts`'s note on `liveOperationalData`).
 */
export function buildRuntimeContext(
  semanticRetrieval: SemanticRetrievalOutcome,
  intent: IntentResult,
  opts: {
    conversationContext?: string;
    customerGoal?: string;
    businessContext?: Record<string, unknown>;
    institutionalContext?: Record<string, unknown>;
    websiteContext?: Record<string, unknown>;
    liveOperationalData?: Record<string, unknown>;
  }
): RuntimeContext {
  const intelligenceContext = buildContext(semanticRetrieval.results, opts);

  return {
    intelligenceContext,
    semanticRetrieval,
    intent,
    liveOperationalData: opts.liveOperationalData ?? null,
  };
}
