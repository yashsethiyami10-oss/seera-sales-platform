/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A).
 *
 * Field-level precedence engine (Phase 5). One generic function,
 * `resolveField()`, applied by every mapper to every field it maps —
 * "operate field by field," never "copy whole record," per the Block 2C
 * Mapper Governance Contract, rule 1.
 */

import type { ConflictStatus, FieldResolution, SourceReference } from "./types";
import { FOUNDER_POLICY } from "./policy";

export type CandidateValue = {
  value: unknown;
  source: SourceReference;
  /** True only for `ProductContent`-sourced candidates whose product has
   * `productContentEligibilityByProductName` = APPROVED (never
   * FOUNDER_REVIEW_REQUIRED) — the precedence engine itself never infers
   * approval from a record merely existing. */
  eligibleForCustomerSafe: boolean;
};

/**
 * Selects one value from an ordered list of candidates (already sorted
 * highest-precedence first by the caller, per Section 5's manifest), and
 * records the full resolution — selected value, every rejected
 * alternative, and why.
 *
 * Rules enforced here, matching the Mapper Governance Contract exactly:
 *  - never silently overwrite: every rejected candidate is recorded, not
 *    discarded
 *  - never select PENDING as APPROVED without an explicit Founder policy
 *    override: a PENDING-sourced candidate is only marked
 *    `customerSafeEligible` when the caller has already resolved that via
 *    Founder policy (passed in as `eligibleForCustomerSafe`) — this
 *    function itself never inspects `approvalStatus` to grant eligibility
 *  - never merge conflicting values: if two non-identical, non-empty
 *    candidates exist for the same field, `conflictStatus` is set and the
 *    field requires review rather than being silently combined
 */
export function resolveField(field: string, candidates: CandidateValue[]): FieldResolution {
  const nonEmpty = candidates.filter((c) => c.value !== null && c.value !== undefined && c.value !== "");

  if (nonEmpty.length === 0) {
    return {
      field,
      selectedValue: null,
      selectedSource: null,
      rejectedAlternatives: [],
      reason: "No source provided a value for this field.",
      conflictStatus: "NONE",
      approvalStatus: null,
      customerSafeEligible: false,
      reviewRequired: true,
    };
  }

  const chosen = nonEmpty[0]!;
  const rest = nonEmpty.slice(1);
  const conflicting = rest.filter((c) => !valuesEquivalent(c.value, chosen.value));
  const conflictStatus: ConflictStatus = conflicting.length > 0 ? "DETECTED_UNRESOLVED" : "NONE";

  return {
    field,
    selectedValue: chosen.value,
    selectedSource: chosen.source,
    rejectedAlternatives: rest.map((c) => ({
      value: c.value,
      source: c.source,
      reason: conflicting.includes(c)
        ? "Differs from the higher-precedence selected value — flagged as a conflict, not silently overwritten."
        : "Lower-precedence source; value was consistent with the selection, so no conflict is recorded.",
    })),
    reason: `Selected from ${chosen.source.sourceType} (${chosen.source.label}) — highest-precedence source with a non-empty value.`,
    conflictStatus,
    approvalStatus: chosen.source.sourceApprovalStatus,
    customerSafeEligible: chosen.eligibleForCustomerSafe && conflictStatus === "NONE",
    reviewRequired: conflictStatus === "DETECTED_UNRESOLVED" || !chosen.eligibleForCustomerSafe,
  };
}

function valuesEquivalent(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

/** Confidence threshold gate — Founder Policy's `confidenceThresholds`,
 * applied uniformly rather than re-implemented per mapper. */
export function meetsCustomerSafeConfidenceThreshold(confidence: "LOW" | "MODERATE" | "HIGH"): boolean {
  const rank = { LOW: 0, MODERATE: 1, HIGH: 2 } as const;
  return rank[confidence] >= rank[FOUNDER_POLICY.confidenceThresholds.minimumForCustomerSafe];
}
