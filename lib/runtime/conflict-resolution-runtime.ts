import type { SourceReference } from "@/lib/retrieval/types";
import type {
  ArbitrationLevel, ArbitrationResult, ConflictResolutionOutcome, ConflictType,
  DetectedConflict, RuntimeKnowledgeResult,
} from "./types";

/**
 * MUV AI — Stage 6C Runtime, Conflict Resolution Runtime™.
 *
 * Resolves CF-05 from ENGINEERING_TEST_REPORT.md. Implements BOTH halves
 * the Founder's Implementation Mission requires: detection AND arbitration
 * — arbitration follows FD-AIC-002's exact, formally-approved 6-level
 * authority cascade, in order:
 *
 *   1. Latest explicit Founder Decision
 *   2. Founder Constitution and binding Founder Rules
 *   3. Domain-authoritative Knowledge Factory
 *   4. Live operational/commercial data — CURRENT-STATE FIELDS ONLY
 *   5. Recency/confidence as tiebreaker (only between EQUAL-authority
 *      sources in the SAME subject)
 *   6. Unresolved material conflict → escalate, never invent a winner
 *
 * HONEST LIMITATION (report in every test/review document): levels 1 and 2
 * are structurally almost never reached by this module today. The Founder
 * Decision Registry (level 1) currently holds only FD-AIC-001..004, all
 * AI-governance decisions about the runtime pipeline itself, not product/
 * marketing/content facts — so no registry entry currently applies to a
 * retrieved-knowledge factual conflict. The Founder Constitution (level 2,
 * `FOUNDER_CONSTITUTION.md`) is now file-indexed as part of Stage 6D's
 * Knowledge Factory integration (see `knowledge-factory-loader.ts`), so it
 * IS retrievable — but this module still has no dedicated "is this
 * specifically a Constitution Article, not just any Founder Intelligence
 * KO" check, so level 2 is not separately implemented; any Founder
 * Intelligence content (Constitution included) is handled by the level-3
 * guard below, not a distinct level-2 path. Both limitations are
 * structural, not bugs — this module never fabricates a level-1/2 win to
 * compensate; it falls through honestly to level 3+.
 *
 * STAGE 6D ADDITION — Founder Intelligence exclusion from fact arbitration:
 * FD-AIC-002's own clarifying nuance states "Founder Intelligence may guide
 * reasoning, but may not overwrite verified domain facts." Operationalized
 * below: whenever exactly one side of a conflict is sourced from the
 * Founder Intelligence Knowledge Factory and the other is not, the
 * Founder-Intelligence-sourced side is structurally disqualified from
 * winning — regardless of its computed authority weight — because that
 * weight is deliberately the lowest of the 4 factories (0.6 base, see
 * `knowledge-factory-retrieval.ts`) but a low weight alone is not the same
 * guarantee as a hard exclusion rule. If BOTH sides are Founder
 * Intelligence content, ordinary level-3/5 arbitration between them still
 * applies (that is not "overwriting a domain fact," it is comparing two
 * pieces of the same advisory material).
 *
 * Detection is deterministic and pattern-based — two things only, both
 * genuinely checkable from the data this runtime actually has:
 *   - STATUS_VERSION_AUTHORITY_CONFLICT: two results sharing a matched
 *     field/tag but reporting different `status` values.
 *   - LIVE_DATA_VS_REPOSITORY_MISMATCH: a caller-supplied live-data field
 *     whose value differs from the same field found in a result's
 *     `internalMetadata`.
 * EXACT_FACTUAL_CONTRADICTION, free-text DIFFERENT_VALUE_SAME_FIELD, and
 * UNSUPPORTED_CROSS_DOMAIN_DRIFT would require real semantic comparison
 * this deterministic pass cannot reliably perform — they are NOT detected
 * by this module. This is stated explicitly in every result's
 * `detectionLimitationNotice`, never silently omitted, per the module
 * spec's own "never claim narrow detection is complete semantic truth
 * checking."
 */

const DETECTION_LIMITATION_NOTICE =
  "This pass detects STATUS_VERSION_AUTHORITY_CONFLICT (differing status on related results) and " +
  "LIVE_DATA_VS_REPOSITORY_MISMATCH (live field vs. repository internalMetadata) only. " +
  "EXACT_FACTUAL_CONTRADICTION, free-text DIFFERENT_VALUE_SAME_FIELD, and UNSUPPORTED_CROSS_DOMAIN_DRIFT " +
  "require semantic comparison not implemented in this deterministic pass — absence of a detected conflict " +
  "of those types is not proof none exists.";

function toRef(r: RuntimeKnowledgeResult): SourceReference {
  return { type: r.sourceType, id: r.recordId, label: r.title, linkKind: "direct" };
}

function sharedMatchedField(a: RuntimeKnowledgeResult, b: RuntimeKnowledgeResult): string | null {
  return a.matchedFields.find((f) => b.matchedFields.includes(f)) ?? null;
}

function isFounderIntelligenceKF(r: RuntimeKnowledgeResult): boolean {
  return (r.internalMetadata as Record<string, unknown> | null)?.["koFactoryDomain"] === "FOUNDER_INTELLIGENCE_KF";
}

export function detectConflicts(
  results: RuntimeKnowledgeResult[],
  liveOperationalData: Record<string, unknown> | null
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  // STATUS_VERSION_AUTHORITY_CONFLICT
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i]!;
      const b = results[j]!;
      if (a.recordId === b.recordId) continue;
      if (!a.status || !b.status || a.status === b.status) continue;
      const field = sharedMatchedField(a, b);
      if (!field) continue;
      conflicts.push({
        type: "STATUS_VERSION_AUTHORITY_CONFLICT",
        fieldOrTopic: field,
        sourceA: toRef(a),
        sourceB: toRef(b),
        description: `"${a.title}" has status "${a.status}" while "${b.title}" (sharing matched field "${field}") has status "${b.status}".`,
        detectionConfidence: "MODERATE",
      });
    }
  }

  // LIVE_DATA_VS_REPOSITORY_MISMATCH
  if (liveOperationalData) {
    for (const r of results) {
      if (!r.internalMetadata) continue;
      for (const [key, liveValue] of Object.entries(liveOperationalData)) {
        if (!(key in r.internalMetadata)) continue;
        const repoValue = r.internalMetadata[key];
        if (repoValue === liveValue) continue;
        conflicts.push({
          type: "LIVE_DATA_VS_REPOSITORY_MISMATCH",
          fieldOrTopic: key,
          sourceA: { type: "PRODUCT", id: `LIVE:${key}`, label: `Live value for ${key}`, linkKind: "via-product" },
          sourceB: toRef(r),
          description: `Live-supplied "${key}" = ${JSON.stringify(liveValue)} differs from repository value ${JSON.stringify(repoValue)} in "${r.title}".`,
          detectionConfidence: "MODERATE",
        });
      }
    }
  }

  return conflicts;
}

/** Current-state fields only, per FD-AIC-002 level 4 — live data may never
 * win for safety/formulation/usage/governance fields, only these. */
const LIVE_DATA_ALLOWED_FIELDS = new Set(["MRP", "sellingPrice", "discount", "stock", "availability", "url", "slug", "packSize", "variant"]);

export function arbitrateConflicts(conflicts: DetectedConflict[], resultsByRecordId: Map<string, RuntimeKnowledgeResult>): ConflictResolutionOutcome {
  const arbitrations: ArbitrationResult[] = conflicts.map((conflict) => {
    // Level 1 / Level 2 — structurally unreachable today (see header notice).

    // Level 4 — live operational data, current-state fields only.
    if (conflict.type === "LIVE_DATA_VS_REPOSITORY_MISMATCH") {
      if (LIVE_DATA_ALLOWED_FIELDS.has(conflict.fieldOrTopic)) {
        return {
          conflict,
          winningLevel: "LIVE_OPERATIONAL_DATA_CURRENT_STATE_ONLY" as ArbitrationLevel,
          winningSource: conflict.sourceA,
          rationale: `"${conflict.fieldOrTopic}" is a current-state commercial field — live operational data wins per FD-AIC-002 level 4.`,
          escalationRequired: false,
        };
      }
      // A live-vs-repository mismatch on a non-current-state field (e.g.
      // something safety/formulation-shaped) must NEVER be resolved by
      // live data — falls through to unresolved/escalate.
      return {
        conflict,
        winningLevel: "UNRESOLVED_ESCALATE" as ArbitrationLevel,
        winningSource: null,
        rationale: `"${conflict.fieldOrTopic}" is not a recognized current-state commercial field — live data must not override it per FD-AIC-002 level 4's own restriction. Escalating rather than guessing.`,
        escalationRequired: true,
      };
    }

    // Level 3 — domain-authoritative source, by deterministic authority weight.
    const a = resultsByRecordId.get(conflict.sourceA.id);
    const b = resultsByRecordId.get(conflict.sourceB.id);

    if (a && b) {
      const aIsFounderIntelligence = isFounderIntelligenceKF(a);
      const bIsFounderIntelligence = isFounderIntelligenceKF(b);
      if (aIsFounderIntelligence !== bIsFounderIntelligence) {
        const winner = aIsFounderIntelligence ? b : a;
        const excluded = aIsFounderIntelligence ? a : b;
        return {
          conflict,
          winningLevel: "DOMAIN_AUTHORITATIVE_KNOWLEDGE_FACTORY" as ArbitrationLevel,
          winningSource: toRef(winner),
          rationale: `"${excluded.title}" is Founder Intelligence content, excluded from fact arbitration per FD-AIC-002 ("may guide reasoning, but may not overwrite verified domain facts") — "${winner.title}" wins regardless of computed authority weight.`,
          escalationRequired: false,
        };
      }
    }

    if (a && b && a.authorityWeight !== b.authorityWeight) {
      const winner = a.authorityWeight > b.authorityWeight ? a : b;
      return {
        conflict,
        winningLevel: "DOMAIN_AUTHORITATIVE_KNOWLEDGE_FACTORY" as ArbitrationLevel,
        winningSource: toRef(winner),
        rationale: `"${winner.title}" (${winner.sourceType}, authority weight ${winner.authorityWeight}) outranks the other source's ${winner === a ? b!.authorityWeight : a!.authorityWeight}.`,
        escalationRequired: false,
      };
    }

    // Level 5 — recency/confidence tiebreaker (only between equal-authority sources).
    if (a && b) {
      if (a.retrievedAt !== b.retrievedAt) {
        const winner = a.retrievedAt > b.retrievedAt ? a : b;
        return {
          conflict,
          winningLevel: "RECENCY_CONFIDENCE_TIEBREAKER" as ArbitrationLevel,
          winningSource: toRef(winner),
          rationale: `Equal authority weight — "${winner.title}" is the more recently retrieved/published version.`,
          escalationRequired: false,
        };
      }
      if (a.confidence !== b.confidence) {
        const winner = a.confidence > b.confidence ? a : b;
        return {
          conflict,
          winningLevel: "RECENCY_CONFIDENCE_TIEBREAKER" as ArbitrationLevel,
          winningSource: toRef(winner),
          rationale: `Equal authority weight and recency — "${winner.title}" has the higher deterministic retrieval confidence.`,
          escalationRequired: false,
        };
      }
    }

    // Level 6 — truly unresolved.
    return {
      conflict,
      winningLevel: "UNRESOLVED_ESCALATE" as ArbitrationLevel,
      winningSource: null,
      rationale: "No level of the FD-AIC-002 cascade resolved this conflict — authority, recency, and confidence are all tied or unavailable. Disclosing uncertainty rather than inventing a winner.",
      escalationRequired: true,
    };
  });

  return {
    conflictsDetected: conflicts,
    arbitrations,
    unresolvedCount: arbitrations.filter((a) => a.escalationRequired).length,
    detectionLimitationNotice: DETECTION_LIMITATION_NOTICE,
  };
}
