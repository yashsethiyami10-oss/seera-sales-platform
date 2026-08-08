import { runRetrievalPipeline } from "./pipeline";
import { resolveInheritedSection, CATEGORY_ELIGIBLE_SECTIONS } from "./inheritance-resolver";
import { searchSimilar, type SimilarityMatch } from "./embedding-service";
import { recordKnowledgeUsage } from "@/lib/knowledge-factory/learning-service";
import { fetchCustomerIntelligenceSignal } from "./operational-data-adapter";
import type { RetrievalResult } from "./types";

/**
 * MUV Intelligence Factory V4 §4 — Retrieval Orchestration Layer (closes
 * V4 W2/EP Sprint 7). A deterministic, bounded, observable tiered plan —
 * exactly the four tiers and budgets V4 specifies, no more, no fewer.
 *
 * Composes rather than modifies: Tiers 0-1 call Module 5's existing,
 * unmodified `runRetrievalPipeline` for KNOWLEDGE/PRODUCT_INTELLIGENCE/
 * PROBLEM_INTELLIGENCE/CARE_INTELLIGENCE, and separately call Sprint 5's
 * inheritance resolver for Category/Variant scope — additive composition,
 * not a change to Module 5's own internals (its `KnowledgeSourceType`
 * enum and `sources.ts` are untouched).
 */

const TIER_BUDGETS_MS = { MANDATORY: 150, CONTEXTUAL: 300, OPERATIONAL: 500, OPTIONAL: 200 } as const;

export type OrchestrationInput = {
  productId?: string;
  variantId?: string;
  problemIntelligenceId?: string;
  careIntelligenceId?: string;
  keywords?: string;
  /** Sprint 11 (Domain Foundations) — when supplied, Tier 2 looks up the
   * caller's real CustomerIntelligenceProfile (Phase 6, reused not
   * duplicated). Optional: an anonymous/unauthenticated caller has no
   * customerId, and Tier 2 correctly stays unpersonalized for them. */
  customerId?: string;
};

export type TierTiming = { durationMs: number; timedOut: boolean; succeeded: boolean };

export type OrchestrationOutcome = {
  results: RetrievalResult[];
  enrichmentMatches: SimilarityMatch[];
  /** Tier 0 unavailable — the caller MUST fail closed (escalate), never
   * answer, per V4 §4's explicit rule. This is the direct fix for the
   * "escalation on empty safety retrieval" gap found in the V3 adversarial
   * review (Scenario 3). */
  mandatoryFailed: boolean;
  generalGuidanceOnly: boolean;
  /** True whenever no real CustomerIntelligenceProfile signal was found
   * for this call (no customerId supplied, or no profile exists yet for
   * that customer) — Sprint 11 wired Tier 2 to the real
   * CustomerIntelligenceProfile system; this is no longer an unconditional
   * placeholder, but still an honest per-call fact, not assumed false. */
  unpersonalized: boolean;
  tierTimings: Record<"MANDATORY" | "CONTEXTUAL" | "OPERATIONAL" | "OPTIONAL", TierTiming>;
  totalDurationMs: number;
};

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<{ value: T | null; timedOut: boolean; durationMs: number }> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"TIMEOUT">((resolve) => { timer = setTimeout(() => resolve("TIMEOUT"), ms); });
  const raced = await Promise.race([work, timeout]).catch(() => "TIMEOUT" as const);
  clearTimeout(timer!);
  if (raced === "TIMEOUT") return { value: null, timedOut: true, durationMs: Date.now() - start };
  return { value: raced as T, timedOut: false, durationMs: Date.now() - start };
}

const SOURCE_TYPE_TO_TARGET_TYPE: Record<RetrievalResult["sourceType"], string> = {
  KNOWLEDGE: "KnowledgeVersion",
  PRODUCT_INTELLIGENCE: "ProductIntelligenceVersion",
  PROBLEM_INTELLIGENCE: "ProblemIntelligenceVersion",
  CARE_INTELLIGENCE: "CareIntelligenceVersion",
};

/** RetrievalResult.sourceType has no CATEGORY_INTELLIGENCE/PRODUCT_VARIANT_
 * INTELLIGENCE members (Module 5's own closed union, not extended by this
 * sprint) — Tier 1's hand-built inherited results carry the real scope in
 * `relationship` (VARIANT/PRODUCT/CATEGORY, set at construction above),
 * which this checks first before falling back to the sourceType mapping. */
function toUsageTargetType(result: RetrievalResult): string {
  if (result.relationship === "VARIANT") return "ProductVariantIntelligenceVersion";
  if (result.relationship === "CATEGORY") return "CategoryIntelligenceVersion";
  return SOURCE_TYPE_TO_TARGET_TYPE[result.sourceType];
}

function dedupeAndNormalize(results: RetrievalResult[]): RetrievalResult[] {
  const seen = new Map<string, RetrievalResult>();
  for (const r of results) {
    const key = `${r.sourceType}:${r.recordId}:${r.versionId ?? ""}`;
    const existing = seen.get(key);
    if (!existing || r.confidence > existing.confidence) seen.set(key, r);
  }
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence || b.priorityScore - a.priorityScore);
}

export async function runOrchestrationPlan(input: OrchestrationInput): Promise<OrchestrationOutcome> {
  const overallStart = Date.now();
  let results: RetrievalResult[] = [];

  // --- Tier 0: MANDATORY/SAFETY — hard budget, fails the whole request closed ---
  const tier0 = await withTimeout(
    runRetrievalPipeline("orchestration_tier0_mandatory", {
      productId: input.productId, problemIntelligenceId: input.problemIntelligenceId,
      sourceTypes: ["PRODUCT_INTELLIGENCE", "PROBLEM_INTELLIGENCE"], limit: 10,
    }),
    TIER_BUDGETS_MS.MANDATORY,
  );
  const mandatoryFailed = tier0.timedOut || !tier0.value;
  const tierTimings: OrchestrationOutcome["tierTimings"] = {
    MANDATORY: { durationMs: tier0.durationMs, timedOut: tier0.timedOut, succeeded: !mandatoryFailed },
    CONTEXTUAL: { durationMs: 0, timedOut: false, succeeded: false },
    OPERATIONAL: { durationMs: 0, timedOut: false, succeeded: false },
    OPTIONAL: { durationMs: 0, timedOut: false, succeeded: false },
  };

  if (mandatoryFailed) {
    // Tiers 1-3 are never attempted — per V4 §4, an unavailable safety
    // tier is not something later tiers can compensate for.
    return { results: [], enrichmentMatches: [], mandatoryFailed: true, generalGuidanceOnly: false, unpersonalized: true, tierTimings, totalDurationMs: Date.now() - overallStart };
  }
  if (tier0.value) results.push(...tier0.value.results);

  // --- Tier 1: CONTEXTUAL — soft budget, degrades gracefully ---
  const tier1 = await withTimeout((async () => {
    const pipelineResult = await runRetrievalPipeline("orchestration_tier1_contextual", {
      careIntelligenceId: input.careIntelligenceId, productId: input.productId, problemIntelligenceId: input.problemIntelligenceId,
      sourceTypes: ["CARE_INTELLIGENCE", "KNOWLEDGE"], limit: 10,
    });
    const inherited: RetrievalResult[] = [];
    if (input.productId) {
      for (const section of CATEGORY_ELIGIBLE_SECTIONS) {
        const resolved = await resolveInheritedSection({ productId: input.productId, variantId: input.variantId, section });
        if (resolved.scope !== "NONE" && resolved.sourceVersionId) {
          inherited.push({
            sourceType: "PRODUCT_INTELLIGENCE", recordId: input.productId, versionId: resolved.sourceVersionId,
            title: `${section} (resolved at ${resolved.scope} scope)`,
            summary: typeof resolved.value === "string" ? resolved.value.slice(0, 200) : null,
            layer: "INTERNAL", versionNumber: null, status: "PUBLISHED", priorityScore: 0, relationship: resolved.scope,
            matchedFields: [section], confidence: resolved.scope === "VARIANT" ? 80 : resolved.scope === "PRODUCT" ? 60 : 40,
            retrievedAt: new Date().toISOString(), sourceReferences: [], internalMetadata: null,
          });
        }
      }
    }
    return [...pipelineResult.results, ...inherited];
  })(), TIER_BUDGETS_MS.CONTEXTUAL);
  tierTimings.CONTEXTUAL = { durationMs: tier1.durationMs, timedOut: tier1.timedOut, succeeded: !tier1.timedOut };
  const generalGuidanceOnly = tier1.timedOut || !tier1.value;
  if (tier1.value) results.push(...tier1.value);

  // --- Tier 2: OPERATIONAL — real CustomerIntelligenceProfile lookup (Sprint 11) ---
  const tier2 = await withTimeout(
    input.customerId ? fetchCustomerIntelligenceSignal(input.customerId) : Promise.resolve(null),
    TIER_BUDGETS_MS.OPERATIONAL,
  );
  tierTimings.OPERATIONAL = { durationMs: tier2.durationMs, timedOut: tier2.timedOut, succeeded: !tier2.timedOut && !!tier2.value };
  const unpersonalized = !tier2.value;
  if (tier2.value) results.push(tier2.value);

  // --- Tier 3: OPTIONAL/ENRICHMENT — cancellable, never blocks the response ---
  const tier3 = await withTimeout(
    input.keywords ? searchSimilar(input.keywords, { limit: 5 }) : Promise.resolve([] as SimilarityMatch[]),
    TIER_BUDGETS_MS.OPTIONAL,
  );
  tierTimings.OPTIONAL = { durationMs: tier3.durationMs, timedOut: tier3.timedOut, succeeded: !tier3.timedOut };
  const enrichmentMatches = tier3.value ?? []; // timeout here never blocks or fails the response — empty is a valid, safe outcome

  const finalResults = dedupeAndNormalize(results);
  const callerRole = tier0.value!.clearance.role;
  // Best-effort, non-blocking-on-failure usage telemetry (Sprint 8) — never
  // throws (recordKnowledgeUsage catches its own errors), awaited only so
  // the write actually completes before a serverless invocation ends.
  await recordKnowledgeUsage(
    finalResults.filter((r) => r.versionId).map((r) => ({ targetType: toUsageTargetType(r), targetId: r.versionId!, usedInAction: "orchestration_plan", callerRole }))
  );

  return {
    results: finalResults,
    enrichmentMatches,
    mandatoryFailed: false,
    generalGuidanceOnly,
    unpersonalized,
    tierTimings,
    totalDurationMs: Date.now() - overallStart,
  };
}
